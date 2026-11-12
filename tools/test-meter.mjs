// Tests for the AI meter (server/meter.ts) and the price table (server/prices.ts), with simulated Claude and Gemini
// answers – no real calls, no cost.   node tools/test-meter.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'meter-test-'));
writeFileSync(join(dir, 'entry.ts'), `export * from ${JSON.stringify(join(process.cwd(), 'server/meter.ts'))};\nexport * from ${JSON.stringify(join(process.cwd(), 'server/prices.ts'))};\n`);
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(dir, 'entry.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${join(dir, 'm.mjs')}`, '--log-level=error']);

// the network, simulated: what each address answers
const answers = new Map();
globalThis.fetch = async (input) => { const url = typeof input === 'string' ? input : input.url; const a = answers.get(url.split('?')[0]); if (!a) throw new Error('no answer for ' + url); return a(); };
const M = await import(pathToFileURL(join(dir, 'm.mjs')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const rows = [], pending = [];
const env = { DB: { prepare: () => ({ bind: (...a) => ({ run: async () => { rows.push(a); } }) }) } };
const scope = (feature) => ({ env, email: 'family@example.com', feature, waitUntil: (p) => pending.push(p) });
const settle = async () => { for (let i = 0; i < 5; i++) { await Promise.all(pending.splice(0)); await new Promise((r) => setTimeout(r, 5)); } };
const col = (r) => ({ email: r[1], feature: r[2], provider: r[3], model: r[4], input: r[5], output: r[6], cacheWrite: r[7], cacheRead: r[8], searches: r[9], grounded: r[10], audioOut: r[11], imageOut: r[12] });

// 1. a plain Claude answer
answers.set('https://api.anthropic.com/v1/messages', () => new Response(JSON.stringify({ model: 'claude-opus-5-5', usage: { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 2000, cache_read_input_tokens: 5000, server_tool_use: { web_search_requests: 2 } } }), { headers: { 'content-type': 'application/json' } }));
await M.metered(scope('research/ask'), () => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: JSON.stringify({ model: 'claude-opus-5-5' }) }).then((r) => r.json()));
await settle();
let r = col(rows.at(-1));
ok('claude json: all counts', r.provider === 'claude' && r.model === 'claude-opus-5-5' && r.input === 1200 && r.output === 300 && r.cacheWrite === 2000 && r.cacheRead === 5000 && r.searches === 2 && r.feature === 'research/ask' && r.email === 'family@example.com');

// 2. a streamed Claude answer: the caller still reads the whole stream, and the meter reads its copy
const sse = [
  'event: message_start', 'data: {"type":"message_start","message":{"model":"claude-sonnet-5-5","usage":{"input_tokens":800,"output_tokens":1,"cache_read_input_tokens":100}}}', '',
  'event: content_block_delta', 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"שלום"}}', '',
  'event: message_delta', 'data: {"type":"message_delta","usage":{"output_tokens":450,"server_tool_use":{"web_search_requests":1}}}', '',
  'event: message_stop', 'data: {"type":"message_stop"}', '',
].join('\n');
answers.set('https://api.anthropic.com/v1/messages', () => new Response(new Blob([sse]).stream(), { headers: { 'content-type': 'text/event-stream' } }));
const seen = await M.metered(scope('daemon/chat'), () => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{"model":"claude-sonnet-5-5","stream":true}' }).then((x) => x.text()));
await settle();
r = col(rows.at(-1));
ok('claude stream: the caller gets the whole stream', seen === sse);
ok('claude stream: counts from message_start and message_delta', r.model === 'claude-sonnet-5-5' && r.input === 800 && r.output === 450 && r.cacheRead === 100 && r.searches === 1 && r.feature === 'daemon/chat');

// 3. Gemini: grounded text, and speech
answers.set('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', () => new Response(JSON.stringify({ modelVersion: 'gemini-3.8-flash', usageMetadata: { promptTokenCount: 1000, cachedContentTokenCount: 200, candidatesTokenCount: 300, thoughtsTokenCount: 150, toolUsePromptTokenCount: 50 }, candidates: [{ groundingMetadata: { webSearchQueries: ['x'] } }] })));
await M.metered(scope('fun/picks'), () => fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=k').then((x) => x.json()));
await settle();
r = col(rows.at(-1));
ok('gemini: input without the cached part, thinking as output, grounded', r.provider === 'gemini' && r.input === 850 && r.cacheRead === 200 && r.output === 450 && r.grounded === 1);
answers.set('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent', () => new Response(JSON.stringify({ usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 900, candidatesTokensDetails: [{ modality: 'AUDIO', tokenCount: 900 }] } })));
await M.metered(scope('voice/speak'), () => fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent').then((x) => x.json()));
await settle();
r = col(rows.at(-1));
ok('gemini tts: audio counted apart from text', r.model === 'gemini-2.5-flash-preview-tts' && r.audioOut === 900 && r.output === 0 && r.input === 40);

// 4. outside a request (no scope) nothing is recorded; failed answers are not recorded
const before = rows.length;
await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent').then((x) => x.json());
answers.set('https://api.anthropic.com/v1/messages', () => new Response('{"type":"error"}', { status: 529 }));
await M.metered(scope('x'), () => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' }));
await settle();
ok('no scope, or an error: no row', rows.length === before);

// 5. prices
const c = (model, at, q) => M.costOf({ at, model, input: 0, output: 0, cache_write: 0, cache_read: 0, searches: 0, grounded: 0, audio_out: 0, image_out: 0, ...q });
const near = (a, b) => Math.abs(a - b) < 1e-9;
ok('opus 5.5: $4 in, $20 out per 1M', near(c('claude-opus-5-5', Date.now(), { input: 1e6, output: 1e6 }), 24));
ok('opus 5.5: cache write 1.25x, read $0.20', near(c('claude-opus-5-5', Date.now(), { cache_write: 1e6, cache_read: 1e6 }), 5.2));
ok('web search $10 per 1,000', near(c('claude-opus-5-5', Date.now(), { searches: 1000 }), 10));
ok('gemini 3.8 flash in 2026', near(c('gemini-3.8-flash', Date.parse('2026-11-12'), { input: 1e6, output: 1e6 }), 4.5));
ok('gemini 3.8 flash doubles in 2027', near(c('gemini-3.8-flash', Date.parse('2027-02-01'), { input: 1e6, output: 1e6 }), 9));
ok('the tts row does not match the text model', near(c('gemini-3.8-flash-tts', Date.parse('2026-11-12'), { audio_out: 1e6 }), 9));
ok('an unknown model has no price', c('some-new-model', Date.now(), { input: 5 }) === null);
ok('featureOf hides ids', M.featureOf('/api/vault/items/0h051f56681l4c20/file') === 'vault/items/:id/file' && M.featureOf('/api/research/ask') === 'research/ask');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
