// Tests for the diets' rules in public/groceries/diets.js (the food verdicts and the fasting window). Run: node server/test-diets.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const window = { addEventListener() {}, dispatchEvent() {} };
const ctx = { window, H: { prefs: () => ({ on: [] }), savePrefs() {} }, CustomEvent: class {} };
vm.runInNewContext(readFileSync(new URL('../public/groceries/diets.js', import.meta.url), 'utf8'), ctx);
const D = window.Diets;
let fail = 0, n = 0;
const eq = (got, want, what) => { n++; if (got !== want) { fail++; console.log(`✗ ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const fit = (id, net, name) => D.get(id).food({ net }, name)[0];

eq(fit('atkins', 2, 'חסה'), 'ok', 'atkins: lettuce');
eq(fit('atkins', 8, 'בצל'), 'warn', 'atkins: onion');
eq(fit('atkins', 48, 'לחם'), 'bad', 'atkins: bread');
eq(fit('lowcarb', 15, 'תפוח'), 'warn', 'low-carb: an apple');
eq(fit('paleo', 0, 'לחם מחמצת'), 'bad', 'paleo: bread');
eq(fit('paleo', 0, 'עדשים ירוקות'), 'bad', 'paleo: lentils');
eq(fit('paleo', 0, 'גבינה צהובה'), 'bad', 'paleo: cheese');
eq(fit('paleo', 0, 'חזה עוף'), 'ok', 'paleo: chicken');
eq(fit('glycemic', 3, 'סוכר לבן'), 'bad', 'low sugar: sugar by name');
eq(fit('glycemic', 99, 'ממתיק אריתריטול'), 'ok', 'low sugar: a sweetener');
eq(fit('glycemic', 20, 'קינואה'), 'warn', 'low sugar: by net carbs');
eq(D.get('paleo').recipe(null, ['ביצים', 'עגבניות'])[0], 'ok', 'paleo recipe: shakshuka');
eq(D.get('glycemic').recipe({ net: 10 }, ['אורז לבן', 'סוכר'])[0], 'bad', 'low sugar recipe: two high-GL items');
eq(D.get('fasting').food, undefined, 'fasting judges no food');

// the window: 8 hours from 12:00
const at = (h, m = 0) => new Date(2026, 10, 13, h, m).getTime();
const w = (t) => D.rules.windowAt(t, '12:00', 8);
eq(w(at(13)).open, true, '13:00 is inside');
eq(w(at(13)).left, 7 * 36e5, '7 hours left at 13:00');
eq(w(at(21)).open, false, '21:00 is a fast');
eq(w(at(9)).open, false, '09:00 is a fast');
eq(w(at(9)).left, 3 * 36e5, 'it opens in 3 hours');
eq(w(at(9)).pct, 81, '13 of 16 fasting hours done');
eq(D.rules.windowAt(at(1), '20:00', 6).open, true, 'a window across midnight');

console.log(fail ? `${fail} of ${n} failed` : `all ${n} passed`);
process.exit(fail ? 1 : 0);
