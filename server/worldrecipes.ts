// Recipes from all over the world: Claude searches the web in the languages the dish is cooked in,
// the results come back ranked by relevance, and an opened recipe is translated into comfortable Hebrew
// (metric units, clear steps) by Gemini, falling back to Claude. Both searches and translations are cached.

import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlock, BetaMessageParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, HttpError, body, json, requireUser } from './core';
import { recipeFromJsonLd } from './kitchen';
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
2. Use 3-6 searches. Prefer real recipe pages (a single recipe with ingredients and steps) from good cooking sites and well-known cooks,
   not listicles, category pages, videos only, or shops.
3. Pick up to 12 distinct recipes, with a mix of countries and languages when the request allows it.

Answer with ONLY a JSON object, no prose before or after:
{"results":[{"url":"...","title":"title as on the page","title_he":"natural Hebrew name","site":"site or cook name","lang":"page language in Hebrew","country":"country of the dish/site in Hebrew","snippet_he":"one short Hebrew line on what is special about this version","relevance":0-100}]}
Use only URLs that appeared in your search results. "relevance" is how well the page matches what was asked (an authentic, complete recipe of exactly that dish scores highest).`;

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

/** og:image of a page, quickly (a few hundred KB at most, a short timeout); null when it can't be had. */
async function ogImage(url: string): Promise<string | null> {
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
    return json({ results: JSON.parse(cached.results), cached: true });
  }
  if (!ctx.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'ai_not_configured');

  const client = new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY, maxRetries: 1, ...(ctx.env.DEV_MODE === '1' && ctx.env.ANTHROPIC_BASE_URL ? { baseURL: ctx.env.ANTHROPIC_BASE_URL } : {}) });
  const tools: BetaToolUnion[] = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 } as BetaToolUnion];
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
  const images = await Promise.all(results.map((r) => ogImage(r.url)));
  results.forEach((r, i) => { r.image = images[i]; });

  if (results.length) {
    await ctx.env.DB.prepare('INSERT INTO recipe_searches (q, results, created_at) VALUES (?, ?, ?) ON CONFLICT(q) DO UPDATE SET results = excluded.results, created_at = excluded.created_at')
      .bind(key, JSON.stringify(results), Date.now()).run();
  }
  return json({ results });
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
  const ld = recipeFromJsonLd(page.html, url);
  let material: string;
  if (ld && ld.ingredients.length) {
    material = JSON.stringify({ title: ld.title, description: ld.notes, ingredients: ld.ingredients.map((i) => [i.measure, i.name].filter(Boolean).join(' ')), steps: ld.steps });
  } else {
    const art = readable(page.html, url);
    material = `Page title: ${art?.title || ''}\n\n${(art?.textContent || '').replace(/\s+\n/g, '\n').slice(0, 28000)}`;
    if (material.length < 250) throw new HttpError(422, 'no_recipe_found');
  }
  const t = await aiJson(ctx.env, { prefer: 'gemini', system: TRANSLATE_SYSTEM, prompt: `Recipe page: ${url}\n\n${material}`, schema: Translated });
  if (!t.found || !t.ingredients.length) throw new HttpError(422, 'no_recipe_found');

  let host = '';
  try { host = new URL(page.finalUrl || url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
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
