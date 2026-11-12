// המפגש המשפחתי – the first tool (docs/business/gathering.md, the owner's decisions in docs/business/closed-questions.md).
// A member makes a gathering (a date, a place, the food rule); one link goes to the family's WhatsApp group. Whoever opens
// it – with no sign-in – sees only the gathering: its name, day and place, the first names of who is coming, what they
// bring, and the comments; never the tree or anything else. They answer coming or not (and with how many), take something
// to bring – a member who takes it finds it in their own grocery list – and add it to their calendar. The link ends the day
// after the gathering, or when the host cancels it. The rules are in gather-rules.ts (tested); the counts kept for the
// beta are anonymous (opened, answered, signed in from an invitation – never who).

import { Ctx, HttpError, Member, body, json, requireUser, uid } from './core';
import { PersonRow, rateLimit, seenAtHome } from './vault';
import { fingerprint, seal, unseal } from './vault/crypto';
import { addGroceries } from './kitchen';
import { prefsFor } from './prefs';
import * as HD from './hebdate';
import * as R from './gather-rules';

interface Row {
  id: string; household: string; host_email: string; title: string; date: string; time: string | null; place: string; map: string; note: string; food: string;
  invitees_enc: string | null; token_hash: string; token_enc: string; status: string; expires_at: number; created_at: number; updated_at: number;
}
interface Rsvp { id: string; gathering: string; guest_hash: string | null; email: string | null; name: string; coming: string; count: number; note: string; at: number }
interface Item { id: string; gathering: string; title: string; kind: string; taker: string | null; grocery_house: string | null; grocery_src: string | null; added_by: string | null; at: number; deleted: number }
interface Comment { id: string; gathering: string; rsvp: string | null; name: string; text: string; at: number; deleted: number }

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha = async (kind: string, s: string) => b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`gather-${kind}:` + s)));
const newKey = () => b64u(crypto.getRandomValues(new Uint8Array(24)));
const inviteUrl = (ctx: Ctx, token: string) => `${ctx.url.origin}/gather/invite/#${token}`;
const COMING = new Set(['yes', 'no', 'maybe']);
const asGathering = (g: Row): R.Gathering => ({ title: g.title, date: g.date, time: g.time, place: g.place || '', map: g.map || '', note: g.note || '', food: (['kosher', 'halal'].includes(g.food) ? g.food : '') as R.Gathering['food'] });
const open = (g: Row) => g.status === 'active' && Date.now() < g.expires_at;

/** what the person wrote, checked: a title, a day, maybe an hour, a place and a map link, a note, the food rule */
function fields(b: Record<string, unknown>, before?: Row) {
  const title = R.clean(b.title ?? before?.title, 80);
  if (!title) throw new HttpError(400, 'title_required');
  const date = b.date ?? before?.date;
  if (!R.isDate(date)) throw new HttpError(400, 'bad_date');
  const time = b.time === undefined ? before?.time ?? null : R.isTime(b.time) ? b.time : null;
  const food = String(b.food ?? before?.food ?? '');
  return {
    title, date, time, place: R.clean(b.place ?? before?.place, 160), map: R.mapUrl(b.map ?? before?.map), note: R.clean(b.note ?? before?.note, 1000),
    food: ['kosher', 'halal'].includes(food) ? food : '',
  };
}

/* ---- the day's calendar for the warnings: Hebcal for that one day, with Shabbat times for the host's city ---- */
async function dayItems(ctx: Ctx, g: Row): Promise<R.DayItem[]> {
  const city = String((await prefsFor(ctx.env, g.host_email)).calendar?.data?.city || '281184');
  const geo = /^\d{3,9}$/.test(city) ? city : '281184';
  try {
    const r = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&start=${g.date}&end=${g.date}&maj=on&min=on&mod=on&nx=on&mf=on&ss=on&c=on&geo=geoname&geonameid=${geo}&i=on&lg=he`,
      { cf: { cacheTtl: 86400, cacheEverything: true } } as RequestInit);
    return r.ok ? (((await r.json()) as { items: R.DayItem[] }).items || []) : [];
  } catch { return []; }
}

/* ---- counting for the beta: how many, never who ---- */
const STATS = new Set(['open', 'rsvp', 'signin']);
function count(ctx: Ctx, g: string, kind: string) {
  if (!STATS.has(kind)) return;
  const day = new Date().toISOString().slice(0, 10);
  ctx.waitUntil(ctx.env.DB.prepare('INSERT INTO gathering_stats (gathering, kind, day, n) VALUES (?, ?, ?, 1) ON CONFLICT(gathering, kind, day) DO UPDATE SET n = n + 1')
    .bind(g, kind, day).run().then(() => {}));
}

/* ---------------- the host's side (signed in; any member of the host's household) ---------------- */

async function mine(ctx: Ctx, u: Member, id: string): Promise<Row> {
  const g = await ctx.env.DB.prepare('SELECT * FROM gatherings WHERE id = ? AND household = ?').bind(id, u.household).first<Row>();
  if (!g) throw new HttpError(404, 'not_found');
  return g;
}

/** GET /api/gather: our gatherings, and the ones I answered elsewhere */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare(`SELECT g.*, (SELECT COALESCE(SUM(CASE WHEN r.coming = 'yes' THEN r.count ELSE 0 END), 0) FROM gathering_rsvps r WHERE r.gathering = g.id) AS coming,
      (SELECT COUNT(*) FROM gathering_rsvps r WHERE r.gathering = g.id) AS answers
    FROM gatherings g WHERE g.household = ? OR g.id IN (SELECT gathering FROM gathering_rsvps WHERE email = ?) ORDER BY g.date DESC LIMIT 100`)
    .bind(u.household, u.email).all<Row & { coming: number; answers: number }>();
  return json({ gatherings: results.map((g) => ({ id: g.id, title: g.title, date: g.date, time: g.time, place: g.place, status: g.status, open: open(g), ours: g.household === u.household, coming: g.coming, answers: g.answers })) });
}

/** POST /api/gather: a new gathering; any member may make one */
export async function create(ctx: Ctx) {
  const u = requireUser(ctx);
  await rateLimit(ctx, 'gather-new:' + u.email, 30, 864e5);
  const f = fields(await body<Record<string, unknown>>(ctx.req));
  const id = uid(), token = newKey(), now = Date.now();
  await ctx.env.DB.prepare(`INSERT INTO gatherings (id, household, host_email, title, date, time, place, map, note, food, token_hash, token_enc, status, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
    .bind(id, u.household, u.email, f.title, f.date, f.time, f.place, f.map, f.note, f.food, await sha('link', token), await seal(ctx.env, token, `gather:${id}:token`), R.expiresAt(f.date), now, now).run();
  return json({ id, url: inviteUrl(ctx, token) });
}

/** GET /api/gather/:id – everything, for the host's household */
export async function get(ctx: Ctx) {
  const u = requireUser(ctx);
  const g = await mine(ctx, u, ctx.params.id);
  const token = await unseal(ctx.env, g.token_enc, `gather:${g.id}:token`);
  const url = inviteUrl(ctx, token), gg = asGathering(g);
  const [{ results: rsvps }, { results: items }, { results: comments }, { results: stats }, day] = await Promise.all([
    ctx.env.DB.prepare('SELECT * FROM gathering_rsvps WHERE gathering = ? ORDER BY at').bind(g.id).all<Rsvp>(),
    ctx.env.DB.prepare('SELECT * FROM gathering_items WHERE gathering = ? AND deleted = 0 ORDER BY at').bind(g.id).all<Item>(),
    ctx.env.DB.prepare('SELECT * FROM gathering_comments WHERE gathering = ? AND deleted = 0 ORDER BY at').bind(g.id).all<Comment>(),
    ctx.env.DB.prepare('SELECT kind, SUM(n) AS n FROM gathering_stats WHERE gathering = ? GROUP BY kind').bind(g.id).all<{ kind: string; n: number }>(),
    dayItems(ctx, g),
  ]);
  const byId = new Map(rsvps.map((r) => [r.id, r]));
  return json({
    id: g.id, ...gg, status: g.status, open: open(g), url, expires: g.expires_at, host: g.host_email,
    invitees: JSON.parse((await unseal(ctx.env, g.invitees_enc, `gather:${g.id}:invitees`)) || '[]'),
    rsvps: rsvps.map((r) => ({ id: r.id, name: r.name, coming: r.coming, count: r.count, note: r.note, member: !!r.email, at: r.at })),
    items: items.map((i) => ({ id: i.id, title: i.title, kind: i.kind, taker: i.taker ? byId.get(i.taker)?.name || '' : null })),
    comments: comments.map((c) => ({ id: c.id, name: c.name, text: c.text, at: c.at })),
    stats: Object.fromEntries(stats.map((s) => [s.kind, s.n])),
    warnings: R.warnings(gg, day), food_notes: R.foodNotes(gg.food, items.map((i) => i.kind as R.FoodKind)),
    whatsapp: 'https://wa.me/?text=' + encodeURIComponent(R.whatsappText(gg, url)), google: R.googleLink(gg, url), when: R.when(gg),
  });
}

/** PUT /api/gather/:id – the details, and the host's list of whom to invite (names, from the tree or typed) */
export async function save(ctx: Ctx) {
  const u = requireUser(ctx);
  const g = await mine(ctx, u, ctx.params.id);
  const b = await body<Record<string, unknown>>(ctx.req);
  const f = fields(b, g);
  const invitees = Array.isArray(b.invitees) ? [...new Set(b.invitees.map((x) => R.clean(x, 60)).filter(Boolean))].slice(0, 300) : null;
  await ctx.env.DB.prepare('UPDATE gatherings SET title = ?, date = ?, time = ?, place = ?, map = ?, note = ?, food = ?, expires_at = ?, updated_at = ?' + (invitees ? ', invitees_enc = ?' : '') + ' WHERE id = ?')
    .bind(f.title, f.date, f.time, f.place, f.map, f.note, f.food, R.expiresAt(f.date), Date.now(), ...(invitees ? [await seal(ctx.env, JSON.stringify(invitees), `gather:${g.id}:invitees`)] : []), g.id).run();
  return json({ ok: true });
}

/** POST /api/gather/:id/cancel – the link stops working at once (and /reopen brings it back, with a new link) */
export async function cancel(ctx: Ctx) {
  const u = requireUser(ctx);
  const g = await mine(ctx, u, ctx.params.id);
  await ctx.env.DB.prepare("UPDATE gatherings SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(Date.now(), g.id).run();
  return json({ ok: true });
}
export async function reopen(ctx: Ctx) {
  const u = requireUser(ctx);
  const g = await mine(ctx, u, ctx.params.id);
  const token = newKey();
  await ctx.env.DB.prepare("UPDATE gatherings SET status = 'active', token_hash = ?, token_enc = ?, updated_at = ? WHERE id = ?")
    .bind(await sha('link', token), await seal(ctx.env, token, `gather:${g.id}:token`), Date.now(), g.id).run();
  return json({ url: inviteUrl(ctx, token) });
}

/** POST /api/gather/:id/items {title, kind} – the host puts something on the list of what to bring */
export async function itemAdd(ctx: Ctx) {
  const u = requireUser(ctx);
  const g = await mine(ctx, u, ctx.params.id);
  const b = await body<{ title?: string; kind?: string }>(ctx.req);
  return json({ id: await addItem(ctx, g, b, u.email, null) });
}
export async function itemDelete(ctx: Ctx) {
  const u = requireUser(ctx);
  const g = await mine(ctx, u, ctx.params.id);
  const it = await ctx.env.DB.prepare('SELECT * FROM gathering_items WHERE id = ? AND gathering = ? AND deleted = 0').bind(ctx.params.item, g.id).first<Item>();
  if (!it) throw new HttpError(404, 'not_found');
  await release(ctx, it);
  await ctx.env.DB.prepare('UPDATE gathering_items SET deleted = 1 WHERE id = ?').bind(it.id).run();
  return json({ ok: true });
}
/** DELETE /api/gather/:id/comments/:comment – the host takes a comment down */
export async function commentDelete(ctx: Ctx) {
  const u = requireUser(ctx);
  const g = await mine(ctx, u, ctx.params.id);
  await ctx.env.DB.prepare('UPDATE gathering_comments SET deleted = 1 WHERE id = ? AND gathering = ?').bind(ctx.params.comment, g.id).run();
  return json({ ok: true });
}

/** GET /api/gather/ideas – the family's round days in the next three months: a reason to gather */
export async function ideasList(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT id, title, kind, date, after_sunset, recur FROM family_events WHERE deleted = 0 AND COALESCE(household, 'family') = ?").bind(u.household).all<{ id: string; title: string; kind: string; date: string; after_sunset: number; recur: string }>();
  const days: HD.FamilyDay[] = results.map((r) => ({ ...r, after_sunset: !!r.after_sunset }));
  // the tree's birthdays and memorial days, as this member may see them (the same privacy as the calendar)
  const { results: people } = await ctx.env.DB.prepare('SELECT * FROM family_people WHERE household = ? AND deleted_at IS NULL').bind(u.household).all<PersonRow>();
  for (const p of await seenAtHome(ctx, u, people).catch(() => [])) {
    const d = p.details as Record<string, string | boolean | undefined>;
    if (d.calendar === false) continue;
    if (typeof d.born === 'string' && !d.died) days.push({ id: p.id + ':born', title: p.name, kind: 'birthday', date: d.born, after_sunset: !!d.bornAfterSunset, recur: d.birthdayBy === 'hebrew' ? 'hebrew' : 'gregorian' });
    if (typeof d.died === 'string') days.push({ id: p.id + ':died', title: p.name, kind: 'yahrzeit', date: d.died, after_sunset: !!d.diedAfterSunset, recur: 'hebrew' });
  }
  const today = HD.fromIso(new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10));
  return json({ ideas: R.ideas(days.filter((d) => R.isDate(d.date)), today, HD.addDays(today, 92)) });
}

/* ---------------- the invitation (no sign-in: the link is the key) ---------------- */

async function byToken(ctx: Ctx): Promise<Row> {
  const token = String(ctx.params.token || '');
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) throw new HttpError(404, 'not_found');
  const g = await ctx.env.DB.prepare('SELECT * FROM gatherings WHERE token_hash = ?').bind(await sha('link', token)).first<Row>();
  if (!g) throw new HttpError(404, 'not_found');
  return g;
}
/** who is asking: a member signed in, or a guest by the key their first answer gave them (kept on their device) */
async function me(ctx: Ctx, g: Row, guest: unknown): Promise<Rsvp | null> {
  if (ctx.user) return ctx.env.DB.prepare('SELECT * FROM gathering_rsvps WHERE gathering = ? AND email = ?').bind(g.id, ctx.user.email).first<Rsvp>();
  if (typeof guest !== 'string' || !/^[A-Za-z0-9_-]{24,64}$/.test(guest)) return null;
  return ctx.env.DB.prepare('SELECT * FROM gathering_rsvps WHERE gathering = ? AND guest_hash = ?').bind(g.id, await sha('guest', guest)).first<Rsvp>();
}
/** a limit per device for what guests write (by a fingerprint of the address, never the address itself) */
async function limitGuest(ctx: Ctx, what: string, max: number) {
  const ip = ctx.req.headers.get('cf-connecting-ip') || 'local';
  await rateLimit(ctx, `gather-${what}:${await fingerprint(ctx.env, ip)}`, max, 3600e3);
}
/** a guest's key comes only in a header (or a POST body), never in the address, so it stays out of logs */
const guestOf = (ctx: Ctx) => ctx.req.headers.get('x-guest') || '';

/** GET /api/gather/invite/:token – the gathering, as the invitation shows it (and nothing more) */
export async function invite(ctx: Ctx) {
  const g = await byToken(ctx);
  if (!open(g)) return json({ closed: true, title: g.title, cancelled: g.status !== 'active' });
  if (ctx.url.searchParams.get('seen') === '1') count(ctx, g.id, 'open');      // once per device, the page says
  const meRow = await me(ctx, g, guestOf(ctx)), gg = asGathering(g);
  const [{ results: rsvps }, { results: items }, { results: comments }, day] = await Promise.all([
    ctx.env.DB.prepare("SELECT id, name, coming, count FROM gathering_rsvps WHERE gathering = ? ORDER BY at").bind(g.id).all<Rsvp>(),
    ctx.env.DB.prepare('SELECT * FROM gathering_items WHERE gathering = ? AND deleted = 0 ORDER BY at').bind(g.id).all<Item>(),
    ctx.env.DB.prepare('SELECT * FROM gathering_comments WHERE gathering = ? AND deleted = 0 ORDER BY at DESC LIMIT 100').bind(g.id).all<Comment>(),
    dayItems(ctx, g),
  ]);
  const names = new Map(rsvps.map((r) => [r.id, R.firstName(r.name)]));
  const yes = rsvps.filter((r) => r.coming === 'yes');
  const token = String(ctx.params.token);
  return json({
    ...gg, when: R.when(gg),
    // only first names of who is coming, and how many in all (the owner's rule)
    coming: yes.map((r) => ({ name: R.firstName(r.name), count: r.count })), total: yes.reduce((s, r) => s + r.count, 0),
    items: items.map((i) => ({ id: i.id, title: i.title, kind: i.kind, taker: i.taker ? names.get(i.taker) || '' : null, mine: !!meRow && i.taker === meRow.id })),
    comments: comments.reverse().map((c) => ({ id: c.id, name: R.firstName(c.name), text: c.text, at: c.at, mine: !!meRow && c.rsvp === meRow.id })),
    me: meRow ? { name: meRow.name, coming: meRow.coming, count: meRow.count, note: meRow.note } : null,
    member: ctx.user ? { name: ctx.user.he_name || ctx.user.name || '' } : null,
    warnings: R.warnings(gg, day), food_notes: R.foodNotes(gg.food, items.map((i) => i.kind as R.FoodKind)),
    google: R.googleLink(gg, inviteUrl(ctx, token)), ics: `/api/gather/invite/${token}/ics`,
  });
}

/** POST /api/gather/invite/:token/rsvp {name, coming, count, note, guest} – the answer; a guest's first one gives them a key */
export async function rsvp(ctx: Ctx) {
  const g = await byToken(ctx);
  if (!open(g)) throw new HttpError(410, 'closed');
  await limitGuest(ctx, 'rsvp', 30);
  const b = await body<{ name?: string; coming?: string; count?: number; note?: string; guest?: string }>(ctx.req);
  const name = R.clean(b.name || ctx.user?.he_name || ctx.user?.name, 60);
  if (!name) throw new HttpError(400, 'name_required');
  const coming = COMING.has(String(b.coming)) ? String(b.coming) : 'yes';
  const n = coming === 'yes' ? Math.max(1, Math.min(30, Math.round(Number(b.count) || 1))) : 0;
  const note = R.clean(b.note, 300);
  const was = await me(ctx, g, b.guest);
  let guest: string | null = null;
  if (was) await ctx.env.DB.prepare('UPDATE gathering_rsvps SET name = ?, coming = ?, count = ?, note = ?, at = ? WHERE id = ?').bind(name, coming, n, note, Date.now(), was.id).run();
  else {
    guest = ctx.user ? null : newKey();
    await ctx.env.DB.prepare('INSERT INTO gathering_rsvps (id, gathering, guest_hash, email, name, coming, count, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(uid(), g.id, guest ? await sha('guest', guest) : null, ctx.user?.email || null, name, coming, n, note, Date.now()).run();
    count(ctx, g.id, 'rsvp');
  }
  return json({ ok: true, guest });
}

/** take something to bring, or give it back; a member who takes it finds it in their household's grocery list */
async function addItem(ctx: Ctx, g: Row, b: { title?: string; kind?: string }, by: string | null, taker: Rsvp | null) {
  const title = R.clean(b.title, 80);
  if (!title) throw new HttpError(400, 'title_required');
  const kind = (R.FOOD_KINDS as readonly string[]).includes(String(b.kind || '')) ? String(b.kind || '') : '';
  const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM gathering_items WHERE gathering = ? AND deleted = 0').bind(g.id).first<{ n: number }>();
  if ((n?.n || 0) >= 80) throw new HttpError(400, 'too_many_items');
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO gathering_items (id, gathering, title, kind, taker, added_by, at, deleted) VALUES (?, ?, ?, ?, NULL, ?, ?, 0)').bind(id, g.id, title, kind, by, Date.now()).run();
  if (taker) await take(ctx, g, { id, gathering: g.id, title, kind, taker: null, grocery_house: null, grocery_src: null, added_by: by, at: Date.now(), deleted: 0 }, taker);
  return id;
}
async function take(ctx: Ctx, g: Row, it: Item, who: Rsvp) {
  let house: string | null = null, src: string | null = null;
  if (who.email) {
    const m = await ctx.env.DB.prepare('SELECT household FROM members WHERE email = ?').bind(who.email).first<{ household: string }>();
    if (m) {
      src = `מפגש: ${g.title}`.slice(0, 80);
      const [r] = await addGroceries(ctx.env, m.household, who.email, [{ name: it.title, category: 'other' }], src);
      house = r?.result === 'added' ? m.household : null;     // only what this added is taken off again
    }
  }
  await ctx.env.DB.prepare('UPDATE gathering_items SET taker = ?, grocery_house = ?, grocery_src = ? WHERE id = ?').bind(who.id, house, house ? src : null, it.id).run();
}
async function release(ctx: Ctx, it: Item) {
  if (it.grocery_house && it.grocery_src)
    await ctx.env.DB.prepare('UPDATE grocery_items SET deleted = 1, updated_at = ? WHERE household = ? AND name = ? AND src = ? AND checked = 0 AND deleted = 0')
      .bind(Date.now(), it.grocery_house, it.title.trim().slice(0, 200), it.grocery_src).run();
  await ctx.env.DB.prepare('UPDATE gathering_items SET taker = NULL, grocery_house = NULL, grocery_src = NULL WHERE id = ?').bind(it.id).run();
}
async function answered(ctx: Ctx, g: Row, guest: unknown) {
  const who = await me(ctx, g, guest);
  if (!who) throw new HttpError(403, 'answer_first');                // say who you are (coming or not) first
  return who;
}

/** POST /api/gather/invite/:token/items {title, kind, guest} – "I'll bring…": a new item, taken by whoever adds it */
export async function inviteItemAdd(ctx: Ctx) {
  const g = await byToken(ctx);
  if (!open(g)) throw new HttpError(410, 'closed');
  await limitGuest(ctx, 'item', 40);
  const b = await body<{ title?: string; kind?: string; guest?: string }>(ctx.req);
  const who = await answered(ctx, g, b.guest);
  return json({ id: await addItem(ctx, g, b, who.email, who) });
}
/** POST /api/gather/invite/:token/items/:item/take and …/release {guest} */
export async function inviteItemTake(ctx: Ctx) {
  const g = await byToken(ctx);
  if (!open(g)) throw new HttpError(410, 'closed');
  await limitGuest(ctx, 'item', 60);
  const b = await body<{ guest?: string }>(ctx.req);
  const who = await answered(ctx, g, b.guest);
  const it = await ctx.env.DB.prepare('SELECT * FROM gathering_items WHERE id = ? AND gathering = ? AND deleted = 0').bind(ctx.params.item, g.id).first<Item>();
  if (!it) throw new HttpError(404, 'not_found');
  if (ctx.params.action === 'take') {
    if (it.taker && it.taker !== who.id) throw new HttpError(409, 'taken');
    if (!it.taker) await take(ctx, g, it, who);
  } else if (ctx.params.action === 'release') {
    if (it.taker !== who.id) throw new HttpError(403, 'not_yours');
    await release(ctx, it);
    // something a guest added for themself ("I'll bring…") goes when they give it back; the host's items stay on the list
    if (!it.added_by) await ctx.env.DB.prepare('UPDATE gathering_items SET deleted = 1 WHERE id = ?').bind(it.id).run();
  } else throw new HttpError(404, 'not_found');
  return json({ ok: true });
}
/** POST /api/gather/invite/:token/comments {text, guest}; DELETE …/comments/:comment (your own) */
export async function inviteComment(ctx: Ctx) {
  const g = await byToken(ctx);
  if (!open(g)) throw new HttpError(410, 'closed');
  await limitGuest(ctx, 'comment', 30);
  const b = await body<{ text?: string; guest?: string }>(ctx.req);
  const who = await answered(ctx, g, b.guest);
  const text = R.clean(b.text, 600);
  if (!text) throw new HttpError(400, 'text_required');
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO gathering_comments (id, gathering, rsvp, name, text, at, deleted) VALUES (?, ?, ?, ?, ?, ?, 0)').bind(id, g.id, who.id, who.name, text, Date.now()).run();
  return json({ id });
}
export async function inviteCommentDelete(ctx: Ctx) {
  const g = await byToken(ctx);
  const who = await answered(ctx, g, guestOf(ctx));
  await ctx.env.DB.prepare('UPDATE gathering_comments SET deleted = 1 WHERE id = ? AND gathering = ? AND rsvp = ?').bind(ctx.params.comment, g.id, who.id).run();
  return json({ ok: true });
}
/** GET /api/gather/invite/:token/ics – the gathering for any calendar, with its reminders */
export async function inviteIcs(ctx: Ctx) {
  const g = await byToken(ctx);
  if (!open(g)) throw new HttpError(410, 'closed');
  return new Response(R.ics(asGathering(g), g.id, inviteUrl(ctx, String(ctx.params.token))), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="gathering.ics"', 'cache-control': 'no-store' },
  });
}
/** POST /api/gather/invite/:token/event {kind} – the beta's anonymous counts that only the page knows (a sign-in from the invitation) */
export async function inviteEvent(ctx: Ctx) {
  const g = await byToken(ctx);
  await limitGuest(ctx, 'event', 30);
  const kind = String((await body<{ kind?: string }>(ctx.req)).kind || '');
  if (kind === 'signin') count(ctx, g.id, 'signin');
  return json({ ok: true });
}

/** for the family calendar: the gatherings of this household, and those this member said they come to */
export async function forCalendar(ctx: Ctx, u: Member) {
  const { results } = await ctx.env.DB.prepare(`SELECT id, title, date, time, place FROM gatherings WHERE status = 'active' AND date >= ?
      AND (household = ? OR id IN (SELECT gathering FROM gathering_rsvps WHERE email = ? AND coming = 'yes')) ORDER BY date LIMIT 50`)
    .bind(new Date(Date.now() - 864e5).toISOString().slice(0, 10), u.household, u.email).all<{ id: string; title: string; date: string; time: string | null; place: string }>();
  return results.map((g) => ({ id: 'gather:' + g.id, title: '🎉 ' + g.title, kind: 'other', date: g.date, after_sunset: false, recur: 'none',
    note: [g.time, g.place].filter(Boolean).join(' · '), by: 'gather', from: 'gather', gather: g.id, updated_at: 0 }));
}
