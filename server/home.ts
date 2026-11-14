// תחזוקת הבית (docs/vision/later.md; H.FUTURE 'home'): the household's things that need regular care (the air
// conditioner's filter, the boiler, the smoke detector…), when each was last done, when it is due, and a warranty date.
// Shared by the whole household. Every query is limited to the signed-in member's household. The rules are in home-rules.ts.
// Later (the spec): a warranty date from a photo of the receipt, a reminder by push, and the link to the garage.

import { Ctx, HttpError, body, json, requireUser, uid } from './core';
import { PRESETS, RuleError, clean, sortItems } from './home-rules';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const MAX_ITEMS = 200;

const rule = <T>(f: () => T): T => {
  try { return f(); } catch (e) { if (e instanceof RuleError) throw new HttpError(400, e.code); throw e; }
};

/** GET /api/home → { items (sorted, with due and warranty), presets, log (the last 30 times something was done), today } */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const db = ctx.env.DB;
  const [items, log] = await Promise.all([
    db.prepare('SELECT id, name, kind, every_days, last_done, warranty_until, note FROM home_items WHERE household = ?').bind(u.household).all(),
    db.prepare(`SELECT l.item, l.done_on, l.at, COALESCE(m.he_name, m.name) AS who FROM home_log l LEFT JOIN members m ON m.email = l.by_email
                WHERE l.household = ? ORDER BY l.at DESC LIMIT 30`).bind(u.household).all(),
  ]);
  const t = today();
  return json({ items: sortItems(items.results as any[], t), presets: PRESETS, log: log.results, today: t });
}

/** POST /api/home (new) and PUT /api/home/:id (change) */
export async function save(ctx: Ctx) {
  const u = requireUser(ctx);
  const input = await body(ctx.req);
  const t = today();
  const it = rule(() => clean(input, t));
  const db = ctx.env.DB;
  const now = Date.now();
  if (ctx.params.id) {
    const r = await db.prepare(`UPDATE home_items SET name = ?, kind = ?, every_days = ?, last_done = ?, warranty_until = ?, note = ?, updated_at = ?
                                 WHERE household = ? AND id = ?`)
      .bind(it.name, it.kind, it.every_days, it.last_done, it.warranty_until, it.note, now, u.household, ctx.params.id).run();
    if (!r.meta.changes) throw new HttpError(404, 'not_found');
    return json({ id: ctx.params.id });
  }
  const n = await db.prepare('SELECT COUNT(*) AS n FROM home_items WHERE household = ?').bind(u.household).first<{ n: number }>();
  if ((n?.n || 0) >= MAX_ITEMS) throw new HttpError(400, 'too_many');
  const id = uid();
  await db.prepare(`INSERT INTO home_items (household, id, name, kind, every_days, last_done, warranty_until, note, created_by, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(u.household, id, it.name, it.kind, it.every_days, it.last_done, it.warranty_until, it.note, u.email, now, now).run();
  return json({ id });
}

/** POST /api/home/:id/done { date? } → it was done (today, or on the date given, never in the future) */
export async function done(ctx: Ctx) {
  const u = requireUser(ctx);
  const t = today();
  const input = await body<{ date?: string }>(ctx.req).catch(() => ({} as { date?: string }));
  const date = input?.date || t;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > t) throw new HttpError(400, 'bad_date');
  const db = ctx.env.DB;
  const r = await db.prepare('UPDATE home_items SET last_done = ?, updated_at = ? WHERE household = ? AND id = ?')
    .bind(date, Date.now(), u.household, ctx.params.id).run();
  if (!r.meta.changes) throw new HttpError(404, 'not_found');
  await db.prepare('INSERT INTO home_log (household, item, done_on, by_email, at) VALUES (?, ?, ?, ?, ?)')
    .bind(u.household, ctx.params.id, date, u.email, Date.now()).run();
  return json({ ok: true, last_done: date });
}

/** DELETE /api/home/:id (with its log) */
export async function remove(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM home_items WHERE household = ? AND id = ?').bind(u.household, ctx.params.id),
    ctx.env.DB.prepare('DELETE FROM home_log WHERE household = ? AND item = ?').bind(u.household, ctx.params.id),
  ]);
  return json({ ok: true });
}
