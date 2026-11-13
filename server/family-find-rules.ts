/* The forest search's filter, pure (tested in server/test-family-find.mjs).
   It never widens anyone's privacy: it picks only from the forest the viewer already sees (kin.view per card, the
   strictest levels of a person's records outside their household), and then drops every card whose identity is hidden
   or anonymous. It never sees an email: the handler hands it only the fields below. */

export const MIN_QUERY = 2;          // letters, after cleaning
export const MAX_RESULTS = 20;

/** Hebrew and Latin, folded: no niqqud or cantillation, no accents, no geresh or quotes, one space, lower case */
export function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[֑-ׇ̀-ͯ]/g, '')
    .replace(/["'`׳״\-־.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** the query, cleaned, or null when too short (or too long to mean a name) */
export function cleanQuery(q: unknown): string | null {
  const n = norm(String(q ?? '').slice(0, 60));
  return [...n.replace(/ /g, '')].length >= MIN_QUERY ? n : null;
}

export interface Candidate {
  pid: string;              // the forest's id (opaque outside the viewer's household)
  root: string;             // the person behind all their records
  mine: boolean;            // in the viewer's household
  name: string;
  anonymous: boolean;
  hidden: string[];         // the groups kin.view hid from this viewer
  user: boolean;            // the card belongs to a user of the app
  self: boolean;
}

/** may this card show in a search at all */
export const findable = (c: Candidate) => !c.anonymous && !c.hidden.includes('identity');

/** how well a name answers the query: 3 the whole name, 2 a word starts with it, 1 inside a word, 0 not at all */
export function match(name: string, q: string): number {
  const n = norm(name);
  if (!n || !q) return 0;
  if (n === q) return 3;
  if (n.startsWith(q) || n.split(' ').some((w, i, ws) => ws.slice(i).join(' ').startsWith(q))) return 2;
  return n.includes(q) ? 1 : 0;
}

export interface Options { kinOnly?: boolean; usersOnly?: boolean }

/** the people of the forest who answer the query, one per person, best first */
export function find(cands: Candidate[], query: unknown, opts: Options, isKin: (root: string) => boolean): Candidate[] {
  const q = cleanQuery(query);
  if (!q) return [];
  // one card per person: the viewer's own household's record first (it follows its own levels there)
  const best = new Map<string, Candidate>();
  for (const c of cands) {
    if (!findable(c)) continue;
    const cur = best.get(c.root);
    if (!cur || (c.mine && !cur.mine) || (c.user && !cur.user && c.mine === cur.mine)) best.set(c.root, c);
  }
  const user = new Set(cands.filter((c) => c.user && findable(c)).map((c) => c.root));
  const out: { c: Candidate; m: number }[] = [];
  for (const c of best.values()) {
    const m = match(c.name, q);
    if (!m) continue;
    if (opts.usersOnly && !user.has(c.root)) continue;
    if (opts.kinOnly && (c.self || !isKin(c.root))) continue;
    out.push({ c: { ...c, user: user.has(c.root) }, m });
  }
  out.sort((a, b) => b.m - a.m || Number(b.c.mine) - Number(a.c.mine) || Number(b.c.user) - Number(a.c.user) || a.c.name.localeCompare(b.c.name, 'he'));
  return out.slice(0, MAX_RESULTS).map((x) => x.c);
}
