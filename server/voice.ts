// The companions' voices: Gemini's speech generation (30 trained voices that speak Hebrew). רַאבַּ"ע is directed to sound
// like a warm, wise old scholar; each default animal has its own light voice (server/voice-figures.ts). Each person picks a voice; every spoken line is cached in R2 (same voice + text = no new charge), with a
// daily per-person allowance. Uses the Gemini key the helper already has.

import { Ctx, Env, HttpError, body, json, requireUser } from './core';
import { z } from 'zod';
import { aiJson } from './ai';
import { forSpeech, needsNiqqud, protect, restore, speakName, spokenName } from './speech-text';
import { prefsFor } from './prefs';
import { EZRA_VOICE, figureOf, sampleLine, voiceFor } from './voice-figures';

/** the owner's name as the voice says it: מִישָׁאֵֽל, with a meteg (U+05BD) under the alef */
const OWNER_SPOKEN = 'מִישָׁאֵֽל';

export const DEFAULT_VOICE = EZRA_VOICE;   // the owner's choice for רַאבַּ"ע: deep and a little gravelly
const DAILY_CHARS = 30000;

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
/** ?figure=: Algenib is רַאבַּ"ע's alone, so another figure's list leaves it out, and the default is that figure's voice */
export function listVoices(ctx: Ctx) {
  const figure = new URL(ctx.req.url).searchParams.get('figure') || '';
  const ezra = !figure || figure === 'ibn_ezra';
  return json({
    voices: VOICES.filter(([name]) => ezra || name !== EZRA_VOICE).map(([name, gender, trait]) => ({ name, gender, label: name, trait, hd: true })),
    default: figureOf(figure).voice, available: !!ctx.env.GEMINI_API_KEY,
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
async function pointed(env: Env, text: string, names: string[] = []): Promise<string> {
  if (!needsNiqqud(text)) return text;
  const p = protect(text, names);
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
async function synth(ctx: Ctx, voice: string, style: string, text: string, names: string[] = []): Promise<{ bytes: Uint8Array | ReadableStream; fresh: boolean }> {
  const env = ctx.env;
  if (!env.GEMINI_API_KEY) throw new HttpError(503, 'no voice service');
  // what is read, not what is shown: רַאבַּ"ע as one word (server/speech-text.ts). The cache is keyed by that text, so
  // the niqqud below is added only once for each line.
  text = forSpeech(text);
  const k = `tts/${await sha(`gemini|${model(env)}|${voice}|${style}|${text}`)}.wav`;
  const stored = env.MEDIA ? await env.MEDIA.get(k) : null;
  if (stored) return { bytes: stored.body, fresh: false };
  text = await pointed(env, text, names);
  if (env.DEV_MODE === '1') console.log('TTS text:', text);
  let r: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await fetch(`${base(env)}/v1beta/models/${model(env)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${style}\n${text}` }] }],
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
  const figure = new URL(ctx.req.url).searchParams.get('figure') || '';
  if (!NAMES.has(v) || voiceFor(figure, v, '', (x) => NAMES.has(x)) !== v) throw new HttpError(400, 'Invalid voice');   // (Algenib: רַאבַּ"ע's alone)
  const { bytes } = await synth(ctx, v, figureOf(figure).style, sampleLine(figure));
  return new Response(bytes, { headers: { ...AUDIO_HEADERS, 'cache-control': 'public, max-age=2592000' } });
}

/** Speak a line. Body: { text, voice?, figure? }: the figure speaking (prefs.figure; none = רַאבַּ"ע), and the voice the person
 *  chose for it. Without one, רַאבַּ"ע keeps the old saved choice and every other figure speaks in its own voice. */
export async function say(ctx: Ctx) {
  const u = requireUser(ctx);
  const env = ctx.env;
  const b = await body<{ text: string; voice?: string; figure?: string }>(ctx.req);
  const text = String(b.text || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!text) throw new HttpError(400, 'empty');
  const figure = String(b.figure || '');
  const stored = (await env.DB.prepare('SELECT voice FROM voice_prefs WHERE email = ?').bind(u.email).first<{ voice: string }>())?.voice || '';
  const voice = voiceFor(figure, String(b.voice || ''), stored, (v) => NAMES.has(v));
  const day = new Date().toISOString().slice(0, 10);
  const q = await env.DB.prepare('SELECT chars FROM tts_quota WHERE email = ? AND day = ?').bind(u.email, day).first<{ chars: number }>();
  if ((q?.chars || 0) + text.length > DAILY_CHARS) throw new HttpError(429, 'daily voice allowance used');
  // the person's own name as they want it said (settings: me.nameSpoken); the owner's until he sets it – for the voice
  // only, with a meteg under the alef (the owner's choice; on screen it is written מִישָׁאֵל)
  const spoken = spokenName((await prefsFor(env, u.email)).me?.data?.nameSpoken) || (u.role === 'owner' ? OWNER_SPOKEN : '');
  const { bytes, fresh } = await synth(ctx, voice, figureOf(figure).style, speakName(text, spoken), spoken ? [spoken] : []);
  if (fresh) {
    await env.DB.prepare('INSERT INTO tts_quota (email, day, chars) VALUES (?, ?, ?) ON CONFLICT(email, day) DO UPDATE SET chars = chars + excluded.chars')
      .bind(u.email, day, text.length).run();
  }
  return new Response(bytes, { headers: AUDIO_HEADERS });
}
