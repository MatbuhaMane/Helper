// The music player's server side.
//
// Spotify works the way Waze does: the music plays in the person's own Spotify app (phone, computer, speaker),
// which keeps playing in the background, and the helper is its remote: what's playing, play/pause, skip, volume,
// which device plays, search, playlists. Each person connects their own Spotify (Premium) account; the sign-in
// uses PKCE (no client secret), and the refresh token is kept encrypted per person.
//
// YouTube plays in the browser (the IFrame player, on the client); the server only searches: with the YouTube
// Data API when a key is set, otherwise through Gemini with Google Search.

import { Ctx, HttpError, body, decrypt, encrypt, json, requireUser } from './core';
import { geminiGrounded, jsonIn } from './ai';

// streaming + user-read-email/private: the helper itself can be a Spotify player (the Web Playback SDK, on a computer)
const SCOPES = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
  'playlist-read-private', 'playlist-read-collaborative', 'user-library-read', 'user-read-recently-played',
].join(' ');
const API = 'https://api.spotify.com/v1';

function redirectUri(ctx: Ctx): string {
  // Spotify accepts only https addresses or the loopback IP (not "localhost") for local development.
  const o = ctx.url.origin.replace('//localhost:', '//127.0.0.1:');
  return `${o}/api/music/spotify/callback`;
}
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(n = 48): string { return b64url(crypto.getRandomValues(new Uint8Array(n))); }
async function challenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}
function back(ctx: Ctx, status: string, next = '/'): Response {
  const u = new URL(next.startsWith('/') ? next : '/', ctx.url.origin);
  u.searchParams.set('music', status);
  return new Response(null, { status: 302, headers: { location: u.pathname + u.search } });
}

/** Whether this person is connected, and whether the helper is set up for Spotify at all. */
export async function status(ctx: Ctx) {
  const u = requireUser(ctx);
  const row = await ctx.env.DB.prepare('SELECT refresh, scope FROM music_tokens WHERE email = ? AND provider = ?').bind(u.email, 'spotify').first<{ refresh: string | null; scope: string | null }>();
  return json({ spotify: { configured: !!ctx.env.SPOTIFY_CLIENT_ID, connected: !!row?.refresh, stream: /\bstreaming\b/.test(row?.scope || '') }, youtube: { search: ctx.env.YOUTUBE_API_KEY ? 'api' : ctx.env.GEMINI_API_KEY ? 'ai' : 'none' } });
}

/** Step 1 of connecting: off to Spotify's own sign-in and consent page. */
export async function login(ctx: Ctx) {
  if (!ctx.env.SPOTIFY_CLIENT_ID) return back(ctx, 'not_configured', ctx.url.searchParams.get('next') || '/');
  // The loopback rule (local development): the whole sign-in happens on 127.0.0.1 so the cookie matches when Spotify sends us back.
  if (ctx.url.hostname === 'localhost') return new Response(null, { status: 302, headers: { location: ctx.url.href.replace('//localhost:', '//127.0.0.1:') } });
  if (!ctx.user) return new Response(null, { status: 302, headers: { location: '/?next=' + encodeURIComponent(ctx.url.pathname + ctx.url.search) } });
  const u = ctx.user;
  const verifier = randomString(48);
  const state = randomString(18) + '.' + encodeURIComponent((ctx.url.searchParams.get('next') || '/').slice(0, 200));
  await ctx.env.DB.prepare(
    `INSERT INTO music_tokens (email, provider, pkce, state, updated_at) VALUES (?, 'spotify', ?, ?, ?)
     ON CONFLICT(email, provider) DO UPDATE SET pkce = excluded.pkce, state = excluded.state, updated_at = excluded.updated_at`,
  ).bind(u.email, verifier, state, Date.now()).run();
  const q = new URLSearchParams({
    response_type: 'code', client_id: ctx.env.SPOTIFY_CLIENT_ID, scope: SCOPES, redirect_uri: redirectUri(ctx),
    state, code_challenge_method: 'S256', code_challenge: await challenge(verifier),
  });
  return new Response(null, { status: 302, headers: { location: `https://accounts.spotify.com/authorize?${q}` } });
}

/** Step 2: Spotify sends the person back with a code, which becomes their tokens. */
export async function callback(ctx: Ctx) {
  const u = ctx.user;
  if (!u) return back(ctx, 'signin');
  const state = ctx.url.searchParams.get('state') || '';
  const next = decodeURIComponent(state.split('.').slice(1).join('.') || '/');
  if (ctx.url.searchParams.get('error')) return back(ctx, 'denied', next);
  const row = await ctx.env.DB.prepare('SELECT pkce, state FROM music_tokens WHERE email = ? AND provider = ?').bind(u.email, 'spotify').first<{ pkce: string; state: string }>();
  if (!row?.pkce || row.state !== state) return back(ctx, 'expired', next);
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: ctx.url.searchParams.get('code') || '', redirect_uri: redirectUri(ctx), client_id: ctx.env.SPOTIFY_CLIENT_ID!, code_verifier: row.pkce }),
  });
  if (!res.ok) { console.error('Spotify token', res.status, (await res.text()).slice(0, 300)); return back(ctx, 'failed', next); }
  const t = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; scope?: string };
  await ctx.env.DB.prepare('UPDATE music_tokens SET refresh = ?, access = ?, expires_at = ?, scope = ?, pkce = NULL, state = NULL, updated_at = ? WHERE email = ? AND provider = ?')
    .bind(await encrypt(ctx.env, t.refresh_token), t.access_token, Date.now() + (t.expires_in - 60) * 1000, t.scope || '', Date.now(), u.email, 'spotify').run();
  return back(ctx, 'connected', next);
}

/** A short-lived access token for the player in this browser (Spotify's Web Playback SDK asks for one). */
export async function playerToken(ctx: Ctx) {
  return json({ token: await token(ctx) }, 200, { 'cache-control': 'no-store' });
}

export async function disconnect(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM music_tokens WHERE email = ? AND provider = ?').bind(u.email, 'spotify').run();
  return json({ ok: true });
}

/** A fresh access token for this person (refreshed when it is about to run out). */
async function token(ctx: Ctx): Promise<string> {
  const u = requireUser(ctx);
  const row = await ctx.env.DB.prepare('SELECT refresh, access, expires_at FROM music_tokens WHERE email = ? AND provider = ?').bind(u.email, 'spotify').first<{ refresh: string | null; access: string | null; expires_at: number | null }>();
  if (!row?.refresh) throw new HttpError(409, 'spotify_not_connected');
  if (row.access && (row.expires_at || 0) > Date.now()) return row.access;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: await decrypt(ctx.env, row.refresh), client_id: ctx.env.SPOTIFY_CLIENT_ID || '' }),
  });
  if (!res.ok) {
    // revoked (or the app lost access): forget it, so the player asks to connect again
    if (res.status === 400 || res.status === 401) await ctx.env.DB.prepare('DELETE FROM music_tokens WHERE email = ? AND provider = ?').bind(u.email, 'spotify').run();
    throw new HttpError(409, 'spotify_not_connected');
  }
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  await ctx.env.DB.prepare('UPDATE music_tokens SET access = ?, expires_at = ?, refresh = COALESCE(?, refresh), updated_at = ? WHERE email = ? AND provider = ?')
    .bind(t.access_token, Date.now() + (t.expires_in - 60) * 1000, t.refresh_token ? await encrypt(ctx.env, t.refresh_token) : null, Date.now(), u.email, 'spotify').run();
  return t.access_token;
}

async function spotify(ctx: Ctx, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(API + path, { ...init, headers: { authorization: `Bearer ${await token(ctx)}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  if (res.status === 204 || res.status === 202) return null;
  const text = await res.text();
  if (!res.ok) {
    let reason = '';
    try { reason = JSON.parse(text)?.error?.reason || JSON.parse(text)?.error?.message || ''; } catch (_) { /* not json */ }
    if (res.status === 404 && /NO_ACTIVE_DEVICE|device/i.test(reason + text)) throw new HttpError(409, 'no_active_device');
    if (res.status === 403 && /PREMIUM/i.test(reason + text)) throw new HttpError(403, 'premium_required');
    if (res.status === 429) throw new HttpError(429, 'spotify_busy');
    console.error('Spotify', path, res.status, text.slice(0, 300));
    throw new HttpError(502, `spotify_error_${res.status}`);
  }
  return text ? JSON.parse(text) : null;
}

const img = (images?: { url: string; width?: number }[]) => (images || []).slice().sort((a, b) => (a.width || 0) - (b.width || 0)).find((i) => (i.width || 300) >= 120)?.url || images?.[0]?.url || '';
function trackOut(t: any) {
  if (!t) return null;
  return { uri: t.uri, id: t.id, title: t.name, artist: (t.artists || t.show ? (t.artists || []).map((a: any) => a.name).join(', ') || t.show?.name : ''), art: img(t.album?.images || t.images), duration: t.duration_ms || 0 };
}

/** What is playing now, where, and how far along. */
export async function state(ctx: Ctx) {
  const s = await spotify(ctx, '/me/player?additional_types=episode');
  if (!s) return json({ active: false });
  return json({
    active: true, playing: !!s.is_playing, progress: s.progress_ms || 0, at: Date.now(), shuffle: !!s.shuffle_state, repeat: s.repeat_state,
    device: s.device ? { id: s.device.id, name: s.device.name, type: s.device.type, volume: s.device.volume_percent } : null,
    track: trackOut(s.item),
  });
}

export async function devices(ctx: Ctx) {
  const d = await spotify(ctx, '/me/player/devices');
  return json({ devices: (d?.devices || []).map((x: any) => ({ id: x.id, name: x.name, type: x.type, active: x.is_active, volume: x.volume_percent })) });
}

/** One remote-control press. */
export async function command(ctx: Ctx) {
  const b = await body<{ action: string; uri?: string; context?: string; device?: string; volume?: number; position?: number; on?: boolean }>(ctx.req);
  const dev = b.device ? `?device_id=${encodeURIComponent(b.device)}` : '';
  switch (b.action) {
    case 'play':
      await spotify(ctx, `/me/player/play${dev}`, { method: 'PUT', body: JSON.stringify(b.context ? { context_uri: b.context, ...(b.uri ? { offset: { uri: b.uri } } : {}) } : b.uri ? { uris: [b.uri] } : {}) });
      break;
    case 'pause': await spotify(ctx, `/me/player/pause${dev}`, { method: 'PUT' }); break;
    case 'next': await spotify(ctx, `/me/player/next${dev}`, { method: 'POST' }); break;
    case 'prev': await spotify(ctx, `/me/player/previous${dev}`, { method: 'POST' }); break;
    case 'volume': await spotify(ctx, `/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(b.volume ?? 50)))}`, { method: 'PUT' }); break;
    case 'seek': await spotify(ctx, `/me/player/seek?position_ms=${Math.max(0, Math.round(b.position || 0))}`, { method: 'PUT' }); break;
    case 'shuffle': await spotify(ctx, `/me/player/shuffle?state=${b.on ? 'true' : 'false'}`, { method: 'PUT' }); break;
    case 'transfer': await spotify(ctx, '/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [b.device], play: true }) }); break;
    case 'queue': await spotify(ctx, `/me/player/queue?uri=${encodeURIComponent(b.uri || '')}`, { method: 'POST' }); break;
    default: throw new HttpError(400, 'unknown action');
  }
  return json({ ok: true });
}

/** What plays now and what comes next (Spotify's own queue: the rest of the album or playlist, and what was added). */
export async function queue(ctx: Ctx) {
  const q = await spotify(ctx, '/me/player/queue');
  return json({ now: trackOut(q?.currently_playing), next: (q?.queue || []).slice(0, 30).map(trackOut).filter(Boolean) });
}

export async function search(ctx: Ctx) {
  const q = (ctx.url.searchParams.get('q') || '').trim().slice(0, 120);
  if (!q) return json({ tracks: [], playlists: [] });
  // Development-mode apps get at most 10 results per type.
  const r = await spotify(ctx, `/search?type=track,playlist&limit=10&q=${encodeURIComponent(q)}`);
  return json({
    tracks: (r?.tracks?.items || []).map(trackOut),
    playlists: (r?.playlists?.items || []).filter(Boolean).map((p: any) => ({ uri: p.uri, title: p.name, by: p.owner?.display_name || '', art: img(p.images), count: p.tracks?.total || p.items?.total || 0 })),
  });
}

export async function playlists(ctx: Ctx) {
  const r = await spotify(ctx, '/me/playlists?limit=30');
  return json({ playlists: (r?.items || []).filter(Boolean).map((p: any) => ({ uri: p.uri, title: p.name, by: p.owner?.display_name || '', art: img(p.images), count: p.tracks?.total || p.items?.total || 0 })) });
}

/* ---------------- YouTube search ---------------- */

const YT_ID = /^[\w-]{11}$/;
function ytIdFrom(u: string): string | null {
  try {
    const url = new URL(u);
    if (/youtu\.be$/.test(url.hostname)) return url.pathname.slice(1, 12);
    if (/youtube\.com$/.test(url.hostname)) return url.searchParams.get('v') || (/\/(?:shorts|embed|live)\/([\w-]{11})/.exec(url.pathname)?.[1] ?? null);
  } catch (_) { /* not a url */ }
  return null;
}

export async function youtubeSearch(ctx: Ctx) {
  requireUser(ctx);
  const q = (ctx.url.searchParams.get('q') || '').trim().slice(0, 120);
  if (!q) return json({ videos: [] });
  const direct = ytIdFrom(q);
  if (direct) return json({ videos: [await oembed(direct)] });
  if (ctx.env.YOUTUBE_API_KEY) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=12&q=${encodeURIComponent(q)}&key=${ctx.env.YOUTUBE_API_KEY}`);
    if (r.ok) {
      const d = (await r.json()) as any;
      return json({ videos: (d.items || []).map((i: any) => ({ id: i.id.videoId, title: decodeEntities(i.snippet.title), channel: i.snippet.channelTitle, art: `https://i.ytimg.com/vi/${i.id.videoId}/mqdefault.jpg` })) });
    }
    console.error('YouTube search', r.status, (await r.text()).slice(0, 200));
  }
  // No YouTube key: Gemini searches Google and lists the videos it found; each one is checked with YouTube's oEmbed.
  const res = await geminiGrounded(ctx.env, {
    system: 'You find music videos on YouTube. Answer with JSON only: {"urls": ["https://www.youtube.com/watch?v=..."]}, up to 8 real video addresses that play the requested music (official uploads first).',
    prompt: `Music to play: ${q}`,
  });
  let urls: string[] = [];
  try { urls = (jsonIn(res.text).urls || []) as string[]; } catch (_) { /* fall back to the sources */ }
  urls.push(...res.sources.map((s) => s.url));
  const ids = [...new Set(urls.map(ytIdFrom).filter((x): x is string => !!x && YT_ID.test(x)))].slice(0, 8);
  const videos = (await Promise.all(ids.map((id) => oembed(id).catch(() => null)))).filter((v) => v && v.title);
  return json({ videos });
}

async function oembed(id: string) {
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`);
  if (!r.ok) return { id, title: '', channel: '', art: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` };
  const d = (await r.json()) as any;
  return { id, title: String(d.title || ''), channel: String(d.author_name || ''), art: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` };
}
function decodeEntities(s: string) { return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
