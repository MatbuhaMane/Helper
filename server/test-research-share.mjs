// Tests for shared research (server/research-share.ts):   node server/test-research-share.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'share-test-'));
const out = join(dir, 's.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/research-share.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const S = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

/* ---- the roles ---- */
const table = (action, opts) => S.ROLES.map((r) => S.can(r, action, opts));
eq('everyone sees and comments', [table('view'), table('comment')], [[true, true, true, true], [true, true, true, true]]);
eq('adding: from contributor up', table('add'), [true, true, true, false]);
eq('one\'s own: from contributor up', table('editOwn', { mine: true }), [true, true, true, false]);
eq('someone else\'s: from editor up', table('editOwn', { mine: false }), [true, true, false, false]);
eq('restoring from the history: from editor up', table('restore'), [true, true, false, false]);
eq('managing, deleting, settings: the owner only', [table('manage'), table('delete'), table('settings')], [[true, false, false, false], [true, false, false, false], [true, false, false, false]]);
eq('the owner invites anyone but another owner', ['editor', 'contributor', 'reader', 'owner'].map((r) => S.can('owner', 'invite', { inviteAs: r })), [true, true, true, false]);
eq('an editor invites readers only', ['editor', 'contributor', 'reader'].map((r) => S.can('editor', 'invite', { inviteAs: r })), [false, false, true]);
eq('a contributor or a reader invites no one', [S.can('contributor', 'invite', { inviteAs: 'reader' }), S.can('reader', 'invite', { inviteAs: 'reader' })], [false, false]);
eq('no role: nothing', S.can(null, 'view'), false);
eq('mayEdit: a contributor, their own and not another\'s', [S.mayEdit('contributor', 'a@x', 'a@x'), S.mayEdit('contributor', 'b@x', 'a@x'), S.mayEdit('editor', 'b@x', 'a@x')], [true, false, true]);
eq('an old row with no author: the editor\'s', [S.mayEdit('contributor', null, 'a@x'), S.mayEdit('reader', null, 'a@x')], [true, false]);

/* ---- joining: the family's rules ---- */
eq('within the household', S.mayJoin({ sameHousehold: true }), { ok: true, outside: false });
eq('outside it: a partner, on their own approval', S.mayJoin({ sameHousehold: false }), { ok: true, outside: true });
eq('a child is never added from outside the family', S.mayJoin({ sameHousehold: false, inviteeChild: true }), { ok: false, why: 'child_outside_family', outside: true });
eq('nor a child\'s research opened to outsiders', S.mayJoin({ sameHousehold: false, ownerChild: true }).ok, false);
eq('a child within the family is fine', S.mayJoin({ sameHousehold: true, inviteeChild: true }).ok, true);

/* ---- inviting, for now: the household only, and nothing told about an address ---- */
eq('the same household: invited', S.inviteCheck({ exists: true, sameHousehold: true }), { ok: true });
eq('another household: refused', S.inviteCheck({ exists: true, sameHousehold: false }), { ok: false, why: 'not_same_household' });
eq('not registered: the very same answer', JSON.stringify(S.inviteCheck({ exists: false, sameHousehold: false })), JSON.stringify(S.inviteCheck({ exists: true, sameHousehold: false })));

/* ---- members by name; the address only for the owner ---- */
eq('another member sees a name', S.memberView({ email: 'a@x', name: 'אבי' }, 'b@x', false), { name: 'אבי', me: false });
eq('the owner sees the address', S.memberView({ email: 'a@x', name: 'אבי' }, 'o@x', true), { name: 'אבי', me: false, email: 'a@x' });
eq('me', S.memberView({ email: 'b@x', name: 'בת' }, 'b@x', false).me, true);

/* ---- the history of a draft ---- */
const t0 = 1e12;
eq('a draft\'s first version is kept', S.snapshotDue(null, t0, 'a', null), true);
eq('not again within ten minutes by the same person', S.snapshotDue(t0, t0 + 5 * 60e3, 'a', 'a'), false);
eq('after ten minutes', S.snapshotDue(t0, t0 + 10 * 60e3, 'a', 'a'), true);
eq('at once when someone else writes', S.snapshotDue(t0, t0 + 60e3, 'b', 'a'), true);

/* ---- a private note in a shared research ---- */
eq('a shared note: all of it', S.noteView({ title: 'ת', body: 'גוף', author: 'a', shared: true }, 'b', 'אבי'), { title: 'ת', body: 'גוף', hidden: false });
eq('a private one: only that there is one', S.noteView({ title: 'ת', body: 'גוף', author: 'a', shared: false }, 'b', 'אבי'), { title: 'פתק פרטי של אבי', body: '', hidden: true });
eq('its author always sees it', S.noteView({ title: 'ת', body: 'גוף', author: 'a', shared: false }, 'a', 'אבי').hidden, false);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
