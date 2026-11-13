// The app lock (like Telegram's) and the family tree's lock – the owner's design, docs/decisions.md "Locks and privacy".
// Rules and tests: lock-rules.ts, test-lock.mjs. Enforced here, on the server: a locked session gets 423 app_locked from
// every route but the lock's own, /api/me and signing in and out (gate(), called by the router).
//
//   GET  /api/lock                    → the person's locks and this session's state
//   PUT  /api/lock                    { app?, tree?, autolock?, tip? }
//   PUT  /api/lock/pin                { pin, current? }      set or change the 4-digit code
//   POST /api/lock/lock               lock now (the padlock in the menu)
//   POST /api/lock/unlock             { pin }                open the app (and the tree) with the code
//   POST /api/lock/passkey/options    → a WebAuthn challenge for this person's passkeys
//   POST /api/lock/passkey            { challengeId, id, response }   open with a passkey
//   POST /api/auth/passkey/options    → a challenge for signing in with a passkey (no session)
//   POST /api/auth/passkey            { challengeId, id, response }   sign in with a passkey: a new session
//
// The code is kept as PBKDF2-SHA256 (100,000 rounds, the most Workers allow) over an HMAC of the code with a pepper derived
// from VAULT_KEY, with a salt per person: the database alone is not enough to guess a 4-digit code.

import { Ctx, Env, HttpError, body, createSession, getCookie, json, requireUser, uid } from './core';
import { challenge as newChallengeValue, verifyAssertion } from './vault/webauthn';
import * as L from './lock-rules';

interface LockRow { email: string; app: string | null; tree: string | null; autolock: number | null; pin_hash: string | null; pin_salt: string | null; fails: number | null; pause_until: number | null; closed: number | null; tip_hidden: number | null }
interface SessionLock { app_locked: number | null; last_active: number | null; tree_open_until: number | null; lock_proof_at: number | null }

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sidOf = (req: Request) => getCookie(req, 'sid') || '';

async function pepper(env: Env): Promise<CryptoKey> {
  const secret = env.VAULT_KEY || (env.DEV_MODE === '1' ? 'dev-only-pepper' : '');
  if (!secret) throw new HttpError(503, 'lock_not_configured');
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const derived = await crypto.subtle.sign('HMAC', k, enc.encode('helper:lock-pin:v1'));
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function hashPin(env: Env, pin: string, salt: string): Promise<string> {
  const peppered = await crypto.subtle.sign('HMAC', await pepper(env), enc.encode(pin));
  const base = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100_000, hash: 'SHA-256' }, base, 256));
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const lockOf = (env: Env, email: string) => env.DB.prepare('SELECT * FROM user_locks WHERE email = ?').bind(email).first<LockRow>();
const sessionOf = (env: Env, sid: string) => env.DB.prepare('SELECT app_locked, last_active, tree_open_until, lock_proof_at FROM sessions WHERE id = ?').bind(sid).first<SessionLock>();
async function ensureRow(env: Env, email: string) {
  await env.DB.prepare("INSERT OR IGNORE INTO user_locks (email, app, tree, autolock, fails, pause_until, closed, tip_hidden, updated_at) VALUES (?, 'off', 'off', ?, 0, 0, 0, 0, ?)").bind(email, L.DEFAULT_AUTOLOCK, Date.now()).run();
}
const hasPasskey = async (env: Env, email: string) => !!(await env.DB.prepare('SELECT 1 FROM passkeys WHERE email = ? LIMIT 1').bind(email).first());

/** the router calls this for every request of a signed-in person: a locked session reaches only the lock and signing in/out */
export async function gate(env: Env, req: Request, email: string, path: string, waitUntil: (p: Promise<unknown>) => void) {
  const sid = sidOf(req);
  if (!sid) return;
  const r = await env.DB.prepare('SELECT l.app, l.autolock, s.app_locked, s.last_active FROM sessions s LEFT JOIN user_locks l ON l.email = s.email WHERE s.id = ?')
    .bind(sid).first<{ app: string | null; autolock: number | null; app_locked: number | null; last_active: number | null }>().catch(() => null);
  if (!r) return;
  const now = Date.now();
  if (L.appLocked({ mode: r.app, locked: r.app_locked, lastActive: r.last_active, autolockMin: r.autolock, now })) {
    if (!r.app_locked) await env.DB.prepare('UPDATE sessions SET app_locked = 1, tree_open_until = 0 WHERE id = ?').bind(sid).run();
    if (!L.allowedWhenLocked(path)) throw new HttpError(423, 'app_locked');
    return;
  }
  // the clock of "left alone": renewed at most every 30 seconds
  if (!r.last_active || now - r.last_active > 30e3) waitUntil(env.DB.prepare('UPDATE sessions SET last_active = ? WHERE id = ?').bind(now, sid).run());
}

/** is the family tree open for this session? (server/vault/index.ts requireTree) – renews its 15 minutes when it is */
export async function treeOpen(ctx: Ctx, email: string): Promise<boolean> {
  const sid = sidOf(ctx.req);
  const r = await ctx.env.DB.prepare('SELECT l.tree, s.tree_open_until FROM sessions s LEFT JOIN user_locks l ON l.email = s.email WHERE s.id = ? AND s.email = ?')
    .bind(sid, email).first<{ tree: string | null; tree_open_until: number | null }>().catch(() => null);
  const now = Date.now();
  if (!L.treeOpen({ mode: r?.tree ?? null, openUntil: r?.tree_open_until ?? null, now })) return false;
  if (r?.tree && r.tree !== 'off') ctx.waitUntil(ctx.env.DB.prepare('UPDATE sessions SET tree_open_until = ? WHERE id = ?').bind(now + L.TREE_IDLE_MS, sid).run());
  return true;
}

/** opened: the app, the tree for 15 minutes, a fresh proof; the wrong codes forgotten */
async function opened(env: Env, sid: string, email: string) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE sessions SET app_locked = 0, last_active = ?, tree_open_until = ?, lock_proof_at = ? WHERE id = ?').bind(now, now + L.TREE_IDLE_MS, now, sid),
    env.DB.prepare('UPDATE user_locks SET fails = 0, pause_until = 0 WHERE email = ?').bind(email),
  ]);
}

export async function status(ctx: Ctx) {
  const u = requireUser(ctx);
  const [l, s, pk] = await Promise.all([lockOf(ctx.env, u.email), sessionOf(ctx.env, sidOf(ctx.req)), hasPasskey(ctx.env, u.email)]);
  const now = Date.now();
  return json({
    app: l?.app || 'off', tree: l?.tree || 'off', autolock: l?.autolock || L.DEFAULT_AUTOLOCK, hasPin: !!l?.pin_hash, hasPasskey: pk,
    tipHidden: !!l?.tip_hidden, closed: !!l?.closed, pauseUntil: l?.pause_until && l.pause_until > now ? l.pause_until : null,
    locked: L.appLocked({ mode: l?.app || 'off', locked: s?.app_locked ?? 0, lastActive: s?.last_active ?? null, autolockMin: l?.autolock ?? null, now }),
    treeOpen: L.treeOpen({ mode: l?.tree || 'off', openUntil: s?.tree_open_until ?? null, now }),
    proof: L.hasProof(s?.lock_proof_at, now),
  });
}

export async function save(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ app?: unknown; tree?: unknown; autolock?: unknown; tip?: unknown }>(ctx.req);
  await ensureRow(ctx.env, u.email);
  const [l, s, pk] = await Promise.all([lockOf(ctx.env, u.email), sessionOf(ctx.env, sidOf(ctx.req)), hasPasskey(ctx.env, u.email)]);
  const proof = L.hasProof(s?.lock_proof_at, Date.now());
  const sets: string[] = [], vals: unknown[] = [];
  for (const k of ['app', 'tree'] as const) {
    if (b[k] === undefined) continue;
    if (!L.validMode(b[k])) throw new HttpError(400, 'bad_mode');
    const ok = L.mayChange({ from: ((l?.[k] as L.Mode) || 'off'), to: b[k] as L.Mode, hasPin: !!l?.pin_hash && !l?.closed, hasPasskey: pk, proof });
    if (!ok.ok) throw new HttpError(ok.why === 'proof_needed' ? 403 : 409, ok.why!);
    sets.push(`${k} = ?`); vals.push(b[k]);
  }
  if (b.autolock !== undefined) { if (!L.validAutolock(b.autolock)) throw new HttpError(400, 'bad_autolock'); sets.push('autolock = ?'); vals.push(b.autolock); }
  if (b.tip !== undefined) { sets.push('tip_hidden = ?'); vals.push(b.tip ? 1 : 0); }
  if (sets.length) await ctx.env.DB.prepare(`UPDATE user_locks SET ${sets.join(', ')}, updated_at = ? WHERE email = ?`).bind(...vals, Date.now(), u.email).run();
  return status(ctx);
}

/** a wrong code: counted, paused every 5, closed at 10 (until a new Google sign-in) */
async function wrong(env: Env, l: LockRow) {
  const f = L.afterFail(l.fails || 0, Date.now());
  await env.DB.prepare('UPDATE user_locks SET fails = ?, pause_until = ?, closed = ? WHERE email = ?').bind(f.fails, f.pauseUntil, f.closed ? 1 : 0, l.email).run();
  throw new HttpError(403, f.closed ? 'pin_closed' : f.pauseUntil ? 'pin_paused' : 'pin_wrong');
}
async function checkPin(env: Env, l: LockRow | null, pin: unknown) {
  if (!l?.pin_hash || !l.pin_salt) throw new HttpError(409, 'no_pin');
  if (l.closed) throw new HttpError(403, 'pin_closed');
  if (l.pause_until && l.pause_until > Date.now()) throw new HttpError(429, 'pin_paused');
  if (!L.validPin(pin) || !same(await hashPin(env, pin, l.pin_salt), l.pin_hash)) await wrong(env, l);
}

export async function setPin(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ pin?: unknown; current?: unknown }>(ctx.req);
  if (!L.validPin(b.pin)) throw new HttpError(400, 'bad_pin');
  await ensureRow(ctx.env, u.email);
  const [l, s] = await Promise.all([lockOf(ctx.env, u.email), sessionOf(ctx.env, sidOf(ctx.req))]);
  // a code that exists changes with the current code, or a proof from the last 5 minutes (a closed code: only a new sign-in)
  if (l?.pin_hash && !L.hasProof(s?.lock_proof_at, Date.now())) await checkPin(ctx.env, l, b.current);
  const salt = uid() + uid();
  await ctx.env.DB.prepare('UPDATE user_locks SET pin_hash = ?, pin_salt = ?, fails = 0, pause_until = 0, closed = 0, updated_at = ? WHERE email = ?')
    .bind(await hashPin(ctx.env, b.pin, salt), salt, Date.now(), u.email).run();
  return json({ ok: true });
}

export async function lockNow(ctx: Ctx) {
  const u = requireUser(ctx);
  const l = await lockOf(ctx.env, u.email);
  if ((!l?.app || l.app === 'off') && (!l?.tree || l.tree === 'off')) throw new HttpError(409, 'no_lock');
  await ctx.env.DB.prepare('UPDATE sessions SET app_locked = ?, tree_open_until = 0, lock_proof_at = 0 WHERE id = ?').bind(l?.app && l.app !== 'off' ? 1 : 0, sidOf(ctx.req)).run();
  return json({ ok: true });
}

export async function unlock(ctx: Ctx) {
  const u = requireUser(ctx);
  const { pin } = await body<{ pin?: unknown }>(ctx.req);
  const l = await lockOf(ctx.env, u.email);
  await checkPin(ctx.env, l, pin);
  await opened(ctx.env, sidOf(ctx.req), u.email);
  return json({ ok: true });
}

/* ---------------- passkeys: to open the lock, and to sign in ---------------- */

const rpId = (ctx: Ctx) => ctx.url.hostname;
async function newChallenge(env: Env, email: string, kind: string) {
  const c = newChallengeValue(), id = uid();
  await env.DB.prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').bind(Date.now()).run();
  await env.DB.prepare('INSERT INTO webauthn_challenges (id, email, challenge, kind, expires_at) VALUES (?, ?, ?, ?, ?)').bind(id, email, c, kind, Date.now() + 5 * 60e3).run();
  return { id, c };
}
async function takeChallenge(env: Env, id: unknown, email: string, kind: string) {
  const row = await env.DB.prepare('SELECT challenge FROM webauthn_challenges WHERE id = ? AND email = ? AND kind = ? AND expires_at > ?').bind(String(id || ''), email, kind, Date.now()).first<{ challenge: string }>();
  await env.DB.prepare('DELETE FROM webauthn_challenges WHERE id = ?').bind(String(id || '')).run();   // single use
  if (!row) throw new HttpError(400, 'challenge_expired');
  return row.challenge;
}
/** at most `max` tries per window (rate_hits, as the vault's) */
async function limit(env: Env, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT count, reset_at FROM rate_hits WHERE key = ?').bind(key).first<{ count: number; reset_at: number }>();
  if (!row || row.reset_at < now) { await env.DB.prepare('INSERT INTO rate_hits (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at').bind(key, now + windowMs).run(); return; }
  if (row.count >= max) throw new HttpError(429, 'too_many');
  await env.DB.prepare('UPDATE rate_hits SET count = count + 1 WHERE key = ?').bind(key).run();
}
type Assertion = { challengeId?: unknown; id?: unknown; response?: { clientDataJSON: string; authenticatorData: string; signature: string } };
async function checkPasskey(ctx: Ctx, b: Assertion, c: string, email: string | null) {
  const row = await ctx.env.DB.prepare('SELECT email, alg, jwk, sign_count FROM passkeys WHERE id = ?').bind(String(b.id || '')).first<{ email: string; alg: number; jwk: string; sign_count: number }>();
  if (!row || (email && row.email !== email) || !b.response) throw new HttpError(403, 'passkey_unknown');
  const count = await verifyAssertion(b.response, { alg: row.alg, jwk: JSON.parse(row.jwk), signCount: row.sign_count }, c, ctx.url.origin, rpId(ctx));
  await ctx.env.DB.prepare('UPDATE passkeys SET sign_count = ?, last_used = ? WHERE id = ?').bind(count, Date.now(), String(b.id)).run();
  return row.email;
}

export async function passkeyOptions(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT id FROM passkeys WHERE email = ?').bind(u.email).all<{ id: string }>();
  if (!results.length) throw new HttpError(409, 'no_passkey');
  const { id, c } = await newChallenge(ctx.env, u.email, 'lock');
  return json({ challengeId: id, publicKey: { challenge: c, rpId: rpId(ctx), userVerification: 'required', timeout: 120000, allowCredentials: results.map((r) => ({ type: 'public-key', id: r.id })) } });
}
export async function passkeyUnlock(ctx: Ctx) {
  const u = requireUser(ctx);
  await limit(ctx.env, 'lock-pk:' + u.email, 10, 15 * 60e3);
  const b = await body<Assertion>(ctx.req);
  await checkPasskey(ctx, b, await takeChallenge(ctx.env, b.challengeId, u.email, 'lock'), u.email);
  await opened(ctx.env, sidOf(ctx.req), u.email);
  return json({ ok: true });
}

/** signing in with a passkey (no session yet): the browser offers the person's passkeys for this site */
export async function loginOptions(ctx: Ctx) {
  await limit(ctx.env, 'login-pk:' + (ctx.req.headers.get('cf-connecting-ip') || 'local'), 20, 15 * 60e3);
  const { id, c } = await newChallenge(ctx.env, '', 'login');
  return json({ challengeId: id, publicKey: { challenge: c, rpId: rpId(ctx), userVerification: 'required', timeout: 120000, allowCredentials: [] } });
}
export async function login(ctx: Ctx) {
  await limit(ctx.env, 'login-pk:' + (ctx.req.headers.get('cf-connecting-ip') || 'local'), 20, 15 * 60e3);
  const b = await body<Assertion>(ctx.req);
  const email = await checkPasskey(ctx, b, await takeChallenge(ctx.env, b.challengeId, '', 'login'), null);
  // only a member still in the tent signs in (one the owner removed is refused, even with a passkey)
  const m = await ctx.env.DB.prepare('SELECT email FROM members WHERE email = ?').bind(email).first();
  if (!m) throw new HttpError(403, 'Not invited');
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', await createSession(ctx.env, email));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

/** for /api/me: the person's app lock (the padlock in the bar), and whether this session is locked now (the lock screen) */
export async function meLock(env: Env, req: Request): Promise<{ appLock: string; locked: boolean }> {
  const r = await env.DB.prepare('SELECT l.app, l.autolock, s.app_locked, s.last_active FROM sessions s LEFT JOIN user_locks l ON l.email = s.email WHERE s.id = ?')
    .bind(sidOf(req)).first<{ app: string | null; autolock: number | null; app_locked: number | null; last_active: number | null }>().catch(() => null);
  return { appLock: r?.app || 'off', locked: !!r && L.appLocked({ mode: r.app, locked: r.app_locked, lastActive: r.last_active, autolockMin: r.autolock, now: Date.now() }) };
}
