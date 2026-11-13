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

console.log(`member-admin: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
