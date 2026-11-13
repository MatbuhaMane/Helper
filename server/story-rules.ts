// הסיפור המשפחתי (docs/vision/story.md, "a living museum"): the pure rules, with no database, so they can be tested alone
// (server/test-story.mjs). The rule that matters: an item is seen only as far as its own level reaches, and it never
// carries more of the tree out of the household than the tree itself lets out.
//   * levels: 'private' (only the one who added it), 'household' (the default), 'tribe' (the linked households too)
//   * only the one who added an item may change its level; nobody else may widen it
//   * outside the household: no people tags (a tag would name someone of our tree; each is an empty spot), no uploader's
//     email, and no file (files never leave their household in stage 2, as kin.sees says for the tree's files)
//   * a deleted item is seen by nobody (it waits in the trash of the one who added it)

import { Distance } from './vault/kin';

export const KINDS = ['story', 'recording', 'reading', 'doc', 'photo'] as const;
export type Kind = (typeof KINDS)[number];
export const LEVELS = ['private', 'household', 'tribe'] as const;
export type Level = (typeof LEVELS)[number];

/** 2 GB a household (docs/decisions.md 2026-11-14 "Family story storage"); over it only new uploads stop */
export const QUOTA = 2 * 1024 ** 3;
export const MAX_FILE = 25 * 1024 * 1024;

export interface Stored {
  id: string; household: string; kind: Kind; level: Level; owner: string;
  title: string; text: string; when: string; year: number | null; place: string; people: string[];
  mime: string | null; size: number | null; hasFile: boolean; created: number; deleted: boolean;
}
export type Gap = { gap: true };
const GAP: Gap = { gap: true };

export interface Shown {
  id: string; kind: Kind; title: string; text: string; when: string; year: number | null; place: string;
  people: (string | Gap)[]; mime: string | null; size: number | null; file: boolean; created: number;
  mine: boolean; level?: Level; by?: string;
}

/** may this viewer, at this distance from the item's household, see the item at all? */
export function itemShows(it: Pick<Stored, 'level' | 'owner' | 'deleted'>, d: Distance, viewer: string): boolean {
  if (it.deleted || d === 'none') return false;
  if (it.level === 'private') return d === 'household' && it.owner === viewer;
  if (it.level === 'household') return d === 'household';
  if (it.level === 'tribe') return d === 'household' || d === 'linked' || d === 'forest';
  return false;                                                        // an unknown level opens to nobody
}

/** the item as this viewer may see it (null: as if it were not there) */
export function shapeItem(it: Stored, d: Distance, viewer: string): Shown | null {
  if (!itemShows(it, d, viewer)) return null;
  const home = d === 'household', mine = home && it.owner === viewer;
  return {
    id: it.id, kind: it.kind, title: it.title, text: it.text, when: it.when, year: it.year, place: it.place,
    people: home ? it.people : it.people.map(() => GAP),
    mime: home ? it.mime : null, size: home ? it.size : null, file: home && it.hasFile, created: it.created, mine,
    ...(home ? { level: it.level, by: it.owner } : {}),
  };
}
/** a list, filtered and in the museum's order (the timeline: by year, the undated last, then by when they were added) */
export function shapeAll(items: Stored[], d: Distance, viewer: string): Shown[] {
  return items.map((it) => shapeItem(it, d, viewer)).filter((x): x is Shown => !!x)
    .sort((a, b) => (a.year ?? 1e5) - (b.year ?? 1e5) || a.created - b.created);
}
/** may the viewer have the item's file? only at home, and only an item they may see */
export const fileShows = (it: Stored, d: Distance, viewer: string) => it.hasFile && d === 'household' && itemShows(it, d, viewer);

/** a level change: only the one who added it, and only to a known level */
export function nextLevel(it: Pick<Stored, 'level' | 'owner'>, viewer: string, wanted: unknown): Level {
  if (it.owner !== viewer || !(LEVELS as readonly string[]).includes(wanted as string)) return it.level;
  return wanted as Level;
}

/** is there room for this upload? (what is already in is never touched) */
export const roomFor = (used: number, size: number) => size <= MAX_FILE && used + size <= QUOTA;

/* ---------------- dates, even rough ones ---------------- */

/** a year to sort by, from what a person writes: "1952", "שנות ה-50", "שנות החמישים", "1950s", "קיץ 73", "ט"ו בשבט 1948" */
const DECADES: Record<string, number> = { עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90 };
export function yearOf(when: string, now = new Date().getFullYear()): number | null {
  const s = String(when || '');
  const full = s.match(/(1[89]\d\d|20\d\d)/);
  if (full) return +full[1];
  const dec = s.match(/שנות\s*ה-?\s*(\d0)/) || s.match(/\b(\d0)'?s\b/);
  if (dec) return century(+dec[1], now) + 5;
  for (const [w, n] of Object.entries(DECADES)) if (s.includes('שנות ה' + w)) return century(n, now) + 5;
  const short = s.match(/(?:^|\D)'?(\d\d)(?:\D|$)/);
  if (short) return century(+short[1], now);
  return null;
}
/** a two-digit year in the past: 25 is 2025 when now is 2026, 73 is 1973 */
const century = (yy: number, now: number) => (2000 + yy <= now ? 2000 + yy : 1900 + yy);

/* ---------------- what may be stored ---------------- */

const str = (x: unknown, n: number) => String(x ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const strMulti = (x: unknown, n: number) => String(x ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, n);

export interface Input { kind?: Kind; title?: string; text?: string; when?: string; place?: string; people?: string[]; level?: Level }
/** from the page, cleaned; only the fields it names. People are ids of the household's tree, checked by the caller. */
export function cleanInput(b: any): Input {
  const out: Input = {};
  if (!b || typeof b !== 'object') return out;
  if ((KINDS as readonly string[]).includes(b.kind)) out.kind = b.kind;
  if ('title' in b) out.title = str(b.title, 160);
  if ('text' in b) out.text = strMulti(b.text, 20000);
  if ('when' in b) out.when = str(b.when, 40);
  if ('place' in b) out.place = str(b.place, 80);
  if ('people' in b && Array.isArray(b.people)) out.people = [...new Set(b.people.map((p: unknown) => str(p, 40)).filter(Boolean) as string[])].slice(0, 30);
  if ((LEVELS as readonly string[]).includes(b.level)) out.level = b.level;
  return out;
}

/** which kinds take a file, and which files each may take (the bytes are checked, a renamed file is refused) */
const AUDIO = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav'];
const IMAGE = ['image/webp', 'image/jpeg', 'image/png'];
export const ACCEPTS: Record<Kind, string[]> = {
  story: [], recording: AUDIO, reading: AUDIO, photo: IMAGE, doc: [...IMAGE, 'application/pdf'],
};
/** what the bytes are, whatever the file says it is */
export function sniff(b: Uint8Array): string | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x);
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return 'audio/webm';
  if (at(0, 0x4f, 0x67, 0x67, 0x53)) return 'audio/ogg';
  if (at(0, 0x49, 0x44, 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (at(4, 0x66, 0x74, 0x79, 0x70)) return 'audio/mp4';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x41, 0x56, 0x45)) return 'audio/wav';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return 'application/pdf';
  return null;
}
/** the file's type when this kind may take it, else null */
export function fileType(kind: Kind, bytes: Uint8Array): string | null {
  const t = sniff(bytes);
  return t && ACCEPTS[kind].includes(t) ? t : null;
}

/* ---------------- the guided interview (no AI: a fixed list) ---------------- */

export const QUESTIONS = [
  'איפה גדלת? איך נראה הבית?',
  'מי היו ההורים שלך? מה זכור לך מהם?',
  'איך נראה יום רגיל כשהיית ילד או ילדה?',
  'איך הכרתם?',
  'מה היה החג הכי זכור לך?',
  'איזה מאכל מזכיר לך את הבית?',
  'מה היה הרגע הכי קשה, ואיך עברתם אותו?',
  'מה היית רוצה שהנכדים יזכרו?',
];
