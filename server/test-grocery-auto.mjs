// Tests for the automatic shopping list (server/grocery-auto-logic.ts):   node server/test-grocery-auto.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'grocery-auto-test-'));
const out = join(dir, 'a.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/grocery-auto-logic.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const A = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const norm = (s) => s.trim().replace(/ים$/, '');
const T = '2026-11-14';
let t = 0;
const row = (name, { qty = 1, deleted = 0, expires = null, cat = 'dairy' } = {}) => ({ name, cat, qty, deleted, expires, updated_at: ++t });
const pick = (xs) => xs.map((x) => [x.name, x.why]);

const rows = [
  row('חלב', { deleted: 1 }), row('חלב', { deleted: 1 }),                 // usual, none now → gone
  row('ביצים', { deleted: 1 }), row('ביצים', { qty: 1 }),                 // usual, one left → low
  row('גבינה', { deleted: 1 }), row('גבינה', { qty: 3 }),                 // usual, enough → nothing
  row('יוגורט', { deleted: 1 }), row('יוגורט', { qty: 2, expires: '2026-11-10' }),   // all expired → expired
  row('קוטג׳', { deleted: 1 }),                                             // once only → not usual
];
eq('gone, expired, low; enough and once-only skipped', pick(A.suggest(rows, norm, new Set(), {}, T)), [['חלב', 'gone'], ['יוגורט', 'expired'], ['ביצים', 'low']]);
eq('already on the list → not suggested', pick(A.suggest(rows, norm, new Set(['חלב']), {}, T)), [['יוגורט', 'expired'], ['ביצים', 'low']]);
eq('put off until today or later → skipped; an old skip is ignored', pick(A.suggest(rows, norm, new Set(), { 'חלב': T, 'ביצ': '2026-11-01' }, T)).map((x) => x[0]), ['יוגורט', 'ביצים']);
eq('fresh beside expired → enough', pick(A.suggest([...rows, row('יוגורט', { qty: 1, expires: '2026-11-20' })], norm, new Set(), {}, T)).map((x) => x[0]), ['חלב', 'ביצים']);
eq('normalized names meet (ביצים / ביצ)', A.suggest([row('ביצים', { deleted: 1 }), row('ביצ', { deleted: 1 })], norm, new Set(), {}, T).map((x) => [x.name, x.times]), [['ביצ', 2]]);
eq('the most usual first within a reason', pick(A.suggest([row('א', { deleted: 1 }), row('א', { deleted: 1 }), row('ב', { deleted: 1 }), row('ב', { deleted: 1 }), row('ב', { deleted: 1 })], norm, new Set(), {}, T)), [['ב', 'gone'], ['א', 'gone']]);
eq('max', A.suggest(rows, norm, new Set(), {}, T, 1).length, 1);
eq('the latest name and category win', A.suggest([row('חלב', { deleted: 1, cat: 'other' }), row('חלב ', { deleted: 1, cat: 'dairy' })], norm, new Set(), {}, T).map((x) => [x.name, x.cat]), [['חלב', 'dairy']]);
eq('prune: drops what ran out, keeps the latest', A.pruneSkip({ a: '2026-11-01', b: T, c: '2026-11-20', d: 5 }, T), { c: '2026-11-20', b: T });
eq('prune: max', Object.keys(A.pruneSkip({ a: '2026-12-01', b: '2026-12-02', c: '2026-12-03' }, T, 2)), ['c', 'b']);
eq('prune: nothing', A.pruneSkip(null, T), {});

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
