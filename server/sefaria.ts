// Sefaria through us, kept: every text, list of links, dictionary entry and manuscript page that the study room asks for is
// fetched from Sefaria once and then served from our own copy – in the edge cache (fast) and in D1 (lasting). Biblical texts and
// commentaries hardly change, so a copy is good for months; whatever the family has read stays available even when Sefaria is slow.
//   GET /api/sefaria/<path>?<query>   e.g. /api/sefaria/v3/texts/Genesis%2025?version=hebrew&return_format=text_only

import { Ctx, HttpError, requireUser } from './core';

const UPSTREAM = 'https://www.sefaria.org/api/';
// what may pass, and for how long a copy is good (days)
const ALLOWED: [RegExp, number][] = [
  [/^v3\/texts\//, 180], [/^texts\//, 180], [/^links\//, 60], [/^words\//, 180], [/^manuscripts\//, 180], [/^name\//, 365], [/^index\//, 180], [/^related\//, 60],
];
const MAX_KEEP = 1_800_000;   // D1 keeps rows up to about 2 MB

export async function proxy(ctx: Ctx) {
  requireUser(ctx);
  const path = decodeURIComponent(ctx.url.pathname.replace(/^\/api\/sefaria\//, ''));
  const rule = ALLOWED.find(([re]) => re.test(path));
  if (!rule || /(^|\/)\.\.(\/|$)|[\\\u0000-\u001f]/.test(path)) throw new HttpError(404, 'Not found');   // no way out of the allowed paths
  const days = rule[1];
  const key = path + (ctx.url.search || '');
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${days * 86400}`, 'x-copy': '' };

  // 1. the edge cache
  const cacheKey = new Request(`https://sefaria-copy.internal/${encodeURIComponent(key)}`);
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const edge = await cache?.match(cacheKey);
  if (edge) return new Response(edge.body, { headers: { ...headers, 'x-copy': 'edge' } });

  // 2. our lasting copy
  const row = await ctx.env.DB.prepare('SELECT body, created_at FROM sefaria_cache WHERE key = ?').bind(key).first<{ body: string; created_at: number }>();
  if (row && Date.now() - row.created_at < days * 864e5) {
    const res = new Response(row.body, { headers: { ...headers, 'x-copy': 'kept' } });
    if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  // 3. Sefaria itself (and keep what it says); if Sefaria fails, an old copy is better than nothing
  let up: Response;
  try {
    up = await fetch(UPSTREAM + encodeURI(path) + (ctx.url.search || ''), { headers: { 'user-agent': 'HelperFamilyApp/1.0 (study room)' } });
  } catch (_) {
    if (row) return new Response(row.body, { headers: { ...headers, 'x-copy': 'stale' } });
    throw new HttpError(502, 'sefaria_unavailable');
  }
  if (!up.ok) {
    if (row) return new Response(row.body, { headers: { ...headers, 'x-copy': 'stale' } });
    return new Response(await up.text(), { status: up.status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  const body = await up.text();
  const res = new Response(body, { headers: { ...headers, 'x-copy': 'fresh' } });
  if (body.length < MAX_KEEP) ctx.waitUntil(ctx.env.DB.prepare('INSERT OR REPLACE INTO sefaria_cache (key, body, created_at) VALUES (?, ?, ?)').bind(key, body, Date.now()).run().then(() => {}));
  if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
