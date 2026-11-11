// The songbook (שירון): search Shironet (lyrics) and Tab4u (chords) as cards, and read a song inside the app
// (fetched live from its site when opened, with the source credited and linked; nothing of theirs is stored),
// plus the household's own songbook: saved songs (as links) and the family's own chord sheets.

import { Ctx, HttpError, body, json, requireUser } from './core';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const decode = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();

type Hit = { source: 'shironet' | 'tab4u'; title: string; artist: string; url: string; snippet?: string; image?: string; rating?: number };

let mockBase = '';   // dev/test only: SONGS_MOCK_URL serves saved pages
async function fetchHtml(url: string) {
  if (mockBase) { const u = new URL(url); url = `${mockBase}/${u.hostname}${u.pathname}${u.search}`; }
  const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'he,en;q=0.8', accept: 'text/html' }, cf: { cacheTtl: 3600 } } as RequestInit);
  if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`);
  return r.text();
}

function shironet(html: string): Hit[] {
  const out: Hit[] = [];
  const re = /<a href="(\/artist\?type=lyrics[^"]*wrkid=\d+)" class="search_link_name_big">([\s\S]*?)<\/a>\s*-\s*<a href="\/artist\?lang=1&prfid=\d+" class="search_link_name_big">([\s\S]*?)<\/a>[\s\S]*?<td width="400"[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = re.exec(html)) && out.length < 24) {
    out.push({ source: 'shironet', url: 'https://shironet.mako.co.il' + m[1].replace(/&amp;/g, '&'), title: decode(m[2]), artist: decode(m[3]), snippet: decode(m[4]).slice(0, 160) });
  }
  return out;
}

function tab4u(html: string): Hit[] {
  const out: Hit[] = [];
  const re = /<a [^>]*class="ruSongLink[^"]*"[^>]*href="(tabs\/songs\/[^"]+)">([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && out.length < 24) {
    const inner = m[2];
    const img = /background-image:url\(([^)]+)\)/.exec(inner)?.[1] || '';
    const title = decode(/class="sNameI19">([\s\S]*?)<\/div>/.exec(inner)?.[1] || '').replace(/\s*\/\s*$/, '');
    const artist = decode(/class="aNameI19">([\s\S]*?)<\/div>/.exec(inner)?.[1] || '');
    const rating = Number(/class="rankNumInS">([\d.]+)/.exec(inner)?.[1] || 0) || undefined;
    if (!title) continue;
    out.push({ source: 'tab4u', url: 'https://www.tab4u.com/' + m[1], title, artist, rating,
      image: img && !/noArtPic/.test(img) ? new URL(img, 'https://www.tab4u.com/').toString() : undefined });
  }
  return out;
}

/** GET /api/songs/search?q=…&kind=lyrics|chords */
function useMock(ctx: Ctx) { mockBase = (ctx.env.DEV_MODE === '1' && ctx.env.SONGS_MOCK_URL) || ''; }

export async function search(ctx: Ctx) {
  requireUser(ctx);
  useMock(ctx);
  const q = (ctx.url.searchParams.get('q') || '').trim().slice(0, 80);
  const kind = ctx.url.searchParams.get('kind') === 'chords' ? 'chords' : 'lyrics';
  if (q.length < 2) return json({ results: [] });
  const enc = encodeURIComponent(q).replace(/%20/g, '+');
  try {
    const results = kind === 'lyrics'
      ? shironet(await fetchHtml(`https://shironet.mako.co.il/search?q=${enc}`))
      : tab4u(await fetchHtml(`https://www.tab4u.com/resultsSimple?tab=songs&q=${enc}`));
    return json({ results }, 200, { 'cache-control': 'private, max-age=3600' });
  } catch (e) {
    console.error('songs search', kind, e instanceof Error ? e.message : e);
    return json({ results: [], error: kind === 'lyrics' ? 'שירונט לא ענה כרגע' : 'טאב4יו לא ענה כרגע' });
  }
}

/* ---------------- the lyrics of what's playing (the music player asks) ---------------- */

/** A track's name as players give it, made into a song name: no "(Live)", "- Remastered", "| Official Video", "feat. …";
    a YouTube title "Artist - Song" split into its two halves. */
export function cleanTrack(title: string, artist: string) {
  let t = String(title || ''), a = String(artist || '');
  t = t.replace(/[([{【].*?[)\]}】]/g, ' ').replace(/\s[-–|•]\s*(\d{4}\s*)?(remaster(ed)?|live|official|video|audio|lyrics?|clip|extended|radio edit|original mix|remix|edit|version|mix|קליפ|הופעה|גרסה|מתוך|רמיקס).*$/i, ' ')
    .replace(/\b(feat|ft|featuring)\.?\s.*$/i, ' ').replace(/[|•].*$/, ' ').replace(/\s+/g, ' ').trim();
  // a YouTube channel is not an artist ("ShlomoArtziOfficial", "… - Topic", "…VEVO"): then the title says who sings it
  const channel = !a || /official|topic|vevo|records|music$/i.test(a) || (/^[A-Za-z0-9]+$/.test(a) && /[א-ת]/.test(t));
  a = a.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').replace(/official$/i, '').trim();
  const split = /^(.+?)\s+[-–]\s+(.+)$/.exec(t);
  if (split && channel) { a = split[1].trim(); t = split[2].trim(); }
  a = a.split(/,|&| ו(?=\S)/)[0].trim();
  return { title: t, artist: a };
}
const nrm = (s: string) => s.replace(/[֑-ׇ]/g, '').replace(/['"`׳״.,!?\-–_()]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
function best(hits: Hit[], title: string, artist: string): Hit | null {
  const T = nrm(title), A = nrm(artist);
  let top: Hit | null = null, topScore = 0;
  for (const h of hits) {
    const ht = nrm(h.title), ha = nrm(h.artist);
    // the song's name has to match; the singer only decides between versions
    let sc = ht === T ? 3 : (ht.includes(T) || T.includes(ht)) && Math.min(ht.length, T.length) >= 2 ? 2 : 0;
    if (!sc) continue;
    if (A && ha && (ha.includes(A) || A.includes(ha))) sc += 2;
    if (sc > topScore) { top = h; topScore = sc; }
  }
  return topScore >= 2 ? top : null;
}

/** GET /api/songs/lookup?title=…&artist=… : the best lyrics (Shironet) and chords (Tab4u) for a playing track. */
export async function lookup(ctx: Ctx) {
  requireUser(ctx);
  useMock(ctx);
  const { title, artist } = cleanTrack(ctx.url.searchParams.get('title') || '', ctx.url.searchParams.get('artist') || '');
  if (title.length < 2) return json({ title, artist, lyrics: null, chords: null });
  const q = encodeURIComponent((title + ' ' + artist).trim().slice(0, 80)).replace(/%20/g, '+');
  const [ly, ch] = await Promise.all([
    fetchHtml(`https://shironet.mako.co.il/search?q=${q}`).then(shironet).catch((): Hit[] => []),
    fetchHtml(`https://www.tab4u.com/resultsSimple?tab=songs&q=${q}`).then(tab4u).catch((): Hit[] => []),
  ]);
  // only the title, when title + artist found nothing (the artist's name is often written differently)
  let lyHits = ly, chHits = ch;
  if (!best(lyHits, title, artist)) lyHits = lyHits.concat(await fetchHtml(`https://shironet.mako.co.il/search?q=${encodeURIComponent(title).replace(/%20/g, '+')}`).then(shironet).catch((): Hit[] => []));
  if (!best(chHits, title, artist)) chHits = chHits.concat(await fetchHtml(`https://www.tab4u.com/resultsSimple?tab=songs&q=${encodeURIComponent(title).replace(/%20/g, '+')}`).then(tab4u).catch((): Hit[] => []));
  let lyrics = best(lyHits, title, artist), chords = best(chHits, title, artist);
  // the singer decides which song it is (many songs share a name):
  // – the other site found it by this singer, and this site has the same singer too → that version;
  // – the other site found it by this singer, and this site only has someone else's song by that name → none (it's another song);
  // – neither site knows the singer by this name (a cover, or a name in another script) → keep what matched the title.
  const like = (h: Hit | null, who: string) => !!h && !!who && (nrm(h.artist).includes(nrm(who)) || nrm(who).includes(nrm(h.artist)));
  const fix = (mine: Hit | null, hits: Hit[], other: Hit | null) => {
    if (!mine || like(mine, artist) || !other || !like(other, artist)) return mine;
    const same = best(hits, title, other.artist);
    return like(same, other.artist) ? same : null;
  };
  const ly2 = fix(lyrics, lyHits, chords), ch2 = fix(chords, chHits, lyrics);
  lyrics = ly2; chords = ch2;
  // a singer written differently (Spotify's "Shlomo Artzi"): when the two sites agree on someone, take that singer's versions
  if (lyrics && chords && !like(lyrics, artist) && !like(chords, artist) && !like(lyrics, chords.artist)) lyrics = best(lyHits, title, chords.artist) || lyrics;
  return json({ title, artist, lyrics, chords }, 200, { 'cache-control': 'private, max-age=600' });
}

/* ---------------- reading a song in the app ---------------- */

const lines = (h: string) => h.replace(/<br\s*\/?>/gi, '\n').split('\n').map((l) => decode(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();

function shironetSong(html: string) {
  const title = decode(/<h1 class="artist_song_name_txt"[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] || '');
  const artist = decode(/class="artist_singer_title"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1] || '');
  const head = html.slice(html.indexOf('artist_singer_title'), html.indexOf('artist_lyrics_text'));
  const credits = [...head.matchAll(/<b>([\s\S]*?)<\/b>/g)].map((m) => decode(m[1])).filter((t) => /:/.test(t)).slice(0, 4);
  const lyr = /class="artist_lyrics_text">([\s\S]*?)<\/span>/.exec(html)?.[1];
  if (!lyr) throw new HttpError(404, 'לא נמצאו מילים בעמוד');
  return { kind: 'lyrics', title, artist, credits, text: lines(lyr) };
}

function tab4uSong(html: string) {
  const start = html.indexOf('id="songContentTPL"');
  if (start < 0) throw new HttpError(404, 'לא נמצאו אקורדים בעמוד');
  const end = html.indexOf('id="ratingKot"', start);
  const body = html.slice(start, end > 0 ? end : start + 200000);
  const out: string[] = [];
  const re = /<td class=['"](chords|song|tabs)['"][^>]*>([\s\S]*?)<\/td>|<br\s*\/?>\s*<table/g;
  let m;
  let lastBlank = true;
  while ((m = re.exec(body))) {
    if (!m[1]) { if (!lastBlank) out.push(''); lastBlank = true; continue; }
    let t = m[2].replace(/<span class=['"]titLine['"]>([\s\S]*?)<\/span>/g, '[$1]').replace(/<br\s*\/?>/gi, '\n');
    t = t.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '\u00a0').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    for (const l of t.split('\n')) {
      // the page's own indentation is plain whitespace; the song's spacing is &nbsp; and must stay
      const line = l.replace(/^[ \t\r]+|[ \t\r]+$/g, '').replace(/\u00a0/g, ' ').replace(/\s+$/, '');
      if (!line.trim()) continue;
      out.push(line);
      lastBlank = false;
    }
  }
  const h1 = decode(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] || '').replace(/^אקורדים לשיר\s*/, '');
  const artist = decode(/class='artistTitle[^']*'[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1] || '');
  const title = artist && h1.endsWith(' של ' + artist) ? h1.slice(0, -(' של ' + artist).length) : h1;
  return { kind: 'chords', title, artist, credits: [] as string[], text: out.join('\n').trim() };
}

/** GET /api/songs/page?url=… : the song itself, fetched live from Shironet or Tab4u. */
export async function page(ctx: Ctx) {
  requireUser(ctx);
  useMock(ctx);
  const url = ctx.url.searchParams.get('url') || '';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* invalid */ }
  if (host !== 'shironet.mako.co.il' && host !== 'www.tab4u.com') throw new HttpError(400, 'Unsupported site');
  const html = await fetchHtml(url).catch(() => { throw new HttpError(502, 'האתר לא ענה כרגע'); });
  const song = host === 'shironet.mako.co.il' ? shironetSong(html) : tab4uSong(html);
  return json({ ...song, url, source: host === 'shironet.mako.co.il' ? 'shironet' : 'tab4u' }, 200, { 'cache-control': 'private, max-age=3600' });
}

/** GET /api/songs/health (public): can the server reach both sites right now? Counts only. */
export async function health(ctx: Ctx) {
  useMock(ctx);
  const q = encodeURIComponent('ירושלים');
  const [a, b] = await Promise.all([
    fetchHtml(`https://shironet.mako.co.il/search?q=${q}`).then((h) => shironet(h).length).catch((e) => String(e.message || e)),
    fetchHtml(`https://www.tab4u.com/resultsSimple?tab=songs&q=${q}`).then((h) => tab4u(h).length).catch((e) => String(e.message || e)),
  ]);
  return json({ shironet: a, tab4u: b });
}

/* ---------------- the household's own songbook ---------------- */

type SongRow = { id: string; title: string; artist: string | null; kind: string; body: string | null; url: string | null; created_by: string; updated_at: number };

export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT id, title, artist, kind, body, url, created_by, updated_at FROM songs WHERE household = ? ORDER BY updated_at DESC')
    .bind(u.household).all<SongRow>();
  return json({ songs: results });
}

function clean(b: any) {
  const title = String(b.title || '').trim().slice(0, 120);
  if (!title) throw new HttpError(400, 'צריך שם לשיר');
  const kind = ['chords', 'lyrics', 'link'].includes(b.kind) ? b.kind : 'chords';
  const url = b.url ? String(b.url).slice(0, 500) : null;
  if (url && !/^https:\/\/(shironet\.mako\.co\.il|www\.tab4u\.com|www\.google\.com|www\.sefaria\.org|[a-z0-9.-]+)\//i.test(url)) throw new HttpError(400, 'Invalid link');
  return { title, artist: String(b.artist || '').trim().slice(0, 120) || null, kind, body: b.body ? String(b.body).slice(0, 40000) : null, url };
}

export async function save(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = clean(await body(ctx.req));
  const id = ctx.params.id || crypto.randomUUID();
  if (ctx.params.id) {
    const r = await ctx.env.DB.prepare('UPDATE songs SET title = ?, artist = ?, kind = ?, body = ?, url = ?, updated_at = ? WHERE id = ? AND household = ?')
      .bind(b.title, b.artist, b.kind, b.body, b.url, Date.now(), id, u.household).run();
    if (!r.meta.changes) throw new HttpError(404, 'Not found');
  } else {
    if (b.url) {
      const dup = await ctx.env.DB.prepare('SELECT id FROM songs WHERE household = ? AND url = ?').bind(u.household, b.url).first<{ id: string }>();
      if (dup) return json({ ok: true, id: dup.id, existed: true });
    }
    await ctx.env.DB.prepare('INSERT INTO songs (id, household, title, artist, kind, body, url, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, u.household, b.title, b.artist, b.kind, b.body, b.url, u.email, Date.now(), Date.now()).run();
  }
  return json({ ok: true, id });
}

export async function remove(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM songs WHERE id = ? AND household = ?').bind(ctx.params.id, u.household).run();
  return json({ ok: true });
}

/** For tests: the page parsers. */
export const _parse = { shironet, tab4u, shironetSong, tab4uSong };
