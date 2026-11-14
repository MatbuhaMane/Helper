// Friends, "the family you choose" (vision batch 27, docs/vision/social.md; the look in docs/design/friends.md).
// The pure rules, no database, so server/test-friends.mjs runs them with node. The handlers are in server/friends.ts.
//
// The rules (vision, confirmed by the owner):
//   * a friendship needs both sides: a request in the app that the other accepts, or a link one side made that the other
//     opens and accepts. A link works once and ends after LINK_DAYS;
//   * asking never tells the asker whether the address belongs to anyone (no way to probe who is in the tent);
//   * the page never gets an email: a friend, a request and a link go by opaque ids;
//   * a child under 12 gets messages only from the family, so a child has no friends from outside it (requests to or from
//     a child are dropped quietly) and is never in a group with someone who is not family;
//   * either side may end a friendship at any time; it ends for both.

import { HttpError } from './core';

export const LINK_DAYS = 7;
export const NAME_MAX = 40;
export const GROUP_MAX = 20;                                         // people in a group, the maker included
export const RATE = {
  request: { max: 20, windowMs: 3600e3 },                            // requests an hour
  link: { max: 10, windowMs: 3600e3 },                               // new links an hour
  open: { max: 30, windowMs: 3600e3 },                               // links opened an hour
  group: { max: 10, windowMs: 3600e3 },                              // new groups an hour
};

export type Status = 'pending' | 'accepted';
export interface Row { a: string; b: string; asker: string; status: Status; created_at: number; accepted_at: number | null }

/** the two sides, always in the same order, so a pair has one row */
export function pair(x: string, y: string): [string, string] {
  const a = String(x).trim().toLowerCase(), b = String(y).trim().toLowerCase();
  return a < b ? [a, b] : [b, a];
}
export const otherOf = (r: Row, me: string) => (r.a === me.toLowerCase() ? r.b : r.a);
export const isSide = (r: Row | null | undefined, me: string) => !!r && (r.a === me.toLowerCase() || r.b === me.toLowerCase());

/** where this pair stands, for me: friends, a request to me (in), a request I sent (out), or nothing */
export function stateFor(r: Row | null | undefined, me: string): 'friends' | 'in' | 'out' | null {
  if (!isSide(r, me)) return null;
  if (r!.status === 'accepted') return 'friends';
  return r!.asker === me.toLowerCase() ? 'out' : 'in';
}

export interface Who { email: string; child: boolean; family: boolean }   // family: the same household or tribe as me
/** what a request from me to them does: insert a request, accept theirs (they asked me already), or nothing */
export function onRequest(r: Row | null | undefined, me: Who, them: Who | null): 'insert' | 'accept' | 'none' {
  if (!them || them.email.toLowerCase() === me.email.toLowerCase()) return 'none';
  if (!them.family && (me.child || them.child)) return 'none';      // the children's rule, quietly
  const s = stateFor(r, me.email);
  if (s === 'in') return 'accept';
  if (s) return 'none';                                             // friends already, or asked already
  return 'insert';
}

/** may this person still accept a request or a link (the children's rule holds at accepting too) */
export const mayBefriend = (me: Who, them: Who) => me.email.toLowerCase() !== them.email.toLowerCase() && (them.family || (!me.child && !them.child));

/** an email typed by hand: trimmed, lower case, or null when it does not look like one */
export function emailOf(s: unknown): string | null {
  const e = String(s ?? '').trim().toLowerCase();
  return e.length <= 200 && /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/.test(e) ? e : null;
}

/* ---------------- the invite link ---------------- */

export interface Link { token: string; owner: string; created_at: number; expires_at: number; used_by: string | null }
export const tokenOk = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(t);
export const expiresAt = (now: number) => now + LINK_DAYS * 864e5;
/** what opening a link means for this person */
export function linkState(l: Link | null | undefined, me: string, now: number): 'ok' | 'gone' | 'self' {
  if (!l || l.used_by || l.expires_at <= now) return 'gone';        // used, ended or never was: one answer
  if (l.owner === me.toLowerCase()) return 'self';
  return 'ok';
}

/* ---------------- groups ---------------- */

/** a group's name: cleaned, at most NAME_MAX; empty is an error */
export function groupName(s: unknown): string {
  const n = String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  if (!n) throw new HttpError(400, 'name_required');
  return n;
}

/** the people a group may hold: the maker and up to GROUP_MAX-1 others, each one the maker may reach; a child under 12
 *  only when every other person in the group is family to that child. Answers the emails kept, or why not */
export function groupMembers(maker: string, picked: { email: string; reachable: boolean; child: boolean }[],
  familyOf: (x: string, y: string) => boolean): { ok: true; emails: string[] } | { ok: false; why: 'too_many' | 'not_reachable' | 'child' | 'empty' } {
  const me = maker.toLowerCase();
  const seen = new Set<string>(), list: typeof picked = [];
  for (const p of picked) { const e = p.email.toLowerCase(); if (e !== me && !seen.has(e)) { seen.add(e); list.push({ ...p, email: e }); } }
  if (!list.length) return { ok: false, why: 'empty' };
  if (list.length + 1 > GROUP_MAX) return { ok: false, why: 'too_many' };
  if (list.some((p) => !p.reachable)) return { ok: false, why: 'not_reachable' };
  const all = [me, ...list.map((p) => p.email)];
  for (const p of list) if (p.child && all.some((o) => o !== p.email && !familyOf(p.email, o))) return { ok: false, why: 'child' };
  return { ok: true, emails: all };
}

/** two letters for the avatar when there is no picture: the first letters of the first two words */
export function initials(name: string): string {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase();
}
/** a steady colour for a person's avatar, from their opaque id (never their email) */
export function hue(id: string): string {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0; h = (h ^ (h >>> 16)) >>> 0;   // so ids that differ in one letter differ in colour
  return `hsl(${h % 360} 45% 42%)`;
}
