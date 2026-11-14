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

/* ---- the owner's invitations from outside the family (the back door, server/join.ts) ----
   The owner makes a personal link (/join/#key); whoever opens it and signs in with Google gets a household of their own
   with the trial credits, like a guest from a gathering. One use. An invitation may name an email: then only that
   address can use it. Nothing of the family opens to them: a new household, never 'family'. */

/** the join cookie carries a gathering's ticket, or (with this mark) an owner's invitation key */
export const OWNER_MARK = 'o.';

export type InviteStatus = 'sent' | 'opened' | 'redeemed' | 'expired' | 'cancelled';
export interface OwnerInvite { exp: number; used_at: number | null; cancelled_at: number | null; email: string | null; opened_at?: number | null }

/** what became of an invitation: cancelled and redeemed are final, before its time runs out; opened: its page was seen */
export function inviteStatus(i: OwnerInvite, now = Date.now()): InviteStatus {
  if (i.cancelled_at) return 'cancelled';
  if (i.used_at) return 'redeemed';
  if (i.exp <= now) return 'expired';
  return i.opened_at ? 'opened' : 'sent';
}

/** still open: sent, or opened and not used yet */
export const inviteOpen = (s: InviteStatus) => s === 'sent' || s === 'opened';

/** may this invitation admit this address now? open, and if it names an email, only that one */
export function ownerInviteOk(i: OwnerInvite | null | undefined, email: string, now = Date.now()): boolean {
  if (!i || !inviteOpen(inviteStatus(i, now))) return false;
  return !i.email || i.email === String(email || '').trim().toLowerCase();
}

/** how many days an invitation lasts: 1 to 30, a week when not said */
export const inviteDays = (d: unknown) => { const n = Math.round(Number(d)); return Number.isFinite(n) && n >= 1 ? Math.min(n, 30) : 7; };

/** an email to tie the invitation to: a plain address, lower case, or none */
export const inviteEmail = (s: unknown) => {
  const e = typeof s === 'string' ? s.trim().toLowerCase() : '';
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(e) ? e : null;
};

/** the key in the link: letters and digits only, long enough (the page sends it as it is) */
export const inviteKeyOk = (k: unknown) => typeof k === 'string' && /^[A-Za-z0-9]{32,80}$/.test(k);

/** who may make, see and cancel invitations: an owner (OWNER_EMAIL), from their own account in the back door */
export const mayInvite = (a: { level: string; own: boolean } | null | undefined) => !!a && a.level === 'owner' && a.own;
