// Tests for the family story's view filter (server/story-rules.ts):   node server/test-story.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'story-test-'));
const out = join(dir, 'story.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/story-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const S = await import(pathToFileURL(out).href);

let failed = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { failed++; console.error('✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const item = (o = {}) => ({
  id: 'i1', household: 'A', kind: 'recording', level: 'household', owner: 'savta@x', title: 'הסיפור של סבתא', text: 'גדלתי בבגדד',
  when: 'שנות ה-50', year: 1955, place: 'בגדד', people: ['p1', 'p2'], mime: 'audio/webm', size: 1000, hasFile: true, created: 1, deleted: false, ...o,
});
const D = ['household', 'linked', 'forest', 'none'];
const seenAt = (it, viewer = 'mom@x') => D.filter((d) => S.itemShows(it, d, viewer));

// --- who sees an item, by its level ---
eq(seenAt(item()), ['household'], 'default (household): the household only');
eq(seenAt(item({ level: 'tribe' })), ['household', 'linked', 'forest'], 'tribe: the household and the linked households, never outside');
eq(seenAt(item({ level: 'private' })), [], 'private: not another member of the household');
eq(seenAt(item({ level: 'private' }), 'savta@x'), ['household'], 'private: the one who added it, at home');
eq(seenAt(item({ level: 'tribe', deleted: true }), 'savta@x'), [], 'deleted: nobody, not even the one who added it');
eq(seenAt(item({ level: 'whatever' })), ['household', 'linked', 'forest'].filter(() => false), 'an unknown level opens to nobody');

// --- what leaves the household ---
const out1 = S.shapeItem(item({ level: 'tribe' }), 'linked', 'cousin@y');
eq(out1.people, [{ gap: true }, { gap: true }], 'outside: every people tag is an empty spot');
eq([out1.file, out1.mime, out1.size], [false, null, null], 'outside: no file, no file details');
ok(!('by' in out1) && !('level' in out1), 'outside: no uploader email, no level');
eq(out1.mine, false, 'outside: never mine');
const home = S.shapeItem(item(), 'household', 'mom@x');
eq([home.people, home.file, home.by, home.level, home.mine], [['p1', 'p2'], true, 'savta@x', 'household', false], 'at home: tags, file, who added it');
eq(S.shapeItem(item(), 'household', 'savta@x').mine, true, 'at home: the one who added it');
eq(S.shapeItem(item(), 'linked', 'cousin@y'), null, 'a household item to a linked household: as if not there');
eq(S.shapeItem(item({ level: 'tribe' }), 'none', 'stranger@z'), null, 'a tribe item to a stranger: as if not there');

// --- files ---
eq(S.fileShows(item({ level: 'tribe' }), 'linked', 'cousin@y'), false, 'a tribe item\'s file never leaves the household');
eq(S.fileShows(item({ level: 'private' }), 'household', 'mom@x'), false, 'someone else\'s private file');
eq(S.fileShows(item({ level: 'private' }), 'household', 'savta@x'), true, 'your own private file');
eq(S.fileShows(item({ hasFile: false }), 'household', 'mom@x'), false, 'no file, nothing to give');

// --- a list: filtered, then the timeline order ---
const list = [item({ id: 'a', year: null, created: 1 }), item({ id: 'b', year: 1990, created: 2 }), item({ id: 'c', year: 1948, created: 3 }),
  item({ id: 'd', level: 'private', created: 4 }), item({ id: 'e', level: 'tribe', year: 1970, created: 5 })];
eq(S.shapeAll(list, 'household', 'mom@x').map((x) => x.id), ['c', 'e', 'b', 'a'], 'home: oldest first, undated last, private of others out');
eq(S.shapeAll(list, 'forest', 'far@w').map((x) => x.id), ['e'], 'the tribe: only tribe items');

// --- levels change only by the one who added it ---
eq(S.nextLevel(item(), 'mom@x', 'tribe'), 'household', 'another member may not widen');
eq(S.nextLevel(item({ level: 'private' }), 'mom@x', 'household'), 'private', 'nor open a private one');
eq(S.nextLevel(item(), 'savta@x', 'tribe'), 'tribe', 'the one who added it may widen');
eq(S.nextLevel(item({ level: 'tribe' }), 'savta@x', 'private'), 'private', 'and narrow');
eq(S.nextLevel(item(), 'savta@x', 'everyone'), 'household', 'no unknown level');

// --- the input is cleaned ---
const c = S.cleanInput({ kind: 'photo', title: ' שם\u0000 ', level: 'public', people: ['p1', 'p1', '', 'p2'], extra: 1 });
eq(c, { kind: 'photo', title: 'שם', people: ['p1', 'p2'] }, 'cleaned: no unknown level, no repeats, no extras');
eq(S.cleanInput({ kind: 'video' }), {}, 'no unknown kind');

// --- storage: 2 GB, only new uploads stop ---
ok(S.roomFor(0, 1000), 'room in an empty household');
ok(!S.roomFor(S.QUOTA - 10, 11), 'full: the next upload stops');
ok(S.roomFor(S.QUOTA - 11, 11), 'exactly full is still in');
ok(!S.roomFor(0, S.MAX_FILE + 1), 'a file over 25 MB');

// --- files are judged by their bytes ---
const b = (...xs) => { const u = new Uint8Array(16); xs.forEach((x, i) => (u[i] = x)); return u; };
const webm = b(0x1a, 0x45, 0xdf, 0xa3), jpeg = b(0xff, 0xd8, 0xff), pdf = b(0x25, 0x50, 0x44, 0x46), html = new TextEncoder().encode('<html><script>');
const webp = b(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
eq(S.fileType('recording', webm), 'audio/webm', 'a recording in webm (Opus)');
eq(S.fileType('photo', webp), 'image/webp', 'a photo in webp');
eq(S.fileType('photo', webm), null, 'a photo may not be audio');
eq(S.fileType('doc', pdf), 'application/pdf', 'a document as pdf');
eq(S.fileType('recording', html), null, 'html is never taken');
eq(S.fileType('story', jpeg), null, 'a written story takes no file');

// --- rough dates for the timeline ---
const Y = (s) => S.yearOf(s, 2026);
eq([Y('1952'), Y('שנות ה-50'), Y('שנות החמישים'), Y('קיץ 73'), Y('ט"ו בשבט 1948'), Y('פסח 25'), Y('מזמן')], [1952, 1955, 1955, 1973, 1948, 2025, null], 'years from rough dates');

console.log(failed ? `✗ ${failed} of ${n} failed` : `✓ story: ${n} checks`);
process.exit(failed ? 1 : 0);
