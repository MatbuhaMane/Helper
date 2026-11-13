// His voice: Gemini's speech generation (30 trained voices that speak Hebrew), directed to sound like a warm, wise
// old scholar. Each person picks a voice; every spoken line is cached in R2 (same voice + text = no new charge), with a
// daily per-person allowance. Uses the Gemini key the helper already has.

import { Ctx, Env, HttpError, body, json, requireUser } from './core';
import { z } from 'zod';
import { aiJson } from './ai';
import { forSpeech, needsNiqqud, protect, restore } from './speech-text';

export const DEFAULT_VOICE = 'Algenib';   // the owner's choice: deep and a little gravelly
const DAILY_CHARS = 30000;
// the sample has ח and ע in it, so the accent can be heard
const SAMPLE = 'שלום וברכה, אני אבן עזרא, ושמח לעזור לכם. מה נחפש יחד היום?';
// An old man's voice with the Hebrew of the Jews of the East: ח and ע from the throat, as Ibn Ezra himself said them.
// The pace stays lively (the person asked for faster reading; the client can speed playback further, prefs.rate).
const STYLE = 'Read this aloud in Hebrew as a very old, wise and kind Mizrahi Jewish sage of about eighty: a deep, slightly gravelly, ' +
  'aged voice with warmth and a hint of a smile, at an easy conversational pace. Use the traditional Mizrahi (Yemenite/Iraqi) ' +
  'pronunciation: say every ח (Het) as a strong pharyngeal [ħ], never like כ or a Western "ch", and every ע (Ayin) as a ' +
  'clear pharyngeal [ʕ] from the throat, never silent like א. Read:';

// Gemini's prebuilt voices: name, gender, character (in Hebrew, for the picker)
const VOICES: [string, 'male' | 'female', string][] = [
  ['Algenib', 'male', 'צרוד'], ['Sadaltager', 'male', 'בקיא'], ['Charon', 'male', 'מסביר'], ['Iapetus', 'male', 'צלול'],
  ['Rasalgethi', 'male', 'מסביר'], ['Schedar', 'male', 'שקול'], ['Orus', 'male', 'תקיף'], ['Alnilam', 'male', 'תקיף'],
  ['Algieba', 'male', 'חלק'], ['Enceladus', 'male', 'נושם'], ['Umbriel', 'male', 'נינוח'], ['Achird', 'male', 'ידידותי'],
  ['Zubenelgenubi', 'male', 'יומיומי'], ['Puck', 'male', 'עליז'], ['Fenrir', 'male', 'נלהב'], ['Sadachbia', 'male', 'תוסס'],
  ['Gacrux', 'female', 'בוגר'], ['Sulafat', 'female', 'חם'], ['Vindemiatrix', 'female', 'עדין'], ['Achernar', 'female', 'רך'],
  ['Despina', 'female', 'חלק'], ['Erinome', 'female', 'צלול'], ['Kore', 'female', 'תקיף'], ['Callirrhoe', 'female', 'נינוח'],
  ['Aoede', 'female', 'אוורירי'], ['Zephyr', 'female', 'בהיר'], ['Autonoe', 'female', 'בהיר'], ['Leda', 'female', 'צעיר'],
  ['Laomedeia', 'female', 'עליז'], ['Pulcherrima', 'female', 'נחרץ'],
];
const NAMES = new Set(VOICES.map((v) => v[0]));

function model(env: Env) { return env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts'; }
function base(env: Env) { return (env.DEV_MODE === '1' && env.GEMINI_BASE_URL) || 'https://generativelanguage.googleapis.com'; }

/** The voices (public). */
export function listVoices(ctx: Ctx) {
  return json({
    voices: VOICES.map(([name, gender, trait]) => ({ name, gender, label: name, trait, hd: true })),
    default: DEFAULT_VOICE, available: !!ctx.env.GEMINI_API_KEY,
  }, 200, { 'cache-control': 'public, max-age=3600' });
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
  if (!NAMES.has(v)) throw new HttpError(400, 'Invalid voice');
  await ctx.env.DB.prepare('INSERT INTO voice_prefs (email, voice, updated_at) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET voice = excluded.voice, updated_at = excluded.updated_at')
    .bind(u.email, v, Date.now()).run();
  return json({ ok: true, voice: v });
}

async function googleError(r: Response) {
  const t = await r.text();
  try { return JSON.parse(t).error?.message || t.slice(0, 300); } catch { return t.slice(0, 300); }
}

async function sha(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** A WAV file around Gemini's raw 16-bit mono PCM. */
function wav(pcm: Uint8Array, rate: number) {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, t: string) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt ');
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, rate, true);
  h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(h.buffer), 0); out.set(pcm, 44);
  return out;
}

const AUDIO_HEADERS = { 'content-type': 'audio/wav', 'cache-control': 'private, max-age=604800' };

/** The line with full niqqud, so the voice reads every word right (the owner: always, for what is read aloud). Gemini
    first (the text goes to Google's voice anyway); the approved name is kept aside; any doubt – the line as it was. */
async function pointed(env: Env, text: string): Promise<string> {
  if (!needsNiqqud(text)) return text;
  const p = protect(text);
  try {
    const r = await aiJson(env, {
      prefer: 'gemini', fast: true, effort: 'low',
      system: 'You add full Hebrew niqqud (vowel points, with dagesh and shin/sin dots) to text that a speech engine will read aloud, so every word is pronounced correctly in its context. Change nothing else: the same letters, words, order and punctuation. Keep non-Hebrew text, numbers and tokens like @@1@@ exactly as they are.',
      prompt: p.text, schema: z.object({ text: z.string() }),
    });
    return restore(r.text, text, p.kept);
  } catch (e) {
    console.warn('niqqud failed, reading as is', e instanceof Error ? e.message : e);
    return text;
  }
}

/** Synthesize (or fetch from the cache) one line in one voice. Returns the WAV bytes, and whether it was new. */
async function synth(ctx: Ctx, voice: string, text: string): Promise<{ bytes: Uint8Array | ReadableStream; fresh: boolean }> {
  const env = ctx.env;
  if (!env.GEMINI_API_KEY) throw new HttpError(503, 'no voice service');
  // what is read, not what is shown: רַאבַּ"ע as one word (server/speech-text.ts). The cache is keyed by that text, so
  // the niqqud below is added only once for each line.
  text = forSpeech(text);
  const k = `tts/${await sha(`gemini|${model(env)}|${voice}|${STYLE}|${text}`)}.wav`;
  const stored = env.MEDIA ? await env.MEDIA.get(k) : null;
  if (stored) return { bytes: stored.body, fresh: false };
  text = await pointed(env, text);
  if (env.DEV_MODE === '1') console.log('TTS text:', text);
  let r: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await fetch(`${base(env)}/v1beta/models/${model(env)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${STYLE}\n${text}` }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
    });
    if (r.ok || r.status < 500) break;
  }
  if (!r!.ok) {
    const msg = await googleError(r!);
    console.error('TTS', r!.status, msg);
    throw new HttpError(r!.status === 429 ? 429 : 502, `voice service: ${msg}`);
  }
  const data = await r!.json<any>();
  const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
  if (!part) throw new HttpError(502, 'voice service: no audio');
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1] || 24000);
  const pcm = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
  const bytes = wav(pcm, rate);
  if (env.MEDIA) ctx.waitUntil(env.MEDIA.put(k, bytes, { httpMetadata: { contentType: 'audio/wav' } }));
  return { bytes, fresh: true };
}

/** The picker's sample line in a voice (public: one fixed sentence per voice, cached for good). */
export async function sample(ctx: Ctx) {
  const v = decodeURIComponent(ctx.params.voice || '');
  if (!NAMES.has(v)) throw new HttpError(400, 'Invalid voice');
  const { bytes } = await synth(ctx, v, SAMPLE);
  return new Response(bytes, { headers: { ...AUDIO_HEADERS, 'cache-control': 'public, max-age=2592000' } });
}

/** Speak a line. Body: { text, voice? } (voice defaults to the person's choice). */
export async function say(ctx: Ctx) {
  const u = requireUser(ctx);
  const env = ctx.env;
  const b = await body<{ text: string; voice?: string }>(ctx.req);
  const text = String(b.text || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!text) throw new HttpError(400, 'empty');
  let voice = String(b.voice || '');
  if (!voice) voice = (await env.DB.prepare('SELECT voice FROM voice_prefs WHERE email = ?').bind(u.email).first<{ voice: string }>())?.voice || DEFAULT_VOICE;
  if (!NAMES.has(voice)) voice = DEFAULT_VOICE;
  const day = new Date().toISOString().slice(0, 10);
  const q = await env.DB.prepare('SELECT chars FROM tts_quota WHERE email = ? AND day = ?').bind(u.email, day).first<{ chars: number }>();
  if ((q?.chars || 0) + text.length > DAILY_CHARS) throw new HttpError(429, 'daily voice allowance used');
  const { bytes, fresh } = await synth(ctx, voice, text);
  if (fresh) {
    await env.DB.prepare('INSERT INTO tts_quota (email, day, chars) VALUES (?, ?, ?) ON CONFLICT(email, day) DO UPDATE SET chars = chars + excluded.chars')
      .bind(u.email, day, text.length).run();
  }
  return new Response(bytes, { headers: AUDIO_HEADERS });
}
