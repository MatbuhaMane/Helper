// The smart calculator: a math & physics helper for a second-year BSc student. Give it a problem – typed, in LaTeX, or as a
// photo/screenshot – and a mode (solve, prove-or-disprove, explain, check my solution); it answers in Hebrew, step by step,
// with the math in LaTeX. Claude first (the strongest reasoning), Gemini when Claude is unavailable; both read images.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { jsonIn } from './ai';
import { Ctx, HttpError, body, json, requireUser } from './core';

const Input = z.object({
  text: z.string().max(8000).default(''),
  image: z.string().max(7_000_000).optional().nullable(),          // data:image/...;base64,…
  mode: z.enum(['solve', 'prove', 'explain', 'check', 'intuition']).default('solve'),
  subject: z.string().max(40).default('auto'),
  history: z.array(z.object({ q: z.string().max(4000), a: z.string().max(8000) })).max(6).default([]),
});

const Answer = z.object({
  title: z.string().default(''),
  problem: z.string().default(''),
  verdict: z.enum(['true', 'false', 'unclear']).nullable().optional(),
  steps: z.array(z.object({ title: z.string().default(''), body: z.string().default('') })).default([]),
  answer: z.string().default(''),
  check: z.string().default(''),
  formulas: z.array(z.string()).default([]),
});

const MODES: Record<string, string> = {
  solve: 'Solve the problem completely. Show every non-trivial step, justify each transformation, and give the final answer clearly (in the "answer" field).',
  prove: 'Decide whether the statement is TRUE or FALSE. If true, give a complete, rigorous proof (state what is assumed, which theorems are used and why their conditions hold). If false, give an explicit counterexample and verify it. If it depends on missing assumptions, say exactly which. Set "verdict" accordingly.',
  explain: 'Explain the problem and the ideas needed to solve it, as a patient teaching assistant: the intuition, the relevant definitions and theorems, and a worked solution.',
  intuition: `Give an INTUITIVE explanation of the solution that was just proposed (it is in the conversation) – not a second formal solution.
Help the student understand it the way a great teacher would, so they can solve the next problem of this kind on their own. Use these steps, each a short section:
1. "הרעיון במשפט אחד" – the core idea in one or two sentences, without symbols if possible.
2. "התמונה" – a geometric, physical or visual picture of what is going on (what the objects "look like", what moves, what is conserved, what the operator does to space…). Describe it in words a student can draw.
3. "למה זה עובד" – why the key step or theorem gives the result; what would break without each assumption.
4. "איך מזהים שזה הכלי" – the signs in a problem that this method is the right one, and similar problems where it is used.
5. "מלכודות נפוצות" – mistakes students typically make here, and how to avoid them.
6. "בדיקת שפיות" – a quick way to check the answer makes sense (a special case, units, limits, symmetry, a small example).
Keep the math light: a formula only where it helps the intuition. Put a one-line takeaway in "answer". "verdict" is null.`,
  check: 'The student gives their own solution. Check it line by line: say what is correct, point to the first mistake (if any) and why it is wrong, and show the correct continuation. Put the corrected final answer in "answer".',
};

function system(mode: string, subject: string) {
  return `You are a precise mathematics and physics tutor for a second-year BSc student in Mathematics & Physics (Ben-Gurion University).
Courses at this level: linear algebra 2, calculus 3 (multivariable, vector calculus), ODE/PDE, complex functions, real analysis, probability, classical mechanics (Lagrangian/Hamiltonian), electromagnetism, waves, intro quantum mechanics, special relativity.
${MODES[mode]}
${subject && subject !== 'auto' ? `The topic is: ${subject}.` : ''}
Write in Hebrew (keep standard symbols, variable names and theorem names; you may add the English name in parentheses).
All mathematics in LaTeX: inline as $...$, displayed as $$...$$. Never use \\( \\) or \\[ \\]. Be rigorous; never skip a step that a grader would mark down; do not invent results.
If the input is an image, first transcribe the problem exactly into "problem".
Answer with JSON only, exactly this shape:
{"title": "a short name of the problem", "problem": "the problem restated in LaTeX", "verdict": "true" | "false" | "unclear" | null,
 "steps": [{"title": "short step name", "body": "the step, Hebrew text with LaTeX"}],
 "answer": "the final answer / conclusion (LaTeX)", "check": "a quick sanity check or verification of the result",
 "formulas": ["key formulas or theorems used, each in LaTeX"]}`;
}

function parseImage(img?: string | null) {
  if (!img) return null;
  const m = /^data:(image\/(png|jpe?g|webp|gif));base64,(.+)$/i.exec(img);
  if (!m) throw new HttpError(400, 'Unsupported image');
  return { mime: m[1].toLowerCase().replace('jpg', 'jpeg'), data: m[3] };
}

async function viaClaude(ctx: Ctx, sys: string, user: string, img: { mime: string; data: string } | null, history: { q: string; a: string }[]) {
  const client = new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY, maxRetries: 1 });
  const msgs: any[] = [];
  for (const h of history) { msgs.push({ role: 'user', content: h.q }, { role: 'assistant', content: h.a }); }
  msgs.push({ role: 'user', content: [...(img ? [{ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data } }] : []), { type: 'text', text: user }] });
  const r = await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 12000, system: sys, messages: msgs } as any);
  const text = (r.content as any[]).map((b) => (b.type === 'text' ? b.text : '')).join('');
  return jsonIn(text);
}

async function viaGemini(ctx: Ctx, sys: string, user: string, img: { mime: string; data: string } | null, history: { q: string; a: string }[]) {
  const model = ctx.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const base = (ctx.env.DEV_MODE === '1' && ctx.env.GEMINI_BASE_URL) || 'https://generativelanguage.googleapis.com';
  const contents: any[] = [];
  for (const h of history) { contents.push({ role: 'user', parts: [{ text: h.q }] }, { role: 'model', parts: [{ text: h.a }] }); }
  contents.push({ role: 'user', parts: [...(img ? [{ inline_data: { mime_type: img.mime, data: img.data } }] : []), { text: user }] });
  const res = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': ctx.env.GEMINI_API_KEY! },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents,
      generationConfig: { responseMimeType: 'application/json', ...(/^gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: 'high' } } : {}) } }),
  });
  if (!res.ok) { console.error('Gemini (calc)', res.status, (await res.text().catch(() => '')).slice(0, 300)); throw new HttpError(502, `gemini_error_${res.status}`); }
  const d = (await res.json()) as any;
  return jsonIn(d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '');
}

/** POST /api/calc/solve */
export async function solve(ctx: Ctx) {
  requireUser(ctx);
  const p = Input.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid request');
  const { text, mode, subject, history } = p.data;
  const img = parseImage(p.data.image);
  if (!text.trim() && !img) throw new HttpError(400, 'Empty problem');
  const sys = system(mode, subject);
  const user = text.trim() || 'The problem is in the image.';
  let lastErr: unknown;
  for (const via of [ctx.env.ANTHROPIC_API_KEY ? viaClaude : null, ctx.env.GEMINI_API_KEY ? viaGemini : null]) {
    if (!via) continue;
    try {
      const raw = await via(ctx, sys, user, img, history);
      const a = Answer.safeParse(raw);
      if (a.success) return json({ ...a.data, by: via === viaClaude ? 'claude' : 'gemini' });
      lastErr = new Error('bad shape');
    } catch (e) { lastErr = e; console.error('calc solve', via === viaClaude ? 'claude' : 'gemini', e instanceof Error ? e.message : e); }
  }
  if (!ctx.env.ANTHROPIC_API_KEY && !ctx.env.GEMINI_API_KEY) throw new HttpError(503, 'ai_not_configured');
  throw lastErr instanceof HttpError ? lastErr : new HttpError(502, 'ai_failed');
}

/* ---------------- currency rates, for the calculator without AI ---------------- */
// The European Central Bank's daily reference rates through Frankfurter (open, no key, nothing about the person is
// sent). Kept for six hours in the Worker's memory and Cloudflare's cache; the page turns them into mathjs units.
let rates: { at: number; data: { base: string; date: string; rates: Record<string, number> } } | null = null;
const RATES_TTL = 6 * 3600_000;

/** GET /api/calc/rates → { base: 'ILS', date, rates: { USD: 0.31, … } } (how much of each currency one shekel buys) */
export async function currencyRates(ctx: Ctx) {
  requireUser(ctx);
  if (!rates || Date.now() - rates.at > RATES_TTL) {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=ILS', { cf: { cacheTtl: 21600, cacheEverything: true } } as RequestInit);
    if (!res.ok) { if (rates) return json(rates.data); throw new HttpError(502, 'rates_unavailable'); }
    const d = (await res.json()) as { base: string; date: string; rates: Record<string, number> };
    rates = { at: Date.now(), data: { base: d.base, date: d.date, rates: d.rates } };
  }
  return json(rates.data);
}
