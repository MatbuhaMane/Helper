// The family's own days in the calendar: birthdays, memorial days (יארצייט), anniversaries and anything else. Shared: every
// member sees and edits them all. Each repeats by the Hebrew date, by the Gregorian date, or not at all; the calendar page works
// out where each one falls in a given year (in the browser, which knows the Hebrew calendar).

import { z } from 'zod';
import { Ctx, HttpError, Member, body, json, requireUser, uid } from './core';
import { PersonRow, rateLimit, seenAtHome } from './vault';
import { prefsFor } from './prefs';
import * as HD from './hebdate';
import { forCalendar } from './gather';

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
  return json({ events: [...results.map(out), ...(await fromTree(ctx, u).catch(() => [])), ...(await forCalendar(ctx, u).catch(() => []))] });
}

/** The family tree's days (docs/family-forest.md): each person's birthday and, for those who passed away, the yahrzeit.
    Read-only here – they are changed in עץ המשפחה. A person whose "in the calendar" switch is off is left out. */
async function fromTree(ctx: Ctx, u: Member) {
  const { results } = await ctx.env.DB.prepare('SELECT * FROM family_people WHERE household = ? AND deleted_at IS NULL').bind(u.household).all<PersonRow>();
  const out: ReturnType<typeof outTree>[] = [];
  // the same privacy as the tree: dates someone keeps private are not in the others' calendar
  for (const p of await seenAtHome(ctx, u, results)) {
    const d = p.details as Record<string, any>;
    if (d.calendar === false || (!d.born && !d.died)) continue;
    const name = p.name;
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

/* ---------------- the calendar as a live link: Google, Apple or Outlook subscribe to it ---------------- */
// Each person may have one private link (only a hash of it is kept). Whoever has the link sees what the person sees in
// the calendar page – the holidays and the family's days, by their own choices there – so it can be replaced or cancelled
// at any time. Built anew on each request from the data (a cache keyed on the data saves the work in between).

const FEED_KINDS = ['major', 'minor', 'fast', 'modern', 'roshchodesh', 'family'];
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hashOf = async (token: string) => b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('calendar-feed:' + token)));
const feedUrl = (ctx: Ctx, token: string) => `${ctx.url.origin}/api/calendar/feed/${token}.ics`;
interface FeedRow { token_hash: string; email: string; tree: number; created_at: number; used_at: number | null }

/** GET /api/calendar/feed: is there a link (the link itself is shown only when made) */
export async function feedStatus(ctx: Ctx) {
  const u = requireUser(ctx);
  const f = await ctx.env.DB.prepare('SELECT tree, created_at, used_at FROM calendar_feeds WHERE email = ?').bind(u.email).first<FeedRow>();
  return json({ feed: f ? { tree: !!f.tree, created: f.created_at, used: f.used_at } : null });
}
/** POST /api/calendar/feed {tree}: a new link; the old one stops working */
export async function feedCreate(ctx: Ctx) {
  const u = requireUser(ctx);
  await rateLimit(ctx, 'feed-new:' + u.email, 20, 864e5);
  const b = await body<{ tree?: boolean }>(ctx.req).catch(() => ({} as { tree?: boolean }));
  const token = b64u(crypto.getRandomValues(new Uint8Array(24)));
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM calendar_feeds WHERE email = ?').bind(u.email),
    ctx.env.DB.prepare('INSERT INTO calendar_feeds (token_hash, email, tree, created_at) VALUES (?, ?, ?, ?)').bind(await hashOf(token), u.email, b?.tree === false ? 0 : 1, Date.now()),
  ]);
  return json({ url: feedUrl(ctx, token) });
}
/** DELETE /api/calendar/feed: the link stops working at once */
export async function feedRevoke(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM calendar_feeds WHERE email = ?').bind(u.email).run();
  return json({ ok: true });
}

/** the holidays of the Hebrew year hy, from Hebcal (Israel, in Hebrew), kept a day in Cloudflare's cache */
async function hebcal(hy: number): Promise<HD.HebcalItem[]> {
  const r = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&yt=H&year=${hy}&maj=on&min=on&mod=on&nx=on&mf=on&ss=on&i=on&lg=he`,
    { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit);
  if (!r.ok) throw new Error('hebcal ' + r.status);
  return ((await r.json()) as { items: HD.HebcalItem[] }).items || [];
}

/** GET /api/calendar/feed/:token.ics – no sign-in: the link is the key */
export async function feed(ctx: Ctx) {
  const token = String(ctx.params.token || '').replace(/\.ics$/, '');
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) throw new HttpError(404, 'Not found');
  const hash = await hashOf(token);
  const f = await ctx.env.DB.prepare('SELECT f.*, m.name, m.he_name, m.household, m.role FROM calendar_feeds f JOIN members m ON m.email = f.email WHERE f.token_hash = ?')
    .bind(hash).first<FeedRow & Member>();
  if (!f) throw new HttpError(404, 'Not found');                  // cancelled, replaced, or the member left
  await rateLimit(ctx, 'feed:' + hash.slice(0, 16), 120, 3600e3);
  ctx.waitUntil(ctx.env.DB.prepare('UPDATE calendar_feeds SET used_at = ? WHERE token_hash = ?').bind(Date.now(), hash).run().then(() => {}));
  const member: Member = { email: f.email, name: f.name, he_name: f.he_name, household: f.household, role: f.role };

  const prefs = (await prefsFor(ctx.env, f.email)).calendar;
  const P = (prefs?.data || {}) as { kinds?: unknown; remind?: unknown };
  const kinds = new Set(Array.isArray(P.kinds) ? P.kinds.filter((k): k is string => FEED_KINDS.includes(String(k))) : FEED_KINDS);
  kinds.add('family');                                             // as in the page: the family's days are always shown
  const remind = [0, 1, 3, 7].includes(Number(P.remind)) ? Number(P.remind) : 3;

  // the same answer while nothing changed: the family's days, the tree, the person's choices, and today
  const today = HD.fromIso(new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10));   // Israel's day, near enough
  const [ev, tr] = await Promise.all([
    ctx.env.DB.prepare("SELECT MAX(updated_at) AS t, COUNT(*) AS n FROM family_events WHERE COALESCE(household, 'family') = ?").bind(f.household).first<{ t: number | null; n: number }>(),
    ctx.env.DB.prepare('SELECT MAX(updated_at) AS t, COUNT(*) AS n FROM family_people WHERE household = ?').bind(f.household).first<{ t: number | null; n: number }>(),
  ]);
  const version = [HD.iso(today), ev?.t, ev?.n, f.tree ? `${tr?.t}.${tr?.n}` : '-', prefs?.at, [...kinds].sort().join('.'), remind].join('|');
  const cacheKey = new Request(`https://calendar-feed.cache/${hash}/${encodeURIComponent(version)}`);
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const headers = { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=1800', 'content-disposition': 'inline; filename="haohel.ics"', 'x-content-type-options': 'nosniff' };
  const hit = cache && await cache.match(cacheKey);
  if (hit) return new Response(hit.body, { headers });

  // from the start of this Hebrew year to the end of the next one
  const hy = HD.heb(today).year, from = HD.yearStart(hy), to = HD.addDays(HD.yearStart(hy + 2), -1);
  const days: HD.IcsDay[] = [];
  if ([...kinds].some((k) => k !== 'family')) {
    const items = (await Promise.all([hy, hy + 1].map((y) => hebcal(y).catch(() => [] as HD.HebcalItem[])))).flat();
    for (const g of HD.groupsOf(items)) {
      if (!kinds.has(HD.kindOf(g.items[0]))) continue;
      const memo = HD.plain(g.items.find((i) => i.memo)?.memo || '');
      days.push({ uid: `${g.from.replace(/-/g, '')}-${g.key.replace(/[^\w-]/g, '').slice(-60)}@haohel`, from: g.from, to: g.to, title: HD.nameOf(g.items), description: (memo ? memo + '\n' : '') + HD.heFull(HD.fromIso(g.from)) });
    }
  }
  const { results } = await ctx.env.DB.prepare("SELECT * FROM family_events WHERE deleted = 0 AND COALESCE(household, 'family') = ?").bind(f.household).all<Row>();
  const family: HD.FamilyDay[] = [...results.map(out), ...(f.tree ? await fromTree(ctx, member).catch(() => []) : [])];
  for (const x of HD.familyBetween(family, from, to)) {
    days.push({ uid: `f-${x.day.id.replace(/[^\w-]/g, '-')}-${x.date.replace(/-/g, '')}@haohel`, from: x.date, to: x.date, title: x.title, description: (x.day.note ? x.day.note + '\n' : '') + HD.heFull(HD.fromIso(x.date)) });
  }
  days.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const text = HD.ics('לוח השנה – האוהל', days, remind);
  if (cache) ctx.waitUntil(cache.put(cacheKey, new Response(text, { headers: { ...headers, 'cache-control': 'public, max-age=86400' } })));
  return new Response(text, { headers });
}
