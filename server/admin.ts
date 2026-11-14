// The owner's room (/admin/) – the owner's own easter egg, the back door to the app's settings and the fun things.
//
// Entering it (from any device): the person signed in on the device (anyone) asks, and the owner proves who they are
// with their own biometric – a passkey (Windows Hello, a fingerprint, a face; on someone else's device the browser
// offers the owner's phone through a QR code). The entry is bound to this device's session, for a quarter of an hour
// from the last action and two hours at most.
//   * opened from the owner's own account: everything – the dashboard, money, settings, members, messages, features,
//     and who else may enter (הרשאת-על, a "super" with their own passkey: everything but naming supers).
//   * opened from someone else's account: only what fits a visit – this user's special features and how the app is
//     doing; no money, settings, members or messages to all on a device that is not the owner's.
// The lock (the owner's rule): three idle minutes close it on any device (the page warns after 30 seconds and shows an
// open/locked lock that closes it at once); two hours at most, half an hour on someone else's. "Stay unlocked", for a
// working session from the owner's own account only, lifts the idle limit but not the maximum.
// Who is "the owner": the emails in OWNER_EMAIL (never written in the code). Every action is written to admin_audit.

import { Ctx, Env, HttpError, Member, body, getCookie, json, requireUser, uid } from './core';
import { newChallenge, rateLimit, takeChallenge, trashList, trashRestore } from './vault';
import { verifyAssertion } from './vault/webauthn';
import { costOf, UsageRow } from './prices';
import { saveSetting, settingsNow } from './settings';
import * as R from './admin-rules';
import { allowanceOf, balance, setLimited } from './credits';
import * as C from './credits-rules';
import { TOOLS } from './discover-logic';
import { addReport } from './reports';
import { cleanReport } from './reports-rules';

const rpId = (ctx: Ctx) => ctx.url.hostname;
const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sidHash = async (ctx: Ctx) => {
  const sid = getCookie(ctx.req, 'sid');
  if (!sid) throw new HttpError(401, 'sign_in');
  return b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('admin-sid:' + sid)));
};
/** the owners (OWNER_EMAIL), and the supers they named */
export const owners = (env: Env) => new Set((env.OWNER_EMAIL || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean));
async function supers(env: Env): Promise<Set<string>> {
  const { results } = await env.DB.prepare('SELECT email FROM admin_supers').all<{ email: string }>();
  return new Set(results.map((r) => r.email));
}
async function mayEnter(env: Env) { return new Set([...owners(env), ...(await supers(env))]); }

interface Entry { sid_hash: string; by_email: string; as_email: string; created_at: number; last_at: number; stay: number | null }
export interface Admin { by: string; as: string; own: boolean; level: 'owner' | 'super'; stay: boolean; created: number; sid: string }
export async function log(ctx: Ctx, a: Admin, action: string, detail = '') {
  ctx.waitUntil(ctx.env.DB.prepare('INSERT INTO admin_audit (at, by_email, as_email, action, detail) VALUES (?, ?, ?, ?, ?)').bind(Date.now(), a.by, a.as, action, detail.slice(0, 300)).run().then(() => {}));
}

/** the room is open on this device's session; `own`: only when opened from the opener's own account */
export async function requireAdmin(ctx: Ctx, need: 'own' | 'any' = 'own'): Promise<Admin> {
  const u = requireUser(ctx);
  const e = await ctx.env.DB.prepare('SELECT * FROM admin_entries WHERE sid_hash = ?').bind(await sidHash(ctx)).first<Entry>();
  if (!e || !R.entryAlive(e) || e.as_email !== u.email) throw new HttpError(403, 'admin_locked');
  const level = owners(ctx.env).has(e.by_email) ? 'owner' : (await supers(ctx.env)).has(e.by_email) ? 'super' : null;
  if (!level) throw new HttpError(403, 'admin_locked');                // a super whose permission was taken away
  const a: Admin = { by: e.by_email, as: e.as_email, own: e.by_email === e.as_email, level, stay: !!e.stay && e.by_email === e.as_email, created: e.created_at, sid: e.sid_hash };
  if (need === 'own' && !a.own) throw new HttpError(403, 'own_account_only');
  await ctx.env.DB.prepare('UPDATE admin_entries SET last_at = ? WHERE sid_hash = ?').bind(Date.now(), e.sid_hash).run();
  return a;
}

/* ---------------- entering, with the owner's biometric ---------------- */

/** POST /api/admin/enter/options: a challenge for the passkeys of whoever may enter */
export async function enterOptions(ctx: Ctx) {
  requireUser(ctx);
  const sh = await sidHash(ctx);
  await rateLimit(ctx, 'admin-enter:' + sh, 20, 3600e3);
  const who = [...(await mayEnter(ctx.env))];
  const { results } = who.length
    ? await ctx.env.DB.prepare(`SELECT id FROM passkeys WHERE email IN (${who.map(() => '?').join(', ')})`).bind(...who).all<{ id: string }>()
    : { results: [] as { id: string }[] };
  if (!results.length) throw new HttpError(409, 'no_passkey');
  const { id, c } = await newChallenge(ctx, 'admin:' + sh, 'admin');
  return json({ challengeId: id, publicKey: { challenge: c, rpId: rpId(ctx), userVerification: 'required', timeout: 120000, allowCredentials: results.map((r) => ({ type: 'public-key', id: r.id })) } });
}
/** POST /api/admin/enter {challengeId, id, response}: the biometric's answer; the room opens on this session */
export async function enter(ctx: Ctx) {
  const u = requireUser(ctx);
  const sh = await sidHash(ctx);
  await rateLimit(ctx, 'admin-enter-try:' + sh, 10, 15 * 60e3);
  const b = await body<{ challengeId: string; id: string; response: { clientDataJSON: string; authenticatorData: string; signature: string } }>(ctx.req);
  const c = await takeChallenge(ctx, b.challengeId, 'admin:' + sh, 'admin');
  const row = await ctx.env.DB.prepare('SELECT email, alg, jwk, sign_count FROM passkeys WHERE id = ?').bind(b.id).first<{ email: string; alg: number; jwk: string; sign_count: number }>();
  if (!row || !(await mayEnter(ctx.env)).has(row.email)) throw new HttpError(401, 'passkey_unknown');
  const count = await verifyAssertion(b.response, { alg: row.alg, jwk: JSON.parse(row.jwk), signCount: row.sign_count }, c, ctx.url.origin, rpId(ctx));
  const now = Date.now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE passkeys SET sign_count = ?, last_used = ? WHERE id = ?').bind(count, now, b.id),
    ctx.env.DB.prepare('DELETE FROM admin_entries WHERE last_at < ?').bind(now - R.MAX),
    ctx.env.DB.prepare('INSERT INTO admin_entries (sid_hash, by_email, as_email, created_at, last_at, stay) VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT(sid_hash) DO UPDATE SET by_email = excluded.by_email, as_email = excluded.as_email, created_at = excluded.created_at, last_at = excluded.last_at, stay = 0')
      .bind(sh, row.email, u.email, now, now),
  ]);
  const a: Admin = { by: row.email, as: u.email, own: row.email === u.email, level: owners(ctx.env).has(row.email) ? 'owner' : 'super', stay: false, created: now, sid: sh };
  await log(ctx, a, 'enter', a.own ? '' : 'from another account');
  return json({ ok: true, own: a.own });
}
/** GET /api/admin/status: is the room open here, and for whom */
export async function status(ctx: Ctx) {
  const u = requireUser(ctx);
  try {
    const a = await requireAdmin(ctx, 'any');
    const n = await ctx.env.DB.prepare('SELECT he_name, name FROM members WHERE email = ?').bind(a.as).first<{ he_name: string | null; name: string | null }>();
    return json({ open: true, own: a.own, level: a.level, as: { email: a.as, name: n?.he_name || n?.name || a.as.split('@')[0] }, main: owners(ctx.env).has(a.by),
      stay: a.stay, idle: R.IDLE, warn: R.WARN, ends: a.created + (a.own ? R.MAX : R.VISIT_MAX) });
  } catch {
    return json({ open: false, member: u.email });
  }
}
/** POST /api/admin/ping – the page says the owner is still there (any action), so the three idle minutes start again */
export async function ping(ctx: Ctx) {
  await requireAdmin(ctx, 'any');
  return json({ ok: true });
}
/** POST /api/admin/stay {on} – "stay unlocked" for a working session: no idle limit (two hours at most); own account only */
export async function stay(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  const on = !!(await body<{ on?: boolean }>(ctx.req)).on;
  await ctx.env.DB.prepare('UPDATE admin_entries SET stay = ? WHERE sid_hash = ?').bind(on ? 1 : 0, a.sid).run();
  await log(ctx, a, on ? 'stay:on' : 'stay:off');
  return json({ ok: true, stay: on });
}
/** GET /api/admin/room – for the back door's tab on the other pages (/assets/admin-tab.js): is the room still open on this
    device's session, and until when if nothing more is done in it. It only reads: it is not an action (the idle minutes go
    on, unlike /status and /ping), and it says nothing of who opened it or what is inside. */
export async function room(ctx: Ctx) {
  const u = requireUser(ctx);
  const e = await ctx.env.DB.prepare('SELECT * FROM admin_entries WHERE sid_hash = ?').bind(await sidHash(ctx)).first<Entry>();
  if (!e || !R.entryAlive(e) || e.as_email !== u.email || !(await mayEnter(ctx.env)).has(e.by_email)) return json({ open: false });
  const until = R.entryUntil(e);
  return json({ open: true, until, left: until - Date.now() });     // left: by the server's clock, for the tab's timer
}
/** POST /api/admin/leave – נעילה: the entry ends on the server, so the next one needs the passkey again */
export async function leave(ctx: Ctx) {
  requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM admin_entries WHERE sid_hash = ?').bind(await sidHash(ctx)).run();
  return json({ ok: true });
}

/* ---------------- the dashboard ---------------- */

const count = async (env: Env, sql: string, ...args: unknown[]) => ((await env.DB.prepare(sql).bind(...args).first<{ n: number }>())?.n || 0);
async function aiByMonth(env: Env) {
  const { results } = await env.DB.prepare('SELECT at, model, provider, input, output, cache_write, cache_read, searches, grounded, audio_out, image_out FROM ai_usage WHERE COALESCE(own_key, 0) = 0 ORDER BY at LIMIT 500000').all<UsageRow & { at: number }>();
  const by: Record<string, number> = {};
  let calls = 0, today = 0;
  const day = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
  for (const r of results) {
    const c = costOf(r) ?? 0, d = new Date(r.at + 2 * 3600e3).toISOString().slice(0, 10);   // (a model without a price: not counted)
    by[d.slice(0, 7)] = (by[d.slice(0, 7)] || 0) + c; calls++;
    if (d === day) today += c;
  }
  return { by, calls, today };
}

/** GET /api/admin/overview – how the app is doing; money too when opened from the owner's own account */
export async function overview(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'any');
  const env = ctx.env, week = Date.now() - 7 * 864e5;
  const [members, households, people, files, bytes, gatherings, answers, feeds, ai, settings] = await Promise.all([
    count(env, 'SELECT COUNT(*) AS n FROM members'),
    count(env, 'SELECT COUNT(DISTINCT household) AS n FROM members'),
    count(env, 'SELECT COUNT(*) AS n FROM family_people WHERE deleted_at IS NULL'),
    count(env, 'SELECT COUNT(*) AS n FROM vault_items WHERE deleted_at IS NULL'),
    count(env, 'SELECT COALESCE(SUM(size), 0) AS n FROM vault_items WHERE deleted_at IS NULL'),
    count(env, 'SELECT COUNT(*) AS n FROM gatherings'),
    count(env, 'SELECT COUNT(*) AS n FROM gathering_rsvps'),
    count(env, 'SELECT COUNT(*) AS n FROM calendar_feeds'),
    aiByMonth(env),
    settingsNow(env),
  ]);
  const active = await count(env, 'SELECT COUNT(DISTINCT email) AS n FROM sessions WHERE created_at >= ?', week).catch(() => 0);
  const stats = { members, households, people, files, bytes, gatherings, answers, feeds, active };
  const month = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 7);
  const budget = Number(settings.find((s) => s.key === 'ai.monthly_budget_usd')?.value || 0);
  const alerts: string[] = [];
  if (budget > 0 && (ai.by[month] || 0) > budget) alerts.push(`ה־AI עלה החודש $${(ai.by[month] || 0).toFixed(2)}, מעל התקציב ($${budget}).`);
  const out: Record<string, unknown> = { stats, alerts, ai: { month: ai.by[month] || 0, today: ai.today, calls: ai.calls, total: Object.values(ai.by).reduce((s, x) => s + x, 0) } };
  if (a.own) {
    const rate = Number(settings.find((s) => s.key === 'money.usd_ils')?.value || 3.7);
    const { results } = await env.DB.prepare('SELECT * FROM admin_ledger ORDER BY date').all<Omit<R.Entry, 'monthly'> & { id: string; monthly: number }>();
    const entries = results.map((e) => ({ ...e, monthly: !!e.monthly }));
    out.money = { rate, ...R.money(entries, ai.by, rate, new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10)), entries };
  }
  return json(out);
}

/* ---------------- money: income and expenses entered by hand (the AI comes from the meter) ---------------- */

export async function ledgerAdd(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  let e: R.Entry;
  try { e = R.cleanEntry(await body<Record<string, unknown>>(ctx.req)); } catch (err) { throw new HttpError(400, (err as Error).message); }
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO admin_ledger (id, kind, title, amount, currency, date, monthly, until, by_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, e.kind, e.title, e.amount, e.currency, e.date, e.monthly ? 1 : 0, e.until, a.by, Date.now()).run();
  await log(ctx, a, 'ledger:add', `${e.kind} ${e.title} ${e.amount} ${e.currency}`);
  return json({ id });
}
export async function ledgerSave(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  let e: R.Entry;
  try { e = R.cleanEntry(await body<Record<string, unknown>>(ctx.req)); } catch (err) { throw new HttpError(400, (err as Error).message); }
  await ctx.env.DB.prepare('UPDATE admin_ledger SET kind = ?, title = ?, amount = ?, currency = ?, date = ?, monthly = ?, until = ? WHERE id = ?')
    .bind(e.kind, e.title, e.amount, e.currency, e.date, e.monthly ? 1 : 0, e.until, ctx.params.id).run();
  await log(ctx, a, 'ledger:edit', e.title);
  return json({ ok: true });
}
export async function ledgerDelete(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  await ctx.env.DB.prepare('DELETE FROM admin_ledger WHERE id = ?').bind(ctx.params.id).run();
  await log(ctx, a, 'ledger:delete', ctx.params.id);
  return json({ ok: true });
}

/* ---------------- settings ---------------- */

export async function settingsList(ctx: Ctx) {
  await requireAdmin(ctx, 'own');
  return json({ settings: await settingsNow(ctx.env) });
}
export async function settingsSave(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  const b = await body<{ key?: string; value?: unknown }>(ctx.req);
  const err = await saveSetting(ctx.env, String(b.key || ''), b.value, a.by);
  if (err) throw new HttpError(400, err);
  await log(ctx, a, 'setting', `${b.key} = ${JSON.stringify(b.value)}`);
  return json({ ok: true });
}

/* ---------------- הרשאת-על: who else may enter the room (only the owners name them) ---------------- */

export async function supersList(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  const { results } = await ctx.env.DB.prepare('SELECT s.email, s.created_at, m.he_name, m.name, (SELECT COUNT(*) FROM passkeys p WHERE p.email = s.email) AS keys FROM admin_supers s LEFT JOIN members m ON m.email = s.email ORDER BY s.created_at').all();
  return json({ supers: results, mayName: a.level === 'owner' });
}
export async function supersSave(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  if (a.level !== 'owner') throw new HttpError(403, 'owner_only');
  const b = await body<{ email?: string; on?: boolean }>(ctx.req);
  const email = String(b.email || '').trim().toLowerCase();
  if (!(await ctx.env.DB.prepare('SELECT 1 FROM members WHERE email = ?').bind(email).first())) throw new HttpError(404, 'not_member');
  if (owners(ctx.env).has(email)) throw new HttpError(400, 'already_owner');
  if (b.on) await ctx.env.DB.prepare('INSERT OR IGNORE INTO admin_supers (email, by_email, created_at) VALUES (?, ?, ?)').bind(email, a.by, Date.now()).run();
  else {
    await ctx.env.DB.prepare('DELETE FROM admin_supers WHERE email = ?').bind(email).run();
    await ctx.env.DB.prepare('DELETE FROM admin_entries WHERE by_email = ?').bind(email).run();      // their open entries close now
  }
  await log(ctx, a, b.on ? 'super:add' : 'super:remove', email);
  return json({ ok: true });
}

/* ---------------- messages to everyone, or to one member ---------------- */

const LEVELS = new Set(['info', 'warn', 'party']);
export async function messagesList(ctx: Ctx) {
  await requireAdmin(ctx, 'own');
  // to everyone, and to one member (sent from here or a gift's note); the room's own notes to the owner (by 'system') stay out
  const { results } = await ctx.env.DB.prepare(`SELECT m.*, (SELECT COUNT(*) FROM message_reads r WHERE r.message = m.id) AS seen,
      (SELECT COALESCE(p.he_name, p.name) FROM members p WHERE p.email = m.to_email) AS to_name
    FROM admin_messages m WHERE m.to_email IS NULL OR m.by_email <> 'system' ORDER BY m.created_at DESC LIMIT 50`).all();
  return json({ messages: results, members: await count(ctx.env, 'SELECT COUNT(*) AS n FROM members') });
}
export async function messageSend(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');            // never from someone else's device: a message to all goes out in the owner's name
  const b = await body<{ text?: string; level?: string; link?: string; days?: number; to?: string; keep?: boolean }>(ctx.req);
  const text = String(b.text || '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, 500);
  if (!text) throw new HttpError(400, 'text_required');
  let link = String(b.link || '').trim();
  if (link && !/^\/[^/]/.test(link) && !/^https:\/\//.test(link)) link = '';             // a page of the app, or an https link
  const days = Math.max(1, Math.min(60, Math.round(Number(b.days) || 7)));
  // to one member (the owner, 2026-11-13): only an address on the members list; empty: to everyone
  let to: string | null = null;
  if (b.to !== undefined && b.to !== null && String(b.to).trim()) {
    to = String(b.to).trim().toLowerCase().slice(0, 200);
    if (!(await ctx.env.DB.prepare('SELECT 1 FROM members WHERE email = ?').bind(to).first())) throw new HttpError(400, 'not_member');
  }
  const id = uid(), now = Date.now();
  // keep (the owner, 2026-11-14): a message to everyone also stays in each member's inbox (the מהאוהל tab, server/inbox.ts)
  const keep = !to && b.keep === true ? 1 : null;
  await ctx.env.DB.prepare('INSERT INTO admin_messages (id, text, level, link, by_email, created_at, ends_at, active, to_email, keep) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
    .bind(id, text, LEVELS.has(String(b.level)) ? b.level : 'info', link.slice(0, 300) || null, a.by, now, now + days * 864e5, to, keep).run();
  await log(ctx, a, to ? 'message:one' : 'message', (to ? to + ': ' : '') + text.slice(0, 80));
  return json({ id });
}
export async function messageStop(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  await ctx.env.DB.prepare('UPDATE admin_messages SET active = 0 WHERE id = ?').bind(ctx.params.id).run();
  await log(ctx, a, 'message:stop', ctx.params.id);
  return json({ ok: true });
}
/** GET /api/messages – for everyone signed in: what the owner sent and they have not closed yet */
export async function messagesForMe(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare(`SELECT id, text, level, link, created_at FROM admin_messages m WHERE active = 1 AND ends_at > ? AND (m.to_email IS NULL OR m.to_email = ?)
    AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.message = m.id AND r.email = ?) ORDER BY created_at DESC LIMIT 3`).bind(Date.now(), u.email, u.email).all();
  return json({ messages: results });
}
export async function messageRead(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('INSERT OR IGNORE INTO message_reads (message, email, at) VALUES (?, ?, ?)').bind(ctx.params.id, u.email, Date.now()).run();
  return json({ ok: true });
}

/* ---------------- the family's feedback: into the owner's inbox (the family batch: a button, and through the companion) ---------------- */

/** keep one piece of feedback (any member, from a button or from the companion); no alert, the owner reads the inbox */
export async function addFeedback(ctx: Ctx, u: Member, text: string, page: string, via: 'button' | 'companion') {
  // since the reports inbox (server/reports.ts) feedback is a report too: one inbox for the team, one answer path to the person
  const input = cleanReport({ text, path: page.startsWith('/') ? page : '/', title: via === 'companion' ? 'דרך העוזר' : '' });
  return addReport(ctx, u, input, via);
}
/** POST /api/feedback {text, page} */
export async function feedbackSend(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ text?: string; page?: string }>(ctx.req);
  return json({ id: await addFeedback(ctx, u, b.text || '', b.page || '', 'button') });
}
/** GET /api/admin/feedback – the inbox, the newest first (the owner's own account only) */
export async function feedbackList(ctx: Ctx) {
  await requireAdmin(ctx, 'own');
  const { results } = await ctx.env.DB.prepare('SELECT id, name, email, text, page, via, at, read_at, done FROM feedback ORDER BY done, at DESC LIMIT 200').all();
  return json({ feedback: results, unread: results.filter((f: any) => !f.read_at).length });
}
/** PUT /api/admin/feedback/:id {read?, done?} */
export async function feedbackSave(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  const b = await body<{ read?: boolean; done?: boolean }>(ctx.req);
  if (b.read !== undefined) await ctx.env.DB.prepare('UPDATE feedback SET read_at = ? WHERE id = ?').bind(b.read ? Date.now() : null, ctx.params.id).run();
  if (b.done !== undefined) await ctx.env.DB.prepare('UPDATE feedback SET done = ? WHERE id = ?').bind(b.done ? 1 : 0, ctx.params.id).run();
  await log(ctx, a, 'feedback', ctx.params.id);
  return json({ ok: true });
}

/* ---------------- usage: who comes in, and which tools (tool_visits; never what is in them) ---------------- */

/** GET /api/admin/usage → { people: [{ name, last, tools, visits, top }], tools: [{ tool, people, visits, last }], week } */
export async function usage(ctx: Ctx) {
  await requireAdmin(ctx, 'own');
  const week = Date.now() - 7 * 864e5;
  const [people, tools] = await Promise.all([
    ctx.env.DB.prepare(`SELECT m.email, COALESCE(m.he_name, m.name) AS name, MAX(v.last_at) AS last, COUNT(v.tool) AS tools, COALESCE(SUM(v.n), 0) AS visits,
        SUM(CASE WHEN v.last_at > ? THEN 1 ELSE 0 END) AS week
      FROM members m LEFT JOIN tool_visits v ON v.email = m.email GROUP BY m.email ORDER BY last DESC NULLS LAST`).bind(week).all(),
    ctx.env.DB.prepare(`SELECT tool, COUNT(*) AS people, SUM(n) AS visits, MAX(last_at) AS last, SUM(CASE WHEN last_at > ? THEN 1 ELSE 0 END) AS week
      FROM tool_visits GROUP BY tool ORDER BY people DESC, visits DESC`).bind(week).all(),
  ]);
  const names = new Map(TOOLS.map((t) => [t.id, t.name]));
  return json({ people: people.results, tools: tools.results.map((t: any) => ({ ...t, name: names.get(t.tool) || t.tool })), total: TOOLS.length });
}

/* ---------------- special features for a person (the owner adds the features themselves later) ---------------- */

export const FEATURES: { key: string; label: string; help: string }[] = [
  { key: 'early', label: 'גישה מוקדמת', help: 'רואה תכונות חדשות לפני כולם (כשיהיו).' },
];
const FEATURE_KEYS = new Set(FEATURES.map((f) => f.key));
/** does this person have this special feature? (for any module) */
export async function hasFeature(env: Env, email: string, key: string) {
  return !!(await env.DB.prepare('SELECT 1 FROM user_features WHERE email = ? AND feature = ?').bind(email, key).first());
}
/** GET /api/admin/features?email= – from the owner's own account, anyone's; from someone else's, only that person's */
export async function featuresList(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'any');
  const email = a.own ? String(ctx.url.searchParams.get('email') || a.as).toLowerCase() : a.as;
  const { results } = await ctx.env.DB.prepare('SELECT feature, created_at FROM user_features WHERE email = ?').bind(email).all<{ feature: string; created_at: number }>();
  const on = new Set(results.map((r) => r.feature));
  return json({ email, features: FEATURES.map((f) => ({ ...f, on: on.has(f.key) })) });
}
export async function featuresSave(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'any');
  const b = await body<{ email?: string; feature?: string; on?: boolean }>(ctx.req);
  const email = a.own ? String(b.email || a.as).toLowerCase() : a.as;
  if (!FEATURE_KEYS.has(String(b.feature))) throw new HttpError(400, 'unknown_feature');
  if (b.on) await ctx.env.DB.prepare('INSERT OR IGNORE INTO user_features (email, feature, by_email, created_at) VALUES (?, ?, ?, ?)').bind(email, b.feature, a.by, Date.now()).run();
  else await ctx.env.DB.prepare('DELETE FROM user_features WHERE email = ? AND feature = ?').bind(email, b.feature).run();
  await log(ctx, a, b.on ? 'feature:on' : 'feature:off', `${email} ${b.feature}`);
  return json({ ok: true });
}
/** GET /api/me/features – a person's own special features, for the pages */
export async function myFeatures(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT feature FROM user_features WHERE email = ?').bind(u.email).all<{ feature: string }>();
  return json({ features: results.map((r) => r.feature) });
}

/* ---------------- the room's own log ---------------- */

export async function auditList(ctx: Ctx) {
  await requireAdmin(ctx, 'own');
  const { results } = await ctx.env.DB.prepare('SELECT at, by_email, as_email, action, detail FROM admin_audit ORDER BY at DESC LIMIT 100').all();
  return json({ log: results });
}

/** for other modules: is this member one of the owners (OWNER_EMAIL)? */
export const isMainOwner = (env: Env, m: Member) => owners(env).has(m.email);

/* ---------------- the AI allowance of each member (server/credits.ts) ---------------- */

/** GET /api/admin/allowances – each member: family (no limit), or limited with what is left */
export async function allowances(ctx: Ctx) {
  await requireAdmin(ctx, 'own');
  const { results } = await ctx.env.DB.prepare('SELECT email FROM members ORDER BY email').all<{ email: string }>();
  const rate = Number((await settingsNow(ctx.env)).find((s) => s.key === 'money.usd_ils')?.value || 3.7);
  const out: Record<string, { limited: boolean; left_ils?: number; spent_ils?: number }> = {};
  for (const m of results) {
    const a = await allowanceOf(ctx.env, m.email) as { limited: boolean; total?: number; spent?: number };
    out[m.email] = a.limited ? { limited: true, left_ils: Math.round((a.total || 0) * rate * 100) / 100, spent_ils: Math.round((a.spent || 0) * rate * 100) / 100 } : { limited: false };
  }
  return json({ allowances: out });
}
/** PUT /api/admin/allowances {email, limited} – mark someone family (no limit) or limited */
export async function allowanceSave(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  const b = await body<{ email?: string; limited?: boolean }>(ctx.req);
  const email = String(b.email || '').toLowerCase();
  if (!(await ctx.env.DB.prepare('SELECT 1 FROM members WHERE email = ?').bind(email).first())) throw new HttpError(404, 'not_member');
  if (owners(ctx.env).has(email) && b.limited) throw new HttpError(400, 'already_owner');
  await setLimited(ctx.env, email, !!b.limited, a.by);
  await log(ctx, a, b.limited ? 'ai:limited' : 'ai:family', email);
  return json({ ok: true });
}

/* ---------------- credit gifts (the owner only, from the owner's own account) ---------------- */
// A gift is a grant of the source "gift" (ai_credits): shekels of real AI cost, spent before any other credit, never
// expiring, never refunded or moved. Above ₪20 the room asks again (confirm: true). The recipient gets a note – only a
// buyer or a gift's recipient ever sees amounts (credits-rules.showsAmounts), and a recipient is one by now.

const monthStart = () => { const d = new Date(Date.now() + 2 * 3600e3); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 2 * 3600e3; };

/** POST /api/admin/gifts {email, ils, note, confirm} */
export async function giftAdd(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  if (a.level !== 'owner') throw new HttpError(403, 'owner_only');
  const b = await body<{ email?: string; ils?: unknown; note?: string; confirm?: unknown }>(ctx.req);
  const email = String(b.email || '').trim().toLowerCase();
  const m = await ctx.env.DB.prepare('SELECT he_name, name FROM members WHERE email = ?').bind(email).first<{ he_name: string | null; name: string | null }>();
  if (!m) throw new HttpError(404, 'not_member');
  const ils = C.giftIls(b.ils);
  if (ils === null) throw new HttpError(400, 'bad_amount');
  if (C.needsConfirm(ils, b.confirm)) return json({ confirm: true, ils }, 409);        // the room asks again
  const rate = Number((await settingsNow(ctx.env)).find((s) => s.key === 'money.usd_ils')?.value || 3.7);
  const note = String(b.note || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
  const now = Date.now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO ai_credits (id, email, source, usd, note, by_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(uid(), email, 'gift', C.ilsToUsd(ils, rate), note || null, a.by, now),
    // the recipient's note, for them alone, for a month
    ctx.env.DB.prepare('INSERT INTO admin_messages (id, text, level, link, by_email, created_at, ends_at, active, to_email) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
      .bind(uid(), `🎁 קיבלת מתנה מהאוהל: קרדיט בשווי ₪${ils} לעוזר החכם.${note ? ' ' + note : ''}`, 'party', '/settings/#services', a.by, now, now + 30 * 864e5, email),
  ]);
  await log(ctx, a, 'gift', `${email} ₪${ils}`);
  return json({ ok: true, ils });
}

/** GET /api/admin/gifts – this month's gifts, what they come to, and how much of each person's gifts was really used */
export async function gifts(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  if (a.level !== 'owner') throw new HttpError(403, 'owner_only');
  const rate = Number((await settingsNow(ctx.env)).find((s) => s.key === 'money.usd_ils')?.value || 3.7);
  const since = monthStart();
  const { results } = await ctx.env.DB.prepare(`SELECT c.email, c.usd, c.note, c.by_email, c.created_at, m.he_name, m.name FROM ai_credits c LEFT JOIN members m ON m.email = c.email
    WHERE c.source = 'gift' AND c.created_at >= ? ORDER BY c.created_at DESC`).bind(since).all<{ email: string; usd: number; note: string | null; by_email: string; created_at: number; he_name: string | null; name: string | null }>();
  const ils = (usd: number) => Math.round(usd * rate * 100) / 100;
  // per recipient: all their gifts, and what of them was spent (gifts go first), as the meter measured it
  const used: Record<string, number> = {};
  for (const email of [...new Set(results.map((r) => r.email))]) {
    const al = await ctx.env.DB.prepare('SELECT since FROM ai_allowance WHERE email = ?').bind(email).first<{ since: number }>();
    const { results: grants } = await ctx.env.DB.prepare('SELECT source, usd, created_at AS at FROM ai_credits WHERE email = ?').bind(email).all<C.Grant>();
    const b = al ? await balance(ctx.env, email, al.since) : { spent: 0 };
    used[email] = ils(C.giftUsed(grants, b.spent));
  }
  const total = results.reduce((s, r) => s + r.usd, 0);
  return json({
    month: { given_ils: ils(total), used_ils: Object.values(used).reduce((s, x) => s + x, 0), count: results.length },
    gifts: results.map((r) => ({ email: r.email, name: r.he_name || r.name || r.email, ils: ils(r.usd), note: r.note, at: r.created_at })),
    used, confirm_above: C.GIFT_CONFIRM_ILS,
  });
}

/* ---------------- the family tree's deleted cards (the owner only; the vault checks its own level too) ---------------- */
async function ownerOnly(ctx: Ctx) {
  const a = await requireAdmin(ctx, 'own');
  if (a.level !== 'owner') throw new HttpError(403, 'owner_only');
}
/** GET /api/admin/tree-trash */
export async function treeTrash(ctx: Ctx) { await ownerOnly(ctx); return trashList(ctx); }
/** POST /api/admin/tree-trash/:id/restore */
export async function treeTrashRestore(ctx: Ctx) { await ownerOnly(ctx); return trashRestore(ctx); }
