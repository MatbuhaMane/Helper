// Tests for תחזוקת הבית's rules (server/home-rules.ts).   node server/test-home.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'home-test-'));
const out = join(dir, 'h.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/home-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const throws = (name, fn, code) => { try { fn(); fail++; console.error(`FAIL ${name}: did not throw`); } catch (e) { eq(name, e.code, code); } };
const T = '2026-11-14';

/* ---- cleaning ---- */
eq('a preset fills its name', R.clean({ kind: 'smoke', every_days: 30 }, T).name, 'גלאי העשן');
eq('a preset keeps its kind', R.clean({ kind: 'smoke', every_days: 30 }, T).kind, 'smoke');
eq('an unknown kind is custom', R.clean({ kind: 'x', name: 'הגג', every_days: 365 }, T).kind, 'custom');
eq('spaces are tidied', R.clean({ name: '  מסנן   הבריכה ', every_days: 7 }, T).name, 'מסנן הבריכה');
eq('no interval is null', R.clean({ name: 'המקרר', every_days: '' }, T).every_days, null);
eq('the interval is rounded', R.clean({ name: 'א', every_days: '30.4' }, T).every_days, 30);
eq('an empty note is null', R.clean({ name: 'א', note: '  ' }, T).note, null);
eq('a long name is cut', R.clean({ name: 'א'.repeat(99) }, T).name.length, 60);
throws('no name', () => R.clean({ every_days: 30 }, T), 'bad_name');
throws('a zero interval', () => R.clean({ name: 'א', every_days: 0 }, T), 'bad_every');
throws('an interval over ten years', () => R.clean({ name: 'א', every_days: 4000 }, T), 'bad_every');
throws('a bad date', () => R.clean({ name: 'א', last_done: '14/11/2026' }, T), 'bad_date');
throws('a date that is not a day', () => R.clean({ name: 'א', last_done: '2026-13-40' }, T), 'bad_date');
throws('done in the future', () => R.clean({ name: 'א', last_done: '2026-11-15' }, T), 'bad_date');
eq('a warranty may be in the future', R.clean({ name: 'א', warranty_until: '2028-01-01' }, T).warranty_until, '2028-01-01');

/* ---- dates ---- */
eq('add days over a month', R.addDays('2026-11-25', 10), '2026-12-05');
eq('days between', R.daysBetween('2026-11-14', '2027-11-14'), 365);

/* ---- due ---- */
eq('no interval', R.due({ every_days: null, last_done: '2026-01-01' }, T).state, 'none');
eq('never done', R.due({ every_days: 30, last_done: null }, T).state, 'new');
eq('late', R.due({ every_days: 30, last_done: '2026-10-01' }, T), { next: '2026-10-31', days: -14, state: 'late' });
eq('due today is soon', R.due({ every_days: 30, last_done: '2026-10-15' }, T).state, 'soon');
eq('in a week is soon', R.due({ every_days: 365, last_done: '2025-11-21' }, T).state, 'soon');
eq('in eight days is ok', R.due({ every_days: 365, last_done: '2025-11-22' }, T).state, 'ok');
eq('a short interval: soon is a tenth', R.due({ every_days: 30, last_done: '2026-10-19' }, T), { next: '2026-11-18', days: 4, state: 'ok' });
eq('done today is ok', R.due({ every_days: 60, last_done: T }, T).state, 'ok');

/* ---- warranty ---- */
eq('no warranty', R.warranty(null, T), null);
eq('a warranty that ended', R.warranty('2026-11-01', T).state, 'over');
eq('a warranty ending', R.warranty('2026-12-31', T).state, 'ending');
eq('a warranty on', R.warranty('2027-06-01', T).state, 'on');

/* ---- order ---- */
const items = [
  { id: 'a', name: 'ב', kind: 'custom', every_days: 365, last_done: '2026-06-01', warranty_until: null, note: null },
  { id: 'b', name: 'א', kind: 'custom', every_days: 30, last_done: '2026-09-01', warranty_until: null, note: null },
  { id: 'c', name: 'ג', kind: 'custom', every_days: null, last_done: null, warranty_until: '2027-06-01', note: null },
  { id: 'd', name: 'ד', kind: 'custom', every_days: 30, last_done: null, warranty_until: null, note: null },
  { id: 'e', name: 'ה', kind: 'custom', every_days: 30, last_done: '2026-10-16', warranty_until: null, note: null },
];
eq('late, soon, new, ok, none', R.sortItems(items, T).map((x) => x.id), ['b', 'e', 'd', 'a', 'c']);
eq('the warranty rides along', R.sortItems(items, T).find((x) => x.id === 'c').warranty.state, 'on');

/* ---- presets ---- */
eq('every preset has a name, an interval and a tip', R.PRESETS.every((p) => p.name && p.every_days > 0 && p.tip), true);
eq('kinds are unique', new Set(R.PRESETS.map((p) => p.kind)).size, R.PRESETS.length);

console.log(fail ? `home: ${fail} failed, ${pass} passed` : `home: all ${pass} tests passed`);
process.exit(fail ? 1 : 0);
