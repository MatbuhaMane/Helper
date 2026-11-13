// Tests for paid figures and a member's age (server/figures-rules.ts):   node server/test-figures.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'figures-test-'));
const out = join(dir, 'figures.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/figures-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const F = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));

/* ---- buying a paid figure ---- */
const base = { id: 'cleopatra', owned: [], limited: true, left: 5, priceUsd: 2.7, confirm: true };
eq('a free figure is not sold', F.decide({ ...base, id: 'fennec' }), { ok: false, error: 'not_paid' });
eq('an unknown id is not sold', F.decide({ ...base, id: 'zeus' }), { ok: false, error: 'not_paid' });
eq('already owned: nothing to pay', F.decide({ ...base, owned: ['cleopatra'] }), { ok: true, how: 'owned', usd: 0 });
eq('owned wins over no confirmation', F.decide({ ...base, owned: ['cleopatra'], confirm: undefined }), { ok: true, how: 'owned', usd: 0 });
eq('must be confirmed', F.decide({ ...base, confirm: undefined }), { ok: false, error: 'confirm_needed' });
eq('"true" as text is not a confirmation', F.decide({ ...base, confirm: 'true' }), { ok: false, error: 'confirm_needed' });
eq('the family gets it for nothing', F.decide({ ...base, limited: false, left: 0 }), { ok: true, how: 'family', usd: 0 });
eq('credits: paid at the price', F.decide(base), { ok: true, how: 'credits', usd: 2.7 });
eq('credits: exactly enough', F.decide({ ...base, left: 2.7 }), { ok: true, how: 'credits', usd: 2.7 });
eq('credits: not enough', F.decide({ ...base, left: 2.69 }), { ok: false, error: 'not_enough_credit' });
eq('credits: nothing left', F.decide({ ...base, left: 0 }), { ok: false, error: 'not_enough_credit' });
eq('a zero price is refused for credits (a setting error, never free by mistake)', F.decide({ ...base, priceUsd: 0 }), { ok: false, error: 'not_enough_credit' });
eq('a negative price is refused', F.decide({ ...base, priceUsd: -1 }), { ok: false, error: 'not_enough_credit' });
ok('the seven paid figures', ['maryshelley', 'leonardo', 'cleopatra', 'dracula', 'magician', 'astronomer', 'doll'].every(F.isPaid) && F.PAID.length === 7);

/* ---- the birth year, and who is a child ---- */
const now = Date.UTC(2026, 10, 13);
eq('no year', F.birthYear(null, now), null);
eq('empty text', F.birthYear('', now), null);
eq('a year', F.birthYear(1985, now), 1985);
eq('a year as text', F.birthYear('2016', now), 2016);
eq('this year', F.birthYear(2026, now), 2026);
for (const bad of [1899, 2027, 2016.5, 'abc', -3]) {
  let threw = false; try { F.birthYear(bad, now); } catch { threw = true; }
  ok('refused: ' + bad, threw);
}
eq('no year is not a child', F.isChild(null, now), false);
eq('born this year: a child', F.isChild(2026, now), true);
eq('11 this year: a child', F.isChild(2015, now), true);
eq('12 this year: not a child', F.isChild(2014, now), false);
eq('an adult', F.isChild(1985, now), false);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
