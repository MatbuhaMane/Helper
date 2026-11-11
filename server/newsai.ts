// The news section's smart parts: headlines translated alone, the same story matched across independent sources
// (corroboration), an article checked against the web, a web search on a topic, and a search for new sources.

import { z } from 'zod';
import { aiJson, geminiGrounded, jsonIn, resolveRedirect } from './ai';
import { Ctx, HttpError, body, json, requireUser, sha1Hex } from './core';
import { DEFAULT_FEEDS, feedsOf, ownerOf } from './news';

/* ---------------- headlines only, into Hebrew ---------------- */

/** POST /api/news/titles {items:[{id, title}]} -> {titles: {id: title_he}} (cached per article). */
export async function translateTitles(ctx: Ctx) {
  requireUser(ctx);
  const b = await body<{ items: { id: string; title: string }[] }>(ctx.req);
  const items = (Array.isArray(b.items) ? b.items : []).filter((i) => i && i.id && i.title).slice(0, 40).map((i) => ({ id: String(i.id).slice(0, 64), title: String(i.title).slice(0, 300) }));
  if (!items.length) return json({ titles: {} });
  const out: Record<string, string> = {};
  const marks = items.map(() => '?').join(',');
  const { results } = await ctx.env.DB.prepare(`SELECT id, title_he FROM news_title_tr WHERE id IN (${marks})`).bind(...items.map((i) => i.id)).all<any>();
  for (const r of results) out[r.id] = r.title_he;
  const missing = items.filter((i) => !out[i.id]);
  if (missing.length) {
    const t = await aiJson(ctx.env, {
      prefer: 'gemini', fast: true,
      system: 'You translate news headlines into short, natural Hebrew headlines, faithfully and neutrally (keep the source\'s own terms; do not add or soften). Keep the same order and numbering.',
      prompt: missing.map((i, n) => `${n + 1}. ${i.title}`).join('\n'),
      schema: z.object({ titles: z.array(z.string()) }),
    });
    const now = Date.now();
    const stmts = [];
    for (let n = 0; n < missing.length; n++) {
      const he = (t.titles[n] || '').trim().replace(/^\d+\s*[.)\-:]\s*/, '');
      if (!he) continue;
      out[missing[n].id] = he;
      stmts.push(ctx.env.DB.prepare('INSERT INTO news_title_tr (id, title_he, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(missing[n].id, he, now));
    }
    if (stmts.length) await ctx.env.DB.batch(stmts);
  }
  return json({ titles: out });
}

/* ---------------- the same story in independent sources ---------------- */

/**
 * POST /api/news/corroborate {items:[{id, title, feedId}]} -> {byId: {id: {others: n, outlets: [...]}}}
 * Headlines (in any language) about the same specific event are grouped; an article is corroborated by the other
 * outlets in its group (a newsroom's site and its Telegram channel are one outlet). Cached for half an hour.
 */
export async function corroborate(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ items: { id: string; title: string; feedId: string }[] }>(ctx.req);
  const items = (Array.isArray(b.items) ? b.items : []).filter((i) => i && i.id && i.title).slice(0, 160);
  if (items.length < 2) return json({ byId: {} });
  const feeds = new Map((await feedsOf(ctx, u.email)).map((f) => [f.id, f]));
  const cache = (caches as any).default as Cache;
  const key = new Request(`https://corroborate.helper/${await sha1Hex(items.map((i) => i.id).sort().join(','))}`);
  const hit = await cache.match(key);
  let groups: number[][];
  if (hit) groups = await hit.json();
  else {
    const res = await aiJson(ctx.env, {
      prefer: 'gemini', fast: true,
      system: `You group news headlines that report the SAME specific event or statement (the same incident, decision or announcement), whatever the language (Hebrew, Arabic, English).
Different events on the same broad topic are NOT the same story. Return only groups of 2 or more, as lists of the headline numbers.`,
      prompt: items.map((i, n) => `${n + 1}. ${i.title.slice(0, 200)}`).join('\n'),
      schema: z.object({ groups: z.array(z.array(z.number())) }),
    });
    groups = res.groups.map((g) => [...new Set(g.map((n) => n - 1).filter((n) => n >= 0 && n < items.length))]).filter((g) => g.length > 1);
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(groups), { headers: { 'cache-control': 'max-age=1800', 'content-type': 'application/json' } })));
  }
  const byId: Record<string, { others: number; outlets: string[] }> = {};
  for (const g of groups) {
    const members = g.map((n) => ({ item: items[n], feed: feeds.get(items[n].feedId) })).filter((m) => m.feed);
    for (const m of members) {
      const mine = ownerOf(m.feed!.url);
      const outlets = new Map<string, string>();
      for (const o of members) { const w = ownerOf(o.feed!.url); if (w !== mine && !outlets.has(w)) outlets.set(w, o.feed!.title); }
      byId[m.item.id] = { others: outlets.size, outlets: [...outlets.values()].slice(0, 6) };
    }
  }
  return json({ byId });
}

/* ---------------- one article, checked on the web ---------------- */

const VERIFY_SYSTEM = `You are a careful, neutral fact-checker for an Israeli family. Check the news item against INDEPENDENT sources on the web (other outlets, not the same newsroom or its own channels; official statements count as one side).
Answer with ONLY a JSON object:
{"status":"confirmed|partly|unconfirmed|disputed|false","rating":1-5,"explanation_he":"2-3 short Hebrew sentences: what independent sources say, and what is not confirmed","sources":[{"outlet":"name","url":"address from your search results"}]}
- confirmed: several independent sources report the same core facts (rating 5, or 4 if only one strong independent source).
- partly: the core is reported elsewhere but details differ or are one-sided (rating 3).
- unconfirmed: no independent source found yet; may simply be too new (rating 2).
- disputed: independent sources contradict important parts (rating 2).
- false: shown to be false by reliable sources (rating 1).
Judge the facts, not the politics; treat every side by the same standard.`;

/** POST /api/news/verify {id, title, summary, link, feed, date} -> {status, rating, explanation_he, sources} (cached per article). */
export async function verify(ctx: Ctx) {
  requireUser(ctx);
  const b = await body<{ id: string; title: string; summary?: string; link: string; feed?: string; date?: number }>(ctx.req);
  if (!b.id || !b.title) throw new HttpError(400, 'Missing article');
  const hit = await ctx.env.DB.prepare('SELECT data, created_at FROM news_verifications WHERE item_id = ?').bind(b.id).first<{ data: string; created_at: number }>();
  // An "unconfirmed" result may change as the story spreads: check again after six hours.
  if (hit) { const d = JSON.parse(hit.data); if (d.status !== 'unconfirmed' || Date.now() - hit.created_at < 6 * 3600e3) return json(d); }
  const { text, sources } = await geminiGrounded(ctx.env, {
    system: VERIFY_SYSTEM,
    prompt: `News item from "${b.feed || ''}" (${b.date ? new Date(b.date).toISOString().slice(0, 16) : 'recent'}):\nHeadline: ${b.title}\n${(b.summary || '').slice(0, 1200)}\nLink: ${b.link}`,
  });
  const r = jsonIn(text);
  const status = ['confirmed', 'partly', 'unconfirmed', 'disputed', 'false'].includes(r.status) ? r.status : 'unconfirmed';
  const mine = ownerOf(b.link || '');
  // The sources it names (Google's grounding links, resolved to the real pages), then any Google listed itself.
  const named = (Array.isArray(r.sources) ? r.sources : []).slice(0, 8);
  const urls = await Promise.all(named.map((s: any) => resolveRedirect(String(s?.url || ''))));
  const all = [...named.map((s: any, n: number) => ({ url: urls[n], title: String(s?.outlet || '') })), ...sources];
  const seen = new Set<string>();
  const data = {
    status,
    rating: Math.max(1, Math.min(5, Math.round(Number(r.rating)) || 2)),
    explanation_he: String(r.explanation_he || '').slice(0, 800),
    sources: all.filter((s) => /^https?:\/\//.test(s.url) && ownerOf(s.url) !== mine && !seen.has(s.url) && seen.add(s.url)).map((s) => ({ url: s.url, title: s.title || host(s.url) })).slice(0, 6),
    at: Date.now(),
  };
  await ctx.env.DB.prepare('INSERT INTO news_verifications (item_id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(item_id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at')
    .bind(b.id, JSON.stringify(data), Date.now()).run();
  return json(data);
}

/* ---------------- a topic, searched on the web ---------------- */

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** GET /api/news/websearch?q=&days= -> {articles:[{id, title, feed, link, date, summary, lang}]} from a grounded Gemini search (cached an hour). */
export async function webSearch(ctx: Ctx) {
  requireUser(ctx);
  const q = (ctx.url.searchParams.get('q') || '').trim().slice(0, 120);
  if (q.length < 2) throw new HttpError(400, 'Query too short');
  const days = Math.max(1, Math.min(365, Number(ctx.url.searchParams.get('days')) || 120));
  const cache = (caches as any).default as Cache;
  const key = new Request(`https://news-websearch.helper/${encodeURIComponent(q.toLowerCase())}/${days}`);
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, { headers: { 'content-type': 'application/json' } });
  const { text, sources } = await geminiGrounded(ctx.env, {
    system: `You find news articles on the web for an Israeli family. Search in Hebrew, English and Arabic as fits the topic. Prefer reliable newsrooms and a range of sides.
Answer with ONLY a JSON object: {"articles":[{"title":"the article's own headline","source":"outlet name","url":"the article's address","date":"YYYY-MM-DD","summary_he":"one short neutral Hebrew sentence","lang":"he|en|ar|..."}]}
Up to 12 articles, newest first, all from the last ${days} days. Use only addresses from your search results.`,
    prompt: `Topic: ${q}`,
  });
  let parsed: any = { articles: [] };
  try { parsed = jsonIn(text); } catch { /* keep empty */ }
  const real = new Map(sources.map((s) => [s.url, s]));
  const byHost = new Map<string, string>();
  for (const s of sources) if (!byHost.has(host(s.url))) byHost.set(host(s.url), s.url);
  const seen = new Set<string>();
  const articles = [];
  const list = (Array.isArray(parsed.articles) ? parsed.articles : []).slice(0, 16);
  // The model often writes Google's own grounding links: those are real search results, resolved here to the article.
  const resolved = await Promise.all(list.map((a: any) => (/grounding-api-redirect|vertexaisearch/.test(a.url || '') ? resolveRedirect(a.url) : Promise.resolve(''))));
  for (let n = 0; n < list.length; n++) {
    const a = list[n];
    // Only pages the search really returned: a grounding link, the exact address, or the page it returned on that site.
    const url = resolved[n] || (real.has(a.url) ? a.url : byHost.get(host(a.url || '')) || '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    articles.push({
      id: 'web:' + (await sha1Hex(url)), title: String(a.title || '').slice(0, 300), feed: String(a.source || host(url)).slice(0, 80), link: url,
      date: Date.parse(a.date) || Date.now(), summary: String(a.summary_he || '').slice(0, 400), lang: String(a.lang || '').slice(0, 5) || undefined, kind: 'websearch', image: null,
    });
  }
  const out = JSON.stringify({ articles });
  ctx.waitUntil(cache.put(key, new Response(out, { headers: { 'cache-control': 'max-age=3600', 'content-type': 'application/json' } })));
  return new Response(out, { headers: { 'content-type': 'application/json' } });
}

/* ---------------- finding new sources ---------------- */

/** POST /api/news/find-sources {q, lang, country, kind} -> {sources:[{name, url, kind, lang, country, description_he, quality, category, recommended}]} */
export async function findSources(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ q?: string; lang?: string; country?: string; kind?: string }>(ctx.req);
  const q = (b.q || '').trim().slice(0, 120);
  const have = new Set((await feedsOf(ctx, u.email)).map((f) => f.url));
  const wants = (s: { lang: string; country: string; kind: string; title?: string; folder?: string }) =>
    (!b.lang || s.lang === b.lang) && (!b.country || s.country === b.country) && (!b.kind || s.kind === b.kind);
  // Our own recommended sources first (the ones not added yet).
  const recommended = DEFAULT_FEEDS.filter((f) => !have.has(f.url) && wants(f) && (!q || `${f.title} ${f.folder} ${f.country}`.includes(q)))
    .map((f) => ({ name: f.title, url: f.url, kind: f.kind, lang: f.lang, country: f.country, description_he: 'מקור מומלץ שבדקנו', quality: f.quality, category: f.category, recommended: true }));
  if (!q) return json({ sources: recommended });
  const filters = [b.lang && `language: ${b.lang}`, b.country && `country: ${b.country}`, b.kind && `kind: ${b.kind === 'telegram' ? 'public Telegram channels only' : 'news websites only'}`].filter(Boolean).join('; ');
  const { text, sources } = await geminiGrounded(ctx.env, {
    system: `You recommend news sources for an Israeli family's reader: news websites (which usually have RSS) and PUBLIC Telegram news channels.
Answer with ONLY a JSON object: {"sources":[{"name":"","url":"the site's home page, or https://t.me/<channel> for Telegram","kind":"web|telegram","lang":"he|en|ar|...","country_he":"country in Hebrew","description_he":"one short Hebrew line","quality":1-5,"category":"editorial|official|journalist|aggregator|activist"}]}
quality uses one rubric for every side: 5 newsroom of record, 4 established newsroom, 3 official body or mixed newsroom, 2 unofficial flash channel or a network with an agenda, 1 known for fabrication.
Up to 10 real, currently active sources. No Facebook pages (they cannot be read from outside).`,
    prompt: `Looking for: ${q}${filters ? `\nFilters: ${filters}` : ''}`,
  });
  let parsed: any = { sources: [] };
  try { parsed = jsonIn(text); } catch { /* keep empty */ }
  const hosts = new Set(sources.map((s) => host(s.url)));
  const found = [];
  for (const s of (Array.isArray(parsed.sources) ? parsed.sources : []).slice(0, 12)) {
    const url = String(s.url || '');
    if (!/^https?:\/\//.test(url) || have.has(url)) continue;
    const kind = /t\.me\//.test(url) ? 'telegram' : 'web';
    // Websites must be among the pages the search returned; Telegram channels are checked when added.
    if (kind === 'web' && hosts.size && !hosts.has(host(url))) continue;
    const item = { name: String(s.name || host(url)).slice(0, 80), url, kind, lang: String(s.lang || '').slice(0, 5), country: String(s.country_he || '').slice(0, 40),
      description_he: String(s.description_he || '').slice(0, 200), quality: Math.max(1, Math.min(5, Math.round(Number(s.quality)) || 3)), category: s.category || null, recommended: false };
    if (wants({ lang: item.lang, country: item.country, kind })) found.push(item);
  }
  return json({ sources: [...recommended, ...found] });
}
