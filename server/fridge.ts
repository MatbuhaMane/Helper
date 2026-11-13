// The fridge: one per person (the owner, 2026-11-14), its owner the person's email. Every query is scoped to that email:
// another person's fridge is as if it were not there. A fridge shared by the household comes later ("בקרוב" on the page).
// The other food apps meet it: what ran out goes to the shopping list, what was bought comes in from it, the recipe book
// says what can be cooked from what's there, the automatic list (grocery-auto.ts) and the food portal (food.ts) read it.
//
// Before, every fridge was the household's, and each person could call one of them "המקרר שלי" (the pref fridge.mine).
// On the first visit (myFridge) that fridge becomes theirs; if someone already took it, they get a new one with a copy of
// what was in it. The household's other fridges stay in the database, hidden (owner empty), never deleted.

import { z } from 'zod';
import { Ctx, HttpError, Member, body, json, requireUser, uid } from './core';

/** The person's own fridge, made (or taken over from the old shared ones) on the first visit. */
export async function myFridge(ctx: Ctx, u: Member): Promise<{ id: string; name: string }> {
  const db = ctx.env.DB;
  const find = () => db.prepare('SELECT id, name FROM fridges WHERE owner = ? AND deleted = 0 ORDER BY created_at LIMIT 1').bind(u.email).first<{ id: string; name: string }>();
  const f = await find();
  if (f) return f;
  // the fridge they called theirs before, if it is their household's and no one owns it yet
  const pref = await db.prepare("SELECT data FROM user_prefs WHERE email = ? AND ns = 'fridge'").bind(u.email).first<{ data: string }>();
  let was: string | null = null;
  try { const m = JSON.parse(pref?.data || '{}').mine; was = typeof m === 'string' ? m : null; } catch { /* an old row */ }
  if (was) {
    const took = await db.prepare(`UPDATE fridges SET owner = ? WHERE id = ? AND owner IS NULL AND deleted = 0 AND COALESCE(household, 'family') = ?
      AND NOT EXISTS (SELECT 1 FROM fridges WHERE owner = ? AND deleted = 0)`).bind(u.email, was, u.household, u.email).run();
    if (took.meta.changes) return (await find())!;
  }
  // a new one (one statement: two first visits at once still make one)
  const id = uid();
  const made = await db.prepare(`INSERT INTO fridges (id, name, sort, created_by, created_at, deleted, household, owner)
    SELECT ?, ?, 0, ?, ?, 0, ?, ? WHERE NOT EXISTS (SELECT 1 FROM fridges WHERE owner = ? AND deleted = 0)`)
    .bind(id, 'המקרר שלי', u.email, Date.now(), u.household, u.email, u.email).run();
  if (made.meta.changes && was) {
    // the fridge they called theirs is already someone else's: they keep a copy of what was in it (and its history)
    const src = await db.prepare("SELECT id FROM fridges WHERE id = ? AND deleted = 0 AND COALESCE(household, 'family') = ?").bind(was, u.household).first();
    if (src) await db.prepare(`INSERT OR IGNORE INTO fridge_items (fridge, id, name, cat, qty, unit, expires, note, added_by, updated_at, updated_by, deleted)
      SELECT ?, id, name, cat, qty, unit, expires, note, added_by, updated_at, updated_by, deleted FROM fridge_items WHERE fridge = ?`).bind(id, was).run();
  }
  return (await find())!;
}

/** The person's fridge (a list of one, so the page's shape stays), with how full it is and what is about to go off. */
export async function listFridges(ctx: Ctx) {
  const u = requireUser(ctx);
  const f = await myFridge(ctx, u);
  const soon = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const c = await ctx.env.DB.prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN expires IS NOT NULL AND expires <= ? THEN 1 ELSE 0 END) AS soon FROM fridge_items WHERE deleted = 0 AND fridge = ?')
    .bind(soon, f.id).first<{ n: number; soon: number }>();
  return json({ fridges: [{ id: f.id, name: f.name, count: c?.n || 0, soon: c?.soon || 0 }], mine: f.id });
}

/** More fridges, and deleting the one: not now (a shared fridge is "בקרוב"). */
export async function createFridge(ctx: Ctx): Promise<Response> {
  requireUser(ctx);
  throw new HttpError(409, 'One fridge per person; a shared fridge is coming soon');
}
export async function deleteFridge(ctx: Ctx): Promise<Response> {
  requireUser(ctx);
  throw new HttpError(409, 'One fridge per person; a shared fridge is coming soon');
}

const Name = z.object({ name: z.string().trim().min(1).max(40) });
export async function renameFridge(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = Name.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid name');
  const r = await ctx.env.DB.prepare('UPDATE fridges SET name = ? WHERE id = ? AND owner = ? AND deleted = 0').bind(p.data.name, ctx.params.id, u.email).run();
  if (!r.meta.changes) throw new HttpError(404, 'Not found');
  return json({ ok: true });
}

const Item = z.object({
  id: z.string().min(1).max(40), name: z.string().trim().min(1).max(120), cat: z.string().max(20),
  qty: z.number().min(0).max(999), unit: z.string().max(20).optional().nullable(),
  expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(), note: z.string().max(200).optional().nullable(),
});
const Ops = z.object({ ops: z.array(z.union([z.object({ op: z.literal('upsert'), item: Item }), z.object({ op: z.literal('delete'), id: z.string().min(1).max(40) })])).max(300) });
const toItem = (r: any) => ({ id: r.id, name: r.name, cat: r.cat, qty: r.qty, unit: r.unit, expires: r.expires, note: r.note, addedBy: r.added_by, updatedAt: r.updated_at, updatedBy: r.updated_by, deleted: !!r.deleted });

/** The fridge must be the person's own (anyone else's, or an old shared one, is as if it were not there). */
async function ownFridge(ctx: Ctx, email: string) {
  const f = await ctx.env.DB.prepare('SELECT id FROM fridges WHERE id = ? AND owner = ? AND deleted = 0').bind(ctx.params.id, email).first();
  if (!f) throw new HttpError(404, 'Not found');
}

/** What's in one fridge (since=… : only what changed, deletions included, for the live refresh). */
export async function listItems(ctx: Ctx) {
  const u = requireUser(ctx);
  await ownFridge(ctx, u.email);
  const since = Number(ctx.url.searchParams.get('since') || 0);
  const { results } = since
    ? await ctx.env.DB.prepare('SELECT * FROM fridge_items WHERE fridge = ? AND updated_at > ?').bind(ctx.params.id, since).all()
    : await ctx.env.DB.prepare('SELECT * FROM fridge_items WHERE fridge = ? AND deleted = 0').bind(ctx.params.id).all();
  return json({ items: results.map(toItem), now: Date.now() });
}

export async function applyOps(ctx: Ctx) {
  const u = requireUser(ctx);
  await ownFridge(ctx, u.email);
  const p = Ops.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid ops');
  const db = ctx.env.DB, fridge = ctx.params.id;
  let t = Date.now();
  const stmts = p.data.ops.map((o) => {
    const at = t++;
    if (o.op === 'delete') return db.prepare('UPDATE fridge_items SET deleted = 1, updated_at = ?, updated_by = ? WHERE fridge = ? AND id = ?').bind(at, u.email, fridge, o.id);
    const i = o.item;
    return db.prepare(
      `INSERT INTO fridge_items (fridge, id, name, cat, qty, unit, expires, note, added_by, updated_at, updated_by, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(fridge, id) DO UPDATE SET name = excluded.name, cat = excluded.cat, qty = excluded.qty, unit = excluded.unit,
         expires = excluded.expires, note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted = 0`,
    ).bind(fridge, i.id, i.name, i.cat, i.qty, i.unit || null, i.expires || null, i.note || null, u.email, at, u.email);
  });
  if (stmts.length) await db.batch(stmts);
  return json({ ok: true, now: t });
}

/** What this fridge usually has: every name that was ever in it, how many times it came in, whether it's there now,
    and when it was last there – so "my fridge" can say what to restock. */
export async function history(ctx: Ctx) {
  const u = requireUser(ctx);
  await ownFridge(ctx, u.email);
  const { results } = await ctx.env.DB.prepare(
    `SELECT name, COUNT(*) AS times, MAX(updated_at) AS last, SUM(CASE WHEN deleted = 0 THEN 1 ELSE 0 END) AS here,
            SUM(CASE WHEN deleted = 0 THEN qty ELSE 0 END) AS qty, MAX(cat) AS cat
     FROM fridge_items WHERE fridge = ? GROUP BY name ORDER BY times DESC, last DESC LIMIT 200`,
  ).bind(ctx.params.id).all();
  return json({ names: results });
}
