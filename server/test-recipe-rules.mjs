// Tests for the recipe check without AI (server/recipe-rules.ts):   node server/test-recipe-rules.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'rules-test-'));
const out = join(dir, 'r.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/recipe-rules.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const ing = (...names) => names.map((n) => (Array.isArray(n) ? { name: n[0], measure: n[1] } : { name: n, measure: '1' }));
const kinds = (r) => r.kosher.map((k) => [k.index, k.kind]);

/* ---- kashrut ---- */
eq('pork, in Hebrew and English', kinds(R.checkByRules(ing('100 גרם בייקון', 'ביצים', 'Pancetta'))), [[0, 'forbidden'], [2, 'forbidden']]);
eq('shellfish', kinds(R.checkByRules(ing('מולים', 'שום'))), [[0, 'forbidden']]);
eq('shrimp is its own kind', kinds(R.checkByRules(ing('שרימפס', 'לימון'))), [[0, 'shrimp']]);
eq('meat with dairy: the dairy one is marked', kinds(R.checkByRules(ing('חזה עוף', 'שמנת מתוקה', 'בצל'))), [[1, 'meat_dairy']]);
eq('a prefix is fine (ובשר, והחמאה)', kinds(R.checkByRules(ing('ובשר טחון', 'והחמאה'))), [[1, 'meat_dairy']]);
eq('coconut milk and peanut butter are not dairy', kinds(R.checkByRules(ing('עוף', 'חלב קוקוס', 'חמאת בוטנים'))), []);
eq('dairy without meat is fine', kinds(R.checkByRules(ing('פסטה', 'שמנת', 'פרמזן'))), []);
eq('a word that only contains another is not it ("חזירת" is not "חזיר"? – "בקרם" is not "בקר")', kinds(R.checkByRules(ing('בקרם', 'שמנת'))), []);
eq('"ham" is not "hamburger"... but a hamburger is meat', kinds(R.checkByRules(ing('hamburger', 'cheese'))), [[1, 'meat_dairy']]);
eq('a kosher recipe', R.checkByRules(ing('עוף', 'בצל', 'שמן זית')).kosher, []);
eq('nikud does not matter', kinds(R.checkByRules(ing('חֲזִיר'))), [[0, 'forbidden']]);

/* ---- keto ---- */
eq('carbs', R.checkByRules(ing('קמח', 'סוכר', '2 כוסות אורז', 'ביצים')).keto.map((k) => k.index), [0, 1, 2]);
eq('their keto versions are fine', R.checkByRules(ing('קמח שקדים', 'אורז כרובית', 'אטריות קישוא', 'שוקולד ללא סוכר')).keto, []);
eq('green beans are fine, beans are not', R.checkByRules(ing('שעועית ירוקה', 'שעועית לבנה')).keto.map((k) => k.index), [1]);
eq('a reason and substitutes', R.checkByRules(ing('פסטה')).keto[0], { index: 0, reason_he: 'עשיר בפחמימות', subs: ['אטריות קישוא', 'אטריות שיראטאקי', 'ספגטי דלעת'] });

/* ---- amounts ---- */
eq('the ones with no amount (salt and "to taste" need none)', R.checkByRules(ing(['בצל', ''], ['מלח', ''], ['פלפל שחור', ''], ['שמן', '2 כפות'], ['עגבניות', ' '])).missing, [0, 4]);

/* ---- the shape the page knows ---- */
eq('empty lists when nothing is wrong', R.checkByRules(ing('עגבניה', 'מלפפון')), { kosher: [], keto: [], missing: [] });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
