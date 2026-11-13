// Named grocery lists (the owner, 2026-11-14). The household's main list is still the items with no list (list IS NULL):
// the daemon, the fridge and the recipes add to it as before. Beside it, anyone can open a named list ("שבת", "מסיבה").
// Every list is shared with the household; only the one who opened it, or a household admin (the owner, or a head of
// the household in family_roles), may delete it. A delete is soft, so the page's undo can bring it back.

import { z } from 'zod';
import { Ctx, Env, HttpError, body, json, requireUser, uid } from './core';

export type ListRow = { id: string; name: string; kind: string; owner: string; created_at: number; updated_at: number };

/** a household admin: the site's owner, or a head of this household */
export async function isHouseAdmin(env: Env, u: { email: string; household: string; role: string }) {
  if (u.role === 'owner') return true;
  const r = await env.DB.prepare("SELECT 1 AS y FROM family_roles WHERE household = ? AND email = ? AND role = 'head'").bind(u.household, u.email).first();
  return !!r;
}

/** the household's named lists, each with whether this person may delete it */
export async function householdLists(env: Env, u: { email: string; household: string; role: string }) {
  const { results } = await env.DB.prepare('SELECT id, name, kind, owner, created_at, updated_at FROM grocery_lists WHERE household = ? AND deleted = 0 ORDER BY created_at')
    .bind(u.household).all<ListRow>();
  const admin = results.some((l) => l.owner !== u.email) ? await isHouseAdmin(env, u) : false;
  return results.map((l) => ({ id: l.id, name: l.name, kind: l.kind, mine: l.owner === u.email, canDelete: l.owner === u.email || admin, createdAt: l.created_at }));
}

const NewList = z.object({ name: z.string().trim().min(1).max(40) });

export async function createList(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = NewList.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid list');
  const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM grocery_lists WHERE household = ? AND deleted = 0').bind(u.household).first<{ n: number }>();
  if ((n?.n || 0) >= 50) throw new HttpError(400, 'Too many lists');
  const id = uid(), now = Date.now();
  await ctx.env.DB.prepare("INSERT INTO grocery_lists (household, id, name, kind, owner, created_at, updated_at, deleted) VALUES (?, ?, ?, 'list', ?, ?, ?, 0)")
    .bind(u.household, id, p.data.name, u.email, now, now).run();
  return json({ list: { id, name: p.data.name, kind: 'list', mine: true, canDelete: true, createdAt: now } });
}

/** the list, if this person may delete (or bring back) it; 404 for another household's or a missing list */
async function ownList(ctx: Ctx, deleted: 0 | 1) {
  const u = requireUser(ctx);
  const l = await ctx.env.DB.prepare('SELECT id, owner FROM grocery_lists WHERE household = ? AND id = ? AND deleted = ?')
    .bind(u.household, ctx.params.id, deleted).first<{ id: string; owner: string }>();
  if (!l) throw new HttpError(404, 'No such list');
  if (l.owner !== u.email && !(await isHouseAdmin(ctx.env, u))) throw new HttpError(403, 'Only the list\'s owner or a household admin');
  return u;
}

export async function deleteList(ctx: Ctx) {
  const u = await ownList(ctx, 0);
  await ctx.env.DB.prepare('UPDATE grocery_lists SET deleted = 1, updated_at = ? WHERE household = ? AND id = ?').bind(Date.now(), u.household, ctx.params.id).run();
  return json({ ok: true });
}

export async function restoreList(ctx: Ctx) {
  const u = await ownList(ctx, 1);
  await ctx.env.DB.prepare('UPDATE grocery_lists SET deleted = 0, updated_at = ? WHERE household = ? AND id = ?').bind(Date.now(), u.household, ctx.params.id).run();
  return json({ ok: true });
}
