// Tests for עץ מבנה: the server's cleaning (server/layout-rules.ts) and the pages' merge (H.mergeLayout in
// public/assets/apps.js).   node server/test-layout.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const dir = mkdtempSync(join(tmpdir(), 'layout-test-'));
const out = join(dir, 'layout.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/layout-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

// apps.js in a page of its own: no storage, no network
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const page = (stored = {}) => {
  const ls = mem(), ss = mem();
  for (const [k, v] of Object.entries(stored)) (k.startsWith('s:') ? ss : ls).setItem(k.replace(/^s:/, ''), JSON.stringify(v));
  const ctx = { H: { prefs: (ns, d) => ({ ...d }), savePrefs() {}, icon: () => null }, localStorage: ls, sessionStorage: ss, fetched: 0,
    addEventListener() {}, dispatchEvent() {}, CustomEvent: class {}, console };
  ctx.fetch = () => { ctx.fetched++; return new Promise(() => {}); };
  ctx.window = ctx;
  vm.runInNewContext(readFileSync(join(process.cwd(), 'public/assets/apps.js'), 'utf8'), ctx);
  return ctx;
};
const H = page().H;
const CODE = H.layout().code;
const DFLT = { parts: H.layout().defaultPins, pins: H.layout().defaultPins };
const merge = (l) => H.mergeLayout(CODE, DFLT, l);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const throws = (name, f, code) => { try { f(); fail++; console.error('FAIL (no throw)', name); } catch (e) { ok(name + ' → ' + code, e.code === code); } };
const hrefs = (apps) => apps.map((a) => a.href);

/* ---- the merge ---- */
const base = merge(null);
ok('no layout: every code item, once', base.apps.length === CODE.length && new Set(hrefs(base.apps)).size === CODE.length);
ok('no layout: the parts as before', JSON.stringify(base.parts) === JSON.stringify(['/food/', '/news/', '/fun/', '/songs/', '/parasha/']));
ok('no layout: the ring default as before', JSON.stringify(base.pins) === JSON.stringify(DFLT.pins));
ok('no layout: the diet tools sit under food', base.tree.find((t) => t.href === '/food/').kids.includes('/food/diet/hakpada/'));
ok('no layout: a tool with no part sits under כלים', base.tree.find((t) => t.href === '/tools/').kids.includes('/mail/'));
ok('no layout: a part comes before its tools', hrefs(base.apps).indexOf('/food/') < hrefs(base.apps).indexOf('/food/fridge/'));
ok('a tool knows its part', base.apps.find((a) => a.href === '/food/fridge/').part === '/food/');
for (const junk of [undefined, 'x', 7, [], { parts: 'no' }, { parts: [null, 3, {}] }]) ok('junk is the code: ' + JSON.stringify(junk), JSON.stringify(merge(junk).apps) === JSON.stringify(base.apps));

const moved = merge({ parts: [{ href: '/news/', kids: ['/mail/', '/gone/'] }, { href: '/gone-part/', kids: ['/pc/'] }, { href: '/food/', kids: [] }] });
ok('the owner\'s order first', hrefs(moved.apps)[0] === '/news/' && hrefs(moved.apps)[1] === '/mail/');
ok('an address gone from the code is skipped', !hrefs(moved.apps).includes('/gone/') && !hrefs(moved.apps).includes('/gone-part/'));
ok('a tool under a gone part goes back to its own place', moved.tree.find((t) => t.href === '/tools/').kids.includes('/pc/'));
ok('nothing is lost', moved.apps.length === CODE.length);
ok('nothing twice', new Set(hrefs(moved.apps)).size === moved.apps.length);
const foodKids = base.tree.find((t) => t.href === '/food/').kids;
const emptied = merge({ parts: [{ href: '/news/', kids: foodKids }, { href: '/food/', kids: [] }] });
ok('the food tools moved under news stay there, and food is empty', emptied.tree.find((t) => t.href === '/food/').kids.length === 0
  && foodKids.every((k) => emptied.tree.find((t) => t.href === '/news/').kids.includes(k)));
ok('a new code tool the layout does not know still appears', hrefs(moved.apps).includes('/food/fridge/'));
ok('the parts follow the owner\'s order', moved.parts[0] === '/news/' && moved.parts[1] === '/food/');

const dup = merge({ parts: [{ href: '/news/', kids: ['/mail/'] }, { href: '/fun/', kids: ['/mail/', '/news/'] }, { href: '/news/', kids: [] }] });
ok('an address twice: the first place wins', dup.tree.find((t) => t.href === '/news/').kids.includes('/mail/') && !dup.tree.find((t) => t.href === '/fun/').kids.includes('/mail/'));
ok('a part twice: once', dup.tree.filter((t) => t.href === '/news/').length === 1);

const fixedKid = merge({ parts: [{ href: '/food/', kids: ['/family/', '/settings/'] }] });
ok('a fixed item cannot be put under a part', !fixedKid.tree.find((t) => t.href === '/food/').kids.includes('/family/') && fixedKid.tree.some((t) => t.href === '/family/'));

const hid = merge({ hidden: ['/news/', '/mail/', '/family/', '/gone/'], ring: ['/news/', '/mail/'] });
ok('hidden: off the list', !hrefs(hid.apps).includes('/news/') && !hrefs(hid.apps).includes('/mail/'));
ok('a fixed item cannot be hidden', hrefs(hid.apps).includes('/family/') && !hid.hidden.includes('/family/'));
ok('a hidden part is not a part', !hid.parts.includes('/news/'));
ok('a hidden part\'s tools stay', hrefs(hid.apps).includes('/tools/calendar/'));
ok('a ring of hidden items falls back to the default (without the hidden)', JSON.stringify(hid.pins) === JSON.stringify(DFLT.pins.filter((h) => h !== '/news/')));

const ring = merge({ ring: ['/mail/', '/family/', '/gone/', '/mail/', '/pc/'] });
ok('the ring: known, not fixed, once, in order', JSON.stringify(ring.pins) === JSON.stringify(['/mail/', '/pc/']));

const ed = merge({ edits: { '/news/': { name: 'עיתון', ic: 'paper', pillow: 'p02', c2: '#112233', evil: 'x', sub: 3 }, '/gone/': { name: 'x' } } });
const news = ed.apps.find((a) => a.href === '/news/');
ok('an edit changes the look', news.name === 'עיתון' && news.ic === 'paper' && news.pillow === 'p02' && news.c2 === '#112233');
ok('an edit keeps what it does not name', news.sub === CODE.find((a) => a.href === '/news/').sub);
ok('an unknown key is not copied', !('evil' in news));
ok('the code is not changed by an edit', CODE.find((a) => a.href === '/news/').name === 'חדשות');

/* ---- the page: the cached layout and the owner's preview ---- */
const cachedPage = page({ 'helper.layout': { v: 3, at: Date.now(), layout: { hidden: ['/pc/'] } } });
ok('the cached layout is applied at once', !hrefs(cachedPage.H.APPS).includes('/pc/'));
ok('a fresh cache does not fetch', cachedPage.fetched === 0);
ok('an old cache fetches', page({ 'helper.layout': { v: 3, at: 1, layout: {} } }).fetched === 1);
const pv = page({ 'helper.layout': { v: 3, at: 1, layout: { hidden: ['/pc/'] } }, 's:helper.layoutPreview': { hidden: ['/mail/'] } });
ok('the preview wins over the cache, and does not fetch', !hrefs(pv.H.APPS).includes('/mail/') && hrefs(pv.H.APPS).includes('/pc/') && pv.fetched === 0);
ok('H.PARTS', JSON.stringify(page().H.PARTS) === JSON.stringify(DFLT.parts));

/* ---- the server's cleaning ---- */
const c = R.sanitizeLayout({ parts: [{ href: '/news/', kids: ['/mail/', 'javascript:x', '//evil.com/', '/mail/'] }, { href: 'https://x' }], hidden: ['/pc/', 5, '/pc/'],
  edits: { '/news/': { name: ' <b>עיתון</b>  חדש ', ic: 'Bad Icon', pillow: 'p16', c2: 'red', x: 1 }, '/fun/': { pillow: 'p05', c2: '#ABCDEF', ic: 'star' }, 'bad': { name: 'x' } },
  ring: ['/news/'], other: 1 });
ok('clean: valid addresses only, each once', JSON.stringify(c.parts) === JSON.stringify([{ href: '/news/', kids: ['/mail/'] }]));
ok('clean: hidden once', JSON.stringify(c.hidden) === JSON.stringify(['/pc/']));
ok('clean: tags and spaces out of a name', c.edits['/news/'].name === 'bעיתון/b חדש');
ok('clean: a bad icon, cushion or colour is dropped', !c.edits['/news/'].ic && !c.edits['/news/'].pillow && !c.edits['/news/'].c2);
ok('clean: good ones kept, the colour in lower case', c.edits['/fun/'].pillow === 'p05' && c.edits['/fun/'].c2 === '#abcdef' && c.edits['/fun/'].ic === 'star');
ok('clean: an edit for a bad address is dropped', !('bad' in c.edits));
ok('clean: unknown keys dropped', !('other' in c));
ok('clean: a JSON string is read', R.sanitizeLayout('{"hidden":["/pc/"]}').hidden[0] === '/pc/');
throws('not JSON', () => R.sanitizeLayout('{nope'), 'bad_layout');
throws('an array', () => R.sanitizeLayout([]), 'bad_layout');
throws('nothing', () => R.sanitizeLayout(null), 'bad_layout');
throws('too big', () => R.sanitizeLayout({ hidden: Array(5000).fill('/aaaaaaaaaaaaaaaa/') }), 'too_big');
ok('the ring is at most 12', R.sanitizeLayout({ ring: Array.from({ length: 30 }, (_, i) => `/t${i}/`) }).ring.length === 12);

/* ---- the eggs ---- */
const now = Date.parse('2026-11-13T12:00:00Z'), DAY = 864e5;
const egg = (o) => R.cleanEgg({ page: '/food/', text: 'מצאת!', ...o }, now);
ok('an egg: defaults', JSON.stringify(egg({})) === JSON.stringify({ page: '/food/', text: 'מצאת!', kind: 'text', link: null, starts: null, ends: null, active: true, x: 50, y: 50 }));
ok('the home page', egg({ page: '/' }).page === '/');
throws('a page with #', () => egg({ page: '/food/#x' }), 'bad_page');
throws('a page outside', () => egg({ page: 'https://evil.com/' }), 'bad_page');
throws('no text', () => egg({ text: '  ' }), 'no_text');
ok('a link inside the site', egg({ kind: 'link', link: '/songs/' }).link === '/songs/');
ok('an https link', egg({ kind: 'link', link: 'https://example.com/a' }).link === 'https://example.com/a');
throws('a javascript link', () => egg({ kind: 'link', link: 'javascript:alert(1)' }), 'bad_link');
throws('an http link', () => egg({ kind: 'link', link: 'http://example.com/' }), 'bad_link');
ok('a link on a text egg is dropped', egg({ link: 'https://example.com/' }).link === null);
ok('dates as text', egg({ starts: '2026-12-01', ends: '2026-12-08' }).ends === Date.parse('2026-12-08'));
throws('ends before it starts', () => egg({ starts: '2026-12-08', ends: '2026-12-01' }), 'ends_first');
throws('already over', () => egg({ ends: '2026-11-01' }), 'already_over');
throws('a bad date', () => egg({ starts: 'soon' }), 'bad_date');
ok('the place is kept on the page', egg({ x: -40, y: 400 }).x === 8 && egg({ x: -40, y: 400 }).y === 92);
const e = (o) => ({ active: true, starts: null, ends: null, ...o });
ok('live: no dates', R.eggLive(e({}), now));
ok('live: off', !R.eggLive(e({ active: 0 }), now));
ok('live: not yet', !R.eggLive(e({ starts: now + 1 }), now) && R.eggState(e({ starts: now + 1 }), now) === 'soon');
ok('live: the whole last day', R.eggLive(e({ ends: now - DAY + 1 }), now));
ok('live: over', !R.eggLive(e({ ends: now - DAY }), now) && R.eggState(e({ ends: now - DAY }), now) === 'over');
ok('state: off', R.eggState(e({ active: false }), now) === 'off');
ok('the page form', R.pageOf('/food') === '/food/' && R.pageOf('/food/?a=1#b') === '/food/' && R.pageOf('/') === '/' && R.pageOf('x') === null && R.pageOf('/a.html') === '/a.html');

console.log(`layout: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
