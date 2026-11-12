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

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
