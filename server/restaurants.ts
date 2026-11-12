// מסעדות שלנו – the household's own list of restaurants (the owner's choice A, docs/ai/restaurants.md): the places the
// family goes to or wants to try, with where, what kind, kosher or not, a note, a ❤, and who went last and when.
// No outside source, no AI, no cost; the food portal's slider shows the favourites not visited for a while.
// (Google Places, choice C, comes on top of it later.)   Tests: node server/test-restaurants.mjs

import { z } from 'zod';
import { Ctx, HttpError, body, json, requireUser, uid } from './core';

export const KOSHER = ['', 'kosher', 'mehadrin', 'no'] as const;
const Input = z.object({
  name: z.string().trim().min(1).max(120),
  place: z.string().trim().max(160).optional().default(''),
  cuisine: z.string().trim().max(60).optional().default(''),
  kosher: z.enum(KOSHER).optional().default(''),
  link: z.string().trim().max(500).optional().default('').refine((s) => !s || /^https:\/\/[^\s]+$/.test(s), 'https only'),
  phone: z.string().trim().max(30).optional().default('').refine((s) => !s || /^[+\d][\d\s-]{5,}$/.test(s), 'a phone number'),
  note: z.string().trim().max(1000).optional().default(''),
  fav: z.boolean().optional(),
  // Google's place ID (from a search): the only thing of Google's that may be kept
  placeId: z.string().regex(/^[A-Za-z0-9_-]{10,300}$/).optional().nullable(),
});
export interface Restaurant {
  id: string; name: string; place: string; cuisine: string; kosher: string; link: string; phone: string; note: string;
  fav: boolean; placeId: string | null; visitedAt: number | null; visitedBy: string | null; createdAt: number; updatedAt: number;
}
const toRestaurant = (r: any): Restaurant => ({ id: r.id, name: r.name, place: r.place || '', cuisine: r.cuisine || '', kosher: r.kosher || '',
  link: r.link || '', phone: r.phone || '', note: r.note || '', fav: !!r.fav, placeId: r.place_id || null, visitedAt: r.visited_at || null, visitedBy: r.visited_by || null,
  createdAt: r.created_at, updatedAt: r.updated_at });

/** the slider's restaurants: favourites not visited for `stale` days (longest first), then new ones never visited */
export function restaurantSlides(list: Restaurant[], now: number, stale = 30, fresh = 14, max = 4) {
  const day = 864e5;
  const miss = list.filter((r) => r.fav && (!r.visitedAt || now - r.visitedAt >= stale * day))
    .sort((a, b) => (a.visitedAt || 0) - (b.visitedAt || 0))
    .map((r) => ({ kind: 'restaurant' as const, id: r.id, name: r.name, place: r.place, why: 'missed' as const, days: r.visitedAt ? Math.floor((now - r.visitedAt) / day) : null }));
  const added = list.filter((r) => !r.visitedAt && !r.fav && now - r.createdAt <= fresh * day)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({ kind: 'restaurant' as const, id: r.id, name: r.name, place: r.place, why: 'new' as const, days: null }));
  return [...miss, ...added].slice(0, max);
}

export async function listRestaurants(env: Ctx['env'], household: string): Promise<Restaurant[]> {
  const { results } = await env.DB.prepare('SELECT * FROM restaurants WHERE household = ? AND deleted = 0 ORDER BY fav DESC, updated_at DESC LIMIT 500').bind(household).all();
  return results.map(toRestaurant);
}

/** GET /api/restaurants */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  return json({ restaurants: await listRestaurants(ctx.env, u.household) });
}

/** POST /api/restaurants, PUT /api/restaurants/:id */
export async function save(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = Input.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, p.error.issues[0]?.message === 'https only' ? 'הקישור צריך להתחיל ב־https://' : 'Invalid restaurant');
  const d = p.data, now = Date.now();
  if (ctx.params.id) {
    const r = await ctx.env.DB.prepare(`UPDATE restaurants SET name = ?, place = ?, cuisine = ?, kosher = ?, link = ?, phone = ?, note = ?,
      fav = COALESCE(?, fav), place_id = COALESCE(?, place_id), updated_at = ? WHERE household = ? AND id = ? AND deleted = 0`)
      .bind(d.name, d.place, d.cuisine, d.kosher, d.link, d.phone, d.note, d.fav === undefined ? null : d.fav ? 1 : 0, d.placeId || null, now, u.household, ctx.params.id).run();
    if (!r.meta.changes) throw new HttpError(404, 'Not found');
    return json({ ok: true, id: ctx.params.id });
  }
  const id = uid();
  await ctx.env.DB.prepare(`INSERT INTO restaurants (household, id, name, place, cuisine, kosher, link, phone, note, place_id, fav, created_by, created_at, updated_at, deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)
    .bind(u.household, id, d.name, d.place, d.cuisine, d.kosher, d.link, d.phone, d.note, d.placeId || null, d.fav ? 1 : 0, u.email, now, now).run();
  return json({ ok: true, id });
}

/** POST /api/restaurants/:id/fav {fav} – the ❤ alone */
export async function fav(ctx: Ctx) {
  const u = requireUser(ctx);
  const { fav: on } = await body<{ fav: boolean }>(ctx.req);
  const r = await ctx.env.DB.prepare('UPDATE restaurants SET fav = ? WHERE household = ? AND id = ? AND deleted = 0').bind(on ? 1 : 0, u.household, ctx.params.id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Not found');
  return json({ ok: true });
}

/** POST /api/restaurants/:id/visit {undo?} – "we went today" (or take it back: the visit before it is not kept) */
export async function visit(ctx: Ctx) {
  const u = requireUser(ctx);
  const { undo } = await body<{ undo?: boolean }>(ctx.req).catch(() => ({ undo: false }));
  const r = await ctx.env.DB.prepare('UPDATE restaurants SET visited_at = ?, visited_by = ? WHERE household = ? AND id = ? AND deleted = 0')
    .bind(undo ? null : Date.now(), undo ? null : u.email, u.household, ctx.params.id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Not found');
  return json({ ok: true });
}

/** DELETE /api/restaurants/:id */
export async function remove(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('UPDATE restaurants SET deleted = 1, updated_at = ? WHERE household = ? AND id = ?').bind(Date.now(), u.household, ctx.params.id).run();
  return json({ ok: true });
}
