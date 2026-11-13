// Web Push (master): the app's own notifications, RFC 8030 / 8291 (aes128gcm) / 8292 (VAPID), with no library.
// A device subscribes (POST /api/push/subscribe); the server sends to every device of a person, or of a household.
// The first user is the emergency alert (docs/vision/grandparents-kids.md): urgency high, requireInteraction.
// Limits, said honestly: on an iPhone a push arrives only when the app is installed on the home screen, and a web
// notification never breaks through silent mode.
import type { Ctx, Env } from './core';
import { HttpError, json, body, requireUser } from './core';
import { prefsFor } from './prefs';
import { decide, windowsFrom, type Kind, type NotifyPrefs, type Window } from './push-gate';

type PushEnv = Env & { VAPID_PUBLIC?: string; VAPID_PRIVATE?: string };
const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => { let s = ''; for (const c of new Uint8Array(b)) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s: string) => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(t, (c) => c.charCodeAt(0)); };
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
const expand = async (prk: Uint8Array, info: Uint8Array, len: number) => (await hmac(prk, cat(info, new Uint8Array([1])))).slice(0, len);

/** the payload encrypted for one subscription (RFC 8291, a single record) */
export async function encrypt(p256dh: string, auth: string, payload: Uint8Array) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', $public: uaKey, public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, eph.privateKey, 256));
  const ikm = await expand(await hmac(secret, shared), cat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = await expand(prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await expand(prk, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(payload, new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, ct);   // record size 4096
}

/** the VAPID authorization for an endpoint's origin (RFC 8292) */
async function vapid(env: PushEnv, endpoint: string) {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) throw new HttpError(503, 'push_not_set_up');
  const pub = unb64u(env.VAPID_PUBLIC);
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), d: env.VAPID_PRIVATE, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://helper.shemrivers.workers.dev/' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}

export interface PushMsg {
  title: string; body: string; url?: string; tag?: string;
  urgent?: boolean;                                   // high urgency, stays on screen until touched, a strong vibration
  kind?: Kind;                                        // what it is about (push-gate.ts); urgent means 'emergency'. Default 'other': waits for the summary
  actions?: { action: string; title: string }[];      // e.g. { action: 'handle', title: 'אני מטפל' }
  data?: Record<string, unknown>;
}
interface Sub { endpoint: string; p256dh: string; auth: string }

async function sendOne(env: PushEnv, s: Sub, m: PushMsg): Promise<boolean> {
  const headers: Record<string, string> = { authorization: await vapid(env, s.endpoint), 'content-encoding': 'aes128gcm',
    'content-type': 'application/octet-stream', ttl: String(m.urgent ? 3600 : 86400), urgency: m.urgent ? 'high' : 'normal' };
  if (m.tag) headers.topic = m.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'helper';
  const res = await fetch(s.endpoint, { method: 'POST', headers, body: await encrypt(s.p256dh, s.auth, enc.encode(JSON.stringify(m))) });
  if (res.status === 404 || res.status === 410) {   // the device unsubscribed: forget it
    await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
    return false;
  }
  return res.ok;
}

/* Shabbat and Yom Tov windows per city, from Hebcal, kept for 6 hours in this isolate */
const shabbatCache = new Map<string, { at: number; w: Window[] }>();
async function windowsFor(geo: string): Promise<Window[]> {
  const c = shabbatCache.get(geo);
  if (c && Date.now() - c.at < 6 * 3600_000) return c.w;
  try {
    const r = await fetch(`https://www.hebcal.com/shabbat?cfg=json&geonameid=${geo}&M=on&lg=he`, { cf: { cacheTtl: 21600 } } as RequestInit);
    const w = r.ok ? windowsFrom(((await r.json()) as { items?: { category: string; date: string }[] }).items || []) : [];
    shabbatCache.set(geo, { at: Date.now(), w });
    return w;
  } catch { return c?.w || []; }
}

/** the gate for one person: send now, or hold for the daily summary (push-gate.ts) */
async function gate(env: Env, email: string, m: PushMsg): Promise<'send' | 'hold'> {
  const kind: Kind = m.urgent ? 'emergency' : m.kind || 'other';
  if (kind === 'emergency' || kind === 'test') return 'send';
  const p = await prefsFor(env, email);
  const n = (p.notify?.data || {}) as NotifyPrefs;
  const city = String(p.calendar?.data?.city || p.parasha?.data?.city || '281184');
  const w = n.shabbat ? await windowsFor(/^d{3,9}$/.test(city) ? city : '281184') : [];
  return decide(kind, Date.now(), n, w);
}

/** to every device of these people, through the gate; what is held goes to the summary. Returns how many devices accepted it. */
export async function pushTo(env: Env, emails: string[], m: PushMsg): Promise<number> {
  let n = 0;
  for (const raw of new Set(emails.map((e) => e.toLowerCase()))) {
    if ((await gate(env, raw, m)) === 'hold') {
      if (m.kind === 'summary') continue;                  // a morning note held by Shabbat or quiet hours is simply skipped
      await env.DB.prepare('INSERT INTO push_digest (email, kind, title, body, url, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(raw, m.kind || 'other', m.title.slice(0, 200), m.body.slice(0, 1000), m.url || null, Date.now()).run();
      continue;
    }
    const { results } = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE email = ?').bind(raw).all<Sub>();
    const ok = await Promise.all(results.map((s) => sendOne(env as PushEnv, s, m).catch(() => false)));
    n += ok.filter(Boolean).length;
  }
  return n;
}
/** to every member of a household but the sender */
export async function pushHousehold(env: Env, household: string, m: PushMsg, except?: string): Promise<number> {
  const { results } = await env.DB.prepare('SELECT email FROM members WHERE household = ?').bind(household).all<{ email: string }>();
  return pushTo(env, results.map((r) => r.email).filter((e) => e !== except), m);
}

/** GET /api/push/key — the public key the browser subscribes with */
export async function key(ctx: Ctx): Promise<Response> {
  return json({ key: (ctx.env as PushEnv).VAPID_PUBLIC || null, ready: !!(ctx.env as PushEnv).VAPID_PRIVATE });
}
/** POST /api/push/subscribe { endpoint, keys: { p256dh, auth } } */
export async function subscribe(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const b = await body<{ endpoint?: string; keys?: { p256dh?: string; auth?: string } }>(ctx.req);
  const ep = String(b.endpoint || '');
  if (!/^https:\/\/\S{10,900}$/.test(ep) || !b.keys?.p256dh || !b.keys?.auth) throw new HttpError(400, 'bad_subscription');
  await ctx.env.DB.prepare(`INSERT INTO push_subs (endpoint, email, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET email = excluded.email, p256dh = excluded.p256dh, auth = excluded.auth`)
    .bind(ep, u.email, String(b.keys.p256dh).slice(0, 200), String(b.keys.auth).slice(0, 60), Date.now()).run();
  return json({ ok: true });
}
/** DELETE /api/push/subscribe { endpoint } */
export async function unsubscribe(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const b = await body<{ endpoint?: string }>(ctx.req);
  await ctx.env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND email = ?').bind(String(b.endpoint || ''), u.email).run();
  return json({ ok: true });
}
/** POST /api/push/test — a test notification to my own devices */
export async function test(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const n = await pushTo(ctx.env, [u.email], { title: 'האוהל', body: 'ההתראות עובדות במכשיר הזה.', url: '/', tag: 'test', kind: 'test' });
  return json({ ok: true, devices: n });
}

/** GET /api/digest — the daily summary: what waited since the last one (the first open of the day shows it), then marked seen */
export async function digest(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT id, kind, title, body, url, created_at FROM push_digest WHERE email = ? AND seen_at IS NULL ORDER BY created_at LIMIT 50').bind(u.email).all();
  if (results.length) await ctx.env.DB.prepare('UPDATE push_digest SET seen_at = ? WHERE email = ? AND seen_at IS NULL').bind(Date.now(), u.email).run();
  await ctx.env.DB.prepare('DELETE FROM push_digest WHERE seen_at < ?').bind(Date.now() - 30 * 86400_000).run();
  return json({ items: results });
}

/** the morning note (cron, src/worker.ts; the owner, 2026-11-14): one notification to whoever has things waiting from the last day.
 *  The card itself shows at the first open of the day whether or not there was a note. */
export async function morning(env: Env): Promise<number> {
  const { results } = await env.DB.prepare('SELECT email, COUNT(*) AS n FROM push_digest WHERE seen_at IS NULL AND created_at > ? GROUP BY email').bind(Date.now() - 86400_000).all<{ email: string; n: number }>();
  let sent = 0;
  for (const r of results) sent += await pushTo(env, [r.email], { title: 'סיכום היום מהאוהל', body: r.n === 1 ? 'דבר אחד חיכה לך מאתמול.' : `${r.n} דברים חיכו לך מאתמול.`, url: '/', tag: 'summary', kind: 'summary' });
  return sent;
}
