// The fridge: what's inside each of the family's fridges (הבית בהר, שילה, קרן היסוד…). Every fridge is shared: every
// member sees and edits all of them, and a change shows on everyone's screen within moments (the page polls with "since").
// The other food apps meet it on the page: what ran out goes to the shopping list, what was bought comes in from it,
// and the recipe book says what can be cooked from what's there.

import { z } from 'zod';
import { Ctx, HttpError, body, json, requireUser, uid } from './core';

const SEED = ['הבית בהר', 'שילה', 'קרן היסוד'];

/** The fridges (the first visit ever creates the family's three). */
export async function listFridges(ctx: Ctx) {
  requireUser(ctx);
  const db = ctx.env.DB;
  let { results } = await db.prepare('SELECT id, name, sort FROM fridges WHERE deleted = 0 ORDER BY sort, created_at').all<{ id: string; name: string; sort: number }>();
  if (!results.length) {
    const any = await db.prepare('SELECT COUNT(*) AS n FROM fridges').first<{ n: number }>();
    if (!any?.n) {
      const now = Date.now();
      await db.batch(SEED.map((name, i) => db.prepare('INSERT INTO fridges (id, name, sort, created_by, created_at, deleted) VALUES (?, ?, ?, ?, ?, 0)').bind(uid(), name, i, 'seed', now + i)));
      ({ results } = await db.prepare('SELECT id, name, sort FROM fridges WHERE deleted = 0 ORDER BY sort, created_at').all());
    }
  }
  // how full each one is, and how much in it is about to go off (in the next two days)
  const soon = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const counts = await db.prepare(`SELECT fridge, COUNT(*) AS n, SUM(CASE WHEN expires IS NOT NULL AND expires <= ? THEN 1 ELSE 0 END) AS soon FROM fridge_items WHERE deleted = 0 GROUP BY fridge`).bind(soon).all<{ fridge: string; n: number; soon: number }>();
  const by = Object.fromEntries(counts.results.map((c) => [c.fridge, c]));
  return json({ fridges: results.map((f) => ({ id: f.id, name: f.name, count: by[f.id]?.n || 0, soon: by[f.id]?.soon || 0 })) });
}

const Name = z.object({ name: z.string().trim().min(1).max(40) });
export async function createFridge(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = Name.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid name');
  const id = uid();
  const max = await ctx.env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM fridges').first<{ m: number }>();
  await ctx.env.DB.prepare('INSERT INTO fridges (id, name, sort, created_by, created_at, deleted) VALUES (?, ?, ?, ?, ?, 0)').bind(id, p.data.name, (max?.m || 0) + 1, u.email, Date.now()).run();
  return json({ fridge: { id, name: p.data.name, count: 0, soon: 0 } });
}
export async function renameFridge(ctx: Ctx) {
  requireUser(ctx);
  const p = Name.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid name');
  await ctx.env.DB.prepare('UPDATE fridges SET name = ? WHERE id = ?').bind(p.data.name, ctx.params.id).run();
  return json({ ok: true });
}
export async function deleteFridge(ctx: Ctx) {
  requireUser(ctx);
  await ctx.env.DB.prepare('UPDATE fridges SET deleted = 1 WHERE id = ?').bind(ctx.params.id).run();
  return json({ ok: true });
}

const Item = z.object({
  id: z.string().min(1).max(40), name: z.string().trim().min(1).max(120), cat: z.string().max(20),
  qty: z.number().min(0).max(999), unit: z.string().max(20).optional().nullable(),
  expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(), note: z.string().max(200).optional().nullable(),
});
const Ops = z.object({ ops: z.array(z.union([z.object({ op: z.literal('upsert'), item: Item }), z.object({ op: z.literal('delete'), id: z.string().min(1).max(40) })])).max(300) });
const toItem = (r: any) => ({ id: r.id, name: r.name, cat: r.cat, qty: r.qty, unit: r.unit, expires: r.expires, note: r.note, addedBy: r.added_by, updatedAt: r.updated_at, updatedBy: r.updated_by, deleted: !!r.deleted });

/** What's in one fridge (since=… : only what changed, deletions included, for the live refresh). */
export async function listItems(ctx: Ctx) {
  requireUser(ctx);
  const since = Number(ctx.url.searchParams.get('since') || 0);
  const { results } = since
    ? await ctx.env.DB.prepare('SELECT * FROM fridge_items WHERE fridge = ? AND updated_at > ?').bind(ctx.params.id, since).all()
    : await ctx.env.DB.prepare('SELECT * FROM fridge_items WHERE fridge = ? AND deleted = 0').bind(ctx.params.id).all();
  return json({ items: results.map(toItem), now: Date.now() });
}

export async function applyOps(ctx: Ctx) {
  const u = requireUser(ctx);
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
  requireUser(ctx);
  const { results } = await ctx.env.DB.prepare(
    `SELECT name, COUNT(*) AS times, MAX(updated_at) AS last, SUM(CASE WHEN deleted = 0 THEN 1 ELSE 0 END) AS here,
            SUM(CASE WHEN deleted = 0 THEN qty ELSE 0 END) AS qty, MAX(cat) AS cat
     FROM fridge_items WHERE fridge = ? GROUP BY name ORDER BY times DESC, last DESC LIMIT 200`,
  ).bind(ctx.params.id).all();
  return json({ names: results });
}
