// Tests for editing members in the owner's room (server/member-admin-rules.ts):   node server/test-member-admin.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'member-admin-test-'));
const out = join(dir, 'member-admin.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/member-admin-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('✗', name); } };
const code = (fn) => { try { fn(); return null; } catch (e) { return e.code || e.message; } };

const OWNERS = new Set(['owner@x.test']);
const HOUSES = new Set(['family', 'inlaws']);
const owner = { email: 'owner@x.test', household: 'family', role: 'owner' };
const brother = { email: 'bro@x.test', household: 'family', role: 'member' };
const other = { email: 'other@x.test', household: 'family', role: 'owner' };   // an old member who was made מנהל by hand

// roles
ok(R.roleOf('owner', [], 'family') === 'owner', 'owner is owner');
ok(R.roleOf('member', ['family'], 'family') === 'head', 'a head of their own household');
ok(R.roleOf('member', ['inlaws'], 'family') === 'member', 'a head row elsewhere is not a head here');

// names
ok(R.checkEdit(brother, { he_name: 'אבי' }, OWNERS, 1, HOUSES).he_name === 'אבי', 'Hebrew name');
ok(code(() => R.checkEdit(brother, { he_name: 'Avi' }, OWNERS, 1, HOUSES)) === 'he_name_hebrew', 'Hebrew name in Hebrew only');
ok(R.checkEdit(brother, { name: '  Avi   Cohen <b>' }, OWNERS, 1, HOUSES).name === 'Avi Cohen b', 'name cleaned');
ok(R.checkEdit(brother, { he_name: '' }, OWNERS, 1, HOUSES).he_name === null, 'empty name clears');

// email
ok(code(() => R.checkEdit(brother, { email: 'new@x.test' }, OWNERS, 1, HOUSES)) === 'email_fixed', 'email cannot change');
ok(code(() => R.checkEdit(brother, { email: 'BRO@x.test ' }, OWNERS, 1, HOUSES)) === null, 'same email is fine');

// roles: the manager
ok(code(() => R.checkEdit(brother, { role: 'owner', confirm: true }, OWNERS, 1, HOUSES)) === 'owner_only_from_config', 'מנהל only for OWNER_EMAIL');
ok(code(() => R.checkEdit(owner, { role: 'member', confirm: true }, OWNERS, 2, HOUSES)) === 'owner_stays', 'OWNER_EMAIL cannot be demoted');
ok(code(() => R.checkEdit(owner, { role: 'head', confirm: true }, OWNERS, 1, HOUSES)) === 'owner_stays', 'nor made a head');
ok(code(() => R.checkEdit(other, { role: 'member', confirm: true }, OWNERS, 1, HOUSES)) === 'last_owner', 'the last manager stays');
ok(R.checkEdit(other, { role: 'member', confirm: true }, OWNERS, 2, HOUSES).role === 'member', 'a hand-made manager can be demoted');
ok(code(() => R.checkEdit(owner, { household: 'inlaws', confirm: true }, OWNERS, 1, HOUSES)) === 'owner_home_fixed', "the manager's household is fixed");
ok(code(() => R.checkEdit(brother, { role: 'boss', confirm: true }, OWNERS, 1, HOUSES)) === 'bad_role', 'unknown role');
ok(R.checkEdit(owner, { role: 'owner' }, OWNERS, 1, HOUSES).role === undefined, 'same role is no change (no confirm needed)');

// confirm
ok(code(() => R.checkEdit(brother, { role: 'head' }, OWNERS, 1, HOUSES)) === 'confirm_needed', 'a role change asks first');
ok(code(() => R.checkEdit(brother, { household: 'inlaws' }, OWNERS, 1, HOUSES)) === 'confirm_needed', 'a household change asks first');
ok(code(() => R.checkEdit(brother, { role: 'head', confirm: 'yes' }, OWNERS, 1, HOUSES)) === 'confirm_needed', 'confirm is true only');

// households
ok(R.checkEdit(brother, { household: 'inlaws', confirm: true }, OWNERS, 1, HOUSES).household === 'inlaws', 'to an existing household');
ok(code(() => R.checkEdit(brother, { household: 'nowhere', confirm: true }, OWNERS, 1, HOUSES)) === 'no_household', 'no made-up household');
ok(R.checkEdit(brother, { household: 'family', role: 'member' }, OWNERS, 1, HOUSES).household === undefined, 'same household is no change');

// the brother: to a new household of his own, as its head
const c = R.checkEdit(brother, { newHousehold: ' משפחת   כהן ', role: 'head', confirm: true }, OWNERS, 1, HOUSES);
ok(c.household === '' && c.newTitle === 'משפחת כהן' && c.role === 'head', 'a new household with its head');
ok(code(() => R.checkEdit(brother, { newHousehold: '   ', household: 'family', role: 'head', confirm: true }, OWNERS, 1, HOUSES)) === 'title_required', 'a new household needs a name');
const c2 = R.checkEdit(brother, { newHousehold: 'משפחת האח', confirm: true }, OWNERS, 1, HOUSES);
ok(c2.household === '' && c2.role === 'head', 'a new household makes its member the head, unasked');
ok(code(() => R.checkEdit(brother, { newHousehold: 'משפחת האח', role: 'member', confirm: true }, OWNERS, 1, HOUSES)) === 'new_household_head', 'a new household is never without its head');
ok(R.checkEdit({ ...brother, role: 'head' }, { newHousehold: 'משפחת האח', confirm: true }, OWNERS, 1, HOUSES).role === undefined, 'already a head: no role change');
ok(code(() => R.checkEdit(owner, { newHousehold: 'בית אחר', confirm: true }, OWNERS, 1, HOUSES)) === 'owner_home_fixed', 'the manager opens no new household');
ok(R.describe('bro@x.test', c, brother) === 'bro@x.test: role member→head, household family→new:משפחת כהן', 'audit line');

// removing
ok(R.mayRemove('owner@x.test', 'other@x.test', OWNERS, 2, true) === 'owner_stays', 'OWNER_EMAIL cannot be removed');
ok(R.mayRemove('other@x.test', 'owner@x.test', OWNERS, 1, true) === 'last_owner', 'nor the last manager');
ok(R.mayRemove('bro@x.test', 'bro@x.test', OWNERS, 1, false) === 'self', 'nor yourself');
ok(R.mayRemove('bro@x.test', 'owner@x.test', OWNERS, 1, false) === null, 'a member can be removed');

// search
ok(R.likeOf('a') === null, 'two letters at least');
ok(R.likeOf(' Dan ') === '%dan%', 'lowercased');
ok(R.likeOf('50%_x') === '%50\\%\\_x%', "LIKE's signs escaped");

// the search across every household: words in names, email and household, with the filters, run on a real SQLite
ok(R.wordsOf('a').length === 0 && R.wordsOf(' ').length === 0, 'under two letters: no words');
ok(R.wordsOf('דני  שבת').join() === '%דני%,%שבת%', 'words split');
ok(R.wordsOf('a b c d e f g').length === 5, 'five words at most');
ok(R.searchSql('', {}) === null, 'nothing to look for');
ok(R.searchSql('x', { seen: 'no' }) !== null, 'a filter alone searches');
const F = (o) => R.filtersOf((k) => o[k] ?? null);
ok(JSON.stringify(F({ role: 'boss', seen: 'maybe', household: '' })) === '{}', 'unknown filters dropped');
ok(JSON.stringify(F({ role: 'head', seen: 'yes', household: 'family' })) === '{"household":"family","role":"head","seen":"yes"}', 'filters read');
ok(!/דני|'family'/.test(R.searchSql("דני' OR 1=1", { household: 'family' }).where), 'values are bound, never in the SQL');

const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE members (email TEXT PRIMARY KEY, name TEXT, he_name TEXT, household TEXT, role TEXT, first_seen INTEGER);
  CREATE TABLE family_households (id TEXT PRIMARY KEY, title TEXT);
  CREATE TABLE family_roles (household TEXT, email TEXT, role TEXT);
  INSERT INTO family_households VALUES ('family', 'משפחת בן שבת'), ('h1', 'משפחת כהן');
  INSERT INTO members VALUES ('owner@x.test', 'Avi Ben Shabat', 'אבי', 'family', 'owner', 1),
    ('dani@x.test', 'Dani Ben Shabat', 'דני', 'family', 'member', 1),
    ('bro@x.test', 'Yossi Cohen', 'יוסי', 'h1', 'member', 1),
    ('new@x.test', NULL, 'נועה', 'h1', 'member', NULL),
    ('pct@x.test', '50%_off', NULL, 'h2', 'member', NULL);
  INSERT INTO family_roles VALUES ('h1', 'bro@x.test', 'head'), ('family', 'bro@x.test', 'head');`);
const find = (q, f = {}) => {
  const s = R.searchSql(q, f);
  if (!s) return '';
  return db.prepare(`SELECT m.email FROM members m LEFT JOIN family_households h ON h.id = m.household WHERE ${s.where} ORDER BY m.email LIMIT 30`)
    .all(...s.binds).map((r) => r.email.split('@')[0]).join(',');
};
ok(find('dani') === 'dani', 'by the Google name, any case');
ok(find('shabat') === 'dani,owner', 'by a last name');
ok(find('יוסי') === 'bro', 'by the Hebrew name');
ok(find('NEW@X') === 'new', 'by email');
ok(find('משפחת בן שבת') === 'dani,owner', "by the household's title");
ok(find('כהן') === 'bro,new', "a word of the title finds that household's members");
ok(find('h1') === 'bro,new', "by the household's id");
ok(find('דני שבת') === 'dani', 'every word must match (a name and a title)');
ok(find('דני כהן') === '', 'words are ANDed');
ok(find('50%') === 'pct' && find('%_') === 'pct' && find('0_') === '', "LIKE's signs are literal");
ok(find('', { household: 'h1' }) === 'bro,new', 'filter: household');
ok(find('', { role: 'owner' }) === 'owner', 'filter: the manager');
ok(find('', { role: 'head' }) === 'bro', 'filter: a head of their own household only');
ok(find('', { role: 'member' }) === 'dani,new,pct', 'filter: plain members');
ok(find('', { seen: 'no' }) === 'new,pct', 'filter: not signed in yet');
ok(find('', { seen: 'yes', household: 'family' }) === 'dani,owner', 'filters together');
ok(find('נועה', { seen: 'yes' }) === '', 'words and filters together');

console.log(`member-admin: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
