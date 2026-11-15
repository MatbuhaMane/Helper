// Shared backend pieces: environment, HTTP helpers, sessions, Google sign-in, token encryption.

import { deniedTicket } from './access';
import { RATE_HIT_SQL } from './rate-sql';

export interface Env {
  DB: D1Database;
  OWNER_EMAIL: string;          // the first owner; signs in without an invitation
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  TOKEN_KEY?: string;           // optional base64 of 32 random bytes; encrypts Gmail refresh tokens (else derived)
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_MAPS_API_KEY?: string; // Places API (New) for the restaurants nearby (server/places.ts); unset: the search says it is not set up
  GEMINI_MODEL?: string;
  GEMINI_IMAGE_MODEL?: string;
  MEDIA?: R2Bucket;            // daemon form pictures (optional; falls back to the edge cache)
  DEV_MODE?: string;            // "1" only for local development: enables /api/auth/dev and the mock URLs below
  ANTHROPIC_BASE_URL?: string;  // dev/test only: point the Claude client at a mock
  GEMINI_BASE_URL?: string;     // dev/test only
  SONGS_MOCK_URL?: string;      // dev/test only
  GEMINI_TTS_MODEL?: string;    // optional: the speech model (default gemini-2.5-flash-preview-tts)
  SPOTIFY_CLIENT_ID?: string;   // the Spotify app's client id (public; sign-in uses PKCE, so there is no secret)
  YOUTUBE_API_KEY?: string;     // optional: YouTube Data API key for search (else search goes through Gemini with Google Search)
  VAULT_KEY?: string;           // the family vault's master key: base64 of 32 random bytes (a secret; see docs/security.md)
  VAULT_KEY_OLD?: string;       // only while rotating VAULT_KEY: the previous key, so older files still open
  VAULT?: R2Bucket;             // optional: a bucket of the vault's own (else MEDIA under vault/)
  VAULT_STORE?: string;         // where new vault files go: r2 (default) | drive | nas
  PRODUCTION_ORIGIN?: string;   // set on previews only: the live site, through which a preview signs in (a public URL)
  PREVIEW_HANDOFF_KEY?: string; // the same secret on the live site and the previews: signs the one-minute sign-in tickets
}

export interface Member {
  email: string;
  name: string | null;
  he_name?: string | null;
  household: string;
  role: 'owner' | 'member';
}

export interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
  user: Member | null;
  waitUntil: (p: Promise<unknown>) => void;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export async function body<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

/** At most `max` hits per window for this key (rate_hits, rate-sql.ts). One statement, so parallel requests cannot all read the
    same count and slip through together: each one counts itself and sees its own number. */
export async function rateHit(env: Env, key: string, max: number, windowMs: number, error = 'too_many_tries'): Promise<void> {
  const now = Date.now();
  const row = await env.DB.prepare(RATE_HIT_SQL).bind(key, now + windowMs, now, now).first<{ count: number }>();
  if ((row?.count ?? 1) > max) throw new HttpError(429, error);
}

export function uid(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

export function requireUser(ctx: Ctx): Member {
  if (!ctx.user) throw new HttpError(401, 'Not signed in');
  return ctx.user;
}

export function requireOwner(ctx: Ctx): Member {
  const u = requireUser(ctx);
  if (u.role !== 'owner') throw new HttpError(403, 'Owner only');
  return u;
}

export async function sha1Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/* ---------------- cookies & sessions ---------------- */

const SESSION_DAYS = 60;

export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function loadUser(env: Env, req: Request): Promise<Member | null> {
  const sid = getCookie(req, 'sid');
  if (!sid) return null;
  const row = await env.DB.prepare(
    `SELECT m.email, m.name, m.he_name, m.household, m.role FROM sessions s JOIN members m ON m.email = s.email
     WHERE s.id = ? AND s.expires_at > ?`,
  ).bind(sid, Date.now()).first<Member>();
  return row || null;
}

/** a new session. A sign-in (Google or a passkey) is a fresh proof for the lock (server/lock.ts): the session starts open, and
    a code closed after ten wrong tries opens again – "שכחתי את הקוד" is a new sign-in with the person's Google account. */
export async function createSession(env: Env, email: string): Promise<string> {
  const id = uid() + uid(), now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (id, email, expires_at, created_at, last_active, lock_proof_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, email, now + SESSION_DAYS * 86400_000, now, now, now).run();
  await env.DB.prepare('UPDATE user_locks SET fails = 0, pause_until = 0, closed = 0 WHERE email = ?').bind(email).run().catch(() => {});
  return cookie('sid', id, SESSION_DAYS * 86400);
}

/** Joining from a gathering's invitation (server/join.ts) – registered by the router, so this module does not import it. */
interface InviteHooks {
  admit: (env: Env, req: Request, email: string, name: string | null) => Promise<Member | null>;
  joined: (env: Env, req: Request, email: string) => Promise<void>;
}
let inviteHooks: InviteHooks | null = null;
export function useInviteHooks(h: InviteHooks) { inviteHooks = h; }

/** Members must be invited by an owner; OWNER_EMAIL is admitted (and made owner) automatically; a guest who signs in from
    a gathering's invitation (a join ticket on this device, server/join.ts) gets a household of their own. */
/** A member the owner added signs in for the first time: they have full access at once (the family: no allowance row),
    and the owner is told, with a message only the owner sees, to approve them in the room (members.approved_at).
    Someone who used the tent before this was kept (a session or preferences) is not "new": it is only marked. */
async function firstSignIn(env: Env, m: Member, name: string | null) {
  const row = await env.DB.prepare('SELECT first_seen FROM members WHERE email = ?').bind(m.email).first<{ first_seen: number | null }>();
  if (!row || row.first_seen) return;
  const now = Date.now();
  const set = await env.DB.prepare('UPDATE members SET first_seen = ? WHERE email = ? AND first_seen IS NULL').bind(now, m.email).run();
  if (!set.meta.changes || m.role === 'owner') return;                       // another tab won the race, or the owner
  const before = await env.DB.prepare('SELECT 1 FROM sessions WHERE email = ? UNION SELECT 1 FROM user_prefs WHERE email = ? LIMIT 1').bind(m.email, m.email).first().catch(() => null);
  if (before) return;
  const who = (m.he_name || m.name || name || m.email).slice(0, 60);
  const owners = (env.OWNER_EMAIL || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  for (const owner of owners) {
    await env.DB.prepare('INSERT INTO admin_messages (id, text, level, link, by_email, created_at, ends_at, active, to_email) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
      .bind(uid(), `${who} התחבר/ה לאוהל בפעם הראשונה, עם גישה מלאה. לאשר בחדר הבעלים?`, 'info', '/admin/#members', 'system', now, now + 30 * 86400_000, owner).run();
  }
}

async function admitMember(env: Env, email: string, name: string | null, req?: Request): Promise<Member | null> {
  const existing = await env.DB.prepare('SELECT email, name, he_name, household, role FROM members WHERE email = ?')
    .bind(email).first<Member>();
  if (existing) {
    if (name && !existing.name) await env.DB.prepare('UPDATE members SET name = ? WHERE email = ?').bind(name, email).run();
    await firstSignIn(env, existing, name).catch((e) => console.error('first sign-in', e instanceof Error ? e.message : e));
    return existing;
  }
  const owners = (env.OWNER_EMAIL || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (!owners.includes(email)) {
    if (!req || !inviteHooks) return null;
    return inviteHooks.admit(env, req, email, name);
  }
  await env.DB.prepare('INSERT INTO members (email, name, household, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(email, name, 'family', 'owner', Date.now()).run();
  return { email, name, household: 'family', role: 'owner' };
}

/* ---------------- Google OAuth ---------------- */

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';   // only files the helper itself made

/** A preview of this Worker (feature-x-helper.<sub>.workers.dev), seen from the live site (helper.<sub>.workers.dev). */
export function isPreviewOf(live: URL, origin: string): boolean {
  const esc = live.hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^https://[a-z0-9-]{1,63}-${esc}$`).test(origin);
}
const onPreview = (env: Env, url: URL) => !!env.PRODUCTION_ORIGIN && url.origin !== env.PRODUCTION_ORIGIN;

export function googleLogin(ctx: Ctx): Response {
  const { env, url } = ctx;
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(500, 'GOOGLE_CLIENT_ID is not configured');
  // a preview has no Google redirect address of its own: it signs in through the live site, which sends back a ticket
  if (onPreview(env, url)) {
    const p = new URLSearchParams({ preview: url.origin, next: safeNext(url.searchParams.get('next')) });
    if (url.searchParams.get('reauth') === '1') p.set('reauth', '1');
    return redirect(`${env.PRODUCTION_ORIGIN}/api/auth/login?${p}`);
  }
  const preview = url.searchParams.get('preview');
  if (preview && !isPreviewOf(url, preview)) throw new HttpError(400, 'Unknown preview');
  const gmail = !preview && url.searchParams.get('gmail') === '1';
  const driveBackup = !preview && url.searchParams.get('drive') === '1';   // the owner connects Drive for the vault's backups
  const reauth = url.searchParams.get('reauth') === '1';   // the vault: prove it is you again, now
  const next = safeNext(url.searchParams.get('next'));
  const state = uid();
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/api/auth/callback`,
    response_type: 'code',
    scope: gmail ? `openid email profile ${GMAIL_SCOPE}` : driveBackup ? `openid email profile ${DRIVE_FILE_SCOPE}` : 'openid email profile',
    state,
    include_granted_scopes: 'true',
    prompt: gmail || driveBackup ? 'consent' : reauth ? 'login' : 'select_account',
  });
  if (reauth) p.set('max_age', '0');
  if (gmail || driveBackup) p.set('access_type', 'offline');
  return new Response(null, {
    status: 302,
    headers: {
      location: `https://accounts.google.com/o/oauth2/v2/auth?${p}`,
      'set-cookie': cookie('oauth', JSON.stringify({ state, next, preview: preview || undefined }), 600),
    },
  });
}

function safeNext(n: string | null): string {
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/';
}

export async function googleCallback(ctx: Ctx): Promise<Response> {
  const { env, url, req } = ctx;
  const saved = JSON.parse(getCookie(req, 'oauth') || '{}');
  if (!saved.state || saved.state !== url.searchParams.get('state')) throw new HttpError(400, 'Sign-in expired, please try again');
  const code = url.searchParams.get('code');
  if (!code) return redirect('/?error=cancelled');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new HttpError(502, 'Google sign-in failed');
  const tok = (await tokenRes.json()) as { id_token: string; refresh_token?: string; scope?: string };
  // The ID token came straight from Google's token endpoint over TLS, so its claims can be trusted without a signature check.
  const claims = JSON.parse(b64urlDecode(tok.id_token.split('.')[1]));
  if (!claims.email_verified) throw new HttpError(403, 'Google email not verified');
  const email = String(claims.email).toLowerCase();

  const member = await admitMember(env, email, claims.name || null, saved.preview ? undefined : req);
  if (!member) {
    // not a member and no invitation: a one-hour ticket for the request form (server/access.ts); the email is shown, never trusted back
    const t = await deniedTicket(env, email, claims.name || null).catch((e) => { console.error('access ticket', e instanceof Error ? e.message : e); return ''; });
    return redirect('/?error=not_invited&email=' + encodeURIComponent(email) + (t ? '&req=' + t : ''));
  }

  // a preview asked: no session here – a signed one-minute ticket for that preview
  if (saved.preview && isPreviewOf(url, saved.preview)) {
    if (!env.PREVIEW_HANDOFF_KEY) throw new HttpError(503, 'previews_not_configured');
    const ticket = await signTicket(env.PREVIEW_HANDOFF_KEY, { email, name: claims.name || null, aud: saved.preview, exp: Date.now() + 60e3, n: uid() + uid() });
    const back = new Headers({ location: `${saved.preview}/api/auth/handoff?t=${encodeURIComponent(ticket)}&next=${encodeURIComponent(safeNext(saved.next))}` });
    back.append('set-cookie', cookie('oauth', '', 0));
    return new Response(null, { status: 302, headers: back });
  }

  if (tok.refresh_token && (tok.scope?.includes(GMAIL_SCOPE) || tok.scope?.includes(DRIVE_FILE_SCOPE))) {
    await env.DB.prepare(
      `INSERT INTO google_tokens (email, refresh_token, scope, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET refresh_token = excluded.refresh_token, scope = excluded.scope, updated_at = excluded.updated_at`,
    ).bind(email, await encrypt(env, tok.refresh_token), tok.scope, Date.now()).run();
    // the owner connected Drive: the vault's backups go to their Drive from now on
    if (tok.scope.includes(DRIVE_FILE_SCOPE) && member.role === 'owner') {
      await env.DB.prepare("INSERT INTO backup_state (key, value) VALUES ('drive_email', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(email).run();
    }
  }

  const headers = new Headers({ location: safeNext(saved.next) });
  headers.append('set-cookie', await createSession(env, email));
  headers.append('set-cookie', cookie('oauth', '', 0));
  await signedInFromInvite(env, req, email, headers);
  return new Response(null, { status: 302, headers });
}

/* ---------------- previews: a one-minute, single-use, signed ticket from the live site ---------------- */
const b64u = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signTicket(secret: string, data: Record<string, unknown>) {
  const body = b64u(unescape(encodeURIComponent(JSON.stringify(data))));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(body)));
  return body + '.' + b64u(String.fromCharCode(...sig));
}
export async function previewHandoff(ctx: Ctx): Promise<Response> {
  const { env, url } = ctx;
  if (!onPreview(env, url) || !env.PREVIEW_HANDOFF_KEY) throw new HttpError(404, 'Not found');
  const [body, sig] = String(url.searchParams.get('t') || '').split('.');
  if (!body || !sig) throw new HttpError(400, 'Bad ticket');
  const raw = Uint8Array.from(atob(sig.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((sig.length + 3) % 4)), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env.PREVIEW_HANDOFF_KEY), raw, new TextEncoder().encode(body));
  if (!ok) throw new HttpError(403, 'Bad ticket');
  const t = JSON.parse(b64urlDecode(body)) as { email: string; name: string | null; aud: string; exp: number; n: string };
  if (t.aud !== url.origin || t.exp < Date.now()) throw new HttpError(403, 'Ticket expired');
  // single use
  const used = await env.DB.prepare('INSERT INTO handoff_nonces (n, exp) VALUES (?, ?) ON CONFLICT(n) DO NOTHING').bind(t.n, t.exp).run();
  if (!used.meta.changes) throw new HttpError(403, 'Ticket used');
  await env.DB.prepare('DELETE FROM handoff_nonces WHERE exp < ?').bind(Date.now() - 3600e3).run();
  const member = await admitMember(env, String(t.email).toLowerCase(), t.name);
  if (!member) return redirect('/?error=not_invited');
  const headers = new Headers({ location: safeNext(url.searchParams.get('next')) });
  headers.append('set-cookie', await createSession(env, member.email));
  return new Response(null, { status: 302, headers });
}

/** after a sign-in from an invitation: the guest's earlier answer becomes the member's, and the join ticket is cleared */
async function signedInFromInvite(env: Env, req: Request, email: string, headers: Headers) {
  if (!getCookie(req, 'join') || !inviteHooks) return;
  await inviteHooks.joined(env, req, email).catch((e: unknown) => console.error('join', e instanceof Error ? e.message : e));
  headers.append('set-cookie', cookie('join', '', 0));
}

export async function devLogin(ctx: Ctx): Promise<Response> {
  if (ctx.env.DEV_MODE !== '1') throw new HttpError(404, 'Not found');
  const email = (ctx.url.searchParams.get('email') || '').toLowerCase();
  const member = await admitMember(ctx.env, email, ctx.url.searchParams.get('name'), ctx.req);
  if (!member) throw new HttpError(403, 'Not invited');
  const headers = new Headers({ location: safeNext(ctx.url.searchParams.get('next')) });
  headers.append('set-cookie', await createSession(ctx.env, email));
  await signedInFromInvite(ctx.env, ctx.req, email, headers);
  return new Response(null, { status: 302, headers });
}

export async function logout(ctx: Ctx): Promise<Response> {
  const sid = getCookie(ctx.req, 'sid');
  if (sid) await ctx.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
  return json({ ok: true }, 200, { 'set-cookie': cookie('sid', '', 0) });
}

export async function googleAccessToken(env: Env, email: string): Promise<string> {
  const row = await env.DB.prepare('SELECT refresh_token FROM google_tokens WHERE email = ?').bind(email).first<{ refresh_token: string }>();
  if (!row) throw new HttpError(409, 'gmail_not_connected');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: await decrypt(env, row.refresh_token),
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    // Revoked or expired: forget it so the UI asks to reconnect.
    await env.DB.prepare('DELETE FROM google_tokens WHERE email = ?').bind(email).run();
    throw new HttpError(409, 'gmail_not_connected');
  }
  return ((await res.json()) as { access_token: string }).access_token;
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

/* ---------------- encryption of stored tokens ---------------- */

function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(pad), (c) => c.charCodeAt(0)));
}

async function aesKey(env: Env): Promise<CryptoKey> {
  // TOKEN_KEY (base64, 32 bytes) if set; otherwise a key derived from GOOGLE_CLIENT_SECRET, so setup needs one secret fewer.
  // (Rotating the Google client secret then just means everyone reconnects Gmail once.)
  if (env.TOKEN_KEY) {
    const raw = Uint8Array.from(atob(env.TOKEN_KEY), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  if (!env.GOOGLE_CLIENT_SECRET) throw new HttpError(500, 'GOOGLE_CLIENT_SECRET is not configured');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.GOOGLE_CLIENT_SECRET), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('helper-gmail-tokens'), info: new TextEncoder().encode('aes-gcm-256') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(env: Env, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(plain)));
  const all = new Uint8Array(iv.length + ct.length);
  all.set(iv);
  all.set(ct, iv.length);
  return btoa(String.fromCharCode(...all));
}

export async function decrypt(env: Env, enc: string): Promise<string> {
  const all = Uint8Array.from(atob(enc), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await aesKey(env), all.slice(12));
  return new TextDecoder().decode(pt);
}


/* ---------------- desktop program sign-in (through the browser) ---------------- */
// 1. the program asks for a code pair: a secret one it polls with, and a short one it shows on its own screen;
// 2. it opens the browser at /api/auth/desktop/approve, a page where the person (signed in as usual) TYPES the short
//    code and presses a button (a POST); 3. the program polls and receives a session for itself.
// The short code must be typed: a link alone never approves anything, so a link sent by someone else cannot connect
// their computer to the person's account (security review 2026-11-15, H1). Codes live 5 minutes.

const DESKTOP_TTL = 5 * 60_000;
const DESKTOP_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I: read off a screen and typed (32 letters: no bias)
const desktopShortCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => DESKTOP_ABC[b % DESKTOP_ABC.length]).join('');
const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escHtml = (t: string) => t.replace(/[&<>"']/g, (c) => HTML_ESC[c]);

function desktopPage(title: string, inner: string, status = 200): Response {
  const page = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · הָאֹהֶל</title><meta name="color-scheme" content="light dark"></head>
<body style="font-family:Rubik,system-ui,sans-serif;margin:0;padding:32px 16px;background:Canvas;color:CanvasText">
<main style="max-inline-size:440px;margin-inline:auto;line-height:1.6"><h1 style="font-size:1.4rem;margin:0 0 12px">${title}</h1>${inner}</main></body></html>`;
  return new Response(page, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

function desktopForm(u: Member, error = ''): Response {
  return desktopPage('חיבור התוכנה למחשב', `
<p>מחוברים כעת בתור <b>${escHtml(u.email)}</b>.</p>
<p>הקלידו כאן את הקוד ש<b>מופיע עכשיו בתוכנה במחשב שלכם</b>.</p>
<p style="padding:10px 12px;border:1px solid #b45309;border-radius:10px">אם מישהו שלח לכם קוד או קישור – אל תקלידו. מי שמחזיק את הקוד יקבל גישה לחשבון שלכם.</p>
${error ? `<p role="alert" style="color:#dc2626;font-weight:600">${escHtml(error)}</p>` : ''}
<form method="post" action="/api/auth/desktop/approve">
<label for="c" style="display:block;margin-block-end:6px">הקוד מהתוכנה</label>
<input id="c" name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" dir="ltr" maxlength="12" placeholder="ABCD-EFGH"
 style="font:inherit;font-size:1.4rem;letter-spacing:.15em;inline-size:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid GrayText;text-align:center;background:Field;color:FieldText">
<button type="submit" style="font:inherit;margin-block-start:14px;inline-size:100%;padding:12px;border-radius:10px;border:0;background:#4a5d23;color:#fff;font-weight:600">לחבר את המחשב שלי</button>
</form>`);
}

export async function desktopStart(ctx: Ctx): Promise<Response> {
  await rateHit(ctx.env, 'desktop-start:' + (ctx.req.headers.get('cf-connecting-ip') || 'local'), 10, 60 * 60_000);
  const now = Date.now();
  await ctx.env.DB.prepare('DELETE FROM desktop_codes WHERE created_at < ?').bind(now - DESKTOP_TTL - 60_000).run();
  const code = uid() + uid(), short = desktopShortCode();
  await ctx.env.DB.prepare('INSERT INTO desktop_codes (code, sid, created_at, user_code) VALUES (?, NULL, ?, ?)').bind(code, now, short).run();
  return json({ code, userCode: short.slice(0, 4) + '-' + short.slice(4), approve: `${ctx.url.origin}/api/auth/desktop/approve`, expiresIn: DESKTOP_TTL / 1000 });
}

/** GET: the page where the person types the code (it approves nothing by itself) */
export async function desktopApprove(ctx: Ctx): Promise<Response> {
  if (!ctx.user) return redirect('/?next=' + encodeURIComponent('/api/auth/desktop/approve'));
  return desktopForm(ctx.user);
}

/** POST: the typed code – it connects the program waiting with that code to this account */
export async function desktopConfirm(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  await rateHit(ctx.env, 'desktop-confirm:' + u.email, 10, 15 * 60_000);
  let typed = '';
  try { typed = String((await ctx.req.formData()).get('code') || ''); } catch { /* not a form */ }
  const short = typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (short.length !== 8) return desktopForm(u, 'הקוד הוא שמונה אותיות ומספרים, כמו שהוא מופיע בתוכנה.');
  const now = Date.now(), id = uid() + uid();
  // claim the code in one statement, so it connects one program only
  const row = await ctx.env.DB.prepare('UPDATE desktop_codes SET sid = ? WHERE user_code = ? AND sid IS NULL AND created_at >= ? RETURNING code')
    .bind(id, short, now - DESKTOP_TTL).first<{ code: string }>();
  if (!row) return desktopForm(u, 'הקוד לא נמצא או שפג תוקפו (5 דקות). בקשו קוד חדש בתוכנה ונסו שוב.');
  // the program's session is no fresher than the one that approved it (the vault asks for a fresh sign-in for some steps)
  const mine = await ctx.env.DB.prepare('SELECT created_at FROM sessions WHERE id = ?').bind(getCookie(ctx.req, 'sid') || '').first<{ created_at: number | null }>();
  await ctx.env.DB.prepare('INSERT INTO sessions (id, email, expires_at, created_at, last_active, label) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, u.email, now + SESSION_DAYS * 86400_000, mine?.created_at || 0, now, 'התוכנה למחשב').run();
  ctx.waitUntil(import('./push').then((p) => p.pushTo(ctx.env, [u.email], {
    title: 'מחשב חדש התחבר לאוהל', body: 'התוכנה למחשב חוברה עכשיו לחשבון שלכם. אם לא אתם חיברתם אותה, ספרו מיד לבעלים.',
    url: '/', tag: 'desktop-connected', kind: 'family',
  })).catch(() => {}));
  return desktopPage('מחובר ✓', '<p>אפשר לסגור את החלון ולחזור לתוכנה. האוהל כבר בדרך לשולחן העבודה.</p>');
}

export async function desktopPoll(ctx: Ctx): Promise<Response> {
  const code = ctx.url.searchParams.get('code') || '';
  const row = await ctx.env.DB.prepare('SELECT sid, created_at FROM desktop_codes WHERE code = ?').bind(code).first<{ sid: string | null; created_at: number }>();
  if (!row || Date.now() - row.created_at > DESKTOP_TTL + 60_000) return json({ error: 'expired' }, 410);   // a minute's grace to collect an approved one
  if (!row.sid) return json({ waiting: true });
  await ctx.env.DB.prepare('DELETE FROM desktop_codes WHERE code = ?').bind(code).run();   // one use only
  return json({ sid: row.sid, maxAge: SESSION_DAYS * 86400 });
}
