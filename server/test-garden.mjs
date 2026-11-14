// Tests for the garden's rules (server/garden-rules.ts).   node server/test-garden.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'garden-test-'));
const out = join(dir, 'g.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/garden-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const throws = (name, fn, code) => { try { fn(); fail++; console.error(`FAIL ${name}: did not throw`); } catch (e) { eq(name, e.code, code); } };
const T = '2026-07-10';

// clean
eq('a preset fills the rest', R.clean({ kind: 'basil' }, T), { name: 'ריחן (בזיליקום)', kind: 'basil', place: 'out', every_days: 2, last_watered: null, note: null });
eq('a custom plant', R.clean({ name: '  פיקוס  כינורי ', place: 'in', every_days: '10' }, T).name, 'פיקוס כינורי');
eq('custom kind', R.clean({ name: 'x', kind: 'nope' }, T).kind, 'custom');
eq('custom defaults to 7 days inside', [R.clean({ name: 'x' }, T).every_days, R.clean({ name: 'x' }, T).place], [7, 'in']);
eq('the place can be changed', R.clean({ kind: 'basil', place: 'in' }, T).place, 'in');
throws('no name', () => R.clean({}, T), 'bad_name');
throws('every 0', () => R.clean({ name: 'x', every_days: 0 }, T), 'bad_every');
throws('every 61', () => R.clean({ name: 'x', every_days: 61 }, T), 'bad_every');
throws('a date in the future', () => R.clean({ name: 'x', last_watered: '2026-07-11' }, T), 'bad_date');
throws('a broken date', () => R.clean({ name: 'x', last_watered: '2026-13-01' }, T), 'bad_date');
eq('a long note is cut', R.clean({ name: 'x', note: 'א'.repeat(400) }, T).note.length, 300);

// due, without weather
const P = (o) => ({ place: 'in', every_days: 7, last_watered: '2026-07-05', ...o });
eq('never watered', R.due(P({ last_watered: null }), T).state, 'new');
eq('in two days', R.due(P(), T), { next: '2026-07-12', days: 2, why: null, state: 'ok' });
eq('tomorrow is soon', R.due(P({ last_watered: '2026-07-04' }), T).state, 'soon');
eq('today', R.due(P({ last_watered: '2026-07-03' }), T).state, 'today');
eq('late', R.due(P({ last_watered: '2026-07-01' }), T).days, -2);

// heat
const hot = (max) => ({ max, rained: null });
eq('a hot day brings an outside plant a day earlier', R.due(P({ place: 'out' }), T, hot(33)), { next: '2026-07-11', days: 1, why: 'heat', state: 'soon' });
eq('32 is hot outside', R.due(P({ place: 'out' }), T, hot(32)).why, 'heat');
eq('31 is not', R.due(P({ place: 'out' }), T, hot(31)).why, null);
eq('33 is not hot for a plant inside', R.due(P(), T, hot(33)).why, null);
eq('35 is hot inside too', R.due(P(), T, hot(35)).next, '2026-07-11');
eq('never to a day already past', R.due(P({ place: 'out', last_watered: '2026-07-03' }), T, hot(38)).next, '2026-07-10');
eq('a late plant stays late, not later', R.due(P({ place: 'out', last_watered: '2026-07-01' }), T, hot(38)).days, -2);
eq('a plant watered every day is not moved', R.due(P({ place: 'out', every_days: 1, last_watered: '2026-07-10' }), T, hot(40)).next, '2026-07-11');
eq('watered today, every 2 days, hot: tomorrow, not today', R.due(P({ place: 'out', every_days: 2, last_watered: T }), T, hot(40)).next, '2026-07-11');

// rain
const rain = (d) => ({ max: 20, rained: d });
eq('rain waters a plant outside', R.due(P({ place: 'out' }), T, rain('2026-07-09')), { next: '2026-07-16', days: 6, why: 'rain', state: 'ok' });
eq('rain does not water a plant inside', R.due(P(), T, rain('2026-07-09')).why, null);
eq('rain before the last watering changes nothing', R.due(P({ place: 'out' }), T, rain('2026-07-04')).why, null);
eq('rain waters a new plant outside', R.due(P({ place: 'out', last_watered: null }), T, rain('2026-07-10')).state, 'ok');
eq('rain and heat: the rain wins', R.due(P({ place: 'out' }), T, { max: 34, rained: T }).why, 'rain');

// the reminder
eq('no reminder before the day', R.remindFor(P(), T), null);
eq('a reminder on the day', R.remindFor(P({ last_watered: '2026-07-03' }), T), '2026-07-10');
eq('once for each date', R.remindFor(P({ last_watered: '2026-07-03', reminded: '2026-07-10' }), T), null);
eq('a new plant: no reminder', R.remindFor(P({ last_watered: null }), T), null);
eq('rain cancels the reminder outside', R.remindFor(P({ place: 'out', last_watered: '2026-07-03' }), T, rain('2026-07-09')), null);

// the weather
const daily = { time: ['2026-07-09', '2026-07-10', '2026-07-11'], temperature_2m_max: [30, 33.4, 29], precipitation_sum: [5, 0.2, 9] };
eq('wx: today\'s max and yesterday\'s rain', R.wxOf(daily, T), { max: 33.4, rained: '2026-07-09' });
eq('wx: tomorrow\'s rain does not count', R.wxOf({ ...daily, precipitation_sum: [0, 0, 20] }, T).rained, null);
eq('wx: today\'s rain', R.wxOf({ ...daily, precipitation_sum: [5, 4, 0] }, T).rained, T);
eq('wx: a missing day', R.wxOf(daily, '2026-08-01'), null);
eq('wx: nothing', R.wxOf(null, T), null);
eq('wx: no temperature', R.wxOf({ ...daily, temperature_2m_max: [null, null, null] }, T).max, null);

// the order
const list = R.sortPlants([
  { id: 'a', name: 'א', kind: 'custom', place: 'in', every_days: 7, last_watered: '2026-07-09', note: null },
  { id: 'b', name: 'ב', kind: 'custom', place: 'in', every_days: 7, last_watered: '2026-07-01', note: null },
  { id: 'c', name: 'ג', kind: 'custom', place: 'in', every_days: 7, last_watered: null, note: null },
  { id: 'd', name: 'ד', kind: 'custom', place: 'in', every_days: 7, last_watered: '2026-07-03', note: null },
], T);
eq('late, today, new, then the rest', list.map((p) => p.id), ['b', 'd', 'c', 'a']);

// the AI's answers
eq('identify: a known kind', R.cleanIdentify({ name: 'ריחן', kind: 'basil', place: 'out', every_days: 2, care: 'שמש', sure: true }), { name: 'ריחן', kind: 'basil', place: 'out', every_days: 2, care: 'שמש', sure: true });
eq('identify: an unknown kind is custom', R.cleanIdentify({ name: 'פיקוס', kind: 'ficus' }).kind, 'custom');
eq('identify: a wild interval falls back', R.cleanIdentify({ kind: 'cactus', every_days: 500 }).every_days, 21);
eq('identify: nothing', R.cleanIdentify(null).name, 'צמח');
eq('doctor: steps cut to six', R.cleanDoctor({ steps: Array(9).fill('לעשות') }).steps.length, 6);
eq('doctor: no problem said', R.cleanDoctor({}).problem, 'לא ברור מהתמונה');
eq('doctor: urgent only when true', R.cleanDoctor({ urgent: 'yes' }).urgent, false);
eq('every preset has a picture name', R.PRESETS.every((p) => /^[a-z-]+$/.test(p.kind)), true);

console.log(fail ? `${fail} of ${pass + fail} garden tests failed` : `garden: all ${pass} tests passed`);
process.exit(fail ? 1 : 0);
