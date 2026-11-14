// Tests for joining from an invitation (server/join-rules.ts):   node server/test-join.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'join-test-'));
const out = join(dir, 'join.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/join-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const J = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };

const now = 1_800_000_000_000;
const t = (over = {}) => ({ gathering: 'g1', exp: now + 60e3, used: 0, ...over });
const g = (over = {}) => ({ status: 'active', expires_at: now + 864e5, ...over });

/* ---- the ticket ---- */
ok('a fresh ticket for an open gathering admits', J.ticketOk(t(), g(), now));
ok('no ticket', !J.ticketOk(null, g(), now));
ok('a used ticket', !J.ticketOk(t({ used: 1 }), g(), now));
ok('an expired ticket', !J.ticketOk(t({ exp: now - 1 }), g(), now));
ok('a ticket that ends right now', !J.ticketOk(t({ exp: now }), g(), now));
ok('the gathering is gone', !J.ticketOk(t(), null, now));
ok('the host cancelled it', !J.ticketOk(t(), g({ status: 'cancelled' }), now));
ok('the gathering has passed', !J.ticketOk(t(), g({ expires_at: now - 1 }), now));
ok('the ticket lasts twenty minutes', J.TTL === 20 * 60e3);

/* ---- the new household ---- */
const h = J.newHousehold('Ab3_-x!9' + 'z'.repeat(40));
ok('a household of its own, marked', h.startsWith('g-'));
ok('never the family', J.newHousehold('family') !== 'family');
ok('only letters and digits after the mark', /^g-[a-z0-9]+$/i.test(h));
ok('not too long', h.length <= 26);
ok('two new households differ', J.newHousehold('abc123') !== J.newHousehold('abc124'));

/* ---- the name ---- */
ok('a name, cleaned', J.cleanName('  רות\u0000 כהן ') === 'רות  כהן');
ok('no name', J.cleanName('') === null && J.cleanName(undefined) === null && J.cleanName(42) === null);
ok('a long name is cut', J.cleanName('א'.repeat(200)).length === 80);

/* ---- the owner's invitations from outside the family ---- */
const inv = (over = {}) => ({ exp: now + 864e5, used_at: null, cancelled_at: null, email: null, ...over });
ok('an open invitation is sent', J.inviteStatus(inv(), now) === 'sent');
ok('a link opened and not used is opened', J.inviteStatus(inv({ opened_at: now - 5 }), now) === 'opened');
ok('an opened invitation still admits', J.ownerInviteOk(inv({ opened_at: now - 5 }), 'ruth@example.com', now));
ok('opened, then its time ran out: expired', J.inviteStatus(inv({ opened_at: now - 5, exp: now }), now) === 'expired');
ok('opened and used: redeemed', J.inviteStatus(inv({ opened_at: now - 9, used_at: now - 5 }), now) === 'redeemed');
ok('a used invitation is redeemed', J.inviteStatus(inv({ used_at: now - 5 }), now) === 'redeemed');
ok('a late invitation is expired', J.inviteStatus(inv({ exp: now }), now) === 'expired');
ok('a cancelled invitation stays cancelled, even after its time', J.inviteStatus(inv({ cancelled_at: now - 9, exp: now - 1 }), now) === 'cancelled');
ok('redeemed stays redeemed after its time', J.inviteStatus(inv({ used_at: now - 9, exp: now - 1 }), now) === 'redeemed');
// one time
ok('an open invitation admits', J.ownerInviteOk(inv(), 'ruth@example.com', now));
ok('one use: a redeemed invitation never admits again', !J.ownerInviteOk(inv({ used_at: now - 1 }), 'other@example.com', now));
ok('a cancelled invitation does not admit', !J.ownerInviteOk(inv({ cancelled_at: now - 1 }), 'ruth@example.com', now));
ok('no invitation does not admit', !J.ownerInviteOk(null, 'ruth@example.com', now));
// expiry
ok('expired: the moment it ends', !J.ownerInviteOk(inv({ exp: now }), 'ruth@example.com', now));
ok('a day lasts a day', J.ownerInviteOk(inv({ exp: now + 1 }), 'ruth@example.com', now));
ok('a week when not said', J.inviteDays(undefined) === 7 && J.inviteDays('x') === 7 && J.inviteDays(0) === 7 && J.inviteDays(-3) === 7);
ok('at most thirty days', J.inviteDays(400) === 30 && J.inviteDays(3) === 3 && J.inviteDays('14') === 14);
// tied to an address
ok('a named address admits only itself', J.ownerInviteOk(inv({ email: 'ruth@example.com' }), 'Ruth@Example.com ', now));
ok('another address cannot use it', !J.ownerInviteOk(inv({ email: 'ruth@example.com' }), 'eve@example.com', now));
ok('a plain address is kept, lower case', J.inviteEmail(' Ruth@Example.COM ') === 'ruth@example.com');
ok('not an address', J.inviteEmail('ruth') === null && J.inviteEmail('a b@c.com') === null && J.inviteEmail(5) === null && J.inviteEmail('') === null);
// the link's key
ok('a key of 48 letters and digits', J.inviteKeyOk('a1'.repeat(24)));
ok('a short key', !J.inviteKeyOk('abc123'));
ok('a key with other signs', !J.inviteKeyOk('a'.repeat(40) + "'; DROP"));
ok('no key', !J.inviteKeyOk(undefined) && !J.inviteKeyOk(null) && !J.inviteKeyOk({}));
ok('the join cookie marks an invitation apart from a gathering', J.OWNER_MARK === 'o.' && !/^[a-z0-9]/i.test(J.OWNER_MARK.slice(1)));
// only the owner makes them
ok('the owner from their own account may invite', J.mayInvite({ level: 'owner', own: true }));
ok('a super may not invite', !J.mayInvite({ level: 'super', own: true }));
ok("the owner visiting someone else's account may not", !J.mayInvite({ level: 'owner', own: false }));
ok('no one in the back door may not', !J.mayInvite(null) && !J.mayInvite(undefined));
// no family data: whoever comes in gets a household of their own, never the family's
for (let k = 0; k < 20; k++) {
  const hh = J.newHousehold(Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  if (hh === 'family' || !hh.startsWith('g-')) { ok('a new household is never the family', false); break; }
}
ok('a crafted value cannot become the family', J.newHousehold('family') === 'g-family' && J.newHousehold('../family') === 'g-family');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
