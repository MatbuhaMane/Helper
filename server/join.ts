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

import { Ctx, Env, HttpError, Member, body, cookie, getCookie, json, uid } from './core';
import { inviteInfo } from './gather';
import { rateLimit } from './vault';
import { fingerprint, seal, unseal } from './vault/crypto';
import { log, requireAdmin } from './admin';
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
  if (nonce?.startsWith(R.OWNER_MARK)) return admitFromOwnerInvite(env, nonce.slice(R.OWNER_MARK.length), email, name);
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
  if (!nonce || nonce.startsWith(R.OWNER_MARK)) return;    // an owner's invitation has no guest answer to tie
  const t = await env.DB.prepare('SELECT rsvp FROM invite_joins WHERE nonce_hash = ?').bind(await hashOf(nonce)).first<{ rsvp: string | null }>();
  await linkAnswer(env, t?.rsvp || null, email);
}
async function linkAnswer(env: Env, rsvp: string | null, email: string) {
  if (!rsvp) return;
  // only a guest's answer, and only if this member has not answered that gathering already
  await env.DB.prepare(`UPDATE gathering_rsvps SET email = ?, guest_hash = NULL WHERE id = ? AND email IS NULL
    AND NOT EXISTS (SELECT 1 FROM gathering_rsvps o WHERE o.gathering = gathering_rsvps.gathering AND o.email = ?)`).bind(email, rsvp, email).run();
}

/* ---------------- the owner's invitations from outside the family (the back door) ----------------
   The owner makes a personal link in the back door (/join/#key, the key after the # so it stays out of logs). Whoever
   opens it taps "כניסה עם Google": the key goes into this device's join cookie (marked R.OWNER_MARK) for twenty minutes,
   and admitMember (core.ts) asks admitFromInvite, which admits a new member into a household of their own with the
   trial credits, once. Only the key's hash finds it; a sealed copy lets the owner copy the link again while it is open.
   An invitation that names an email admits only that address. Nothing of the family opens to them. */

const keyHash = async (k: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('owner-invite:' + k)))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');
interface InviteRow extends R.OwnerInvite { id: string; name: string; key_enc: string; created_by: string; created_at: number; used_by: string | null; used_name?: string | null }
const linkOf = (ctx: Ctx, key: string) => `${new URL(ctx.req.url).origin}/join/#${key}`;
/** r***@gmail.com: enough for the invited person to know which account to sign in with */
const maskEmail = (e: string) => e.replace(/^(.)[^@]*/, (_, c) => c + '***');

async function ownerOnly(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  if (!R.mayInvite(a)) throw new HttpError(403, 'owner_only');
  return a;
}

/** GET /api/admin/invites?q= – the owner's invitations, newest first, each with its status (and its link while open) */
export async function invitesList(ctx: Ctx) {
  await ownerOnly(ctx);
  const q = (new URL(ctx.req.url).searchParams.get('q') || '').trim().toLowerCase().slice(0, 80);
  const like = '%' + q.replace(/[%_!]/g, (c) => '!' + c) + '%';
  const { results } = await ctx.env.DB.prepare(`SELECT i.*, COALESCE(m.he_name, m.name) AS used_name FROM owner_invites i LEFT JOIN members m ON m.email = i.used_by
    WHERE ? = '' OR lower(i.name) LIKE ? ESCAPE '!' OR lower(COALESCE(i.email, '')) LIKE ? ESCAPE '!' OR lower(COALESCE(i.used_by, '')) LIKE ? ESCAPE '!'
    ORDER BY i.created_at DESC LIMIT 100`).bind(q, like, like, like).all<InviteRow>();
  const now = Date.now();
  const invites = await Promise.all(results.map(async (i) => {
    const status = R.inviteStatus(i, now);
    return { id: i.id, name: i.name, email: i.email, status, created_at: i.created_at, exp: i.exp, used_by: i.used_by, used_name: i.used_name || null, used_at: i.used_at,
      opened_at: i.opened_at || null, cancelled_at: i.cancelled_at, url: R.inviteOpen(status) ? linkOf(ctx, await unseal(ctx.env, i.key_enc, `invite:${i.id}:key`)) : null };
  }));
  const count = { sent: 0, opened: 0, redeemed: 0, expired: 0, cancelled: 0 };
  for (const i of invites) count[i.status]++;
  return json({ invites, count });
}

/** POST /api/admin/invites {name, email?, days?} – a new personal link, to copy or send */
export async function inviteCreate(ctx: Ctx) {
  const a = await ownerOnly(ctx);
  const b = await body<{ name?: unknown; email?: unknown; days?: unknown }>(ctx.req);
  const name = R.cleanName(b.name);
  if (!name) throw new HttpError(400, 'name_required');
  const email = b.email ? R.inviteEmail(b.email) : null;
  if (b.email && !email) throw new HttpError(400, 'bad_email');
  if (email && (await ctx.env.DB.prepare('SELECT 1 FROM members WHERE email = ?').bind(email).first())) throw new HttpError(409, 'already_member');
  const id = uid(), key = uid() + uid() + uid(), now = Date.now(), exp = now + R.inviteDays(b.days) * 864e5;
  await ctx.env.DB.prepare('INSERT INTO owner_invites (id, key_hash, key_enc, name, email, created_by, created_at, exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, await keyHash(key), await seal(ctx.env, key, `invite:${id}:key`), name, email, a.by, now, exp).run();
  await log(ctx, a, 'invite', `${name}${email ? ' ' + email : ''}`);
  return json({ id, url: linkOf(ctx, key), exp });
}

/** POST /api/admin/invites/:id/cancel – only an open invitation; its link stops working at once */
export async function inviteCancel(ctx: Ctx) {
  const a = await ownerOnly(ctx);
  const r = await ctx.env.DB.prepare('UPDATE owner_invites SET cancelled_at = ? WHERE id = ? AND used_at IS NULL AND cancelled_at IS NULL').bind(Date.now(), ctx.params.id).run();
  if (!r.meta.changes) throw new HttpError(409, 'not_open');
  await log(ctx, a, 'invite:cancel', ctx.params.id);
  return json({ ok: true });
}

async function inviteByKey(ctx: Ctx, key: unknown) {
  const ip = ctx.req.headers.get('cf-connecting-ip') || 'local';
  await rateLimit(ctx, 'ojoin:' + (await fingerprint(ctx.env, ip)), 30, 3600e3);
  if (!R.inviteKeyOk(key)) return null;
  return ctx.env.DB.prepare('SELECT * FROM owner_invites WHERE key_hash = ?').bind(await keyHash(key as string)).first<InviteRow>();
}

/** POST /api/join/check {key} – what the link's page shows: open or not, the name it was made for, the address it needs */
export async function ownerInviteCheck(ctx: Ctx) {
  const b = await body<{ key?: unknown }>(ctx.req);
  const i = await inviteByKey(ctx, b.key);
  if (!i) return json({ status: 'unknown', member: !!ctx.user });
  const status = R.inviteStatus(i);
  // the first time the page is opened, by someone who is not signed in yet: the owner sees it as "נפתחה"
  if (status === 'sent' && !ctx.user) await ctx.env.DB.prepare('UPDATE owner_invites SET opened_at = ? WHERE id = ? AND opened_at IS NULL').bind(Date.now(), i.id).run();
  const open = R.inviteOpen(status);
  return json({ status: open ? 'sent' : status, member: !!ctx.user, ...(open ? { name: i.name, email: i.email ? maskEmail(i.email) : null } : {}) });
}

/** POST /api/join/start {key} – the key into this device's join cookie, then Google's sign-in */
export async function ownerInviteStart(ctx: Ctx) {
  const b = await body<{ key?: unknown }>(ctx.req);
  const i = await inviteByKey(ctx, b.key);
  if (!i || !R.inviteOpen(R.inviteStatus(i))) throw new HttpError(410, 'closed');
  return json({ url: '/api/auth/login?next=' + encodeURIComponent('/') }, 200, { 'set-cookie': cookie(JOIN_COOKIE, R.OWNER_MARK + String(b.key), R.TTL / 1000) });
}

/** admits a new member from an owner's invitation: once, only the address it names (if any), into a household of their own */
async function admitFromOwnerInvite(env: Env, key: string, email: string, name: string | null): Promise<Member | null> {
  if (!R.inviteKeyOk(key)) return null;
  const i = await env.DB.prepare('SELECT * FROM owner_invites WHERE key_hash = ?').bind(await keyHash(key)).first<InviteRow>();
  if (!i || !R.ownerInviteOk(i, email)) return null;
  const now = Date.now();
  // used once: whoever gets here first with it
  const took = await env.DB.prepare('UPDATE owner_invites SET used_by = ?, used_at = ? WHERE id = ? AND used_at IS NULL AND cancelled_at IS NULL AND exp > ?').bind(email, now, i.id, now).run();
  if (!took.meta.changes) return null;
  const household = R.newHousehold(uid() + uid()), clean = R.cleanName(name);
  const made = await env.DB.prepare("INSERT INTO members (email, name, household, role, created_at) VALUES (?, ?, ?, 'member', ?) ON CONFLICT(email) DO NOTHING")
    .bind(email, clean, household, now).run();
  if (!made.meta.changes) {                                // someone made this member in the meantime: the invitation stays open
    await env.DB.prepare('UPDATE owner_invites SET used_by = NULL, used_at = NULL WHERE id = ? AND used_by = ?').bind(i.id, email).run();
    return null;
  }
  await startTrial(env, email);
  // the owner who made it hears, for them alone
  await env.DB.prepare('INSERT INTO admin_messages (id, text, level, link, by_email, created_at, ends_at, active, to_email) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
    .bind(uid(), `${clean || i.name} הצטרף/ה לאוהל מההזמנה שלך.`, 'info', '/admin/#invites', 'system', now, now + 14 * 864e5, i.created_by).run();
  return { email, name: clean, household, role: 'member' };
}
