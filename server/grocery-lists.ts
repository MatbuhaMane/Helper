// Named grocery lists (the owner, 2026-11-14). The household's main list is still the items with no list (list IS NULL):
// the daemon, the fridge and the recipes add to it as before. Beside it, anyone can open a named list ("שבת", "מסיבה").
// Every list is shared with the household; only the one who opened it, or a household admin (the owner, or a head of
// the household in family_roles), may delete it. A delete is soft, so the page's undo can bring it back.

import { z } from 'zod';
import { Ctx, Env, HttpError, body, json, requireUser, uid } from './core';
import { normalizeName } from './kitchen';

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

/* ---------------- saved lists: templates and the archive (the owner, 2026-11-14) ----------------
   A template ("קניות שבועיות", "שבת") or a finished list in the archive is a grocery_lists row of kind 'template' or
   'archive'; its items are ordinary grocery_items rows with list = its id, so they sync to every device like the rest
   and never touch the main list (currentGroceries reads list IS NULL). */

const MAX_COPY = 300, KEEP_ARCHIVE = 30;
type Who = { email: string; household: string };
type Copy = { name: string; cat: string; qty: number };

/** the list a save or a use starts from: 'main' (the household's main list) or a live list of this household */
async function liveList(env: Env, household: string, id: string, kinds: string[]): Promise<{ id: string | null; name: string; kind: string }> {
  if (id === 'main') return { id: null, name: 'הרשימה', kind: 'list' };
  const l = await env.DB.prepare('SELECT id, name, kind FROM grocery_lists WHERE household = ? AND id = ? AND deleted = 0')
    .bind(household, id).first<{ id: string; name: string; kind: string }>();
  if (!l || !kinds.includes(l.kind)) throw new HttpError(404, 'No such list');
  return l;
}

async function itemsOf(env: Env, household: string, list: string | null, checkedOnly = false) {
  const where = (list ? 'list = ?' : 'list IS NULL') + (checkedOnly ? ' AND checked = 1' : '');
  const { results } = await env.DB.prepare(
    `SELECT id, name, cat, qty, checked FROM grocery_items WHERE household = ? AND deleted = 0 AND ${where} ORDER BY updated_at LIMIT ${MAX_COPY}`,
  ).bind(...(list ? [household, list] : [household])).all<{ id: string; name: string; cat: string; qty: number; checked: number }>();
  return results;
}

async function addList(env: Env, u: Who, name: string, kind: string) {
  const id = uid(), now = Date.now();
  await env.DB.prepare('INSERT INTO grocery_lists (household, id, name, kind, owner, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)')
    .bind(u.household, id, name, kind, u.email, now, now).run();
  return { id, name, kind, mine: true, canDelete: true, createdAt: now };
}

async function countKind(env: Env, household: string, kind: string) {
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM grocery_lists WHERE household = ? AND deleted = 0 AND kind = ?').bind(household, kind).first<{ n: number }>();
  return n?.n || 0;
}

const copyStmt = (env: Env, u: Who, to: string | null, at: number, i: Copy, checked = 0) =>
  env.DB.prepare('INSERT INTO grocery_items (household, id, name, cat, checked, qty, src, updated_at, updated_by, deleted, list) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?)')
    .bind(u.household, uid(), i.name, i.cat, checked, i.qty || 1, at, u.email, to);

const SaveBody = z.object({ kind: z.enum(['template', 'archive']), name: z.string().trim().min(1).max(40).optional() });

/** POST /api/groceries/lists/:id/save – :id is a named list or 'main'.
 *  template: a copy of the list's items under a name (the list itself stays as it is).
 *  archive ("סיום"): a named list moves to the archive whole; on the main list the checked (bought) items move into a new
 *  archive entry and leave the list. The archive keeps the last 30. Any member may do either: "use" brings it back. */
export async function saveList(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = SaveBody.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid save');
  const env = ctx.env, src = await liveList(env, u.household, ctx.params.id, ['list']);
  const date = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' });
  let list: { id: string; name: string; kind: string }, moved = 0;
  if (p.data.kind === 'template') {
    if ((await countKind(env, u.household, 'template')) >= 50) throw new HttpError(400, 'Too many templates');
    const items = await itemsOf(env, u.household, src.id);
    if (!items.length) throw new HttpError(400, 'The list is empty');
    const t = await addList(env, u, p.data.name || src.name, 'template');
    let at = Date.now();
    await env.DB.batch(items.map((i) => copyStmt(env, u, t.id, at++, i)));
    list = t; moved = items.length;
  } else if (src.id) {
    const name = `${src.name} · ${date}`.slice(0, 60);
    await env.DB.prepare("UPDATE grocery_lists SET kind = 'archive', name = ?, updated_at = ? WHERE household = ? AND id = ?")
      .bind(name, Date.now(), u.household, src.id).run();
    list = { id: src.id, name, kind: 'archive' };
  } else {
    const items = await itemsOf(env, u.household, null, true);
    if (!items.length) throw new HttpError(400, 'Nothing is checked');
    const a = await addList(env, u, p.data.name || `קניות · ${date}`, 'archive');
    let at = Date.now();
    await env.DB.batch(items.flatMap((i) => [
      copyStmt(env, u, a.id, at++, i, 1),
      env.DB.prepare('UPDATE grocery_items SET deleted = 1, updated_at = ?, updated_by = ? WHERE household = ? AND id = ?').bind(at++, u.email, u.household, i.id),
    ]));
    list = a; moved = items.length;
  }
  if (p.data.kind === 'archive') {   // keep the archive short: the oldest beyond 30 are dropped (soft)
    await env.DB.prepare(`UPDATE grocery_lists SET deleted = 1, updated_at = ? WHERE household = ? AND kind = 'archive' AND deleted = 0 AND id NOT IN
      (SELECT id FROM grocery_lists WHERE household = ? AND kind = 'archive' AND deleted = 0 ORDER BY updated_at DESC LIMIT ${KEEP_ARCHIVE})`)
      .bind(Date.now(), u.household, u.household).run();
  }
  return json({ list, moved });
}

const UseBody = z.object({ into: z.string().min(1).max(40) });   // 'new', 'main', or a named list's id

/** POST /api/groceries/lists/:id/use – copy a template's or an archived list's items, unchecked, into a new list (named
 *  after it), the main list or a named list; a name already waiting on the target list is skipped, not doubled. */
export async function useList(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = UseBody.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid use');
  const env = ctx.env, src = await liveList(env, u.household, ctx.params.id, ['template', 'archive']);
  const items = await itemsOf(env, u.household, src.id);
  let list = null, to: string | null;
  if (p.data.into === 'new') {
    if ((await countKind(env, u.household, 'list')) >= 50) throw new HttpError(400, 'Too many lists');
    list = await addList(env, u, src.name.replace(/ · [\d.]+$/, ''), 'list');
    to = list.id;
  } else {
    to = (await liveList(env, u.household, p.data.into, ['list'])).id;
  }
  const have = new Set((await itemsOf(env, u.household, to)).filter((i) => !i.checked).map((i) => normalizeName(i.name)));
  const add = items.filter((i) => { const k = normalizeName(i.name); if (have.has(k)) return false; have.add(k); return true; });
  let at = Date.now();
  if (add.length) await env.DB.batch(add.map((i) => copyStmt(env, u, to, at++, i)));
  return json({ list, into: to, added: add.length, skipped: items.length - add.length });
}
