// News reader: per-user feed subscriptions (Israeli + international defaults), RSS/Atom aggregation
// with edge caching, read/starred state, an embedded reader view and AI summaries.

import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, HttpError, body, json, requireUser, sha1Hex, uid } from './core';
import { fetchText, readable, sanitize } from './web';

export const DEFAULT_FEEDS: { title: string; url: string; folder: string }[] = [
  { folder: 'ישראל', title: 'ynet – מבזקים', url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml' },
  { folder: 'ישראל', title: 'ynet – חדשות', url: 'https://www.ynet.co.il/Integration/StoryRss2.xml' },
  { folder: 'ישראל', title: 'וואלה! חדשות', url: 'https://rss.walla.co.il/feed/1' },
  { folder: 'ישראל', title: 'מעריב', url: 'https://www.maariv.co.il/Rss/RssChadashot' },
  { folder: 'ישראל', title: 'גלובס', url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=585' },
  { folder: 'ישראל', title: 'The Times of Israel', url: 'https://www.timesofisrael.com/feed/' },
  { folder: 'ישראל', title: 'The Jerusalem Post', url: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx' },
  { folder: 'עולם', title: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { folder: 'עולם', title: 'The Guardian – World', url: 'https://www.theguardian.com/world/rss' },
  { folder: 'עולם', title: 'NYT – World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { folder: 'עולם', title: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { folder: 'עולם', title: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all' },
  { folder: 'עולם', title: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml' },
];

const FEED_TTL = 600; // seconds
const MAX_FEEDS_PER_REFRESH = 40;

export interface NewsItem {
  id: string; feedId: string; feed: string; title: string; link: string; date: number; summary: string; image: string | null;
  read?: boolean; starred?: boolean;
}

/* ---------------- feeds ---------------- */

export async function listFeeds(ctx: Ctx) {
  const u = requireUser(ctx);
  const db = ctx.env.DB;
  let { results } = await db.prepare('SELECT id, url, title, folder, position FROM feeds WHERE email = ? ORDER BY folder, position').bind(u.email).all();
  if (!results.length) {
    await db.batch(DEFAULT_FEEDS.map((f, i) => db.prepare('INSERT INTO feeds (email, id, url, title, folder, position) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(u.email, uid(), f.url, f.title, f.folder, i)));
    ({ results } = await db.prepare('SELECT id, url, title, folder, position FROM feeds WHERE email = ? ORDER BY folder, position').bind(u.email).all());
  }
  return json({ feeds: results });
}

/** Add a feed by its RSS URL or by a website address (the feed is discovered from the page). */
export async function addFeed(ctx: Ctx) {
  const u = requireUser(ctx);
  const { url, folder } = await body<{ url: string; folder?: string }>(ctx.req);
  const raw = (url || '').trim();
  const accept = 'application/rss+xml,application/atom+xml,application/xml,text/xml,text/html;q=0.8';
  let fetched;
  if (/^https?:\/\//.test(raw)) fetched = await fetchText(raw, accept);
  else {
    // Typed without a scheme: try https first, then plain http.
    try { fetched = await fetchText('https://' + raw, accept); } catch { fetched = await fetchText('http://' + raw, accept); }
  }
  const { text, finalUrl } = fetched;
  let feedUrl = finalUrl;
  const isFeed = (t: string) => /<(rss|feed|rdf:RDF)[\s>]/i.test(t.slice(0, 5000));
  let parsed = parseFeed(text);
  if (!isFeed(text)) {
    const link = /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i.exec(text)?.[0];
    const href = link && /href=["']([^"']+)/i.exec(link)?.[1];
    if (!href) throw new HttpError(422, 'no_feed_found');
    feedUrl = new URL(href.replace(/&amp;/g, '&'), finalUrl).href;
    const feedText = (await fetchText(feedUrl, 'application/rss+xml,application/atom+xml,application/xml,text/xml')).text;
    if (!isFeed(feedText)) throw new HttpError(422, 'no_feed_found');
    parsed = parseFeed(feedText);
  }
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO feeds (email, id, url, title, folder, position) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(u.email, id, feedUrl, parsed.title || new URL(feedUrl).hostname, (folder || 'שלי').slice(0, 40), Date.now() % 1e9).run();
  return json({ id, url: feedUrl, title: parsed.title });
}

export async function updateFeed(ctx: Ctx) {
  const u = requireUser(ctx);
  const { title, folder } = await body<{ title?: string; folder?: string }>(ctx.req);
  await ctx.env.DB.prepare('UPDATE feeds SET title = COALESCE(?, title), folder = COALESCE(?, folder) WHERE email = ? AND id = ?')
    .bind(title?.slice(0, 100) ?? null, folder?.slice(0, 40) ?? null, u.email, ctx.params.id).run();
  return json({ ok: true });
}

export async function deleteFeed(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM feeds WHERE email = ? AND id = ?').bind(u.email, ctx.params.id).run();
  return json({ ok: true });
}

/* ---------------- items ---------------- */

export async function listItems(ctx: Ctx) {
  const u = requireUser(ctx);
  const folder = ctx.url.searchParams.get('folder');
  const feedId = ctx.url.searchParams.get('feed');
  let { results: feeds } = await ctx.env.DB.prepare('SELECT id, url, title, folder FROM feeds WHERE email = ?').bind(u.email).all<any>();
  if (feedId) feeds = feeds.filter((f) => f.id === feedId);
  else if (folder) feeds = feeds.filter((f) => f.folder === folder);
  feeds = feeds.slice(0, MAX_FEEDS_PER_REFRESH);

  const errors: string[] = [];
  const lists = await Promise.all(feeds.map(async (f) => {
    try {
      return await cachedFeed(ctx, f);
    } catch {
      errors.push(f.id);
      return [] as NewsItem[];
    }
  }));
  const items = lists.flat().sort((a, b) => b.date - a.date).slice(0, 400);

  const state = new Map<string, { read: number; starred: number }>();
  if (items.length) {
    const ids = items.map((i) => i.id);
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const { results } = await ctx.env.DB.prepare(
        `SELECT item_id, read, starred FROM news_state WHERE email = ? AND item_id IN (${chunk.map(() => '?').join(',')})`,
      ).bind(u.email, ...chunk).all<any>();
      for (const r of results) state.set(r.item_id, r);
    }
  }
  for (const it of items) {
    const s = state.get(it.id);
    it.read = !!s?.read;
    it.starred = !!s?.starred;
  }
  return json({ items, errors });
}

async function cachedFeed(ctx: Ctx, f: { id: string; url: string; title: string }): Promise<NewsItem[]> {
  const cache = (caches as any).default as Cache;
  const key = new Request(`https://feed-cache.helper/${encodeURIComponent(f.url)}`);
  const hit = await cache.match(key);
  let parsed: ReturnType<typeof parseFeed>;
  if (hit) {
    parsed = await hit.json();
  } else {
    const { text } = await fetchText(f.url, 'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5');
    parsed = parseFeed(text);
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(parsed), { headers: { 'cache-control': `max-age=${FEED_TTL}`, 'content-type': 'application/json' } })));
  }
  return Promise.all(parsed.items.map(async (it) => ({ ...it, id: await sha1Hex(it.link || it.title), feedId: f.id, feed: f.title })));
}

export async function setState(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ ids: string[]; read?: boolean; starred?: boolean; snapshot?: unknown }>(ctx.req);
  const ids = (b.ids || []).slice(0, 500);
  const db = ctx.env.DB;
  const now = Date.now();
  await db.batch(ids.map((id) => db.prepare(
    `INSERT INTO news_state (email, item_id, read, starred, saved, at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(email, item_id) DO UPDATE SET
       read = COALESCE(?, read), starred = COALESCE(?, starred), saved = COALESCE(?, saved), at = excluded.at`,
  ).bind(u.email, id, b.read ? 1 : 0, b.starred ? 1 : 0, b.snapshot ? JSON.stringify(b.snapshot) : null, now,
    b.read == null ? null : b.read ? 1 : 0, b.starred == null ? null : b.starred ? 1 : 0, b.snapshot ? JSON.stringify(b.snapshot) : null)));
  return json({ ok: true });
}

export async function starredItems(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT item_id, saved FROM news_state WHERE email = ? AND starred = 1 AND saved IS NOT NULL ORDER BY at DESC LIMIT 300')
    .bind(u.email).all<any>();
  return json({ items: results.map((r) => ({ ...JSON.parse(r.saved), id: r.item_id, starred: true, read: true })) });
}

/* ---------------- reader view & summary ---------------- */

export async function article(ctx: Ctx) {
  requireUser(ctx);
  const url = ctx.url.searchParams.get('url') || '';
  if (!/^https?:\/\//.test(url)) throw new HttpError(400, 'Invalid URL');
  const cache = (caches as any).default as Cache;
  const key = new Request(`https://article-cache.helper/${encodeURIComponent(url)}`);
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

  const { text, finalUrl } = await fetchText(url);
  const art = readable(text, finalUrl);
  if (!art?.content) throw new HttpError(422, 'not_readable');
  const out = JSON.stringify({ title: art.title, byline: art.byline, siteName: art.siteName, content: sanitize(art.content), dir: art.dir || null, length: art.length, url: finalUrl });
  ctx.waitUntil(cache.put(key, new Response(out, { headers: { 'cache-control': 'max-age=3600', 'content-type': 'application/json' } })));
  return new Response(out, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export async function summarize(ctx: Ctx) {
  requireUser(ctx);
  const { url } = await body<{ url: string }>(ctx.req);
  if (!/^https?:\/\//.test(url || '')) throw new HttpError(400, 'Invalid URL');
  const { text, finalUrl } = await fetchText(url);
  const art = readable(text, finalUrl);
  const content = (art?.textContent || '').trim().slice(0, 40000);
  if (content.length < 300) throw new HttpError(422, 'not_readable');
  const res = await aiJson(ctx.env, {
    prefer: 'gemini',
    system: 'You summarize news articles for an Israeli family. Always answer in Hebrew, neutrally and accurately, without adding facts that are not in the article.',
    prompt: `Summarize this article in 3-5 short bullet points in Hebrew.\nTitle: ${art?.title || ''}\n\n${content}`,
    schema: z.object({ bullets: z.array(z.string()) }),
  });
  return json(res);
}

/* ---------------- RSS / Atom parsing ---------------- */

export function parseFeed(xml: string): { title: string; items: Omit<NewsItem, 'id' | 'feedId' | 'feed'>[] } {
  const channelTitle = text(tag(xml.replace(/<(item|entry)[\s>][\s\S]*$/i, ''), 'title'));
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  const items = blocks.map((b) => {
    const link = atomLink(b) || text(tag(b, 'link')) || text(tag(b, 'guid'));
    const desc = tag(b, 'content:encoded') || tag(b, 'description') || tag(b, 'summary') || tag(b, 'content') || '';
    const dateStr = text(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const date = Date.parse(dateStr) || 0;
    const image =
      attr(b, /<media:(?:content|thumbnail)[^>]*>/i, 'url') ||
      (/<enclosure[^>]*type=["']image/i.test(b) ? attr(b, /<enclosure[^>]*>/i, 'url') : null) ||
      /<img[^>]+src=["']([^"']+)/i.exec(unescapeXml(desc))?.[1] || null;
    return {
      title: text(tag(b, 'title')) || '(ללא כותרת)',
      link: link.trim(),
      date,
      summary: text(desc).slice(0, 400),
      image: image ? unescapeXml(image) : null,
    };
  }).filter((i) => i.link);
  return { title: channelTitle, items };
}

function tag(s: string, name: string): string {
  const re = new RegExp(`<${name.replace(':', '\\:')}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name.replace(':', '\\:')}>`, 'i');
  return re.exec(s)?.[1] ?? '';
}

function atomLink(s: string): string {
  const links = [...s.matchAll(/<link\b[^>]*\/?>/gi)].map((m) => m[0]);
  const alt = links.find((l) => /href=/.test(l) && (!/rel=/.test(l) || /rel=["']alternate["']/.test(l)));
  return alt ? unescapeXml(/href=["']([^"']+)/i.exec(alt)![1]) : '';
}

function attr(s: string, re: RegExp, name: string): string | null {
  const t = re.exec(s)?.[0];
  return t ? new RegExp(`${name}=["']([^"']+)`, 'i').exec(t)?.[1] ?? null : null;
}

function unescapeXml(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function text(s: string): string {
  return unescapeXml(unescapeXml(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
