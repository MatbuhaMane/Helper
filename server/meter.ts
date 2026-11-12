// The AI meter: every call to Claude or Gemini leaves one row in ai_usage – who asked, from which feature, which model, and
// how much it used (tokens in and out, cache writes and reads, web searches, grounded searches, audio and image output).
// Only quantities are stored; their price is worked out when the report is read (server/prices.ts), so a price that turns
// out wrong, or changes, is fixed for the past too.
//
// How: each API request runs inside a small context (who, which feature); a wrapper round fetch recognises the answers of
// api.anthropic.com and generativelanguage.googleapis.com and reads their usage – streamed answers are read from a copy of
// the stream, so nothing waits on the meter. New features are metered without touching them.

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Env } from './core';
import { gate } from './credits';
import { providerOf, requestWithKey, withKey } from './credits-rules';

interface Scope { env: Env; email: string | null; feature: string; waitUntil: (p: Promise<unknown>) => void }
const store = new AsyncLocalStorage<Scope>();

/** Run fn as `feature` for `email` (each API request, and the nightly job). */
export function metered<T>(scope: Scope, fn: () => T): T {
  install();
  return store.run(scope, fn);
}

/** "/api/vault/items/0h051f56681l4c20/file" → "vault/items/:id/file" */
export function featureOf(path: string) {
  return path.replace(/^\/api\//, '').split('/').map((s) => (/\d/.test(s) && s.length > 7 ? ':id' : s)).join('/').slice(0, 80);
}

interface Usage { provider: 'claude' | 'gemini'; model: string; input: number; output: number; cacheWrite: number; cacheRead: number; searches: number; grounded: number; audioOut: number; imageOut: number }

function record(u: Usage, own = false) {
  const s = store.getStore();
  if (!s || !(u.input || u.output || u.cacheRead || u.cacheWrite)) return;
  s.waitUntil(s.env.DB.prepare(`INSERT INTO ai_usage (at, email, feature, provider, model, input, output, cache_write, cache_read, searches, grounded, audio_out, image_out, own_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(Date.now(), s.email, s.feature, u.provider, u.model.slice(0, 80), u.input, u.output, u.cacheWrite, u.cacheRead, u.searches, u.grounded, u.audioOut, u.imageOut, own ? 1 : null).run()
    .catch((e: unknown) => console.error('meter', e instanceof Error ? e.message : e)));
}

/* ---------- Claude: usage in the JSON answer, or across the stream's message_start / message_delta events ---------- */
function claudeUsage(model: string, us: any): Usage {
  return {
    provider: 'claude', model,
    input: us?.input_tokens || 0, output: us?.output_tokens || 0,
    cacheWrite: us?.cache_creation_input_tokens || 0, cacheRead: us?.cache_read_input_tokens || 0,
    searches: us?.server_tool_use?.web_search_requests || 0, grounded: 0, audioOut: 0, imageOut: 0,
  };
}
async function readClaudeStream(body: ReadableStream<Uint8Array>, fallbackModel: string, own: boolean) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '', model = fallbackModel;
  const us: Record<string, any> = {};
  const take = (u: any) => {
    if (!u) return;
    for (const k of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) if (typeof u[k] === 'number') us[k] = Math.max(us[k] || 0, u[k]);
    if (u.server_tool_use) us.server_tool_use = { web_search_requests: Math.max(us.server_tool_use?.web_search_requests || 0, u.server_tool_use.web_search_requests || 0) };
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try {
        const ev = JSON.parse(line.slice(5));
        if (ev.type === 'message_start') { model = ev.message?.model || model; take(ev.message?.usage); }
        else if (ev.type === 'message_delta') take(ev.usage);
      } catch (_) { /* a partial line or a ping */ }
    }
  }
  record(claudeUsage(model, us), own);
}

/* ---------- Gemini: usageMetadata in the answer (and grounding metadata when Google Search was used) ---------- */
function geminiUsage(model: string, d: any): Usage {
  const m = d?.usageMetadata || {};
  const byMod = (arr: any[] | undefined, mod: string) => (arr || []).filter((x) => x.modality === mod).reduce((a, x) => a + (x.tokenCount || 0), 0);
  const audioOut = byMod(m.candidatesTokensDetails, 'AUDIO'), imageOut = byMod(m.candidatesTokensDetails, 'IMAGE');
  const out = (m.candidatesTokenCount || 0) + (m.thoughtsTokenCount || 0);   // thinking is billed as output
  return {
    provider: 'gemini', model: d?.modelVersion || model,
    input: (m.promptTokenCount || 0) - (m.cachedContentTokenCount || 0) + (m.toolUsePromptTokenCount || 0), output: out - audioOut - imageOut,
    cacheWrite: 0, cacheRead: m.cachedContentTokenCount || 0, searches: 0,
    grounded: (d?.candidates || []).some((c: any) => c.groundingMetadata?.webSearchQueries?.length || c.groundingMetadata?.groundingChunks?.length) ? 1 : 0,
    audioOut, imageOut,
  };
}

let installed = false;
function install() {
  if (installed) return;
  installed = true;
  const original = globalThis.fetch;
  globalThis.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    // the allowance (server/credits.ts): a limited account with nothing left is refused (402 ai_credit_needed), and
    // whoever connected their own key has their requests sent with it
    let own = false;
    const scope = store.getStore();
    if (scope) {
      // every way of calling fetch is gated: a string, a URL, or a Request (with its init folded in first)
      if (input instanceof Request && init) { input = new Request(input, init); init = undefined; }
      const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const provider = providerOf(target);
      if (provider) {
        const g = await gate(scope.env, scope.email, provider);
        if (g.key) {
          if (input instanceof Request) input = requestWithKey(provider, input, g.key);
          else [input, init] = withKey(provider, target, init, g.key);
          own = true;
        }
      }
    }
    const res = await original(input as any, init);
    try {
      if (!store.getStore() || !res.ok) return res;
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (url.startsWith('https://api.anthropic.com/v1/messages') && !url.includes('count_tokens')) {
        let model = '';
        try { model = JSON.parse(typeof init?.body === 'string' ? init.body : '{}').model || ''; } catch (_) { /* not JSON */ }
        if ((res.headers.get('content-type') || '').includes('text/event-stream') && res.body) {
          const [mine, theirs] = res.body.tee();
          store.getStore()!.waitUntil(readClaudeStream(mine, model, own).catch(() => {}));
          return new Response(theirs, { status: res.status, statusText: res.statusText, headers: res.headers });
        }
        res.clone().json().then((d: any) => record(claudeUsage(d?.model || model, d?.usage), own)).catch(() => {});
      } else if (url.startsWith('https://generativelanguage.googleapis.com/') && /:generateContent/.test(url)) {
        const model = /models\/([^:]+):/.exec(url)?.[1] || '';
        res.clone().json().then((d: any) => record(geminiUsage(model, d), own)).catch(() => {});
      }
    } catch (e) { console.error('meter', e instanceof Error ? e.message : e); }
    return res;
  } as typeof fetch;
}
