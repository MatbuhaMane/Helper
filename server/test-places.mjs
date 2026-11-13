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

/* ---- the home ("איפה הבית?") ---- */
eq('home: the family types freely', P.homeMay('ac', false, 9999, 10), { ok: true });
eq('home: a limited person, the last pick', P.homeMay('pd', true, P.HOME_PERSON.pd - 1, 10), { ok: true });
eq('home: a limited person, over', P.homeMay('pd', true, P.HOME_PERSON.pd, 10), { ok: false, why: 'person' });
eq('home: the site is full', P.homeMay('ac', false, 0, P.HOME_SITE), { ok: false, why: 'site' });
eq('home: under Google\'s free 10,000', P.HOME_SITE < 10000, true);
eq('a UUID token', P.cleanToken('3f2a9c1e-7b4d-4e8a-9f00-1234567890ab'), '3f2a9c1e-7b4d-4e8a-9f00-1234567890ab');
eq('a bad token', [P.cleanToken('a b'), P.cleanToken('x'.repeat(65)), P.cleanToken(5)], ['', '', '']);
const s = P.suggestRequest('  קריית   טבעון ', 'tok12345');
eq('the request', [s.input, s.sessionToken, s.includedRegionCodes, s.languageCode], ['קריית טבעון', 'tok12345', ['il'], 'he']);
eq('no token, none sent', 'sessionToken' in P.suggestRequest('חיפה', ''), false);
throws('one letter', () => P.suggestRequest('ח', ''), 'too_short');
const g = { suggestions: [
  { placePrediction: { placeId: 'ChIJH3w7GaZMHRURkD-WwKJy-8E', text: { text: 'חיפה, ישראל' }, structuredFormat: { mainText: { text: 'חיפה' }, secondaryText: { text: 'ישראל' } } } },
  { placePrediction: { placeId: 'bad id!', structuredFormat: { mainText: { text: 'x' } } } },
  { queryPrediction: { text: { text: 'חיפה מסעדות' } } },
  { placePrediction: { placeId: 'ChIJabcdefghijkl', text: { text: 'כרמל' } } }] };
eq('the suggestions', P.suggestions(g), [{ id: 'ChIJH3w7GaZMHRURkD-WwKJy-8E', name: 'חיפה', sub: 'ישראל' }, { id: 'ChIJabcdefghijkl', name: 'כרמל', sub: '' }]);
eq('no suggestions', P.suggestions({}), []);
eq('at most five', P.suggestions({ suggestions: Array.from({ length: 8 }, (_, i) => ({ placePrediction: { placeId: 'ChIJ' + 'a'.repeat(10) + i, text: { text: 'מקום ' + i } } })) }).length, 5);
eq('a place id', [P.cleanPlaceId('ChIJH3w7GaZMHRURkD-WwKJy-8E'), P.cleanPlaceId('../x'), P.cleanPlaceId('')], ['ChIJH3w7GaZMHRURkD-WwKJy-8E', '', '']);
eq('a point in Israel, rounded', P.pointOf({ location: { latitude: 32.794044, longitude: 34.989571 } }), { lat: 32.794, lng: 34.99 });
eq('a point abroad', P.pointOf({ location: { latitude: 48.85, longitude: 2.35 } }), null);
eq('no point', [P.pointOf({}), P.pointOf({ location: { latitude: null, longitude: 35 } })], [null, null]);
const now = Date.UTC(2026, 10, 13), home = { id: 'ChIJH3w7GaZMHRURkD-WwKJy-8E', name: 'חיפה', lat: 32.794, lng: 34.99, at: now - 86400e3 };
eq('fresh: the same city', P.freshPoint(home, 'חיפה', now), { lat: 32.794, lng: 34.99 });
eq('the city was changed in the settings', P.freshPoint(home, 'עכו', now), null);
eq('over 30 days', P.freshPoint({ ...home, at: now - 31 * 86400e3 }, 'חיפה', now), null);
eq('from the future', P.freshPoint({ ...home, at: now + 3600e3 }, 'חיפה', now), null);
eq('no place, no city', [P.freshPoint(null, 'חיפה', now), P.freshPoint(home, '', now), P.freshPoint('x', 'חיפה', now)], [null, null, null]);
eq('a point outside Israel is not used', P.freshPoint({ ...home, lat: 48.85, lng: 2.35 }, 'חיפה', now), null);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
