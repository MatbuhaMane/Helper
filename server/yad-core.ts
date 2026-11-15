// "יד ביד": the operations on the tables (needs, offers, deeds, reports, the fund), without HTTP. Tested on SQLite by test-yad.mjs.
// Privacy by construction: the fund reason, the "consent" mark and the address never leave through a list; the board shows a range, never a place.

import type { Env } from './core';
import { FUND, MINT, acct, balance, deedLegs, fundServiceLegs, post, serviceLegs } from './yad-ledger';
import type { PostResult } from './yad-ledger';
import { grossTenths, levelOf, validHalfHours, validScore } from './yad-rules';
import { rangeBetween, regionById } from './yad-regions';

type Db = Env['DB'];
export class YadError extends Error { constructor(public status: number, public code: string) { super(code); } }
const bad = (code = 'invalid') => new YadError(400, code);
const id = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const clean = (s: unknown, max: number) => String(s ?? '').trim().slice(0, max);

export interface TypeRow { id: string; kind: 'service' | 'deed'; name: string; difficulty: number; expertise: number; declaration: string; note: string; sort: number; active: number }
export async function typeOf(db: Db, typeId: string) { return db.prepare('SELECT * FROM yad_types WHERE id = ? AND active = 1').bind(typeId).first<TypeRow>(); }

/* ---- the person ---- */
export async function ensurePerson(db: Db, email: string, now = Date.now()) {
  await db.prepare('INSERT OR IGNORE INTO yad_people (email, created_at) VALUES (?, ?)').bind(email, now).run();
}
export async function isFrozen(db: Db, email: string) {
  return !!(await db.prepare('SELECT 1 AS x FROM yad_people WHERE email = ? AND removed_at IS NOT NULL').bind(email).first());
}
async function live(db: Db, email: string) { await ensurePerson(db, email); if (await isFrozen(db, email)) throw new YadError(403, 'removed'); }

export async function setRegion(db: Db, email: string, region: string | null) {
  if (region && !regionById(region)) throw bad('region');
  await live(db, email);
  await db.prepare('UPDATE yad_people SET region = ? WHERE email = ?').bind(region, email).run();
}
/** what a person can give: types ticked in the profile. A type that asks for a declaration needs declared = true ("לפי הצהרת המשתמש") */
export async function setOffers(db: Db, email: string, offers: { type_id: string; declared?: boolean }[], now = Date.now()) {
  await live(db, email);
  const rows: { t: string; d: number }[] = [];
  for (const o of offers.slice(0, 60)) {
    const t = await typeOf(db, String(o.type_id));
    if (!t) throw bad('type');
    if (t.declaration !== 'none' && o.declared !== true) throw bad('declaration_needed');
    rows.push({ t: t.id, d: t.declaration !== 'none' ? 1 : 0 });
  }
  await db.batch([db.prepare('DELETE FROM yad_offers WHERE email = ?').bind(email),
    ...rows.map((r) => db.prepare('INSERT OR IGNORE INTO yad_offers (email, type_id, declared, at) VALUES (?, ?, ?, ?)').bind(email, r.t, r.d, now))]);
}
export async function offersOf(db: Db, email: string) {
  return (await db.prepare('SELECT type_id, declared FROM yad_offers WHERE email = ?').bind(email).all<{ type_id: string; declared: number }>()).results;
}

/* ---- needs ---- */
export interface NeedInput { type_id?: string | null; title?: string; detail?: string; half_hours?: number; difficulty?: number; expertise?: number; pay?: 'person' | 'fund' | 'public' | 'ohel'; fund_reason?: string; for_name?: string; consent?: boolean }
/** a new need. Listed type: the level comes with the type. Unlisted: the person proposes a level and it waits for the owner. A fund/public/ohel need waits for the owner too. */
export async function createNeed(db: Db, email: string, i: NeedInput, isOwner: boolean, now = Date.now()) {
  await live(db, email);
  const pay = i.pay || 'person';
  if (!['person', 'fund', 'public', 'ohel'].includes(pay)) throw bad('pay');
  if (pay === 'ohel' && !isOwner) throw new YadError(403, 'owner_only');
  if (!validHalfHours(i.half_hours)) throw bad('half_hours');
  let d: number, e: number, levelOk = 1, title = clean(i.title, 120);
  if (i.type_id) {
    const t = await typeOf(db, i.type_id);
    if (!t) throw bad('type');
    d = t.difficulty; e = t.expertise; title = title || t.name;
  } else {
    if (!title || !validScore(i.difficulty) || !validScore(i.expertise)) throw bad('level');
    d = i.difficulty; e = i.expertise; levelOk = isOwner ? 1 : 0;
  }
  const needsFund = pay !== 'person';
  if (needsFund && pay !== 'ohel' && !clean(i.fund_reason, 300)) throw bad('fund_reason');
  if (pay === 'fund' && clean(i.for_name, 80) && i.consent !== true) throw bad('consent');
  const nid = id();
  await db.prepare(`INSERT INTO yad_needs (id, email, type_id, title, detail, half_hours, difficulty, expertise, level_ok, status, pay, fund_ok, fund_reason, for_name, consent, region, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, (SELECT region FROM yad_people WHERE email = ?), ?, ?)`)
    .bind(nid, email, i.type_id || null, title, clean(i.detail, 1000), i.half_hours, d, e, levelOk, pay, pay === 'ohel' ? 1 : 0, clean(i.fund_reason, 300), clean(i.for_name, 80), i.consent ? 1 : 0, email, now, now).run();
  return { id: nid, waits_owner: levelOk === 0 || (needsFund && pay !== 'ohel') };
}

/** the public shape of a need: no fund reason, no consent mark, no address, no email of the asker beyond what a screen needs */
const PUBLIC = `n.id, n.title, n.detail, n.half_hours, n.difficulty, n.expertise, n.pay, n.status, n.type_id, n.region, n.created_at, n.email AS owner_email`;
interface BoardRow { id: string; title: string; detail: string; half_hours: number; difficulty: number; expertise: number; pay: string; status: string; type_id: string | null; region: string | null; created_at: number; owner_email: string }
const handsOf = (r: { difficulty: number; expertise: number; half_hours: number }) => { const l = levelOf(r.difficulty as 0, r.expertise as 0); return { level: l.id, level_name: l.name, gross: grossTenths(l.hands, r.half_hours) }; };

/** the board: open needs that may be seen (the level is approved, and a fund need is approved), sorted by the distance band or by type. Not the viewer's own. */
export async function board(db: Db, viewer: string, q: { kind?: string; maxBand?: number; type_id?: string; sort?: 'distance' | 'type' } = {}) {
  const me = await db.prepare('SELECT region FROM yad_people WHERE email = ?').bind(viewer).first<{ region: string | null }>();
  const { results } = await db.prepare(`SELECT ${PUBLIC} FROM yad_needs n WHERE n.status = 'open' AND n.level_ok = 1 AND (n.pay = 'person' OR n.fund_ok = 1) AND n.email != ? ORDER BY n.created_at DESC LIMIT 300`).bind(viewer).all<BoardRow>();
  let rows = results.map((r) => ({ id: r.id, title: r.title, detail: r.detail, type_id: r.type_id, half_hours: r.half_hours, pay: r.pay, public_good: r.pay === 'public' || r.pay === 'ohel', from_ohel: r.pay === 'ohel',
    range: rangeBetween(me?.region, r.region), ...handsOf(r), created_at: r.created_at }));
  if (q.type_id) rows = rows.filter((r) => r.type_id === q.type_id);
  if (q.maxBand != null) rows = rows.filter((r) => r.range && r.range.band <= q.maxBand!);
  rows.sort(q.sort === 'type' ? (a, b) => (a.type_id || '').localeCompare(b.type_id || '') : (a, b) => (a.range?.band ?? 9) - (b.range?.band ?? 9) || b.created_at - a.created_at);
  return rows.slice(0, 100);
}
/** the needs of a person (active and past), as the person sees them */
export async function myNeeds(db: Db, email: string) {
  const { results } = await db.prepare(`SELECT id, title, detail, half_hours, difficulty, expertise, pay, status, level_ok, fund_ok, reject_why, helper, req_ok, help_ok, gross, created_at FROM yad_needs WHERE email = ? ORDER BY created_at DESC LIMIT 100`).bind(email).all<any>();
  return results.map((r) => ({ ...r, ...handsOf(r), waits_owner: r.level_ok === 0 || (r.pay !== 'person' && r.fund_ok === 0 && r.status === 'open') }));
}
/** the needs a person filled or offered to fill */
export async function myHelps(db: Db, email: string) {
  const { results } = await db.prepare(`SELECT id, title, half_hours, difficulty, expertise, pay, status, gross, req_ok, help_ok, created_at FROM yad_needs WHERE helper = ? ORDER BY created_at DESC LIMIT 100`).bind(email).all<any>();
  return results.map((r) => ({ ...r, ...handsOf(r) }));
}

/* ---- the service flow: the helper offers, the asker agrees, both confirm, the hands move ---- */
async function needOf(db: Db, nid: string) { const n = await db.prepare('SELECT * FROM yad_needs WHERE id = ?').bind(nid).first<any>(); if (!n) throw new YadError(404, 'not_found'); return n; }

export async function offerHelp(db: Db, nid: string, helper: string, now = Date.now()) {
  await live(db, helper);
  const n = await needOf(db, nid);
  if (n.email === helper) throw bad('own_need');
  if (n.status !== 'open' || n.level_ok !== 1 || (n.pay !== 'person' && n.fund_ok !== 1)) throw new YadError(409, 'not_open');
  if (n.type_id) {
    const t = await typeOf(db, n.type_id);
    if (t && t.declaration !== 'none' && !(await db.prepare('SELECT 1 AS x FROM yad_offers WHERE email = ? AND type_id = ? AND declared = 1').bind(helper, n.type_id).first())) throw bad('declaration_needed');
  }
  const r = await db.prepare("UPDATE yad_needs SET helper = ?, status = 'offered', updated_at = ? WHERE id = ? AND status = 'open'").bind(helper, now, nid).run();
  if (!r.meta.changes) throw new YadError(409, 'not_open');
  return { asker: n.email as string, title: n.title as string };
}
/** the asker agrees (fixing the gross) or declines (the need opens again) */
export async function answerOffer(db: Db, nid: string, asker: string, accept: boolean, now = Date.now()) {
  const n = await needOf(db, nid);
  if (n.email !== asker) throw new YadError(403, 'forbidden');
  if (n.status !== 'offered') throw new YadError(409, 'not_offered');
  if (!accept) { await db.prepare("UPDATE yad_needs SET helper = NULL, status = 'open', updated_at = ? WHERE id = ?").bind(now, nid).run(); return { helper: n.helper as string }; }
  const gross = handsOf(n).gross;
  if (n.pay === 'person') { const have = await balance(db, acct(asker)); if (have < gross) throw new YadError(409, 'no_funds'); }
  await db.prepare("UPDATE yad_needs SET status = 'agreed', gross = ?, req_ok = 0, help_ok = 0, updated_at = ? WHERE id = ?").bind(gross, now, nid).run();
  return { helper: n.helper as string };
}
/** the exact address: the asker writes it after the agreement, the two sides read it (the caller seals and unseals it) */
export async function setAddress(db: Db, nid: string, asker: string, sealed: string) {
  const n = await needOf(db, nid);
  if (n.email !== asker) throw new YadError(403, 'forbidden');
  if (n.status !== 'agreed') throw new YadError(409, 'not_agreed');
  await db.prepare('UPDATE yad_needs SET address = ? WHERE id = ?').bind(sealed, nid).run();
}
export async function addressOf(db: Db, nid: string, viewer: string): Promise<string> {
  const n = await needOf(db, nid);
  if (viewer !== n.email && viewer !== n.helper) throw new YadError(403, 'forbidden');
  return n.status === 'agreed' || n.status === 'done' ? n.address : '';
}
/** each side confirms that it was done; when both have, the hands move (once: the ref is the need) */
export async function confirmDone(db: Db, nid: string, who: string, now = Date.now()): Promise<{ done: boolean; post?: PostResult }> {
  const n = await needOf(db, nid);
  if (n.status !== 'agreed') throw new YadError(409, 'not_agreed');
  const side = who === n.email ? 'req_ok' : who === n.helper ? 'help_ok' : null;
  if (!side) throw new YadError(403, 'forbidden');
  await db.prepare(`UPDATE yad_needs SET ${side} = 1, updated_at = ? WHERE id = ?`).bind(now, nid).run();
  const m = await needOf(db, nid);
  if (!(m.req_ok && m.help_ok)) return { done: false };
  const legs = m.pay === 'person' ? serviceLegs(acct(m.email), acct(m.helper), m.gross) : fundServiceLegs(acct(m.helper), m.gross);
  const res = await post(db, 'svc:' + nid, legs, now);
  if (!res.ok) throw new YadError(409, res.why);
  await db.prepare("UPDATE yad_needs SET status = 'done', updated_at = ? WHERE id = ?").bind(now, nid).run();
  return { done: true, post: res };
}
export async function cancelNeed(db: Db, nid: string, who: string, now = Date.now()) {
  const n = await needOf(db, nid);
  if (n.email !== who) throw new YadError(403, 'forbidden');
  if (n.status === 'done' || n.status === 'removed') throw new YadError(409, 'closed');
  await db.prepare("UPDATE yad_needs SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(now, nid).run();
}
/** an optional recommendation by the asker after the service; it is shown on the giver's profile */
export async function recommend(db: Db, nid: string, who: string, text: string, now = Date.now()) {
  const n = await needOf(db, nid);
  if (n.email !== who || n.status !== 'done' || !n.helper) throw new YadError(403, 'forbidden');
  const t = clean(text, 300); if (!t) throw bad('text');
  await db.prepare('INSERT OR REPLACE INTO yad_recs (need_id, by_email, about, text, at) VALUES (?, ?, ?, ?, ?)').bind(nid, who, n.helper, t, now).run();
}
export async function recsOf(db: Db, about: string) {
  return (await db.prepare('SELECT text, at FROM yad_recs WHERE about = ? ORDER BY at DESC LIMIT 20').bind(about).all<{ text: string; at: number }>()).results;
}

/* ---- deeds ("עשיתי מעשה") ---- */
export async function reportDeed(db: Db, email: string, i: { type_id?: string | null; title?: string; half_hours?: number; difficulty?: number; expertise?: number }, now = Date.now()) {
  await live(db, email);
  if (!validHalfHours(i.half_hours)) throw bad('half_hours');
  let d: number, e: number, levelOk = 1, title = clean(i.title, 120);
  if (i.type_id) { const t = await typeOf(db, i.type_id); if (!t) throw bad('type'); d = t.difficulty; e = t.expertise; title = title || t.name; }
  else { if (!title || !validScore(i.difficulty) || !validScore(i.expertise)) throw bad('level'); d = i.difficulty; e = i.expertise; levelOk = 0; }
  const did = id();
  await db.prepare('INSERT INTO yad_deeds (id, email, type_id, title, half_hours, difficulty, expertise, level_ok, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'pending\', ?)').bind(did, email, i.type_id || null, title, i.half_hours, d, e, levelOk, now).run();
  return { id: did };
}
/** the owner decides a deed: approve (hours may be corrected; the hands come from the fund first, new ones only for the rest) or reject with a reason */
export async function decideDeed(db: Db, did: string, o: { approve: boolean; reason?: string; half_hours?: number; difficulty?: number; expertise?: number }, now = Date.now()) {
  const x = await db.prepare('SELECT * FROM yad_deeds WHERE id = ?').bind(did).first<any>();
  if (!x) throw new YadError(404, 'not_found');
  if (x.status !== 'pending') throw new YadError(409, 'decided');
  if (!o.approve) {
    const why = clean(o.reason, 300); if (!why) throw bad('reason');
    await db.prepare("UPDATE yad_deeds SET status = 'rejected', reject_why = ?, decided_at = ? WHERE id = ?").bind(why, now, did).run();
    return { ok: true };
  }
  const hh = o.half_hours ?? x.half_hours; if (!validHalfHours(hh)) throw bad('half_hours');
  const dd = o.difficulty ?? x.difficulty, ee = o.expertise ?? x.expertise; if (!validScore(dd) || !validScore(ee)) throw bad('level');
  const gross = grossTenths(levelOf(dd, ee).hands, hh);
  const res = await post(db, 'deed:' + did, await deedLegs(db, acct(x.email), gross), now);
  if (!res.ok) throw new YadError(409, res.why);
  await db.prepare("UPDATE yad_deeds SET status = 'approved', half_hours = ?, difficulty = ?, expertise = ?, level_ok = 1, decided_at = ? WHERE id = ?").bind(hh, dd, ee, now, did).run();
  return { ok: true, gross };
}
export async function myDeeds(db: Db, email: string) {
  return (await db.prepare('SELECT id, title, half_hours, status, reject_why, created_at FROM yad_deeds WHERE email = ? ORDER BY created_at DESC LIMIT 100').bind(email).all<any>()).results;
}

/* ---- the fund page: the balance and recent spending, only the amount and the kind of help (no names in stage 1) ---- */
export async function fundPage(db: Db) {
  const rows = (await db.prepare("SELECT at, kind, tenths FROM yad_ledger WHERE src = ? AND kind IN ('fund_pay', 'deed_fund') ORDER BY at DESC LIMIT 30").bind(FUND).all<{ at: number; kind: string; tenths: number }>()).results;
  return { balance: await balance(db, FUND), recent: rows.map((r) => ({ at: r.at, tenths: r.tenths, what: r.kind === 'deed_fund' ? 'מעשה לטובת הציבור' : 'עזרה למי שלא יכול לשלם' })) };
}

/* ---- a person's own numbers: seen only by the person and the owner (the handler checks who asks) ---- */
export async function dashboard(db: Db, email: string, now = Date.now()) {
  const a = acct(email), month = new Date(now); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
  const sum = async (col: 'src' | 'dst', since: number, kinds: string) => (await db.prepare(`SELECT COALESCE(SUM(tenths), 0) AS t FROM yad_ledger WHERE ${col} = ? AND at >= ? AND kind IN (${kinds})`).bind(a, since).first<{ t: number }>())?.t || 0;
  const GAVE = "'service','fund_pay','deed_fund','mint_deed'", PAID = "'service'";
  const waiting = (await db.prepare("SELECT COUNT(*) AS n FROM yad_needs WHERE (email = ? AND status = 'offered') OR ((email = ? OR helper = ?) AND status = 'agreed')").bind(email, email, email).first<{ n: number }>())?.n || 0;
  const tithe = (await db.prepare("SELECT COALESCE(SUM(tenths), 0) AS t FROM yad_ledger WHERE kind = 'tithe' AND src = ?").bind(a).first<{ t: number }>())?.t || 0;
  return { balance: await balance(db, a), gave_month: await sum('dst', month.getTime(), GAVE), gave_total: await sum('dst', 0, GAVE),
    received_month: await sum('src', month.getTime(), PAID), received_total: await sum('src', 0, PAID), tithe, waiting };
}

/* ---- reports, the owner's queue, removal ---- */
export async function report(db: Db, by: string, kind: 'need' | 'person' | 'license', target: string, reason: string, now = Date.now()) {
  if (!['need', 'person', 'license'].includes(kind) || !clean(reason, 300) || !clean(target, 120)) throw bad();
  const rid = id();
  await db.prepare('INSERT INTO yad_reports (id, by_email, kind, target, reason, status, at) VALUES (?, ?, ?, ?, ?, \'open\', ?)').bind(rid, by, kind, clean(target, 120), clean(reason, 300), now).run();
  return { id: rid };
}
/** everything that waits for the owner, in one list */
export async function queue(db: Db) {
  const deeds = (await db.prepare("SELECT id, email, title, half_hours, difficulty, expertise, level_ok, created_at FROM yad_deeds WHERE status = 'pending' ORDER BY created_at").all<any>()).results;
  const needs = (await db.prepare("SELECT id, email, title, detail, half_hours, difficulty, expertise, level_ok, pay, fund_ok, fund_reason, for_name, consent, created_at FROM yad_needs WHERE status = 'open' AND (level_ok = 0 OR (pay IN ('fund','public') AND fund_ok = 0)) ORDER BY created_at").all<any>()).results;
  const reports = (await db.prepare("SELECT id, by_email, kind, target, reason, at FROM yad_reports WHERE status = 'open' ORDER BY at").all<any>()).results;
  return { deeds, needs, reports, count: deeds.length + needs.length + reports.length };
}
/** the owner decides a need that waits: approve (the level and/or the fund) or reject with a reason, or add the unlisted type to the list */
export async function decideNeed(db: Db, nid: string, o: { approve: boolean; reason?: string; difficulty?: number; expertise?: number; add_to_list?: boolean }, now = Date.now()) {
  const n = await needOf(db, nid);
  if (!o.approve) {
    const why = clean(o.reason, 300); if (!why) throw bad('reason');
    await db.prepare("UPDATE yad_needs SET status = 'rejected', reject_why = ?, updated_at = ? WHERE id = ?").bind(why, now, nid).run();
    return;
  }
  const dd = o.difficulty ?? n.difficulty, ee = o.expertise ?? n.expertise; if (!validScore(dd) || !validScore(ee)) throw bad('level');
  let typeId = n.type_id;
  if (o.add_to_list && !typeId) {
    typeId = 'x-' + id();
    const sort = ((await db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM yad_types').first<{ m: number }>())?.m || 0) + 1;
    await db.prepare("INSERT INTO yad_types (id, kind, name, difficulty, expertise, declaration, note, sort, active) VALUES (?, 'service', ?, ?, ?, 'none', '', ?, 1)").bind(typeId, n.title, dd, ee, sort).run();
  }
  await db.prepare('UPDATE yad_needs SET level_ok = 1, difficulty = ?, expertise = ?, type_id = ?, fund_ok = CASE WHEN pay = \'person\' THEN fund_ok ELSE 1 END, updated_at = ? WHERE id = ?').bind(dd, ee, typeId, now, nid).run();
}
export async function resolveReport(db: Db, rid: string, owner: string, action: 'dismiss' | 'remove_need' | 'remove_person', now = Date.now()) {
  const r = await db.prepare('SELECT * FROM yad_reports WHERE id = ?').bind(rid).first<any>();
  if (!r) throw new YadError(404, 'not_found');
  if (action === 'remove_need') await db.prepare("UPDATE yad_needs SET status = 'removed', updated_at = ? WHERE id = ?").bind(now, r.target).run();
  if (action === 'remove_person') await removePerson(db, r.target, owner, now);
  await db.prepare("UPDATE yad_reports SET status = 'closed', action = ? WHERE id = ?").bind(action, rid).run();
}
/** removal from "יד ביד": frozen (reversible), the open needs are taken down */
export async function removePerson(db: Db, email: string, by: string, now = Date.now()) {
  await ensurePerson(db, email, now);
  await db.batch([db.prepare('UPDATE yad_people SET removed_at = ?, removed_by = ? WHERE email = ?').bind(now, by, email),
    db.prepare("UPDATE yad_needs SET status = 'removed', updated_at = ? WHERE email = ? AND status IN ('open', 'offered')").bind(now, email),
    db.prepare("UPDATE yad_needs SET helper = NULL, status = 'open', updated_at = ? WHERE helper = ? AND status = 'offered'").bind(now, email)]);
}
export async function restorePerson(db: Db, email: string) { await db.prepare('UPDATE yad_people SET removed_at = NULL, removed_by = NULL WHERE email = ?').bind(email).run(); }

/** closing an account cancels the person's hands: the whole balance goes to the fund as new rows (no compensation), then the person is frozen */
export async function closeAccount(db: Db, email: string, now = Date.now()) {
  await ensurePerson(db, email, now);
  for (let attempt = 0; attempt < 3; attempt++) {
    const b = await balance(db, acct(email));
    if (b <= 0) break;
    const res = await post(db, `close:${email}:${now}:${attempt}`, [{ kind: 'close', src: acct(email), dst: FUND, tenths: b }], now);
    if (res.ok) break;
  }
  await removePerson(db, email, 'account-closed', now);
  await db.prepare('DELETE FROM yad_offers WHERE email = ?').bind(email).run();
  return { balance: await balance(db, acct(email)) };
}

export { MINT };
