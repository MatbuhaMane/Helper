// Tests for reading a recipe without AI (server/recipe-parse.ts):   node server/test-recipe-parse.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'recipe-test-'));
const out = join(dir, 'r.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/recipe-parse.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));
const page = (body, head = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

/* ---- JSON-LD, as before ---- */
const ld = R.recipeFromJsonLd(page('', `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"עוגת שוקולד","recipeIngredient":["2 כוסות קמח","3 ביצים"],"recipeInstructions":[{"@type":"HowToStep","text":"לערבב"},{"@type":"HowToStep","text":"לאפות"}],"image":["https://x.test/a.jpg"]}]}</script>`), 'https://x.test/r');
eq('JSON-LD: title, ingredients, steps', [ld.title, ld.ingredients, ld.steps, ld.image], ['עוגת שוקולד', [{ measure: '2 כוסות', name: 'קמח' }, { measure: '3', name: 'ביצים' }], ['לערבב', 'לאפות'], 'https://x.test/a.jpg']);
eq('JSON-LD: none', R.recipeFromJsonLd(page('<p>hello</p>'), 'u'), null);

/* ---- microdata ---- */
const md = R.recipeFromPage(page(`<h1>פשטידה</h1><ul><li itemprop="recipeIngredient">1 כוס חלב</li><li itemprop="recipeIngredient">2 ביצים</li></ul>
  <div itemprop="recipeInstructions"><ol><li>מערבבים</li><li>אופים</li></ol></div>`), 'https://x.test/p');
eq('microdata', [md.title, md.ingredients.map((i) => i.name), md.steps], ['פשטידה', ['חלב', 'ביצים'], ['מערבבים', 'אופים']]);

/* ---- a plain Hebrew page: lists under headings ---- */
const he = R.recipeFromPage(page(`<h1>שקשוקה של סבתא</h1><p>מתכון משפחתי.</p>
  <h2>מצרכים:</h2><ul><li>4 עגבניות</li><li>2 שיני שום</li><li>- 4 ביצים</li></ul>
  <h2>אופן ההכנה</h2><ol><li>1. חותכים את העגבניות</li><li>2) מבשלים 20 דקות</li><li>שוברים את הביצים</li></ol>
  <h3>תגובות</h3><p>טעים!</p>`, '<meta property="og:image" content="/img/s.jpg">'), 'https://site.test/r/1');
eq('headings: title and picture', [he.title, he.image], ['שקשוקה של סבתא', 'https://site.test/img/s.jpg']);
eq('headings: ingredients (bullets and numbers taken off)', he.ingredients, [{ measure: '4', name: 'עגבניות' }, { measure: '2 שיני', name: 'שום' }, { measure: '4', name: 'ביצים' }]);
eq('headings: steps', he.steps, ['חותכים את העגבניות', 'מבשלים 20 דקות', 'שוברים את הביצים']);

/* ---- a heading in <strong>, the lines in paragraphs ---- */
const para = R.recipeFromPage(page(`<p><strong>המצרכים</strong></p><p>200 גרם חמאה</p><p>1 כוס סוכר</p><p><strong>הכנה:</strong></p><p>מקציפים</p><p>אופים</p>`), 'u');
eq('a <strong> heading, paragraph lines', [para.ingredients.map((i) => i.name), para.steps], [['חמאה', 'סוכר'], ['מקציפים', 'אופים']]);

/* ---- English ---- */
const en = R.recipeFromPage(page(`<h1>Pancakes</h1><h3>Ingredients</h3><ul><li>1 cup flour</li><li>1 egg</li></ul><h3>Directions</h3><ol><li>Mix</li><li>Fry</li></ol>`), 'u');
eq('English headings', [en.ingredients[0], en.steps], [{ measure: '1 cup', name: 'flour' }, ['Mix', 'Fry']]);

/* ---- not a recipe ---- */
eq('a page with no recipe', R.recipeFromPage(page('<h1>חדשות</h1><p>היום קרה משהו.</p>'), 'u'), null);
eq('one line is not a list of ingredients', R.recipeFromPage(page('<h2>מצרכים</h2><ul><li>אהבה</li></ul>'), 'u'), null);
eq('a word that only starts like a heading', R.recipeFromPage(page('<h2>מצרכיםשונים</h2><ul><li>א</li><li>ב</li></ul>'), 'u'), null);

/* ---- a draft, when nothing was found ---- */
eq('a draft keeps the title and picture', R.draftFromPage(page('<h1>מתכון</h1>', '<meta property="og:title" content="מרק עדשים"><meta property="og:image" content="https://x.test/m.jpg">'), 'https://x.test/m'),
  { title: 'מרק עדשים', image: 'https://x.test/m.jpg', source_url: 'https://x.test/m', ingredients: [], steps: [], notes: null, tags: [] });

/* ---- the measure ---- */
eq('a measure in grams', R.splitIngredient('200 גרם חמאה'), { measure: '200 גרם', name: 'חמאה' });
eq('no measure', R.splitIngredient('מלח לפי הטעם'), { measure: '', name: 'מלח לפי הטעם' });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
