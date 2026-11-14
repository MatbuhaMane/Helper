// עץ המשפחה, stage 2 (docs/family-forest.md): the pure rules, with no database and no keys, so they can be tested alone
// (server/vault/test-kin.mjs):
//   * privacy levels per field group, and what a viewer at a given distance may see of a card
//   * the tribe: the households joined by confirmed links; the same person in two trees
//   * the path between two people over the joined trees, and its name in Hebrew (the same names as in the page)

/* ---------------- privacy ---------------- */

export const LEVELS = ['private', 'household', 'linked', 'forest'] as const;
export type Level = (typeof LEVELS)[number];
export const GROUPS = ['identity', 'dates', 'notes', 'files'] as const;
export type Group = (typeof GROUPS)[number];
export type Privacy = Record<Group, Level>;
export const DEFAULT_PRIVACY: Privacy = { identity: 'household', dates: 'household', notes: 'household', files: 'household' };
export const ANON = 'קרוב/ת משפחה';

const isLevel = (x: unknown): x is Level => typeof x === 'string' && (LEVELS as readonly string[]).includes(x);
const rank = (l: Level) => LEVELS.indexOf(l);

/** a card's stored levels (JSON, possibly missing or partial) → a full set */
export function parsePrivacy(s: string | null | undefined): Privacy {
  let o: unknown = null;
  try { o = s ? JSON.parse(s) : null; } catch { o = null; }
  return mergePrivacy(DEFAULT_PRIVACY, o);
}
/** take the valid levels of `patch` over `base` */
export function mergePrivacy(base: Privacy, patch: unknown): Privacy {
  const out = { ...base };
  if (patch && typeof patch === 'object') for (const g of GROUPS) { const v = (patch as Record<string, unknown>)[g]; if (isLevel(v)) out[g] = v; }
  return out;
}
/** the same person in several trees: for each group the strictest level of them all */
export function strictest(list: Privacy[]): Privacy {
  if (!list.length) return { ...DEFAULT_PRIVACY };
  const out = { ...list[0] };
  for (const p of list.slice(1)) for (const g of GROUPS) if (rank(p[g]) < rank(out[g])) out[g] = p[g];
  return out;
}

/** what of a person may leave their household, from all their records: when one of them is a user's own card, the
    user decides (their cards only); otherwise the strictest levels of all, and anonymous if any household made them so */
export function outside(cards: { privacy: Privacy; anonymous: boolean; user: boolean }[]): { privacy: Privacy; anonymous: boolean } {
  const own = cards.filter((c) => c.user), from = own.length ? own : cards;
  return { privacy: strictest(from.map((c) => c.privacy)), anonymous: from.some((c) => c.anonymous) };
}

/** how far a card's household is from the viewer's: the same one, linked to it directly, in the same tribe, or none */
export type Distance = 'household' | 'linked' | 'forest' | 'none';
const DIST: Record<Distance, number> = { household: 1, linked: 2, forest: 3, none: 99 };

/** who the viewer is to the card: the person themself, or one who keeps it (a head over a non-user, the tribe head) */
export interface Who { self: boolean; keeper: boolean }

/** may the viewer see this group of the card, at this level, from this distance? */
export function sees(level: Level, d: Distance, who: Who, group: Group): boolean {
  if (d === 'none') return false;
  if (group === 'files' && d !== 'household') return false;           // files never leave their household in stage 2
  if (who.self || who.keeper) return true;
  if (level === 'private') return false;
  return DIST[d] <= rank(level);
}

/** which group a detail belongs to (an unknown key counts as a note, the most guarded) */
const DATE_KEYS = new Set(['born', 'bornAfterSunset', 'died', 'diedAfterSunset', 'place', 'birthdayBy', 'calendar']);
export const groupOf = (key: string): Group => (key === 'sex' ? 'identity' : DATE_KEYS.has(key) ? 'dates' : 'notes');

export interface Card {
  id: string; household: string; name: string; details: Record<string, unknown>;
  member: string | null; photo: string | null; privacy: Privacy; anonymous: boolean;
}
export interface Seen {
  id: string; household: string; name: string; anonymous: boolean; sex: string;
  details: Record<string, unknown>; member: string | null; photo: string | null; hidden: Group[];
}

/** the card as this viewer may see it. Inside its household a card follows its own levels; outside it, `outside`
    (the strictest levels of every record of the person, and anonymous if any household made them so). */
export function view(card: Card, d: Distance, who: Who, outside?: { privacy: Privacy; anonymous: boolean }): Seen | null {
  if (d === 'none') return null;
  const levels = d === 'household' ? card.privacy : (outside?.privacy ?? card.privacy);
  const anon = d !== 'household' && (outside?.anonymous ?? card.anonymous) && !who.self && !who.keeper;
  const hidden = GROUPS.filter((g) => anon || !sees(levels[g], d, who, g));
  const shows = (g: Group) => !hidden.includes(g);
  const details: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(card.details || {})) if (shows(groupOf(k))) details[k] = v;
  const id = shows('identity');
  return {
    id: card.id, household: card.household, anonymous: anon,
    name: id ? card.name : ANON,
    sex: id ? String(card.details?.sex || '') : '',
    details,
    member: id && d === 'household' ? card.member : null,            // an email never leaves the household
    photo: id && shows('files') ? card.photo : null,
    hidden,
  };
}
/** saving a card: the details the editor could not see are kept as they were */
export function keepHidden(before: Record<string, unknown>, after: Record<string, unknown>, hidden: Group[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) if (!hidden.includes(groupOf(k))) out[k] = v;
  for (const [k, v] of Object.entries(before)) if (hidden.includes(groupOf(k))) out[k] = v;
  return out;
}

/* ---------------- the tribe, and the same person in two trees ---------------- */

export interface Bridge { house_a: string; person_a: string; house_b: string; person_b: string }

/** the households joined to `house` by confirmed links, itself included */
export function tribe(house: string, bridges: Bridge[]): Set<string> {
  const out = new Set([house]), stack = [house];
  while (stack.length) {
    const h = stack.pop()!;
    for (const b of bridges) for (const [x, y] of [[b.house_a, b.house_b], [b.house_b, b.house_a]]) if (x === h && !out.has(y)) { out.add(y); stack.push(y); }
  }
  return out;
}
export function distance(viewer: string, holder: string, bridges: Bridge[]): Distance {
  if (viewer === holder) return 'household';
  if (bridges.some((b) => (b.house_a === viewer && b.house_b === holder) || (b.house_b === viewer && b.house_a === holder))) return 'linked';
  return tribe(viewer, bridges).has(holder) ? 'forest' : 'none';
}

/** the records that are one person: each record id → the id that stands for the whole person */
export function sameness(bridges: Bridge[]): (id: string) => string {
  const up = new Map<string, string>();
  const find = (x: string): string => { while (up.has(x)) x = up.get(x)!; return x; };
  for (const b of bridges) { const x = find(b.person_a), y = find(b.person_b); if (x !== y) up.set(x < y ? y : x, x < y ? x : y); }
  return find;
}
/** every record of the person `id` stands for (by the households they are in) */
export function recordsOf(id: string, bridges: Bridge[], houseOf: (id: string) => string | undefined): { id: string; household: string }[] {
  const root = sameness(bridges), r = root(id), ids = new Set([id]);
  for (const b of bridges) for (const x of [b.person_a, b.person_b]) if (root(x) === r) ids.add(x);
  return [...ids].map((x) => ({ id: x, household: houseOf(x) || '' }));
}

/** may records a (in household A) and b (in household B) be linked as one person? null when they may */
export function bridgeProblem(a: { id: string; household: string }, b: { id: string; household: string }, bridges: Bridge[], houseOf: (id: string) => string | undefined): string | null {
  if (a.household === b.household) return 'same_household';
  const root = sameness(bridges);
  if (root(a.id) === root(b.id)) return 'already_linked';
  // the person may have only one record in each tree
  const ha = new Set(recordsOf(a.id, bridges, houseOf).map((r) => r.household));
  if (recordsOf(b.id, bridges, houseOf).some((r) => ha.has(r.household))) return 'two_in_one_tree';
  return null;
}

/* ---------------- paths and their names ---------------- */

export interface KinLink { type: 'parent' | 'partner'; a: string; b: string; kind: string | null; status: string | null }

/** the links of several trees as links between people: records of one person become one, and repeated links one */
export function mergeLinks(links: KinLink[], root: (id: string) => string): KinLink[] {
  const seen = new Set<string>(), out: KinLink[] = [];
  for (const l of links) {
    const a = root(l.a), b = root(l.b);
    if (a === b) continue;
    const key = l.type === 'partner' ? 'P' + [a, b].sort().join('|') : 'U' + a + '|' + b;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...l, a: l.type === 'partner' ? [a, b].sort()[0] : a, b: l.type === 'partner' ? [a, b].sort()[1] : b });
  }
  return out;
}

const ORD = ['', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'], ORDF = ['', 'ראשונה', 'שנייה', 'שלישית', 'רביעית', 'חמישית'];

/** the relationship helpers over a set of links; `sexOf` gives 'm', 'f' or '' (unknown → the neutral forms) */
export function kin(links: KinLink[], sexOf: (id: string) => string) {
  const ups = new Map<string, string[]>(), downs = new Map<string, string[]>(), mates = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => (m.get(k) || m.set(k, []).get(k)!).push(v);
  for (const l of links) {
    if (l.type === 'parent') { push(ups, l.b, l.a); push(downs, l.a, l.b); }
    else { push(mates, l.a, l.b); push(mates, l.b, l.a); }
  }
  const parentsOf = (id: string) => ups.get(id) || [];
  const childrenOf = (id: string) => downs.get(id) || [];
  const partnersOf = (id: string) => mates.get(id) || [];
  const g = (id: string, m: string, f: string, both: string) => (sexOf(id) === 'm' ? m : sexOf(id) === 'f' ? f : both);

  function siblingsOf(id: string) {
    const mine = new Set(parentsOf(id)), out = new Set<string>();
    for (const par of mine) for (const c of childrenOf(par)) if (c !== id) out.add(c);
    return [...out].map((c) => { const theirs = new Set(parentsOf(c)); return { id: c, half: [...mine].some((x) => !theirs.has(x)) || [...theirs].some((x) => !mine.has(x)) }; });
  }
  /** steps from `from` to `to`: U (to a parent), D (to a child), P (to a partner); partners cost a little more than blood */
  function pathBetween(from: string, to: string): { steps: string; nodes: string[] } | null {
    if (!from || !to) return null;
    const dist = new Map<string, number>([[from, 0]]), prev = new Map<string, [string, string]>(), queue: [number, string][] = [[0, from]];
    while (queue.length) {
      queue.sort((a, b) => a[0] - b[0]);
      const [d, x] = queue.shift()!;
      if (x === to) break;
      if (d > dist.get(x)!) continue;
      const next: [string, string, number][] = [...parentsOf(x).map((y): [string, string, number] => [y, 'U', 1]), ...childrenOf(x).map((y): [string, string, number] => [y, 'D', 1]), ...partnersOf(x).map((y): [string, string, number] => [y, 'P', 1.2])];
      for (const [y, s, w] of next) {
        const nd = d + w;
        if (nd < (dist.get(y) ?? Infinity)) { dist.set(y, nd); prev.set(y, [x, s]); queue.push([nd, y]); }
      }
    }
    if (!dist.has(to)) return null;
    const steps: string[] = [], nodes = [to];
    for (let x = to; x !== from;) { const [p, s] = prev.get(x)!; steps.unshift(s); nodes.unshift(p); x = p; }
    return { steps: steps.join(''), nodes };
  }
  /** the path in words, nearest last: "בת של אח של אמא" */
  function pathWords(r: { steps: string; nodes: string[] }) {
    const words: string[] = [];
    for (let i = 0; i < r.steps.length; i++) {
      const s = r.steps[i], next = r.steps[i + 1], to = r.nodes[i + 1];
      if (s === 'U' && next === 'D') { words.push(g(r.nodes[i + 2], 'אח', 'אחות', 'אח/אחות')); i++; continue; }
      words.push(s === 'U' ? g(to, 'אבא', 'אמא', 'הורה') : s === 'D' ? g(to, 'בן', 'בת', 'ילד/ה') : g(to, 'בעל', 'אישה', 'בן/בת זוג'));
    }
    return words.reverse().join(' של ');
  }
  /** what `to` is to `from`: "סבתא", "בן דוד שני", "גיסה" – or the path in words */
  function relationName(from: string, to: string): string | null {
    if (from === to) return g(to, 'זה אתה', 'זו את', 'זה/זו את/ה');
    const r = pathBetween(from, to);
    if (!r) return null;
    const s = r.steps, t = to, n = s.length;
    const link = (x: string, y: string) => links.find((l) => l.type === 'partner' && ((l.a === x && l.b === y) || (l.a === y && l.b === x)));
    const pk = (child: string, parent: string) => links.find((l) => l.type === 'parent' && l.a === parent && l.b === child)?.kind;
    if (/^U+$/.test(s)) {
      if (n === 1) { const k = pk(from, t); return k === 'step' ? g(t, 'אבא חורג', 'אמא חורגת', 'הורה חורג') : k === 'adopt' ? g(t, 'אבא (מאמץ)', 'אמא (מאמצת)', 'הורה מאמץ') : g(t, 'אבא', 'אמא', 'הורה'); }
      if (n === 2) return g(t, 'סבא', 'סבתא', 'סבא/סבתא');
      if (n === 3) return g(t, 'סבא רבא', 'סבתא רבתא', 'סבא רבא/סבתא רבתא');
      return `${g(t, 'אב קדמון', 'אם קדמונית', 'דור קדום')} – ${n} דורות אחורה`;
    }
    if (/^D+$/.test(s)) {
      if (n === 1) return g(t, 'בן', 'בת', 'ילד/ה');
      if (n === 2) return g(t, 'נכד', 'נכדה', 'נכד/ה');
      if (n === 3) return g(t, 'נין', 'נינה', 'נין/ה');
      if (n === 4) return g(t, 'חימש', 'חימשת', 'חימש/ת');
      return `${g(t, 'צאצא', 'צאצאית', 'צאצא/ית')} – ${n} דורות קדימה`;
    }
    const m = /^(U+)(D+)$/.exec(s);
    if (m) {
      const up = m[1].length, down = m[2].length;
      if (up === 1 && down === 1) { const half = siblingsOf(from).find((x) => x.id === t)?.half; return g(t, 'אח', 'אחות', 'אח/אחות') + (half ? ' למחצה' : ''); }
      if (up === 2 && down === 1) return g(t, 'דוד', 'דודה', 'דוד/דודה');
      if (up === 1 && down === 2) return g(t, 'אחיין', 'אחיינית', 'אחיין/ית');
      if (up === down && up <= 6) { const k = up - 1; return g(t, 'בן דוד', 'בת דודה', 'בן/בת דוד') + (k > 1 ? ' ' + (sexOf(t) === 'f' ? ORDF[k] : ORD[k]) : ''); }
    }
    if (s === 'P') { const l = link(from, t); if (l?.status === 'divorced') return g(t, 'גרוש', 'גרושה', 'גרוש/ה'); if (l?.status === 'separated') return g(t, 'בן זוג לשעבר', 'בת זוג לשעבר', 'בן/בת זוג לשעבר'); return l?.kind === 'married' ? g(t, 'בעל', 'אישה', 'בן/בת זוג') : l?.kind === 'engaged' ? g(t, 'ארוס', 'ארוסה', 'ארוס/ה') : g(t, 'בן זוג', 'בת זוג', 'בן/בת זוג'); }
    if (s === 'PU') return sexOf(from) === 'm' ? g(t, 'חותן', 'חותנת', 'חותן/חותנת') : sexOf(from) === 'f' ? g(t, 'חם', 'חמות', 'חם/חמות') : g(t, 'חותן/חם', 'חותנת/חמות', 'הורה של בן/בת הזוג');
    if (s === 'DP') return g(t, 'חתן', 'כלה', 'חתן/כלה');
    if (s === 'PUD' || s === 'UDP') return g(t, 'גיס', 'גיסה', 'גיס/ה');
    if (s === 'DPU') return g(t, 'מחותן', 'מחותנת', 'מחותן/ת');
    if (s === 'PD') return g(t, 'בן חורג', 'בת חורגת', 'ילד/ה חורג/ת');
    if (s === 'UP') return g(t, 'אבא חורג', 'אמא חורגת', 'הורה חורג');
    return pathWords(r);
  }
  return { parentsOf, childrenOf, partnersOf, siblingsOf, pathBetween, pathWords, relationName };
}

/* ---------------- changes to the tree: who must say yes (the owner, 2026-11-13) ----------------
   - a card of someone who is not a user of the helper: whoever may edit the tree changes or deletes it at once;
   - a card of another user, or a relationship that touches one: a proposal that waits for that user (each of them);
     nothing changes until they approve, and only they can approve it;
   - one's own card: at once.
   A delete is soft: the one who deleted it can undo it for a while, the owner can restore it from the back door. */
export interface Party { member: string | null; user: boolean }
export type ChangeKind = 'edit' | 'delete' | 'unlink' | 'relink' | 'move';   // move: a person to another generation (several links at once)
export const CHANGE_KINDS: ChangeKind[] = ['edit', 'delete', 'unlink', 'relink', 'move'];
/** the users (other than me) who must approve a change that touches these cards; none = it is done at once */
export function approversFor(me: string, parties: Party[]): string[] {
  const out = new Set<string>();
  for (const p of parties) if (p.user && p.member && p.member !== me) out.add(p.member);
  return [...out];
}
/** only the user it waits for decides, and only while it waits */
export const mayDecide = (c: { for_email: string; status: string }, email: string | null | undefined) =>
  c.status === 'pending' && !!email && c.for_email === email;
/** a change that needs several users is applied once every one of them said yes; one no ends it */
export function groupOutcome(rows: { status: string }[]): 'apply' | 'wait' | 'declined' {
  if (!rows.length || rows.some((r) => r.status === 'declined' || r.status === 'cancelled')) return 'declined';
  return rows.every((r) => r.status === 'approved') ? 'apply' : 'wait';
}
/** the one who deleted a card may bring it back for ten minutes (the page offers it for ten seconds); the owner always */
export const RESTORE_MS = 10 * 60e3;
export const mayRestore = (row: { deleted_at: number | null; deleted_by: string | null }, email: string, owner: boolean, now = Date.now()) =>
  !!row.deleted_at && (owner || (!!row.deleted_by && row.deleted_by === email && now - row.deleted_at < RESTORE_MS));
/** what an edit would change, for the one asked to approve it (the keys only, never the values of what is hidden) */
export function changedKeys(before: { name: string; details: Record<string, unknown> }, after: { name: string; details: Record<string, unknown> }): string[] {
  const out: string[] = [];
  if (before.name !== after.name) out.push('name');
  for (const k of new Set([...Object.keys(before.details || {}), ...Object.keys(after.details || {})])) {
    const a = before.details?.[k] ?? '', b = after.details?.[k] ?? '';
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(k);
  }
  return out;
}

/* ---------------- arranging the tree: moving a person to another generation (the owner, 2026-11-14) ----------------
   "My brother put himself in our parents' row instead of the siblings' row." A drop on another row is a change of
   relationship, worked out here from where the person was dropped:
   - next to someone (`sibling`): the same parents as them; and no longer a parent of them or of the other children of those parents;
   - `parentOf` someone: their parent; and no longer a child of that person's parents or partners, or of anyone below them;
   - `childOf` someone: like the siblings of that person's other children, or their only child when they have none;
   - `up` / `down` (the keyboard's "העבר…"): a sibling of their own (first) parent / of their own (first) child.
   Their partners, their other children and everyone else's links stay as they are. Nothing here writes: the vault
   applies the plan (or proposes it, when it touches another user's card). */
export type MoveTo = { sibling: string } | { parentOf: string } | { childOf: string } | { up: true } | { down: true };
export interface MovePlan { remove: KinLink[]; add: { type: 'parent'; a: string; b: string; kind: string }[]; parents: string[] }
export function movePlan<L extends KinLink>(links: L[], id: string, to: MoveTo): { remove: L[]; add: MovePlan['add']; parents: string[] } {
  const k = kin(links, () => '');
  const P = k.parentsOf, C = k.childrenOf;
  const reach = (from: string[], step: (x: string) => string[]) => {
    const seen = new Set<string>(), stack = [...from];
    while (stack.length) { const x = stack.pop()!; if (seen.has(x)) continue; seen.add(x); stack.push(...step(x)); }
    return seen;
  };
  let want: string[] = [], dropKids = new Set<string>(), child: string | null = null;
  const besides = (s: string) => { want = P(s).filter((x) => x !== id); dropKids = new Set([s, ...want.flatMap(C)]); dropKids.delete(id); };
  if ('up' in to) { const p = P(id)[0]; if (!p) throw new Error('no_target'); besides(p); }
  else if ('down' in to) { const c = C(id)[0]; if (!c) throw new Error('no_target'); besides(c); }
  else if ('sibling' in to) { if (to.sibling === id) throw new Error('no_target'); besides(to.sibling); }
  else if ('childOf' in to) {
    if (to.childOf === id) throw new Error('no_target');
    const kids = C(to.childOf).filter((x) => x !== id);
    if (kids.length) besides(kids[0]); else want = [to.childOf];
  } else {
    const f = to.parentOf;
    if (f === id) throw new Error('no_target');
    const below = reach([f], C);
    want = P(id).filter((x) => !P(f).includes(x) && !k.partnersOf(f).includes(x) && !below.has(x));
    child = f;
  }
  if (want.includes(id)) throw new Error('circular_family');
  const above = reach(want, P);    // the new parents and everyone above them: none of them may stay my child
  const remove = links.filter((l) => l.type === 'parent' && ((l.b === id && !want.includes(l.a)) || (l.a === id && (dropKids.has(l.b) || above.has(l.b)))));
  const add: MovePlan['add'] = want.filter((x) => !P(id).includes(x)).map((a) => ({ type: 'parent' as const, a, b: id, kind: 'bio' }));
  if (child && !C(id).includes(child)) add.push({ type: 'parent', a: id, b: child, kind: 'bio' });
  if (!remove.length && !add.length) throw new Error('nothing_to_move');
  const after = [...links.filter((l) => !remove.includes(l)), ...add];
  const bad = linksProblem(after);
  if (bad) throw new Error(bad);
  return { remove, add, parents: after.filter((l) => l.type === 'parent' && l.b === id).map((l) => l.a) };
}

/** "+ אח/אחות": a and b become brothers and sisters, sharing parents. The one who has parents is the anchor and the
    other takes them (a's parents first); when neither has any there is nothing to share yet (no_parents). */
export function siblingSide(links: KinLink[], a: string, b: string): { move: string; anchor: string } {
  if (a === b) throw new Error('no_target');
  const P = kin(links, () => '').parentsOf;
  if (P(a).length) return { move: b, anchor: a };
  if (P(b).length) return { move: a, anchor: b };
  throw new Error('no_parents');
}

/** what is wrong with a set of links, if anything: someone their own ancestor, or more than six parents */
export function linksProblem(links: { type: string; a: string; b: string }[]): 'circular_family' | 'too_many_parents' | null {
  const ups = new Map<string, string[]>();
  for (const l of links) if (l.type === 'parent') (ups.get(l.b) || ups.set(l.b, []).get(l.b)!).push(l.a);
  for (const [c, ps] of ups) {
    if (ps.length > 6) return 'too_many_parents';
    const seen = new Set<string>(), stack = [...ps];
    while (stack.length) { const x = stack.pop()!; if (x === c) return 'circular_family'; if (seen.has(x)) continue; seen.add(x); stack.push(...(ups.get(x) || [])); }
  }
  return null;
}

/** the plan in one plain sentence: "עברי יהיה ילד של שרה ושל דוד, ולא הורה של נועה." (names already as this viewer may see them) */
export function moveWords(id: string, plan: { remove: KinLink[]; add: { a: string; b: string }[] }, nameOf: (id: string) => string, sexOf: (id: string) => string): string {
  const g = (m: string, f: string, both: string) => (sexOf(id) === 'm' ? m : sexOf(id) === 'f' ? f : both);
  const of = (ids: string[]) => ids.map((x, i) => (i ? 'ושל ' : 'של ') + nameOf(x)).join(' ');
  const newPar = plan.add.filter((l) => l.b === id).map((l) => l.a), newKid = plan.add.filter((l) => l.a === id).map((l) => l.b);
  const lostPar = plan.remove.filter((l) => l.b === id).map((l) => l.a), lostKid = plan.remove.filter((l) => l.a === id).map((l) => l.b);
  const be = g('יהיה', 'תהיה', 'יהיה/תהיה');
  const parts = [
    newPar.length ? `${be} ${g('ילד', 'ילדה', 'ילד/ה')} ${of(newPar)}` : '',
    newKid.length ? `${be} הורה ${of(newKid)}` : '',
    lostPar.length ? `${newPar.length || newKid.length ? 'ולא' : g('לא יהיה עוד', 'לא תהיה עוד', 'לא יהיה/תהיה עוד')} ${g('ילד', 'ילדה', 'ילד/ה')} ${of(lostPar)}` : '',
    lostKid.length ? `${newPar.length || newKid.length || lostPar.length ? 'ולא' : g('לא יהיה עוד', 'לא תהיה עוד', 'לא יהיה/תהיה עוד')} הורה ${of(lostKid)}` : '',
  ].filter(Boolean);
  return `${nameOf(id)} ${parts.join(', ')}.`;
}
