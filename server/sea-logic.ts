// The sea (the owner, 2026-11-13): is a day good for diving, surfing or a day at the beach? Pure logic; server/weather.ts
// fetches Open-Meteo's Marine API (free, no key) and the regular forecast, this rates. Tests: server/test-sea.mjs.
// Near the coast only: inland the marine model has no cell (nulls), and a cell too far away is not "the sea here".

/** The thresholds, in one place. Each rule gives "good" up to `good`, "fair" up to `fair`, and "poor" beyond
 *  (for a range rule, inside [lo, hi] is good and inside [lo2, hi2] fair). Waves in metres, periods in seconds,
 *  wind in km/h, temperatures in °C, rain as the day's highest chance in %. */
export const LIMITS = {
  dive: {
    waves: { good: 0.5, fair: 1.0 },        // the highest wave of the day: calm water for entering from the shore
    wind: { good: 20, fair: 30 },           // the day's strongest wind
    rain: { good: 40, fair: 70 },           // runoff clouds the water near the shore
    water: { fair: 18 },                    // colder than this: still possible, in a thick suit
    clearAfter: 0.8,                        // the day before rougher than this: the water is still murky ("ראות בינונית")
  },
  surf: {
    waves: { lo: 0.9, hi: 2.5, lo2: 0.6, hi2: 3.5 },   // below 0.6 flat, above 3.5 for no one here
    period: { good: 7, fair: 5 },           // shorter than 5 s: short, messy waves
    onshore: { fair: 25, poor: 35 },        // a sea wind this strong spoils the waves
  },
  beach: {
    air: { lo: 24, hi: 33, lo2: 20, hi2: 36 },
    rain: { good: 25, fair: 50 },
    wind: { good: 25, fair: 35 },
    waves: { good: 1.0, fair: 1.5 },        // above 1.5: a rough sea, not for swimming
    water: { fair: 19 },
    uv: 8,                                  // from this up the reason says: a hat and sunscreen
  },
  coastKm: 30,                              // the marine cell must be this close to the place
} as const;

/** beaches to choose from (the place in the settings is the default) */
export const BEACHES = [
  { id: 'akhziv', name: 'אכזיב', lat: 33.05, lon: 35.1 },
  { id: 'batgalim', name: 'חיפה – בת גלים', lat: 32.833, lon: 34.976 },
  { id: 'dor', name: 'דור–הבונים', lat: 32.64, lon: 34.92 },
  { id: 'caesarea', name: 'קיסריה', lat: 32.5, lon: 34.89 },
  { id: 'michmoret', name: 'מכמורת', lat: 32.4, lon: 34.86 },
  { id: 'netanya', name: 'נתניה', lat: 32.33, lon: 34.85 },
  { id: 'herzliya', name: 'הרצליה', lat: 32.165, lon: 34.8 },
  { id: 'telaviv', name: 'תל אביב', lat: 32.08, lon: 34.765 },
  { id: 'palmachim', name: 'פלמחים', lat: 31.93, lon: 34.7 },
  { id: 'ashdod', name: 'אשדוד', lat: 31.8, lon: 34.63 },
  { id: 'ashkelon', name: 'אשקלון', lat: 31.67, lon: 34.55 },
  { id: 'eilat', name: 'אילת – חוף האלמוגים', lat: 29.51, lon: 34.92 },
];

export type Level = 'good' | 'fair' | 'poor';
export interface Rating { level: Level; why: string }
/** one day, as the rules read it (null: the model has no value) */
export interface SeaDay {
  date: string;
  waves: number | null; period: number | null; swell: number | null; water: number | null;
  air: number; rain: number; wind: number; windDir: number | null; uv: number | null;
}
/** Open-Meteo Marine's answer, the fields we ask for */
export interface MarineRaw {
  latitude: number; longitude: number;
  daily?: { time: string[]; wave_height_max: (number | null)[]; wave_period_max: (number | null)[]; swell_wave_height_max: (number | null)[] };
  hourly?: { time: string[]; sea_surface_temperature: (number | null)[] };
}

const RANK: Record<Level, number> = { good: 0, fair: 1, poor: 2 };
export const LABEL: Record<Level, string> = { good: 'טוב', fair: 'בינוני', poor: 'לא מתאים' };
const worse = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);
const upTo = (v: number, t: { good: number; fair: number }): Level => (v <= t.good ? 'good' : v <= t.fair ? 'fair' : 'poor');
const within = (v: number, t: { lo: number; hi: number; lo2: number; hi2: number }): Level =>
  v >= t.lo && v <= t.hi ? 'good' : v >= t.lo2 && v <= t.hi2 ? 'fair' : 'poor';
const m = (v: number) => `${String(Math.round(v * 10) / 10)} מ׳`;

/** the distance in km between two points (haversine) */
export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** the compass bearing (0 = north, 90 = east) from a to b */
export function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
/** the wind against the shore: 'onshore' (from the sea), 'offshore' (from the land) or 'side' (or null when unknown) */
export function windSide(windFrom: number | null, seaAt: number | null): 'onshore' | 'offshore' | 'side' | null {
  if (windFrom == null || seaAt == null) return null;
  const d = Math.abs(((windFrom - seaAt + 540) % 360) - 180);   // 0: the wind comes from where the sea is
  return d <= 60 ? 'onshore' : d >= 120 ? 'offshore' : 'side';
}

/** the reason line: the deciding (worst) points when not good, else the good points; at most three */
function verdict(points: { level: Level; text: string }[], good: string[]): Rating {
  const level = points.reduce<Level>((w, p) => worse(w, p.level), 'good');
  const why = level === 'good' ? good : points.filter((p) => p.level === level).map((p) => p.text);
  return { level, why: why.filter(Boolean).slice(0, 3).join(', ') };
}

export function dive(d: SeaDay, before?: SeaDay | null): Rating {
  const L = LIMITS.dive, p: { level: Level; text: string }[] = [];
  if (d.waves != null) p.push({ level: upTo(d.waves, L.waves), text: `גלים ${m(d.waves)}` });
  p.push({ level: upTo(d.wind, L.wind), text: `רוח ${d.wind} קמ״ש` });
  if (d.rain > L.rain.good) p.push({ level: upTo(d.rain, L.rain), text: 'גשם: מים עכורים' });
  const murky = before?.waves != null && before.waves > L.clearAfter;
  if (murky) p.push({ level: 'fair', text: 'ראות בינונית אחרי ים גבוה' });
  if (d.water != null && d.water < L.water.fair) p.push({ level: 'fair', text: `מים ${Math.round(d.water)}°: חליפה עבה` });
  return verdict(p, [d.waves != null ? `גלים ${m(d.waves)}` : 'אין נתוני גלים', 'ראות טובה', d.water != null ? `מים ${Math.round(d.water)}°` : '']);
}

export function surf(d: SeaDay, seaAt: number | null): Rating {
  const L = LIMITS.surf, p: { level: Level; text: string }[] = [];
  if (d.waves == null) return { level: 'poor', why: 'אין כאן נתוני גלים' };
  const w = within(d.waves, L.waves);
  p.push({ level: w, text: d.waves < L.waves.lo ? (d.waves < L.waves.lo2 ? `ים שטוח (${m(d.waves)})` : `גלים קטנים ${m(d.waves)}`) : d.waves > L.waves.hi ? `גלים גבוהים ${m(d.waves)}, למנוסים` : `גלים ${m(d.waves)}` });
  if (d.period != null) p.push({ level: d.period >= L.period.good ? 'good' : d.period >= L.period.fair ? 'fair' : 'poor', text: d.period < L.period.fair ? 'גלים קצרים ומבולגנים' : `מחזור ${Math.round(d.period)} שנ׳` });
  const side = windSide(d.windDir, seaAt);
  if (side === 'onshore' && d.wind >= L.onshore.fair) p.push({ level: d.wind >= L.onshore.poor ? 'poor' : 'fair', text: `רוח ים ${d.wind} קמ״ש` });
  const good = [`גלים ${m(d.waves)}`, d.period != null ? `מחזור ${Math.round(d.period)} שנ׳` : '', side === 'offshore' ? 'רוח מהיבשה' : ''];
  return verdict(p, good);
}

export function beach(d: SeaDay): Rating {
  const L = LIMITS.beach, p: { level: Level; text: string }[] = [];
  p.push({ level: within(d.air, L.air), text: d.air < L.air.lo ? `קריר (${d.air}°)` : d.air > L.air.hi ? `חם מאוד (${d.air}°)` : `${d.air}°` });
  if (d.rain > L.rain.good) p.push({ level: upTo(d.rain, L.rain), text: `${d.rain}% סיכוי לגשם` });
  p.push({ level: upTo(d.wind, L.wind), text: `רוח ${d.wind} קמ״ש` });
  if (d.waves != null) p.push({ level: upTo(d.waves, L.waves), text: d.waves > L.waves.fair ? `ים סוער (${m(d.waves)})` : `גלים ${m(d.waves)}` });
  if (d.water != null && d.water < L.water.fair) p.push({ level: 'fair', text: `מים קרים (${Math.round(d.water)}°)` });
  const good = [`${d.air}°`, d.water != null ? `מים ${Math.round(d.water)}°` : '', (d.uv ?? 0) >= L.uv ? 'קרם הגנה וכובע' : 'ים נוח'];
  return verdict(p, good);
}

/** the marine cell is near enough to count as this place's sea, and has data */
export function coastal(raw: MarineRaw | null, at: { lat: number; lon: number }): boolean {
  if (!raw?.daily && !raw?.hourly) return false;
  if (km(at, { lat: raw.latitude, lon: raw.longitude }) > LIMITS.coastKm) return false;
  return !!(raw.daily?.wave_height_max.some((v) => v != null) || raw.hourly?.sea_surface_temperature.some((v) => v != null));
}

/** the water's temperature for a day: the hourly value nearest noon */
function waterOn(raw: MarineRaw, date: string): number | null {
  const h = raw.hourly; if (!h) return null;
  const i = h.time.indexOf(date + 'T12:00');
  const v = i >= 0 ? h.sea_surface_temperature[i] : null;
  return v == null ? null : Math.round(v * 10) / 10;
}

/** the days, each rated for diving, surfing and the beach; the land forecast's days give air, rain, wind and UV */
export function rate(raw: MarineRaw, land: { date: string; max: number; rain: number; wind?: number; windDir?: number | null; uv: number | null }[], at: { lat: number; lon: number }) {
  const seaAt = km(at, { lat: raw.latitude, lon: raw.longitude }) >= 1 ? Math.round(bearing(at, { lat: raw.latitude, lon: raw.longitude })) : null;
  const t = raw.daily?.time || [];
  const days: SeaDay[] = land.map((l) => {
    const i = t.indexOf(l.date);
    const at2 = (arr: (number | null)[] | undefined) => (i >= 0 && arr?.[i] != null ? Math.round(arr[i]! * 10) / 10 : null);
    return { date: l.date, waves: at2(raw.daily?.wave_height_max), period: at2(raw.daily?.wave_period_max), swell: at2(raw.daily?.swell_wave_height_max),
      water: waterOn(raw, l.date), air: l.max, rain: l.rain, wind: Math.round(l.wind ?? 0), windDir: l.windDir ?? null, uv: l.uv };
  });
  return { seaAt, days: days.map((d, k) => ({ date: d.date, waves: d.waves, period: d.period, water: d.water,
    dive: dive(d, days[k - 1]), surf: surf(d, seaAt), beach: beach(d) })) };
}
