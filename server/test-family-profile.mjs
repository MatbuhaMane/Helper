// Tests for the family profile's view filter (server/family-profile-rules.ts):   node server/test-family-profile.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'profile-test-'));
const out = join(dir, 'profile.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/family-profile-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const P = await import(pathToFileURL(out).href);

let failed = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { failed++; console.error('✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

// A ↔ B linked directly, B ↔ C: C is in A's tribe but not linked to it; D stands alone
const bridges = [
  { house_a: 'A', person_a: 'a1', house_b: 'B', person_b: 'b1' },
  { house_a: 'B', person_a: 'b2', house_b: 'C', person_b: 'c1' },
];
const closed = { tribe: false, link: false }, tribe = { tribe: true, link: false }, link = { tribe: false, link: true }, both = { tribe: true, link: true };

// --- who may open ---
eq(P.reach('A', 'A', closed, bridges, false), 'household', 'the household always opens its own');
eq(P.reach('B', 'A', closed, bridges, false), null, 'default: a linked household may not open');
eq(P.reach('D', 'A', closed, bridges, true), null, 'default: a link means nothing when no link was made');
eq(P.reach('B', 'A', tribe, bridges, false), 'linked', 'opened to the tribe: a linked household');
eq(P.reach('C', 'A', tribe, bridges, false), 'forest', 'opened to the tribe: the tribe further away');
eq(P.reach('D', 'A', tribe, bridges, false), null, 'opened to the tribe: not outside it');
eq(P.reach('D', 'A', tribe, bridges, true), null, 'opened to the tribe only: a matching link does not open it');
eq(P.reach('D', 'A', link, bridges, true), 'link', 'by link: the holder of the link');
eq(P.reach('D', 'A', link, bridges, false), null, 'by link: without the link, no');
eq(P.reach('B', 'A', link, bridges, false), null, 'by link only: the tribe still may not');
eq(P.reach('B', 'A', both, bridges, true), 'linked', 'both: tribe distance wins over the link');
eq(P.kinDistance('link'), 'none', 'a link is no relation for tree items');

// --- what each sees ---
const priv = (identity) => ({ identity, dates: 'household', notes: 'household', files: 'household' });
const people = [
  { email: 'dana@x', name: 'דנה', cardName: 'דנה כהן', outside: { privacy: priv('forest'), anonymous: false } },    // open to the forest
  { email: 'yoni@x', name: 'יוני', cardName: 'יונתן', outside: { privacy: priv('linked'), anonymous: false } },     // linked households only
  { email: 'noa@x', name: 'נועה', cardName: 'נועה', outside: { privacy: priv('household'), anonymous: false } },    // the default
  { email: 'avi@x', name: 'אבי', cardName: 'אבי', outside: { privacy: priv('private'), anonymous: false } },
  { email: 'ron@x', name: 'רון', cardName: 'רון', outside: { privacy: priv('forest'), anonymous: true } },          // anonymous outside
  { email: 'gil@x', name: 'גיל', cardName: null, outside: null },                                                    // no card in the tree
];
const recipes = [{ id: 'r1', title: 'חמין', image: '/x.jpg' }, { id: 'r2', title: 'קובה', image: null }];
const s = { ...P.blank('משפחת כהן'), line: 'שורה', origins: [{ place: 'מרוקו', years: '1950' }], traditions: 'ניגון', dishes: ['r2', 'gone', 'r1'], open: tribe };

const home = P.shape(s, 'household', true, people, recipes);
eq(home.people.map((p) => p.name), ['דנה', 'יוני', 'נועה', 'אבי', 'רון', 'גיל'], 'the household sees everyone, by their names');
ok(home.people.every((p) => p.email), 'the household sees the emails');
eq(home.dishes.map((d) => d.title), ['קובה', 'חמין'], 'the household sees the dishes in the chosen order, a deleted one dropped');
ok(home.tree && home.head && home.mine, 'the household sees the tree window; a head is a head');
eq(home.open, tribe, 'the household sees who it is open to');
ok(!P.shape(s, 'household', false, people, recipes).head, 'a member who is not a head is not');

const linked = P.shape(s, 'linked', true, people, recipes);
eq(linked.people.map((p) => p.name || 'gap'), ['דנה כהן', 'יונתן', 'gap', 'gap', 'gap', 'gap'], 'linked: only cards open to linked, by the card name');
ok(linked.people.every((p) => !p.email), 'an email never leaves the household');
ok(linked.people.filter((p) => p.gap).every((p) => Object.keys(p).length === 1), 'a gap carries nothing of the person');
eq(linked.dishes, [{ gap: true }, { gap: true }], 'recipes are the household\'s only: gaps outside');
ok(!linked.tree && !linked.head && !linked.mine && !('open' in linked), 'outside: no tree window, no head, no opening settings');
eq([linked.line, linked.traditions, linked.origins[0].place], ['שורה', 'ניגון', 'מרוקו'], 'the profile\'s own words go to whoever may open it');

const forest = P.shape(s, 'forest', true, people, recipes);
eq(forest.people.map((p) => p.name || 'gap'), ['דנה כהן', 'gap', 'gap', 'gap', 'gap', 'gap'], 'further in the tribe: only cards open to the forest');

const byLink = P.shape(s, 'link', false, people, recipes);
ok(byLink.people.every((p) => p.gap), 'by link: no person at all (the tree never opens by link)');
ok(byLink.dishes.every((d) => d.gap) && !byLink.tree, 'by link: no dishes, no tree');

// --- what a head may store ---
const pt = P.cleanPatch({ title: ' משפחת לוי\u0007 ', cover: 'mars', origins: [{ place: 'תימן', years: '1949' }, { place: '' }], dishes: ['r1', 'r1', 'r2'], traditions: 'א\r\nב', extra: 1 });
eq(pt, { title: 'משפחת לוי', origins: [{ place: 'תימן', years: '1949' }], traditions: 'א\nב', dishes: ['r1', 'r2'] }, 'a patch is cleaned: unknown cover and keys dropped');
eq(P.apply(P.blank('x'), { cover: 'own' }).cover, 'olive', 'an own cover only after a photo was uploaded');
eq(P.apply({ ...P.blank('x'), coverOwn: true }, { cover: 'own' }).cover, 'own', 'an own cover once there is one');
eq(P.apply(s, { line: 'חדש' }).open, tribe, 'a content patch never changes who it is open to');

console.log(failed ? `${failed} of ${n} failed` : `family profile: all ${n} passed`);
process.exit(failed ? 1 : 0);
