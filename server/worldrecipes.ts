// Recipes from all over the world: Claude searches the web in the languages the dish is cooked in,
// the results come back ranked by relevance, and an opened recipe is translated into comfortable Hebrew
// (metric units, clear steps) by Gemini, falling back to Claude. Both searches and translations are cached.
// Without AI (docs/ai/without-ai.md #5): the page searches an open recipe database (TheMealDB, groceries/app.js), and a
// recipe page that holds a structured recipe opens as it is written, in its own language, with Google's translation.

import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlock, BetaMessageParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, HttpError, body, json, requireUser } from './core';
import { recipeFromJsonLd, recipeFromPage } from './recipe-parse';
import { fetchPage, readable } from './web';

const SEARCH_MODEL = 'claude-sonnet-5-5';
const SEARCH_TTL = 3 * 24 * 3600 * 1000;
const RECIPE_TTL = 60 * 24 * 3600 * 1000;

const Result = z.object({
  url: z.string(),
  title: z.string(),          // the title as written on the site, in its own language
  title_he: z.string(),
  site: z.string(),
  lang: z.string(),           // the page's language, in Hebrew ("איטלקית")
  country: z.string(),        // where the dish or site is from, in Hebrew
  snippet_he: z.string(),     // one line on what makes it worth opening
  relevance: z.number(),      // 0-100
});
type Result = z.infer<typeof Result> & { image?: string | null };

const SEARCH_SYSTEM = `You find home-cooking recipes on the open web for an Israeli family that wants recipes from all over the world.

For the user's request (often in Hebrew):
1. Work out the dish and the cuisines it belongs to, then search in those cuisines' own languages as well as English and Hebrew.
   Examples: carbonara -> Italian ("spaghetti alla carbonara ricetta"), ramen -> Japanese ("ラーメン レシピ"), shakshuka -> Hebrew, Arabic, English;
   a general request like "chicken thighs" -> several languages and styles (Thai, Indian, French, Mexican, Persian, Georgian...).
2. Use 2-4 searches. Prefer real recipe pages (a single recipe with ingredients and steps) from good cooking sites and well-known cooks,
   not listicles, category pages, videos only, or shops.
3. Pick 8-12 distinct recipes when the web has them (fewer only if there truly aren't more), with a mix of countries and languages when the request allows it.

Answer with ONLY a JSON object, no prose before or after:
{"results":[{"url":"...","title":"title as on the page","title_he":"natural Hebrew name","site":"site or cook name","lang":"page language in Hebrew","country":"country of the dish/site in Hebrew","snippet_he":"one short Hebrew line on what is special about this version","relevance":0-100}]}
Use only URLs that appeared in your search results. "relevance" is how well the page matches what was asked (an authentic, complete recipe of exactly that dish scores highest).
List the results best first: they are shown to the family one by one as you write them.`;

function normUrl(u: string) {
  try {
    const x = new URL(u);
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/.test(k)) x.searchParams.delete(k);
    return x.href.replace(/\/$/, '');
  } catch { return u; }
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new HttpError(502, 'ai_bad_output');
  return JSON.parse(text.slice(start, end + 1));
}

/** A search hit worth showing while Claude is still choosing: a page on a site, not a video, a social post, a shop or a home page. */
function looksLikeRecipePage(url: string) {
  try {
    const u = new URL(url);
    if (/(^|\.)(youtube|youtu|facebook|instagram|tiktok|pinterest|twitter|x|amazon|reddit|wikipedia|quora)\./i.test(u.hostname + '.')) return false;
    return u.pathname.replace(/\/+$/, '').length > 6;
  } catch { return false; }
}

/* og:image per page, kept in the Cloudflare cache (a week; "none" a day), so a search that comes again does not fetch
   the same pages again. The key is an address on our own origin (the cache keeps only this zone's addresses). */
const OG_TTL = 7 * 86400, OG_NONE_TTL = 86400;
const ogKey = (origin: string, url: string) => `${origin}/__og/${encodeURIComponent(normUrl(url))}`;
/** the cached og:image: a string, null for "the page has none", undefined when not cached (or no cache here) */
async function ogCached(origin: string, url: string): Promise<string | null | undefined> {
  try {
    const r = await caches.default.match(ogKey(origin, url));
    if (!r) return undefined;
    return ((await r.json()) as { image: string | null }).image ?? null;
  } catch { return undefined; }
}
/** og:image of a page: from the cache, else fetched and cached */
async function ogImage(ctx: Ctx, url: string): Promise<string | null> {
  const c = await ogCached(ctx.url.origin, url);
  if (c !== undefined) return c;
  const image = await fetchOgImage(url);
  try {
    const put = caches.default.put(ogKey(ctx.url.origin, url), new Response(JSON.stringify({ image }), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${image ? OG_TTL : OG_NONE_TTL}` } }));
    ctx.waitUntil(put.catch(() => {}));
  } catch { /* no cache here */ }
  return image;
}

/** og:image of a page, quickly (a few hundred KB at most, a short timeout); null when it can't be had. */
async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; FamilyHelperReader/1.0)', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(5000) });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    let html = '';
    const dec = new TextDecoder();
    while (html.length < 400_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    const m = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/i.exec(html)
      || /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i.exec(html);
    return m ? new URL(m[1].replace(/&amp;/g, '&'), url).href : null;
  } catch { return null; }
}

export async function search(ctx: Ctx) {
  requireUser(ctx);
  const q = (ctx.url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!q) throw new HttpError(400, 'Empty query');
  const key = q.toLowerCase();
  const cached = await ctx.env.DB.prepare('SELECT results, created_at FROM recipe_searches WHERE q = ?').bind(key).first<{ results: string; created_at: number }>();
  if (cached && Date.now() - cached.created_at < SEARCH_TTL && ctx.url.searchParams.get('fresh') !== '1') {
    // an image that was not ready when the search was saved may be in the cache by now (a cache read, never a fetch)
    const rs: Result[] = JSON.parse(cached.results);
    await Promise.all(rs.map(async (r) => { if (!r.image && r.url) r.image = (await ogCached(ctx.url.origin, r.url)) || null; }));
    return json({ results: rs, cached: true });
  }
  if (!ctx.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'ai_not_configured');

  const client = new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY, maxRetries: 1, ...(ctx.env.DEV_MODE === '1' && ctx.env.ANTHROPIC_BASE_URL ? { baseURL: ctx.env.ANTHROPIC_BASE_URL } : {}) });
  const tools: BetaToolUnion[] = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 } as BetaToolUnion];
  const messages: BetaMessageParam[] = [{ role: 'user', content: `Find recipes for: ${q}` }];
  const seen = new Map<string, { title: string; url: string }>();
  let text = '';
  for (let round = 0; round < 4; round++) {
    let res;
    try {
      res = await client.beta.messages.create({
        model: SEARCH_MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SEARCH_SYSTEM,
        tools,
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'claude_key_invalid');
      if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'ai_busy');
      if (err instanceof Anthropic.APIError) throw new HttpError(502, `claude_error_${err.status}`);
      throw err;
    }
    for (const block of res.content as BetaContentBlock[]) {
      if (block.type === 'web_search_tool_result' && Array.isArray((block as any).content)) {
        for (const r of (block as any).content) if (r.url) seen.set(normUrl(r.url), { title: r.title, url: r.url });
      }
      if (block.type === 'text') text += block.text;
    }
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content as any });
  }

  let parsed: { results: Result[] };
  try {
    parsed = z.object({ results: z.array(Result) }).parse(extractJson(text));
  } catch {
    throw new HttpError(502, 'ai_bad_output');
  }
  const unique = new Map<string, Result>();
  for (const r of parsed.results) {
    const n = normUrl(r.url);
    // Only pages the search actually returned: never a link the model made up.
    if (seen.size && !seen.has(n)) continue;
    if (!unique.has(n)) unique.set(n, { ...r, url: seen.get(n)?.url || r.url, relevance: Math.max(0, Math.min(100, Math.round(r.relevance))) });
  }
  const results = [...unique.values()].sort((a, b) => b.relevance - a.relevance).slice(0, 12);
  // the answer does not wait for the pictures: what is here within 1.5 s goes with it, the rest keeps loading into the
  // cache (waitUntil) and comes with the next look at this search
  const got: (string | null)[] = results.map(() => null);
  const all = Promise.all(results.map((r, i) => ogImage(ctx, r.url).then((img) => { got[i] = img; })));
  ctx.waitUntil(all.catch(() => {}));
  await Promise.race([all, new Promise((r) => setTimeout(r, 1500))]);
  results.forEach((r, i) => { r.image = got[i]; });

  if (results.length) {
    await ctx.env.DB.prepare('INSERT INTO recipe_searches (q, results, created_at) VALUES (?, ?, ?) ON CONFLICT(q) DO UPDATE SET results = excluded.results, created_at = excluded.created_at')
      .bind(key, JSON.stringify(results), Date.now()).run();
  }
  return json({ results });
}

/**
 * The same search, streamed as lines of JSON so the page can show each recipe the moment it is found:
 *   {"type":"searching","query":"..."}        a web search Claude is running (for the progress line)
 *   {"type":"result","result":{...}}          one recipe (Hebrew title, site, country, relevance)
 *   {"type":"image","url":"...","image":"..."} its picture, once fetched
 *   {"type":"done","cached":bool} | {"type":"error","error":"code"}
 */
export async function searchStream(ctx: Ctx) {
  requireUser(ctx);
  const q = (ctx.url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!q) throw new HttpError(400, 'Empty query');
  const key = q.toLowerCase();
  const fresh = ctx.url.searchParams.get('fresh') === '1';
  const cached = fresh ? null : await ctx.env.DB.prepare('SELECT results, created_at FROM recipe_searches WHERE q = ?').bind(key).first<{ results: string; created_at: number }>();
  const useCache = !!cached && Date.now() - cached.created_at < SEARCH_TTL;
  if (!useCache && !ctx.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'ai_not_configured');

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  let open = true;
  const send = (o: unknown) => { if (open) writer.write(enc.encode(JSON.stringify(o) + '\n')).catch(() => { open = false; }); };

  const work = (async () => {
    try {
      if (useCache) {
        const rs: Result[] = JSON.parse(cached!.results);
        await Promise.all(rs.map(async (r) => { if (!r.image && r.url) r.image = (await ogCached(ctx.url.origin, r.url)) || null; }));
        for (const r of rs) send({ type: 'result', result: r });
        send({ type: 'done', cached: true });
        return;
      }
      const results = await streamClaudeSearch(ctx, q, send);
      if (results.length) {
        await ctx.env.DB.prepare('INSERT INTO recipe_searches (q, results, created_at) VALUES (?, ?, ?) ON CONFLICT(q) DO UPDATE SET results = excluded.results, created_at = excluded.created_at')
          .bind(key, JSON.stringify(results), Date.now()).run();
      }
      send({ type: 'done', cached: false, count: results.length });
    } catch (err) {
      console.error('recipe search stream failed', err instanceof Error ? err.message : err);
      send({ type: 'error', error: err instanceof HttpError ? err.message : 'search_failed' });
    } finally {
      open = false;
      writer.close().catch(() => {});
    }
  })();
  ctx.waitUntil(work);
  return new Response(readable, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

/** Runs the search with streaming and hands each finished result (and later its image) to `send` as soon as it exists. */
async function streamClaudeSearch(ctx: Ctx, q: string, send: (o: unknown) => void): Promise<Result[]> {
  const client = new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY, maxRetries: 1, ...(ctx.env.DEV_MODE === '1' && ctx.env.ANTHROPIC_BASE_URL ? { baseURL: ctx.env.ANTHROPIC_BASE_URL } : {}) });
  const tools: BetaToolUnion[] = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 } as BetaToolUnion];
  const messages: BetaMessageParam[] = [{ role: 'user', content: `Find recipes for: ${q}` }];
  const seen = new Map<string, string>();      // normalized url -> url as the search returned it
  const found = new Map<string, Result>();
  const images: Promise<void>[] = [];
  const imageOf = new Map<string, Promise<string | null>>();
  const ogImageOnce = (url: string) => {
    const n = normUrl(url);
    if (!imageOf.has(n)) imageOf.set(n, ogImage(ctx, url));
    return imageOf.get(n)!;
  };

  // A tiny scanner over the JSON answer as it streams in: every object directly inside "results" is emitted once it closes.
  let text = '', i = 0, depth = 0, inStr = false, esc = false, objStart = -1, started = false;
  const scan = () => {
    if (!started) {
      const at = text.indexOf('"results"');
      if (at < 0) return;
      started = true;
      i = at;
      depth = 1; // inside the outer object
    }
    for (; i < text.length; i++) {
      const c = text[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === '{') { depth++; if (depth === 2) objStart = i; }
      else if (c === '}') {
        if (depth === 2 && objStart >= 0) {
          try { emit(JSON.parse(text.slice(objStart, i + 1))); } catch { /* not a whole result */ }
          objStart = -1;
        }
        depth--;
      }
    }
  };
  const emit = (raw: unknown) => {
    const p = Result.safeParse(raw);
    if (!p.success) return;
    const n = normUrl(p.data.url);
    if ((seen.size && !seen.has(n)) || found.has(n)) return; // only pages the search really returned, each once
    const r: Result = { ...p.data, url: seen.get(n) || p.data.url, relevance: Math.max(0, Math.min(100, Math.round(p.data.relevance))) };
    found.set(n, r);
    send({ type: 'result', result: r });
    // The picture of a page that was already shown as a raw hit is fetched only once.
    images.push(ogImageOnce(r.url).then((img) => { r.image = img; if (img) send({ type: 'image', url: r.url, image: img }); }));
  };

  // Raw search hits are shown at once (original title, picture) while Claude is still choosing; the ranked list replaces them.
  const hits = new Set<string>();
  const hit = (url: string, title: string) => {
    const n = normUrl(url);
    if (hits.has(n) || found.has(n) || hits.size >= 14 || !looksLikeRecipePage(url)) return;
    hits.add(n);
    let site = '';
    try { site = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    send({ type: 'hit', hit: { url, title: String(title || site).slice(0, 200), site } });
    images.push(ogImageOnce(url).then((img) => { if (img) send({ type: 'image', url, image: img }); }));
  };

  for (let round = 0; round < 4; round++) {
    let toolInput = '';
    let inTool = false;
    const stream = client.beta.messages.stream({
      model: SEARCH_MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SEARCH_SYSTEM,
      tools,
      messages,
    } as any);
    try {
      for await (const ev of stream as AsyncIterable<any>) {
        if (ev.type === 'content_block_start') {
          const b = ev.content_block;
          inTool = b.type === 'server_tool_use' && b.name === 'web_search';
          toolInput = '';
          if (inTool && b.input?.query) { send({ type: 'searching', query: b.input.query }); inTool = false; }
          if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
            for (const r of b.content) {
              if (!r.url) continue;
              seen.set(normUrl(r.url), r.url);
              hit(r.url, r.title);
            }
          }
        } else if (ev.type === 'content_block_delta') {
          if (ev.delta.type === 'input_json_delta') toolInput += ev.delta.partial_json;
          else if (ev.delta.type === 'text_delta') { text += ev.delta.text; scan(); }
        } else if (ev.type === 'content_block_stop' && inTool) {
          try { const query = JSON.parse(toolInput || '{}').query; if (query) send({ type: 'searching', query }); } catch { /* ignore */ }
          inTool = false;
        }
      }
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'claude_key_invalid');
      if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'ai_busy');
      throw err;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: final.content as any });
  }

  // If the answer wasn't scannable as it streamed, read it whole.
  if (!found.size && text) {
    try { for (const r of (extractJson(text) as any).results || []) emit(r); } catch { /* nothing usable */ }
  }
  await Promise.race([Promise.all(images), new Promise((r) => setTimeout(r, 6000))]);
  return [...found.values()].sort((a, b) => b.relevance - a.relevance);
}

const Translated = z.object({
  found: z.boolean(),
  title_he: z.string(),
  title_original: z.string(),
  lang: z.string(),
  country: z.string(),
  servings: z.string(),
  time: z.string(),
  description_he: z.string(),
  ingredients: z.array(z.object({ name: z.string(), measure: z.string() })),
  steps: z.array(z.string()),
  notes: z.string(),
});

const TRANSLATE_SYSTEM = `You turn a recipe from any language into a clear, natural Hebrew recipe for an Israeli home kitchen.
- Translate everything into fluent everyday Hebrew (not word-for-word). Keep a well-known foreign dish name when Israelis use it (קרבונרה, ראמן).
- Ingredients: "name" is the ingredient in Hebrew, with a short note in parentheses only when it helps to buy it (e.g. "גבינת פקורינו רומנו (אפשר פרמזן)").
  "measure" is the amount: convert cups/oz/lb/sticks/°F to metric (גרם, מ"ל, °C); keep כף/כפית/כוס when that is how Israelis measure it; use ½ ¼ ¾ for fractions; empty when there is no amount.
- Steps: one action per step, in order, short and clear, with temperatures in °C and times in minutes. Drop ads, stories and "jump to recipe" text.
- notes: tips or substitutions from the page worth keeping, in Hebrew (or empty).
- lang: the page's language in Hebrew; country: the dish's or site's country in Hebrew; servings and time in short Hebrew ("4 מנות", "45 דקות"), empty if unknown.
- If the material holds no actual recipe, set found=false.`;

export async function open(ctx: Ctx) {
  requireUser(ctx);
  const b = await body<{ url: string; site?: string; country?: string }>(ctx.req);
  const url = String(b.url || '');
  if (!/^https?:\/\//.test(url)) throw new HttpError(400, 'Invalid URL');
  const cached = await ctx.env.DB.prepare('SELECT data, created_at FROM web_recipes WHERE url = ?').bind(normUrl(url)).first<{ data: string; created_at: number }>();
  if (cached && Date.now() - cached.created_at < RECIPE_TTL) return json({ recipe: JSON.parse(cached.data), cached: true });

  const page = await fetchPage(url);
  // what the page itself holds (its structured recipe, or the lists under its headings) is cleaner material than the raw text
  const ld = recipeFromJsonLd(page.html, url) || recipeFromPage(page.html, url);
  let material: string;
  if (ld && ld.ingredients.length) {
    material = JSON.stringify({ title: ld.title, description: ld.notes, ingredients: ld.ingredients.map((i) => [i.measure, i.name].filter(Boolean).join(' ')), steps: ld.steps });
  } else {
    const art = readable(page.html, url);
    material = `Page title: ${art?.title || ''}\n\n${(art?.textContent || '').replace(/\s+\n/g, '\n').slice(0, 28000)}`;
    if (material.length < 250) throw new HttpError(422, 'no_recipe_found');
  }
  const t = await aiJson(ctx.env, { prefer: 'gemini', fast: true, effort: 'low', system: TRANSLATE_SYSTEM, prompt: `Recipe page: ${url}\n\n${material}`, schema: Translated }).catch(() => null);

  let host = '';
  try { host = new URL(page.finalUrl || url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  if (!t) {
    // no AI to translate: the page's own structured recipe, as written (not kept, so it is translated once there is AI)
    if (!ld || !ld.ingredients.length) throw new HttpError(503, 'ai_not_configured');
    const site = (b.site || host).trim();
    return json({ recipe: {
      title: ld.title || site, subtitle: `מקור: ${site} · בשפת המקור (בלי תרגום)`, image: ld.image || page.image || null, source_url: url,
      ingredients: ld.ingredients.filter((i) => i.name.trim()), steps: ld.steps.filter((s) => s.trim()), notes: ld.notes || null, tags: [],
      meta: { site, untranslated: true, translate: `https://translate.google.com/translate?sl=auto&tl=iw&u=${encodeURIComponent(url)}` },
    } });
  }
  if (!t.found || !t.ingredients.length) throw new HttpError(422, 'no_recipe_found');
  const site = (b.site || host).trim();
  const country = (t.country || b.country || '').trim();
  const recipe = {
    title: t.title_he,
    subtitle: `מקור: ${site}${country ? ` (${country})` : ''}${t.title_original && t.title_original !== t.title_he ? ` · ${t.title_original}` : ''}`,
    image: ld?.image || page.image || null,
    source_url: url,
    ingredients: t.ingredients.filter((i) => i.name.trim()),
    steps: t.steps.filter((s) => s.trim()),
    notes: [t.description_he, t.notes].filter((s) => s && s.trim()).join('\n\n') || null,
    tags: [],
    meta: { site, original_title: t.title_original, lang: t.lang, country, servings: t.servings, time: t.time },
  };
  await ctx.env.DB.prepare('INSERT INTO web_recipes (url, data, created_at) VALUES (?, ?, ?) ON CONFLICT(url) DO UPDATE SET data = excluded.data, created_at = excluded.created_at')
    .bind(normUrl(url), JSON.stringify(recipe), Date.now()).run();
  return json({ recipe });
}
