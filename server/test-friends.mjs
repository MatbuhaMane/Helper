// Tests for friends, "the family you choose" (server/friends-rules.ts):   node server/test-friends.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'friends-test-'));
const out = join(dir, 'friends.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/friends-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const F = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));
const throws = (name, f) => { try { f(); ok(name, false); } catch { ok(name, true); } };

/* ---- the pair and where it stands ---- */
eq('pair is ordered and lower case', F.pair('Noa@X.test', 'dana@x.test'), ['dana@x.test', 'noa@x.test']);
const row = (status, asker) => ({ a: 'a@x', b: 'b@x', asker, status, created_at: 1, accepted_at: null });
eq('accepted: friends for both', [F.stateFor(row('accepted', 'a@x'), 'a@x'), F.stateFor(row('accepted', 'a@x'), 'B@x')], ['friends', 'friends']);
eq('pending: out for the asker, in for the other', [F.stateFor(row('pending', 'a@x'), 'a@x'), F.stateFor(row('pending', 'a@x'), 'b@x')], ['out', 'in']);
eq('someone else sees nothing', F.stateFor(row('accepted', 'a@x'), 'c@x'), null);
eq('no row', F.stateFor(null, 'a@x'), null);
eq('the other side', F.otherOf(row('pending', 'a@x'), 'a@x'), 'b@x');

/* ---- a request ---- */
const W = (email, o = {}) => ({ email, child: false, family: false, ...o });
eq('a new request', F.onRequest(null, W('a@x'), W('b@x')), 'insert');
eq('to nobody (no such member): nothing, quietly', F.onRequest(null, W('a@x'), null), 'none');
eq('to myself: nothing', F.onRequest(null, W('a@x'), W('A@x')), 'none');
eq('they asked me already: it accepts', F.onRequest(row('pending', 'b@x'), W('a@x'), W('b@x')), 'accept');
eq('I asked already: nothing', F.onRequest(row('pending', 'a@x'), W('a@x'), W('b@x')), 'none');
eq('friends already: nothing', F.onRequest(row('accepted', 'b@x'), W('a@x'), W('b@x')), 'none');
eq('to a child outside the family: nothing', F.onRequest(null, W('a@x'), W('b@x', { child: true })), 'none');
eq('from a child outside the family: nothing', F.onRequest(null, W('a@x', { child: true }), W('b@x')), 'none');
eq('a child within the family may', F.onRequest(null, W('a@x', { child: true }), W('b@x', { family: true })), 'insert');
eq('accepting: an adult', F.mayBefriend(W('a@x'), W('b@x')), true);
eq('accepting: a child outside the family may not', F.mayBefriend(W('a@x', { child: true }), W('b@x')), false);
eq('accepting: not oneself', F.mayBefriend(W('a@x'), W('a@x')), false);

/* ---- a typed email ---- */
eq('an email', F.emailOf('  Dana@Example.TEST '), 'dana@example.test');
for (const bad of ['', 'dana', 'dana@', '@x.test', 'a b@x.test', '<a@x.test>', 'a@x', null, 3]) eq(`not an email: ${JSON.stringify(bad)}`, F.emailOf(bad), null);

/* ---- the link ---- */
const now = Date.UTC(2026, 10, 14);
const L = (o = {}) => ({ token: 't'.repeat(32), owner: 'a@x', created_at: now, expires_at: F.expiresAt(now), used_by: null, ...o });
eq('a fresh link', F.linkState(L(), 'b@x', now + 1000), 'ok');
eq('my own link', F.linkState(L(), 'A@x', now), 'self');
eq('a used link', F.linkState(L({ used_by: 'c@x' }), 'b@x', now), 'gone');
eq('an ended link', F.linkState(L(), 'b@x', now + 8 * 864e5), 'gone');
eq('no link', F.linkState(null, 'b@x', now), 'gone');
ok('ends after 7 days', F.expiresAt(now) - now === 7 * 864e5);
ok('tokens', F.tokenOk('abcDEF012345_-abcDEF0123') && !F.tokenOk('short') && !F.tokenOk('a'.repeat(24) + '/') && !F.tokenOk(null));

/* ---- groups ---- */
eq('a group name', F.groupName('  ה  חברים\nשלנו '), 'ה חברים שלנו');
throws('an empty name', () => F.groupName('  '));
ok('a long name is cut', F.groupName('א'.repeat(99)).length === F.NAME_MAX);
const fam = (x, y) => [x, y].every((e) => e.endsWith('@home'));             // everyone @home is one family
const P = (email, o = {}) => ({ email, reachable: true, child: false, ...o });
eq('a group of friends', F.groupMembers('me@home', [P('a@x'), P('B@x'), P('a@x'), P('ME@home')], fam), { ok: true, emails: ['me@home', 'a@x', 'b@x'] });
eq('an empty group', F.groupMembers('me@home', [P('me@home')], fam), { ok: false, why: 'empty' });
eq('someone I cannot reach', F.groupMembers('me@home', [P('a@x'), P('z@x', { reachable: false })], fam), { ok: false, why: 'not_reachable' });
eq('too many', F.groupMembers('me@home', Array.from({ length: F.GROUP_MAX }, (_, i) => P(`p${i}@x`)), fam), { ok: false, why: 'too_many' });
ok('the most allowed', F.groupMembers('me@home', Array.from({ length: F.GROUP_MAX - 1 }, (_, i) => P(`p${i}@x`)), fam).ok);
eq('a child with family only', F.groupMembers('me@home', [P('kid@home', { child: true }), P('dad@home')], fam).ok, true);
eq('a child with a friend who is not family', F.groupMembers('me@home', [P('kid@home', { child: true }), P('a@x')], fam), { ok: false, why: 'child' });
eq('a child when the maker is not family', F.groupMembers('me@x', [P('kid@home', { child: true })], fam), { ok: false, why: 'child' });

/* ---- the avatar ---- */
eq('initials of two words', F.initials('דנה לוי'), 'דל');
eq('initials of one', F.initials('Noa'), 'NO');
eq('initials of nothing', F.initials(''), '?');
ok('neighbouring ids get colours far apart', Math.abs(parseInt(F.hue('g0').slice(4)) - parseInt(F.hue('g1').slice(4))) > 10);
ok('a steady colour', F.hue('f123') === F.hue('f123') && /^hsl\(\d+ 45% 42%\)$/.test(F.hue('f123')));

/* ---- a group is checked again (the master's review of batch 27) ---- */
eq('everyone still reachable: nothing changes', F.staleGroup([{ email: 'a@x', why: null, iBlocked: false }, { email: 'b@x', why: null, iBlocked: false }]), { drop: [], leave: false });
eq('I blocked one: they go', F.staleGroup([{ email: 'a@x', why: 'cannot_send', iBlocked: true }, { email: 'b@x', why: null, iBlocked: false }]), { drop: ['a@x'], leave: false });
eq('they blocked me: I am out, they stay', F.staleGroup([{ email: 'a@x', why: 'cannot_send', iBlocked: false }]), { drop: [], leave: true });
eq('the friendship ended: I am out', F.staleGroup([{ email: 'a@x', why: 'cannot_send', iBlocked: false }, { email: 'b@x', why: null, iBlocked: false }]), { drop: [], leave: true });
eq('a mix: the one I blocked goes, and I leave for the other', F.staleGroup([{ email: 'a@x', why: 'x', iBlocked: true }, { email: 'b@x', why: 'x', iBlocked: false }]), { drop: ['a@x'], leave: true });
eq('nobody else in it', F.staleGroup([]), { drop: [], leave: false });

console.log(`friends: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
