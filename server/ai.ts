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
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(`${(env.DEV_MODE === '1' && env.GEMINI_BASE_URL) || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: task.system }] },
      contents: [{ role: 'user', parts: [{ text: task.prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(task.schema, { target: 'draft-7' }),
        ...(task.fast ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }),
  });
  if (!res.ok) throw new HttpError(502, `gemini_error_${res.status}`);
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  const parsed = task.schema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new HttpError(502, 'ai_bad_output');
  return parsed.data;
}

export function aiStatus(env: Env) {
  return { claude: !!env.ANTHROPIC_API_KEY, gemini: !!env.GEMINI_API_KEY };
}
