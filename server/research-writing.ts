// עוזר מחקר, step 2 (docs/vision/research.md): persistence and writing.
// Persistence: a research becomes a goal of the goals engine (its processes from the "מחקר" template), so its steps come
// to "היום", the weekly review, "נתקעתי" and the badges; "גשש" is earned when a research is done; a research journal of a
// few lines a day. Writing: drafts built from the notes (an outline without AI, or ✨), citations as [@source] marks that
// export in the research's style with the bibliography of what is cited – Markdown, HTML (to print or save as PDF),
// Word, LaTeX with BibTeX, and a Google Doc (drive.file, as the notes). ✨ (the person's own AI or credit): directions
// and next steps from the notes and threads, and a draft from the notes.

import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, HttpError, body, json, requireUser, uid } from './core';
import { insertGoal } from './goals';
import { dayOf, templateById } from './goals-logic';
import { saveToDrive } from './notes';
import * as C from './research-cite';

async function read<T extends z.ZodTypeAny>(ctx: Ctx, schema: T): Promise<z.infer<T>> {
  const p = schema.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid request');
  return p.data;
}
async function ownResearch(ctx: Ctx, email: string, id: string) {
  const r = await ctx.env.DB.prepare("SELECT * FROM researches WHERE email = ? AND id = ? AND status != 'deleted'").bind(email, id).first<any>();
  if (!r) throw new HttpError(404, 'Not found');
  return r;
}

/* ---------------- a research as a goal, and done ---------------- */

/** POST /api/research/r/:id/goal → the goal made for it (or the one it already has) */
export async function asGoal(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  if (r.goal_id) {
    const g = await ctx.env.DB.prepare("SELECT id FROM goals WHERE email = ? AND id = ? AND status != 'deleted'").bind(u.email, r.goal_id).first();
    if (g) return json({ ok: true, id: r.goal_id, existed: true });
  }
  const t = templateById('research')!;
  const id = await insertGoal(ctx, u.email, {
    title: `מחקר: ${r.title}`.slice(0, 200), why: (r.aim || '').slice(0, 1000), kind: r.purpose === 'book' || r.purpose === 'family' ? 'long' : 'regular',
    due: null, days: null, time: null, template: 'research', processes: t.processes.map((p) => ({ title: p.title, steps: [...p.steps] })),
  });
  await ctx.env.DB.prepare('UPDATE researches SET goal_id = ?, updated_at = ? WHERE email = ? AND id = ?').bind(id, Date.now(), u.email, r.id).run();
  return json({ ok: true, id });
}
/** POST /api/research/r/:id/done {done} – finished (its goal too, when it has one), or back to work */
export async function setDone(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const { done } = await read(ctx, z.object({ done: z.boolean() }));
  const now = Date.now(), db = ctx.env.DB;
  const stmts = [db.prepare('UPDATE researches SET done_at = ?, updated_at = ? WHERE email = ? AND id = ?').bind(done ? now : null, now, u.email, r.id)];
  if (r.goal_id) stmts.push(db.prepare("UPDATE goals SET status = ?, done_at = ?, updated_at = ? WHERE email = ? AND id = ? AND status != 'deleted'").bind(done ? 'done' : 'active', done ? now : null, now, u.email, r.goal_id));
  await db.batch(stmts);
  return json({ ok: true });
}

/* ---------------- the research journal: a few lines a day ---------------- */

/** GET /api/research/r/:id/journal → the last 60 days' lines */
export async function journal(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const { results } = await ctx.env.DB.prepare('SELECT day, text, updated_at FROM research_journal WHERE email = ? AND research_id = ? ORDER BY day DESC LIMIT 60').bind(u.email, r.id).all<any>();
  return json({ today: dayOf(Date.now()), entries: results.map((e) => ({ day: e.day, text: e.text, updatedAt: e.updated_at })) });
}
/** PUT /api/research/r/:id/journal {text, day?} – today's lines (or an earlier day's) */
export async function writeJournal(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const d = await read(ctx, z.object({ text: z.string().max(4000), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }));
  const day = d.day || dayOf(Date.now());
  if (!d.text.trim()) await ctx.env.DB.prepare('DELETE FROM research_journal WHERE email = ? AND research_id = ? AND day = ?').bind(u.email, r.id, day).run();
  else await ctx.env.DB.prepare('INSERT INTO research_journal (email, research_id, day, text, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email, research_id, day) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at')
    .bind(u.email, r.id, day, d.text.trim(), Date.now()).run();
  return json({ ok: true, day });
}

/* ---------------- drafts ---------------- */

async function material(ctx: Ctx, email: string, researchId: string) {
  const db = ctx.env.DB;
  const [notes, threads, sources] = await Promise.all([
    db.prepare('SELECT x.id, x.title, x.body FROM research_notes n JOIN notes x ON x.email = n.email AND x.id = n.note_id WHERE n.email = ? AND n.research_id = ? AND x.deleted = 0 ORDER BY n.sort, n.added_at').bind(email, researchId).all<{ id: string; title: string; body: string }>(),
    db.prepare("SELECT text FROM research_threads WHERE email = ? AND research_id = ? AND status != 'answered' ORDER BY created_at").bind(email, researchId).all<{ text: string }>(),
    db.prepare('SELECT id, csl FROM research_sources WHERE email = ? AND research_id = ? ORDER BY created_at').bind(email, researchId).all<{ id: string; csl: string }>(),
  ]);
  return { notes: notes.results, questions: threads.results.map((t) => t.text), sources: sources.results.map((s) => ({ id: s.id, csl: JSON.parse(s.csl || '{}') as C.Csl })) };
}
async function ownDraft(ctx: Ctx, email: string, id: string) {
  const d = await ctx.env.DB.prepare('SELECT d.*, r.title AS research_title, r.style FROM research_drafts d JOIN researches r ON r.email = d.email AND r.id = d.research_id WHERE d.email = ? AND d.id = ?').bind(email, id).first<any>();
  if (!d) throw new HttpError(404, 'Not found');
  return d;
}

/** GET /api/research/r/:id/drafts → the research's drafts (titles) */
export async function drafts(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const { results } = await ctx.env.DB.prepare('SELECT id, title, updated_at, length(body) AS size FROM research_drafts WHERE email = ? AND research_id = ? ORDER BY updated_at DESC').bind(u.email, r.id).all<any>();
  return json({ drafts: results.map((d) => ({ id: d.id, title: d.title, updatedAt: d.updated_at, size: d.size })) });
}
/** POST /api/research/r/:id/drafts {title, outline?, body?} – a new draft: empty, given, or an outline from the notes */
export async function newDraft(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const d = await read(ctx, z.object({ title: z.string().trim().max(200).default(''), outline: z.boolean().optional(), body: z.string().max(200000).optional() }));
  let text = d.body || '';
  if (d.outline) { const m = await material(ctx, u.email, r.id); text = C.outlineFromNotes(d.title || r.title, m.notes, m.questions); }
  const id = uid(), now = Date.now();
  await ctx.env.DB.prepare('INSERT INTO research_drafts (email, id, research_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(u.email, id, r.id, d.title || r.title, text, now, now).run();
  return json({ ok: true, id });
}
/** GET /api/research/drafts/:id → the draft, its research's sources (to cite) and notes, and how it reads with its citations */
export async function getDraft(ctx: Ctx) {
  const u = requireUser(ctx);
  const d = await ownDraft(ctx, u.email, ctx.params.id);
  const m = await material(ctx, u.email, d.research_id);
  const style = d.style as C.Style;
  return json({
    draft: { id: d.id, research: d.research_id, researchTitle: d.research_title, title: d.title, body: d.body, updatedAt: d.updated_at, driveId: d.drive_id || null, style },
    sources: m.sources.map((s) => ({ id: s.id, inText: C.inText(s.csl, style), title: s.csl.title || '' })),
    notes: m.notes.map((n) => ({ id: n.id, title: n.title, body: n.body })),
    rendered: C.renderDraft(d.body, m.sources, style),
  });
}
/** PUT /api/research/drafts/:id {title?, body?} · DELETE */
export async function saveDraft(ctx: Ctx) {
  const u = requireUser(ctx);
  await ownDraft(ctx, u.email, ctx.params.id);
  const d = await read(ctx, z.object({ title: z.string().trim().min(1).max(200).optional(), body: z.string().max(200000).optional() }));
  const sets: string[] = [], vals: unknown[] = [];
  if (d.title !== undefined) { sets.push('title = ?'); vals.push(d.title); }
  if (d.body !== undefined) { sets.push('body = ?'); vals.push(d.body); }
  if (sets.length) await ctx.env.DB.prepare(`UPDATE research_drafts SET ${sets.join(', ')}, updated_at = ? WHERE email = ? AND id = ?`).bind(...vals, Date.now(), u.email, ctx.params.id).run();
  return json({ ok: true, at: Date.now() });
}
export async function removeDraft(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM research_drafts WHERE email = ? AND id = ?').bind(u.email, ctx.params.id).run();
  return json({ ok: true });
}

/** the draft as a whole HTML page: right to left, its citations written out and its bibliography at the end */
function htmlPage(title: string, rendered: ReturnType<typeof C.renderDraft>) {
  const bib = rendered.bibliography.length ? `<h2>ביבליוגרפיה</h2><ul class="bib">${rendered.bibliography.map((b) => `<li dir="ltr">${C.mdToHtml(b).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>` : '';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:"David","Frank Ruehl CLM","Times New Roman",serif;max-width:42em;margin:2em auto;line-height:1.7;font-size:13pt;padding:0 1em}h1{font-size:1.7em}h2{font-size:1.3em;margin-top:1.6em}blockquote{border-inline-start:3px solid #999;margin:1em 0;padding-inline-start:1em;color:#444}.bib li{margin:.4em 0;text-align:left}@media print{body{margin:0}}</style>
</head><body>${C.mdToHtml(rendered.text)}${bib}</body></html>`;
}

/** GET /api/research/drafts/:id/export?format=md|html|doc|tex|bib */
export async function exportDraft(ctx: Ctx) {
  const u = requireUser(ctx);
  const d = await ownDraft(ctx, u.email, ctx.params.id);
  const m = await material(ctx, u.email, d.research_id);
  const style = d.style as C.Style, fmt = ctx.url.searchParams.get('format') || 'md';
  const rendered = C.renderDraft(d.body, m.sources, style);
  const name = (d.title || 'draft').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'draft';
  const file = (ext: string, type: string, text: string) => new Response(text, { headers: { 'content-type': `${type}; charset=utf-8`, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}.${ext}` } });
  if (fmt === 'html') return new Response(htmlPage(d.title, rendered), { headers: { 'content-type': 'text/html; charset=utf-8' } });   // shown, to print or save as PDF
  // Word opens an HTML document saved as .doc, with its headings and lists (a real .docx would need a library)
  if (fmt === 'doc') return file('doc', 'application/msword', htmlPage(d.title, rendered));
  const used = new Set<string>(), keys = new Map<string, string>(), entries: string[] = [];
  for (const s of m.sources) { const e = C.bibtex(s.csl, used); keys.set(s.id, /\{([^,]+),/.exec(e)![1]); if (rendered.cited.includes(s.id)) entries.push(e); }
  // the .bib is always references.bib, the name the LaTeX file asks for (a Hebrew file name trips BibTeX)
  if (fmt === 'bib') return new Response(entries.join('\n\n') + '\n', { headers: { 'content-type': 'application/x-bibtex; charset=utf-8', 'content-disposition': 'attachment; filename="references.bib"' } });
  if (fmt === 'tex') {
    const BS = String.fromCharCode(92);
    const tex = [`${BS}documentclass{article}`, `${BS}usepackage{polyglossia}`, `${BS}setmainlanguage{hebrew}`, `${BS}setotherlanguage{english}`,
      `${BS}newfontfamily${BS}hebrewfont{David CLM}`, `${BS}title{${d.title.replace(/[{}\\]/g, '')}}`, `${BS}begin{document}`, `${BS}maketitle`, '',
      C.mdToLatex(d.body, keys), '', `${BS}bibliographystyle{${style === 'apa' ? 'apalike' : 'plain'}}`, `${BS}bibliography{references}`, `${BS}end{document}`, ''].join('\n');
    return file('tex', 'application/x-tex', tex);
  }
  return file('md', 'text/markdown', rendered.text + (rendered.bibliography.length ? '\n\n## ביבליוגרפיה\n\n' + rendered.bibliography.map((b) => `- ${b}`).join('\n') + '\n' : ''));
}

/** POST /api/research/drafts/:id/drive → { url } – the draft as a Google Doc (the same one again on each save) */
export async function draftToDrive(ctx: Ctx) {
  const u = requireUser(ctx);
  const d = await ownDraft(ctx, u.email, ctx.params.id);
  const m = await material(ctx, u.email, d.research_id);
  const f = await saveToDrive(ctx, u.email, { id: d.drive_id, name: d.title, content: htmlPage(d.title, C.renderDraft(d.body, m.sources, d.style)), html: true, folder: 'האוהל · מחקרים' });
  await ctx.env.DB.prepare('UPDATE research_drafts SET drive_id = ? WHERE email = ? AND id = ?').bind(f.id, u.email, d.id).run();
  return json({ url: f.webViewLink, id: f.id });
}

/* ---------------- ✨ ---------------- */

const brief = (m: Awaited<ReturnType<typeof material>>) =>
  `Notes:\n${m.notes.map((n) => `- ${n.title}: ${n.body.replace(/\s+/g, ' ').slice(0, 600)}`).join('\n') || '(none)'}\n\nOpen questions:\n${m.questions.map((q) => `- ${q}`).join('\n') || '(none)'}\n\nSources (cite as [@id]):\n${m.sources.map((s) => `- [@${s.id}] ${C.format(s.csl, 'apa')}`).join('\n') || '(none)'}`;

const Directions = z.object({ questions: z.array(z.string()), steps: z.array(z.string()) });
/** POST /api/research/r/:id/ai/directions → questions worth asking next, and small next steps */
export async function aiDirections(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const m = await material(ctx, u.email, r.id);
  const out = await aiJson(ctx.env, {
    prefer: 'gemini', fast: true, schema: Directions,
    system: 'You help a person move their research forward. In Hebrew. From their notes, open questions and sources: 3–5 questions worth asking next (specific to this material, not generic), and 3–5 small next steps (each 15–45 minutes, starting with a verb in the infinitive). Do not invent facts or sources. JSON only: {"questions": [""], "steps": [""]}',
    prompt: `Research: ${r.title}\nAim: ${r.aim || '(not given)'}\n\n${brief(m)}`.slice(0, 30000),
  });
  return json({ questions: out.questions.map((s) => s.trim()).filter(Boolean).slice(0, 6), steps: out.steps.map((s) => s.trim()).filter(Boolean).slice(0, 6) });
}

const Draft = z.object({ body: z.string() });
/** POST /api/research/r/:id/ai/draft → a first draft in Markdown from the notes, citing the sources as [@id] */
export async function aiDraft(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const m = await material(ctx, u.email, r.id);
  if (!m.notes.length) throw new HttpError(400, 'no_notes');
  const out = await aiJson(ctx.env, {
    prefer: 'claude', schema: Draft,
    system: `You write a first draft of a ${r.purpose === 'paper' ? 'paper' : r.purpose === 'talk' ? 'talk' : r.purpose === 'post' ? 'blog post' : 'text'} in Hebrew, in Markdown (# and ## headings, paragraphs, lists), only from the person's own notes and sources. Cite a source only where the notes support it, as [@id] exactly as given (with ", p. N" when a page is known). Never invent sources, quotes or facts; where something is missing, write (להשלים: …). JSON only: {"body": "…"}`,
    prompt: `Title: ${r.title}\nAim: ${r.aim || '(not given)'}\n\n${brief(m)}`.slice(0, 40000),
  });
  if (!out.body.trim()) throw new HttpError(502, 'ai_failed');
  return json({ body: out.body.slice(0, 200000) });
}
