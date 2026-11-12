// What each unit of AI use costs (USD), by model and by date – applied when the usage report is read (meter.ts stores only
// quantities). Sources, read 2026-11-12: Anthropic's model table (claude-api reference) and Google's Gemini API pricing page
// (aistudio.google.com/docs/pricing), paid tier. Update this file when a price changes; the past is recomputed.
//   per 1M tokens: input, output, cacheWrite, cacheRead, audioOut, imageOut;  per request: search (Claude web search),
//   grounded (Google Search grounding – before the 5,000 free requests a month, so an upper bound)

export interface Price { input: number; output: number; cacheWrite?: number; cacheRead?: number; audioOut?: number; imageOut?: number; search?: number; grounded?: number }

const CLAUDE_SEARCH = 10 / 1000;          // web search: $10 per 1,000 searches
const GROUNDED = 14 / 1000;               // Gemini 3+: $14 per 1,000 grounded requests (after 5,000 free a month)
const claude = (input: number, output: number, cacheRead: number): Price => ({ input, output, cacheWrite: input * 1.25, cacheRead, search: CLAUDE_SEARCH });

// [model prefix, from (YYYY-MM-DD), price] – the longest matching prefix wins; for one prefix, the latest date not after the call
const TABLE: [string, string, Price][] = [
  ['claude-fable-5-2', '2000-01-01', claude(8, 40, 0.2)],
  ['claude-fable-5-1', '2000-01-01', claude(10, 50, 1)],
  ['claude-opus-5-5', '2000-01-01', claude(4, 20, 0.2)],
  ['claude-opus-5', '2000-01-01', claude(5, 25, 0.5)],
  ['claude-opus-4', '2000-01-01', claude(5, 25, 0.5)],
  ['claude-sonnet-5-5', '2000-01-01', claude(2, 10, 0.1)],
  ['claude-sonnet-5', '2000-01-01', claude(2, 10, 0.2)],
  ['claude-sonnet-4', '2000-01-01', claude(3, 15, 0.3)],
  ['claude-haiku-5-5', '2000-01-01', claude(0.1, 0.5, 0.01)],
  ['claude-haiku-4', '2000-01-01', claude(1, 5, 0.1)],
  ['gemini-3.8-flash-tts', '2000-01-01', { input: 0.5, output: 0, audioOut: 9 }],
  ['gemini-3.8-flash-tts', '2027-01-01', { input: 1, output: 0, audioOut: 18 }],
  ['gemini-2.5-flash-preview-tts', '2000-01-01', { input: 0.5, output: 0, audioOut: 10 }],
  ['gemini-3.1-flash-image', '2000-01-01', { input: 0.5, output: 3, imageOut: 60, grounded: GROUNDED }],
  ['gemini-3.8-flash', '2000-01-01', { input: 0.75, output: 3.75, cacheRead: 0.075, grounded: GROUNDED }],
  ['gemini-3.8-flash', '2027-01-01', { input: 1.5, output: 7.5, cacheRead: 0.15, grounded: GROUNDED }],
  ['gemini-3.6-flash', '2000-01-01', { input: 0.75, output: 3.75, cacheRead: 0.075, grounded: GROUNDED }],
  ['gemini-3-flash', '2000-01-01', { input: 0.5, output: 3, cacheRead: 0.05, grounded: GROUNDED }],
  ['gemini-3.5-flash-lite', '2000-01-01', { input: 0.3, output: 2.5, cacheRead: 0.03, grounded: GROUNDED }],
];

export function priceOf(model: string, at: number): Price | null {
  const day = new Date(at).toISOString().slice(0, 10);
  const fits = TABLE.filter(([p, from]) => model.startsWith(p) && from <= day);
  if (!fits.length) return null;
  const longest = Math.max(...fits.map(([p]) => p.length));
  return fits.filter(([p]) => p.length === longest).sort((a, b) => (a[1] < b[1] ? 1 : -1))[0][2];
}

export interface UsageRow { at: number; model: string; input: number; output: number; cache_write: number; cache_read: number; searches: number; grounded: number; audio_out: number; image_out: number }
/** The cost of one row in USD (null: no price known for this model). */
export function costOf(r: UsageRow): number | null {
  const p = priceOf(r.model, r.at);
  if (!p) return null;
  const M = 1e6;
  return (r.input * p.input + r.output * p.output + r.cache_write * (p.cacheWrite ?? p.input) + r.cache_read * (p.cacheRead ?? p.input)
    + r.audio_out * (p.audioOut ?? p.output) + r.image_out * (p.imageOut ?? p.output)) / M + r.searches * (p.search || 0) + r.grounded * (p.grounded || 0);
}
