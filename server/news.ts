// News reader: per-user sources (websites with RSS/Atom and public Telegram channels), each with its language,
// country, kind and a quality/reliability rating; aggregation with edge caching; read/starred state; a history of
// every article seen (searchable); an embedded reader view, AI summaries and translation into Hebrew.

import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, HttpError, body, json, requireUser, sha1Hex, uid } from './core';
import { feedMedia, lead } from './news-plain';
import { fetchText, readable, sanitize } from './web';

/**
 * Quality and reliability, 1-5, by one rubric for every source whatever its side:
 *   5  a newsroom of record with strict editorial standards and corrections
 *   4  an established newsroom with editorial standards
 *   3  an official body (reliable for the official position, not independent), or a mixed newsroom
 *   2  an unofficial flash channel or a network with an agenda: fast, unverified, check before trusting
 *   1  known for fabrication
 * These are our defaults; every person can change a source's rating.
 */
export interface SourceInfo { title: string; url: string; folder: string; lang: string; country: string; kind: string; quality: number; category: string }

const tg = (handle: string) => `https://t.me/s/${handle}`;

export const DEFAULT_FEEDS: SourceInfo[] = [
  { folder: 'ישראל', title: 'ynet – מבזקים', url: 'https://www.ynet.co.il/Integration/StoryRss1854.xml', lang: 'he', country: 'ישראל', kind: 'web', quality: 4, category: 'editorial' },
  { folder: 'ישראל', title: 'ynet – חדשות', url: 'https://www.ynet.co.il/Integration/StoryRss2.xml', lang: 'he', country: 'ישראל', kind: 'web', quality: 4, category: 'editorial' },
  { folder: 'ישראל', title: 'וואלה! חדשות', url: 'https://rss.walla.co.il/feed/1', lang: 'he', country: 'ישראל', kind: 'web', quality: 3, category: 'editorial' },
  { folder: 'ישראל', title: 'מעריב', url: 'https://www.maariv.co.il/Rss/RssChadashot', lang: 'he', country: 'ישראל', kind: 'web', quality: 3, category: 'editorial' },
  { folder: 'ישראל', title: 'גלובס', url: 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=585', lang: 'he', country: 'ישראל', kind: 'web', quality: 4, category: 'editorial' },
  { folder: 'ישראל', title: 'The Times of Israel', url: 'https://www.timesofisrael.com/feed/', lang: 'en', country: 'ישראל', kind: 'web', quality: 4, category: 'editorial' },
  { folder: 'ישראל', title: 'The Jerusalem Post', url: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx', lang: 'en', country: 'ישראל', kind: 'web', quality: 4, category: 'editorial' },
  { folder: 'עולם', title: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', lang: 'en', country: 'בריטניה', kind: 'web', quality: 5, category: 'editorial' },
  { folder: 'עולם', title: 'The Guardian – World', url: 'https://www.theguardian.com/world/rss', lang: 'en', country: 'בריטניה', kind: 'web', quality: 4, category: 'editorial' },
  { folder: 'עולם', title: 'NYT – World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', lang: 'en', country: 'ארצות הברית', kind: 'web', quality: 5, category: 'editorial' },
  { folder: 'עולם', title: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', lang: 'en', country: 'קטאר', kind: 'web', quality: 3, category: 'editorial' },
  { folder: 'עולם', title: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all', lang: 'en', country: 'גרמניה', kind: 'web', quality: 4, category: 'editorial' },
  { folder: 'עולם', title: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', lang: 'en', country: 'ארצות הברית', kind: 'web', quality: 4, category: 'editorial' },
  // v2: public Telegram channels (checked active on 2026-11-11)
  { folder: 'טלגרם – ישראל', title: 'ynet חדשות', url: tg('ynetalerts'), lang: 'he', country: 'ישראל', kind: 'telegram', quality: 4, category: 'editorial' },
  { folder: 'טלגרם – ישראל', title: 'N12 צ׳אט הכתבים', url: tg('N12chat'), lang: 'he', country: 'ישראל', kind: 'telegram', quality: 4, category: 'editorial' },
  { folder: 'טלגרם – ישראל', title: 'i24NEWS בעברית', url: tg('i24news_he'), lang: 'he', country: 'ישראל', kind: 'telegram', quality: 4, category: 'editorial' },
  { folder: 'טלגרם – ישראל', title: 'עמית סגל', url: tg('amitsegal'), lang: 'he', country: 'ישראל', kind: 'telegram', quality: 3, category: 'journalist' },
  { folder: 'טלגרם – ישראל', title: 'צה״ל – הערוץ הרשמי', url: tg('idf_telegram'), lang: 'he', country: 'ישראל', kind: 'telegram', quality: 3, category: 'official' },
  { folder: 'טלגרם – ישראל', title: 'Israel Defense Forces', url: tg('idfofficial'), lang: 'en', country: 'ישראל', kind: 'telegram', quality: 3, category: 'official' },
  { folder: 'טלגרם – ישראל', title: 'פיקוד העורף', url: tg('PikudHaOref_all'), lang: 'he', country: 'ישראל', kind: 'telegram', quality: 3, category: 'official' },
  { folder: 'טלגרם – ישראל', title: 'אבו עלי אקספרס', url: tg('abualiexpress'), lang: 'he', country: 'ישראל', kind: 'telegram', quality: 2, category: 'aggregator' },
  { folder: 'טלגרם – פלסטין', title: 'סוכנות וופא (WAFA)', url: tg('WAFAgency'), lang: 'ar', country: 'פלסטין', kind: 'telegram', quality: 3, category: 'official' },
  { folder: 'טלגרם – פלסטין', title: 'סוכנות מען (Ma’an)', url: tg('maannews'), lang: 'ar', country: 'פלסטין', kind: 'telegram', quality: 3, category: 'editorial' },
  { folder: 'טלגרם – פלסטין', title: 'רשת קודס (QNN, ערבית)', url: tg('qudsn'), lang: 'ar', country: 'פלסטין', kind: 'telegram', quality: 2, category: 'activist' },
  { folder: 'טלגרם – פלסטין', title: 'Quds News Network (English)', url: tg('QudsNen'), lang: 'en', country: 'פלסטין', kind: 'telegram', quality: 2, category: 'activist' },
];
const SEED_VERSION = 2; // bump when adding recommended sources: each person receives the new ones once
const INFO = new Map(DEFAULT_FEEDS.map((f) => [f.url, f]));

const FEED_TTL = 600; // seconds
const MAX_FEEDS_PER_REFRESH = 40;
const HISTORY_DAYS = 120;

export interface NewsItem {
  id: string; feedId: string; feed: string; title: string; link: string; date: number; summary: string; image: string | null;
  image_full?: string | null;   // the feed's largest picture (the article's hero); image is the smallest fit for the list
  body?: string; lang?: string; kind?: string; quality?: number; country?: string;
  read?: boolean; starred?: boolean; hidden?: boolean;
  rating?: number | null;                                  // the person's own rating for this article
  verified?: { status: string; rating: number } | null;    // checked against independent sources on the web
}

/** Which outlet a source belongs to, so the same newsroom's site and Telegram channel never count as "independent" of each other. */
export function ownerOf(url: string): string {
  const u = url.toLowerCase();
  const known: [RegExp, string][] = [[/ynet/, 'ynet'], [/walla/, 'walla'], [/maariv/, 'maariv'], [/globes/, 'globes'], [/timesofisrael/, 'toi'], [/jpost/, 'jpost'],
    [/bbc/, 'bbc'], [/theguardian/, 'guardian'], [/nytimes/, 'nyt'], [/aljazeera|ajanews/, 'aljazeera'], [/dw\.com/, 'dw'], [/npr\.org/, 'npr'],
    [/n12|mako/, 'n12'], [/i24/, 'i24'], [/idf/, 'idf'], [/pikudhaoref/, 'oref'], [/amitsegal/, 'segal'], [/abualiexpress/, 'abuali'],
    [/wafa/, 'wafa'], [/maan/, 'maan'], [/qudsn/, 'quds']];
  for (const [re, name] of known) if (re.test(u)) return name;
  if (u.startsWith('https://t.me/s/')) return u.slice(15);
  try { return new URL(url).hostname.replace(/^www\./, '').split('.').slice(-3).join('.'); } catch { return u; }
}

/** he / ar / en, from the letters in a text. */
export function detectLang(s: string): string {
  const he = (s.match(/[֐-׿]/g) || []).length;
  const ar = (s.match(/[؀-ۿ]/g) || []).length;
  const la = (s.match(/[A-Za-z]/g) || []).length;
  if (he >= ar && he >= la && he > 0) return 'he';
  if (ar >= la && ar > 0) return 'ar';
  return 'en';
}
const kindOf = (url: string) => (/^https:\/\/t\.me\/s\//.test(url) ? 'telegram' : /facebook\.com/.test(url) ? 'facebook' : 'web');

/* ---------------- feeds ---------------- */

interface FeedRow { id: string; url: string; title: string; folder: string; position: number; lang: string | null; country: string | null; kind: string | null; quality: number | null; category: string | null }

function withInfo(f: FeedRow) {
  const d = INFO.get(f.url);
  return { ...f, lang: f.lang || d?.lang || null, country: f.country || d?.country || null, kind: f.kind || d?.kind || kindOf(f.url), quality: f.quality ?? d?.quality ?? 3, category: f.category || d?.category || null };
}

export async function feedsOf(ctx: Ctx, email: string): Promise<ReturnType<typeof withInfo>[]> {
  const db = ctx.env.DB;
  const seed = await db.prepare('SELECT version FROM news_seeds WHERE email = ?').bind(email).first<{ version: number }>();
  let { results } = await db.prepare('SELECT * FROM feeds WHERE email = ? ORDER BY folder, position').bind(email).all<FeedRow>();
  if ((seed?.version || 0) < SEED_VERSION) {
    // First visit: all the recommended sources. Later: only the ones added since, and only once.
    const have = new Set(results.map((r) => r.url));
    const fresh = results.length ? DEFAULT_FEEDS.filter((f) => f.kind === 'telegram' && !have.has(f.url)) : DEFAULT_FEEDS;
    const now = Date.now() % 1e9;
    await db.batch([
      ...fresh.map((f, i) => db.prepare('INSERT INTO feeds (email, id, url, title, folder, position, lang, country, kind, quality, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(email, uid(), f.url, f.title, f.folder, now + i, f.lang, f.country, f.kind, f.quality, f.category)),
      db.prepare('INSERT INTO news_seeds (email, version) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET version = excluded.version').bind(email, SEED_VERSION),
    ]);
    ({ results } = await db.prepare('SELECT * FROM feeds WHERE email = ? ORDER BY folder, position').bind(email).all<FeedRow>());
  }
  return results.map(withInfo);
}

export async function listFeeds(ctx: Ctx) {
  const u = requireUser(ctx);
  return json({ feeds: await feedsOf(ctx, u.email) });
}

/** A Telegram channel from "t.me/x", "@x" or a t.me link; null when the text is not one. */
function telegramHandle(raw: string): string | null {
  const m = /^(?:@|(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/(?:s\/)?)([A-Za-z0-9_]{4,64})\/?$/.exec(raw.trim());
  return m ? m[1] : null;
}

/** Add a source by its RSS URL, a website address (the feed is discovered from the page), or a public Telegram channel. */
export async function addFeed(ctx: Ctx) {
  const u = requireUser(ctx);
  const { url, folder } = await body<{ url: string; folder?: string }>(ctx.req);
  const raw = (url || '').trim();
  if (/facebook\.com|fb\.com/i.test(raw)) throw new HttpError(422, 'facebook_unsupported');
  const handle = telegramHandle(raw);
  let feedUrl: string, title: string, sample: string;
  if (handle) {
    const { text } = await fetchText(tg(handle));
    const parsed = parseTelegram(text, handle);
    if (!parsed.items.length && !/tgme_channel_info/.test(text)) throw new HttpError(422, 'no_telegram_channel');
    feedUrl = tg(handle);
    title = parsed.title || '@' + handle;
    sample = parsed.items.slice(0, 10).map((i) => i.title).join(' ');
  } else {
    const accept = 'application/rss+xml,application/atom+xml,application/xml,text/xml,text/html;q=0.8';
    let fetched;
    if (/^https?:\/\//.test(raw)) fetched = await fetchText(raw, accept);
    else {
      // Typed without a scheme: try https first, then plain http.
      try { fetched = await fetchText('https://' + raw, accept); } catch { fetched = await fetchText('http://' + raw, accept); }
    }
    const { text, finalUrl } = fetched;
    feedUrl = finalUrl;
    const isFeed = (t: string) => /<(rss|feed|rdf:RDF)[\s>]/i.test(t.slice(0, 5000));
    let parsed = parseFeed(text);
    if (!isFeed(text)) {
      const link = /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i.exec(text)?.[0];
      const href = link && /href=["']([^"']+)/i.exec(link)?.[1];
      if (!href) throw new HttpError(422, 'no_feed_found');
      feedUrl = new URL(href.replace(/&amp;/g, '&'), finalUrl).href;
      const feedText = (await fetchText(feedUrl, 'application/rss+xml,application/atom+xml,application/xml,text/xml')).text;
      if (!isFeed(feedText)) throw new HttpError(422, 'no_feed_found');
      parsed = parseFeed(feedText);
    }
    title = parsed.title || new URL(feedUrl).hostname;
    sample = parsed.items.slice(0, 10).map((i) => i.title).join(' ');
  }
  const d = INFO.get(feedUrl);
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO feeds (email, id, url, title, folder, position, lang, country, kind, quality, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(u.email, id, feedUrl, d?.title || title, (folder || d?.folder || 'שלי').slice(0, 40), Date.now() % 1e9,
      d?.lang || detectLang(sample || title), d?.country || null, kindOf(feedUrl), d?.quality ?? 3, d?.category || null).run();
  return json({ id, url: feedUrl, title });
}

export async function updateFeed(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ title?: string; folder?: string; lang?: string; country?: string; quality?: number }>(ctx.req);
  const q = b.quality == null ? null : Math.max(1, Math.min(5, Math.round(Number(b.quality)) || 3));
  await ctx.env.DB.prepare(`UPDATE feeds SET title = COALESCE(?, title), folder = COALESCE(?, folder), lang = COALESCE(?, lang),
      country = COALESCE(?, country), quality = COALESCE(?, quality) WHERE email = ? AND id = ?`)
    .bind(b.title?.slice(0, 100) ?? null, b.folder?.slice(0, 40) ?? null, b.lang?.slice(0, 8) ?? null, b.country?.slice(0, 40) ?? null, q, u.email, ctx.params.id).run();
  return json({ ok: true });
}

export async function deleteFeed(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM feeds WHERE email = ? AND id = ?').bind(u.email, ctx.params.id).run();
  return json({ ok: true });
}

/* ---------------- items ---------------- */

export async function stateFor(ctx: Ctx, email: string, items: NewsItem[]) {
  const state = new Map<string, { read: number; starred: number; hidden: number | null; rating: number | null }>();
  const checked = new Map<string, { status: string; rating: number }>();
  const ids = items.map((i) => i.id);
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const marks = chunk.map(() => '?').join(',');
    const [s, v] = await Promise.all([
      ctx.env.DB.prepare(`SELECT item_id, read, starred, hidden, rating FROM news_state WHERE email = ? AND item_id IN (${marks})`).bind(email, ...chunk).all<any>(),
      ctx.env.DB.prepare(`SELECT item_id, data FROM news_verifications WHERE item_id IN (${marks})`).bind(...chunk).all<any>(),
    ]);
    for (const r of s.results) state.set(r.item_id, r);
    for (const r of v.results) { try { const d = JSON.parse(r.data); checked.set(r.item_id, { status: d.status, rating: d.rating }); } catch { /* skip */ } }
  }
  for (const it of items) {
    const s = state.get(it.id);
    it.read = !!s?.read;
    it.starred = !!s?.starred;
    it.hidden = !!s?.hidden;
    it.rating = s?.rating ?? null;
    it.verified = checked.get(it.id) || null;
  }
}

export async function collectItems(ctx: Ctx, email: string, filter: { folder?: string | null; feedId?: string | null; feedIds?: string[] | null }) {
  let feeds = await feedsOf(ctx, email);
  if (!feeds.length) feeds = DEFAULT_FEEDS.map((f, i) => withInfo({ ...f, id: 'default' + i, position: i } as any));
  if (filter.feedId) feeds = feeds.filter((f) => f.id === filter.feedId);
  else if (filter.folder) feeds = feeds.filter((f) => f.folder === filter.folder);
  if (filter.feedIds?.length) { const keep = new Set(filter.feedIds); feeds = feeds.filter((f) => keep.has(f.id)); }
  feeds = feeds.slice(0, MAX_FEEDS_PER_REFRESH);

  const errors: string[] = [];
  const lists = await Promise.all(feeds.map(async (f) => {
    try {
      return await cachedFeed(ctx, f);
    } catch {
      errors.push(f.id);
      return [] as NewsItem[];
    }
  }));
  const items = lists.flat().sort((a, b) => b.date - a.date).slice(0, 500);
  if (items.length) await stateFor(ctx, email, items);
  return { items, errors, folders: [...new Set(feeds.map((f) => f.folder))] };
}

export async function listItems(ctx: Ctx) {
  const u = requireUser(ctx);
  const ids = ctx.url.searchParams.get('feeds');
  const r = await collectItems(ctx, u.email, { folder: ctx.url.searchParams.get('folder'), feedId: ctx.url.searchParams.get('feed'), feedIds: ids ? ids.split(',').filter(Boolean) : null });
  return json({ items: r.items, errors: r.errors });
}

type Feed = ReturnType<typeof withInfo>;
type Parsed = { title: string; items: Omit<NewsItem, 'id' | 'feedId' | 'feed'>[] };

/** The items of one source that is not one of the person's feeds (the entertainment board uses this), cached like a feed. */
export async function sourceItems(ctx: Ctx, src: { id: string; title: string; url: string; lang: string }): Promise<NewsItem[]> {
  return cachedFeed(ctx, withInfo({ ...src, kind: 'web', quality: 4, country: null, category: null, folder: '', position: 0 } as any));
}

async function cachedFeed(ctx: Ctx, f: Feed): Promise<NewsItem[]> {
  const cache = (caches as any).default as Cache;
  const key = new Request(`https://feed-cache.helper/v4/${encodeURIComponent(f.url)}`);
  const hit = await cache.match(key);
  let parsed: Parsed;
  let fresh = false;
  if (hit) {
    parsed = await hit.json();
  } else {
    if (f.kind === 'telegram') {
      const handle = f.url.replace(/^https:\/\/t\.me\/s\//, '');
      parsed = parseTelegram((await fetchText(f.url)).text, handle);
    } else {
      const { text } = await fetchText(f.url, 'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5');
      parsed = parseFeed(text);
    }
    fresh = true;
    ctx.waitUntil(cache.put(key, new Response(JSON.stringify(parsed), { headers: { 'cache-control': `max-age=${FEED_TTL}`, 'content-type': 'application/json' } })));
  }
  const items: NewsItem[] = await Promise.all(parsed.items.map(async (it) => ({
    ...it, id: await sha1Hex(it.link || it.title), feedId: f.id, feed: f.title,
    lang: f.lang || detectLang(it.title + ' ' + it.summary), kind: f.kind, quality: f.quality, country: f.country || undefined,
  })));
  if (fresh && items.length) ctx.waitUntil(remember(ctx, f, items));
  return items;
}

/** Keep every article in the history (new ones only), and now and then forget what is older than HISTORY_DAYS. */
async function remember(ctx: Ctx, f: Feed, items: NewsItem[]) {
  const db = ctx.env.DB;
  const now = Date.now();
  try {
    await db.batch(items.slice(0, 60).map((it) => db.prepare(
      'INSERT OR IGNORE INTO news_items (id, feed_url, feed_title, title, link, date, summary, image, body, lang, seen_at, image_full) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(it.id, f.url, f.title, it.title.slice(0, 400), it.link, it.date || now, (it.summary || '').slice(0, 600), it.image, it.body ? it.body.slice(0, 5000) : null, it.lang || null, now, it.image_full || null)));
    if (Math.random() < 0.02) await db.prepare('DELETE FROM news_items WHERE date < ?').bind(now - HISTORY_DAYS * 86400e3).run();
  } catch (err) {
    console.error('news history', err instanceof Error ? err.message : err);
  }
}

/** Search the history of the person's sources: GET /api/news/search?q=&days=&feeds=id,id */
export async function searchHistory(ctx: Ctx) {
  const u = requireUser(ctx);
  const q = (ctx.url.searchParams.get('q') || '').trim().slice(0, 100);
  if (q.length < 2) throw new HttpError(400, 'Query too short');
  const days = Math.max(1, Math.min(HISTORY_DAYS, Number(ctx.url.searchParams.get('days')) || HISTORY_DAYS));
  let feeds = await feedsOf(ctx, u.email);
  const only = ctx.url.searchParams.get('feeds');
  if (only) { const keep = new Set(only.split(',')); feeds = feeds.filter((f) => keep.has(f.id)); }
  if (!feeds.length) return json({ items: [] });
  const byUrl = new Map(feeds.map((f) => [f.url, f]));
  const words = q.split(/\s+/).filter((w) => w.length > 1).slice(0, 5);
  const like = words.map(() => '(title LIKE ? OR summary LIKE ? OR body LIKE ?)').join(' AND ');
  const args = words.flatMap((w) => [`%${w}%`, `%${w}%`, `%${w}%`]);
  const urls = [...byUrl.keys()];
  const { results } = await ctx.env.DB.prepare(
    `SELECT * FROM news_items WHERE feed_url IN (${urls.map(() => '?').join(',')}) AND date >= ? AND ${like} ORDER BY date DESC LIMIT 200`,
  ).bind(...urls, Date.now() - days * 86400e3, ...args).all<any>();
  const items: NewsItem[] = results.map((r) => historyItem(r, byUrl.get(r.feed_url)!));
  if (items.length) await stateFor(ctx, u.email, items);
  return json({ items });
}

export async function setState(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ ids: string[]; read?: boolean; starred?: boolean; hidden?: boolean; rating?: number | null; folder?: string | null; snapshot?: unknown }>(ctx.req);
  const ids = (b.ids || []).slice(0, 500);
  const db = ctx.env.DB;
  const now = Date.now();
  const flag = (v?: boolean) => (v == null ? null : v ? 1 : 0);
  // rating: a number sets the person's own rating, 0 clears it, absent leaves it as it is
  const rating = b.rating == null ? null : Math.max(0, Math.min(5, Math.round(Number(b.rating)) || 0));
  // folder: a folder id moves a saved article there, '' takes it out of any folder, absent leaves it as it is
  const folder = b.folder == null ? null : String(b.folder).slice(0, 40);
  await db.batch(ids.map((id) => db.prepare(
    `INSERT INTO news_state (email, item_id, read, starred, saved, at, hidden, rating, folder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email, item_id) DO UPDATE SET
       read = COALESCE(?, read), starred = COALESCE(?, starred), saved = COALESCE(?, saved), hidden = COALESCE(?, hidden),
       rating = CASE WHEN ? IS NULL THEN rating WHEN ? = 0 THEN NULL ELSE ? END,
       folder = CASE WHEN ? IS NULL THEN folder WHEN ? = '' THEN NULL ELSE ? END, at = excluded.at`,
  ).bind(u.email, id, b.read ? 1 : 0, b.starred ? 1 : 0, b.snapshot ? JSON.stringify(b.snapshot) : null, now, b.hidden ? 1 : 0, rating || null, folder || null,
    flag(b.read), flag(b.starred), b.snapshot ? JSON.stringify(b.snapshot) : null, flag(b.hidden), rating, rating, rating, folder, folder, folder)));
  return json({ ok: true });
}

/** Older articles for the endless scroll: GET /api/news/older?before=<ms>&feeds=id,id&limit=40 (from the history). */
export async function olderItems(ctx: Ctx) {
  const u = requireUser(ctx);
  const before = Number(ctx.url.searchParams.get('before')) || Date.now();
  const limit = Math.max(10, Math.min(80, Number(ctx.url.searchParams.get('limit')) || 40));
  let feeds = await feedsOf(ctx, u.email);
  const only = ctx.url.searchParams.get('feeds');
  if (only) { const keep = new Set(only.split(',')); feeds = feeds.filter((f) => keep.has(f.id)); }
  if (!feeds.length) return json({ items: [] });
  const byUrl = new Map(feeds.map((f) => [f.url, f]));
  const urls = [...byUrl.keys()];
  const { results } = await ctx.env.DB.prepare(
    `SELECT * FROM news_items WHERE feed_url IN (${urls.map(() => '?').join(',')}) AND date < ? ORDER BY date DESC LIMIT ?`,
  ).bind(...urls, before, limit).all<any>();
  const items = results.map((r) => historyItem(r, byUrl.get(r.feed_url)!));
  if (items.length) await stateFor(ctx, u.email, items);
  return json({ items, more: results.length === limit });
}

function historyItem(r: any, f: Feed): NewsItem {
  return { id: r.id, feedId: f.id, feed: f.title, title: r.title, link: r.link, date: r.date, summary: r.summary || '', image: r.image, image_full: r.image_full || undefined, body: r.body || undefined,
    lang: r.lang || f.lang || undefined, kind: f.kind, quality: f.quality, country: f.country || undefined };
}

export async function starredItems(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT item_id, saved, folder, rating FROM news_state WHERE email = ? AND starred = 1 AND saved IS NOT NULL ORDER BY at DESC LIMIT 500')
    .bind(u.email).all<any>();
  return json({ items: results.map((r) => ({ ...JSON.parse(r.saved), id: r.item_id, starred: true, read: true, folder: r.folder || null, rating: r.rating || null })) });
}

/* ---------------- reader view, summary, translation ---------------- */

export async function article(ctx: Ctx) {
  requireUser(ctx);
  const url = ctx.url.searchParams.get('url') || '';
  if (!/^https?:\/\//.test(url)) throw new HttpError(400, 'Invalid URL');
  const cache = (caches as any).default as Cache;
  const key = new Request(`https://article-cache.helper/${encodeURIComponent(url)}`);
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

  const { text, finalUrl } = await fetchText(url);
  const art = readable(text, finalUrl);
  if (!art?.content) throw new HttpError(422, 'not_readable');
  const out = JSON.stringify({ title: art.title, byline: art.byline, siteName: art.siteName, content: sanitize(art.content), dir: art.dir || null, length: art.length, url: finalUrl });
  ctx.waitUntil(cache.put(key, new Response(out, { headers: { 'cache-control': 'max-age=3600', 'content-type': 'application/json' } })));
  return new Response(out, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export async function summarize(ctx: Ctx) {
  requireUser(ctx);
  const { url, text: given } = await body<{ url: string; text?: string }>(ctx.req);
  if (!/^https?:\/\//.test(url || '')) throw new HttpError(400, 'Invalid URL');
  let content = (given || '').trim().slice(0, 40000);
  let title = '';
  if (content.length < 300) {
    const { text, finalUrl } = await fetchText(url);
    const art = readable(text, finalUrl);
    content = (art?.textContent || '').trim().slice(0, 40000);
    title = art?.title || '';
  }
  if (content.length < 120) throw new HttpError(422, 'not_readable');
  // without AI (none connected, no credit, or it failed): the article's own opening sentences, said to be just that
  const res = await aiJson(ctx.env, {
    prefer: 'gemini',
    fast: true,
    system: 'You summarize news articles for an Israeli family. Always answer in Hebrew, neutrally and accurately, without adding facts that are not in the article.',
    prompt: `Summarize this article in 3-5 short bullet points in Hebrew.\nTitle: ${title}\n\n${content}`,
    schema: z.object({ bullets: z.array(z.string()) }),
  }).catch(() => null);
  if (!res) return json({ bullets: lead(content, 3), via: 'lead' });
  return json(res);
}

const Translation = z.object({ title_he: z.string(), paragraphs: z.array(z.string()), from: z.string() });

/** The article in Hebrew: POST /api/news/translate {url, title, text?} (text for posts that carry it, like Telegram). Cached. */
export async function translate(ctx: Ctx) {
  requireUser(ctx);
  const b = await body<{ url: string; title?: string; text?: string }>(ctx.req);
  if (!/^https?:\/\//.test(b.url || '')) throw new HttpError(400, 'Invalid URL');
  const hit = await ctx.env.DB.prepare('SELECT data FROM news_translations WHERE url = ?').bind(b.url).first<{ data: string }>();
  if (hit) return json(JSON.parse(hit.data));
  let paragraphs: string[];
  let title = (b.title || '').trim();
  if ((b.text || '').trim().length > 2) {
    paragraphs = b.text!.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  } else if (/^https:\/\/t\.me\//.test(b.url)) {
    throw new HttpError(422, 'not_readable'); // a Telegram post's words come with it; its page has only the app's buttons
  } else {
    const { text, finalUrl } = await fetchText(b.url);
    const art = readable(text, finalUrl);
    if (!art?.content) throw new HttpError(422, 'not_readable');
    title = title || art.title || '';
    paragraphs = [...art.content.matchAll(/<(p|h2|h3|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter((p) => p.length > 1);
    if (!paragraphs.length) paragraphs = (art.textContent || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  }
  let total = 0;
  paragraphs = paragraphs.filter((p) => (total += p.length) < 16000);
  if (!paragraphs.length) throw new HttpError(422, 'not_readable');
  const t = await aiJson(ctx.env, {
    prefer: 'gemini',
    fast: true,
    system: 'You translate news into fluent, natural Hebrew for an Israeli family: faithfully, neutrally, without adding or leaving out facts. Keep names and quotes accurate. One Hebrew paragraph for each source paragraph, in the same order. "from" is the source language in Hebrew (e.g. "אנגלית", "ערבית").',
    prompt: `Title: ${title}\n\nParagraphs:\n${paragraphs.map((p, i) => `[${i + 1}] ${p}`).join('\n')}`,
    schema: Translation,
  });
  const data = { title_he: t.title_he, paragraphs: t.paragraphs.filter((p) => p.trim()), from: t.from };
  await ctx.env.DB.prepare('INSERT INTO news_translations (url, data, created_at) VALUES (?, ?, ?) ON CONFLICT(url) DO NOTHING').bind(b.url, JSON.stringify(data), Date.now()).run();
  return json(data);
}

/* ---------------- Telegram (public channel preview pages, t.me/s/<channel>) ---------------- */

export function parseTelegram(html: string, handle: string): Parsed {
  const title = unescapeXml(/<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] || '') || '@' + handle;
  const blocks = html.split('<div class="tgme_widget_message_wrap').slice(1);
  const items = blocks.map((b) => {
    const post = /data-post="([^"]+)"/.exec(b)?.[1];
    const raw = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(b)?.[1] || '';
    const txt = unescapeXml(unescapeXml(raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    const date = Date.parse(/<time[^>]+datetime="([^"]+)"/.exec(b)?.[1] || '') || 0;
    const image = /tgme_widget_message_(?:photo_wrap|video_thumb)[^>]*background-image:url\('([^']+)'\)/.exec(b)?.[1] || null;
    const lines = txt.split('\n').map((l) => l.trim()).filter((l) => l.replace(/[\p{Emoji}\s]/gu, '').length > 2);
    // A very short first line ("הליכוד:") reads better joined to the one after it.
    let first = lines[0] || '';
    if (first.length < 30 && lines[1]) first = `${first.replace(/[:：]\s*$/, '')}: ${lines[1]}`;
    return {
      title: first.length > 160 ? first.slice(0, 157) + '…' : first || (image ? '(תמונה)' : ''),
      link: post ? `https://t.me/${post}` : '',
      date,
      summary: txt.slice(0, 400),
      body: txt.slice(0, 5000),
      image,
    };
  }).filter((i) => i.link && i.body.length > 2).reverse(); // only posts with words in them; the page lists the oldest first
  return { title, items };
}

/* ---------------- RSS / Atom parsing ---------------- */

export function parseFeed(xml: string): Parsed {
  const channelTitle = text(tag(xml.replace(/<(item|entry)[\s>][\s\S]*$/i, ''), 'title'));
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  const items = blocks.map((b) => {
    const link = atomLink(b) || text(tag(b, 'link')) || text(tag(b, 'guid'));
    const desc = tag(b, 'content:encoded') || tag(b, 'description') || tag(b, 'summary') || tag(b, 'content') || '';
    const dateStr = text(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const date = Date.parse(dateStr) || 0;
    const media = feedMedia(b);
    const image =
      media.small ||
      (/<enclosure[^>]*type=["']image/i.test(b) ? attr(b, /<enclosure[^>]*>/i, 'url') : null) ||
      /<img[^>]+src=["']([^"']+)/i.exec(unescapeXml(desc))?.[1] || null;
    return {
      title: text(tag(b, 'title')) || '(ללא כותרת)',
      link: link.trim(),
      date,
      summary: text(desc).slice(0, 400),
      image: image ? unescapeXml(image) : null,
      ...(media.full && media.full !== media.small ? { image_full: unescapeXml(media.full) } : {}),
    };
  }).filter((i) => i.link);
  return { title: channelTitle, items };
}

function tag(s: string, name: string): string {
  const re = new RegExp(`<${name.replace(':', '\\:')}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name.replace(':', '\\:')}>`, 'i');
  return re.exec(s)?.[1] ?? '';
}

function atomLink(s: string): string {
  const links = [...s.matchAll(/<link\b[^>]*\/?>/gi)].map((m) => m[0]);
  const alt = links.find((l) => /href=/.test(l) && (!/rel=/.test(l) || /rel=["']alternate["']/.test(l)));
  return alt ? unescapeXml(/href=["']([^"']+)/i.exec(alt)![1]) : '';
}

function attr(s: string, re: RegExp, name: string): string | null {
  const t = re.exec(s)?.[0];
  return t ? new RegExp(`${name}=["']([^"']+)`, 'i').exec(t)?.[1] ?? null : null;
}

function unescapeXml(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    // Direction marks and joiners, common in Hebrew and Arabic posts.
    .replace(/&rlm;/g, '‏').replace(/&lrm;/g, '‎').replace(/&zwnj;/g, '‌').replace(/&zwj;/g, '‍');
}

function text(s: string): string {
  return unescapeXml(unescapeXml(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
