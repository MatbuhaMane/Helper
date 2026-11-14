// Who sees a published item: the four levels of vision batch 27 (docs/vision/social.md, 2026-11-14; the look in
// docs/design/friends.md). The pure rules, with no database, so server/test-audience.mjs tests every level against every
// kind of viewer. SECURITY-SENSITIVE: the master reviews every change here and the owner approves it before it goes live.
//
// The ladder, from the narrowest:
//   me       רק אני          the one who published it
//   family   רק משפחה        the family tree: the household and the households joined to it by confirmed bridges
//   friends  חברים ומשפחה    the family, and the publisher's own friends (both sides approved)
//   all      כולם            everyone signed in to the tent (no page lists strangers' items yet; "גבעה ביער" waits)
//
// Old values stay readable and are never widened: 'private' is 'me', 'tribe' is 'family', and 'household' (the old
// default) keeps its narrower reach, the household only, until its publisher chooses a level again. A value we do not
// know opens to nobody but the publisher.

export const AUDIENCES = ['all', 'friends', 'family', 'me'] as const;
export type Audience = (typeof AUDIENCES)[number];
/** what may be stored: the four, and the old 'household' (narrower than 'family') */
export type Stored = Audience | 'household';

export const AUDIENCE_NAME: Record<Audience, string> = { all: 'כולם', friends: 'חברים ומשפחה', family: 'רק משפחה', me: 'רק אני' };

/** who the viewer is to the publisher, the closest that holds */
export type Rel = 'self' | 'household' | 'tribe' | 'friend' | 'member' | 'none';
export const REL_ORDER: Rel[] = ['self', 'household', 'tribe', 'friend', 'member', 'none'];

/** a stored value, old or new, as one of the levels the rules know ('household' kept as is); anything else: null */
export function normalize(v: unknown): Stored | null {
  switch (v) {
    case 'all': case 'friends': case 'family': case 'me': case 'household': return v;
    case 'private': return 'me';
    case 'tribe': return 'family';
    default: return null;
  }
}
/** the level the picker shows for a stored value: 'household' shows as 'family' (it reaches fewer, never more) */
export const shown = (v: unknown): Audience => { const n = normalize(v); return n === 'household' ? 'family' : n ?? 'me'; };

/** the viewer's relation to the publisher. `friend` counts only when both sides approved; a family tie wins over it */
export function relOf(r: { signedIn: boolean; self: boolean; sameHousehold: boolean; sameTribe: boolean; friend: boolean }): Rel {
  if (!r.signedIn) return 'none';
  if (r.self) return 'self';
  if (r.sameHousehold) return 'household';
  if (r.sameTribe) return 'tribe';
  if (r.friend) return 'friend';
  return 'member';
}

/** may a viewer with this relation see an item at this level? */
export function reaches(level: unknown, rel: Rel): boolean {
  if (rel === 'none') return false;                                   // never anyone who is not signed in
  if (rel === 'self') return true;                                    // the publisher always sees their own
  switch (normalize(level)) {
    case 'me': return false;
    case 'household': return rel === 'household';
    case 'family': return rel === 'household' || rel === 'tribe';
    case 'friends': return rel === 'household' || rel === 'tribe' || rel === 'friend';
    case 'all': return rel === 'household' || rel === 'tribe' || rel === 'friend' || rel === 'member';
    default: return false;                                            // an unknown level opens to nobody else
  }
}

/** the levels this publisher may choose: a child (under 12) may not publish to everyone, nor to friends outside the family */
export function choosable(o: { child: boolean }): Audience[] {
  return o.child ? ['family', 'me'] : [...AUDIENCES];
}
/** a level chosen from outside: one of the choosable ones, or the fallback */
export function pick(v: unknown, o: { child: boolean }, fallback: Audience = 'family'): Audience {
  const n = normalize(v);
  const a = n === 'household' ? null : n;
  return a && choosable(o).includes(a) ? a : fallback;
}
