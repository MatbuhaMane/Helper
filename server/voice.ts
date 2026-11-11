// His voice: Google Cloud Text-to-Speech with trained Hebrew voices (Chirp 3: HD, he-IL). Each person picks a voice;
// every spoken line is cached in R2 (same voice + text = no new charge), with a daily per-person allowance.
// The key: GOOGLE_TTS_KEY if set, else the Gemini key (the same Google Cloud project, with the Text-to-Speech API on).

import { Ctx, Env, HttpError, body, json, requireUser } from './core';

export const DEFAULT_VOICE = 'he-IL-Chirp3-HD-Charon';
const DAILY_CHARS = 30000;

function key(env: Env) { return env.GOOGLE_TTS_KEY || env.GEMINI_API_KEY || ''; }
function base(env: Env) { return (env.DEV_MODE === '1' && env.TTS_BASE_URL) || 'https://texttospeech.googleapis.com'; }

async function googleError(r: Response) {
  const t = await r.text();
  try { return JSON.parse(t).error?.message || t.slice(0, 300); } catch { return t.slice(0, 300); }
}

/** The Hebrew voices (public: names only). The trained Chirp 3: HD voices first. */
export async function listVoices(ctx: Ctx) {
  const env = ctx.env;
  if (!key(env)) return json({ voices: [], error: 'no key' });
  const cache = caches.default;
  const ck = new Request('https://voices.helper/he-IL/v1');
  const hit = env.DEV_MODE === '1' ? null : await cache.match(ck);
  if (hit) return hit;
  let r: Response;
  try { r = await fetch(`${base(env)}/v1/voices?languageCode=he-IL`, { headers: { 'x-goog-api-key': key(env) } }); }
  catch (e) { return json({ voices: [], error: 'voice service unreachable' }); }
  if (!r.ok) {
    const msg = await googleError(r);
    console.error('TTS voices', r.status, msg);
    return json({ voices: [], error: msg, status: r.status });
  }
  const data = await r.json<{ voices?: { name: string; ssmlGender: string; languageCodes: string[] }[] }>();
  const rank = (n: string) => (/Chirp3-HD/.test(n) ? 0 : /Chirp-HD/.test(n) ? 1 : /Neural2|Wavenet/.test(n) ? 2 : 3);
  const voices = (data.voices || [])
    .filter((v) => v.languageCodes?.includes('he-IL'))
    .map((v) => ({ name: v.name, gender: v.ssmlGender === 'FEMALE' ? 'female' : v.ssmlGender === 'MALE' ? 'male' : 'neutral', label: v.name.replace(/^he-IL-/, '').replace(/^Chirp3-HD-/, ''), hd: rank(v.name) === 0 }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.gender.localeCompare(b.gender) || a.label.localeCompare(b.label));
  const res = json({ voices, default: DEFAULT_VOICE }, 200, { 'cache-control': 'public, max-age=86400' });
  if (voices.length) ctx.waitUntil(cache.put(ck, res.clone()));
  return res;
}

export async function getPref(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ctx.env.DB.prepare('SELECT voice FROM voice_prefs WHERE email = ?').bind(u.email).first<{ voice: string }>();
  return json({ voice: r?.voice || DEFAULT_VOICE });
}

export async function setPref(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ voice: string }>(ctx.req);
  const v = String(b.voice || '');
  if (!/^he-IL-[A-Za-z0-9-]{2,60}$/.test(v)) throw new HttpError(400, 'Invalid voice');
  await ctx.env.DB.prepare('INSERT INTO voice_prefs (email, voice, updated_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET voice = excluded.voice, updated_at = excluded.updated_at')
    .bind(u.email, v, Date.now()).run();
  return json({ ok: true, voice: v });
}

async function sha(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Speak a line: returns MP3. Body: { text, voice? } (voice defaults to the person's choice). */
export async function say(ctx: Ctx) {
  const u = requireUser(ctx);
  const env = ctx.env;
  if (!key(env)) throw new HttpError(503, 'no voice service');
  const b = await body<{ text: string; voice?: string }>(ctx.req);
  const text = String(b.text || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!text) throw new HttpError(400, 'empty');
  let voice = String(b.voice || '');
  if (!voice) voice = (await env.DB.prepare('SELECT voice FROM voice_prefs WHERE email = ?').bind(u.email).first<{ voice: string }>())?.voice || DEFAULT_VOICE;
  if (!/^he-IL-[A-Za-z0-9-]{2,60}$/.test(voice)) throw new HttpError(400, 'Invalid voice');
  // a line with no Hebrew in it is read by the same voice in English (Chirp 3: HD names are shared across languages)
  const hebrew = /[֐-׿]/.test(text);
  const lang = hebrew || !/Chirp3-HD/.test(voice) ? 'he-IL' : 'en-US';
  const name = lang === 'he-IL' ? voice : voice.replace(/^he-IL-/, 'en-US-');
  const k = `tts/${await sha(`${name}|${text}`)}.mp3`;
  const headers = { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=604800' };
  const stored = env.MEDIA ? await env.MEDIA.get(k) : null;
  if (stored) return new Response(stored.body, { headers });
  const day = new Date().toISOString().slice(0, 10);
  const q = await env.DB.prepare('SELECT chars FROM tts_quota WHERE email = ? AND day = ?').bind(u.email, day).first<{ chars: number }>();
  if ((q?.chars || 0) + text.length > DAILY_CHARS) throw new HttpError(429, 'daily voice allowance used');
  const r = await fetch(`${base(env)}/v1/text:synthesize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key(env) },
    body: JSON.stringify({ input: { text }, voice: { languageCode: lang, name }, audioConfig: { audioEncoding: 'MP3' } }),
  });
  if (!r.ok) {
    const msg = await googleError(r);
    console.error('TTS synthesize', r.status, msg);
    throw new HttpError(502, `voice service: ${msg}`);
  }
  const { audioContent } = await r.json<{ audioContent: string }>();
  const bytes = Uint8Array.from(atob(audioContent), (c) => c.charCodeAt(0));
  await env.DB.prepare('INSERT INTO tts_quota (email, day, chars) VALUES (?, ?, ?) ON CONFLICT(email, day) DO UPDATE SET chars = chars + excluded.chars')
    .bind(u.email, day, text.length).run();
  if (env.MEDIA) ctx.waitUntil(env.MEDIA.put(k, bytes, { httpMetadata: { contentType: 'audio/mpeg' } }));
  return new Response(bytes, { headers });
}
