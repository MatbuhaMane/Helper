// The family's own days in the calendar: birthdays, memorial days (יארצייט), anniversaries and anything else. Shared: every
// member sees and edits them all. Each repeats by the Hebrew date, by the Gregorian date, or not at all; the calendar page works
// out where each one falls in a given year (in the browser, which knows the Hebrew calendar).

import { z } from 'zod';
import { Ctx, HttpError, body, json, requireUser, uid } from './core';
import { unseal } from './vault/crypto';

const Event = z.object({
  title: z.string().trim().min(1).max(80),
  kind: z.enum(['birthday', 'yahrzeit', 'anniversary', 'other']).default('other'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),          // the day it happened (Gregorian)
  after_sunset: z.boolean().default(false),               // it happened after sunset: the Hebrew date is the next day's
  recur: z.enum(['hebrew', 'gregorian', 'none']).default('hebrew'),
  note: z.string().max(400).default(''),
});
type Row = { id: string; title: string; kind: string; date: string; after_sunset: number; recur: string; note: string; created_by: string; updated_at: number };
const out = (r: Row) => ({ id: r.id, title: r.title, kind: r.kind, date: r.date, after_sunset: !!r.after_sunset, recur: r.recur, note: r.note, by: r.created_by, updated_at: r.updated_at });

/** GET /api/calendar/events */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT * FROM family_events WHERE deleted = 0 AND COALESCE(household, 'family') = ? ORDER BY date").bind(u.household).all<Row>();
  return json({ events: [...results.map(out), ...(await fromTree(ctx, u.household).catch(() => []))] });
}

/** The family tree's days (docs/family-forest.md): each person's birthday and, for those who passed away, the yahrzeit.
    Read-only here – they are changed in עץ המשפחה. A person whose "in the calendar" switch is off is left out. */
async function fromTree(ctx: Ctx, household: string) {
  const { results } = await ctx.env.DB.prepare('SELECT id, name_enc, details_enc FROM family_people WHERE household = ? AND deleted_at IS NULL').bind(household).all<{ id: string; name_enc: string; details_enc: string }>();
  const out: ReturnType<typeof outTree>[] = [];
  for (const p of results) {
    const d = JSON.parse((await unseal(ctx.env, p.details_enc, `person:${p.id}:details`)) || '{}');
    if (d.calendar === false || (!d.born && !d.died)) continue;
    const name = await unseal(ctx.env, p.name_enc, `person:${p.id}:name`);
    if (d.born && !d.died) out.push(outTree(p.id + ':born', name, 'birthday', d.born, !!d.bornAfterSunset, d.birthdayBy === 'hebrew' ? 'hebrew' : 'gregorian'));
    if (d.died) out.push(outTree(p.id + ':died', name, 'yahrzeit', d.died, !!d.diedAfterSunset, 'hebrew'));
  }
  return out;
}
const outTree = (id: string, title: string, kind: string, date: string, after: boolean, recur: string) =>
  ({ id: 'tree:' + id, title, kind, date, after_sunset: after, recur, note: '', by: 'tree', from: 'tree', updated_at: 0 });

/** POST /api/calendar/events */
export async function create(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = Event.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid event');
  const e = p.data, id = uid(), now = Date.now();
  await ctx.env.DB.prepare('INSERT INTO family_events (id, title, kind, date, after_sunset, recur, note, created_by, created_at, updated_at, deleted, household) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)')
    .bind(id, e.title, e.kind, e.date, e.after_sunset ? 1 : 0, e.recur, e.note, u.email, now, now, u.household).run();
  return json({ event: { id, ...e, by: u.email, updated_at: now } });
}

/** PUT /api/calendar/events/:id */
export async function update(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = Event.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid event');
  const e = p.data, now = Date.now();
  const r = await ctx.env.DB.prepare("UPDATE family_events SET title = ?, kind = ?, date = ?, after_sunset = ?, recur = ?, note = ?, updated_at = ? WHERE id = ? AND deleted = 0 AND COALESCE(household, 'family') = ?")
    .bind(e.title, e.kind, e.date, e.after_sunset ? 1 : 0, e.recur, e.note, now, ctx.params.id, u.household).run();
  if (!r.meta.changes) throw new HttpError(404, 'Not found');
  return json({ ok: true });
}

/** DELETE /api/calendar/events/:id */
export async function remove(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare("UPDATE family_events SET deleted = 1, updated_at = ? WHERE id = ? AND COALESCE(household, 'family') = ?").bind(Date.now(), ctx.params.id, u.household).run();
  return json({ ok: true });
}
