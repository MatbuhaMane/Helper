// Tests for ketosis without AI (server/keto-plain.ts):   node server/test-keto-plain.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'keto-test-'));
const out = join(dir, 'k.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/keto-plain.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const K = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

/* ---- Open Food Facts ---- */
const P = (fat, proteins, carbohydrates, fiber, countries = ['en:israel']) => ({ nutriments: { fat_100g: fat, proteins_100g: proteins, carbohydrates_100g: carbohydrates, ...(fiber !== undefined ? { fiber_100g: fiber } : {}) }, countries_tags: countries });
eq('an Israeli label: carbs are the total', K.offProduct(P(60, 24, 12, 8)), { fat: 60, protein: 24, carbs: 12, fiber: 8 });
eq('fiber over carbs: the label left it out', K.offProduct(P(60, 24.6, 4, 8)), { fat: 60, protein: 24.6, carbs: 12, fiber: 8 });
eq('a European label: the fiber is added', K.offProduct(P(10, 5, 50, 6, ['en:france'])), { fat: 10, protein: 5, carbs: 56, fiber: 6 });
eq('no fiber given', K.offProduct(P(1, 2, 3)), { fat: 1, protein: 2, carbs: 3, fiber: 0 });
eq('missing values: nothing', K.offProduct({ nutriments: { fat_100g: 3 } }), null);
eq('impossible values: nothing', K.offProduct(P(80, 30, 20, 0)), null);
eq('the median of the matches (an odd one does not decide)', K.offValues([P(60, 24, 12, 8), P(59.4, 24.4, 12, 7.4), P(28.9, 8.2, 9.5, 0), {}]), { fat: 59.4, protein: 24, carbs: 12, fiber: 7.4 });
eq('no usable match', K.offValues([{}, { nutriments: {} }]), null);
const named = (name, p) => ({ ...p, product_name: name });
eq('only matches with every word asked (not beer at 5%)', K.offValues([named('Lager Beer', P(0, 0, 2, 0, ['en:france'])), named('קוטג\' 5% שומן', P(5, 11, 3, 0))], 'קוטג׳ 5%'), { fat: 5, protein: 11, carbs: 3, fiber: 0 });
eq('nothing fits: nothing (not a wrong value)', K.offValues([named('Lager Beer', P(0, 0, 2, 0))], 'קוטג׳ 5%'), null);
eq('almond flour is not flour', K.offValues([named('קמח מלא', P(2, 13, 70, 10)), named('קמח שקדים טבעי', P(50, 21, 20, 10))], 'קמח שקדים'), { fat: 50, protein: 21, carbs: 20, fiber: 10 });
eq('eggs counted without a unit weight in the row', [K.gramsOf('4', 'ביצים', null), K.gramsOf('2', 'עגבניות שרי', null), K.gramsOf('1', 'בצל ירוק', null)], [220, 30, 15]);

/* ---- amounts in grams ---- */
eq('grams and kilos', [K.gramsOf('200 גרם', 'גבינה'), K.gramsOf('200 ג\'', 'גבינה'), K.gramsOf('1.5 ק"ג', 'עוף'), K.gramsOf('250g', 'x')], [200, 200, 1500, 250]);
eq('cups by what is in them', [K.gramsOf('2 כוסות', 'קמח לבן'), K.gramsOf('1 כוס', 'חלב'), K.gramsOf('1/2 כוס', 'סוכר')], [260, 240, 100]);
eq('spoons', [K.gramsOf('3 כפות', 'שמן זית'), K.gramsOf('כף', 'טחינה'), K.gramsOf('2 כפיות', 'מלח גס')], [39, 15, 10]);
eq('fractions and ranges', [K.gramsOf('1 1/2 כוסות', 'מים מינרליים'), K.gramsOf('½ כוס', 'שמנת'), K.gramsOf('2-3 כפות', 'יוגורט'), K.gramsOf('חצי כוס', 'אורז')], [0, 120, 37.5, 95]);
eq('a count by the food\'s unit weight', [K.gramsOf('3', 'ביצים', 55), K.gramsOf('2 יחידות', 'עגבניה', 120), K.gramsOf('3 ביצים', 'ביצים', 55)], [165, 240, 165]);
eq('a count with no unit weight anywhere: unknown', K.gramsOf('3', 'ענפי רוזמרין', null), null);
eq('to taste: nothing', [K.gramsOf('לפי הטעם', 'מלח'), K.gramsOf('קורט', 'פלפל'), K.gramsOf('', 'מלח לפי הטעם')], [0, 0, 0]);
eq('garlic cloves', K.gramsOf('3 שיני', 'שום'), 12);
eq('no amount, but a unit weight: one', K.gramsOf('', 'אבוקדו', 150), 150);
eq('words we do not know: unknown', K.gramsOf('חופן', 'שקדים'), null);

/* ---- a recipe ---- */
const foods = { 'ביצים': { fat: 10, protein: 13, carbs: 1, fiber: 0, unit_g: 55 }, 'שמן זית': { fat: 100, protein: 0, carbs: 0, fiber: 0 }, 'קמח שקדים': { fat: 50, protein: 21, carbs: 20, fiber: 10 } };
const r = K.recipeFromFoods([{ name: 'ביצים', measure: '4' }, { name: 'שמן זית', measure: '2 כפות' }, { name: 'קמח שקדים', measure: '1 כוס' }, { name: 'מלח', measure: 'קורט' }, { name: 'זעתר', measure: 'חופן' }],
  (n) => foods[n] || null, '4 מנות');
eq('a recipe: the total', r.total, { fat: 98, protein: 49.6, carbs: 22.2, fiber: 10 });
eq('per serving', r.per_serving, { fat: 24.5, protein: 12.4, carbs: 5.6, fiber: 2.5 });
eq('what could not be told', r.unknown, ['זעתר']);
eq('servings not stated: one, and said so', [K.recipeFromFoods([], () => null, '').servings, K.recipeFromFoods([], () => null, '').servingsKnown], [1, false]);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
