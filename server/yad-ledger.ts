// "יד ביד": the ledger of hands. THE careful part (the CEO reviews it like money).
//
// - Append-only: rows are only ever added, never changed or deleted. A correction is a new row (a "reversal").
// - A balance is computed from the rows: tenths received minus tenths sent. There is no stored balance to drift.
// - Whole tenths only (integers). A transfer has a unique key (ref + leg), so the same transfer cannot be posted twice.
// - No minus: the sender's balance is checked INSIDE the same statement that inserts the row, so two requests at once cannot both pass.
// - A person removed from "יד ביד" is frozen: nothing goes to them or from them (checked in the same statement too).
// - New hands exist only when someone earns them in a deed the owner approved, and only for what the fund cannot cover.
// Accounts: 'u:<email>' a person, 'fund' the public fund, 'mint' the source of new hands (only ever a sender).

import type { Env } from './core';
import { splitDeed, splitService } from './yad-rules';

export const FUND = 'fund', MINT = 'mint';
export const acct = (email: string) => 'u:' + email.toLowerCase();

export interface Leg { kind: string; src: string; dst: string; tenths: number }
export type PostResult = { ok: true; duplicate?: boolean } | { ok: false; why: 'no_funds' | 'frozen' | 'bad_amount' };

type Db = Env['DB'];
const BAL = (p: string) => `(SELECT COALESCE(SUM(CASE WHEN dst = ${p} THEN tenths ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN src = ${p} THEN tenths ELSE 0 END), 0) FROM yad_ledger WHERE src = ${p} OR dst = ${p})`;

export async function balance(db: Db, account: string): Promise<number> {
  const r = await db.prepare(`SELECT ${BAL('?1')} AS b`).bind(account).first<{ b: number }>();
  return r?.b || 0;
}

/** how much each sender must have at the start for the legs, in order, to go through (money received earlier in the group counts) */
export function needs(legs: Leg[]): Map<string, number> {
  const run = new Map<string, number>(), need = new Map<string, number>();
  for (const l of legs) {
    run.set(l.dst, (run.get(l.dst) || 0) + l.tenths);
    if (l.src === MINT) continue;
    const v = (run.get(l.src) || 0) - l.tenths;
    run.set(l.src, v);
    need.set(l.src, Math.max(need.get(l.src) || 0, -v));
  }
  return need;
}

/** post a group of legs atomically under a unique ref; refuses a minus balance and a frozen person */
export async function post(db: Db, ref: string, legs: Leg[], now = Date.now()): Promise<PostResult> {
  if (!legs.length || legs.some((l) => !Number.isInteger(l.tenths) || l.tenths <= 0 || l.src === l.dst || (l.dst === MINT && l.kind !== 'reversal') || (l.src === MINT && !l.kind.startsWith('mint')))) return { ok: false, why: 'bad_amount' };
  const dup = await db.prepare('SELECT 1 AS x FROM yad_ledger WHERE ref = ? LIMIT 1').bind(ref).first();
  if (dup) return { ok: true, duplicate: true };
  const people = [...new Set(legs.flatMap((l) => [l.src, l.dst]).filter((a) => a.startsWith('u:')))];
  const frozen = people.map((p) => `NOT EXISTS (SELECT 1 FROM yad_people WHERE email = '${p.slice(2).replace(/'/g, "''")}' AND removed_at IS NOT NULL)`).join(' AND ') || '1';
  const funds = [...needs(legs)].filter(([a, n]) => n > 0 && a !== MINT).map(([a, n]) => `${BAL(`'${a.replace(/'/g, "''")}'`)} >= ${n}`).join(' AND ') || '1';
  const stmts = legs.map((l, i) => db.prepare(
    `INSERT INTO yad_ledger (ref, leg, at, kind, src, dst, tenths) SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${i === 0 ? `${frozen} AND ${funds}` : 'EXISTS (SELECT 1 FROM yad_ledger WHERE ref = ? AND leg = 0)'}`)
    .bind(...[ref, i, now, l.kind, l.src, l.dst, l.tenths, ...(i === 0 ? [] : [ref])]));
  try {
    const res = await db.batch(stmts);
    if (res[0].meta.changes) return { ok: true };
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) return { ok: true, duplicate: true };
    throw e;
  }
  // nothing was posted: say why (a frozen person first, else the balance)
  const f = await db.prepare(`SELECT ${frozen} AS ok`).first<{ ok: number }>();
  return { ok: false, why: f?.ok ? 'no_funds' : 'frozen' };
}

/** a service between two members: the payer pays, the giver gets it minus the tithe, the fund gets the tithe */
export function serviceLegs(payer: string, giver: string, gross: number): Leg[] {
  const s = splitService(gross);
  return [{ kind: 'service', src: payer, dst: giver, tenths: s.giver }, ...(s.tithe ? [{ kind: 'tithe', src: payer, dst: FUND, tenths: s.tithe }] : [])];
}
/** the fund pays a service for someone who cannot give: the fund pays, the giver is paid minus the tithe that stays in the fund */
export function fundServiceLegs(giver: string, gross: number): Leg[] {
  const s = splitService(gross);
  return [{ kind: 'fund_pay', src: FUND, dst: giver, tenths: s.giver }];
}
/** a deed for the community: the fund pays what it has, new hands for the rest, then the tithe goes back to the fund */
export async function deedLegs(db: Db, person: string, gross: number): Promise<Leg[]> {
  const d = splitDeed(gross, await balance(db, FUND));
  return [
    ...(d.fromFund ? [{ kind: 'deed_fund', src: FUND, dst: person, tenths: d.fromFund }] : []),
    ...(d.minted ? [{ kind: 'mint_deed', src: MINT, dst: person, tenths: d.minted }] : []),
    ...(d.tithe ? [{ kind: 'tithe', src: person, dst: FUND, tenths: d.tithe }] : []),
  ];
}
/** a correction: the opposite of every row of a ref, as new rows (the old ones stay). Refuses if it would make a minus. */
export async function reverse(db: Db, ref: string, now = Date.now()): Promise<PostResult> {
  const { results } = await db.prepare('SELECT kind, src, dst, tenths FROM yad_ledger WHERE ref = ? ORDER BY leg DESC').bind(ref).all<Leg>();
  if (!results.length) return { ok: false, why: 'bad_amount' };
  return post(db, 'rev:' + ref, results.map((r) => ({ kind: 'reversal', src: r.dst, dst: r.src, tenths: r.tenths })), now);
}

/** what a person has paid in tithe since the first day (kept from day one, so the redemption of stage 2 needs no conversion) */
export async function tithePaid(db: Db, email: string): Promise<number> {
  const r = await db.prepare("SELECT COALESCE(SUM(tenths), 0) AS t FROM yad_ledger WHERE kind = 'tithe' AND src = ?").bind(acct(email)).first<{ t: number }>();
  return r?.t || 0;
}
