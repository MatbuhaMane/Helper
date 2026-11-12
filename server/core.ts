// Shared backend pieces: environment, HTTP helpers, sessions, Google sign-in, token encryption.

export interface Env {
  DB: D1Database;
  OWNER_EMAIL: string;          // the first owner; signs in without an invitation
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  TOKEN_KEY?: string;           // optional base64 of 32 random bytes; encrypts Gmail refresh tokens (else derived)
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
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

function cookie(name: string, value: string, maxAge: number): string {
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

async function createSession(env: Env, email: string): Promise<string> {
  const id = uid() + uid();
  await env.DB.prepare('INSERT INTO sessions (id, email, expires_at) VALUES (?, ?, ?)')
    .bind(id, email, Date.now() + SESSION_DAYS * 86400_000).run();
  return cookie('sid', id, SESSION_DAYS * 86400);
}

/** Members must be invited by an owner; OWNER_EMAIL is admitted (and made owner) automatically. */
async function admitMember(env: Env, email: string, name: string | null): Promise<Member | null> {
  const existing = await env.DB.prepare('SELECT email, name, household, role FROM members WHERE email = ?')
    .bind(email).first<Member>();
  if (existing) {
    if (name && !existing.name) await env.DB.prepare('UPDATE members SET name = ? WHERE email = ?').bind(name, email).run();
    return existing;
  }
  const owners = (env.OWNER_EMAIL || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (!owners.includes(email)) return null;
  await env.DB.prepare('INSERT INTO members (email, name, household, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(email, name, 'family', 'owner', Date.now()).run();
  return { email, name, household: 'family', role: 'owner' };
}

/* ---------------- Google OAuth ---------------- */

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

export function googleLogin(ctx: Ctx): Response {
  const { env, url } = ctx;
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(500, 'GOOGLE_CLIENT_ID is not configured');
  const gmail = url.searchParams.get('gmail') === '1';
  const next = safeNext(url.searchParams.get('next'));
  const state = uid();
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/api/auth/callback`,
    response_type: 'code',
    scope: gmail ? `openid email profile ${GMAIL_SCOPE}` : 'openid email profile',
    state,
    include_granted_scopes: 'true',
    prompt: gmail ? 'consent' : 'select_account',
  });
  if (gmail) p.set('access_type', 'offline');
  return new Response(null, {
    status: 302,
    headers: {
      location: `https://accounts.google.com/o/oauth2/v2/auth?${p}`,
      'set-cookie': cookie('oauth', JSON.stringify({ state, next }), 600),
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

  const member = await admitMember(env, email, claims.name || null);
  if (!member) return redirect('/?error=not_invited&email=' + encodeURIComponent(email));

  if (tok.refresh_token && tok.scope?.includes(GMAIL_SCOPE)) {
    await env.DB.prepare(
      `INSERT INTO google_tokens (email, refresh_token, scope, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET refresh_token = excluded.refresh_token, scope = excluded.scope, updated_at = excluded.updated_at`,
    ).bind(email, await encrypt(env, tok.refresh_token), tok.scope, Date.now()).run();
  }

  const headers = new Headers({ location: safeNext(saved.next) });
  headers.append('set-cookie', await createSession(env, email));
  headers.append('set-cookie', cookie('oauth', '', 0));
  return new Response(null, { status: 302, headers });
}

export async function devLogin(ctx: Ctx): Promise<Response> {
  if (ctx.env.DEV_MODE !== '1') throw new HttpError(404, 'Not found');
  const email = (ctx.url.searchParams.get('email') || '').toLowerCase();
  const member = await admitMember(ctx.env, email, ctx.url.searchParams.get('name'));
  if (!member) throw new HttpError(403, 'Not invited');
  const headers = new Headers({ location: safeNext(ctx.url.searchParams.get('next')) });
  headers.append('set-cookie', await createSession(ctx.env, email));
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
// 1. the program asks for a code; 2. it opens the browser at /api/auth/desktop/approve?code=…, where the person
// (signed in as usual) approves; 3. the program polls and receives a session for itself.

export async function desktopStart(ctx: Ctx): Promise<Response> {
  const code = uid() + uid();
  await ctx.env.DB.prepare('INSERT INTO desktop_codes (code, sid, created_at) VALUES (?, NULL, ?)').bind(code, Date.now()).run();
  return json({ code, approve: `${ctx.url.origin}/api/auth/desktop/approve?code=${code}` });
}

export async function desktopApprove(ctx: Ctx): Promise<Response> {
  const code = ctx.url.searchParams.get('code') || '';
  if (!ctx.user) return redirect('/?next=' + encodeURIComponent(`/api/auth/desktop/approve?code=${code}`));
  const row = await ctx.env.DB.prepare('SELECT created_at, sid FROM desktop_codes WHERE code = ?').bind(code).first<{ created_at: number; sid: string | null }>();
  if (!row || Date.now() - row.created_at > 10 * 60_000) {
    return new Response('<meta charset="utf-8"><body dir="rtl" style="font-family:system-ui;padding:40px">הקוד פג תוקף. נסו להתחבר שוב מהתוכנה.</body>', { status: 410, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  const id = uid() + uid();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO sessions (id, email, expires_at) VALUES (?, ?, ?)').bind(id, ctx.user.email, Date.now() + SESSION_DAYS * 86400_000),
    ctx.env.DB.prepare('UPDATE desktop_codes SET sid = ? WHERE code = ?').bind(id, code),
  ]);
  return new Response('<meta charset="utf-8"><body dir="rtl" style="font-family:system-ui;padding:40px;background:#efeee6;color:#2e2a1e"><h2>מחובר ✓</h2><p>אפשר לסגור את החלון ולחזור לתוכנה. העוזר כבר בדרך לשולחן העבודה.</p></body>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function desktopPoll(ctx: Ctx): Promise<Response> {
  const code = ctx.url.searchParams.get('code') || '';
  const row = await ctx.env.DB.prepare('SELECT sid, created_at FROM desktop_codes WHERE code = ?').bind(code).first<{ sid: string | null; created_at: number }>();
  if (!row || Date.now() - row.created_at > 10 * 60_000) return json({ error: 'expired' }, 410);
  if (!row.sid) return json({ waiting: true });
  await ctx.env.DB.prepare('DELETE FROM desktop_codes WHERE code = ?').bind(code).run();   // one use only
  return json({ sid: row.sid, maxAge: SESSION_DAYS * 86400 });
}
