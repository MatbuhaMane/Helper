// בידור: a board of recommendations, by medium – television, film, live shows, music, games, funny things and books.
// Only what is worth recommending: the latest from entertainment sites (Hebrew and English) is read by Gemini, which keeps
// what reviewers praise and families would enjoy (no gossip, scandal or crime), says in Hebrew what it is and why, and – checking
// with Google Search – where in Israel it can be watched, heard, played or bought. Each "where" carries the service's logo.
// A category's picks are kept for twelve hours (and refreshed in the background after that), so the board opens at once.
// Without AI (docs/ai/without-ai.md #11): the board everyone shares is the cache; when there is none and no AI to choose,
// the category's latest headlines from its own sites are shown as they are (marked plain, not kept, so an AI fills the
// board when there is one).

import { z } from 'zod';
import { aiJson, geminiGrounded, jsonIn } from './ai';
import { Ctx, HttpError, json, requireUser } from './core';
import { NewsItem, sourceItems } from './news';

type Src = { title: string; url: string; lang: 'he' | 'en' };
const s = (title: string, url: string, lang: 'he' | 'en' = 'en'): Src => ({ title, url, lang });

export const CATEGORIES: Record<string, { name: string; what: string; sources: Src[] }> = {
  tv: { name: 'טלוויזיה', what: 'TV series and shows (streaming, cable and broadcast)', sources: [
    s('ynet – תרבות ובידור', 'https://www.ynet.co.il/Integration/StoryRss538.xml', 'he'), s('טיים אאוט', 'https://www.timeout.co.il/feed/', 'he'),
    s('TVLine', 'https://tvline.com/feed/'), s('Deadline TV', 'https://deadline.com/v/tv/feed/'), s('Variety TV', 'https://variety.com/v/tv/feed/')] },
  film: { name: 'קולנוע', what: 'films – in cinemas and on streaming', sources: [
    s('ynet – תרבות ובידור', 'https://www.ynet.co.il/Integration/StoryRss538.xml', 'he'), s('/Film', 'https://www.slashfilm.com/feed/'),
    s('IndieWire', 'https://www.indiewire.com/feed/'), s('Variety Film', 'https://variety.com/v/film/feed/'), s('The Hollywood Reporter', 'https://www.hollywoodreporter.com/c/movies/feed/')] },
  live: { name: 'הופעות', what: 'concerts, stand-up, theatre and festivals – live events (in Israel first)', sources: [
    s('טיים אאוט', 'https://www.timeout.co.il/feed/', 'he'), s('ynet – תרבות ובידור', 'https://www.ynet.co.il/Integration/StoryRss538.xml', 'he'), s('TicketNews', 'https://www.ticketnews.com/feed/')] },
  music: { name: 'מוזיקה', what: 'new albums, songs and artists', sources: [
    s('Pitchfork', 'https://pitchfork.com/feed/feed-news/rss'), s('Stereogum', 'https://www.stereogum.com/feed/'), s('NME', 'https://www.nme.com/news/music/feed'),
    s('Rolling Stone', 'https://www.rollingstone.com/music/music-news/feed/'), s('ynet – תרבות ובידור', 'https://www.ynet.co.il/Integration/StoryRss538.xml', 'he')] },
  games: { name: 'משחקים', what: 'video games – console, PC and mobile – and board games', sources: [
    s('GamePro', 'https://www.gamepro.co.il/feed/', 'he'), s('IGN', 'https://feeds.feedburner.com/ign/all'), s('Eurogamer', 'https://www.eurogamer.net/feed'),
    s('GameSpot', 'https://www.gamespot.com/feeds/mashup/'), s('Polygon', 'https://www.polygon.com/rss/index.xml')] },
  funny: { name: 'מצחיק', what: 'funny things – comics, satire, light-hearted stories (kind humour, nothing cruel or political)', sources: [
    s('xkcd', 'https://xkcd.com/rss.xml'), s('Saturday Morning Breakfast Cereal', 'https://www.smbc-comics.com/comic/rss'), s('Bored Panda', 'https://www.boredpanda.com/feed/'),
    s('The Onion', 'https://www.theonion.com/rss'), s('The Beaverton', 'https://www.thebeaverton.com/feed/')] },
  books: { name: 'ספרים', what: 'books – novels, non-fiction, comics and children’s books', sources: [
    s('Literary Hub', 'https://lithub.com/feed/'), s('The Guardian – Books', 'https://www.theguardian.com/books/rss'), s('ynet – תרבות ובידור', 'https://www.ynet.co.il/Integration/StoryRss538.xml', 'he')] },
};

/* the services, by the name the picks give them, with the domain their logo comes from */
export const SERVICES: [RegExp, string, string][] = [
  // the more particular names first (יס פלאנט before yes, הוט סינמה before HOT)
  [/yes planet|יס פלאנט/i, 'Yes Planet', 'yesplanet.co.il'], [/hot cinema|הוט סינמה/i, 'הוט סינמה', 'hotcinema.co.il'], [/youtube music/i, 'YouTube Music', 'music.youtube.com'],
  [/netflix|נטפליקס/i, 'Netflix', 'netflix.com'], [/disney/i, 'Disney+', 'disneyplus.com'], [/apple ?tv/i, 'Apple TV+', 'tv.apple.com'],
  [/hbo|\bmax\b/i, 'HBO Max', 'max.com'], [/prime video|amazon prime/i, 'Prime Video', 'primevideo.com'], [/\byes\b|yes\+|יס/i, 'yes', 'yes.co.il'],
  [/\bhot\b|הוט/i, 'HOT', 'hot.net.il'], [/כאן|kan 11|\bkan\b/i, 'כאן 11', 'kan.org.il'], [/קשת|keshet|mako|מאקו|ערוץ 12|channel 12/i, 'קשת 12', 'mako.co.il'], [/רשת 13|reshet|ערוץ 13|channel 13/i, 'רשת 13', '13tv.co.il'],
  [/sting|סטינג/i, 'STINGTV', 'stingtv.co.il'], [/partner|פרטנר/i, 'Partner TV', 'partner.co.il'], [/cellcom|סלקום/i, 'סלקום tv', 'cellcom.co.il'], [/paramount/i, 'Paramount+', 'paramountplus.com'],
  [/youtube|יוטיוב/i, 'YouTube', 'youtube.com'], [/spotify|ספוטיפיי/i, 'Spotify', 'spotify.com'], [/apple music/i, 'Apple Music', 'music.apple.com'],
  [/deezer/i, 'Deezer', 'deezer.com'], [/bandcamp/i, 'Bandcamp', 'bandcamp.com'], [/steam/i, 'Steam', 'store.steampowered.com'], [/playstation|ps5|ps4/i, 'PlayStation', 'playstation.com'],
  [/xbox|game pass/i, 'Xbox', 'xbox.com'], [/nintendo|switch/i, 'Nintendo Switch', 'nintendo.com'], [/epic games/i, 'Epic Games', 'epicgames.com'], [/app store|ios/i, 'App Store', 'apps.apple.com'],
  [/google play|android/i, 'Google Play', 'play.google.com'], [/cinema ?city|סינמה סיטי/i, 'סינמה סיטי', 'cinema-city.co.il'],
  [/\blev\b|קולנוע לב|לב סמדר/i, 'לב', 'lev.co.il'], [/rav ?chen|רב חן/i, 'רב חן', 'ravhen.co.il'], [/סינמטק|cinematheque/i, 'סינמטק', 'cinema.co.il'],
  [/eventim|איוונטים/i, 'Eventim', 'eventim.co.il'], [/leaan|לאן/i, 'לאן', 'leaan.co.il'], [/zappa|זאפה/i, 'זאפה', 'zappa-club.co.il'], [/barby|בארבי/i, 'בארבי', 'barby.co.il'],
  [/tmol shilshom|תמול שלשום/i, 'תמול שלשום', 'tmol-shilshom.co.il'], [/ticketmaster/i, 'Ticketmaster', 'ticketmaster.com'], [/audible/i, 'Audible', 'audible.com'],
  [/kindle|amazon/i, 'Amazon', 'amazon.com'], [/סטימצקי|steimatzky/i, 'סטימצקי', 'steimatzky.co.il'], [/צומת ספרים|tzomet/i, 'צומת ספרים', 'booknet.co.il'], [/עברית|e-vrit/i, 'e-vrit', 'e-vrit.co.il'],
];
export function serviceOf(name: string, domain?: string) {
  const hit = SERVICES.find(([re]) => re.test(name || ''));
  if (hit) return { name: hit[1], domain: hit[2] };
  const d = String(domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  return { name, domain: /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : '' };
}

const Pick = z.object({
  i: z.number().int(),                                     // which item of the list it comes from
  title: z.string().default(''), original: z.string().default(''), kind: z.string().default(''),
  what: z.string().default(''), why: z.string().default(''), rating: z.string().default(''), family: z.string().default(''),
  where: z.array(z.object({ name: z.string().default(''), domain: z.string().default(''), note: z.string().default(''), url: z.string().default('') })).default([]),
});
const Picks = z.object({ picks: z.array(Pick).default([]) });
const KEEP = 12 * 3600e3;

/** a headline's summary to one sentence (for the board without AI) */
const firstSentence = (s: unknown) => { const t = String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return (t.match(/^.{20,220}?[.!?](?=\s|$)/) || [t.slice(0, 200)])[0]; };

const PAGE = 30;   // headlines read for one page of picks (the board scrolls on: each page reads the next, older ones)
async function choose(ctx: Ctx, cat: string, page = 0, already: string[] = []) {
  const c = CATEGORIES[cat];
  const lists = await Promise.all(c.sources.map((src, k) => sourceItems(ctx, { id: `fun-${cat}-${k}`, ...src }).catch(() => [] as NewsItem[])));
  const seen = new Set<string>();
  const items = lists.flat().filter((it) => it.title && !seen.has(it.link) && seen.add(it.link))
    .sort((a, b) => b.date - a.date).filter((it) => Date.now() - it.date < 45 * 864e5).slice(page * PAGE, (page + 1) * PAGE);
  if (!items.length) { if (page) return []; throw new HttpError(502, 'no_items'); }
  const list = items.map((it, i) => `${i}. [${it.feed}] ${it.title} — ${String(it.summary || '').replace(/\s+/g, ' ').slice(0, 220)}`).join('\n');
  const system = `You curate an entertainment board for an Israeli family (Hebrew speakers; adults, teenagers and children). The category: ${c.name} – ${c.what}.
From the recent headlines below, choose only what is WORTH RECOMMENDING: works that reviewers praise or that are widely loved, notable new releases with good reception, events worth going to. Leave out gossip, scandals, deaths, lawsuits, business news, politics, crime, and anything crude or not suitable for a family. Prefer what is available in Israel. 4–8 picks; fewer if few are worth it.
For each pick use Google Search to check where in Israel it can be watched / heard / played / bought / booked RIGHT NOW (the streaming service or channel, the cinemas, the venue and the ticket site, the music services, the game platforms, the bookshops). Name each service as it is called (Netflix, yes, HOT, כאן 11, קשת 12, Disney+, Apple TV+, Spotify, Steam, PlayStation, Eventim…) and give its domain. If you could not find where, give an empty list – never guess.
Write in Hebrew: "title" (the Hebrew name if it has one, else the original), "original" (the original name), "kind" (סדרה / סרט / אלבום / שיר / הופעה / מחזה / משחק / ספר / קומיקס …), "what" (one sentence: what it is), "why" (one or two sentences: why it is recommended, from the reviews), "rating" (a review score ONLY if your search found it for this very release – not an older edition or the original – e.g. "Metacritic 88"; else empty), "family" (who it suits: "לכל המשפחה" / "מגיל 12" / "למבוגרים"…).
${already.length ? `Already on the board – do NOT pick these again, nor other news about them: ${already.slice(0, 60).join(' · ')}\n` : ''}Answer with JSON only: {"picks": [{"i": <the number of the headline>, "title": "", "original": "", "kind": "", "what": "", "why": "", "rating": "", "family": "", "where": [{"name": "", "domain": "", "note": "e.g. עונה 2, from 20.11, tickets from ₪150", "url": ""}]}]}`;
  let picks: z.infer<typeof Pick>[] = [];
  try {
    const g = await geminiGrounded(ctx.env, { system, prompt: list });
    picks = Picks.parse(jsonIn(g.text)).picks;
  } catch (e) {
    // no search: Claude or Gemini choose, and say nothing about where (unverified)
    console.error('fun grounded', e instanceof Error ? e.message : e);
    const r = await aiJson(ctx.env, { prefer: 'gemini', schema: Picks, system: system.replace(/For each pick use Google Search[\s\S]*?never guess\./, 'Leave "where" as an empty list.'), prompt: list }).catch(() => null);
    // no AI at all: the headlines themselves, unfiltered and said to be so
    if (!r) return items.slice(0, 12).map((it) => ({ title: it.title, original: '', kind: 'כותרת', what: firstSentence(it.summary), why: '', rating: '', family: '',
      link: it.link, image: it.image, source: it.feed, date: it.date, where: [] as { name: string; domain: string; note: string; url: string }[], plain: true }));
    picks = r.picks.map((p) => ({ ...p, where: [] }));
  }
  return picks.filter((p) => items[p.i]).slice(0, 8).map((p) => {
    const it = items[p.i];
    return { ...p, i: undefined, link: it.link, image: it.image, source: it.feed, date: it.date,
      where: p.where.map((w) => { const sv = serviceOf(w.name, w.domain); return { name: sv.name || w.name, domain: sv.domain, note: w.note, url: /^https?:\/\//.test(w.url) ? w.url : '' }; }) };
  });
}

/** GET /api/fun/picks?cat=tv&page=0 → { cat, name, picks, page, more, at } (each page kept for twelve hours; older ones are shown
    while new ones are chosen). "more" is false when there are no older headlines left to choose from. */
export async function picks(ctx: Ctx) {
  requireUser(ctx);
  const cat = ctx.url.searchParams.get('cat') || 'tv';
  if (!CATEGORIES[cat]) throw new HttpError(400, 'Unknown category');
  const page = Math.max(0, Math.min(20, parseInt(ctx.url.searchParams.get('page') || '0', 10) || 0));
  const key = 'fun|' + cat + (page ? '|' + page : '');
  const row = await ctx.env.DB.prepare('SELECT answer, created_at FROM research_answers WHERE key = ?').bind(key).first<{ answer: string; created_at: number }>();
  // a fresh choice costs an AI call with search: at most once every ten minutes per page
  const fresh = ctx.url.searchParams.get('fresh') === '1' && (!row || Date.now() - row.created_at > 10 * 60e3);
  const save = async () => {
    // what the earlier pages already recommend, so a later page brings new things
    let already: string[] = [];
    if (page) {
      const keys = Array.from({ length: page }, (_, k) => 'fun|' + cat + (k ? '|' + k : ''));
      const rows = await ctx.env.DB.prepare(`SELECT answer FROM research_answers WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all<{ answer: string }>();
      already = rows.results.flatMap((r) => { try { return (JSON.parse(r.answer) as any[]).flatMap((x) => [x.title, x.original].filter(Boolean)); } catch (_) { return []; } });
    }
    const list = (await choose(ctx, cat, page, already)).filter((x) => !already.includes(x.title) && !(x.original && already.includes(x.original)));
    if (list.length && !(list[0] as { plain?: boolean }).plain) await ctx.env.DB.prepare('INSERT OR REPLACE INTO research_answers (key, answer, created_at) VALUES (?, ?, ?)').bind(key, JSON.stringify(list), Date.now()).run();
    return list;
  };
  if (row && !fresh) {
    if (Date.now() - row.created_at > KEEP) ctx.waitUntil(save().catch((e) => console.error('fun refresh', e)));
    return json({ cat, name: CATEGORIES[cat].name, picks: JSON.parse(row.answer), page, more: true, at: row.created_at });
  }
  const list = await save();
  return json({ cat, name: CATEGORIES[cat].name, picks: list, page, more: list.length > 0, at: Date.now() });
}

/** GET /api/fun/logo/:domain – the service's icon, kept at the edge for a month */
export async function logo(ctx: Ctx) {
  requireUser(ctx);
  const d = String(ctx.params.domain || '').toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new HttpError(400, 'Bad domain');
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const key = new Request('https://fun-logo.internal/' + d);
  const hit = await cache?.match(key);
  if (hit) return hit;
  const r = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`, { headers: { 'user-agent': 'HelperFamilyApp/1.0' } });
  if (!r.ok) throw new HttpError(404, 'No logo');
  const res = new Response(r.body, { headers: { 'content-type': r.headers.get('content-type') || 'image/png', 'cache-control': 'public, max-age=2592000' } });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/* מצחיק: what is going round the web right now – the most popular comedy videos on YouTube in Israel and in the world (embedded),
   and funny, kind pictures from Reddit's family-friendly communities. An endless feed: each page carries the cursor of the next.
   Each upstream page is kept at the edge for an hour. */
type Viral =
  | { type: 'video'; id: string; title: string; channel: string; thumb: string; views: number; region: 'il' | 'world'; url: string }
  | { type: 'image'; src: string; title: string; link: string; source: string; region: 'world'; video?: string; clip?: string };   // clip: a plain video file (Lemmy), played in a <video>
const SUBS = 'MadeMeSmile+wholesomememes+AnimalsBeingDerps+aww+funny';
/* "מצחיק ואמיתי" (the users' feedback, 2026-11-13): funny moments that really happened, filmed, not made by AI and not
   staged: communities of real clips (laughing people, derpy animals, kind people), their hot list (it moves through the
   day), and titles that say AI, a skit or a prank left out. */
export const REAL_SUBS = 'ContagiousLaughter+AnimalsBeingDerps+AnimalsBeingBros+HumansBeingBros+funnyanimals+Zoomies+MadeMeSmile';
export const NOT_REAL = /\ba\.i\.|\b(ai|sora|veo|midjourney|runway|kling|generated|deepfake|cgi|vfx|staged|scripted|skit|sketch|parody|prank|satire|edited|rendered)\b|בינה מלאכותית|מבוים|מערכון|מתיחה/i;
/** a first page (no cursor) is kept at the edge for ten minutes, so a refresh soon brings what is new; later pages an hour */
export const firstTtl = (cur: string | null | undefined) => (cur ? 3600 : 600);
// politics is left out of a family's funny feed (the late-night shows lead the comedy charts)
const POLITICS = /trump|biden|harris|vance|obama|election|congress|senate|republican|democrat|maga|netanyahu|נתניהו|ביבי|בחירות|הכנסת|ממשלה|לפיד|בן גביר|סמוטריץ/i;

async function edgeJson<T>(ctx: Ctx, key: string, ttl: number, make: () => Promise<T>): Promise<T> {
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const req = new Request('https://fun-viral.internal/' + encodeURIComponent(key));
  const hit = await cache?.match(req);
  if (hit) return hit.json() as Promise<T>;
  const v = await make();
  if (cache) ctx.waitUntil(cache.put(req, new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttl}` } })));
  return v;
}

/** YouTube's most popular comedy (category 23) in a region – one unit of quota a page; entertainment (24) where comedy has no chart */
async function youtubePage(ctx: Ctx, region: 'IL' | 'US', token: string | null) {
  const key = ctx.env.YOUTUBE_API_KEY;
  if (!key) return { items: [] as Viral[], next: null as string | null };
  return edgeJson(ctx, `yt|${region}|${token || ''}`, firstTtl(token), async () => {
    for (const cat of ['23', '24']) {
      const u = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&chart=mostPopular&regionCode=${region}&videoCategoryId=${cat}&maxResults=10${token ? '&pageToken=' + encodeURIComponent(token) : ''}&key=${key}`;
      const r = await fetch(u);
      if (!r.ok) continue;
      const d = (await r.json()) as any;
      const items: Viral[] = (d.items || []).filter((v: any) => v.status?.embeddable !== false && !POLITICS.test((v.snippet?.title || '') + ' ' + (v.snippet?.channelTitle || ''))).map((v: any) => ({
        type: 'video', id: v.id, title: v.snippet?.title || '', channel: v.snippet?.channelTitle || '',
        thumb: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || '', views: +(v.statistics?.viewCount || 0),
        region: region === 'IL' ? 'il' : 'world', url: `https://www.youtube.com/watch?v=${v.id}`,
      }));
      if (items.length) return { items, next: (d.nextPageToken as string) || null };
    }
    return { items: [] as Viral[], next: null };
  });
}

/** Reddit's top of the day in kind, funny communities (its RSS – the JSON API refuses servers) */
async function redditPage(ctx: Ctx, after: string | null, real = false) {
  const list = real ? `${REAL_SUBS}/hot/.rss?limit=25` : `${SUBS}/top/.rss?t=day&limit=15`;
  return edgeJson(ctx, `rd|${real ? 'real|' : ''}${after || ''}`, firstTtl(after), async () => {
    const r = await fetch(`https://www.reddit.com/r/${list}${after ? '&after=' + encodeURIComponent(after) : ''}`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; HelperFamilyApp/1.0)' } });
    if (!r.ok) throw new Error('reddit ' + r.status);   // not kept: the next visitor tries again
    const xml = await r.text();
    const unesc = (x: string) => x.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#32;/g, ' ');
    const entries = xml.split('<entry').slice(1);
    let last: string | null = null;
    const items: Viral[] = [];
    for (const e of entries) {
      const id = /<id>([^<]+)<\/id>/.exec(e)?.[1] || null;
      last = id || last;
      const title = unesc(/<title>([^<]*)<\/title>/.exec(e)?.[1] || '');
      const link = /<link href="([^"]+)"/.exec(e)?.[1] || '';
      const source = /<category term="[^"]*" label="([^"]+)"/.exec(e)?.[1] || 'Reddit';
      const content = unesc(/<content type="html">([\s\S]*?)<\/content>/.exec(e)?.[1] || '');
      const target = /<a href="([^"]+)">\[link\]<\/a>/.exec(content)?.[1] || '';
      const thumb = unesc(/<media:thumbnail url="([^"]+)"/.exec(e)?.[1] || '');
      if (/nsfw|porn|sex/i.test(title) || POLITICS.test(title) || (real && NOT_REAL.test(title))) continue;
      if (real && /^https:\/\/v\.redd\.it\//.test(target) && thumb) { items.push({ type: 'image', src: thumb, title, link, source, region: 'world', video: link }); continue; }
      if (/^https:\/\/i\.redd\.it\/.+\.(jpe?g|png|gif|webp)$/i.test(target)) items.push({ type: 'image', src: target, title, link, source, region: 'world' });
      else if (/^https:\/\/v\.redd\.it\//.test(target) && thumb) items.push({ type: 'image', src: thumb, title, link, source, region: 'world', video: link });
      else if (/^https:\/\/i\.imgur\.com\/.+\.(jpe?g|png|gif)$/i.test(target)) items.push({ type: 'image', src: target, title, link, source, region: 'world' });
    }
    if (!entries.length && !after) throw new Error('reddit empty');
    if (real) items.sort((a, b) => Number(!!(b as any).video) - Number(!!(a as any).video));   // the clips first, then the real moments in pictures
    return { items, next: entries.length ? last : null };
  });
}

/** When Reddit turns servers away: kind pictures from Lemmy (an open network with a public API), page by page */
const LEMMY = ['aww', 'dogs', 'funny'], LEMMY_REAL = ['animalsbeingderps', 'kidsbeingderps', 'animalsbeingjerks', 'animalsbeingbros'];
async function lemmyPage(ctx: Ctx, page: number, real = false) {
  return edgeJson(ctx, `lm|${real ? 'real|' : ''}${page}`, page > 1 ? 3600 : 600, async () => {
    const lists = await Promise.all((real ? LEMMY_REAL : LEMMY).map((c) =>
      fetch(`https://lemmy.world/api/v3/post/list?community_name=${c}&sort=${real ? 'Hot' : 'TopWeek'}&limit=10&page=${page}`, { headers: { 'user-agent': 'HelperFamilyApp/1.0' } })
        .then((r) => (r.ok ? r.json() : { posts: [] })).catch(() => ({ posts: [] })) as Promise<any>));
    const items: Viral[] = [];
    let any = false;
    for (let i = 0; i < 10; i++) for (const l of lists) {
      const p = l.posts?.[i]; if (!p) continue;
      any = true;
      const post = p.post || {};
      const src = String(post.url || '');
      if (post.nsfw || p.community?.nsfw || POLITICS.test(post.name || '') || /nsfw|porn|sex/i.test(post.name || '') || (real && NOT_REAL.test(post.name || ''))) continue;
      const thumb = String(post.thumbnail_url || '');
      if (real && /^https:\/\/[^\s]+\.(mp4|webm)(\?.*)?$/i.test(src)) {
        items.push({ type: 'image', src: /^https:\/\//.test(thumb) ? thumb : '', clip: src, title: post.name || '', link: post.ap_id || `https://lemmy.world/post/${post.id}`, source: 'Lemmy · ' + (p.community?.title || p.community?.name || ''), region: 'world' });
        continue;
      }
      if (!/^https:\/\/[^\s]+\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(src)) continue;
      items.push({ type: 'image', src, title: post.name || '', link: post.ap_id || `https://lemmy.world/post/${post.id}`, source: 'Lemmy · ' + (p.community?.title || p.community?.name || ''), region: 'world' });
    }
    if (real) items.sort((a, b) => Number(!!(b as any).clip) - Number(!!(a as any).clip));
    return { items, next: any && page < 20 ? (real ? 'lmr:' : 'lm:') + (page + 1) : null };
  });
}
/** a page of pictures: Reddit, or Lemmy once Reddit has refused (its cursor then reads "lm:<page>") */
function picturesPage(ctx: Ctx, cur: string | null, real = false) {
  if (cur?.startsWith('lmr:')) return lemmyPage(ctx, +cur.slice(4) || 1, true);
  if (cur?.startsWith('lm:')) return lemmyPage(ctx, +cur.slice(3) || 1);
  return redditPage(ctx, cur, real).catch(() => (cur ? null : lemmyPage(ctx, 1, real)));
}

/** GET /api/fun/viral?cursor=…&kind=real → { items, cursor } (cursor: null at the very end).
    kind=real: "מצחיק ואמיתי", real clips only (no YouTube chart: the comedy chart is skits and shows). */
export async function viral(ctx: Ctx) {
  requireUser(ctx);
  if (ctx.url.searchParams.get('kind') === 'real') {
    let cur: string | null = null;
    try { const c = ctx.url.searchParams.get('cursor'); if (c) cur = JSON.parse(atob(c)).rd ?? null; } catch (_) { throw new HttpError(400, 'Bad cursor'); }
    const rd = await picturesPage(ctx, cur, true).catch(() => null);
    return json({ items: rd?.items || [], cursor: rd?.next ? btoa(JSON.stringify({ rd: rd.next })) : null });
  }
  let cur: { il: string | null | false; us: string | null | false; rd: string | null | false } = { il: null, us: null, rd: null };
  try { const c = ctx.url.searchParams.get('cursor'); if (c) cur = JSON.parse(atob(c)); } catch (_) { throw new HttpError(400, 'Bad cursor'); }
  const [il, us, rd] = await Promise.all([
    cur.il === false ? null : youtubePage(ctx, 'IL', cur.il).catch(() => null),
    cur.us === false ? null : youtubePage(ctx, 'US', cur.us).catch(() => null),
    cur.rd === false ? null : picturesPage(ctx, cur.rd).catch(() => null),
  ]);
  // mixed: a video from Israel, two pictures, a video from the world, two pictures…
  const a = il?.items || [], b = us?.items || [], c = rd?.items || [];
  const items: Viral[] = [];
  for (let i = 0, j = 0, k = 0; i < a.length || j < b.length || k < c.length;) {
    if (i < a.length) items.push(a[i++]);
    for (let n = 0; n < 2 && k < c.length; n++) items.push(c[k++]);
    if (j < b.length) items.push(b[j++]);
    for (let n = 0; n < 2 && k < c.length; n++) items.push(c[k++]);
  }
  const next = { il: il?.next ?? false, us: us?.next ?? false, rd: rd?.next ?? false };
  const done = next.il === false && next.us === false && next.rd === false;
  return json({ items, cursor: done ? null : btoa(JSON.stringify(next)) });
}
