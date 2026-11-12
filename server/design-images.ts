// Design's image tool – the owner's decision via vision: "one visual style for everything; images are made through the
// Gemini API". Design writes the prompts and chooses; this sends them, with our own pictures as style references, to
// GEMINI_IMAGE_MODEL, and keeps each result in MEDIA under design/<batch>/<i> for design to pick and cut.
//   * the owner only (requireOwner – design uses it on its dev server with the dev sign-in, so not the room's passkey)
//   * references: only our own public pictures (/assets/…, /figures/…), read through the Worker's own assets
//   * each image is metered as "design-image"; a daily cap (the setting design.images_per_day) so a loop cannot run up a bill
// Rules and tests: design-images-rules.ts, test-design-images.mjs.

import { Ctx, HttpError, body, json, requireOwner, uid } from './core';
import { metered } from './meter';
import { costOf, UsageRow } from './prices';
import { setting } from './settings';
import * as R from './design-images-rules';

const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const today = () => new Date().toISOString().slice(0, 10);

/** one of our own pictures, read through the Worker's static assets (never from outside) */
async function asset(ctx: Ctx, path: string): Promise<{ mime: string; data: string }> {
  const assets = (ctx.env as unknown as { ASSETS?: Fetcher }).ASSETS;
  const r = assets ? await assets.fetch(new Request(new URL(path, ctx.url.origin))) : null;
  const mime = r?.headers.get('content-type')?.split(';')[0] || '';
  if (!r || !r.ok || !/^image\/(png|jpeg|webp)$/.test(mime)) throw new HttpError(400, 'ref_not_found');
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > 7 * 1024 * 1024) throw new HttpError(400, 'ref_too_large');
  return { mime, data: b64(bytes) };
}

/** POST /api/design/images {prompt, refs, aspect, n} → {batch, images: [{i, url}], left} */
export async function make(ctx: Ctx) {
  const u = requireOwner(ctx);
  let ask: R.Ask;
  try { ask = R.cleanAsk(await body<Record<string, unknown>>(ctx.req)); } catch (e) { throw new HttpError(400, (e as Error).message); }
  if (!ctx.env.GEMINI_API_KEY) throw new HttpError(503, 'images_not_configured');
  const cap = await setting<number>(ctx.env, 'design.images_per_day');
  const made = (await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM design_images WHERE day = ?').bind(today()).first<{ n: number }>())?.n || 0;
  let left: number;
  try { left = R.allowedNow(cap, made, ask.n); } catch (e) { throw new HttpError(429, (e as Error).message); }
  if (!ctx.env.MEDIA) throw new HttpError(503, 'no_media_bucket');

  const refs = await Promise.all(ask.refs.map((p) => asset(ctx, p)));
  const model = ctx.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
  const base = (ctx.env.DEV_MODE === '1' && ctx.env.GEMINI_BASE_URL) || 'https://generativelanguage.googleapis.com';
  const batch = R.batchName(today(), uid()), started = Date.now();
  const images: { i: number; url: string }[] = [], failed: string[] = [];
  for (let i = 1; i <= ask.n; i++) {
    // metered as its own kind, so the cost report shows what design's pictures cost
    const res = await metered({ env: ctx.env, email: u.email, feature: 'design-image', waitUntil: ctx.waitUntil.bind(ctx) }, () => fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': ctx.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: ask.prompt }, ...refs.map((r) => ({ inline_data: { mime_type: r.mime, data: r.data } }))] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ask.aspect } },
      }),
    }));
    if (!res.ok) { failed.push(`${i}: ${res.status}`); console.error('design image', res.status, (await res.text().catch(() => '')).slice(0, 300)); continue; }
    const data = await res.json();
    const usd = costOf(R.usageOf(model, Date.now(), data));          // this picture's own cost, kept with it
    const pic = R.imageOf(data);
    if ('why' in pic) { failed.push(`${i}: ${pic.why}`); continue; }
    const bytes = Uint8Array.from(atob(pic.b64), (c) => c.charCodeAt(0));
    await ctx.env.MEDIA.put(`design/${batch}/${i}.${R.extOf(pic.mime)}`, bytes, { httpMetadata: { contentType: pic.mime } });
    await ctx.env.DB.prepare('INSERT INTO design_images (batch, i, day, prompt, refs, aspect, mime, size, by_email, created_at, usd, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(batch, i, today(), ask.prompt, JSON.stringify(ask.refs), ask.aspect, pic.mime, bytes.length, u.email, Date.now(), usd, started).run();
    images.push({ i, url: `/api/design/images/${batch}/${i}` });
  }
  if (!images.length) throw new HttpError(502, 'images_failed: ' + failed.join('; ').slice(0, 300));
  return json({ batch, images, failed, left: left + (ask.n - images.length) });
}

/** GET /api/design/images/:batch/:i – the picture itself */
export async function picture(ctx: Ctx) {
  requireOwner(ctx);
  const batch = ctx.params.batch, i = Number(ctx.params.i);
  if (!R.isBatch(batch) || !Number.isInteger(i) || i < 1 || i > 4) throw new HttpError(404, 'not_found');
  const row = await ctx.env.DB.prepare('SELECT mime FROM design_images WHERE batch = ? AND i = ?').bind(batch, i).first<{ mime: string }>();
  const obj = row && ctx.env.MEDIA ? await ctx.env.MEDIA.get(`design/${batch}/${i}.${R.extOf(row.mime)}`) : null;
  if (!obj) throw new HttpError(404, 'not_found');
  return new Response(obj.body, { headers: { 'content-type': row!.mime, 'cache-control': 'private, max-age=86400', 'content-disposition': `inline; filename="${batch}-${i}.${R.extOf(row!.mime)}"` } });
}

/** GET /api/design/images – the batches (prompt, references, when, how many, what they cost), so nothing is made twice */
export async function list(ctx: Ctx) {
  requireOwner(ctx);
  const { results } = await ctx.env.DB.prepare(`SELECT batch, MIN(prompt) AS prompt, MIN(refs) AS refs, MIN(aspect) AS aspect, COUNT(*) AS n, GROUP_CONCAT(i) AS made,
      MIN(created_at) AS first, MAX(created_at) AS last, MIN(started_at) AS started, SUM(usd) AS usd, COUNT(usd) AS priced
    FROM design_images GROUP BY batch ORDER BY first DESC LIMIT 100`).all<{ batch: string; prompt: string; refs: string; aspect: string; n: number; made: string; first: number; last: number; started: number | null; usd: number | null; priced: number }>();
  // a batch's cost: the sum of its own pictures' costs. Batches made before that was kept: each metered call goes to one
  // batch only, the latest one started by then. Their start, when it is not known: 3 seconds before the first picture
  // (a call's meter row is written just before its picture is kept, and a call takes 8–10 seconds)
  const old = results.filter((b) => b.priced < b.n);
  const fromMeter: Record<string, number> = {};
  if (old.length) {
    const starts = results.map((b) => ({ batch: b.batch, start: b.started ?? b.first - 3e3 }));
    const { results: usage } = await ctx.env.DB.prepare("SELECT at, model, provider, input, output, cache_write, cache_read, searches, grounded, audio_out, image_out FROM ai_usage WHERE feature = 'design-image' AND at >= ?")
      .bind(Math.min(...starts.map((s) => s.start))).all<UsageRow & { at: number }>();
    for (const x of usage) { const b = R.batchOf(x.at, starts); if (b) fromMeter[b] = (fromMeter[b] || 0) + (costOf(x) ?? 0); }
  }
  const made = (await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM design_images WHERE day = ?').bind(today()).first<{ n: number }>())?.n || 0;
  return json({
    today: made, cap: await setting<number>(ctx.env, 'design.images_per_day'),
    batches: results.map((b) => ({
      batch: b.batch, prompt: b.prompt, refs: JSON.parse(b.refs || '[]'), aspect: b.aspect, n: b.n, at: b.first,
      usd: Math.round((b.priced === b.n ? b.usd || 0 : fromMeter[b.batch] || 0) * 10000) / 10000,
      images: String(b.made || '').split(',').filter(Boolean).map(Number).sort((x, y) => x - y).map((i) => `/api/design/images/${b.batch}/${i}`),
    })),
  });
}
