// The rules for joining from an invitation (server/join.ts), with no database, so they can be tested alone
// (server/test-join.mjs).

/** how long a join ticket lasts while the guest signs in with Google */
export const TTL = 20 * 60e3;

export interface Ticket { gathering: string; exp: number; used: number }
export interface GatheringState { status: string; expires_at: number }

/** may this ticket admit someone now? the ticket unused and in time, its gathering still open */
export function ticketOk(t: Ticket | null | undefined, g: GatheringState | null | undefined, now = Date.now()): boolean {
  if (!t || t.used || t.exp <= now) return false;
  if (!g || g.status !== 'active' || g.expires_at <= now) return false;
  return true;
}

/** a household of one's own: never the family's, never anyone else's (random, with a mark that says where it came from) */
export const newHousehold = (rand: string) => 'g-' + rand.replace(/[^a-z0-9]/gi, '').slice(0, 24);

/** the name to keep for a new member: Google's, cleaned, or nothing */
export const cleanName = (s: unknown) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80) : '') || null;
