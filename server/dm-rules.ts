// Messages between members (הודעות), one on one, the pure rules: who may write to whom, who may read a conversation,
// what a message keeps, what is unread, and what of a conversation goes back to the page (never an email).
// No database here, so server/test-dm.mjs runs it with node.   The handlers are in server/dm.ts.
//
// The rule (the CEO's default, 2026-11-13; the owner may change it): a member may write to the members of their own
// household, and to users of the app in the trees joined to theirs by confirmed bridges (the same tribe the forest
// search shows), and to no one else. Blocking works both ways: neither side can write once one has blocked the other.

import { HttpError } from './core';

export const TEXT_MAX = 2000;
export const PAGE = 200;                                            // messages a thread returns at most
export const RATE = {
  send: { max: 20, windowMs: 60_000 },                              // messages a minute
  sendDay: { max: 500, windowMs: 864e5 },                           // messages a day
  start: { max: 30, windowMs: 3600e3 },                             // new conversations an hour
  people: { max: 30, windowMs: 60_000 },                            // contact lists a minute
};

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/\r\n?/g, '\n').trim().slice(0, max);

/** the text of a message, cleaned: no control characters, at most TEXT_MAX, no more than two empty lines in a row */
export function cleanText(t: unknown): string {
  const s = clean(t, TEXT_MAX).replace(/\n{3,}/g, '\n\n');
  if (!s) throw new HttpError(400, 'text_required');
  return s;
}

/** the two sides of a conversation, always in the same order, so a pair has one conversation */
export function pair(x: string, y: string): [string, string] {
  const a = x.trim().toLowerCase(), b = y.trim().toLowerCase();
  return a < b ? [a, b] : [b, a];
}

export interface Reach {
  self: boolean;                // writing to oneself
  sameHousehold: boolean;
  sameTribe: boolean;           // the other's household is in the writer's tribe (confirmed bridges)
  iBlocked: boolean;            // the writer blocked the other
  theyBlocked: boolean;         // the other blocked the writer
}
/** may the writer write to the other: null, or why not. Being out of reach and being blocked answer alike to the page */
export function mayMessage(r: Reach): null | 'self' | 'not_reachable' | 'blocked' {
  if (r.self) return 'self';
  if (!r.sameHousehold && !r.sameTribe) return 'not_reachable';
  if (r.iBlocked || r.theyBlocked) return 'blocked';
  return null;
}

/* ---------------- who reads a conversation ---------------- */

export interface Thread { id: string; a: string; b: string; created_at: number; last_at: number | null; last_by: string | null; a_seen: number | null; b_seen: number | null }

/** 'a' or 'b' for one of the two sides, else null: anyone else (the same household, a head, the owner) gets 404 */
export function sideOf(t: Thread | null | undefined, email: string): 'a' | 'b' | null {
  if (!t || !email) return null;
  const e = email.toLowerCase();
  return t.a === e ? 'a' : t.b === e ? 'b' : null;
}
export const otherOf = (t: Thread, email: string) => (sideOf(t, email) === 'a' ? t.b : t.a);

/** unread for this side: the other wrote last, after this side last opened it */
export function unreadFor(t: Thread, email: string): boolean {
  const s = sideOf(t, email);
  if (!s || !t.last_at || !t.last_by || t.last_by === email.toLowerCase()) return false;
  const seen = s === 'a' ? t.a_seen : t.b_seen;
  return !seen || seen < t.last_at;
}

export interface Msg { id: string; thread: string; sender: string; text: string; at: number }
/** a message as the page gets it: mine or theirs, never the sender's email */
export const publicMsg = (m: Msg, email: string) => ({ id: m.id, mine: m.sender === email.toLowerCase(), text: m.text, at: m.at });

/** a conversation in the list: the other side's name, a short preview, unread, and whether I blocked them */
export function publicThread(t: Thread, email: string, o: { name: string; last: Msg | null; iBlocked: boolean }) {
  return {
    id: t.id, name: o.name, unread: unreadFor(t, email), blocked: o.iBlocked,
    last: o.last ? { text: preview(o.last.text), at: o.last.at, mine: o.last.sender === email.toLowerCase() } : null,
    at: t.last_at || t.created_at,
  };
}
export const preview = (s: string) => { const one = s.replace(/\s+/g, ' ').trim(); return one.length > 80 ? one.slice(0, 78) + '…' : one; };

/** the name of a member for the other side: the Hebrew name, the name, or a neutral word (never the email) */
export const nameOf = (m: { name?: string | null; he_name?: string | null } | null | undefined) => (m?.he_name || m?.name || '').trim() || 'בן משפחה';

/* ---------------- the contact list ---------------- */

export interface Contact { id: string; name: string; where: 'home' | 'tribe'; title?: string | null; relation?: string | null }
/** household members first, then the joined trees; one entry per id, never oneself, by name */
export function contacts(home: Contact[], tribe: Contact[]): Contact[] {
  const seen = new Set<string>(), out: Contact[] = [];
  for (const c of [...home, ...tribe]) if (!seen.has(c.id)) { seen.add(c.id); out.push(c); }
  const by = (x: Contact, y: Contact) => (x.where === y.where ? x.name.localeCompare(y.name, 'he') : x.where === 'home' ? -1 : 1);
  return out.sort(by);
}

/** a forest card someone may write to: a user of the app, someone else, whose identity this viewer may see */
export const writable = (c: { user: boolean; self: boolean; mine: boolean; anonymous: boolean; hidden: string[] }) =>
  c.user && !c.self && !c.mine && !c.anonymous && !c.hidden.includes('identity');

/** the back door's view: counts only, never a name, an email or a word of a message */
export function stats(threads: number, messages: number, lastWeek: number, blocks: number) {
  return { threads, messages, lastWeek, blocks };
}
