// Tests for restaurants from Google Places (server/places.ts):   node server/test-places.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'places-test-'));
const out = join(dir, 'p.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/places.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const P = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const throws = (name, fn, msg) => { try { fn(); fail++; console.error('FAIL (no throw)', name); } catch (e) { eq(name, e.message, msg); } };

/* ---- the limits ---- */
eq('the family: no limit', P.mayAsk(false, 500, 10), { ok: true, left: null });
eq('a limited person, the first', P.mayAsk(true, 0, 10), { ok: true, left: P.PER_PERSON - 1 });
eq('a limited person, the last', P.mayAsk(true, P.PER_PERSON - 1, 10), { ok: true, left: 0 });
eq('a limited person, over', P.mayAsk(true, P.PER_PERSON, 10), { ok: false, why: 'person', left: 0 });
eq('the site is full: even the family stops', P.mayAsk(false, 0, P.SITE_MONTH), { ok: false, why: 'site', left: null });
eq('under Google\'s free 5,000', P.SITE_MONTH < 5000, true);

/* ---- the request ---- */
const t = P.request({ city: '  ירושלים ', kosher: true });
eq('a city: a text search', [t.url.endsWith(':searchText'), t.body.textQuery, t.body.includedType], [true, 'מסעדות כשרות בירושלים', 'restaurant']);
eq('not kosher', P.request({ city: 'חיפה' }).body.textQuery, 'מסעדות בחיפה');
const n = P.request({ lat: 31.77, lng: 35.21, city: 'ignored' });
eq('a point: a nearby search, the point wins', [n.url.endsWith(':searchNearby'), n.body.locationRestriction.circle.center, n.body.rankPreference], [true, { latitude: 31.77, longitude: 35.21 }, 'DISTANCE']);
throws('no city and no point', () => P.request({}), 'no_city');
throws('a point off the earth', () => P.request({ lat: 120, lng: 0 }), 'Invalid place');

/* ---- the answer ---- */
eq('Google\'s places, as shown', P.results({ places: [
  { id: 'ChIJ1', displayName: { text: 'חומוס' }, formattedAddress: 'ירושלים', googleMapsUri: 'https://maps.google.com/?cid=1', primaryTypeDisplayName: { text: 'מסעדה' } },
  { id: 'ChIJ2', displayName: { text: 'בלי קישור' }, googleMapsUri: 'javascript:alert(1)' },
  { displayName: { text: 'בלי מזהה' } },
] }), [
  { id: 'ChIJ1', name: 'חומוס', address: 'ירושלים', kind: 'מסעדה', maps: 'https://maps.google.com/?cid=1' },
  { id: 'ChIJ2', name: 'בלי קישור', address: '', kind: '', maps: '' },
]);
eq('an empty answer', P.results({}), []);
eq('the month', P.month(Date.UTC(2026, 10, 12)), '2026-11');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
