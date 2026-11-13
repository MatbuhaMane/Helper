// פרופיל המשפחה (docs/vision/family-profile.md): the pure rules, with no database, so they can be tested alone
// (server/test-family-profile.mjs). The one rule that matters: the profile shows, it never widens.
//   * who may open a household's profile: its own household always; the tribe (linked households) only when a head
//     opened it to them; someone holding the invitation link only when a head made one
//   * what each viewer sees: the profile's own words (cover, line, origins, traditions) go to whoever may open it;
//     every item that lives elsewhere (a person's card, a recipe, the tree) keeps its own privacy, and a viewer who may
//     not see it gets an empty spot ({ gap: true }) with nothing of it inside

import { Bridge, Distance, Privacy, distance, sees } from './vault/kin';

export const COVERS = ['olive', 'hills', 'sea', 'desert', 'fields'] as const;
export type Cover = (typeof COVERS)[number] | 'own';

/** how the viewer reached the profile */
export type Reach = 'household' | 'linked' | 'forest' | 'link';
export interface Opening { tribe: boolean; link: boolean }

/** may this viewer open the profile at all? null when they may not */
export function reach(viewer: string, holder: string, open: Opening, bridges: Bridge[], linkMatches: boolean): Reach | null {
  const d = distance(viewer, holder, bridges);
  if (d === 'household') return 'household';
  if (open.tribe && (d === 'linked' || d === 'forest')) return d;
  if (open.link && linkMatches) return 'link';
  return null;
}
/** the distance items are judged at: an invitation link is no relation at all, so it never opens a tree item */
export const kinDistance = (r: Reach): Distance => (r === 'link' ? 'none' : r);

export interface Origin { place: string; years: string }
export interface Stored {
  title: string; line: string; cover: Cover; coverOwn: boolean;
  origins: Origin[]; traditions: string; dishes: string[]; open: Opening;
}
/** a user of the household, with what of their tree card may leave the household (kin.outside), when they have a card */
export interface PersonIn { email: string; name: string; cardName: string | null; outside: { privacy: Privacy; anonymous: boolean } | null }
export interface RecipeIn { id: string; title: string; image: string | null }
export type Gap = { gap: true };

export interface Shown {
  reach: Reach; mine: boolean; head: boolean;
  title: string; line: string; cover: Cover; origins: Origin[]; traditions: string;
  people: ({ name: string; email?: string } | Gap)[];
  dishes: (RecipeIn | Gap)[];
  tree: boolean;                         // the tree window, or an empty spot
  open?: Opening;                        // who it is open to: only for the household itself
}

const GAP: Gap = { gap: true };

/** may someone at this reach see this person on the profile? Inside the household, everyone; outside, only by their
    card's identity level (never a member without a card, never an anonymous one, never by an invitation link) */
export function personShows(p: PersonIn, r: Reach): boolean {
  if (r === 'household') return true;
  if (!p.outside || p.outside.anonymous) return false;
  return sees(p.outside.privacy.identity, kinDistance(r), { self: false, keeper: false }, 'identity');
}

/** the profile as this viewer may see it */
export function shape(s: Stored, r: Reach, head: boolean, people: PersonIn[], recipes: RecipeIn[]): Shown {
  const mine = r === 'household';
  const byId = new Map(recipes.map((x) => [x.id, x]));
  return {
    reach: r, mine, head: mine && head,
    title: s.title, line: s.line, cover: s.cover, origins: s.origins, traditions: s.traditions,
    // outside the household a person goes by their card's name, and an email never leaves it
    people: people.map((p) => (!personShows(p, r) ? GAP : mine ? { name: p.name, email: p.email } : { name: p.cardName || p.name })),
    // recipes live in the household's book, which is the household's only: outside it each one is an empty spot
    dishes: s.dishes.filter((id) => byId.has(id)).map((id) => (mine ? byId.get(id)! : GAP)),
    tree: mine,
    ...(mine ? { open: s.open } : {}),
  };
}

/* ---------------- what a head may store ---------------- */

const str = (x: unknown, n: number) => String(x ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const strMulti = (x: unknown, n: number) => String(x ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, n);

/** a change from the page (or a suggestion), cleaned; only the fields it names */
export interface Patch { title?: string; line?: string; cover?: Cover; origins?: Origin[]; traditions?: string; dishes?: string[] }
export function cleanPatch(b: any): Patch {
  const out: Patch = {};
  if (!b || typeof b !== 'object') return out;
  if ('title' in b) out.title = str(b.title, 60);
  if ('line' in b) out.line = str(b.line, 160);
  if ('cover' in b && ((COVERS as readonly string[]).includes(b.cover) || b.cover === 'own')) out.cover = b.cover;
  if ('origins' in b && Array.isArray(b.origins))
    out.origins = b.origins.slice(0, 8).map((o: any) => ({ place: str(o?.place, 40), years: str(o?.years, 30) })).filter((o: Origin) => o.place);
  if ('traditions' in b) out.traditions = strMulti(b.traditions, 2000);
  if ('dishes' in b && Array.isArray(b.dishes)) out.dishes = [...new Set(b.dishes.map((d: unknown) => str(d, 40)).filter(Boolean) as string[])].slice(0, 8);
  return out;
}
/** the patch applied over what is stored (an own cover is chosen only when a photo was uploaded) */
export function apply(s: Stored, p: Patch): Stored {
  const out = { ...s, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as Stored;
  if (out.cover === 'own' && !s.coverOwn) out.cover = s.cover;
  return out;
}
/** an empty profile: the household's name if it has one, the olive cover, nothing else, the household only */
export const blank = (title: string): Stored => ({ title, line: '', cover: 'olive', coverOwn: false, origins: [], traditions: '', dishes: [], open: { tribe: false, link: false } });
