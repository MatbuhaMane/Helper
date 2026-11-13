// Tests for the owner's room (server/admin-rules.ts):   node server/test-admin.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'admin-test-'));
const out = join(dir, 'admin.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/admin-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const A = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));
const e = (o) => ({ kind: 'expense', title: 'x', amount: 10, currency: 'ILS', date: '2026-01-15', monthly: false, until: null, ...o });

/* ---- when it was paid ---- */
eq('once', A.paidMonths(e({}), '2026-11-12'), ['2026-01']);
eq('once, in the future: not yet', A.paidMonths(e({ date: '2026-12-01' }), '2026-11-12'), []);
eq('monthly from January', A.paidMonths(e({ monthly: true, date: '2026-08-15' }), '2026-11-12'), ['2026-08', '2026-09', '2026-10']);
eq('monthly: this month once its day came', A.paidMonths(e({ monthly: true, date: '2026-08-12' }), '2026-11-12'), ['2026-08', '2026-09', '2026-10', '2026-11']);
eq('monthly on the 31st: the last day of a short month', A.paidMonths(e({ monthly: true, date: '2026-01-31' }), '2026-03-30'), ['2026-01', '2026-02']);
eq('monthly until a day', A.paidMonths(e({ monthly: true, date: '2026-01-01', until: '2026-03-01' }), '2026-11-12'), ['2026-01', '2026-02', '2026-03']);
eq('across a year', A.paidMonths(e({ monthly: true, date: '2025-11-05' }), '2026-02-10'), ['2025-11', '2025-12', '2026-01', '2026-02']);

/* ---- the sums ---- */
const entries = [
  e({ title: 'Cloudflare', amount: 5, currency: 'USD', monthly: true, date: '2026-09-01' }),
  e({ title: 'דומיין', amount: 50, date: '2026-10-03' }),
  e({ kind: 'income', title: 'תרומה', amount: 100, date: '2026-10-20' }),
];
const m = A.money(entries, { '2026-10': 2, '2026-11': 1 }, 4, '2026-11-12');
eq('months', m.months.map((x) => x.month), ['2026-09', '2026-10', '2026-11']);
eq('October', m.months[1], { month: '2026-10', income: 100, expense: 70, ai: 8, net: 22 });
eq('in all', m.total, { income: 100, expense: 110, ai: 12, net: -22 });
eq('a month now: what runs monthly, and last month\'s AI', m.perMonth, { income: 0, expense: 20, ai: 8 });
eq('AI of a future month is not counted', A.money([], { '2027-01': 5 }, 4, '2026-11-12').total.ai, 0);

/* ---- entries from the page ---- */
eq('an entry', A.cleanEntry({ kind: 'expense', title: ' Cloudflare ', amount: '5.004', currency: 'USD', date: '2026-09-01', monthly: true, until: '2026-08-01' }),
  { kind: 'expense', title: 'Cloudflare', amount: 5, currency: 'USD', date: '2026-09-01', monthly: true, until: null });
const throws = (name, b, code) => { try { A.cleanEntry(b); fail++; console.error('FAIL (no error)', name); } catch (err) { ok(name, err.message === code); } };
throws('no title', { amount: 5, date: '2026-01-01' }, 'title_required');
throws('no amount', { title: 'x', amount: 0, date: '2026-01-01' }, 'bad_amount');
throws('a bad date', { title: 'x', amount: 5, date: '1/1/2026' }, 'bad_date');
eq('until is kept only for a monthly one', A.cleanEntry({ title: 'x', amount: 1, date: '2026-01-01', until: '2026-05-01' }).until, null);

/* ---- entering the room ---- */
const now = 10_000_000_000;
const own = { by_email: 'o@x', as_email: 'o@x' }, visit = { by_email: 'o@x', as_email: 'noa@x' };
ok('alive', A.entryAlive({ ...own, created_at: now - 60e3, last_at: now - 60e3 }, now));
ok('2½ idle minutes: still open', A.entryAlive({ ...own, created_at: now - 10 * 60e3, last_at: now - 150e3 }, now));
ok('3 idle minutes: closed', !A.entryAlive({ ...own, created_at: now - 10 * 60e3, last_at: now - 180e3 }, now));
ok('a visit: 3 idle minutes too', !A.entryAlive({ ...visit, created_at: now - 5 * 60e3, last_at: now - 181e3 }, now));
ok('two hours at most', !A.entryAlive({ ...own, created_at: now - 2.1 * 3600e3, last_at: now - 1000 }, now));
ok('a visit: half an hour at most', !A.entryAlive({ ...visit, created_at: now - 31 * 60e3, last_at: now - 1000 }, now));
ok('stay unlocked: open after an idle hour', A.entryAlive({ ...own, stay: 1, created_at: now - 70 * 60e3, last_at: now - 60 * 60e3 }, now));
ok('stay unlocked: still two hours at most', !A.entryAlive({ ...own, stay: 1, created_at: now - 2.1 * 3600e3, last_at: now - 1000 }, now));
ok("stay unlocked is ignored on someone else's account", !A.entryAlive({ ...visit, stay: 1, created_at: now - 5 * 60e3, last_at: now - 181e3 }, now));
// until when the back door's tab may show (GET /api/admin/room)
ok('until: the idle minutes from the last action', A.entryUntil({ ...own, created_at: now - 60e3, last_at: now - 60e3 }) === now - 60e3 + 180e3);
ok('until: never after two hours', A.entryUntil({ ...own, created_at: now - 2 * 3600e3 + 60e3, last_at: now }) === now + 60e3);
ok('until: stay unlocked is the two hours', A.entryUntil({ ...own, stay: 1, created_at: now - 60e3, last_at: now - 60e3 }) === now - 60e3 + 2 * 3600e3);
ok("until: stay is ignored on someone else's account", A.entryUntil({ ...visit, stay: 1, created_at: now - 60e3, last_at: now - 60e3 }) === now - 60e3 + 180e3);
ok('until agrees with alive', [0, 100e3, 179e3, 181e3].every((idle) => {
  const e = { ...own, created_at: now - 10 * 60e3, last_at: now - idle };
  return A.entryAlive(e, now) === (A.entryUntil(e) > now);
}));

/* ---- settings ---- */
const s = (o) => ({ key: 'k', label: 'k', help: '', group: 'g', def: 0, ...o });
eq('bool', [A.settingValue(s({ type: 'bool' }), true), A.settingValue(s({ type: 'bool' }), 'yes')], [true, null]);
eq('number in range', [A.settingValue(s({ type: 'number', min: 1, max: 10 }), '3'), A.settingValue(s({ type: 'number', min: 1, max: 10 }), 11)], [3, null]);
eq('select', [A.settingValue(s({ type: 'select', options: [['a', 'A']] }), 'a'), A.settingValue(s({ type: 'select', options: [['a', 'A']] }), 'b')], ['a', null]);
eq('text, cleaned', A.settingValue(s({ type: 'text' }), 'שלום\u0000עולם'), 'שלום עולם');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
