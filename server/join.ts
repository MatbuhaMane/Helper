// Joining הָאֹהֶל from a gathering's invitation (the owner's decision, docs/decisions.md): a guest who taps "כניסה עם
// Google" on an invitation is admitted into a household of their own, with the one-time trial credits (server/credits.ts);
// a member who signs in from it is simply known by their sign-in. Nothing else of the inviting household opens to them.
//
//   1. the invitation page asks POST /api/gather/invite/:token/join: the server checks that the gathering is open and keeps
//      a single-use ticket (only its hash) for twenty minutes, in an HttpOnly cookie on this device;
//   2. Google's sign-in comes back to /api/auth/callback, where admitMember (server/core.ts) asks admitFromInvite here;
//   3. the ticket is used once: a new member in a new household, the trial credits, their earlier guest answer tied to
//      them, and an anonymous count ("signup") for the beta.
// The owner can close it in the room (the setting gather.guest_signup).

import { Ctx, Env, HttpError, Member, cookie, getCookie, json, uid } from './core';
import { inviteInfo } from './gather';
import { rateLimit } from './vault';
import { fingerprint } from './vault/crypto';
import { setting } from './settings';
import { startTrial } from './credits';
import * as R from './join-rules';

export const JOIN_COOKIE = 'join';
const hashOf = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('invite-join:' + s)))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

/** POST /api/gather/invite/:token/join {guest}: a ticket for signing in from this invitation; answers where to go next */
export async function inviteJoin(ctx: Ctx) {
  if (!(await setting<boolean>(ctx.env, 'gather.guest_signup'))) throw new HttpError(403, 'signup_closed');
  const ip = ctx.req.headers.get('cf-connecting-ip') || 'local';
  await rateLimit(ctx, 'join:' + (await fingerprint(ctx.env, ip)), 10, 3600e3);
  const guest = ctx.req.headers.get('x-guest') || '';
  const g = await inviteInfo(ctx, guest);
  if (!g.open) throw new HttpError(410, 'closed');
  const nonce = uid() + uid() + uid(), now = Date.now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM invite_joins WHERE exp < ?').bind(now - 864e5),
    ctx.env.DB.prepare('INSERT INTO invite_joins (nonce_hash, gathering, rsvp, exp, used) VALUES (?, ?, ?, ?, 0)').bind(await hashOf(nonce), g.id, g.rsvp, now + R.TTL),
  ]);
  // the page keeps the invitation's key itself and comes back to it: the sign-in address carries no key
  return json({ url: '/api/auth/login?next=' + encodeURIComponent('/gather/invite/') }, 200, { 'set-cookie': cookie(JOIN_COOKIE, nonce, R.TTL / 1000) });
}

/** called by admitMember for an email that is not a member yet: admits them if this device holds a valid join ticket */
export async function admitFromInvite(env: Env, req: Request, email: string, name: string | null): Promise<Member | null> {
  const nonce = getCookie(req, JOIN_COOKIE);
  if (!nonce || !(await setting<boolean>(env, 'gather.guest_signup'))) return null;
  const hash = await hashOf(nonce);
  const t = await env.DB.prepare('SELECT gathering, rsvp, exp, used FROM invite_joins WHERE nonce_hash = ?').bind(hash).first<R.Ticket & { rsvp: string | null }>();
  const g = t ? await env.DB.prepare('SELECT status, expires_at FROM gatherings WHERE id = ?').bind(t.gathering).first<R.GatheringState>() : null;
  if (!t || !R.ticketOk(t, g)) return null;
  // used once: whoever gets here first with it
  const took = await env.DB.prepare('UPDATE invite_joins SET used = 1 WHERE nonce_hash = ? AND used = 0').bind(hash).run();
  if (!took.meta.changes) return null;
  const household = R.newHousehold(uid() + uid()), clean = R.cleanName(name), now = Date.now();
  const made = await env.DB.prepare("INSERT INTO members (email, name, household, role, created_at) VALUES (?, ?, ?, 'member', ?) ON CONFLICT(email) DO NOTHING")
    .bind(email, clean, household, now).run();
  if (!made.meta.changes) return null;                     // someone made this member in the meantime: the normal path decides
  await startTrial(env, email);
  await linkAnswer(env, t.rsvp, email);
  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare("INSERT INTO gathering_stats (gathering, kind, day, n) VALUES (?, 'signup', ?, 1) ON CONFLICT(gathering, kind, day) DO UPDATE SET n = n + 1").bind(t.gathering, day).run();
  return { email, name: clean, household, role: 'member' };
}

/** a member who signed in from an invitation (new or not): their earlier answer as a guest becomes theirs */
export async function joinedAs(env: Env, req: Request, email: string) {
  const nonce = getCookie(req, JOIN_COOKIE);
  if (!nonce) return;
  const t = await env.DB.prepare('SELECT rsvp FROM invite_joins WHERE nonce_hash = ?').bind(await hashOf(nonce)).first<{ rsvp: string | null }>();
  await linkAnswer(env, t?.rsvp || null, email);
}
async function linkAnswer(env: Env, rsvp: string | null, email: string) {
  if (!rsvp) return;
  // only a guest's answer, and only if this member has not answered that gathering already
  await env.DB.prepare(`UPDATE gathering_rsvps SET email = ?, guest_hash = NULL WHERE id = ? AND email IS NULL
    AND NOT EXISTS (SELECT 1 FROM gathering_rsvps o WHERE o.gathering = gathering_rsvps.gathering AND o.email = ?)`).bind(email, rsvp, email).run();
}
