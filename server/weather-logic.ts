// The weather's pure logic (server/weather.ts fetches; this shapes): Open-Meteo's WMO codes in Hebrew, the forecast cut to
// what the page shows (now, the next 24 hours, 7 days), and a line of advice for the day. Tests: server/test-weather.mjs.

export interface Sky { text: string; icon: string }

/** a WMO weather code (Open-Meteo's weather_code) in Hebrew, with an icon; night turns the clear ones to the moon */
export function sky(code: number, day = true): Sky {
  const c = Math.round(Number(code));
  if (c === 0) return { text: 'בהיר', icon: day ? '☀️' : '🌙' };
  if (c === 1) return { text: 'בהיר ברובו', icon: day ? '🌤️' : '🌙' };
  if (c === 2) return { text: 'מעונן חלקית', icon: day ? '⛅' : '☁️' };
  if (c === 3) return { text: 'מעונן', icon: '☁️' };
  if (c === 45 || c === 48) return { text: 'ערפל', icon: '🌫️' };
  if (c >= 51 && c <= 55) return { text: 'טפטוף', icon: '🌦️' };
  if (c === 56 || c === 57) return { text: 'טפטוף קפוא', icon: '🌧️' };
  if (c === 61) return { text: 'גשם קל', icon: '🌧️' };
  if (c === 63) return { text: 'גשם', icon: '🌧️' };
  if (c === 65) return { text: 'גשם חזק', icon: '🌧️' };
  if (c === 66 || c === 67) return { text: 'גשם קפוא', icon: '🌧️' };
  if (c === 71) return { text: 'שלג קל', icon: '🌨️' };
  if (c === 73 || c === 77) return { text: 'שלג', icon: '🌨️' };
  if (c === 75) return { text: 'שלג כבד', icon: '❄️' };
  if (c === 80) return { text: 'ממטרים קלים', icon: '🌦️' };
  if (c === 81) return { text: 'ממטרים', icon: '🌦️' };
  if (c === 82) return { text: 'ממטרים עזים', icon: '⛈️' };
  if (c === 85 || c === 86) return { text: 'ממטרי שלג', icon: '🌨️' };
  if (c === 95) return { text: 'סופת רעמים', icon: '⛈️' };
  if (c === 96 || c === 99) return { text: 'סופת רעמים וברד', icon: '⛈️' };
  return { text: 'לא ידוע', icon: '🌡️' };
}

/** Open-Meteo's forecast response, the fields we ask for */
export interface Raw {
  timezone?: string;
  current: { time: string; temperature_2m: number; apparent_temperature: number; weather_code: number; is_day: number; wind_speed_10m: number; relative_humidity_2m: number; precipitation: number };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: (number | null)[]; is_day: number[] };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[]; sunrise: string[]; sunset: string[]; uv_index_max: (number | null)[] };
}

export interface Day { date: string; max: number; min: number; rain: number; sky: Sky; sunrise: string; sunset: string; uv: number | null }
export interface Hour { time: string; temp: number; rain: number; sky: Sky }
export interface Forecast {
  now: { time: string; temp: number; feels: number; sky: Sky; wind: number; humidity: number; rain: number };
  hours: Hour[]; days: Day[]; advice: string[];
}

const r = (n: unknown) => Math.round(Number(n) || 0);

/** what the page shows: now, the next 24 hours from the current hour, and the days (local times, as Open-Meteo gives them) */
export function shape(raw: Raw): Forecast {
  const c = raw.current;
  const hourNow = c.time.slice(0, 13);   // "2026-11-13T14"
  let from = raw.hourly.time.findIndex((t) => t.slice(0, 13) >= hourNow);
  if (from < 0) from = 0;
  const hours: Hour[] = raw.hourly.time.slice(from, from + 24).map((t, k) => {
    const i = from + k;
    return { time: t.slice(11, 16), temp: r(raw.hourly.temperature_2m[i]), rain: r(raw.hourly.precipitation_probability[i]), sky: sky(raw.hourly.weather_code[i], raw.hourly.is_day[i] !== 0) };
  });
  const days: Day[] = raw.daily.time.map((d, i) => ({
    date: d, max: r(raw.daily.temperature_2m_max[i]), min: r(raw.daily.temperature_2m_min[i]), rain: r(raw.daily.precipitation_probability_max[i]),
    sky: sky(raw.daily.weather_code[i]), sunrise: (raw.daily.sunrise[i] || '').slice(11, 16), sunset: (raw.daily.sunset[i] || '').slice(11, 16),
    uv: raw.daily.uv_index_max[i] == null ? null : Math.round(Number(raw.daily.uv_index_max[i])),
  }));
  const now = { time: c.time.slice(11, 16), temp: r(c.temperature_2m), feels: r(c.apparent_temperature), sky: sky(c.weather_code, c.is_day !== 0), wind: r(c.wind_speed_10m), humidity: r(c.relative_humidity_2m), rain: +(Number(c.precipitation) || 0).toFixed(1) };
  return { now, hours, days, advice: advice(days[0], hours) };
}

/** a line or two for the day: an umbrella, the heat, the cold, the sun, the wind (none on a plain day) */
export function advice(today: Day | undefined, hours: Hour[] = []): string[] {
  if (!today) return [];
  const out: string[] = [];
  const wet = hours.slice(0, 12).filter((h) => h.rain >= 50);
  if (today.rain >= 50 || wet.length) out.push(wet.length ? `כדאי לקחת מטריה: גשם צפוי סביב ${wet[0].time}.` : 'כדאי לקחת מטריה היום.');
  if (today.max >= 32) out.push('חם מאוד היום: לשתות הרבה, ולהישאר בצל בצהריים.');
  else if (today.min <= 8) out.push('קר היום: כדאי להתלבש חם, במיוחד בבוקר ובערב.');
  if ((today.uv ?? 0) >= 8) out.push('קרינה חזקה: כובע וקרם הגנה.');
  return out;
}

/** the best of Open-Meteo's geocoding results: a place in Israel first (the family's), else the first */
export function pickPlace<T extends { country_code?: string }>(results: T[] | undefined): T | null {
  if (!results?.length) return null;
  return results.find((p) => p.country_code === 'IL') || results[0];
}
