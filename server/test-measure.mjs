// Tests for public/groceries/measure.js (scaling by servings, grams ↔ cups and spoons). Run: node server/test-measure.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('../public/groceries/measure.js', import.meta.url), 'utf8'), ctx);
const M = ctx.Measure;
let fail = 0, n = 0;
const eq = (got, want, what) => { n++; if (got !== want) { fail++; console.log(`✗ ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

// reading
eq(M.parse('1/2 כוס').qty, 0.5, 'a fraction');
eq(M.parse('1 1/2 כוסות').qty, 1.5, 'a mixed number');
eq(M.parse('1½ כוסות').qty, 1.5, 'a unicode fraction');
eq(M.parse('כף וחצי').qty, 1.5, 'כף וחצי');
eq(M.parse('חצי כוס').qty, 0.5, 'חצי כוס');
eq(M.parse('2-3 שיני').qty2, 3, 'a range');
eq(M.parse('4 שיני').unit.id, 'clove', 'שיני is a clove');
eq(M.parse('1 כפית גדושה').rest, 'גדושה', 'the rest is kept');
eq(M.parse('לפי הטעם'), null, 'no quantity');
eq(M.parse('200 גר').unit.id, 'g', 'גר is grams');

// scaling
eq(M.scale('1/2 כוס', 2), '1 כוס', '½ cup ×2');
eq(M.scale('1 כוס', 2), '2 כוסות', 'a plural');
eq(M.scale('3 כפות', 0.5), '1½ כפות', '3 tbsp ×½');
eq(M.scale('1 יחידה גדולה', 3), '3 יחידות גדולות', 'the size agrees');
eq(M.scale('2 כוסות', 1 / 3), '⅔ כוס', 'a third of a cup');
eq(M.scale('2 כפות', 0.5), '1 כף', 'back to the singular');
eq(M.scale('1 כפית', 17 / 15), '1¼ כפיות', 'no 1⅛ teaspoons');
eq(M.scale('1/4 כפית', 0.5), '⅛ כפית', 'an eighth below one');
eq(M.scale('1/2 כוס (120 גרם)', 2), '1 כוס (240 גרם)', 'the weight in parentheses too');
eq(M.scale('1 יחידה בינונית (כ-600 גרם פרחים)', 2), '2 יחידות בינוניות (כ-600 גרם פרחים)'.replace('600', '1200'), 'units and the weight');
eq(M.scale('2-3 שיני', 2), '4-6 שיני', 'a range');
eq(M.scale('200 גרם', 1.5), '300 גרם', 'grams');
eq(M.scale('קורט', 2), 'קורט', 'a pinch stays');
eq(M.scale('לפי הטעם', 3), 'לפי הטעם', 'unreadable stays');
eq(M.scale('1 כוס', 1), '1 כוס', '×1 is as written');
eq(M.scale('3', 2), '6', 'a bare count');
eq(M.scale('1 כף וחצי', 2), '3 כפות', 'a spoon and a half ×2');

// converting
eq(M.convert('1 כוס', 'קמח לבן', 'grams'), '140 גרם', 'a cup of flour');
eq(M.convert('1/2 כוס', 'סוכר', 'grams'), '100 גרם', 'half a cup of sugar');
eq(M.convert('1/2 כוס (120 גרם)', 'משהו', 'grams'), '120 גרם', 'the written weight wins');
eq(M.convert('2 כפות', 'שמן זית', 'grams'), '30 מ"ל', 'a liquid in ml');
eq(M.convert('1 כוס', 'גזר', 'grams'), null, 'an unknown density: nothing');
eq(M.convert('4 שיני', 'שום', 'grams'), null, 'a count: nothing');
eq(M.convert('280 גרם', 'קמח', 'cups'), '2 כוסות', 'flour back to cups');
eq(M.convert('30 גרם', 'סוכר', 'cups'), '2½ כפות', 'a little sugar in spoons');
eq(M.convert('6 גרם', 'מלח', 'cups'), '1 כפית', 'salt in teaspoons');
eq(M.convert('500 מ"ל', 'חלב', 'cups'), '2 כוסות', 'ml to cups');
eq(M.convert('1 כוס', 'קמח', 'cups'), null, 'already cups');
eq(M.convert('2 ק"ג', 'קמח', 'cups'), '14 כוסות', 'kilos of flour in cups (rounded)');
eq(M.show('1/2 כוס', 'אורז', 2, 'grams'), '200 גרם', 'scale then convert');
eq(M.show('1/2 כוס', 'אורז', 2, 'orig'), '1 כוס', 'scale only');

// servings
eq(M.servings({ servings: '4' }), 4, 'servings from meta');
eq(M.servings({ servings: '4-6 מנות' }), 4, 'the first number');
eq(M.servings({}), null, 'no servings');

console.log(fail ? `${fail} of ${n} failed` : `all ${n} passed`);
process.exit(fail ? 1 : 0);
