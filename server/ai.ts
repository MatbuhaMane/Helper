// AI layer: Claude (Anthropic) for judgment-heavy tasks such as planning mailbox changes,
// Gemini for cheap high-volume tasks (recipe extraction, article summaries).
// Each falls back to the other provider when its key is missing or the call fails.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { Env, HttpError } from './core';

export type Provider = 'claude' | 'gemini';

interface JsonTask<T extends z.ZodType> {
  system: string;
  prompt: string;
  schema: T;
  prefer: Provider;
  effort?: 'low' | 'medium' | 'high';
  /** Mechanical work (translation, extraction): skip Gemini's thinking step, which makes it several times faster. */
  fast?: boolean;
}

export async function aiJson<T extends z.ZodType>(env: Env, task: JsonTask<T>): Promise<z.infer<T>> {
  const order: Provider[] = task.prefer === 'claude' ? ['claude', 'gemini'] : ['gemini', 'claude'];
  const available = order.filter((p) => (p === 'claude' ? env.ANTHROPIC_API_KEY : env.GEMINI_API_KEY));
  if (!available.length) throw new HttpError(503, 'ai_not_configured');
  let lastErr: unknown;
  for (const p of available) {
    try {
      return p === 'claude' ? await claudeJson(env, task) : await geminiJson(env, task);
    } catch (err) {
      lastErr = err;
      console.error(`AI provider ${p} failed:`, err instanceof Error ? err.message : err);
    }
  }
  throw lastErr instanceof HttpError ? lastErr : new HttpError(502, 'ai_failed');
}

async function claudeJson<T extends z.ZodType>(env: Env, task: JsonTask<T>): Promise<z.infer<T>> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, ...(env.DEV_MODE === '1' && env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
  try {
    const res = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: task.system,
      messages: [{ role: 'user', content: task.prompt }],
      output_config: { effort: task.effort || 'medium', format: betaZodOutputFormat(task.schema) },
    });
    if (res.stop_reason === 'refusal') throw new HttpError(422, 'ai_refused');
    if (res.parsed_output == null) throw new HttpError(502, 'ai_bad_output');
    return res.parsed_output as z.infer<T>;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'claude_key_invalid');
    if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, 'ai_busy');
    if (err instanceof Anthropic.APIError) {
        console.error('Claude API error', err.status, err.message);
        throw new HttpError(502, `claude_error_${err.status}: ${String(err.message).slice(0, 300)}`);
      }
    throw err;
  }
}

async function geminiJson<T extends z.ZodType>(env: Env, task: JsonTask<T>): Promise<z.infer<T>> {
  const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
  const res = await fetch(`${(env.DEV_MODE === '1' && env.GEMINI_BASE_URL) || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: task.system }] },
      contents: [{ role: 'user', parts: [{ text: task.prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(task.schema, { target: 'draft-7' }),
        // Gemini 3 sets thinking by level, older models by a token budget.
        ...(task.fast ? { thinkingConfig: /^gemini-3/.test(model) ? { thinkingLevel: 'low' } : { thinkingBudget: 0 } } : {}),
      },
    }),
  });
  if (!res.ok) {
    // Google's own message says why (a retired model, a key without access…); it never contains the key.
    console.error(`Gemini ${model} ${res.status}:`, (await res.text().catch(() => '')).slice(0, 400));
    throw new HttpError(502, `gemini_error_${res.status}`);
  }
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  const parsed = task.schema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new HttpError(502, 'ai_bad_output');
  return parsed.data;
}

/**
 * Gemini with Google Search grounding: an answer written from fresh search results, and the pages it used.
 * The answer is asked for as JSON in plain text (grounding cannot be combined with JSON mode); `sources` are the
 * real page addresses (Google hands out redirect links, which are resolved here).
 */
export async function geminiGrounded(env: Env, task: { system: string; prompt: string }): Promise<{ text: string; sources: { url: string; title: string }[] }> {
  if (!env.GEMINI_API_KEY) throw new HttpError(503, 'ai_not_configured');
  const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
  const res = await fetch(`${(env.DEV_MODE === '1' && env.GEMINI_BASE_URL) || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: task.system }] },
      contents: [{ role: 'user', parts: [{ text: task.prompt }] }],
      tools: [{ google_search: {} }],
    }),
  });
  if (res.status === 429) throw new HttpError(429, 'ai_busy');
  if (!res.ok) {
    console.error(`Gemini (search) ${model} ${res.status}:`, (await res.text().catch(() => '')).slice(0, 400));
    throw new HttpError(502, `gemini_error_${res.status}`);
  }
  const data = (await res.json()) as any;
  const cand = data?.candidates?.[0];
  const text = cand?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  const chunks: any[] = cand?.groundingMetadata?.groundingChunks || [];
  const sources = await Promise.all(chunks.slice(0, 20).map(async (c) => ({ url: await resolveRedirect(c?.web?.uri), title: String(c?.web?.title || '') })));
  const seen = new Set<string>();
  return { text, sources: sources.filter((s) => s.url && !seen.has(s.url) && seen.add(s.url)) };
}

/** Google's grounding links point at a redirect; this finds the real page (from the redirect header, or the page it sends you on to). */
export async function resolveRedirect(uri?: string): Promise<string> {
  if (!uri) return '';
  if (!/grounding-api-redirect|vertexaisearch/.test(uri)) return uri;
  try {
    const r = await fetch(uri, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; FamilyHelperReader/1.0)' } });
    const loc = r.headers.get('location');
    if (loc) return new URL(loc, uri).href;
    if (r.status >= 200 && r.status < 300) {
      const html = (await r.text()).slice(0, 20000);
      const m = /(?:url=|location(?:\.href)?\s*=\s*|location\.replace\()\s*["']?(https?:\/\/[^"'\s)>]+)/i.exec(html) || /<a[^>]+href=["'](https?:\/\/[^"']+)["']/i.exec(html);
      if (m && !/vertexaisearch|google\.com/.test(m[1])) return m[1].replace(/&amp;/g, '&');
    }
    // As a last resort, follow it the normal way.
    const f = await fetch(uri, { redirect: 'follow', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; FamilyHelperReader/1.0)' } });
    return f.url && !/vertexaisearch/.test(f.url) ? f.url : '';
  } catch { return ''; }
}

/** The JSON object inside a model's plain-text answer. */
export function jsonIn(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new HttpError(502, 'ai_bad_output');
  try { return JSON.parse(text.slice(start, end + 1)); } catch { throw new HttpError(502, 'ai_bad_output'); }
}

export function aiStatus(env: Env) {
  return { claude: !!env.ANTHROPIC_API_KEY, gemini: !!env.GEMINI_API_KEY };
}
