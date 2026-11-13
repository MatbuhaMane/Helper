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
import * as Pk from './research-pack';
import { Access, abstractOf, access, log, researchItem, searchOpenAlex, visibleNotes } from './researches';
import * as S from './research-share';

async function read<T extends z.ZodTypeAny>(ctx: Ctx, schema: T): Promise<z.infer<T>> {
  const p = schema.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid request');
  return p.data;
}

/* ---------------- a research as a goal, and done ---------------- */

/** POST /api/research/r/:id/goal → the goal made for it (or the one it already has) */
export async function asGoal(ctx: Ctx) {
  const u = requireUser(ctx);
  const { r } = await access(ctx, ctx.params.id, 'settings');
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
  const { r } = await access(ctx, ctx.params.id, 'settings');
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
  const { r } = await access(ctx, ctx.params.id);   // (each person keeps their own lines about it)
  const { results } = await ctx.env.DB.prepare('SELECT day, text, updated_at FROM research_journal WHERE email = ? AND research_id = ? ORDER BY day DESC LIMIT 60').bind(u.email, r.id).all<any>();
  return json({ today: dayOf(Date.now()), entries: results.map((e) => ({ day: e.day, text: e.text, updatedAt: e.updated_at })) });
}
/** PUT /api/research/r/:id/journal {text, day?} – today's lines (or an earlier day's) */
export async function writeJournal(ctx: Ctx) {
  const u = requireUser(ctx);
  const { r } = await access(ctx, ctx.params.id);
  const d = await read(ctx, z.object({ text: z.string().max(4000), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }));
  const day = d.day || dayOf(Date.now());
  if (!d.text.trim()) await ctx.env.DB.prepare('DELETE FROM research_journal WHERE email = ? AND research_id = ? AND day = ?').bind(u.email, r.id, day).run();
  else await ctx.env.DB.prepare('INSERT INTO research_journal (email, research_id, day, text, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email, research_id, day) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at')
    .bind(u.email, r.id, day, d.text.trim(), Date.now()).run();
  return json({ ok: true, day });
}

/* ---------------- drafts ---------------- */

/** what a draft is written from: the notes this person may see (not someone else's private note), the open questions
    and the sources */
async function material(ctx: Ctx, a: Access) {
  const db = ctx.env.DB, email = a.owner, researchId = a.r.id;
  const [notes, threads, sources] = await Promise.all([
    visibleNotes(ctx, a).then((list) => ({ results: list.filter((n) => !n.hidden).map((n) => ({ id: n.id, title: n.title, body: n.body })) })),
    db.prepare("SELECT text FROM research_threads WHERE email = ? AND research_id = ? AND status != 'answered' ORDER BY created_at").bind(email, researchId).all<{ text: string }>(),
    db.prepare('SELECT id, csl FROM research_sources WHERE email = ? AND research_id = ? ORDER BY created_at').bind(email, researchId).all<{ id: string; csl: string }>(),
  ]);
  return { notes: notes.results, questions: threads.results.map((t) => t.text), sources: sources.results.map((s) => ({ id: s.id, csl: JSON.parse(s.csl || '{}') as C.Csl })) };
}
/** a draft and its research as this person reaches it; `edit`: 403 unless they may change it (theirs, or as an editor) */
async function draftOf(ctx: Ctx, id: string, edit = false) {
  const { row, a, mayEdit } = await researchItem(ctx, 'research_drafts', id);
  if (edit && !mayEdit) throw new HttpError(403, 'not_allowed');
  return { d: { ...row, research_title: a.r.title, style: a.r.style }, a, mayEdit };
}

/** GET /api/research/r/:id/drafts → the research's drafts (titles) */
export async function drafts(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id);
  const { results } = await ctx.env.DB.prepare('SELECT id, title, updated_at, created_by, length(body) AS size FROM research_drafts WHERE email = ? AND research_id = ? ORDER BY updated_at DESC').bind(a.owner, a.r.id).all<any>();
  return json({ drafts: results.map((d) => ({ id: d.id, title: d.title, updatedAt: d.updated_at, size: d.size, mine: (d.created_by || a.owner) === a.me })) });
}
/** POST /api/research/r/:id/drafts {title, outline?, body?} – a new draft: empty, given, or an outline from the notes */
export async function newDraft(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id, 'add'), r = a.r;
  const d = await read(ctx, z.object({ title: z.string().trim().max(200).default(''), outline: z.boolean().optional(), body: z.string().max(200000).optional(), template: z.string().max(20).nullable().optional() }));
  let text = d.body || '';
  const t = Pk.draftTemplate(d.template);
  if (t) { const m = await material(ctx, a); text = Pk.fromTemplate(t, d.title || r.title, m.notes); }
  else if (d.outline) { const m = await material(ctx, a); text = C.outlineFromNotes(d.title || r.title, m.notes, m.questions); }
  const id = uid(), now = Date.now();
  await ctx.env.DB.prepare('INSERT INTO research_drafts (email, id, research_id, title, body, template, target, numbered, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(a.owner, id, r.id, d.title || r.title, text, t?.id || null, t?.words || null, t?.id === 'imrad' || t?.id === 'seminar' ? 1 : 0, now, now, a.me).run();
  await log(ctx, a, 'draft', id, 'add', null, { title: d.title || r.title });
  return json({ ok: true, id });
}
/** GET /api/research/drafts/:id → the draft, its research's sources (to cite) and notes, and how it reads with its citations */
export async function getDraft(ctx: Ctx) {
  const { d, a, mayEdit } = await draftOf(ctx, ctx.params.id);
  const m = await material(ctx, a);
  const style = d.style as C.Style;
  const template = Pk.draftTemplate(d.template);
  return json({
    draft: { id: d.id, research: d.research_id, researchTitle: d.research_title, title: d.title, body: d.body, updatedAt: d.updated_at, driveId: d.drive_id || null, style,
      template: template ? { id: template.id, name: template.name } : null, target: d.target || null, numbered: !!d.numbered, words: Pk.wordCount(d.body),
      mayEdit, role: a.role, mine: (d.created_by || a.owner) === a.me },
    sources: m.sources.map((s) => ({ id: s.id, inText: C.inText(s.csl, style), title: s.csl.title || '' })),
    notes: m.notes.map((n) => ({ id: n.id, title: n.title, body: n.body })),
    checklist: Pk.checklist(d.body, { template, target: d.target, sourceIds: m.sources.map((s) => s.id) }),
    templates: Pk.DRAFT_TEMPLATES.map((t) => ({ id: t.id, name: t.name, words: t.words })),
  });
}
/** PUT /api/research/drafts/:id {title?, body?} · DELETE */
export async function saveDraft(ctx: Ctx) {
  const { d: before, a } = await draftOf(ctx, ctx.params.id, true);
  const d = await read(ctx, z.object({ title: z.string().trim().min(1).max(200).optional(), body: z.string().max(200000).optional(),
    target: z.number().int().min(0).max(200000).nullable().optional(), numbered: z.boolean().optional(), template: z.string().max(20).nullable().optional() }));
  const sets: string[] = [], vals: unknown[] = [];
  if (d.title !== undefined) { sets.push('title = ?'); vals.push(d.title); }
  if (d.body !== undefined) { sets.push('body = ?'); vals.push(d.body); }
  if (d.target !== undefined) { sets.push('target = ?'); vals.push(d.target || null); }
  if (d.numbered !== undefined) { sets.push('numbered = ?'); vals.push(d.numbered ? 1 : 0); }
  if (d.template !== undefined) { sets.push('template = ?'); vals.push(Pk.draftTemplate(d.template)?.id || null); }
  if (!sets.length) return json({ ok: true, at: Date.now() });
  // the history keeps how it was: a version at most every ten minutes per person (it saves itself as one types), at once
  // when someone else writes
  if (d.title !== undefined || d.body !== undefined) {
    const last = await ctx.env.DB.prepare("SELECT at, by FROM research_history WHERE owner = ? AND research_id = ? AND kind = 'draft' AND item_id = ? AND action = 'edit' ORDER BY at DESC LIMIT 1")
      .bind(a.owner, a.r.id, before.id).first<{ at: number; by: string }>();
    if (S.snapshotDue(last?.at ?? null, Date.now(), a.me, last?.by ?? null)) await log(ctx, a, 'draft', before.id, 'edit', { title: before.title, body: before.body }, null);
  }
  await ctx.env.DB.prepare(`UPDATE research_drafts SET ${sets.join(', ')}, updated_at = ? WHERE email = ? AND id = ?`).bind(...vals, Date.now(), a.owner, before.id).run();
  return json({ ok: true, at: Date.now() });
}
export async function removeDraft(ctx: Ctx) {
  const { d, a } = await draftOf(ctx, ctx.params.id, true);
  await ctx.env.DB.prepare('DELETE FROM research_drafts WHERE email = ? AND id = ?').bind(a.owner, d.id).run();
  const { research_title: _t, style: _s, ...row } = d;
  await log(ctx, a, 'draft', d.id, 'remove', row, null);
  return json({ ok: true });
}

/** a draft ready to export: its headings numbered (or plain, with cross-references by name), its footnotes collected,
    and its citations – in the text and in the notes – written out in the style, with the bibliography of what is cited */
function compose(d: { body: string; numbered: number | boolean; style: C.Style }, sources: C.DraftSource[]) {
  const headed = d.numbered ? Pk.numberHeadings(d.body).md : Pk.plainHeadings(d.body);
  const fn = Pk.footnotes(headed);
  const main = C.renderDraft(fn.text, sources, d.style);
  const notes = fn.notes.map((n) => C.renderDraft(n, sources, d.style));
  const cited = [...new Set([...main.cited, ...notes.flatMap((n) => n.cited)])];
  const bibliography = C.renderDraft(cited.map((id) => `[@${id}]`).join(' '), sources, d.style).bibliography;
  return { text: main.text, notes: notes.map((n) => n.text), cited, bibliography, headed };
}
type Composed = ReturnType<typeof compose>;

/** the draft as a whole HTML page: right to left (English kept in order), its notes and its bibliography at the end */
function htmlPage(title: string, c: Composed) {
  const notes = c.notes.length ? `<h2>הערות</h2><ol class="notes">${c.notes.map((n) => `<li>${C.mdToHtml(n).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ol>` : '';
  const bib = c.bibliography.length ? `<h2>ביבליוגרפיה</h2><ul class="bib">${c.bibliography.map((b) => `<li dir="ltr">${C.mdToHtml(b).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>` : '';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:"David","Frank Ruehl CLM","Times New Roman",serif;max-width:42em;margin:2em auto;line-height:1.7;font-size:13pt;padding:0 1em}h1{font-size:1.7em}h2{font-size:1.3em;margin-top:1.6em}blockquote{border-inline-start:3px solid #999;margin:1em 0;padding-inline-start:1em;color:#444}.bib li{margin:.4em 0;text-align:left}.notes{font-size:.92em}@media print{body{margin:0}}</style>
</head><body>${Pk.bidiHtml(C.mdToHtml(c.text) + notes)}${bib}</body></html>`;
}

/** GET /api/research/drafts/:id/export?format=md|html|doc|tex|bib */
export async function exportDraft(ctx: Ctx) {
  const { d, a } = await draftOf(ctx, ctx.params.id);
  const m = await material(ctx, a);
  const style = d.style as C.Style, fmt = ctx.url.searchParams.get('format') || 'md';
  const c = compose({ body: d.body, numbered: d.numbered, style }, m.sources);
  const name = (d.title || 'draft').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'draft';
  const disp = (ext: string) => `attachment; filename*=UTF-8''${encodeURIComponent(name)}.${ext}`;
  const file = (ext: string, type: string, text: string) => new Response(text, { headers: { 'content-type': `${type}; charset=utf-8`, 'content-disposition': disp(ext) } });
  if (fmt === 'html') return new Response(htmlPage(d.title, c), { headers: { 'content-type': 'text/html; charset=utf-8' } });   // shown, to print or save as PDF
  // a real .docx, written here (research-pack.ts): headings, lists, the notes and the bibliography, right to left
  if (fmt === 'docx') return new Response(Pk.docx(d.title, c.text, c.bibliography, c.notes), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': disp('docx') } });
  if (fmt === 'slides') return new Response(Pk.slidesHtml(d.title, c.text, C.mdToHtml), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const used = new Set<string>(), keys = new Map<string, string>(), entries: string[] = [];
  for (const s of m.sources) { const e = C.bibtex(s.csl, used); keys.set(s.id, /\{([^,]+),/.exec(e)![1]); if (c.cited.includes(s.id)) entries.push(e); }
  // the .bib is always references.bib, the name the LaTeX file asks for (a Hebrew file name trips BibTeX)
  if (fmt === 'bib') return new Response(entries.join('\n\n') + '\n', { headers: { 'content-type': 'application/x-bibtex; charset=utf-8', 'content-disposition': 'attachment; filename="references.bib"' } });
  if (fmt === 'tex') {
    const BS = String.fromCharCode(92);
    const tex = [`${BS}documentclass{article}`, `${BS}usepackage{polyglossia}`, `${BS}setmainlanguage{hebrew}`, `${BS}setotherlanguage{english}`,
      `${BS}newfontfamily${BS}hebrewfont{David CLM}`, `${BS}title{${d.title.replace(/[{}\\]/g, '')}}`, `${BS}begin{document}`, `${BS}maketitle`, '',
      latexBody(d.body, keys), '', `${BS}bibliographystyle{${style === 'apa' ? 'apalike' : 'plain'}}`, `${BS}bibliography{references}`, `${BS}end{document}`, ''].join('\n');
    return file('tex', 'application/x-tex', tex);
  }
  return file('md', 'text/markdown', c.text
    + (c.notes.length ? '\n\n## הערות\n\n' + c.notes.map((n, i) => `${i + 1}. ${n}`).join('\n') : '')
    + (c.bibliography.length ? '\n\n## ביבליוגרפיה\n\n' + c.bibliography.map((b) => `- ${b}`).join('\n') : '') + '\n');
}

/** the LaTeX body: LaTeX numbers the sections itself, so the headings stay plain; a footnote becomes \footnote{…} with
    its own citations as \cite */
function latexBody(md: string, keys: Map<string, string>) {
  const BS = String.fromCharCode(92), notes: string[] = [];
  const marked = Pk.replaceFootnotes(Pk.plainHeadings(md), (n) => { notes.push(n); return `FOOTNOTE${notes.length - 1}MARK`; });
  return C.mdToLatex(marked, keys).replace(/FOOTNOTE(\d+)MARK/g, (_, i) => `${BS}footnote{${C.mdToLatex(notes[Number(i)], keys)}}`);
}

/** POST /api/research/drafts/:id/drive → { url } – the draft as a Google Doc (the same one again on each save) */
export async function draftToDrive(ctx: Ctx) {
  const u = requireUser(ctx);
  const { d, a } = await draftOf(ctx, ctx.params.id);
  const m = await material(ctx, a);
  // to the person's own Drive; the same Doc again only for the one whose Drive keeps it (the research's owner)
  const mineDoc = a.me === a.owner;
  const f = await saveToDrive(ctx, u.email, { id: mineDoc ? d.drive_id : null, name: d.title, content: htmlPage(d.title, compose({ body: d.body, numbered: d.numbered, style: d.style }, m.sources)), html: true, folder: 'האוהל · מחקרים' });
  if (mineDoc) await ctx.env.DB.prepare('UPDATE research_drafts SET drive_id = ? WHERE email = ? AND id = ?').bind(f.id, a.owner, d.id).run();
  return json({ url: f.webViewLink, id: f.id });
}

/* ---------------- ✨ ---------------- */

const brief = (m: Awaited<ReturnType<typeof material>>) =>
  `Notes:\n${m.notes.map((n) => `- ${n.title}: ${n.body.replace(/\s+/g, ' ').slice(0, 600)}`).join('\n') || '(none)'}\n\nOpen questions:\n${m.questions.map((q) => `- ${q}`).join('\n') || '(none)'}\n\nSources (cite as [@id]):\n${m.sources.map((s) => `- [@${s.id}] ${C.format(s.csl, 'apa')}`).join('\n') || '(none)'}`;

const Directions = z.object({ questions: z.array(z.string()), steps: z.array(z.string()) });
/** POST /api/research/r/:id/ai/directions → questions worth asking next, and small next steps */
export async function aiDirections(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id), r = a.r;
  const m = await material(ctx, a);
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
  const a = await access(ctx, ctx.params.id), r = a.r;
  const m = await material(ctx, a);
  if (!m.notes.length) throw new HttpError(400, 'no_notes');
  const out = await aiJson(ctx.env, {
    prefer: 'claude', schema: Draft,
    system: `You write a first draft of a ${r.purpose === 'paper' ? 'paper' : r.purpose === 'talk' ? 'talk' : r.purpose === 'post' ? 'blog post' : 'text'} in Hebrew, in Markdown (# and ## headings, paragraphs, lists), only from the person's own notes and sources. Cite a source only where the notes support it, as [@id] exactly as given (with ", p. N" when a page is known). Never invent sources, quotes or facts; where something is missing, write (להשלים: …). JSON only: {"body": "…"}`,
    prompt: `Title: ${r.title}\nAim: ${r.aim || '(not given)'}\n\n${brief(m)}`.slice(0, 40000),
  });
  if (!out.body.trim()) throw new HttpError(502, 'ai_failed');
  return json({ body: out.body.slice(0, 200000) });
}

const Queries = z.object({ queries: z.array(z.string()) });
/** POST /api/research/r/:id/ai/search {question?} → works found by searches the AI writes from the research (or a question);
    the plain search (/api/research/find) takes the person's own words */
export async function aiSearch(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id), r = a.r;
  const { question } = await read(ctx, z.object({ question: z.string().max(500).optional() }));
  const m = await material(ctx, a);
  const q = await aiJson(ctx.env, {
    prefer: 'gemini', fast: true, schema: Queries,
    system: 'You turn a research question into 2–3 short searches for OpenAlex, a database of scholarly works: in English (scholarly literature is mostly English), 2–6 key terms each, no boolean operators, different angles of the same question. JSON only: {"queries": [""]}',
    prompt: `Research: ${r.title}\nAim: ${r.aim || ''}\n${question ? `Question: ${question}\n` : ''}Notes: ${m.notes.map((n) => n.title).join('; ').slice(0, 1500)}`,
  });
  const queries = q.queries.map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const seen = new Set<string>(), results: any[] = [];
  for (const list of await Promise.all(queries.map((s) => searchOpenAlex(ctx, s, 8).catch(() => [])))) {
    for (const x of list) { const k = x.doi || x.id; if (k && !seen.has(k)) { seen.add(k); results.push(x); } }
  }
  return json({ queries, results: results.slice(0, 20), credit: 'OpenAlex' });
}

const Summary = z.object({ points: z.array(z.string()), relevance: z.string() });
/** POST /api/research/sources/:id/ai/summary → the source's abstract (from OpenAlex, live) in a few Hebrew points, and how
    it bears on the research. Nothing of it is stored; the person may keep it as a note. */
export async function aiSummary(ctx: Ctx) {
  const { row, a } = await researchItem(ctx, 'research_sources', ctx.params.id);
  const s = { ...row, rtitle: a.r.title, aim: a.r.aim };
  const csl = JSON.parse(s.csl || '{}') as C.Csl;
  const abstract = s.doi ? await abstractOf(ctx, s.doi) : '';
  if (!abstract) throw new HttpError(422, 'no_abstract');
  const out = await aiJson(ctx.env, {
    prefer: 'gemini', fast: true, schema: Summary,
    system: 'Summarise a scholarly work for a Hebrew-speaking researcher, only from its abstract: 3–5 short points in Hebrew (what was asked, how, what was found), and one or two sentences on how it bears on their research. Never add what the abstract does not say. JSON only: {"points": [""], "relevance": ""}',
    prompt: `Their research: ${s.rtitle} – ${s.aim || ''}\n\nThe work: ${C.format(csl, 'apa')}\n\nAbstract:\n${abstract}`,
  });
  return json({ points: out.points.slice(0, 6), relevance: out.relevance, cite: C.inText(csl, 'apa') });
}

/** POST /api/research/r/:id/ai/compare {sources: [id…]} → how two to five sources agree, differ and complement (from their
    abstracts), in Hebrew Markdown */
export async function aiCompare(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id), r = a.r;
  const { sources } = await read(ctx, z.object({ sources: z.array(z.string().max(40)).min(2).max(5) }));
  const rows = (await ctx.env.DB.prepare(`SELECT id, csl, doi FROM research_sources WHERE email = ? AND research_id = ? AND id IN (${sources.map(() => '?').join(',')})`).bind(a.owner, r.id, ...sources).all<any>()).results;
  const items = await Promise.all(rows.map(async (s) => { const csl = JSON.parse(s.csl || '{}') as C.Csl; return { cite: C.inText(csl, 'apa'), title: csl.title || '', abstract: s.doi ? await abstractOf(ctx, s.doi) : '' }; }));
  const usable = items.filter((i) => i.abstract);
  if (usable.length < 2) throw new HttpError(422, 'no_abstract');
  const out = await aiJson(ctx.env, {
    prefer: 'gemini', schema: Draft,
    system: 'Compare scholarly works for a researcher, only from their abstracts, in Hebrew Markdown: a short table (work · question · method · finding), then where they agree, where they differ, and what each adds. Refer to each work by its citation as given. Never add what the abstracts do not say. JSON only: {"body": "…"}',
    prompt: `Their research: ${r.title}\n\n${usable.map((i) => `${i.cite} ${i.title}\nAbstract: ${i.abstract}`).join('\n\n')}`.slice(0, 40000),
  });
  return json({ body: out.body, missing: items.filter((i) => !i.abstract).map((i) => i.cite) });
}

const Edit = z.object({ text: z.string(), notes: z.array(z.string()) });
/** POST /api/research/drafts/:id/ai/edit {text?} → the draft (or a part of it) edited for language – clearer, correct Hebrew,
    the same content – with a few notes on what changed. The citation, link and footnote marks are kept as they are. */
export async function aiEdit(ctx: Ctx) {
  const { d } = await draftOf(ctx, ctx.params.id, true);
  const { text } = await read(ctx, z.object({ text: z.string().max(60000).optional() }));
  const input = (text ?? d.body).trim();
  if (!input) throw new HttpError(400, 'Empty');
  const out = await aiJson(ctx.env, {
    prefer: 'claude', schema: Edit,
    system: 'You are a careful Hebrew language editor for academic and personal writing. Improve clarity, grammar, spelling, punctuation and flow; keep the author\'s voice, meaning, structure and Markdown. Do not add or remove content or claims. Keep every mark exactly as it is: [@…] citations, [[…]] links, ^[…] footnotes, {#…} labels, [ref:…] references. JSON only: {"text": "the edited text", "notes": ["a few short notes in Hebrew on the main changes"]}',
    prompt: input,
  });
  // the marks must survive the editing: if one is lost, the edit is not offered
  const marks = (s: string) => (s.match(/\[@[^\]]+\]|\[\[[^\]]+\]\]|\^\[|\{#[^}]+\}|\[ref:[^\]]+\]/g) || []).sort().join('|');
  if (marks(out.text) !== marks(input)) throw new HttpError(502, 'edit_lost_marks');
  return json({ text: out.text, notes: out.notes.slice(0, 6) });
}
