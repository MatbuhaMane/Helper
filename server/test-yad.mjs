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
const rateTable = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS rate_hits'), schema.indexOf(');', schema.indexOf('CREATE TABLE IF NOT EXISTS rate_hits')) + 2);
const sql = [rateTable, ...schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS yad_ledger')).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean)];
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

/* ---- the core: profile, board, service flow, deeds, fund, queue, closing ---- */
const K = await bundle('server/yad-core.ts', 'core.mjs');
const RG = await bundle('server/yad-regions.ts', 'regions.mjs');
const code2 = async (p) => { try { await p; return 'ok'; } catch (e) { return e.status ? e.code : String(e); } };
{
  const x = d1(); await SD.ensureCatalog(x);
  const p = L.acct;
  eq('regions: ids are unique', new Set(RG.REGIONS.map((r) => r.id)).size, RG.REGIONS.length);
  eq('range same area', RG.rangeBetween('haifa', 'haifa').label, 'באותו אזור');
  eq('range with no area', RG.rangeBetween(null, 'haifa'), null);
  eq('a bad area is refused', await code2(K.setRegion(x, 'a@x.test', 'mars')), 'region');
  await K.setRegion(x, 'a@x.test', 'tel-aviv'); await K.setRegion(x, 'b@x.test', 'jerusalem'); await K.setRegion(x, 'c@x.test', 'tel-aviv');
  eq('a licence type needs a declaration', await code2(K.setOffers(x, 'b@x.test', [{ type_id: 's-lawyer' }])), 'declaration_needed');
  await K.setOffers(x, 'b@x.test', [{ type_id: 's-lawyer', declared: true }, { type_id: 's-garden' }]);
  eq('offers saved', (await K.offersOf(x, 'b@x.test')).length, 2);
  // the first hands come from a deed for B, approved by the owner (hours corrected)
  const dd = await K.reportDeed(x, 'b@x.test', { type_id: 'd-stream', half_hours: 4 });
  eq('a deed waits', (await K.queue(x)).deeds.length, 1);
  eq('a deed needs a reason to reject', await code2(K.decideDeed(x, dd.id, { approve: false })), 'reason');
  const dr = await K.decideDeed(x, dd.id, { approve: true, half_hours: 2 });
  eq('corrected hours: long level 4 hands x 2 half hours = 40 tenths', dr.gross, 40);
  eq('B got 36 and the fund 4', [await L.balance(x, p('b@x.test')), await L.balance(x, L.FUND)], [36, 4]);
  eq('a deed cannot be decided twice', await code2(K.decideDeed(x, dd.id, { approve: true })), 'decided');
  // a need from A, who has no hands
  const n1 = await K.createNeed(x, 'a@x.test', { type_id: 's-garden', half_hours: 2 }, false);
  eq('a listed need does not wait', n1.waits_owner, false);
  eq('the board does not show my own', (await K.board(x, 'a@x.test')).length, 0);
  const bd = await K.board(x, 'b@x.test');
  eq('B sees it with a range and a price', [bd.length, !!bd[0].range.label, bd[0].gross], [1, true, 20]);
  eq('the board never carries a reason, an address, a consent mark or an email', Object.keys(bd[0]).filter((k) => /reason|address|consent|email/.test(k)), []);
  await K.offerHelp(x, n1.id, 'b@x.test');
  eq('the asker has no hands: refused', await code2(K.answerOffer(x, n1.id, 'a@x.test', true)), 'no_funds');
  // an unlisted need waits for the owner and is hidden
  const n2 = await K.createNeed(x, 'c@x.test', { title: 'ללמד נגינה', half_hours: 2, difficulty: 1, expertise: 1 }, false);
  eq('unlisted waits', n2.waits_owner, true);
  eq('hidden from the board', (await K.board(x, 'b@x.test')).filter((r) => r.title === 'ללמד נגינה').length, 0);
  await K.decideNeed(x, n2.id, { approve: true, add_to_list: true });
  eq('after approval it shows, and the type joined the list', [(await K.board(x, 'b@x.test')).filter((r) => r.title === 'ללמד נגינה').length, x.sq.prepare("SELECT COUNT(*) AS n FROM yad_types WHERE id LIKE 'x-%'").get().n], [1, 1]);
  // the flow: B (36) asks, C helps
  const n3 = await K.createNeed(x, 'b@x.test', { type_id: 's-clean', half_hours: 2 }, false);
  eq('a helper cannot take their own need', await code2(K.offerHelp(x, n3.id, 'b@x.test')), 'own_need');
  await K.offerHelp(x, n3.id, 'c@x.test');
  eq('a second helper is refused', await code2(K.offerHelp(x, n3.id, 'a@x.test')), 'not_open');
  eq('only the asker answers', await code2(K.answerOffer(x, n3.id, 'c@x.test', true)), 'forbidden');
  await K.answerOffer(x, n3.id, 'b@x.test', true);
  await K.setAddress(x, n3.id, 'b@x.test', 'SEALED');
  eq('a stranger cannot read the address', await code2(K.addressOf(x, n3.id, 'a@x.test')), 'forbidden');
  eq('the two sides read it', [await K.addressOf(x, n3.id, 'c@x.test'), await K.addressOf(x, n3.id, 'b@x.test')], ['SEALED', 'SEALED']);
  eq('one confirmation is not enough', (await K.confirmDone(x, n3.id, 'b@x.test')).done, false);
  eq('both confirm: the hands move', (await K.confirmDone(x, n3.id, 'c@x.test')).done, true);
  eq('B paid 20, C got 18, the fund 2 more', [await L.balance(x, p('b@x.test')), await L.balance(x, p('c@x.test')), await L.balance(x, L.FUND)], [16, 18, 6]);
  eq('confirming again changes nothing', await code2(K.confirmDone(x, n3.id, 'c@x.test')), 'not_agreed');
  await K.recommend(x, n3.id, 'b@x.test', 'עבודה מצוינת');
  eq('the recommendation is on the giver', (await K.recsOf(x, 'c@x.test')).length, 1);
  // the fund pays for someone who cannot: needs a reason and the owner
  eq('a fund need needs a reason', await code2(K.createNeed(x, 'a@x.test', { type_id: 's-shop', half_hours: 2, pay: 'fund' }, false)), 'fund_reason');
  eq('for someone else needs the consent mark', await code2(K.createNeed(x, 'a@x.test', { type_id: 's-shop', half_hours: 2, pay: 'fund', fund_reason: 'x', for_name: 'דוד' }, false)), 'consent');
  eq('only the owner publishes from the tent', await code2(K.createNeed(x, 'a@x.test', { type_id: 's-shop', half_hours: 2, pay: 'ohel' }, false)), 'owner_only');
  const f1 = await K.createNeed(x, 'a@x.test', { type_id: 's-shop', half_hours: 1, pay: 'fund', fund_reason: 'מחלה' }, false);
  eq('a fund need is hidden until approved', (await K.board(x, 'b@x.test')).filter((r) => r.id === f1.id).length, 0);
  eq('the queue shows its reason to the owner', (await K.queue(x)).needs.find((q) => q.id === f1.id).fund_reason, 'מחלה');
  await K.decideNeed(x, f1.id, { approve: true });
  eq('approved, it shows without the reason', [(await K.board(x, 'b@x.test')).filter((r) => r.id === f1.id).length, JSON.stringify(await K.board(x, 'b@x.test')).includes('מחלה')], [1, false]);
  await K.offerHelp(x, f1.id, 'b@x.test'); await K.answerOffer(x, f1.id, 'a@x.test', true);
  await K.confirmDone(x, f1.id, 'a@x.test'); await K.confirmDone(x, f1.id, 'b@x.test');
  eq('the fund paid the giver (gross 5, the tithe rounds down to 0)', await L.balance(x, p('b@x.test')), 16 + 5);
  eq('the fund page shows amount and kind only', Object.keys((await K.fundPage(x)).recent[0]).sort(), ['at', 'tenths', 'what']);
  // the dashboard
  const ds = await K.dashboard(x, 'c@x.test');
  eq('C: balance 18, gave 18, tithe 0', [ds.balance, ds.gave_total, ds.tithe], [18, 18, 0]);
  eq("B's tithe is kept from day one", (await K.dashboard(x, 'b@x.test')).tithe, 4 + 2);
  // reports, removal, closing
  const rp = await K.report(x, 'a@x.test', 'person', 'c@x.test', 'התנהגות');
  eq('a report waits in the queue', (await K.queue(x)).reports.length, 1);
  await K.resolveReport(x, rp.id, 'owner@x.test', 'remove_person');
  eq('a removed person is frozen', await K.isFrozen(x, 'c@x.test'), true);
  eq('a removed person cannot open a need', await code2(K.createNeed(x, 'c@x.test', { type_id: 's-clean', half_hours: 2 }, false)), 'removed');
  await K.restorePerson(x, 'c@x.test');
  const before = await L.balance(x, L.FUND), cb = await L.balance(x, p('c@x.test'));
  const cl = await K.closeAccount(x, 'c@x.test');
  eq('closing cancels the hands: they go to the fund as new rows', [cl.balance, await L.balance(x, L.FUND)], [0, before + cb]);
  eq('the closed account is frozen', await K.isFrozen(x, 'c@x.test'), true);
  const all2 = x.sq.prepare("SELECT DISTINCT a FROM (SELECT src AS a FROM yad_ledger UNION SELECT dst FROM yad_ledger) WHERE a != 'mint'").all().map((r) => r.a);
  let tot = 0, ng = 0; for (const a of all2) { const b = await L.balance(x, a); tot += b; if (b < 0) ng++; }
  eq('nothing negative and nothing lost', [ng, tot], [0, x.sq.prepare("SELECT COALESCE(SUM(tenths),0) AS m FROM yad_ledger WHERE src = 'mint'").get().m]);
}

/* ---- security fixes before the family switch (CEO review 2026-11-16): daily caps in D1, only an open need is decided, the address is cleared, removal cancels agreed needs ---- */
{
  const x = d1(); await SD.ensureCatalog(x);
  for (const e of ['a@x.test', 'b@x.test', 'c@x.test']) await K.setRegion(x, e, 'tel-aviv');
  const need = (e) => K.createNeed(x, e, { type_id: 's-clean', half_hours: 1 }, false);
  const st = (id) => x.sq.prepare('SELECT status, address, helper FROM yad_needs WHERE id = ?').get(id);
  // 1. daily caps, counted in D1 per person and per kind
  let last = 'ok'; for (let i = 0; i < K.DAILY_CAP; i++) await need('a@x.test');
  eq('the 21st need in a day is refused', await code2(need('a@x.test')), 'slow_down');
  eq('another person is not slowed', await code2(need('b@x.test')), 'ok');
  const r20 = []; for (let i = 0; i < K.DAILY_CAP; i++) r20.push(await code2(K.report(x, 'c@x.test', 'person', 'a@x.test', 'סיבה')));
  eq('20 reports are taken', r20.every((v) => v === 'ok'), true);
  eq('the 21st report is refused', await code2(K.report(x, 'c@x.test', 'person', 'a@x.test', 'סיבה')), 'slow_down');
  const dc = []; for (let i = 0; i < K.DAILY_CAP; i++) dc.push(await code2(K.reportDeed(x, 'b@x.test', { type_id: 'd-stream', half_hours: 1 })));
  eq('20 deeds are taken, the 21st refused', [dc.every((v) => v === 'ok'), await code2(K.reportDeed(x, 'b@x.test', { type_id: 'd-stream', half_hours: 1 }))], [true, 'slow_down']);
  const open = x.sq.prepare("SELECT id FROM yad_needs WHERE email = 'a@x.test' LIMIT 25").all().map((r) => r.id);
  const oc = []; for (let i = 0; i < K.DAILY_CAP; i++) oc.push(await code2(K.offerHelp(x, open[i], 'c@x.test')));
  eq('20 offers are tried; the 21st is refused by the cap', await code2(K.offerHelp(x, open[20], 'c@x.test')), 'slow_down');
  const later = Date.now() + 25 * 3_600_000;
  eq('the next day it opens again', await code2(K.createNeed(x, 'a@x.test', { type_id: 's-clean', half_hours: 1 }, false, later)), 'ok');
  // 2. decideNeed acts only on an open need
  const y = d1(); await SD.ensureCatalog(y);
  for (const e of ['a@x.test', 'b@x.test']) await K.setRegion(y, e, 'tel-aviv');
  const n = await K.createNeed(y, 'a@x.test', { type_id: 's-clean', half_hours: 1 }, false);
  const ys = (id) => y.sq.prepare('SELECT status, address, helper FROM yad_needs WHERE id = ?').get(id);
  y.sq.prepare("UPDATE yad_needs SET status = 'done', address = 'SEALED' WHERE id = ?").run(n.id);
  eq('a done need is not rejected', await code2(K.decideNeed(y, n.id, { approve: false, reason: 'x' })), 'not_open');
  eq('a done need is not approved', await code2(K.decideNeed(y, n.id, { approve: true })), 'not_open');
  eq('and stays done', ys(n.id).status, 'done');
  // 3. the address is cleared when a need is done, cancelled or removed
  const n2 = await K.createNeed(y, 'a@x.test', { type_id: 's-clean', half_hours: 1 }, false);
  y.sq.prepare("UPDATE yad_needs SET status = 'agreed', helper = 'b@x.test', address = 'SEALED' WHERE id = ?").run(n2.id);
  eq('the address reads while agreed', await K.addressOf(y, n2.id, 'b@x.test'), 'SEALED');
  await K.cancelNeed(y, n2.id, 'a@x.test');
  eq('cancelled: the address is gone', [ys(n2.id).status, ys(n2.id).address], ['cancelled', '']);
  eq('and no one reads it', await code2(K.addressOf(y, n2.id, 'b@x.test')), 'ok');
  // 4. removing a person cancels agreed needs, as asker and as helper
  const asker = await K.createNeed(y, 'a@x.test', { type_id: 's-clean', half_hours: 1 }, false);
  const helped = await K.createNeed(y, 'b@x.test', { type_id: 's-clean', half_hours: 1 }, false);
  y.sq.prepare("UPDATE yad_needs SET status = 'agreed', helper = 'b@x.test', address = 'SEALED' WHERE id = ?").run(asker.id);
  y.sq.prepare("UPDATE yad_needs SET status = 'agreed', helper = 'a@x.test', address = 'SEALED' WHERE id = ?").run(helped.id);
  await K.removePerson(y, 'a@x.test');
  eq('the asker removed: the agreed need is cancelled, address gone', [ys(asker.id).status, ys(asker.id).address], ['cancelled', '']);
  eq('the helper removed: the need they agreed to is cancelled', [ys(helped.id).status, ys(helped.id).address], ['cancelled', '']);
}

/* ---- the HTTP layer: while the switch is off every route is a 404 for a member (the owner may try) ---- */
{
  const H = await bundle('server/yad.ts', 'http.mjs');
  const calls = { catalog: H.catalog, board: H.board, mine: H.mine, fund: H.fund, dashboard: H.dashboard, createNeed: H.createNeed, offerHelp: H.offerHelp, answer: H.answer, putAddress: H.putAddress, getAddress: H.getAddress, confirm: H.confirm, cancel: H.cancel, recommend: H.recommend, reportDeed: H.reportDeed, report: H.report, closeMine: H.closeMine, queue: H.queue, decideNeed: H.decideNeed, decideDeed: H.decideDeed, resolve: H.resolve, restore: H.restore, personBalance: H.personBalance, setRegion: H.setRegion, setOffers: H.setOffers };
  const out = {};
  for (const [name, fn] of Object.entries(calls)) { const c = ctxFor('a@x.test', false); c.params = { id: 'z', email: 'q' }; out[name] = await (async () => { try { await fn(c); return 'ok'; } catch (e) { return e.status; } })(); }
  eq('every yad route answers a member with 404', Object.values(out).every((v) => v === 404), true);
  eq('the routes checked', Object.keys(out).length, 24);
}

console.log(`yad: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
