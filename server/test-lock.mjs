// Tests for the app lock and the tree lock (server/lock-rules.ts):   node server/test-lock.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'lock-test-'));
const out = join(dir, 'lock.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/lock-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const L = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));

/* ---- the code ---- */
for (const p of ['0000', '1234', '9876']) ok('a code: ' + p, L.validPin(p));
for (const p of ['123', '12345', 'abcd', '12a4', 1234, null, ' 1234', '١٢٣٤']) ok('not a code: ' + JSON.stringify(p), !L.validPin(p));
ok('modes', L.validMode('off') && L.validMode('pin') && L.validMode('bio') && !L.validMode('face') && !L.validMode(null));
ok('autolock 1/5/15/60 only', [1, 5, 15, 60].every(L.validAutolock) && !L.validAutolock(2) && !L.validAutolock('5'));

/* ---- is the app locked? ---- */
const now = 1_000_000_000;
eq('no lock: never locked', L.appLocked({ mode: 'off', locked: 1, lastActive: 0, autolockMin: 1, now }), false);
eq('no lock row: never locked', L.appLocked({ mode: null, locked: null, lastActive: null, autolockMin: null, now }), false);
eq('locked by hand', L.appLocked({ mode: 'pin', locked: 1, lastActive: now, autolockMin: 5, now }), true);
eq('used a minute ago, 5 minutes: open', L.appLocked({ mode: 'pin', locked: 0, lastActive: now - 60e3, autolockMin: 5, now }), false);
eq('away 6 minutes, 5 minutes: locked', L.appLocked({ mode: 'bio', locked: 0, lastActive: now - 6 * 60e3, autolockMin: 5, now }), true);
eq('away 6 minutes, 15 minutes: open', L.appLocked({ mode: 'pin', locked: 0, lastActive: now - 6 * 60e3, autolockMin: 15, now }), false);
eq('no autolock set: 5 minutes', L.appLocked({ mode: 'pin', locked: 0, lastActive: now - 6 * 60e3, autolockMin: null, now }), true);
eq('a new session (never active): open', L.appLocked({ mode: 'pin', locked: 0, lastActive: null, autolockMin: 5, now }), false);

/* ---- what a locked session may reach ---- */
for (const p of ['/api/lock', '/api/lock/unlock', '/api/lock/passkey/options', '/api/me', '/api/logout', '/api/auth/google', '/api/auth/passkey']) ok('allowed when locked: ' + p, L.allowedWhenLocked(p));
for (const p of ['/api/notes', '/api/vault/tree', '/api/lockers', '/api/meals', '/api/prefs/look', '/api/admin/settings']) ok('refused when locked: ' + p, !L.allowedWhenLocked(p));

/* ---- the tree ---- */
eq('no tree lock: open', L.treeOpen({ mode: 'off', openUntil: null, now }), true);
eq('no row: open', L.treeOpen({ mode: null, openUntil: null, now }), true);
eq('tree lock, not opened: closed', L.treeOpen({ mode: 'pin', openUntil: null, now }), false);
eq('tree lock, opened: open', L.treeOpen({ mode: 'pin', openUntil: now + 1, now }), true);
eq('tree lock, opened long ago: closed', L.treeOpen({ mode: 'bio', openUntil: now - 1, now }), false);

/* ---- wrong codes ---- */
eq('the first wrong code', L.afterFail(0, now), { fails: 1, pauseUntil: 0, closed: false });
eq('the fifth: a pause', L.afterFail(4, now), { fails: 5, pauseUntil: now + 15 * 60e3, closed: false });
eq('the tenth: closed (and a pause)', L.afterFail(9, now), { fails: 10, pauseUntil: now + 15 * 60e3, closed: true });
eq('past ten: still closed', L.afterFail(12, now).closed, true);

/* ---- proofs and changes ---- */
eq('a proof 4 minutes old', L.hasProof(now - 4 * 60e3, now), true);
eq('a proof 6 minutes old', L.hasProof(now - 6 * 60e3, now), false);
eq('no proof', L.hasProof(null, now), false);
const ch = (o) => L.mayChange({ from: 'off', to: 'off', hasPin: false, hasPasskey: false, proof: false, ...o });
eq('a code lock needs a code', ch({ to: 'pin' }), { ok: false, why: 'no_pin' });
eq('a passkey lock needs a passkey', ch({ to: 'bio' }), { ok: false, why: 'no_passkey' });
eq('turning a lock on needs no proof', ch({ to: 'pin', hasPin: true }), { ok: true });
eq('turning it off needs a proof', ch({ from: 'pin', to: 'off', hasPin: true }), { ok: false, why: 'proof_needed' });
eq('turning it off with a proof', ch({ from: 'pin', to: 'off', hasPin: true, proof: true }), { ok: true });
eq('switching code to passkey needs a proof', ch({ from: 'pin', to: 'bio', hasPin: true, hasPasskey: true }), { ok: false, why: 'proof_needed' });
eq('the same mode again: fine', ch({ from: 'pin', to: 'pin', hasPin: true }), { ok: true });

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
