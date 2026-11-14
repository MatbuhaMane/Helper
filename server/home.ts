// תחזוקת הבית (docs/vision/later.md; H.FUTURE 'home'): the household's things that need regular care (the air
// conditioner's filter, the boiler, the smoke detector…), when each was last done, when it is due, and a warranty date.
// Shared by the whole household. Every query is limited to the signed-in member's household. The rules are in home-rules.ts.
// The reminder (the owner's answer ש7) goes by push, on the morning an item is due, to whoever added it, or to the member it
// was handed to (remind_to). Later (the spec): a warranty date from a photo of the receipt, and the link to the garage.

import { Ctx, Env, HttpError, body, json, requireUser, uid } from './core';
import { PRESETS, RuleError, clean, remindFor, sortItems } from './home-rules';
import { pushTo } from './push';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const MAX_ITEMS = 200;

const rule = <T>(f: () => T): T => {
  try { return f(); } catch (e) { if (e instanceof RuleError) throw new HttpError(400, e.code); throw e; }
};

/** GET /api/home → { items (sorted, with due and warranty), presets, log (the last 30 times something was done), today } */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const db = ctx.env.DB;
  const [items, people, log] = await Promise.all([
    db.prepare('SELECT id, name, kind, every_days, last_done, warranty_until, note, COALESCE(remind_to, created_by) AS remind_to FROM home_items WHERE household = ?').bind(u.household).all(),
    db.prepare('SELECT email, COALESCE(he_name, name) AS name FROM members WHERE household = ? ORDER BY name').bind(u.household).all(),
    db.prepare(`SELECT l.item, l.done_on, l.at, COALESCE(m.he_name, m.name) AS who FROM home_log l LEFT JOIN members m ON m.email = l.by_email
                WHERE l.household = ? ORDER BY l.at DESC LIMIT 30`).bind(u.household).all(),
  ]);
  const t = today();
  return json({ items: sortItems(items.results as any[], t), presets: PRESETS, log: log.results, today: t, people: people.results, me: u.email });
}

/** POST /api/home (new) and PUT /api/home/:id (change) */
export async function save(ctx: Ctx) {
  const u = requireUser(ctx);
  const input = await body(ctx.req);
  const t = today();
  const it = rule(() => clean(input, t));
  const db = ctx.env.DB;
  const now = Date.now();
  // who gets the reminder: a member of this household, or null (whoever added it)
  const to = typeof input?.remind_to === 'string' && input.remind_to ? input.remind_to.toLowerCase() : null;
  if (to && !(await db.prepare('SELECT 1 FROM members WHERE household = ? AND email = ?').bind(u.household, to).first())) throw new HttpError(400, 'bad_person');
  if (ctx.params.id) {
    const r = await db.prepare(`UPDATE home_items SET name = ?, kind = ?, every_days = ?, last_done = ?, warranty_until = ?, note = ?, updated_at = ?,
                                 remind_to = CASE WHEN ? THEN ? ELSE remind_to END
                                 WHERE household = ? AND id = ?`)
      .bind(it.name, it.kind, it.every_days, it.last_done, it.warranty_until, it.note, now, 'remind_to' in (input || {}) ? 1 : 0, to, u.household, ctx.params.id).run();
    if (!r.meta.changes) throw new HttpError(404, 'not_found');
    return json({ id: ctx.params.id });
  }
  const n = await db.prepare('SELECT COUNT(*) AS n FROM home_items WHERE household = ?').bind(u.household).first<{ n: number }>();
  if ((n?.n || 0) >= MAX_ITEMS) throw new HttpError(400, 'too_many');
  const id = uid();
  await db.prepare(`INSERT INTO home_items (household, id, name, kind, every_days, last_done, warranty_until, note, created_by, remind_to, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(u.household, id, it.name, it.kind, it.every_days, it.last_done, it.warranty_until, it.note, u.email, to && to !== u.email ? to : null, now, now).run();
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

/** the morning (src/worker.ts, with the morning note): a push for each item due today or newly late, to whoever gets its reminder */
export async function remind(env: Env): Promise<number> {
  const t = today();
  const { results } = await env.DB.prepare(`SELECT household, id, name, every_days, last_done, reminded, COALESCE(remind_to, created_by) AS who
    FROM home_items WHERE every_days IS NOT NULL AND last_done IS NOT NULL`)
    .all<{ household: string; id: string; name: string; every_days: number; last_done: string; reminded: string | null; who: string | null }>();
  let n = 0;
  for (const it of results) {
    const next = remindFor(it, t);
    if (!next || !it.who) continue;
    await env.DB.prepare('UPDATE home_items SET reminded = ? WHERE household = ? AND id = ?').bind(next, it.household, it.id).run();
    const late = next < t;
    n += await pushTo(env, [it.who], { title: `🏠 ${it.name}`, body: late ? 'עבר הזמן לטפל בזה. כשזה נעשה, מסמנים "בוצע".' : 'היום הזמן לטפל בזה.',
      url: '/tools/home/', tag: `home${it.id}`, kind: 'reminder' }).catch(() => 0);
  }
  return n;
}
