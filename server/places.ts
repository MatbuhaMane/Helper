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
