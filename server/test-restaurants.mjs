// Tests for מסעדות שלנו (server/restaurants.ts):   node server/test-restaurants.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'rest-test-'));
const out = join(dir, 'r.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/restaurants.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

const D = 864e5, now = Date.UTC(2026, 10, 12);
const r = (id, o) => ({ id, name: 'מסעדה ' + id, place: 'ירושלים', cuisine: '', kosher: '', link: '', phone: '', note: '', fav: false, visitedAt: null, visitedBy: null, createdAt: now - 100 * D, updatedAt: now, ...o });
const list = [
  r('a', { fav: true, visitedAt: now - 40 * D }),     // a favourite, missed for 40 days
  r('b', { fav: true, visitedAt: now - 3 * D }),      // a favourite, there lately: not shown
  r('c', { fav: true, visitedAt: null }),             // a favourite never visited: the longest of all
  r('d', { createdAt: now - 2 * D }),                 // new, never visited
  r('e', { createdAt: now - 30 * D }),                // old and never visited: not new any more
  r('f', { createdAt: now - 1 * D, visitedAt: now }), // new but already visited
];
const s = R.restaurantSlides(list, now);
eq('favourites missed (the longest first), then the new ones', s.map((x) => [x.id, x.why, x.days]), [['c', 'missed', null], ['a', 'missed', 40], ['d', 'new', null]]);
eq('at most max', R.restaurantSlides(Array.from({ length: 9 }, (_, i) => r('x' + i, { fav: true })), now).length, 4);
eq('nothing', R.restaurantSlides([], now), []);
eq('a favourite exactly 30 days ago counts', R.restaurantSlides([r('g', { fav: true, visitedAt: now - 30 * D })], now).map((x) => x.id), ['g']);
eq('the kosher values', R.KOSHER, ['', 'kosher', 'mehadrin', 'no']);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
