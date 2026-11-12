// בידור: a board of recommendations, by medium – television, film, live shows, music, games, funny things and books.
// Only what is worth recommending: the latest from entertainment sites (Hebrew and English) is read by Gemini, which keeps
// what reviewers praise and families would enjoy (no gossip, scandal or crime), says in Hebrew what it is and why, and – checking
// with Google Search – where in Israel it can be watched, heard, played or bought. Each "where" carries the service's logo.
// A category's picks are kept for twelve hours (and refreshed in the background after that), so the board opens at once.

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

async function choose(ctx: Ctx, cat: string) {
  const c = CATEGORIES[cat];
  const lists = await Promise.all(c.sources.map((src, k) => sourceItems(ctx, { id: `fun-${cat}-${k}`, ...src }).catch(() => [] as NewsItem[])));
  const seen = new Set<string>();
  const items = lists.flat().filter((it) => it.title && !seen.has(it.link) && seen.add(it.link))
    .sort((a, b) => b.date - a.date).filter((it) => Date.now() - it.date < 21 * 864e5).slice(0, 45);
  if (!items.length) throw new HttpError(502, 'no_items');
  const list = items.map((it, i) => `${i}. [${it.feed}] ${it.title} — ${String(it.summary || '').replace(/\s+/g, ' ').slice(0, 220)}`).join('\n');
  const system = `You curate an entertainment board for an Israeli family (Hebrew speakers; adults, teenagers and children). The category: ${c.name} – ${c.what}.
From the recent headlines below, choose only what is WORTH RECOMMENDING: works that reviewers praise or that are widely loved, notable new releases with good reception, events worth going to. Leave out gossip, scandals, deaths, lawsuits, business news, politics, crime, and anything crude or not suitable for a family. Prefer what is available in Israel. 4–8 picks; fewer if few are worth it.
For each pick use Google Search to check where in Israel it can be watched / heard / played / bought / booked RIGHT NOW (the streaming service or channel, the cinemas, the venue and the ticket site, the music services, the game platforms, the bookshops). Name each service as it is called (Netflix, yes, HOT, כאן 11, קשת 12, Disney+, Apple TV+, Spotify, Steam, PlayStation, Eventim…) and give its domain. If you could not find where, give an empty list – never guess.
Write in Hebrew: "title" (the Hebrew name if it has one, else the original), "original" (the original name), "kind" (סדרה / סרט / אלבום / שיר / הופעה / מחזה / משחק / ספר / קומיקס …), "what" (one sentence: what it is), "why" (one or two sentences: why it is recommended, from the reviews), "rating" (a review score if there is one, e.g. "Metacritic 88", else empty), "family" (who it suits: "לכל המשפחה" / "מגיל 12" / "למבוגרים"…).
Answer with JSON only: {"picks": [{"i": <the number of the headline>, "title": "", "original": "", "kind": "", "what": "", "why": "", "rating": "", "family": "", "where": [{"name": "", "domain": "", "note": "e.g. עונה 2, from 20.11, tickets from ₪150", "url": ""}]}]}`;
  let picks: z.infer<typeof Pick>[] = [];
  try {
    const g = await geminiGrounded(ctx.env, { system, prompt: list });
    picks = Picks.parse(jsonIn(g.text)).picks;
  } catch (e) {
    // no search: Claude or Gemini choose, and say nothing about where (unverified)
    console.error('fun grounded', e instanceof Error ? e.message : e);
    const r = await aiJson(ctx.env, { prefer: 'gemini', schema: Picks, system: system.replace(/For each pick use Google Search[\s\S]*?never guess\./, 'Leave "where" as an empty list.'), prompt: list });
    picks = r.picks.map((p) => ({ ...p, where: [] }));
  }
  return picks.filter((p) => items[p.i]).slice(0, 8).map((p) => {
    const it = items[p.i];
    return { ...p, i: undefined, link: it.link, image: it.image, source: it.feed, date: it.date,
      where: p.where.map((w) => { const sv = serviceOf(w.name, w.domain); return { name: sv.name || w.name, domain: sv.domain, note: w.note, url: /^https?:\/\//.test(w.url) ? w.url : '' }; }) };
  });
}

/** GET /api/fun/picks?cat=tv → { cat, name, picks, at } (kept for twelve hours; older ones are shown while new ones are chosen) */
export async function picks(ctx: Ctx) {
  requireUser(ctx);
  const cat = ctx.url.searchParams.get('cat') || 'tv';
  if (!CATEGORIES[cat]) throw new HttpError(400, 'Unknown category');
  const key = 'fun|' + cat;
  const row = await ctx.env.DB.prepare('SELECT answer, created_at FROM research_answers WHERE key = ?').bind(key).first<{ answer: string; created_at: number }>();
  const fresh = ctx.url.searchParams.get('fresh') === '1';
  const save = async () => {
    const list = await choose(ctx, cat);
    if (list.length) await ctx.env.DB.prepare('INSERT OR REPLACE INTO research_answers (key, answer, created_at) VALUES (?, ?, ?)').bind(key, JSON.stringify(list), Date.now()).run();
    return list;
  };
  if (row && !fresh) {
    if (Date.now() - row.created_at > KEEP) ctx.waitUntil(save().catch((e) => console.error('fun refresh', e)));
    return json({ cat, name: CATEGORIES[cat].name, picks: JSON.parse(row.answer), at: row.created_at });
  }
  const list = await save();
  return json({ cat, name: CATEGORIES[cat].name, picks: list, at: Date.now() });
}

/** GET /api/fun/logo/:domain – the service's icon, kept at the edge for a month */
export async function logo(ctx: Ctx) {
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
