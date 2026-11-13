// Tests for the food portal's slider (server/food.ts):   node server/test-food.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'food-test-'));
const out = join(dir, 'f.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/food.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const F = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

/* ---- the same food ---- */
eq('plural and singular', F.sameFood('עגבניות שרי', '4 עגבניה'), true);
eq('a word in common', F.sameFood('גבינה צהובה', 'גבינה לבנה'), true);
eq('different foods', F.sameFood('חלב', 'לחם'), false);
eq('nikud is ignored', F.sameFood('חָלָב', 'חלב 3%'), true);
eq('a whole word inside a longer name', F.sameFood('שמן', 'כף שמן זית'), true);
eq('one letter apart is not the same', F.sameFood('בצל', 'בצק'), false);

/* ---- the slides ---- */
const item = (id, name, expires) => ({ id, name, fridge: 'f1', fridgeName: 'המקרר', expires, qty: 1, unit: null });
const recipe = (id, title, names, at) => ({ id, title, image: null, ingredients: names.map((name) => ({ name })), updated_at: at });
const items = [item('a', 'חלב', '2026-11-14'), item('b', 'עגבניות', '2026-11-12'), item('c', 'יוגורט', '2026-11-30'), item('d', 'גבינה', '2026-11-10')];
const recipes = [recipe('r1', 'עוגה', ['קמח', 'סוכר'], 5), recipe('r2', 'שקשוקה', ['4 עגבניות', 'ביצים'], 1), recipe('r3', 'פשטידה', ['חלב', 'עגבניה'], 2)];
const s = F.pickSlides(items, recipes, '2026-11-12');
eq('the fridge first, soonest first (gone off included), far ones out', s.filter((x) => x.kind === 'fridge').map((x) => [x.name, x.days]), [['גבינה', -2], ['עגבניות', 0], ['חלב', 2]]);
eq('recipes using them first (more first, each in the order they go off), then the recent ones', s.filter((x) => x.kind === 'recipe').map((x) => [x.title, x.uses]), [['פשטידה', ['עגבניות', 'חלב']], ['שקשוקה', ['עגבניות']], ['עוגה', []]]);
eq('something gone off is not a reason to cook it', F.pickSlides([item('d', 'גבינה', '2026-11-10')], [recipe('r', 'טוסט', ['גבינה'], 1)], '2026-11-12').find((x) => x.kind === 'recipe').uses, []);
eq('nothing at all', F.pickSlides([], [], '2026-11-12'), []);
eq('at most max', F.pickSlides([], Array.from({ length: 30 }, (_, i) => recipe('r' + i, 'מתכון ' + i, [], i)), '2026-11-12', 3, 12).length, 12);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
