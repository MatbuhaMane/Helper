// Tests for the weather's logic (server/weather-logic.ts):   node server/test-weather.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'weather-test-'));
const out = join(dir, 'w.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/weather-logic.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const W = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

/* ---- the codes ---- */
eq('clear by day', W.sky(0), { text: 'בהיר', icon: '☀️' });
eq('clear by night: the moon', W.sky(0, false).icon, '🌙');
eq('overcast is cloud day and night', [W.sky(3).icon, W.sky(3, false).icon], ['☁️', '☁️']);
eq('rain, by strength', [61, 63, 65].map((c) => W.sky(c).text), ['גשם קל', 'גשם', 'גשם חזק']);
eq('drizzle 51-55', [51, 53, 55].map((c) => W.sky(c).text), ['טפטוף', 'טפטוף', 'טפטוף']);
eq('thunder with hail', W.sky(99).text, 'סופת רעמים וברד');
eq('an unknown code', W.sky(42).text, 'לא ידוע');
eq('a code as a string', W.sky('2').text, 'מעונן חלקית');

/* ---- the forecast, shaped ---- */
const hours = Array.from({ length: 48 }, (_, i) => `2026-11-13T${String(i % 24).padStart(2, '0')}:00`).map((t, i) => (i >= 24 ? t.replace('13T', '14T') : t));
const raw = {
  current: { time: '2026-11-13T14:15', temperature_2m: 21.6, apparent_temperature: 20.4, weather_code: 2, is_day: 1, wind_speed_10m: 12.3, relative_humidity_2m: 55, precipitation: 0 },
  hourly: { time: hours, temperature_2m: hours.map((_, i) => 15 + (i % 10)), weather_code: hours.map((_, i) => (i === 17 ? 63 : 1)), precipitation_probability: hours.map((_, i) => (i === 17 ? 70 : 10)), is_day: hours.map((_, i) => (i % 24 >= 6 && i % 24 < 17 ? 1 : 0)) },
  daily: { time: ['2026-11-13', '2026-11-14'], weather_code: [63, 0], temperature_2m_max: [23.4, 26], temperature_2m_min: [14.5, 15], precipitation_probability_max: [70, null], sunrise: ['2026-11-13T06:12', '2026-11-14T06:13'], sunset: ['2026-11-13T16:42', '2026-11-14T16:41'], uv_index_max: [4.2, null] },
};
const f = W.shape(raw);
eq('now: rounded, the hour and minute', f.now, { time: '14:15', temp: 22, feels: 20, sky: { text: 'מעונן חלקית', icon: '⛅' }, wind: 12, humidity: 55, rain: 0 });
eq('the hours start at the current hour', f.hours[0].time, '14:00');
eq('24 hours', f.hours.length, 24);
eq('an hour at night has the moon', f.hours.find((h) => h.time === '20:00').sky.icon, '🌙');
eq('a day', f.days[0], { date: '2026-11-13', max: 23, min: 15, rain: 70, sky: { text: 'גשם', icon: '🌧️' }, sunrise: '06:12', sunset: '16:42', uv: 4, wind: 0, windDir: null });   // the raw has no wind: 0 and unknown
eq('a missing rain chance is 0, a missing UV is null', [f.days[1].rain, f.days[1].uv], [0, null]);
eq('the advice: an umbrella, with the hour', f.advice, ['כדאי לקחת מטריה: גשם צפוי סביב 17:00.']);

/* ---- the advice ---- */
const day = (o) => ({ date: 'd', max: 24, min: 14, rain: 0, sky: W.sky(0), sunrise: '', sunset: '', uv: 3, ...o });
eq('a plain day: nothing to say', W.advice(day({})), []);
eq('heat', W.advice(day({ max: 34 })), ['חם מאוד היום: לשתות הרבה, ולהישאר בצל בצהריים.']);
eq('cold', W.advice(day({ min: 6 })), ['קר היום: כדאי להתלבש חם, במיוחד בבוקר ובערב.']);
eq('rain without an hour', W.advice(day({ rain: 60 })), ['כדאי לקחת מטריה היום.']);
eq('strong sun', W.advice(day({ uv: 9 })), ['קרינה חזקה: כובע וקרם הגנה.']);
eq('no day', W.advice(undefined), []);

/* ---- the place ---- */
eq('Israel first', W.pickPlace([{ name: 'Jerusalem', country_code: 'US' }, { name: 'ירושלים', country_code: 'IL' }]).name, 'ירושלים');
eq('else the first', W.pickPlace([{ name: 'Paris', country_code: 'FR' }]).name, 'Paris');
eq('nothing', W.pickPlace([]), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
