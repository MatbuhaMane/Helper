// The weather (docs/ai/ready-soon.md, item 1 – the owner: finish it): Open-Meteo, free and without a key, for the city in
// the person's settings. The server asks it, so the browser talks only to us (the CSP) and the person's address stays
// here; the answers are kept at the edge – a city's place for a month, a forecast for half an hour.
//   GET /api/weather[?city=<name>][&beach=<id>|home] → { place: {name, region, country}, forecast: {now, hours, days, advice}, from,
//     sea: null | { spot: {id, name}, seaAt, days: [{date, waves, period, water, dive, surf, beach}] }, beaches: [{id, name}] }
// The sea (server/sea-logic.ts): the beach asked for or chosen (prefs.weather.beach), else the place itself when it is on
// the coast (Open-Meteo Marine has a cell near it), else none.
// The city: the one asked for, else the settings' (me.city), else the calendar's (a GeoNames id), else Jerusalem.

import { Ctx, HttpError, json, requireUser } from './core';
import { prefsFor } from './prefs';
import * as W from './weather-logic';
import * as Sea from './sea-logic';

const JERUSALEM = '281184';
const GEO = 'https://geocoding-api.open-meteo.com/v1';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';

interface Place { id: number; name: string; latitude: number; longitude: number; country_code?: string; country?: string; admin1?: string }

/** a JSON answer kept at the edge for ttl seconds (a miss asks `make`) */
async function edge<T>(ctx: Ctx, key: string, ttl: number, make: () => Promise<T>): Promise<T> {
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const req = new Request('https://weather.internal/' + encodeURIComponent(key));
  const hit = await cache?.match(req).catch(() => undefined);
  if (hit) return hit.json() as Promise<T>;
  const v = await make();
  if (cache) ctx.waitUntil(cache.put(req, new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttl}` } })).catch(() => {}));
  return v;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) throw new HttpError(502, 'weather_unavailable');
  return res.json() as Promise<T>;
}

/** a city by name (Hebrew is fine), or by its GeoNames id; null when nothing matches */
async function place(ctx: Ctx, city: string): Promise<Place | null> {
  if (/^\d{3,9}$/.test(city)) {
    return edge(ctx, 'id:' + city, 30 * 86400, async () => {
      try { return await getJson<Place>(`${GEO}/get?id=${city}&language=he`); } catch { return null; }
    });
  }
  return edge(ctx, 'name:' + city, 30 * 86400, async () => {
    const r = await getJson<{ results?: Place[] }>(`${GEO}/search?name=${encodeURIComponent(city)}&count=5&language=he&format=json`);
    return W.pickPlace(r.results);
  });
}

async function forecast(ctx: Ctx, p: { latitude: number; longitude: number }): Promise<W.Forecast> {
  const lat = p.latitude.toFixed(2), lon = p.longitude.toFixed(2);
  return edge(ctx, `fc2:${lat},${lon}`, 1800, async () => {
    const q = new URLSearchParams({
      latitude: lat, longitude: lon, timezone: 'auto', forecast_days: '7',
      current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m,precipitation',
      hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max,wind_direction_10m_dominant',
    });
    return W.shape(await getJson<W.Raw>(`${FORECAST}?${q}`));
  });
}

/** the marine forecast for a point (null when the service fails: the sea is extra, the weather still shows) */
async function marine(ctx: Ctx, at: { lat: number; lon: number }): Promise<Sea.MarineRaw | null> {
  const lat = at.lat.toFixed(2), lon = at.lon.toFixed(2);
  return edge(ctx, `sea:${lat},${lon}`, 3600, async () => {
    const q = new URLSearchParams({ latitude: lat, longitude: lon, timezone: 'auto', forecast_days: '7',
      daily: 'wave_height_max,wave_period_max,swell_wave_height_max', hourly: 'sea_surface_temperature' });
    try { return await getJson<Sea.MarineRaw>(`${MARINE}?${q}`); } catch { return null; }
  });
}

/** the sea for the beach asked for or chosen, else for the place itself when it is on the coast */
async function seaFor(ctx: Ctx, p: Place, fc: W.Forecast, beachId: string) {
  const chosen = Sea.BEACHES.find((b) => b.id === beachId);
  const at = chosen ? { lat: chosen.lat, lon: chosen.lon } : { lat: p.latitude, lon: p.longitude };
  const raw = await marine(ctx, at);
  if (!raw || !Sea.coastal(raw, at)) return null;
  const land = chosen ? await forecast(ctx, { latitude: chosen.lat, longitude: chosen.lon }).catch(() => null) : fc;
  if (!land) return null;
  return { spot: chosen ? { id: chosen.id, name: chosen.name } : { id: '', name: p.name }, ...Sea.rate(raw, land.days, at) };
}

/** GET /api/weather[?city=][&beach=] */
export async function get(ctx: Ctx) {
  const u = requireUser(ctx);
  const asked = (ctx.url.searchParams.get('city') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  let city = asked, from: 'asked' | 'settings' | 'calendar' | 'default' = 'asked';
  const prefs = await prefsFor(ctx.env, u.email);
  const beachAsked = ctx.url.searchParams.get('beach');
  const beachId = beachAsked === 'home' ? '' : (beachAsked || String(prefs.weather?.data?.beach || '')).slice(0, 20);
  if (!city) {
    const mine = String(prefs.me?.data?.city || '').trim().slice(0, 60);
    const cal = String(prefs.calendar?.data?.city || '');
    if (mine) { city = mine; from = 'settings'; }
    else if (/^\d{3,9}$/.test(cal)) { city = cal; from = 'calendar'; }
    else { city = JERUSALEM; from = 'default'; }
  }
  const p = await place(ctx, city);
  if (!p) throw new HttpError(404, 'city_not_found');
  const fc = await forecast(ctx, p);
  const sea = await seaFor(ctx, p, fc, beachId).catch(() => null);
  return json({ place: { name: p.name, region: p.admin1 || '', country: p.country || '' }, forecast: fc, from,
    sea, beaches: Sea.BEACHES.map((b) => ({ id: b.id, name: b.name })) });
}
