// The weather (docs/ai/ready-soon.md, item 1 – the owner: finish it): Open-Meteo, free and without a key, for the city in
// the person's settings. The server asks it, so the browser talks only to us (the CSP) and the person's address stays
// here; the answers are kept at the edge – a city's place for a month, a forecast for half an hour.
//   GET /api/weather[?city=<name>] → { place: {name, region, country}, forecast: {now, hours, days, advice}, from }
// The city: the one asked for, else the settings' (me.city), else the calendar's (a GeoNames id), else Jerusalem.

import { Ctx, HttpError, json, requireUser } from './core';
import { prefsFor } from './prefs';
import * as W from './weather-logic';

const JERUSALEM = '281184';
const GEO = 'https://geocoding-api.open-meteo.com/v1';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

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

async function forecast(ctx: Ctx, p: Place): Promise<W.Forecast> {
  const lat = p.latitude.toFixed(2), lon = p.longitude.toFixed(2);
  return edge(ctx, `fc:${lat},${lon}`, 1800, async () => {
    const q = new URLSearchParams({
      latitude: lat, longitude: lon, timezone: 'auto', forecast_days: '7',
      current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m,precipitation',
      hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
    });
    return W.shape(await getJson<W.Raw>(`${FORECAST}?${q}`));
  });
}

/** GET /api/weather[?city=] */
export async function get(ctx: Ctx) {
  const u = requireUser(ctx);
  const asked = (ctx.url.searchParams.get('city') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  let city = asked, from: 'asked' | 'settings' | 'calendar' | 'default' = 'asked';
  if (!city) {
    const prefs = await prefsFor(ctx.env, u.email);
    const mine = String(prefs.me?.data?.city || '').trim().slice(0, 60);
    const cal = String(prefs.calendar?.data?.city || '');
    if (mine) { city = mine; from = 'settings'; }
    else if (/^\d{3,9}$/.test(cal)) { city = cal; from = 'calendar'; }
    else { city = JERUSALEM; from = 'default'; }
  }
  const p = await place(ctx, city);
  if (!p) throw new HttpError(404, 'city_not_found');
  return json({ place: { name: p.name, region: p.admin1 || '', country: p.country || '' }, forecast: await forecast(ctx, p), from });
}
