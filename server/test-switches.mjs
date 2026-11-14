// Tests for the switchboard: server/switches-rules.ts, and that public/assets/apps.js hides the same things.
//   node server/test-switches.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const dir = mkdtempSync(join(tmpdir(), 'switches-test-'));
const out = join(dir, 's.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/switches-rules.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

/* ---- who may change a switch ---- */
eq('the owner, from their own account', R.mayChange({ own: true, level: 'owner' }), true);
eq('a super sees the board but may not change it', R.mayChange({ own: true, level: 'super' }), false);
eq('the owner visiting from someone else\'s account', R.mayChange({ own: false, level: 'owner' }), false);

/* ---- values ---- */
eq('a bool takes a bool', R.switchValue('daemon', false), false);
eq('a bool refuses a string', R.switchValue('daemon', 'false'), null);
eq('exp takes its three states', ['hide', 'only', 'all'].map((v) => R.switchValue('exp', v)), ['hide', 'only', 'all']);
eq('exp refuses anything else', R.switchValue('exp', 'some'), null);
eq('mood takes רגיל/חגיגה/אבל', ['normal', 'party', 'mourning'].map((v) => R.switchValue('mood', v)), ['normal', 'party', 'mourning']);
eq('an unknown switch', R.switchValue('nope', true), null);
eq('a setting is not a switch', R.switchValue('money.shop_open', true), null);
const def = R.stateOf({});
eq('defaults: everything on, הכל, רגיל, חול', [def.exp, def.mood, def.kodesh, def.kodesh_auto, def.daemon, def.push, def.music], ['all', 'normal', false, false, true, true, true]);
eq('a stored value that no longer fits falls back to the default', R.stateOf({ exp: 'gone', daemon: 'x', music: false }).exp + R.stateOf({ daemon: 'x' }).daemon + R.stateOf({ music: false }).music, 'alltruefalse');
eq('every switch has a category on the board', R.SWITCHES.every((s) => R.CATS.some(([c]) => c === s.cat)), true);
eq('every setting on the board has a category', Object.values(R.SETTING_CATS).every((c) => R.CATS.some(([k]) => k === c)), true);
eq('keys are unique', new Set(R.SWITCHES.map((s) => s.key)).size, R.SWITCHES.length);

/* ---- קודש ---- */
eq('kodesh set by hand', R.publicState(R.stateOf({ kodesh: true }), false).kodesh, true);
eq('auto, outside Shabbat: חול', R.publicState(R.stateOf({ kodesh_auto: true }), false).kodesh, false);
eq('auto, inside Shabbat: קודש', R.publicState(R.stateOf({ kodesh_auto: true }), true).kodesh, true);
eq('not auto, inside Shabbat: חול', R.publicState(R.stateOf({}), true).kodesh, false);

/* ---- what each experimental mode shows (the rules) ---- */
const A = { news: { href: '/news/' }, mail: { href: '/mail/', tag: 'ניסיוני', access: 'beta' }, family: { href: '/family/', fixed: true }, shop: { href: '/groceries/' } };
const vis = (sw) => Object.keys(A).filter((k) => R.shows(A[k], sw));
eq('הכל', vis({ exp: 'all' }), ['news', 'mail', 'family', 'shop']);
eq('הסתר ניסיוני', vis({ exp: 'hide' }), ['news', 'family', 'shop']);
eq('רק ניסיוני (and the fixed)', vis({ exp: 'only' }), ['mail', 'family']);
eq('קודש tucks away the weekday tools', vis({ exp: 'all', kodesh: true }), ['news', 'family']);
eq('the future items: hidden by הסתר only', ['hide', 'only', 'all'].map((e) => R.showsFuture({ exp: e })), [false, true, true]);

/* ---- apps.js agrees: load it with a small stand-in for the page and H, under each mode ---- */
const src = readFileSync(join(process.cwd(), 'public/assets/apps.js'), 'utf8');
function load(switches) {
  const store = new Map();
  const ls = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const H = { switches, prefs: () => ({ pins: [] }), savePrefs() {}, el: () => ({}), icon: () => ({}) };
  const ctx = { H, localStorage: ls, sessionStorage: ls, fetch: () => new Promise(() => {}), addEventListener() {}, dispatchEvent() {}, CustomEvent: class {}, console };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  return H;
}
const hrefs = (H) => H.APPS.map((a) => a.href);
const all = load({ exp: 'all' }), hide = load({ exp: 'hide' }), only = load({ exp: 'only' }), kod = load({ exp: 'all', kodesh: true });
const code = all.layout().code;
const expApps = code.filter((a) => R.isExp(a)).map((a) => a.href);
eq('there are experimental apps to test with', expApps.length > 0, true);
for (const [name, H, sw] of [['all', all, { exp: 'all' }], ['hide', hide, { exp: 'hide' }], ['only', only, { exp: 'only' }], ['kodesh', kod, { exp: 'all', kodesh: true }]]) {
  const want = hrefs(all).filter((h) => R.shows(code.find((a) => a.href === h) || { href: h }, sw));
  eq(`apps.js ${name}: the same apps as the rules`, hrefs(H), want);
}
eq('apps.js hide: no experimental app is left', hrefs(hide).some((h) => expApps.includes(h)), false);
eq('apps.js hide: no בעתיד and no בקרוב', [hide.FUTURE.length, hide.SOON.length], [0, 0]);
eq('apps.js all: בעתיד and בקרוב are there', all.FUTURE.length > 0 && all.SOON.length > 0, true);
eq('apps.js only: only experimental or fixed apps', only.APPS.every((a) => a.fixed || R.isExp(a)), true);
eq('apps.js only: the future items stay', only.FUTURE.length, all.FUTURE.length);
eq('apps.js kodesh: no weekday tool', hrefs(kod).some((h) => R.WEEKDAY.includes(h)), false);
eq('apps.js kodesh: the weekday tools exist in the catalogue', R.WEEKDAY.every((h) => code.some((a) => a.href === h)), true);
eq('apps.js keeps the same weekday list', (src.match(/const WEEKDAY = (\[[^\]]*\])/) || [])[1]?.replace(/'/g, '"'), JSON.stringify(R.WEEKDAY).replace(/,/g, ', '));

console.log(`switches: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
