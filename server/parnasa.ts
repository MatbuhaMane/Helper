/* פרנסה, the household's money (docs/decisions.md 2026-11-13; the look: docs/design/parnasa.md). Rules in parnasa-rules.ts.
   - GET    /api/parnasa?scope=me|<kupa>&month=YYYY-MM    the dashboard of one month
   - POST   /api/parnasa/tx                                one payment (an entry), optionally recurring
   - DELETE /api/parnasa/tx/:id                            remove one (the toast's "בטל")
   - POST   /api/parnasa/import/check                      which rows of a bank file are already here, and the remembered categories
   - POST   /api/parnasa/import                            save the reviewed rows
   - DELETE /api/parnasa/recur/:id                         stop a recurring payment
   - POST   /api/parnasa/holdings · DELETE /api/parnasa/holdings/:id      investments, entered by hand, tracking only
   - POST   /api/parnasa/kupa {name, invite}               open a shared קופה and invite one person of the household
   - POST   /api/parnasa/kupa/:id/invite {email} · /accept · /leave
   - POST   /api/parnasa/tips {scope, month}               up to three tips from Claude, on sums by category only
   Privacy (the decision's rules, reviewed by the master):
   - every row is read, changed or removed only by its owner (a personal row: kupa_id NULL) or by a member of its קופה;
     a scope that is a קופה the person is not a member of is a 404, the same as one that does not exist;
   - nothing of the money goes to the logs: no console line carries an amount, a name or a business; errors are codes;
   - the AI is Claude only (no Gemini, no fallback), and it sees the month's sums by category, never a line. */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { Ctx, HttpError, body, json, requireUser, uid } from './core';
import {
  CATS, ParnasaError, addMonths, aiSummary, cleanHolding, cleanTx, dueDates, dupKey, feedSymbol, frequent, isMonth,
  inShekels, kupaName, line, monthRange, parseQuote, sums,
} from './parnasa-rules';

const bad = (e: unknown): never => { if (e instanceof ParnasaError) throw new HttpError(400, e.code); throw e; };
/** today in Israel, as the family's calendar has it */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());

/* ---------- who sees what ---------- */
interface Scope { kupa: string | null; email: string }
/** 'me' (or nothing) is the person's own; anything else must be a קופה the person is a member of (else 404, never 403,
    so a stranger cannot tell a קופה exists) */
async function scopeOf(ctx: Ctx, s: unknown): Promise<Scope> {
  const u = requireUser(ctx);
  const id = typeof s === 'string' ? s : '';
  if (!id || id === 'me') return { kupa: null, email: u.email };
  const m = await ctx.env.DB.prepare("SELECT 1 FROM pr_kupa_members WHERE kupa_id = ? AND email = ? AND status = 'member'").bind(id, u.email).first();
  if (!m) throw new HttpError(404, 'not_found');
  return { kupa: id, email: u.email };
}
/** the WHERE of a scope's rows (personal: mine and in no קופה; a קופה: everything in it) */
const where = (s: Scope): [string, unknown[]] => (s.kupa ? ['kupa_id = ?', [s.kupa]] : ['kupa_id IS NULL AND owner_email = ?', [s.email]]);
/** the WHERE of one row by id, whoever may touch it: its owner if personal, any member if in a קופה */
const MINE_OR_MY_KUPA = "id = ? AND ((kupa_id IS NULL AND owner_email = ?) OR kupa_id IN (SELECT kupa_id FROM pr_kupa_members WHERE email = ? AND status = 'member'))";

/* ---------- the dashboard ---------- */
export async function dashboard(ctx: Ctx): Promise<Response> {
  const q = ctx.url.searchParams;
  const s = await scopeOf(ctx, q.get('scope'));
  const now = today();
  const month = isMonth(q.get('month')) && q.get('month')! <= now.slice(0, 7) ? q.get('month')! : now.slice(0, 7);
  await runRecurring(ctx, s, now);
  const [w, args] = where(s);
  const DB = ctx.env.DB;
  const [from] = monthRange(addMonths(month, -1)), [, to] = monthRange(month);
  const since90 = monthRange(addMonths(now.slice(0, 7), -3))[0];
  const [two, recent, last90, recurs, holds, learned] = await Promise.all([
    DB.prepare(`SELECT date, amount, cat FROM pr_tx WHERE ${w} AND date BETWEEN ? AND ?`).bind(...args, from, to).all<{ date: string; amount: number; cat: string }>(),
    // (in a קופה, whether a row is mine, never the others' addresses)
    DB.prepare(`SELECT id, date, amount, what, cat, recur_id, owner_email = ? AS mine FROM pr_tx WHERE ${w} AND date <= ? ORDER BY date DESC, created_at DESC LIMIT 15`).bind(s.email, ...args, to).all(),
    DB.prepare(`SELECT date, amount, what, cat, learn_key AS key FROM pr_tx WHERE ${w} AND date >= ? AND owner_email = ? AND recur_id IS NULL`).bind(...args, since90, s.email).all<{ date: string; amount: number; what: string; cat: string; key: string }>(),
    DB.prepare(`SELECT id, what, amount, cat, every, day, next_date FROM pr_recur WHERE ${w} AND active = 1 ORDER BY day`).bind(...args).all<{ amount: number; every: number }>(),
    DB.prepare(`SELECT id, symbol, name, qty, cost FROM pr_holdings WHERE ${w} ORDER BY created_at`).bind(...args).all<{ id: string; symbol: string; name: string; qty: number; cost: number }>(),
    DB.prepare('SELECT key, cat FROM pr_learn WHERE email = ? ORDER BY at DESC LIMIT 500').bind(s.email).all<{ key: string; cat: string }>(),
  ]);
  const inMonth = (m: string) => two.results.filter((t) => t.date.startsWith(m)).map((t) => ({ ...t, what: '' }));
  return json({
    month, today: now, scope: s.kupa || 'me',
    cats: CATS,
    sum: sums(inMonth(month)), prev: sums(inMonth(addMonths(month, -1))),
    recent: recent.results,
    again: frequent(last90.results),
    recur: recurs.results, recurMonthly: Math.round(recurs.results.reduce((a, r) => a + r.amount / Math.max(1, r.every), 0) * 100) / 100,
    holdings: await priced(ctx, holds.results),
    learned: Object.fromEntries(learned.results.map((r) => [r.key, r.cat])),
    kupot: await kupotOf(ctx, s.email),
  });
}

/** recurring payments that came due since the last look become payments (a fixed id per date: never twice) */
async function runRecurring(ctx: Ctx, s: Scope, now: string) {
  const [w, args] = where(s);
  const { results } = await ctx.env.DB.prepare(`SELECT * FROM pr_recur WHERE ${w} AND active = 1 AND next_date <= ?`).bind(...args, now)
    .all<{ id: string; owner_email: string; kupa_id: string | null; what: string; amount: number; cat: string; every: number; day: number; next_date: string }>();
  for (const r of results) {
    const { dates, next } = dueDates(r, now);
    if (!dates.length) continue;
    await ctx.env.DB.batch([
      ...dates.map((d) => ctx.env.DB.prepare('INSERT OR IGNORE INTO pr_tx (id, owner_email, kupa_id, date, amount, what, cat, dup_key, recur_id, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(`${r.id}:${d}`, r.owner_email, r.kupa_id, d, r.amount, r.what, r.cat, dupKey({ date: d, amount: r.amount, what: r.what }), r.id, 'recur', Date.now())),
      ctx.env.DB.prepare('UPDATE pr_recur SET next_date = ? WHERE id = ? AND next_date = ?').bind(next, r.id, r.next_date),
    ]);
  }
}

/* ---------- payments ---------- */
async function learn(ctx: Ctx, email: string, pairs: { key: string; cat: string }[]) {
  const keep = pairs.filter((p) => p.key);
  if (!keep.length) return;
  await ctx.env.DB.batch(keep.slice(0, 500).map((p) => ctx.env.DB.prepare(
    'INSERT INTO pr_learn (email, key, cat, at) VALUES (?, ?, ?, ?) ON CONFLICT(email, key) DO UPDATE SET cat = excluded.cat, at = excluded.at').bind(email, p.key, p.cat, Date.now())));
}

export async function addTx(ctx: Ctx): Promise<Response> {
  const b = await body<{ scope?: string; recur?: boolean | number }>(ctx.req);
  const s = await scopeOf(ctx, b.scope);
  let t; try { t = cleanTx(b); } catch (e) { bad(e); }
  const id = uid();
  const stmts = [ctx.env.DB.prepare('INSERT INTO pr_tx (id, owner_email, kupa_id, date, amount, what, cat, learn_key, dup_key, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, s.email, s.kupa, t!.date, t!.amount, t!.what, t!.cat, t!.key || null, dupKey(t!), 'manual', Date.now())];
  let recurId: string | null = null;
  if (b.recur) {
    // this one is the first; the next comes a month (or two) later, on the same day
    recurId = uid();
    const every = b.recur === 2 ? 2 : 1;
    const { next } = dueDates({ id: recurId, every, day: +t!.date.slice(8, 10), next_date: t!.date }, t!.date);
    stmts.push(ctx.env.DB.prepare('INSERT INTO pr_recur (id, owner_email, kupa_id, what, amount, cat, every, day, next_date, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)')
      .bind(recurId, s.email, s.kupa, t!.what, t!.amount, t!.cat, every, +t!.date.slice(8, 10), next, Date.now()));
    stmts.push(ctx.env.DB.prepare('UPDATE pr_tx SET recur_id = ? WHERE id = ?').bind(recurId, id));
  }
  await ctx.env.DB.batch(stmts);
  await learn(ctx, s.email, [{ key: t!.key, cat: t!.cat }]);
  return json({ ok: true, id, recur: recurId });
}

export async function deleteTx(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const r = await ctx.env.DB.prepare(`DELETE FROM pr_tx WHERE ${MINE_OR_MY_KUPA}`).bind(ctx.params.id, u.email, u.email).run();
  if (!r.meta.changes) throw new HttpError(404, 'not_found');
  return json({ ok: true });
}

export async function stopRecur(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const r = await ctx.env.DB.prepare(`UPDATE pr_recur SET active = 0 WHERE ${MINE_OR_MY_KUPA}`).bind(ctx.params.id, u.email, u.email).run();
  if (!r.meta.changes) throw new HttpError(404, 'not_found');
  return json({ ok: true });
}

/* ---------- importing a bank or card file (read on the page; only the reviewed rows come here) ---------- */
const MAX_ROWS = 2000;
const rowsOf = (b: { rows?: unknown }) => {
  if (!Array.isArray(b.rows) || !b.rows.length) throw new HttpError(400, 'no_rows');
  if (b.rows.length > MAX_ROWS) throw new HttpError(413, 'too_many_rows');
  return b.rows as unknown[];
};

/** which rows are already here (by date, amount and description) in this scope */
export async function importCheck(ctx: Ctx): Promise<Response> {
  const b = await body<{ scope?: string; rows?: unknown }>(ctx.req);
  const s = await scopeOf(ctx, b.scope);
  const rows = rowsOf(b);
  const keys = rows.map((r) => { try { return dupKey(cleanTx({ ...(r as object), cat: 'other' })); } catch { return null; } });
  const dates = keys.filter(Boolean).map((k) => k!.slice(0, 10)).sort();
  const have = new Set<string>();
  if (dates.length) {
    const [w, args] = where(s);
    const { results } = await ctx.env.DB.prepare(`SELECT dup_key FROM pr_tx WHERE ${w} AND date BETWEEN ? AND ?`).bind(...args, dates[0], dates[dates.length - 1]).all<{ dup_key: string }>();
    for (const r of results) have.add(r.dup_key);
  }
  return json({ dup: keys.map((k) => !!k && have.has(k)), bad: keys.map((k) => !k) });
}

export async function importSave(ctx: Ctx): Promise<Response> {
  const b = await body<{ scope?: string; rows?: unknown }>(ctx.req);
  const s = await scopeOf(ctx, b.scope);
  const clean = [];
  for (const r of rowsOf(b)) { try { clean.push(cleanTx(r)); } catch { /* a row that is not a payment is skipped */ } }
  if (!clean.length) throw new HttpError(400, 'no_rows');
  const now = Date.now();
  for (let i = 0; i < clean.length; i += 50) {
    await ctx.env.DB.batch(clean.slice(i, i + 50).map((t) => ctx.env.DB.prepare(
      'INSERT INTO pr_tx (id, owner_email, kupa_id, date, amount, what, cat, learn_key, dup_key, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(uid(), s.email, s.kupa, t.date, t.amount, t.what, t.cat, t.key || null, dupKey(t), 'import', now)));
  }
  // the categories, as the person left them, are remembered for the next file (the last word per business wins)
  const last = new Map<string, string>();
  for (const t of clean) if (t.key) last.set(t.key, t.cat);
  await learn(ctx, s.email, [...last].map(([key, cat]) => ({ key, cat })));
  return json({ ok: true, saved: clean.length, skipped: (b.rows as unknown[]).length - clean.length });
}

/* ---------- holdings: tracking only, valued with a delayed price feed ---------- */
export async function addHolding(ctx: Ctx): Promise<Response> {
  const b = await body<{ scope?: string }>(ctx.req);
  const s = await scopeOf(ctx, b.scope);
  let h; try { h = cleanHolding(b); } catch (e) { bad(e); }
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO pr_holdings (id, owner_email, kupa_id, symbol, name, qty, cost, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, s.email, s.kupa, h!.symbol, h!.name, h!.qty, h!.cost, Date.now()).run();
  return json({ ok: true, id });
}

export async function deleteHolding(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const r = await ctx.env.DB.prepare(`DELETE FROM pr_holdings WHERE ${MINE_OR_MY_KUPA}`).bind(ctx.params.id, u.email, u.email).run();
  if (!r.meta.changes) throw new HttpError(404, 'not_found');
  return json({ ok: true });
}

/** a public, delayed quote (Yahoo's chart), cached for an hour; the symbol is the only thing that leaves */
async function quote(ctx: Ctx, sym: string): Promise<{ price: number; currency: string } | null> {
  const key = `${ctx.url.origin}/__px/${encodeURIComponent(sym)}`;
  try {
    const hit = await caches.default.match(key);
    if (hit) return ((await hit.json()) as { q: { price: number; currency: string } | null }).q;
  } catch { /* no cache here */ }
  let q: { price: number; currency: string } | null = null;
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`,
      { headers: { 'user-agent': 'Mozilla/5.0 (compatible; family-app)' }, signal: AbortSignal.timeout(4000) });
    if (r.ok) q = parseQuote(await r.json());
  } catch { q = null; }
  try {
    ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify({ q }), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${q ? 3600 : 600}` } })).catch(() => {}));
  } catch { /* no cache here */ }
  return q;
}

async function priced(ctx: Ctx, holds: { id: string; symbol: string; name: string; qty: number; cost: number }[]) {
  if (!holds.length) return { items: [], value: 0, cost: 0 };
  const syms = holds.map((h) => feedSymbol(h.symbol));
  const usdils = syms.some((x) => x && !x.endsWith('.TA')) ? (await quote(ctx, 'ILS=X'))?.price ?? null : null;
  const items = await Promise.all(holds.map(async (h, i) => {
    const each = syms[i] ? inShekels(await quote(ctx, syms[i]!), usdils) : null;
    const value = each != null ? Math.round(each * h.qty * 100) / 100 : null;
    return { ...h, price: each != null ? Math.round(each * 100) / 100 : null, value, change: value != null && h.cost > 0 ? Math.round(((value - h.cost) / h.cost) * 1000) / 10 : null };
  }));
  const value = items.reduce((a, h) => a + (h.value ?? h.cost), 0), cost = items.reduce((a, h) => a + h.cost, 0);
  return { items, value: Math.round(value * 100) / 100, cost: Math.round(cost * 100) / 100 };
}

/* ---------- the shared קופה ---------- */
async function kupotOf(ctx: Ctx, email: string) {
  const { results } = await ctx.env.DB.prepare(
    `SELECT k.id, k.name, me.status, m.email, m.status AS mstatus, COALESCE(mm.he_name, mm.name, '') AS who
       FROM pr_kupa_members me JOIN pr_kupa k ON k.id = me.kupa_id
       JOIN pr_kupa_members m ON m.kupa_id = k.id LEFT JOIN members mm ON mm.email = m.email
      WHERE me.email = ? ORDER BY k.created_at`).bind(email)
    .all<{ id: string; name: string; status: string; email: string; mstatus: string; who: string }>();
  const by = new Map<string, { id: string; name: string; status: string; members: { name: string; me: boolean; invited: boolean }[] }>();
  for (const r of results) {
    const k = by.get(r.id) || { id: r.id, name: r.name, status: r.status, members: [] };
    // the other members' names only (never their addresses)
    k.members.push({ name: r.who || '?', me: r.email === email, invited: r.mstatus !== 'member' });
    by.set(r.id, k);
  }
  return [...by.values()];
}

/** a person of the same household (the קופה is for the house, by invitation); null when not */
async function householdMate(ctx: Ctx, email: unknown) {
  const u = requireUser(ctx);
  const e = line(email, 200).toLowerCase();
  if (!e || e === u.email) return null;
  return ctx.env.DB.prepare('SELECT email FROM members WHERE email = ? AND household = ?').bind(e, u.household).first<{ email: string }>();
}

/** the household's people one may invite (names, and the address to invite by) */
export async function kupaPeople(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT email, COALESCE(he_name, name, email) AS name FROM members WHERE household = ? AND email != ? ORDER BY name')
    .bind(u.household, u.email).all();
  return json({ people: results });
}

export async function kupaOpen(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const b = await body<{ name?: string; invite?: string }>(ctx.req);
  const mate = b.invite ? await householdMate(ctx, b.invite) : null;
  if (b.invite && !mate) throw new HttpError(400, 'not_household');
  const id = uid(), now = Date.now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO pr_kupa (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').bind(id, kupaName(b.name), u.email, now),
    ctx.env.DB.prepare("INSERT INTO pr_kupa_members (kupa_id, email, status, invited_by, at) VALUES (?, ?, 'member', NULL, ?)").bind(id, u.email, now),
    ...(mate ? [ctx.env.DB.prepare("INSERT INTO pr_kupa_members (kupa_id, email, status, invited_by, at) VALUES (?, ?, 'invited', ?, ?)").bind(id, mate.email, u.email, now)] : []),
  ]);
  return json({ ok: true, id });
}

export async function kupaInvite(ctx: Ctx): Promise<Response> {
  const s = await scopeOf(ctx, ctx.params.id);   // only a member invites
  if (!s.kupa) throw new HttpError(404, 'not_found');   // "me" is no קופה to invite into
  const b = await body<{ email?: string }>(ctx.req);
  const mate = await householdMate(ctx, b.email);
  if (!mate) throw new HttpError(400, 'not_household');
  await ctx.env.DB.prepare("INSERT OR IGNORE INTO pr_kupa_members (kupa_id, email, status, invited_by, at) VALUES (?, ?, 'invited', ?, ?)")
    .bind(s.kupa, mate.email, s.email, Date.now()).run();
  return json({ ok: true });
}

export async function kupaAccept(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const r = await ctx.env.DB.prepare("UPDATE pr_kupa_members SET status = 'member', at = ? WHERE kupa_id = ? AND email = ? AND status = 'invited'")
    .bind(Date.now(), ctx.params.id, u.email).run();
  if (!r.meta.changes) throw new HttpError(404, 'not_found');
  return json({ ok: true });
}

/** leave a קופה (or decline its invitation). What one put in it stays in it, for the others; the last to leave closes it. */
export async function kupaLeave(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const r = await ctx.env.DB.prepare('DELETE FROM pr_kupa_members WHERE kupa_id = ? AND email = ?').bind(ctx.params.id, u.email).run();
  if (!r.meta.changes) throw new HttpError(404, 'not_found');
  const left = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM pr_kupa_members WHERE kupa_id = ? AND status = 'member'").bind(ctx.params.id).first<{ n: number }>();
  if (!left?.n) {
    const id = ctx.params.id;
    await ctx.env.DB.batch(['pr_tx', 'pr_recur', 'pr_holdings'].map((t) => ctx.env.DB.prepare(`DELETE FROM ${t} WHERE kupa_id = ?`).bind(id))
      .concat([ctx.env.DB.prepare('DELETE FROM pr_kupa_members WHERE kupa_id = ?').bind(id), ctx.env.DB.prepare('DELETE FROM pr_kupa WHERE id = ?').bind(id)]));
  }
  return json({ ok: true });
}

/* ---------- tips from Claude (Claude only: the decision's rule; no Gemini, no fallback) ---------- */
const Tips = z.object({ tips: z.array(z.string()).max(3) });
const TIPS_SYSTEM = `You help a family in Israel look at its household spending. You get one month's sums by category
(and last month's), never single payments. Write up to three short, practical tips in Hebrew (one or two sentences each,
plain words, plural address "אתם"), about where the money goes, what changed from last month, fixed charges, and saving.
General guidance only: never personal investment, tax or legal advice, never name a product, bank or company to buy.
If the month has barely begun or there is too little to say, give fewer tips. Amounts in ₪, rounded.`;

export async function tips(ctx: Ctx): Promise<Response> {
  const b = await body<{ scope?: string; month?: string }>(ctx.req);
  const s = await scopeOf(ctx, b.scope);
  if (!ctx.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'ai_not_configured');
  const now = today();
  const month = isMonth(b.month) && b.month <= now.slice(0, 7) ? b.month : now.slice(0, 7);
  const [w, args] = where(s);
  const [from] = monthRange(addMonths(month, -1)), [, to] = monthRange(month);
  const [{ results }, rec] = await Promise.all([
    ctx.env.DB.prepare(`SELECT date, amount, cat FROM pr_tx WHERE ${w} AND date BETWEEN ? AND ?`).bind(...args, from, to).all<{ date: string; amount: number; cat: string }>(),
    ctx.env.DB.prepare(`SELECT amount, every FROM pr_recur WHERE ${w} AND active = 1`).bind(...args).all<{ amount: number; every: number }>(),
  ]);
  const of = (m: string) => results.filter((t) => t.date.startsWith(m)).map((t) => ({ ...t, what: '' }));
  const recurMonthly = -rec.results.reduce((a, r) => a + r.amount / Math.max(1, r.every), 0);
  const summary = aiSummary(month, sums(of(month)), sums(of(addMonths(month, -1))), recurMonthly, month === now.slice(0, 7) ? +now.slice(8, 10) : 31);
  if (!summary.spent && !summary.income) return json({ tips: [] });

  // the same sums give the same tips: kept a day under a hash of the sums (never the sums themselves in the key)
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(summary))))].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
  const key = `${ctx.url.origin}/__prtips/${hash}`;
  try { const hit = await caches.default.match(key); if (hit) return json(await hit.json()); } catch { /* no cache here */ }

  const client = new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY, maxRetries: 1, ...(ctx.env.DEV_MODE === '1' && ctx.env.ANTHROPIC_BASE_URL ? { baseURL: ctx.env.ANTHROPIC_BASE_URL } : {}) });
  let out: z.infer<typeof Tips>;
  try {
    const res = await client.beta.messages.parse({
      model: 'claude-sonnet-5-5',
      max_tokens: 1500,
      system: TIPS_SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(summary) }],
      output_config: { effort: 'low', format: betaZodOutputFormat(Tips) },
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) throw new HttpError(502, 'ai_bad_output');
    out = res.parsed_output;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'ai_busy');
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'claude_key_invalid');
    throw new HttpError(502, 'ai_failed');   // (no message: nothing of the request goes to the logs)
  }
  const result = { tips: out.tips.map((t) => line(t, 300)).filter(Boolean).slice(0, 3) };
  try { ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } })).catch(() => {})); } catch { /* no cache */ }
  return json(result);
}
