// Friends, "the family you choose" (vision batch 27): requests in the app, a one-time link, accept, decline, end.
// The rules are in server/friends-rules.ts (tests: server/test-friends.mjs). Privacy, enforced here:
//   * the page never gets an email: a friend, a request and the talk button go by opaque ids ('f' + a fingerprint);
//   * a request to an address answers the same whether or not anyone has it, so the tent cannot be probed;
//   * the link holds a random token; only its fingerprint is stored, it works once and ends after 7 days;
//   * "also family" shows only for a friend whose household is already in my tribe (what the tree shows me anyway).

import { Ctx, HttpError, Member, body, json, requireUser } from './core';
import { rateLimit } from './vault';
import { fingerprint } from './vault/crypto';
import { childOf } from './members';
import * as F from './friends-rules';
import { member, myTribe } from './dm';
import { nameOf } from './dm-rules';

type Row = { email: string; name: string | null; he_name: string | null; household: string };

/** the opaque id of a friend (or a request), for this viewer only */
export const friendId = (ctx: Ctx, me: string, other: string) => fingerprint(ctx.env, `fr:${me.toLowerCase()}:${other.toLowerCase()}`).then((f) => 'f' + f);

/** my rows (accepted, and requests either way), each with its opaque id */
async function rowsOf(ctx: Ctx, me: string) {
  const { results } = await ctx.env.DB.prepare('SELECT * FROM friends WHERE a = ?1 OR b = ?1').bind(me).all<F.Row>();
  return Promise.all(results.map(async (r) => ({ r, other: F.otherOf(r, me), id: await friendId(ctx, me, F.otherOf(r, me)) })));
}

/** are these two friends now (both sides approved)? */
export async function areFriends(ctx: Ctx, x: string, y: string): Promise<boolean> {
  const [a, b] = F.pair(x, y);
  const r = await ctx.env.DB.prepare("SELECT 1 AS ok FROM friends WHERE a = ? AND b = ? AND status = 'accepted'").bind(a, b).first();
  return !!r;
}

/** the emails of my accepted friends */
export async function friendEmails(ctx: Ctx, me: string): Promise<string[]> {
  const { results } = await ctx.env.DB.prepare("SELECT a, b FROM friends WHERE (a = ?1 OR b = ?1) AND status = 'accepted'").bind(me.toLowerCase()).all<{ a: string; b: string }>();
  return results.map((r) => (r.a === me.toLowerCase() ? r.b : r.a));
}

/** the member behind a friend id, if we are friends now; else null */
export async function friendById(ctx: Ctx, u: Member, id: string): Promise<Row | null> {
  const me = u.email.toLowerCase();
  for (const x of await rowsOf(ctx, me)) if (x.id === id && x.r.status === 'accepted') return member(ctx, x.other);
  return null;
}

async function who(ctx: Ctx, u: Member, other: Row | null, tribe?: Set<string>): Promise<{ me: F.Who; them: F.Who | null }> {
  const me: F.Who = { email: u.email.toLowerCase(), child: await childOf(ctx.env, u.email), family: true };
  if (!other) return { me, them: null };
  const t = tribe || (await myTribe(ctx, u));
  const family = other.household === u.household || t.has(other.household);
  return { me, them: { email: other.email.toLowerCase(), child: await childOf(ctx.env, other.email), family } };
}

const card = (id: string, m: Row | null, extra: Record<string, unknown> = {}) => {
  const name = nameOf(m);
  return { id, name, ini: F.initials(name), c: F.hue(id), ...extra };
};

/** GET /api/friends: my friends, the requests to me and from me, and the link I may share */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const rows = await rowsOf(ctx, me);
  const tribe = await myTribe(ctx, u);
  const members = new Map<string, Row>();
  if (rows.length) {
    const marks = rows.map(() => '?').join(', ');
    const { results } = await ctx.env.DB.prepare(`SELECT email, name, he_name, household FROM members WHERE lower(email) IN (${marks})`).bind(...rows.map((x) => x.other)).all<Row>();
    for (const m of results) members.set(m.email.toLowerCase(), m);
  }
  const friends = [], incoming = [], outgoing = [], found = [];
  const week = Date.now() - 7 * 864e5;
  for (const x of rows) {
    const m = members.get(x.other) || null;
    if (!m) continue;                                                  // a member who left: nothing to show
    const kin = m.household === u.household || tribe.has(m.household);
    const s = F.stateFor(x.r, me);
    if (s === 'friends') {
      friends.push(card(x.id, m, { kin, since: x.r.accepted_at }));
      if (kin && (x.r.accepted_at || 0) > week) found.push(card(x.id, m));
    } else if (s === 'in') incoming.push(card(x.id, m, { at: x.r.created_at }));
    else if (s === 'out') outgoing.push(card(x.id, m, { at: x.r.created_at }));
  }
  const byName = (p: { name: string }, q: { name: string }) => p.name.localeCompare(q.name, 'he');
  return json({ friends: friends.sort(byName), incoming, outgoing, found, child: await childOf(ctx.env, u.email) });
}

/** POST /api/friends {email}: ask to be friends. The answer is the same whether or not anyone has that address */
export async function request(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  await rateLimit(ctx, 'frreq:' + me, F.RATE.request.max, F.RATE.request.windowMs);
  const email = F.emailOf((await body<{ email?: string }>(ctx.req)).email);
  if (!email) throw new HttpError(400, 'bad_email');
  const other = await member(ctx, email);
  const { me: w, them } = await who(ctx, u, other);
  const [a, b] = F.pair(me, email);
  const r = await ctx.env.DB.prepare('SELECT * FROM friends WHERE a = ? AND b = ?').bind(a, b).first<F.Row>();
  const step = F.onRequest(r, w, them);
  const now = Date.now();
  if (step === 'insert') await ctx.env.DB.prepare("INSERT INTO friends (a, b, asker, status, created_at) VALUES (?, ?, ?, 'pending', ?) ON CONFLICT(a, b) DO NOTHING").bind(a, b, me, now).run();
  if (step === 'accept') await ctx.env.DB.prepare("UPDATE friends SET status = 'accepted', accepted_at = ? WHERE a = ? AND b = ? AND status = 'pending'").bind(now, a, b).run();
  return json({ ok: true });
}

/** the row behind an id in the path, if I am one of its sides; else 404 */
async function rowFor(ctx: Ctx, me: string) {
  const id = String(ctx.params.id || '').slice(0, 40);
  const x = (await rowsOf(ctx, me)).find((y) => y.id === id);
  if (!x) throw new HttpError(404, 'not_found');
  return x;
}

/** POST /api/friends/:id/accept: accept a request made to me */
export async function accept(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const x = await rowFor(ctx, me);
  if (F.stateFor(x.r, me) !== 'in') throw new HttpError(409, 'not_a_request');
  const { me: w, them } = await who(ctx, u, await member(ctx, x.other));
  if (!them || !F.mayBefriend(w, them)) throw new HttpError(403, 'not_allowed');
  await ctx.env.DB.prepare("UPDATE friends SET status = 'accepted', accepted_at = ? WHERE a = ? AND b = ?").bind(Date.now(), x.r.a, x.r.b).run();
  return json({ ok: true });
}

/** DELETE /api/friends/:id: decline a request, take mine back, or end a friendship (for both sides) */
export async function remove(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const x = await rowFor(ctx, me);
  await ctx.env.DB.prepare('DELETE FROM friends WHERE a = ? AND b = ?').bind(x.r.a, x.r.b).run();
  return json({ ok: true });
}

/* ---------------- the link ---------------- */

const newToken = () => { const b = crypto.getRandomValues(new Uint8Array(24)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const linkKey = (ctx: Ctx, token: string) => fingerprint(ctx.env, 'frlink:' + token);

/** POST /api/friends/link: a new link to share (my earlier unused links end) */
export async function link(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  if (await childOf(ctx.env, u.email)) throw new HttpError(403, 'child');
  await rateLimit(ctx, 'frlink:' + me, F.RATE.link.max, F.RATE.link.windowMs);
  const token = newToken(), now = Date.now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM friend_links WHERE owner = ? AND used_by IS NULL').bind(me),
    ctx.env.DB.prepare('INSERT INTO friend_links (token, owner, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await linkKey(ctx, token), me, now, F.expiresAt(now)),
  ]);
  return json({ url: `${ctx.url.origin}/family/friends/#i=${token}`, expires: F.expiresAt(now) });
}

async function linkFor(ctx: Ctx) {
  const token = String(ctx.params.token || '');
  if (!F.tokenOk(token)) return null;
  return ctx.env.DB.prepare('SELECT * FROM friend_links WHERE token = ?').bind(await linkKey(ctx, token)).first<F.Link>();
}

/** GET /api/friends/link/:token: who sent it (the name only), or that it is gone */
export async function linkPeek(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  await rateLimit(ctx, 'fropen:' + me, F.RATE.open.max, F.RATE.open.windowMs);
  const l = await linkFor(ctx);
  const state = F.linkState(l, me, Date.now());
  if (state !== 'ok') return json({ state });
  const owner = await member(ctx, l!.owner);
  if (!owner) return json({ state: 'gone' });
  const { me: w, them } = await who(ctx, u, owner);
  if (!them || !F.mayBefriend(w, them)) return json({ state: 'child' });
  return json({ state, name: nameOf(owner) });
}

/** POST /api/friends/link/:token: accept the link; we are friends now, and the link is used */
export async function linkAccept(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  await rateLimit(ctx, 'fropen:' + me, F.RATE.open.max, F.RATE.open.windowMs);
  const l = await linkFor(ctx);
  if (F.linkState(l, me, Date.now()) !== 'ok') throw new HttpError(410, 'gone');
  const owner = await member(ctx, l!.owner);
  if (!owner) throw new HttpError(410, 'gone');
  const { me: w, them } = await who(ctx, u, owner);
  if (!them || !F.mayBefriend(w, them)) throw new HttpError(403, 'not_allowed');
  const used = await ctx.env.DB.prepare('UPDATE friend_links SET used_by = ? WHERE token = ? AND used_by IS NULL').bind(me, l!.token).run();
  if (!used.meta?.changes) throw new HttpError(410, 'gone');           // someone else used it a moment ago
  const [a, b] = F.pair(me, owner.email), now = Date.now();
  await ctx.env.DB.prepare(`INSERT INTO friends (a, b, asker, status, created_at, accepted_at) VALUES (?, ?, ?, 'accepted', ?, ?)
    ON CONFLICT(a, b) DO UPDATE SET status = 'accepted', accepted_at = excluded.accepted_at`).bind(a, b, owner.email.toLowerCase(), now, now).run();
  return json({ ok: true, name: nameOf(owner), id: await friendId(ctx, me, owner.email) });
}
