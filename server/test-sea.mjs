// Tests for the sea's ratings (server/sea-logic.ts): diving, surfing and a beach day.   node server/test-sea.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'sea-test-'));
const out = join(dir, 's.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/sea-logic.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const S = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

const day = (o = {}) => ({ date: '2026-07-01', waves: 0.4, period: 6, swell: 0.3, water: 27, air: 30, rain: 0, wind: 12, windDir: 300, uv: 9, ...o });
const SEA_WEST = 270;   // the Mediterranean coast: the sea is to the west

/* ---- diving ---- */
eq('a calm summer day', S.dive(day()), { level: 'good', why: 'גלים 0.4 מ׳, ראות טובה, מים 27°' });
eq('waves of a metre: fair', S.dive(day({ waves: 0.9 })).level, 'fair');
eq('rough: no', S.dive(day({ waves: 1.6 })), { level: 'poor', why: 'גלים 1.6 מ׳' });
eq('strong wind: no', S.dive(day({ wind: 35 })).level, 'poor');
eq('murky after a rough day', S.dive(day(), day({ waves: 1.2 })), { level: 'fair', why: 'ראות בינונית אחרי ים גבוה' });
eq('cold water: fair, with a suit', S.dive(day({ water: 17 })).why, 'מים 17°: חליפה עבה');
eq('rain clouds the water', S.dive(day({ rain: 80 })).level, 'poor');
eq('no wave data (Eilat): by the wind', S.dive(day({ waves: null })), { level: 'good', why: 'אין נתוני גלים, ראות טובה, מים 27°' });

/* ---- surfing ---- */
eq('flat', S.surf(day({ waves: 0.3 }), SEA_WEST), { level: 'poor', why: 'ים שטוח (0.3 מ׳)' });
eq('small: fair', S.surf(day({ waves: 0.7, period: 8 }), SEA_WEST).level, 'fair');
eq('a good swell with a land wind', S.surf(day({ waves: 1.4, period: 9, windDir: 90 }), SEA_WEST), { level: 'good', why: 'גלים 1.4 מ׳, מחזור 9 שנ׳, רוח מהיבשה' });
eq('short period: messy', S.surf(day({ waves: 1.4, period: 4 }), SEA_WEST), { level: 'poor', why: 'גלים קצרים ומבולגנים' });
eq('a strong sea wind spoils it', S.surf(day({ waves: 1.4, period: 8, wind: 38, windDir: 280 }), SEA_WEST).level, 'poor');
eq('the same wind from the land does not', S.surf(day({ waves: 1.4, period: 8, wind: 38, windDir: 100 }), SEA_WEST).level, 'good');
eq('big: for the experienced', S.surf(day({ waves: 3, period: 10 }), SEA_WEST).why, 'גלים גבוהים 3 מ׳, למנוסים');
eq('no wave data', S.surf(day({ waves: null }), null).level, 'poor');

/* ---- a beach day ---- */
eq('a warm calm day, strong sun', S.beach(day()), { level: 'good', why: '30°, מים 27°, קרם הגנה וכובע' });
eq('cool: fair', S.beach(day({ air: 22 })).level, 'fair');
eq('cold: no', S.beach(day({ air: 17 })), { level: 'poor', why: 'קריר (17°)' });
eq('a heatwave: fair', S.beach(day({ air: 35 })).why, 'חם מאוד (35°)');
eq('rain likely: no', S.beach(day({ rain: 70 })).level, 'poor');
eq('a rough sea: no', S.beach(day({ waves: 2 })).why, 'ים סוער (2 מ׳)');
eq('the worst points are the reason', S.beach(day({ air: 22, wind: 30 })).why, 'קריר (22°), רוח 30 קמ״ש');

/* ---- geometry ---- */
eq('Tel Aviv to its sea cell: about 7 km', Math.round(S.km({ lat: 32.08, lon: 34.77 }, { lat: 32.0417, lon: 34.7083 })), 7);
eq('the sea of Tel Aviv is to the west-south-west', Math.round(S.bearing({ lat: 32.08, lon: 34.77 }, { lat: 32.0417, lon: 34.7083 }) / 10) * 10, 230);
eq('wind sides', [S.windSide(270, 260), S.windSide(90, 260), S.windSide(180, 260), S.windSide(null, 260)], ['onshore', 'offshore', 'side', null]);

/* ---- near the coast ---- */
const marine = (lat, lon, waves, sst) => ({ latitude: lat, longitude: lon, daily: { time: ['2026-07-01'], wave_height_max: [waves], wave_period_max: [6], swell_wave_height_max: [0.3] }, hourly: { time: ['2026-07-01T12:00'], sea_surface_temperature: [sst] } });
eq('Tel Aviv is coastal', S.coastal(marine(32.04, 34.71, 0.5, 24), { lat: 32.08, lon: 34.77 }), true);
eq('Jerusalem: the model has nothing', S.coastal(marine(31.79, 35.21, null, null), { lat: 31.78, lon: 35.22 }), false);
eq('a cell too far is not this place\'s sea', S.coastal(marine(32.04, 34.71, 0.5, 24), { lat: 31.78, lon: 35.22 }), false);
eq('Eilat: no waves, but the water', S.coastal(marine(29.54, 34.96, null, 24.5), { lat: 29.51, lon: 34.92 }), true);

/* ---- a week ---- */
const r = S.rate(marine(32.04, 34.71, 0.4, 26.5), [{ date: '2026-07-01', max: 31, rain: 0, wind: 14, windDir: 290, uv: 10 }], { lat: 32.08, lon: 34.77 });
eq('rate: the water at noon, the sea to the west', [r.days[0].water, r.seaAt > 200 && r.seaAt < 260], [26.5, true]);
eq('rate: the three ratings', [r.days[0].dive.level, r.days[0].surf.level, r.days[0].beach.level], ['good', 'poor', 'good']);

console.log(fail ? `${fail} failed, ${pass} passed` : `all ${pass} passed`);
process.exit(fail ? 1 : 0);
