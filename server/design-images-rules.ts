// Design's image tool (docs/decisions.md, "What design needs to make images through Gemini"): the pure rules, tested
// alone (node server/test-design-images.mjs) – what may be asked (a prompt, our own pictures as references, an aspect
// ratio, one to four images), how many are left today, and the picture in Gemini's answer.

export const ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
const REF = /^\/(assets|figures)\/[A-Za-z0-9_\-/.]+\.(png|jpe?g|webp)$/i;

export interface Ask { prompt: string; refs: string[]; aspect: string; n: number }
/** the request as design sent it, checked; throws a code when something does not fit */
export function cleanAsk(b: Record<string, unknown>): Ask {
  const prompt = String(b.prompt ?? '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim();
  if (!prompt) throw new Error('prompt_required');
  if (prompt.length > 4000) throw new Error('prompt_too_long');
  const refs = Array.isArray(b.refs) ? b.refs : b.refs == null ? [] : null;
  if (!refs || refs.length > 6) throw new Error('bad_refs');
  // only our own public pictures: a path of the site, never an address outside it, never a way up the tree
  for (const r of refs) if (typeof r !== 'string' || !REF.test(r) || r.includes('..') || r.includes('//')) throw new Error('bad_ref');
  const aspect = String(b.aspect ?? '1:1');
  if (!(ASPECTS as readonly string[]).includes(aspect)) throw new Error('bad_aspect');
  const n = Number(b.n ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error('bad_n');
  return { prompt, refs: [...new Set(refs as string[])], aspect, n };
}

/** how many may still be made today, under the daily cap; throws when even one would pass it */
export function allowedNow(cap: number, madeToday: number, n: number) {
  const left = Math.max(0, cap - madeToday);
  if (left < n) throw new Error(left ? 'cap_partly' : 'cap_reached');
  return left - n;
}

/** a batch's name: the day, and a random part ("2026-11-12-k3x9q2") */
export const batchName = (day: string, rand: string) => `${day}-${rand.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)}`;
export const isBatch = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}-[a-z0-9]{4,8}$/.test(s);

/** the picture in Gemini's answer (its first image part), or why there is none */
export function imageOf(data: unknown): { b64: string; mime: string } | { why: string } {
  const d = data as { candidates?: { content?: { parts?: Record<string, unknown>[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  const part = d?.candidates?.[0]?.content?.parts?.find((p) => (p.inlineData as { data?: string })?.data || (p.inline_data as { data?: string })?.data);
  const inline = (part?.inlineData || part?.inline_data) as { data: string; mimeType?: string; mime_type?: string } | undefined;
  if (!inline) return { why: d?.candidates?.[0]?.finishReason || d?.promptFeedback?.blockReason || 'no image returned' };
  const mime = inline.mimeType || inline.mime_type || 'image/png';
  return { b64: inline.data, mime: /^image\/(png|jpeg|webp)$/.test(mime) ? mime : 'image/png' };
}
export const extOf = (mime: string) => (mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png');

/** the usage of one answer, read as the meter reads Gemini's (server/meter.ts geminiUsage), so its cost can be kept with
    the picture: a batch's cost is then the sum of its own pictures, never a window of time that overlaps another batch */
export function usageOf(model: string, at: number, data: unknown) {
  const d = data as { modelVersion?: string; usageMetadata?: Record<string, unknown> };
  const m = (d?.usageMetadata || {}) as Record<string, number> & { candidatesTokensDetails?: { modality: string; tokenCount?: number }[] };
  const by = (mod: string) => (m.candidatesTokensDetails || []).filter((x) => x.modality === mod).reduce((s, x) => s + (x.tokenCount || 0), 0);
  const audio = by('AUDIO'), image = by('IMAGE'), out = (m.candidatesTokenCount || 0) + (m.thoughtsTokenCount || 0);
  return {
    at, model: d?.modelVersion || model,
    input: (m.promptTokenCount || 0) - (m.cachedContentTokenCount || 0) + (m.toolUsePromptTokenCount || 0),
    output: out - audio - image, cache_write: 0, cache_read: m.cachedContentTokenCount || 0, searches: 0, grounded: 0, audio_out: audio, image_out: image,
  };
}

/** for batches made before each picture kept its cost: every metered call goes to one batch only – the latest one that
    had started by then (batches run one at a time). `starts` are the batches' start times. */
export function batchOf(at: number, starts: { batch: string; start: number }[]): string | null {
  let best: { batch: string; start: number } | null = null;
  for (const s of starts) if (s.start <= at && (!best || s.start > best.start)) best = s;
  return best?.batch ?? null;
}
