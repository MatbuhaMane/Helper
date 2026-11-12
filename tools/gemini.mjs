#!/usr/bin/env node
// Send bulk work to the owner's Gemini key, so Claude reads only a short result.
//   node tools/gemini.mjs [options] "the task" [file ...]
//   --out <file>      write the answer to a file (else stdout)
//   --system "<text>" a system instruction
//   --model <id>      default GEMINI_MODEL or gemini-3.8-flash
//   --think           let the model think (slower; default: low thinking, for mechanical work)
//   --search          ground the answer in Google Search (web research), sources listed at the end
//   --json            ask for JSON output
// The key comes from GEMINI_API_KEY or the nearest .dev.vars; it is never printed.
// Each call's token counts go to ~/.claude/gemini-usage.jsonl; a day stops at GEMINI_DAILY_TOKENS (default 3,000,000).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = { model: process.env.GEMINI_MODEL || 'gemini-3.8-flash', think: false, search: false, json: false, out: null, system: null };
const rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--out') opt.out = args[++i];
  else if (a === '--system') opt.system = args[++i];
  else if (a === '--model') opt.model = args[++i];
  else if (a === '--think') opt.think = true;
  else if (a === '--search') opt.search = true;
  else if (a === '--json') opt.json = true;
  else rest.push(a);
}
const [task, ...files] = rest;
if (!task) { console.error('usage: node tools/gemini.mjs [--out f] [--system s] [--model m] [--think] [--search] [--json] "task" [files...]'); process.exit(2); }

// Never send secrets or private data.
const BLOCK = /(^|[\\/])(\.dev\.vars|\.env[^\\/]*|\.wrangler|node_modules)([\\/]|$)|\.(sqlite|db|pem|key)$|secret|token|vault-restore-out/i;
let input = '';
for (const f of files) {
  if (BLOCK.test(f)) { console.error(`refused: ${f} may hold secrets or private data`); process.exit(3); }
  input += `\n\n===== ${f} =====\n` + fs.readFileSync(f, 'utf8');
}
if (input.length > 3_000_000) { console.error(`input too large (${input.length} chars); split it`); process.exit(4); }

function key() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const dirs = [process.cwd(), path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..'), 'M:/Claude Code/Helper'];
  for (const d of dirs) {
    try {
      const m = fs.readFileSync(path.join(d, '.dev.vars'), 'utf8').match(/^GEMINI_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
      if (m) return m[1].trim();
    } catch (_) {}
  }
  console.error('no GEMINI_API_KEY (env or .dev.vars)'); process.exit(5);
}

const LOG = path.join(os.homedir(), '.claude', 'gemini-usage.jsonl');
const today = new Date().toISOString().slice(0, 10);
const limit = Number(process.env.GEMINI_DAILY_TOKENS || 3_000_000);
try {
  const used = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.day === today).reduce((s, r) => s + (r.total || 0), 0);
  if (used >= limit) { console.error(`daily Gemini limit reached (${used} of ${limit} tokens)`); process.exit(6); }
} catch (_) {}

const body = {
  contents: [{ role: 'user', parts: [{ text: task + input }] }],
  generationConfig: {
    ...(opt.json ? { responseMimeType: 'application/json' } : {}),
    ...(opt.think ? {} : { thinkingConfig: /^gemini-3/.test(opt.model) ? { thinkingLevel: 'low' } : { thinkingBudget: 0 } }),
  },
  ...(opt.system ? { systemInstruction: { parts: [{ text: opt.system }] } } : {}),
  ...(opt.search ? { tools: [{ google_search: {} }] } : {}),
};
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${opt.model}:generateContent`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key() }, body: JSON.stringify(body),
});
if (!res.ok) { console.error(`Gemini ${opt.model} ${res.status}: ${(await res.text()).slice(0, 400)}`); process.exit(7); }
const d = await res.json();
const cand = d.candidates?.[0];
let text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
if (opt.search) {
  const src = (cand?.groundingMetadata?.groundingChunks || []).map((c) => c.web).filter(Boolean);
  if (src.length) text += '\n\nSources:\n' + src.map((w) => `- ${w.title || ''} ${w.uri}`).join('\n');
}
const u = d.usageMetadata || {};
fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.appendFileSync(LOG, JSON.stringify({ day: today, at: new Date().toISOString(), model: opt.model, in: u.promptTokenCount || 0, out: u.candidatesTokenCount || 0, total: u.totalTokenCount || 0, cwd: process.cwd() }) + '\n');
if (opt.out) { fs.writeFileSync(opt.out, text); console.error(`wrote ${opt.out} (${text.length} chars; tokens in ${u.promptTokenCount}, out ${u.candidatesTokenCount})`); }
else { process.stdout.write(text + '\n'); console.error(`(tokens in ${u.promptTokenCount}, out ${u.candidatesTokenCount})`); }
if (!text) process.exit(8);
