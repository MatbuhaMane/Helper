// Tests for "יד ביד": the rules (server/yad-rules.ts), the ledger (server/yad-ledger.ts) on a real SQLite (node:sqlite, in memory),
// and the gate (a member gets 404 while the switch is off).   node server/test-yad.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'yad-test-'));
const bundle = (entry, name) => {
  const out = join(dir, name);
  execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), entry), '--bundle', '--format=esm', '--platform=node', '--outfile=' + out, '--log-level=error', '--external:node:*'], { stdio: 'inherit' });
  return import(pathToFileURL(out).href);
};
const R = await bundle('server/yad-rules.ts', 'rules.mjs');
const L = await bundle('server/yad-ledger.ts', 'ledger.mjs');
const G = await bundle('server/yad-gate.ts', 'gate.mjs');
const SD = await bundle('server/yad-seed.ts', 'seed.mjs');

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

/* ---- levels and amounts ---- */
eq('level 0+0', R.levelOf(0, 0).id, 'light'); eq('level 1+0', R.levelOf(1, 0).id, 'work'); eq('level 0+1', R.levelOf(0, 1).id, 'work');
eq('level 2+0', R.levelOf(2, 0).id, 'long'); eq('level 1+1', R.levelOf(1, 1).id, 'long'); eq('level 2+1', R.levelOf(2, 1).id, 'long'); eq('level 2+2', R.levelOf(2, 2).id, 'hour');
eq('hands per level', R.LEVELS.map((l) => l.hands), [1, 2, 4, 8]);
eq('an hour at 2 hands is 20 tenths', R.grossTenths(2, 2), 20);
eq('half an hour at 1 hand is 5 tenths', R.grossTenths(1, 1), 5);
eq("the owner's example: 2 hands, the giver gets 1.8", R.splitService(20), { pay: 20, giver: 18, tithe: 2 });
eq('the tithe rounds down: 5 tenths give a tithe of 0', R.titheOf(5), 0);
eq('the tithe of 15 is 1', R.titheOf(15), 1);
eq('a deed: the fund pays first', R.splitDeed(40, 25), { gross: 40, fromFund: 25, minted: 15, tithe: 4, person: 36 });
eq('a deed with an empty fund mints all', R.splitDeed(40, 0).minted, 40);
eq('a deed with a rich fund mints nothing', R.splitDeed(40, 100).minted, 0);
eq('half-hour validity', [R.validHalfHours(1), R.validHalfHours(0), R.validHalfHours(1.5), R.validHalfHours(49)], [true, false, false, false]);
eq('showHands', [R.showHands(18), R.showHands(20), R.showHands(5)], ['1.8', '2', '0.5']);
eq('range: same area', R.rangeOf(0.2).label, 'באותו אזור'); eq('range: up to 5', R.rangeOf(3).label, 'עד 5 ק"מ'); eq('range: 5 to 15', R.rangeOf(9).band, 2); eq('range: over 50', R.rangeOf(120).band, 4);

/* ---- the gate ---- */
eq('switch off: a member is shut out', R.yadOpen(false, 'a@x.test', 'owner@x.test'), false);
eq('switch off: the owner may try it', R.yadOpen(false, 'Owner@x.test', 'owner@x.test, other@x.test'), true);
eq('switch on: everyone', R.yadOpen(true, 'a@x.test', 'owner@x.test'), true);
const ctxFor = (email, on) => ({ req: new Request('https://x.test/api/yad/board'), params: {}, env: { OWNER_EMAIL: 'owner@x.test', DB: { prepare: () => ({ all: async () => ({ results: on ? [{ key: 'yad', value: 'true' }] : [] }) }) } }, user: { email } });
let n = 0;
const code = async (email, on) => { try { await G.requireYad(ctxFor(email, on)); return 'ok'; } catch (e) { return e.status || String(e); } };
// the switches cache lasts half a minute in the isolate, so each case builds its answer before the cache is read: off first, then the owner
eq('GATE: a member gets 404 while it is off', await code('a@x.test', false), 404);
eq('GATE: the owner gets in while it is off', await code('owner@x.test', false), 'ok');

/* ---- the ledger on a real SQLite ---- */
const schema = readFileSync('schema.sql', 'utf8').replace(/\r\n/g, '\n');
const sql = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS yad_ledger')).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean);
function d1() {
  const sq = new DatabaseSync(':memory:');
  for (const s of sql) sq.exec(s);
  const stmt = (text, args = []) => ({
    bind: (...a) => stmt(text, a),
    first: async () => sq.prepare(text).get(...args) ?? null,
    all: async () => ({ results: sq.prepare(text).all(...args) }),
    run: async () => { const r = sq.prepare(text).run(...args); return { meta: { changes: Number(r.changes) } }; },
    _run: () => { const r = sq.prepare(text).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { sq, prepare: (t) => stmt(t), batch: async (stmts) => { sq.exec('BEGIN'); try { const out = stmts.map((s) => s._run()); sq.exec('COMMIT'); return out; } catch (e) { sq.exec('ROLLBACK'); throw e; } } };
}
const db = d1();
const A = L.acct('a@x.test'), B = L.acct('b@x.test'), C = L.acct('c@x.test');
const bal = (a) => L.balance(db, a);

// the first hands come only from a deed: with an empty fund they are minted
let legs = await L.deedLegs(db, A, 40);
eq('deed legs with an empty fund', legs.map((l) => [l.kind, l.tenths]), [['mint_deed', 40], ['tithe', 4]]);
eq('post the deed', (await L.post(db, 'deed:1', legs)).ok, true);
eq('A got 36 and the fund 4', [await bal(A), await bal(L.FUND)], [36, 4]);
eq('the same transfer twice is a no-op', (await L.post(db, 'deed:1', legs)).duplicate, true);
eq('still 36 after a repeat', await bal(A), 36);

// a service: A pays B 2 hands (20 tenths): B gets 18, the fund 2
eq('service A to B', (await L.post(db, 'svc:1', L.serviceLegs(A, B, 20))).ok, true);
eq('after the service', [await bal(A), await bal(B), await bal(L.FUND)], [16, 18, 6]);
eq('A paid a tithe of 4 from the deed and 2 from the service', await L.tithePaid(db, 'a@x.test'), 6);

// no minus
const over = await L.post(db, 'svc:2', L.serviceLegs(A, C, 170));
eq('no minus: refused', over, { ok: false, why: 'no_funds' });
eq('nothing moved', [await bal(A), await bal(C)], [16, 0]);
// two requests at once cannot both pass: A has 16, each wants 12
const [r1, r2] = await Promise.all([L.post(db, 'svc:3', L.serviceLegs(A, B, 12)), L.post(db, 'svc:4', L.serviceLegs(A, C, 12))]);
eq('two at once: exactly one passes', [r1.ok, r2.ok].filter(Boolean).length, 1);
eq('A is not below zero', (await bal(A)) >= 0, true);
// the fund pays a service for someone who cannot give
eq('fund pays a service for C', (await L.post(db, 'fund:1', L.fundServiceLegs(C, 5))).ok, true);
eq('fund cannot pay more than it has', (await L.post(db, 'fund:2', L.fundServiceLegs(C, 5000))).why, 'no_funds');
// a deed now takes from the fund first
legs = await L.deedLegs(db, B, 30);
eq('a deed takes from the fund first', legs[0].kind, 'deed_fund');
// frozen: a removed person can neither pay nor be paid
db.sq.prepare("INSERT INTO yad_people (email, removed_at, created_at) VALUES ('b@x.test', 1, 1)").run();
eq('frozen person cannot be paid', (await L.post(db, 'svc:5', L.serviceLegs(A, B, 10))).why, 'frozen');
eq('frozen person cannot pay', (await L.post(db, 'svc:6', L.serviceLegs(B, A, 10))).why, 'frozen');
db.sq.prepare("UPDATE yad_people SET removed_at = NULL WHERE email = 'b@x.test'").run();
eq('unfrozen again: it works', (await L.post(db, 'svc:7', L.serviceLegs(B, A, 10))).ok, true);
// bad input
eq('zero is refused', (await L.post(db, 'bad:1', [{ kind: 'service', src: A, dst: B, tenths: 0 }])).ok, false);
eq('a fraction is refused', (await L.post(db, 'bad:2', [{ kind: 'service', src: A, dst: B, tenths: 1.5 }])).ok, false);
eq('anyone but a mint kind cannot create hands', (await L.post(db, 'bad:3', [{ kind: 'service', src: L.MINT, dst: B, tenths: 5 }])).ok, false);
// a reversal is new rows; the old stay
const before = db.sq.prepare('SELECT COUNT(*) AS n FROM yad_ledger').get().n;
const bB = await bal(B), bA = await bal(A);
eq('reverse svc:7', (await L.reverse(db, 'svc:7')).ok, true);
eq('rows only grew', db.sq.prepare('SELECT COUNT(*) AS n FROM yad_ledger').get().n > before, true);
eq('the reversal restored the balances', [await bal(B), await bal(A)], [bB + 10, bA - 9]);
// the invariant: nothing is negative, and everything together equals what was minted
const all = db.sq.prepare("SELECT DISTINCT a FROM (SELECT src AS a FROM yad_ledger UNION SELECT dst FROM yad_ledger) WHERE a != 'mint'").all().map((r) => r.a);
let total = 0, neg = 0; for (const a of all) { const b = await bal(a); total += b; if (b < 0) neg++; }
const minted = db.sq.prepare("SELECT COALESCE(SUM(tenths),0) AS m FROM yad_ledger WHERE src = 'mint'").get().m;
eq('every account is >= 0', neg, 0);
eq('all balances together equal what was minted (nothing is lost or invented)', total, minted);
const dupKeys = db.sq.prepare('SELECT COUNT(*) AS n FROM (SELECT ref, leg FROM yad_ledger GROUP BY ref, leg HAVING COUNT(*) > 1)').get().n;
eq('no transfer key repeats', dupKeys, 0);

/* ---- the catalog ---- */
const svc = SD.SEED.filter((t) => t.kind === 'service'), dd = SD.SEED.filter((t) => t.kind === 'deed');
const lv = (a) => ['light', 'work', 'long', 'hour'].map((id) => a.filter((t) => R.levelOf(t.d, t.e).id === id).length);
eq('26 services and 23 deeds', [svc.length, dd.length], [26, 23]);
eq('services by level: 5, 7, 9, 5', lv(svc), [5, 7, 9, 5]);
eq('deeds by level: 7, 5, 7, 4', lv(dd), [7, 5, 7, 4]);
eq('nine types ask for a licence', SD.SEED.filter((t) => t.decl === 'license').length, 9);
eq('two rides carry the driving declaration', SD.SEED.filter((t) => t.decl === 'driving').map((t) => t.id).sort(), ['d-elder-ride', 's-ride']);
eq('23 types have a limit line', SD.SEED.filter((t) => t.note).length, 23);
eq('ids are unique', new Set(SD.SEED.map((t) => t.id)).size, 49);
{ const d2 = d1(); await SD.ensureCatalog(d2); await SD.ensureCatalog(d2); eq('the catalog goes in once', d2.sq.prepare('SELECT COUNT(*) AS n FROM yad_types').get().n, 49); }

console.log(`yad: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
