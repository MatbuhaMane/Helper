// הגינה (docs/vision/future-specs.md §4; H.FUTURE 'garden'): the household's plants (shared by the household, the
// owner's answer), when each needs water by the weather where the household lives (garden-rules.ts, a fixed rule with no
// AI), "השקיתי" with its history, a morning push, and from a photo: what plant this is (identify), and what is wrong with it
// (the plant doctor). The photos are free with a quota (the owner, docs/business/ai-quota.md): FREE_A_DAY a person a day,
// renewed at midnight Israel time and never taken from a limited account's credits (freeOfCredits); beyond them the
// server answers 402 quota_done, and the person may go on in credits ({ paid: true }). Gemini reads the photo first,
// Claude when Gemini fails. A photo sent to identify or the doctor is not kept; a plant's own small picture is.

import Anthropic from '@anthropic-ai/sdk';
import { jsonIn } from './ai';
import { Ctx, Env, HttpError, body, json, requireUser, uid } from './core';
import { dayStart } from './cook';
import { cleanDoctor, cleanIdentify, clean, PRESETS, remindFor, RuleError, sortPlants, Wx, wxOf } from './garden-rules';
import { freeOfCredits } from './meter';
import { freshPoint } from './places';
import { prefsFor } from './prefs';
import { pushTo } from './push';

export const FREE_A_DAY = 3;   // the owner (docs/business/ai-quota.md): 3 plant photos a person a day, identify and doctor together
const MAX_PLANTS = 100;
const PHOTO_MAX = 160_000;     // a plant's own picture: the page sends a small JPEG (about 320 px)
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const JERUSALEM = { lat: 31.77, lng: 35.21 };

const rule = <T>(f: () => T): T => {
  try { return f(); } catch (e) { if (e instanceof RuleError) throw new HttpError(400, e.code); throw e; }
};

/* ---------------- the weather where the person lives ---------------- */
// open-meteo (open, no key; only a rounded point is sent). Kept for an hour in the Worker's memory, so it also works in
// the morning cron, which has no request to cache through.
const wxCache = new Map<string, { at: number; wx: Wx | null }>();
const cityCache = new Map<string, { lat: number; lng: number } | null>();

async function pointFor(env: Env, email: string | null): Promise<{ lat: number; lng: number }> {
  if (!email) return JERUSALEM;
  try {
    const me = (await prefsFor(env, email)).me?.data || {};
    const city = typeof me.city === 'string' ? me.city.trim().slice(0, 80) : '';
    const fresh = freshPoint(me.place, city);
    if (fresh) return fresh;
    if (!city) return JERUSALEM;
    if (!cityCache.has(city)) {
      const url = /^\d{3,9}$/.test(city) ? `https://geocoding-api.open-meteo.com/v1/get?id=${city}`
        : `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=he&format=json`;
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) }).then((x) => (x.ok ? x.json() : null)).catch(() => null) as any;
      const p = r?.results?.[0] || r;
      cityCache.set(city, Number.isFinite(p?.latitude) ? { lat: p.latitude, lng: p.longitude } : null);
    }
    return cityCache.get(city) || JERUSALEM;
  } catch { return JERUSALEM; }
}

async function wxAt(pt: { lat: number; lng: number }, t: string): Promise<Wx | null> {
  const key = `${pt.lat.toFixed(1)},${pt.lng.toFixed(1)}`;
  const hit = wxCache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.wx;
  const q = new URLSearchParams({ latitude: pt.lat.toFixed(2), longitude: pt.lng.toFixed(2), daily: 'temperature_2m_max,precipitation_sum',
    past_days: '1', forecast_days: '2', timezone: 'Asia/Jerusalem' });
  const d = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(3000) }).then((x) => (x.ok ? x.json() : null)).catch(() => null) as any;
  const wx = wxOf(d?.daily, t);
  wxCache.set(key, { at: Date.now(), wx });
  return wx;
}

/* ---------------- the plants ---------------- */

/** GET /api/garden → { plants (sorted, with due), presets, log (the last 40 waterings), today, wx, people, quota } */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const db = ctx.env.DB;
  const t = today();
  const [plants, people, log, wx, used] = await Promise.all([
    db.prepare(`SELECT id, name, kind, place, every_days, last_watered, note, updated_at, photo IS NOT NULL AS has_photo, COALESCE(remind_to, created_by) AS remind_to
                FROM garden_plants WHERE household = ?`).bind(u.household).all(),
    db.prepare('SELECT email, COALESCE(he_name, name) AS name FROM members WHERE household = ? ORDER BY name').bind(u.household).all(),
    db.prepare(`SELECT l.plant, l.kind, l.on_date, l.note, l.at, COALESCE(m.he_name, m.name) AS who FROM garden_log l LEFT JOIN members m ON m.email = l.by_email
                WHERE l.household = ? AND l.plant != '' ORDER BY l.at DESC LIMIT 40`).bind(u.household).all(),
    pointFor(ctx.env, u.email).then((pt) => wxAt(pt, t)),
    usedToday(ctx.env, u.email),
  ]);
  return json({ plants: sortPlants(plants.results as any[], t, wx), presets: PRESETS, log: log.results, today: t, wx,
    people: people.results, me: u.email, quota: { free: FREE_A_DAY, used } });
}

/** POST /api/garden (new) and PUT /api/garden/:id (change). { photo: data URL } sets the plant's picture, null removes it. */
export async function save(ctx: Ctx) {
  const u = requireUser(ctx);
  const input = await body(ctx.req);
  const p = rule(() => clean(input, today()));
  const db = ctx.env.DB;
  const now = Date.now();
  const to = typeof input?.remind_to === 'string' && input.remind_to ? input.remind_to.toLowerCase() : null;
  if (to && !(await db.prepare('SELECT 1 FROM members WHERE household = ? AND email = ?').bind(u.household, to).first())) throw new HttpError(400, 'bad_person');
  let photo: string | null | undefined;
  if ('photo' in (input || {})) {
    photo = input.photo == null || input.photo === '' ? null : String(input.photo);
    if (photo && (photo.length > PHOTO_MAX || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo))) throw new HttpError(400, 'bad_photo');
  }
  if (ctx.params.id) {
    const r = await db.prepare(`UPDATE garden_plants SET name = ?, kind = ?, place = ?, every_days = ?, last_watered = ?, note = ?, updated_at = ?,
                                 remind_to = CASE WHEN ? THEN ? ELSE remind_to END, photo = CASE WHEN ? THEN ? ELSE photo END
                                 WHERE household = ? AND id = ?`)
      .bind(p.name, p.kind, p.place, p.every_days, p.last_watered, p.note, now, 'remind_to' in (input || {}) ? 1 : 0, to,
        photo !== undefined ? 1 : 0, photo ?? null, u.household, ctx.params.id).run();
    if (!r.meta.changes) throw new HttpError(404, 'not_found');
    return json({ id: ctx.params.id });
  }
  const n = await db.prepare('SELECT COUNT(*) AS n FROM garden_plants WHERE household = ?').bind(u.household).first<{ n: number }>();
  if ((n?.n || 0) >= MAX_PLANTS) throw new HttpError(400, 'too_many');
  const id = uid();
  await db.prepare(`INSERT INTO garden_plants (household, id, name, kind, place, every_days, last_watered, note, photo, created_by, remind_to, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(u.household, id, p.name, p.kind, p.place, p.every_days, p.last_watered, p.note, photo ?? null, u.email, to && to !== u.email ? to : null, now, now).run();
  return json({ id });
}

/** GET /api/garden/:id/photo → the plant's own picture */
export async function photo(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ctx.env.DB.prepare('SELECT photo FROM garden_plants WHERE household = ? AND id = ?').bind(u.household, ctx.params.id).first<{ photo: string | null }>();
  const m = r?.photo && /^data:(image\/[a-z]+);base64,(.+)$/.exec(r.photo);
  if (!m) throw new HttpError(404, 'not_found');
  const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { 'content-type': m[1], 'cache-control': 'private, max-age=300' } });
}

/** POST /api/garden/:id/water { date? } → "השקיתי" (today, or the date given, never in the future) */
export async function water(ctx: Ctx) {
  const u = requireUser(ctx);
  const t = today();
  const input = await body<{ date?: string }>(ctx.req).catch(() => ({} as { date?: string }));
  const date = input?.date || t;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > t) throw new HttpError(400, 'bad_date');
  const db = ctx.env.DB;
  const r = await db.prepare('UPDATE garden_plants SET last_watered = MAX(COALESCE(last_watered, \'\'), ?), updated_at = ? WHERE household = ? AND id = ?')
    .bind(date, Date.now(), u.household, ctx.params.id).run();
  if (!r.meta.changes) throw new HttpError(404, 'not_found');
  await db.prepare('INSERT INTO garden_log (household, plant, kind, on_date, note, by_email, at) VALUES (?, ?, ?, ?, NULL, ?, ?)')
    .bind(u.household, ctx.params.id, 'water', date, u.email, Date.now()).run();
  return json({ ok: true, date });
}

/** DELETE /api/garden/:id (with its log) */
export async function remove(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM garden_plants WHERE household = ? AND id = ?').bind(u.household, ctx.params.id),
    ctx.env.DB.prepare('DELETE FROM garden_log WHERE household = ? AND plant = ?').bind(u.household, ctx.params.id),
  ]);
  return json({ ok: true });
}

/* ---------------- from a photo: identify, and the plant doctor ---------------- */

async function usedToday(env: Env, email: string) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM garden_log WHERE by_email = ? AND kind IN ('identify', 'doctor') AND at >= ?")
    .bind(email, dayStart()).first<{ n: number }>().catch(() => null);
  return r?.n || 0;
}

function parseImage(img: unknown) {
  const m = typeof img === 'string' && img.length < 7_000_000 ? /^data:(image\/(png|jpe?g|webp));base64,(.+)$/i.exec(img) : null;
  if (!m) throw new HttpError(400, 'bad_photo');
  return { mime: m[1].toLowerCase().replace('jpg', 'jpeg'), data: m[3] };
}

async function viaGemini(env: Env, sys: string, user: string, img: { mime: string; data: string }) {
  const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
  const base = (env.DEV_MODE === '1' && env.GEMINI_BASE_URL) || 'https://generativelanguage.googleapis.com';
  const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: img.mime, data: img.data } }, { text: user }] }],
      generationConfig: { responseMimeType: 'application/json' } }),
  });
  if (!res.ok) { console.error('Gemini (garden)', res.status, (await res.text().catch(() => '')).slice(0, 300)); throw new HttpError(502, `gemini_error_${res.status}`); }
  const d = (await res.json()) as any;
  return jsonIn(d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '');
}

async function viaClaude(env: Env, sys: string, user: string, img: { mime: string; data: string }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1 });
  const r = await client.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 1500, system: sys,
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } }, { type: 'text', text: user }] }] } as any);
  return jsonIn((r.content as any[]).map((b) => (b.type === 'text' ? b.text : '')).join(''));
}

/** the quota, then Gemini, then Claude; a successful answer is counted (garden_log) */
async function look(ctx: Ctx, kind: 'identify' | 'doctor', sys: string, user: string) {
  const u = requireUser(ctx);
  const input = await body(ctx.req);
  const img = parseImage(input?.image);
  const used = await usedToday(ctx.env, u.email);
  if (used >= FREE_A_DAY && input?.paid !== true) throw new HttpError(402, 'quota_done');
  if (used < FREE_A_DAY) freeOfCredits();   // the free photos are never taken from a limited account's credits (meter.ts)
  if (!ctx.env.GEMINI_API_KEY && !ctx.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'ai_not_configured');
  let raw: any = null;
  for (const via of [ctx.env.GEMINI_API_KEY ? viaGemini : null, ctx.env.ANTHROPIC_API_KEY ? viaClaude : null]) {
    if (!via) continue;
    try { raw = await via(ctx.env, sys, user, img); if (raw) break; } catch (e) { console.error('garden', kind, e instanceof Error ? e.message : e); }
  }
  if (!raw) throw new HttpError(502, 'ai_failed');
  const plant = typeof input?.plant === 'string' ? input.plant.slice(0, 40) : '';
  return { u, raw, used: used + 1, plant };
}

const PLANT_KINDS = PRESETS.map((p) => `${p.kind} (${p.name})`).join(', ');

/** POST /api/garden/identify { image, paid? } → { name, kind, place, every_days, care, sure, used, free } */
export async function identify(ctx: Ctx) {
  const { u, raw, used } = await look(ctx, 'identify',
    'אתה גנן ישראלי מנוסה. מזהים צמח מתמונה. ענה ב-JSON בלבד: {"name": שם הצמח בעברית, "kind": אחד מהבאים אם מתאים, אחרת "custom": '
      + `${PLANT_KINDS}, "place": "in" לצמח בית או "out" לגינה ולמרפסת, "every_days": כל כמה ימים להשקות בישראל, `
      + '"care": שניים או שלושה משפטים קצרים בעברית, בפנייה ברבים (אתם), על אור, השקיה וטיפ אחד, "sure": true רק אם הזיהוי ברור}. '
      + 'אם אין צמח בתמונה, name יהיה "לא נמצא צמח" ו-sure false.',
    'מה הצמח הזה?');
  await ctx.env.DB.prepare('INSERT INTO garden_log (household, plant, kind, on_date, note, by_email, at) VALUES (?, \'\', \'identify\', ?, NULL, ?, ?)')
    .bind(u.household, today(), u.email, Date.now()).run();
  return json({ ...cleanIdentify(raw), used, free: FREE_A_DAY });
}

/** POST /api/garden/doctor { image, plant?, paid? } → { plant, problem, why, steps, urgent, used, free }; with a plant, it
    is written in that plant's history */
export async function doctor(ctx: Ctx) {
  const { u, raw, used, plant } = await look(ctx, 'doctor',
    'אתה רופא צמחים ישראלי מנוסה וזהיר. מסתכלים בתמונה של צמח ואומרים מה כנראה הבעיה ומה לעשות. ענה ב-JSON בלבד: '
      + '{"plant": שם הצמח בעברית אם ברור, "problem": הבעיה במשפט קצר, "why": למה זה קורה, משפט או שניים, '
      + '"steps": עד חמישה צעדים קצרים לטיפול, בפנייה ברבים (אתם), "urgent": true רק אם הצמח בסכנה ממשית}. '
      + 'העדיפו טיפול ביתי ופשוט. אם צריך חומר הדברה, אמרו לקרוא את ההוראות ולהרחיק מילדים ומחיות. אם הצמח נראה בריא, אמרו זאת.',
    'מה קורה לצמח הזה, ומה לעשות?');
  const d = cleanDoctor(raw);
  let own = '';
  if (plant && (await ctx.env.DB.prepare('SELECT 1 FROM garden_plants WHERE household = ? AND id = ?').bind(u.household, plant).first())) own = plant;
  await ctx.env.DB.prepare('INSERT INTO garden_log (household, plant, kind, on_date, note, by_email, at) VALUES (?, ?, \'doctor\', ?, ?, ?, ?)')
    .bind(u.household, own, today(), d.problem, u.email, Date.now()).run();
  return json({ ...d, used, free: FREE_A_DAY });
}

/* ---------------- the morning ---------------- */

/** the morning (src/worker.ts, with the home reminders): one push to each person, naming the plants that need water today */
export async function remind(env: Env): Promise<number> {
  const t = today();
  const { results } = await env.DB.prepare(`SELECT household, id, name, place, every_days, last_watered, reminded, created_by, COALESCE(remind_to, created_by) AS who
    FROM garden_plants WHERE last_watered IS NOT NULL`)
    .all<{ household: string; id: string; name: string; place: 'in' | 'out'; every_days: number; last_watered: string; reminded: string | null; created_by: string | null; who: string | null }>();
  const wxs = new Map<string, Wx | null>();   // one weather a household, where whoever added its first plant lives
  const to = new Map<string, string[]>();
  for (const p of results) {
    if (!wxs.has(p.household)) wxs.set(p.household, await wxAt(await pointFor(env, p.created_by), t).catch(() => null));
    const next = remindFor(p, t, wxs.get(p.household) || null);
    if (!next || !p.who) continue;
    await env.DB.prepare('UPDATE garden_plants SET reminded = ? WHERE household = ? AND id = ?').bind(next, p.household, p.id).run();
    to.set(p.who, [...(to.get(p.who) || []), p.name]);
  }
  let n = 0;
  for (const [who, names] of to) {
    n += await pushTo(env, [who], { title: '🌱 הגינה', body: names.length === 1 ? `${names[0]} צריך מים היום.` : `צריכים מים היום: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ' ועוד' : ''}.`,
      url: '/tools/garden/', tag: 'garden', kind: 'reminder' }).catch(() => 0);
  }
  return n;
}
