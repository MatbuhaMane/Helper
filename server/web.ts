// Fetch web pages (with charset handling for Hebrew sites that still use windows-1255)
// and extract the readable article body for the embedded reader view.

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { HttpError } from './core';

const UA = 'Mozilla/5.0 (compatible; FamilyHelperReader/1.0)';
const MAX_BYTES = 3_000_000;

export interface Page { html: string; finalUrl: string; image: string | null }

export async function fetchText(url: string, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'): Promise<{ text: string; finalUrl: string; type: string }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'user-agent': UA, accept, 'accept-language': 'he,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
  } catch {
    throw new HttpError(502, 'fetch_failed');
  }
  if (!res.ok) throw new HttpError(502, `fetch_status_${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer()).slice(0, MAX_BYTES);
  const type = res.headers.get('content-type') || '';
  return { text: decode(buf, type), finalUrl: res.url || url, type };
}

function decode(buf: Uint8Array, contentType: string): string {
  let charset = /charset=([\w-]+)/i.exec(contentType)?.[1];
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 2048));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] || /encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder((charset || 'utf-8').toLowerCase()).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

export async function fetchPage(url: string): Promise<Page> {
  const { text, finalUrl } = await fetchText(url);
  const image = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(text)?.[1] || null;
  return { html: text, finalUrl, image };
}

export function readable(html: string, url: string) {
  const { document } = parseHTML(html);
  // Resolve relative links and images against the article URL.
  for (const el of document.querySelectorAll('a[href], img[src]') as any) {
    const attr = el.tagName === 'A' ? 'href' : 'src';
    try { el.setAttribute(attr, new URL(el.getAttribute(attr), url).href); } catch { /* ignore */ }
  }
  for (const img of document.querySelectorAll('img[data-src]') as any) img.setAttribute('src', img.getAttribute('data-src'));
  const article = new Readability(document as any, { charThreshold: 300 }).parse();
  return article;
}

/** Keep only safe tags/attributes from Readability output before sending it to the browser. */
export function sanitize(html: string): string {
  const { document } = parseHTML(`<div id="r">${html}</div>`);
  const allowed = new Set(['P', 'BR', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'STRONG', 'B', 'EM', 'I', 'A', 'IMG', 'FIGURE', 'FIGCAPTION', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'SPAN', 'DIV', 'SECTION', 'ARTICLE', 'HR', 'SUB', 'SUP']);
  const root = document.getElementById('r')!;
  const walk = (node: any) => {
    for (const child of [...node.children]) {
      if (!allowed.has(child.tagName)) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'SVG', 'NOSCRIPT'].includes(child.tagName)) child.remove();
        else { walk(child); child.replaceWith(...child.childNodes); }
        continue;
      }
      for (const a of [...child.attributes]) {
        const keep = (child.tagName === 'A' && a.name === 'href') || (child.tagName === 'IMG' && (a.name === 'src' || a.name === 'alt'));
        if (!keep || /^\s*javascript:/i.test(a.value)) child.removeAttribute(a.name);
      }
      if (child.tagName === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer'); }
      if (child.tagName === 'IMG') child.setAttribute('loading', 'lazy');
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}
