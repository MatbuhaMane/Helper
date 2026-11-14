// Worker entry: /api/* goes to the API router; everything else is served from public/ as static assets.
// API responses leave with the security headers here; static pages get the same from public/_headers (see docs/security.md).
import { onRequest } from '../functions/api/[[path]]';
import type { Env } from '../server/core';
import { nightly } from '../server/vault/backup';
import { ensureSchema } from '../server/schema';
import * as push from '../server/push';
import * as cook from '../server/cook';
import * as home from '../server/home';
const MORNING = '0 5 * * *';
const MINUTE = '* * * * *';

/** The family vault's page: only our own scripts (none inline), nothing framed, nothing from outside but the font. */
const VAULT_CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", 'font-src https://fonts.gstatic.com',
  "img-src 'self' blob: data:", "media-src 'self' blob:", "connect-src 'self'", "worker-src 'self'", "frame-src 'none'", "object-src 'none'",
  "base-uri 'none'", "form-action 'self' https://accounts.google.com", "frame-ancestors 'self'",
].join('; ');
/** Every other page: the rules that cost nothing to keep (the hub embeds YouTube, Spotify and others, so no allow-list here yet). */
const BASE_CSP = ["object-src 'none'", "base-uri 'self'", "form-action 'self' https://accounts.google.com", "frame-ancestors 'self'"].join('; ');

function secure(res: Response, url: URL): Response {
  const out = new Response(res.body, res);
  const h = out.headers;
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (!local) h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('x-frame-options', 'SAMEORIGIN');
  h.set('cross-origin-opener-policy', 'same-origin-allow-popups');
  h.set('permissions-policy', 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), serial=(), bluetooth=(), hid=()');
  const html = (h.get('content-type') || '').includes('text/html');
  if (html && !h.has('content-security-policy')) {
    const vault = url.pathname === '/family' || url.pathname.startsWith('/family/');
    h.set('content-security-policy', vault ? VAULT_CSP : BASE_CSP);
    if (vault) h.set('cache-control', 'no-store');
  }
  return out;
}

export default {
  async fetch(request: Request, env: Env & { ASSETS: Fetcher }, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const res = await (onRequest as any)({ request, env, waitUntil: ctx.waitUntil.bind(ctx), params: {}, data: {}, next: () => env.ASSETS.fetch(request), functionPath: url.pathname });
      return secure(res, url);
    }
    return secure(await env.ASSETS.fetch(request), url);
  },
  /** 05:00 UTC (07:00 in winter, 08:00 in summer): the morning note (server/push.ts). Otherwise the nightly job: */
  /** the nightly job: the vault's backups (only where the vault is configured) */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // every minute: the kitchen timers that end within it ring at their second, with the app closed (server/cook.ts)
    if (event.cron === MINUTE) { ctx.waitUntil(ensureSchema(env).then(() => cook.tick(env)).catch((e) => console.error('kitchen timers failed', e))); return; }
    if (event.cron === MORNING) {
      ctx.waitUntil(ensureSchema(env).then(() => push.morning(env)).then((n) => console.log('morning notes', n)).catch((e) => console.error('morning failed', e)));
      ctx.waitUntil(ensureSchema(env).then(() => home.remind(env)).then((n) => console.log('home reminders', n)).catch((e) => console.error('home reminders failed', e)));
      return;
    }
    if (!env.VAULT_KEY) return;
    ctx.waitUntil(ensureSchema(env).then(() => nightly(env)).then((r) => console.log('vault backup', JSON.stringify(r))).catch((e) => console.error('vault backup failed', e instanceof Error ? e.stack : e)));
  },
};
