// Restaurants near a place, from Google Places (the owner's choice C, docs/ai/restaurants.md) – on request only.
// Google's terms: only place IDs may be kept; names, addresses and ratings may not be stored or shared, so every search
// is a real call, and nothing of the answer is kept on the server. Results show "Google Maps" as their source.
// Around the city in the person's settings (a text search) or where the device is now, with its permission (a nearby
// search; the coordinates are used for that one call and not kept). Each person has a monthly number of searches;
// the owner's family has none (the same "limited" as the AI allowance); and the whole site stops below Google's free
// monthly 5,000, so a bill cannot run away.   Tests: node server/test-places.mjs

import { Ctx, Env, HttpError, body, json, requireUser } from './core';

export const PER_PERSON = 20;          // searches a month for someone with a limit
export const SITE_MONTH = 4500;        // the whole site, a month (Google's free tier for these searches is 5,000)
const FIELDS = 'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.primaryTypeDisplayName';   // the "Pro" fields only

const keyOf = (env: Env) => env.GOOGLE_MAPS_API_KEY || '';
export const month = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);

/** may this search go: the person's own count and the site's, against the limits */
export function mayAsk(limited: boolean, mine: number, site: number): { ok: boolean; why?: 'person' | 'site'; left: number | null } {
  if (site >= SITE_MONTH) return { ok: false, why: 'site', left: limited ? Math.max(0, PER_PERSON - mine) : null };
  if (limited && mine >= PER_PERSON) return { ok: false, why: 'person', left: 0 };
  return { ok: true, left: limited ? PER_PERSON - mine - 1 : null };
}

/** the request to Google: a text search around a city, or a nearby search around a point */
export function request(q: { city?: string; lat?: number; lng?: number; kosher?: boolean }) {
  if (typeof q.lat === 'number' && typeof q.lng === 'number') {
    if (Math.abs(q.lat) > 90 || Math.abs(q.lng) > 180) throw new HttpError(400, 'Invalid place');
    return { url: 'https://places.googleapis.com/v1/places:searchNearby', body: {
      includedTypes: ['restaurant'], maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'he', regionCode: 'IL',
      locationRestriction: { circle: { center: { latitude: q.lat, longitude: q.lng }, radius: 1500 } } } };
  }
  const city = String(q.city || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!city) throw new HttpError(400, 'no_city');
  return { url: 'https://places.googleapis.com/v1/places:searchText', body: {
    textQuery: `${q.kosher ? 'מסעדות כשרות' : 'מסעדות'} ב${city}`, includedType: 'restaurant', pageSize: 20, languageCode: 'he', regionCode: 'IL' } };
}

/** Google's answer as the page shows it (nothing of it is stored) */
export function results(data: any) {
  return (Array.isArray(data?.places) ? data.places : []).map((p: any) => ({
    id: String(p.id || ''), name: String(p.displayName?.text || ''), address: String(p.formattedAddress || ''),
    kind: String(p.primaryTypeDisplayName?.text || ''), maps: /^https:\/\//.test(p.googleMapsUri || '') ? p.googleMapsUri : '',
  })).filter((p: { id: string; name: string }) => p.id && p.name);
}

async function counts(env: Env, email: string) {
  const m = month();
  const [me, site, a] = await Promise.all([
    env.DB.prepare('SELECT n FROM places_usage WHERE email = ? AND month = ?').bind(email, m).first<{ n: number }>(),
    env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM places_usage WHERE month = ?').bind(m).first<{ n: number }>(),
    env.DB.prepare('SELECT limited FROM ai_allowance WHERE email = ?').bind(email).first<{ limited: number }>(),
  ]);
  return { mine: me?.n || 0, site: site?.n || 0, limited: !!a?.limited };
}

/** GET /api/restaurants/search → { configured, left } (left: null = no limit) */
export async function status(ctx: Ctx) {
  const u = requireUser(ctx);
  if (!keyOf(ctx.env)) return json({ configured: false, left: null });
  const c = await counts(ctx.env, u.email);
  return json({ configured: true, left: c.limited ? Math.max(0, PER_PERSON - c.mine) : null, full: c.site >= SITE_MONTH });
}

/** POST /api/restaurants/search {city, kosher} | {lat, lng} → { places, left } */
export async function search(ctx: Ctx) {
  const u = requireUser(ctx);
  const key = keyOf(ctx.env);
  if (!key) throw new HttpError(503, 'places_not_configured');
  const q = await body<{ city?: string; lat?: number; lng?: number; kosher?: boolean }>(ctx.req);
  const req = request(q);
  const c = await counts(ctx.env, u.email);
  const may = mayAsk(c.limited, c.mine, c.site);
  if (!may.ok) throw new HttpError(429, may.why === 'site' ? 'places_month_full' : 'places_quota');
  // counted before the call, so two at once cannot both slip past the limit
  await ctx.env.DB.prepare('INSERT INTO places_usage (email, month, n) VALUES (?, ?, 1) ON CONFLICT(email, month) DO UPDATE SET n = n + 1').bind(u.email, month()).run();
  const res = await fetch(req.url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'x-goog-fieldmask': FIELDS }, body: JSON.stringify(req.body) });
  if (!res.ok) {
    console.error('places', res.status, (await res.text().catch(() => '')).slice(0, 300));
    throw new HttpError(502, 'places_error');
  }
  return json({ places: results(await res.json()), left: may.left });
}

/* ---------------- the home: a real place in Israel for "איפה הבית?" (the owner, 2026-11-13) ----------------
   Google Places Autocomplete (New), towns and neighbourhoods in Israel, while the person types; picking one asks Place
   Details for its point (the "Essentials" field only: location). Both calls share one session token from the page, so
   Google bills the typing and the pick as one session. The key stays here.
   Google's terms: the place ID may be kept for good; the point may be kept up to 30 days. So the page stores
   me.place = {id, name, lat, lng, at} next to me.city, and whoever uses the point (the weather) uses it only while it is
   under 30 days old and its name is still me.city; after that the weather asks Google again by the ID (pointById, kept
   at the edge for a day), and without an ID the city's name is looked up as before. The name is the
   person's own pick (the suggestion's main text); nothing of Google's answer is kept here.
   Counted per month in places_usage under their own keys ('ac:' + month, 'pd:' + month), apart from the restaurants:
   a person with a limit has HOME_PERSON of each, and the site stops under Google's free 10,000 of each. */
export const HOME_PERSON = { ac: 150, pd: 10 };
export const HOME_SITE = 9000;
export const POINT_DAYS = 30;
const HOME_TYPES = ['locality', 'sublocality', 'neighborhood', 'administrative_area_level_3'];
const IL = { lat: [29.3, 33.5], lng: [34.2, 36] };     // a box around Israel: an answer outside it is not taken
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

/** may this home call go ('ac' typing, 'pd' the pick) */
export function homeMay(kind: 'ac' | 'pd', limited: boolean, mine: number, site: number): { ok: boolean; why?: 'person' | 'site' } {
  if (site >= HOME_SITE) return { ok: false, why: 'site' };
  if (limited && mine >= HOME_PERSON[kind]) return { ok: false, why: 'person' };
  return { ok: true };
}

/** the page's session token (a UUID or alike); '' when it is not one */
export const cleanToken = (t: unknown) => (typeof t === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(t) ? t : '');
/** a place ID as Google gives it; '' when it is not one */
export const cleanPlaceId = (id: unknown) => (typeof id === 'string' && PLACE_ID.test(id) ? id : '');

/** the autocomplete request for what was typed */
export function suggestRequest(q: unknown, token: string) {
  const input = String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (input.length < 2) throw new HttpError(400, 'too_short');
  return { input, ...(token ? { sessionToken: token } : {}), languageCode: 'he', regionCode: 'il',
    includedRegionCodes: ['il'], includedPrimaryTypes: HOME_TYPES };
}

/** Google's suggestions as the page shows them: {id, name, sub} (at most 5) */
export function suggestions(data: any) {
  return (Array.isArray(data?.suggestions) ? data.suggestions : []).map((s: any) => s?.placePrediction).filter(Boolean).map((p: any) => ({
    id: String(p.placeId || ''), name: String(p.structuredFormat?.mainText?.text || p.text?.text || ''), sub: String(p.structuredFormat?.secondaryText?.text || ''),
  })).filter((p: { id: string; name: string }) => PLACE_ID.test(p.id) && p.name).slice(0, 5);
}

/** the point of a Place Details answer, rounded to about 100 m; null when there is none or it is outside Israel */
export function pointOf(data: any): { lat: number; lng: number } | null {
  const lat = Number(data?.location?.latitude), lng = Number(data?.location?.longitude);
  if (data?.location?.latitude == null || data?.location?.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < IL.lat[0] || lat > IL.lat[1] || lng < IL.lng[0] || lng > IL.lng[1]) return null;
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}

/** me.place, if it may still be used for the city: the same name, under POINT_DAYS old */
export function freshPoint(place: any, city: string, now = Date.now()): { lat: number; lng: number } | null {
  if (!place || typeof place !== 'object' || !String(city || '').trim()) return null;
  const lat = Number(place.lat), lng = Number(place.lng), at = Number(place.at);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(at)) return null;
  if (String(place.name || '').trim() !== String(city).trim()) return null;
  if (now - at > POINT_DAYS * 86400e3 || at > now + 60e3) return null;
  if (lat < IL.lat[0] || lat > IL.lat[1] || lng < IL.lng[0] || lng > IL.lng[1]) return null;
  return { lat, lng };
}

async function homeCount(ctx: Ctx, email: string, kind: 'ac' | 'pd') {
  const m = kind + ':' + month();
  const [me, site, a] = await Promise.all([
    ctx.env.DB.prepare('SELECT n FROM places_usage WHERE email = ? AND month = ?').bind(email, m).first<{ n: number }>(),
    ctx.env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM places_usage WHERE month = ?').bind(m).first<{ n: number }>(),
    ctx.env.DB.prepare('SELECT limited FROM ai_allowance WHERE email = ?').bind(email).first<{ limited: number }>(),
  ]);
  const may = homeMay(kind, !!a?.limited, me?.n || 0, site?.n || 0);
  if (!may.ok) throw new HttpError(429, may.why === 'site' ? 'places_month_full' : 'places_quota');
  await ctx.env.DB.prepare('INSERT INTO places_usage (email, month, n) VALUES (?, ?, 1) ON CONFLICT(email, month) DO UPDATE SET n = n + 1').bind(email, m).run();
}

/** the point of a kept place ID, asked again (Place Details, location only) – for the weather once me.place is over
    30 days old; null without a key or on any failure. The caller keeps it at the edge for a day at most. */
export async function pointById(env: Env, id: unknown): Promise<{ lat: number; lng: number } | null> {
  const key = keyOf(env), pid = cleanPlaceId(id);
  if (!key || !pid) return null;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(pid)}`, { headers: { 'x-goog-api-key': key, 'x-goog-fieldmask': 'id,location' } });
    return res.ok ? pointOf(await res.json()) : null;
  } catch { return null; }
}

/** POST /api/places/home/suggest {q, session} → { configured, places: [{id, name, sub}] } */
export async function homeSuggest(ctx: Ctx) {
  const u = requireUser(ctx);
  const key = keyOf(ctx.env);
  if (!key) return json({ configured: false, places: [] });
  const b = await body<{ q?: string; session?: string }>(ctx.req);
  const req = suggestRequest(b.q, cleanToken(b.session));
  await homeCount(ctx, u.email, 'ac');
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'x-goog-fieldmask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat' },
    body: JSON.stringify(req) });
  if (!res.ok) { console.error('places home suggest', res.status, (await res.text().catch(() => '')).slice(0, 300)); throw new HttpError(502, 'places_error'); }
  return json({ configured: true, places: suggestions(await res.json()) });
}

/** POST /api/places/home/pick {id, session} → { id, lat, lng } (the point, for the page to keep up to 30 days) */
export async function homePick(ctx: Ctx) {
  const u = requireUser(ctx);
  const key = keyOf(ctx.env);
  if (!key) throw new HttpError(503, 'places_not_configured');
  const b = await body<{ id?: string; session?: string }>(ctx.req);
  const id = cleanPlaceId(b.id), token = cleanToken(b.session);
  if (!id) throw new HttpError(400, 'bad_place');
  await homeCount(ctx, u.email, 'pd');
  const q = new URLSearchParams({ languageCode: 'he', regionCode: 'il', ...(token ? { sessionToken: token } : {}) });
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?${q}`, { headers: { 'x-goog-api-key': key, 'x-goog-fieldmask': 'id,location' } });
  if (!res.ok) { console.error('places home pick', res.status, (await res.text().catch(() => '')).slice(0, 300)); throw new HttpError(502, 'places_error'); }
  const p = pointOf(await res.json());
  if (!p) throw new HttpError(422, 'not_in_israel');
  return json({ id, ...p });
}
