// Messages between members (הודעות), one on one, text only (v1).
// Who may write to whom: the household, and users in the trees joined by confirmed bridges (server/dm-rules.ts, mayMessage).
// Privacy, enforced here:
//   * only the two sides of a conversation read it; to anyone else (the household, a head, the owner) it does not exist (404);
//   * the page never gets an email: the other side is a name, contacts and conversations go by opaque ids;
//   * the back door (requireAdmin) gets counts only, never a name or a word (stats);
//   * a person can be blocked, both ways; sending and starting are rate-limited per person.
// Finding someone outside the household goes through the forest exactly as the forest search shows it (forestFor), so the
// contact list never shows more than the tree does. Tests: server/test-dm.mjs.

import { Ctx, HttpError, Member, body, json, requireUser, uid } from './core';
import { forestFor, rateLimit } from './vault';
import { fingerprint } from './vault/crypto';
import { tribe } from './vault/kin';
import { requireAdmin } from './admin';
import * as D from './dm-rules';

type Row = { email: string; name: string | null; he_name: string | null; household: string };

const member = (ctx: Ctx, email: string) =>
  ctx.env.DB.prepare('SELECT email, name, he_name, household FROM members WHERE lower(email) = ?').bind(email.toLowerCase()).first<Row>();

async function myTribe(ctx: Ctx, u: Member) {
  const { results } = await ctx.env.DB.prepare("SELECT house_a, person_a, house_b, person_b FROM family_bridges WHERE status = 'confirmed'")
    .all<{ house_a: string; person_a: string; house_b: string; person_b: string }>();
  return tribe(u.household, results);
}

async function blocks(ctx: Ctx, me: string, other: string) {
  const { results } = await ctx.env.DB.prepare('SELECT blocker FROM dm_blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)')
    .bind(me, other, other, me).all<{ blocker: string }>();
  return { iBlocked: results.some((r) => r.blocker === me), theyBlocked: results.some((r) => r.blocker === other) };
}

/** may u write to `other` now (the household, the tribe, no block); throws the reason */
async function check(ctx: Ctx, u: Member, other: Row | null) {
  const me = u.email.toLowerCase();
  if (!other) throw new HttpError(404, 'not_found');
  const t = other.household === u.household ? null : await myTribe(ctx, u);
  const why = D.mayMessage({
    self: other.email.toLowerCase() === me, sameHousehold: other.household === u.household,
    sameTribe: !!t && t.has(other.household), ...(await blocks(ctx, me, other.email.toLowerCase())),
  });
  if (why === 'self') throw new HttpError(400, 'self');
  if (why) throw new HttpError(403, 'cannot_send');
}

/** the conversation, if this person is one of its two sides; else 404 as if there were none */
async function threadFor(ctx: Ctx, u: Member) {
  const t = await ctx.env.DB.prepare('SELECT * FROM dm_threads WHERE id = ?').bind(String(ctx.params.id || '').slice(0, 40)).first<D.Thread>();
  const side = D.sideOf(t, u.email);
  if (!t || !side) throw new HttpError(404, 'not_found');
  return { t, side, other: D.otherOf(t, u.email) };
}

const homeId = (ctx: Ctx, u: Member, email: string) => fingerprint(ctx.env, `dm:${u.email.toLowerCase()}:${email.toLowerCase()}`).then((f) => 'h' + f);

/* ---------------- the list, the unread count, the contacts ---------------- */

/** GET /api/dm: my conversations, newest first, each with the other side's name and a preview */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const { results: ts } = await ctx.env.DB.prepare('SELECT * FROM dm_threads WHERE (a = ? OR b = ?) AND last_at IS NOT NULL ORDER BY last_at DESC LIMIT 200').bind(me, me).all<D.Thread>();
  if (!ts.length) return json({ threads: [], unread: 0 });
  const others = [...new Set(ts.map((t) => D.otherOf(t, me)))], marks = (n: number) => Array(n).fill('?').join(', ');
  const [{ results: ms }, { results: lasts }, { results: bl }] = await Promise.all([
    ctx.env.DB.prepare(`SELECT email, name, he_name FROM members WHERE lower(email) IN (${marks(others.length)})`).bind(...others).all<Row>(),
    ctx.env.DB.prepare(`SELECT m.* FROM dm_messages m JOIN (SELECT thread, MAX(at) AS at FROM dm_messages WHERE thread IN (${marks(ts.length)}) GROUP BY thread) x ON x.thread = m.thread AND x.at = m.at`)
      .bind(...ts.map((t) => t.id)).all<D.Msg>(),
    ctx.env.DB.prepare('SELECT blocked FROM dm_blocks WHERE blocker = ?').bind(me).all<{ blocked: string }>(),
  ]);
  const name = new Map(ms.map((m) => [m.email.toLowerCase(), D.nameOf(m)])), last = new Map(lasts.map((m) => [m.thread, m]));
  const blocked = new Set(bl.map((b) => b.blocked));
  const threads = ts.map((t) => { const o = D.otherOf(t, me); return D.publicThread(t, me, { name: name.get(o) || 'בן משפחה', last: last.get(t.id) || null, iBlocked: blocked.has(o) }); });
  return json({ threads, unread: threads.filter((t) => t.unread).length });
}

/** GET /api/dm/unread: how many conversations wait (the dot on the menu and the user chip) */
export async function unread(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const r = await ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM dm_threads WHERE last_by IS NOT NULL AND last_by <> ?1
    AND ((a = ?1 AND (a_seen IS NULL OR a_seen < last_at)) OR (b = ?1 AND (b_seen IS NULL OR b_seen < last_at)))`).bind(me).first<{ n: number }>();
  return json({ unread: r?.n || 0 });
}

/** GET /api/dm/people: who I may write to – the household, then (on a device the tree is open on) the joined trees' users */
export async function people(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  await rateLimit(ctx, 'dmpeople:' + me, D.RATE.people.max, D.RATE.people.windowMs);
  const { results: home } = await ctx.env.DB.prepare('SELECT email, name, he_name, household FROM members WHERE household = ? AND lower(email) <> ?').bind(u.household, me).all<Row>();
  const homeC: D.Contact[] = await Promise.all(home.map(async (m) => ({ id: await homeId(ctx, u, m.email), name: D.nameOf(m), where: 'home' as const })));
  let tribeC: D.Contact[] = [], forest: 'open' | 'locked' | 'none' = 'none';
  try {
    const w = await forestFor(ctx);
    forest = 'open';
    const seen = new Set<string>();
    for (const x of w.people) {
      const c = { user: w.user(x), self: false, mine: x.household === u.household, anonymous: x.anonymous, hidden: x.hidden };
      if (!D.writable(c) || seen.has(x.root)) continue;
      const email = w.emailOf(x);
      if (!email || email.toLowerCase() === me) continue;
      seen.add(x.root);
      tribeC.push({ id: 'p' + x.pid, name: x.name, where: 'tribe', title: w.title(x.household), relation: w.me && x.root !== w.me ? w.kin.relationName(w.me, x.root) : null });
    }
    const touched = new Set(w.people.filter((x) => tribeC.some((c) => c.id === 'p' + x.pid)).map((x) => x.household));
    if (touched.size) await w.audit(touched, 'view:dm-people');
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    forest = 'locked';                                   // the tree is not open on this device: the household only
  }
  return json({ people: D.contacts(homeC, tribeC), forest });
}

/** the member behind a contact id (as GET /api/dm/people gave it), or null */
async function resolve(ctx: Ctx, u: Member, id: string): Promise<Row | null> {
  if (id.startsWith('h')) {
    const { results } = await ctx.env.DB.prepare('SELECT email, name, he_name, household FROM members WHERE household = ?').bind(u.household).all<Row>();
    for (const m of results) if ((await homeId(ctx, u, m.email)) === id) return m;
    return null;
  }
  if (id.startsWith('p')) {
    const w = await forestFor(ctx);
    const x = w.people.find((p) => p.pid === id.slice(1));
    if (!x || !D.writable({ user: w.user(x), self: false, mine: x.household === u.household, anonymous: x.anonymous, hidden: x.hidden })) return null;
    const email = w.emailOf(x);
    return email ? member(ctx, email) : null;
  }
  return null;
}

/** POST /api/dm/start {to}: the conversation with that contact (made if new); answers its id */
export async function start(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const b = await body<{ to?: string }>(ctx.req);
  const other = await resolve(ctx, u, String(b.to || '').slice(0, 80));
  await check(ctx, u, other);
  const [a, bb] = D.pair(me, other!.email);
  const had = await ctx.env.DB.prepare('SELECT id FROM dm_threads WHERE a = ? AND b = ?').bind(a, bb).first<{ id: string }>();
  if (had) return json({ id: had.id, name: D.nameOf(other) });
  await rateLimit(ctx, 'dmstart:' + me, D.RATE.start.max, D.RATE.start.windowMs);
  const id = uid() + uid();
  await ctx.env.DB.prepare('INSERT INTO dm_threads (id, a, b, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(a, b) DO NOTHING').bind(id, a, bb, Date.now()).run();
  const row = await ctx.env.DB.prepare('SELECT id FROM dm_threads WHERE a = ? AND b = ?').bind(a, bb).first<{ id: string }>();
  return json({ id: row!.id, name: D.nameOf(other) });
}

/* ---------------- one conversation ---------------- */

/** GET /api/dm/:id?after=: its messages (the last PAGE, or only those after `after`); opening it marks it read */
export async function thread(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const { t, side, other } = await threadFor(ctx, u);
  const after = Number(ctx.url.searchParams.get('after')) || 0;
  const { results } = await ctx.env.DB.prepare('SELECT * FROM dm_messages WHERE thread = ? AND at > ? ORDER BY at DESC LIMIT ?').bind(t.id, after, D.PAGE).all<D.Msg>();
  const now = Date.now();
  if (D.unreadFor(t, me)) await ctx.env.DB.prepare(`UPDATE dm_threads SET ${side}_seen = ? WHERE id = ?`).bind(now, t.id).run();
  const [o, bl] = await Promise.all([member(ctx, other), blocks(ctx, me, other)]);
  // may I still write: the same reach rule, quietly (a bridge undone or a block ends the writing, never the reading)
  let canSend = !!o;
  if (o) try { await check(ctx, u, o); } catch { canSend = false; }
  return json({
    id: t.id, name: D.nameOf(o), blocked: bl.iBlocked, canSend,
    messages: results.reverse().map((m) => D.publicMsg(m, me)),
    // when the other side last opened it (for "נקרא"), only as a time
    seenByOther: (side === 'a' ? t.b_seen : t.a_seen) || null,
  });
}

/** POST /api/dm/:id {text}: send a message */
export async function send(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const { t, side, other } = await threadFor(ctx, u);
  const text = D.cleanText((await body<{ text?: string }>(ctx.req)).text);
  await check(ctx, u, await member(ctx, other));
  await rateLimit(ctx, 'dm:' + me, D.RATE.send.max, D.RATE.send.windowMs);
  await rateLimit(ctx, 'dmday:' + me, D.RATE.sendDay.max, D.RATE.sendDay.windowMs);
  const id = uid() + uid(), now = Date.now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO dm_messages (id, thread, sender, text, at) VALUES (?, ?, ?, ?, ?)').bind(id, t.id, me, text, now),
    ctx.env.DB.prepare(`UPDATE dm_threads SET last_at = ?, last_by = ?, ${side}_seen = ? WHERE id = ?`).bind(now, me, now, t.id),
  ]);
  return json({ message: { id, mine: true, text, at: now } });
}

/** POST /api/dm/:id/block · DELETE /api/dm/:id/block: block the other side (neither can write), or undo it */
export async function block(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const { other } = await threadFor(ctx, u);
  if (ctx.req.method === 'DELETE') await ctx.env.DB.prepare('DELETE FROM dm_blocks WHERE blocker = ? AND blocked = ?').bind(me, other).run();
  else await ctx.env.DB.prepare('INSERT INTO dm_blocks (blocker, blocked, at) VALUES (?, ?, ?) ON CONFLICT(blocker, blocked) DO NOTHING').bind(me, other, Date.now()).run();
  return json({ ok: true, blocked: ctx.req.method !== 'DELETE' });
}

/* ---------------- the back door: counts only ---------------- */

/** GET /api/admin/dm-stats: how many conversations and messages, never who or what */
export async function adminStats(ctx: Ctx) {
  await requireAdmin(ctx, 'any');
  const week = Date.now() - 7 * 864e5;
  const [t, m, w, b] = await Promise.all([
    ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM dm_threads WHERE last_at IS NOT NULL').first<{ n: number }>(),
    ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM dm_messages').first<{ n: number }>(),
    ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM dm_messages WHERE at > ?').bind(week).first<{ n: number }>(),
    ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM dm_blocks').first<{ n: number }>(),
  ]);
  return json(D.stats(t?.n || 0, m?.n || 0, w?.n || 0, b?.n || 0));
}
