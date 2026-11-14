/* עץ מבנה: the rules, pure (no database), tested by server/test-layout.mjs.
   The owner's layer over the code's menus (H.APPS in public/assets/apps.js): the order of the parts and the tools under
   each, what is hidden, the names, icons, cushions and colours, and the ring's default for people who pinned nothing.
   The server keeps only what it was given, cleaned; it does not know the code's catalogue, so an address that is gone
   from the code is simply skipped by the page (apps.js, H.mergeLayout). Also the surprise eggs' rules. */

export interface Edit { name?: string; sub?: string; ic?: string; pillow?: string; c2?: string }
export interface Layout { parts: { href: string; kids: string[] }[]; hidden: string[]; edits: Record<string, Edit>; ring: string[] }

export const MAX_JSON = 32_000;
const MAX_ITEMS = 200;
const HREF = /^\/[\w\-/#.]{0,79}$/;
const ICON = /^[a-z][a-z0-9-]{0,29}$/;
const PILLOW = /^p(0[1-9]|1[0-5])$/;
const HEX = /^#[0-9a-f]{6}$/i;

export class LayoutError extends Error { constructor(public code: string) { super(code); } }

const href = (v: unknown): string | null => (typeof v === 'string' && HREF.test(v) && !v.includes('//') ? v : null);
const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
};

/** what the owner sent, cleaned: known keys only, valid addresses only, each address once in the tree; throws
    LayoutError('bad_layout') when it is not a layout at all, 'too_big' when it is too large */
export function sanitizeLayout(input: unknown): Layout {
  let v = input;
  if (typeof v === 'string') {
    if (v.length > MAX_JSON) throw new LayoutError('too_big');
    try { v = JSON.parse(v); } catch { throw new LayoutError('bad_layout'); }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new LayoutError('bad_layout');
  if (JSON.stringify(v).length > MAX_JSON) throw new LayoutError('too_big');
  const o = v as Record<string, unknown>;
  const seen = new Set<string>();
  const once = (h: string | null) => (h && !seen.has(h) ? (seen.add(h), h) : null);
  const parts: Layout['parts'] = [];
  for (const p of Array.isArray(o.parts) ? o.parts.slice(0, MAX_ITEMS) : []) {
    const h = once(href((p as any)?.href));
    if (!h) continue;
    const kids: string[] = [];
    for (const k of Array.isArray((p as any).kids) ? (p as any).kids.slice(0, MAX_ITEMS) : []) { const kh = once(href(k)); if (kh) kids.push(kh); }
    parts.push({ href: h, kids });
  }
  const list = (a: unknown) => [...new Set((Array.isArray(a) ? a.slice(0, MAX_ITEMS) : []).map(href).filter((h): h is string => !!h))];
  const edits: Record<string, Edit> = {};
  if (o.edits && typeof o.edits === 'object' && !Array.isArray(o.edits)) {
    for (const [k, e] of Object.entries(o.edits as Record<string, unknown>).slice(0, MAX_ITEMS)) {
      const h = href(k);
      if (!h || !e || typeof e !== 'object') continue;
      const x = e as Record<string, unknown>, out: Edit = {};
      const name = text(x.name, 40), sub = text(x.sub, 120);
      if (name) out.name = name;
      if (sub) out.sub = sub;
      if (typeof x.ic === 'string' && ICON.test(x.ic)) out.ic = x.ic;
      if (typeof x.pillow === 'string' && PILLOW.test(x.pillow)) out.pillow = x.pillow;
      if (typeof x.c2 === 'string' && HEX.test(x.c2)) out.c2 = x.c2.toLowerCase();
      if (Object.keys(out).length) edits[h] = out;
    }
  }
  return { parts, hidden: list(o.hidden), edits, ring: list(o.ring).slice(0, 12) };
}

/* ---------- the surprise eggs ---------- */
export type EggKind = 'text' | 'surprise' | 'link';
export interface Egg { page: string; text: string; kind: EggKind; link: string | null; starts: number | null; ends: number | null; active: boolean; x: number; y: number }
const DAY = 864e5;

/** an egg as the owner sent it, cleaned; throws LayoutError with the field's code */
export function cleanEgg(input: unknown, now: number): Egg {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const page = o.page === '/' ? '/' : href(o.page);
  if (!page || page.includes('#')) throw new LayoutError('bad_page');
  const t = text(o.text, 280);
  if (!t) throw new LayoutError('no_text');
  const kind: EggKind = o.kind === 'surprise' || o.kind === 'link' ? o.kind : 'text';
  let link: string | null = null;
  if (kind === 'link') {
    const l = typeof o.link === 'string' ? o.link.trim() : '';
    if (href(l)) link = l;
    else { try { const u = new URL(l); if (u.protocol === 'https:') link = u.href; } catch { /* not a link */ } }
    if (!link || link.length > 300) throw new LayoutError('bad_link');
  }
  const date = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(+(v as number)) ? +(v as number) : Date.parse(String(v)));
  const starts = date(o.starts), ends = date(o.ends);
  if ((starts !== null && !Number.isFinite(starts)) || (ends !== null && !Number.isFinite(ends))) throw new LayoutError('bad_date');
  if (starts !== null && ends !== null && ends <= starts) throw new LayoutError('ends_first');
  if (ends !== null && ends < now - DAY) throw new LayoutError('already_over');
  const pos = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(92, Math.max(8, Math.round(n))) : d; };
  return { page, text: t, kind, link, starts, ends, active: o.active !== false, x: pos(o.x, 50), y: pos(o.y, 50) };
}

/** live: on, and now inside its dates (an end date counts to the end of that day) */
export const eggLive = (e: { active: boolean | number; starts: number | null; ends: number | null }, now: number) =>
  !!e.active && (e.starts == null || e.starts <= now) && (e.ends == null || now < e.ends + DAY);

/** the back door's word for it: live | soon | over | off */
export const eggState = (e: { active: boolean | number; starts: number | null; ends: number | null }, now: number) =>
  !e.active ? 'off' : e.ends != null && now >= e.ends + DAY ? 'over' : e.starts != null && now < e.starts ? 'soon' : 'live';

/** an address the page is on, in the form eggs are kept: the path only, with its last slash ("/food" → "/food/") */
export const pageOf = (p: unknown) => {
  const s = typeof p === 'string' ? p.split(/[?#]/)[0] : '';
  if (!s.startsWith('/') || s.length > 80) return null;
  return /\.[a-z]+$/i.test(s) || s.endsWith('/') ? s : s + '/';
};
