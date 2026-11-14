// Group chats (vision batch 27): a named conversation of up to 20 people, made by one of them from the people they may
// write to (the household, the joined trees, friends). Privacy, enforced here:
//   * only the group's members read it; to anyone else it does not exist (404);
//   * the page never gets an email: a member is a name, and "mine" or not;
//   * a child under 12 is in a group only when everyone else in it is family to that child (friends-rules groupMembers);
//   * leaving is always possible; the back door gets counts only.

import { Ctx, HttpError, Member, body, json, requireUser, uid } from './core';
import { rateLimit } from './vault';
import { tribe } from './vault/kin';
import { childOf } from './members';
import * as D from './dm-rules';
import * as F from './friends-rules';
import { blocks, check, member, resolve } from './dm';

type Group = { id: string; name: string; maker: string; created_at: number; last_at: number | null; last_by: string | null };
type Row = { email: string; name: string | null; he_name: string | null; household: string };

async function familyCheck(ctx: Ctx) {
  const { results } = await ctx.env.DB.prepare("SELECT house_a, person_a, house_b, person_b FROM family_bridges WHERE status = 'confirmed'")
    .all<{ house_a: string; person_a: string; house_b: string; person_b: string }>();
  const cache = new Map<string, Set<string>>();
  const t = (h: string) => { if (!cache.has(h)) cache.set(h, tribe(h, results)); return cache.get(h)!; };
  return (hx: string, hy: string) => hx === hy || t(hx).has(hy);
}

/** The creation rule again on every read and write (friends-rules staleGroup): I am reachable from the maker (or, the maker
    gone, from a remaining member), blocks between me and a member, a child only among family. Light: one query for the
    members and one for the blocks; a `check` only for the maker (several only when the maker has left); `childOf` and
    the family bridges only when the group has more than me. Throws 404 if I am out. */
async function prune(ctx: Ctx, u: Member, g: Group) {
  const me = u.email.toLowerCase();
  const ms = (await membersOf(ctx, g.id)).map((m) => m.email);
  const others = ms.filter((e) => e !== me);
  if (!others.length) return;
  const marks = others.map((_, k) => '?' + (k + 2)).join(',');
  const { results: bl } = await ctx.env.DB.prepare(`SELECT blocker, blocked FROM dm_blocks WHERE (blocker = ?1 AND blocked IN (${marks})) OR (blocked = ?1 AND blocker IN (${marks}))`)
    .bind(me, ...others).all<{ blocker: string; blocked: string }>();
  const reach = async (e: string) => { try { await check(ctx, u, await member(ctx, e)); return true; } catch { return false; } };
  const maker = g.maker.toLowerCase();
  let reachMaker = true, reachAny = true;
  if (maker !== me && ms.includes(maker)) reachMaker = await reach(maker);
  else if (maker !== me) { reachAny = false; for (const e of others) if (await reach(e)) { reachAny = true; break; } }
  const fam = await familyCheck(ctx);
  const house = new Map<string, string>();
  const kids = new Set<string>();
  for (const e of ms) { const m = await member(ctx, e); house.set(e, m?.household || '?' + e); if (m && (await childOf(ctx.env, e))) kids.add(e); }
  const r = F.staleGroup({ me, maker, members: ms, blocks: bl, reachMaker, reachAny, child: (e) => kids.has(e), familyOf: (x, y) => fam(house.get(x) || '?x', house.get(y) || '?y') });
  for (const e of r.drop) await ctx.env.DB.prepare('DELETE FROM dm_group_members WHERE grp = ? AND email = ?').bind(g.id, e).run();
  if (r.leave) { await ctx.env.DB.prepare('DELETE FROM dm_group_members WHERE grp = ? AND email = ?').bind(g.id, me).run(); throw new HttpError(404, 'not_found'); }
}

/** the group, if I am in it; else 404 as if there were none */
async function groupFor(ctx: Ctx, me: string) {
  const id = String(ctx.params.id || '').slice(0, 40);
  const g = await ctx.env.DB.prepare('SELECT g.*, m.seen AS seen FROM dm_groups g JOIN dm_group_members m ON m.grp = g.id AND m.email = ? WHERE g.id = ?')
    .bind(me, id).first<Group & { seen: number | null }>();
  if (!g) throw new HttpError(404, 'not_found');
  return g;
}

async function membersOf(ctx: Ctx, grp: string) {
  const { results } = await ctx.env.DB.prepare('SELECT mm.email, m.name, m.he_name FROM dm_group_members mm LEFT JOIN members m ON lower(m.email) = mm.email WHERE mm.grp = ? ORDER BY mm.joined_at')
    .bind(grp).all<{ email: string; name: string | null; he_name: string | null }>();
  return results;
}

const unread = (g: { last_at: number | null; last_by: string | null; seen: number | null }, me: string) =>
  !!g.last_at && !!g.last_by && g.last_by !== me && (!g.seen || g.seen < g.last_at);

/** GET /api/groups: my groups, newest first, each with up to 3 first names for the avatars and how many more */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const { results } = await ctx.env.DB.prepare('SELECT g.*, m.seen AS seen FROM dm_groups g JOIN dm_group_members m ON m.grp = g.id AND m.email = ? ORDER BY COALESCE(g.last_at, g.created_at) DESC LIMIT 100')
    .bind(me).all<Group & { seen: number | null }>();
  const groups = await Promise.all(results.map(async (g) => {
    const ms = (await membersOf(ctx, g.id)).filter((m) => m.email !== me);
    const last = await ctx.env.DB.prepare('SELECT * FROM dm_group_messages WHERE grp = ? ORDER BY at DESC LIMIT 1').bind(g.id).first<{ sender: string; text: string; at: number }>();
    return {
      id: g.id, name: g.name, count: ms.length + 1, unread: unread(g, me), at: g.last_at || g.created_at,
      faces: ms.slice(0, 3).map((m, i) => { const n = D.nameOf(m); return { ini: F.initials(n), c: F.hue(g.id + i) }; }),
      more: Math.max(0, ms.length - 3),
      last: last ? { text: D.preview(last.text), at: last.at, mine: last.sender === me } : null,
    };
  }));
  return json({ groups });
}

/** POST /api/groups {name, people: [contact ids from /api/dm/people]}: a new group, with me in it */
export async function create(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const b = await body<{ name?: string; people?: unknown[] }>(ctx.req);
  const name = F.groupName(b.name);
  const ids = [...new Set((Array.isArray(b.people) ? b.people : []).map((x) => String(x).slice(0, 80)))].slice(0, F.GROUP_MAX);
  await rateLimit(ctx, 'group:' + me, F.RATE.group.max, F.RATE.group.windowMs);
  const picked: { email: string; reachable: boolean; child: boolean; household: string }[] = [];
  for (const id of ids) {
    let row: Row | null = null, reachable = true;
    try { row = await resolve(ctx, u, id); await check(ctx, u, row); } catch { reachable = false; }
    picked.push({ email: row?.email.toLowerCase() || id, reachable: reachable && !!row, child: row ? await childOf(ctx.env, row.email) : false, household: row?.household || '' });
  }
  const fam = await familyCheck(ctx);
  const house = new Map([[me, u.household], ...picked.map((p) => [p.email, p.household] as [string, string])]);
  const r = F.groupMembers(me, picked, (x, y) => fam(house.get(x) || '?x', house.get(y) || '?y'));
  if (!r.ok) throw new HttpError(r.why === 'child' ? 403 : 400, r.why === 'child' ? 'child' : r.why);
  const id = uid() + uid(), now = Date.now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO dm_groups (id, name, maker, created_at) VALUES (?, ?, ?, ?)').bind(id, name, me, now),
    ...r.emails.map((e) => ctx.env.DB.prepare('INSERT INTO dm_group_members (grp, email, joined_at, seen) VALUES (?, ?, ?, ?)').bind(id, e, now, e === me ? now : null)),
  ]);
  return json({ id, name });
}

/** GET /api/groups/:id?after=: the messages (each with its sender's name, never an email); opening it marks it read */
export async function thread(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const g = await groupFor(ctx, me);
  await prune(ctx, u, g);
  const after = Number(ctx.url.searchParams.get('after')) || 0;
  const [{ results }, ms] = await Promise.all([
    ctx.env.DB.prepare('SELECT * FROM dm_group_messages WHERE grp = ? AND at > ? ORDER BY at DESC LIMIT ?').bind(g.id, after, D.PAGE).all<{ id: string; sender: string; text: string; at: number }>(),
    membersOf(ctx, g.id),
  ]);
  if (unread(g, me)) await ctx.env.DB.prepare('UPDATE dm_group_members SET seen = ? WHERE grp = ? AND email = ?').bind(Date.now(), g.id, me).run();
  const names = new Map(ms.map((m) => [m.email, D.nameOf(m)]));
  // a sender's colour is by their place in the group, so it never carries their email
  const place = new Map(ms.map((m, i) => [m.email, i]));
  return json({
    id: g.id, name: g.name, count: ms.length, canSend: true,
    members: ms.map((m) => D.nameOf(m)),
    messages: results.reverse().map((m) => m.sender === me
      ? { id: m.id, mine: true, text: m.text, at: m.at }
      : { id: m.id, mine: false, text: m.text, at: m.at, who: names.get(m.sender) || 'מי שעזב/ה', c: F.hue(g.id + (place.get(m.sender) ?? 'x')) }),
  });
}

/** POST /api/groups/:id {text}: send to the group */
export async function send(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const g = await groupFor(ctx, me);
  await prune(ctx, u, g);
  const text = D.cleanText((await body<{ text?: string }>(ctx.req)).text);
  await rateLimit(ctx, 'dm:' + me, D.RATE.send.max, D.RATE.send.windowMs);
  await rateLimit(ctx, 'dmday:' + me, D.RATE.sendDay.max, D.RATE.sendDay.windowMs);
  const id = uid() + uid(), now = Date.now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO dm_group_messages (id, grp, sender, text, at) VALUES (?, ?, ?, ?, ?)').bind(id, g.id, me, text, now),
    ctx.env.DB.prepare('UPDATE dm_groups SET last_at = ?, last_by = ? WHERE id = ?').bind(now, me, g.id),
    ctx.env.DB.prepare('UPDATE dm_group_members SET seen = ? WHERE grp = ? AND email = ?').bind(now, g.id, me),
  ]);
  return json({ message: { id, mine: true, text, at: now } });
}

/** DELETE /api/groups/:id: leave the group (the last one out ends it) */
export async function leave(ctx: Ctx) {
  const u = requireUser(ctx), me = u.email.toLowerCase();
  const g = await groupFor(ctx, me);
  await ctx.env.DB.prepare('DELETE FROM dm_group_members WHERE grp = ? AND email = ?').bind(g.id, me).run();
  const left = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM dm_group_members WHERE grp = ?').bind(g.id).first<{ n: number }>();
  if (!left?.n) await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM dm_group_messages WHERE grp = ?').bind(g.id),
    ctx.env.DB.prepare('DELETE FROM dm_groups WHERE id = ?').bind(g.id),
  ]);
  return json({ ok: true });
}

/** for the unread dot: how many of my groups wait */
export async function unreadCount(ctx: Ctx, me: string): Promise<number> {
  const r = await ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM dm_groups g JOIN dm_group_members m ON m.grp = g.id AND m.email = ?1
    WHERE g.last_by IS NOT NULL AND g.last_by <> ?1 AND (m.seen IS NULL OR m.seen < g.last_at)`).bind(me).first<{ n: number }>();
  return r?.n || 0;
}
