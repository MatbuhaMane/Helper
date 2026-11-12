// The research assistant's citations (vision's spec v1, docs/vision/research.md): a source kept as CSL-JSON fields, and
// formatted here for the few styles we need (APA, MLA, Chicago author-date) – our own code, not citeproc (the master's
// licence check). Plus BibTeX for export, and the source from Crossref's and OpenAlex's answers. No AI.
// Tests: node server/test-research.mjs

export interface Name { family?: string; given?: string; literal?: string }
export interface Csl {
  type?: string; title?: string; author?: Name[]; editor?: Name[]; issued?: { 'date-parts'?: number[][] };
  'container-title'?: string; volume?: string; issue?: string; page?: string; publisher?: string; 'publisher-place'?: string;
  DOI?: string; URL?: string; ISBN?: string; language?: string;
}
export type Style = 'apa' | 'mla' | 'chicago';
export const STYLES: [Style, string][] = [['apa', 'APA'], ['mla', 'MLA'], ['chicago', 'Chicago']];

const year = (c: Csl) => c.issued?.['date-parts']?.[0]?.[0];
const initials = (g?: string) => (g || '').split(/[\s-]+/).filter(Boolean).map((p) => p[0] + '.').join(' ');
const nameAPA = (n: Name) => n.literal || [n.family, initials(n.given)].filter(Boolean).join(', ');
const nameFull = (n: Name, inverted: boolean) => n.literal || (inverted ? [n.family, n.given].filter(Boolean).join(', ') : [n.given, n.family].filter(Boolean).join(' '));
const doiUrl = (c: Csl) => (c.DOI ? `https://doi.org/${c.DOI}` : c.URL || '');
const isBook = (c: Csl) => /book|monograph/.test(c.type || '') && !c['container-title'];

function listAPA(a: Name[]) {
  const ns = a.map(nameAPA);
  if (ns.length <= 1) return ns[0] || '';
  if (ns.length > 20) return [...ns.slice(0, 19), '…', ns[ns.length - 1]].join(', ');
  return ns.slice(0, -1).join(', ') + ', & ' + ns[ns.length - 1];
}
function listMLA(a: Name[]) {
  if (!a.length) return '';
  if (a.length === 1) return nameFull(a[0], true);
  if (a.length === 2) return `${nameFull(a[0], true)}, and ${nameFull(a[1], false)}`;
  return `${nameFull(a[0], true)}, et al.`;
}
function listChicago(a: Name[]) {
  if (!a.length) return '';
  if (a.length === 1) return nameFull(a[0], true);
  const rest = a.slice(1, 10).map((n) => nameFull(n, false));
  return `${nameFull(a[0], true)}, ${rest.slice(0, -1).map((x) => x + ', ').join('')}and ${rest[rest.length - 1]}` + (a.length > 10 ? ', et al.' : '');
}
const end = (s: string) => (/[.?!]$/.test(s) ? s : s + '.');

/** a bibliography entry in a style (plain text; the title in *asterisks* where it is set in italics) */
export function format(c: Csl, style: Style): string {
  const a = c.author || [], y = year(c), t = c.title || '(ללא כותרת)', box = c['container-title'], url = doiUrl(c);
  const vi = [c.volume, c.issue ? `(${c.issue})` : ''].join('');
  if (style === 'apa') {
    const who = a.length ? end(listAPA(a)) + ' ' : '';
    const when = `(${y ?? 'n.d.'}). `;
    if (isBook(c)) return `${who}${when}*${end(t)}* ${c.publisher ? end(c.publisher) + ' ' : ''}${url}`.trim();
    return `${who}${when}${end(t)} ${box ? `*${box}*` + (vi ? `, *${c.volume ?? ''}*${c.issue ? `(${c.issue})` : ''}` : '') + (c.page ? `, ${c.page}` : '') + '. ' : ''}${url}`.trim();
  }
  if (style === 'mla') {
    const who = a.length ? end(listMLA(a)) + ' ' : '';
    if (isBook(c)) return `${who}*${end(t)}* ${[c.publisher, y].filter(Boolean).join(', ')}${c.publisher || y ? '.' : ''}`.trim();
    const parts = [box ? `*${box}*` : '', c.volume ? `vol. ${c.volume}` : '', c.issue ? `no. ${c.issue}` : '', y ? String(y) : '', c.page ? `pp. ${c.page}` : ''].filter(Boolean).join(', ');
    return `${who}"${end(t)}" ${parts ? parts + '. ' : ''}${url}`.trim();
  }
  // Chicago, author-date
  const who = a.length ? end(listChicago(a)) + ' ' : '';
  if (isBook(c)) return `${who}${y ?? 'n.d.'}. *${end(t)}* ${[c['publisher-place'], c.publisher].filter(Boolean).join(': ')}${c.publisher ? '.' : ''} ${url}`.trim().replace(/\s+/g, ' ');
  return `${who}${y ?? 'n.d.'}. "${end(t)}" ${box ? `*${box}*` + (c.volume ? ` ${c.volume}` : '') + (c.issue ? ` (${c.issue})` : '') + (c.page ? `: ${c.page}` : '') + '. ' : ''}${url}`.trim();
}

/** the short in-text citation: (Cohen 2020), (Cohen & Levi 2020), (Cohen et al. 2020) – APA and Chicago; MLA without the year */
export function inText(c: Csl, style: Style): string {
  const a = c.author || [], y = year(c) ?? 'n.d.';
  const fam = (n: Name) => n.family || n.literal || '';
  const who = !a.length ? (c.title || '').split(/\s+/).slice(0, 3).join(' ') : a.length === 1 ? fam(a[0]) : a.length === 2 ? `${fam(a[0])} ${style === 'apa' ? '&' : 'and'} ${fam(a[1])}` : `${fam(a[0])} et al.`;
  return style === 'mla' ? `(${who})` : style === 'apa' ? `(${who}, ${y})` : `(${who} ${y})`;
}

/** a BibTeX entry, with a key like cohen2020ladder */
export function bibtex(c: Csl, used = new Set<string>()): string {
  const fam = (c.author?.[0]?.family || c.author?.[0]?.literal || 'anon').toLowerCase().normalize('NFKD').replace(/[^a-zא-ת]/g, '') || 'anon';
  const word = ((c.title || '').toLowerCase().normalize('NFKD').match(/[a-zא-ת]{4,}/) || ['x'])[0];
  let key = `${fam}${year(c) ?? ''}${word}`, k = 1;
  while (used.has(key)) key = `${fam}${year(c) ?? ''}${word}${String.fromCharCode(97 + k++)}`;
  used.add(key);
  const esc = (s: string) => s.replace(/[{}]/g, '').replace(/([&%$#_])/g, '\\$1');
  const kind = isBook(c) ? 'book' : c['container-title'] ? 'article' : 'misc';
  const fields: [string, string | undefined][] = [
    ['title', c.title], ['author', (c.author || []).map((n) => n.literal || [n.family, n.given].filter(Boolean).join(', ')).join(' and ') || undefined],
    ['year', year(c)?.toString()], [kind === 'article' ? 'journal' : 'booktitle', c['container-title']], ['volume', c.volume], ['number', c.issue], ['pages', c.page?.replace(/-/g, '--')],
    ['publisher', c.publisher], ['doi', c.DOI], ['url', c.DOI ? undefined : c.URL], ['isbn', c.ISBN],
  ];
  return `@${kind}{${key},\n${fields.filter(([, v]) => v).map(([f, v]) => `  ${f} = {${esc(String(v))}}`).join(',\n')}\n}`;
}

/** a DOI from what was typed or pasted: "10.1000/xyz", "doi:10…", "https://doi.org/10…" */
export function doiOf(s: string): string | null {
  const m = /(10\.\d{4,9}\/[^\s"<>]+)/i.exec(String(s || '').trim());
  return m ? m[1].replace(/[.,;)\]]+$/, '') : null;
}

/** Crossref's work (api.crossref.org/works/<doi>) as CSL fields (its metadata is free to reuse; the abstract is not kept) */
export function fromCrossref(m: any): Csl {
  const date = m?.issued?.['date-parts']?.[0] || m?.published?.['date-parts']?.[0];
  return {
    type: String(m?.type || ''), title: (m?.title || [])[0] || '',
    author: (m?.author || []).map((a: any) => (a.family ? { family: a.family, given: a.given } : { literal: a.name || '' })),
    issued: date ? { 'date-parts': [date] } : undefined, 'container-title': (m?.['container-title'] || [])[0] || undefined,
    volume: m?.volume, issue: m?.issue, page: m?.page, publisher: m?.publisher, DOI: m?.DOI, URL: m?.URL, ISBN: (m?.ISBN || [])[0],
  };
}

/** OpenAlex's work (CC0) as CSL fields, with what OpenAlex adds: an open copy, whether it was retracted, how many cite it */
export function fromOpenAlex(w: any): { csl: Csl; oa: string | null; retracted: boolean; cited: number; id: string } {
  const doi = w?.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//i, '') : undefined;
  const names = (w?.authorships || []).map((a: any) => {
    const n = String(a?.author?.display_name || '').trim();
    const parts = n.split(/\s+/);
    return parts.length > 1 ? { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') } : { literal: n };
  });
  const src = w?.primary_location?.source;
  return {
    id: String(w?.id || ''),
    csl: {
      type: String(w?.type || ''), title: w?.title || w?.display_name || '', author: names,
      issued: w?.publication_year ? { 'date-parts': [[w.publication_year]] } : undefined,
      'container-title': src?.display_name || undefined, volume: w?.biblio?.volume || undefined, issue: w?.biblio?.issue || undefined,
      page: w?.biblio?.first_page ? [w.biblio.first_page, w.biblio.last_page].filter(Boolean).join('-') : undefined,
      publisher: src?.host_organization_name || undefined, DOI: doi, URL: w?.primary_location?.landing_page_url || undefined,
    },
    oa: w?.open_access?.oa_url || null, retracted: !!w?.is_retracted, cited: Number(w?.cited_by_count || 0),
  };
}

/** [[a note's title]] links in a note's text (each once, in order) */
export const linksIn = (body: string) => [...new Set([...String(body || '').matchAll(/\[\[([^\[\]\n]{1,120})\]\]/g)].map((m) => m[1].trim()).filter(Boolean))];
