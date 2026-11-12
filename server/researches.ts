// עוזר מחקר – the core (vision's spec v1, docs/vision/research.md, step 1): researches, each with its purpose and citation
// style; notes – the hub's own notes, so one note belongs to several researches (the same note, not a copy), with
// [[links]] between them and backlinks; questions and threads (open, answered, parked) with one screen of all the open
// ones; sources by DOI (Crossref's metadata, OpenAlex's open copy and retraction mark – neither's abstracts are stored);
// an inbox for what was captured from anywhere (/capture/); and export to Markdown and BibTeX.
// The shared engine: the open sources and the citations are here and in research-cite.ts; the Torah researcher
// (research.ts) is the Sefaria "source pack" of the same engine. Without AI throughout; ✨ comes with step 2.
// Later steps (not here): persistence and writing, shared research with roles, the toolkit and the field packs.

import { z } from 'zod';
import { Ctx, HttpError, body, json, requireUser, uid } from './core';
import * as C from './research-cite';
import { setting } from './settings';

async function read<T extends z.ZodTypeAny>(ctx: Ctx, schema: T): Promise<z.infer<T>> {
  const p = schema.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid request');
  return p.data;
}
const Style = z.enum(['apa', 'mla', 'chicago']);
const PURPOSES = ['paper', 'book', 'talk', 'post', 'work', 'personal', 'family'] as const;
const ResearchIn = z.object({ title: z.string().trim().min(1).max(200), purpose: z.enum(PURPOSES).default('personal'), aim: z.string().trim().max(1000).default(''), style: Style.default('apa') });

/* ---------------- the open sources (OpenAlex is the backbone; Crossref for a DOI's details) ---------------- */

/** the contact address the open APIs ask for (their "polite pool"); empty until the owner sets one in the room */
async function contact(ctx: Ctx) {
  const e = String(await setting<string>(ctx.env, 'research.contact_email').catch(() => '')).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
}
async function getJson(url: string, ua: string) {
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': ua }, cf: { cacheTtl: 86400 } } as RequestInit);
  if (!r.ok) return null;
  return r.json() as Promise<any>;
}
const UA = (mail: string) => `HaOhel-research/1.0${mail ? ` (mailto:${mail})` : ''}`;

/** a DOI's source: Crossref's metadata, and from OpenAlex its open copy, retraction and citations (when it knows it) */
async function lookupDoi(ctx: Ctx, doi: string) {
  const mail = await contact(ctx);
  const q = mail ? `?mailto=${encodeURIComponent(mail)}` : '';
  const [cr, oa] = await Promise.all([
    getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}${q}`, UA(mail)).catch(() => null),
    getJson(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}${q}`, UA(mail)).catch(() => null),
  ]);
  const fromOa = oa ? C.fromOpenAlex(oa) : null;
  const csl = cr?.message ? C.fromCrossref(cr.message) : fromOa?.csl;
  if (!csl?.title) throw new HttpError(404, 'source_not_found');
  return { csl, oa: fromOa?.oa || null, retracted: !!fromOa?.retracted, cited: fromOa?.cited ?? null, openalex: fromOa?.id || null };
}

/** GET /api/research/find?q= → works from OpenAlex (nothing stored: the person adds the ones they want) */
export async function find(ctx: Ctx) {
  requireUser(ctx);
  const q = (ctx.url.searchParams.get('q') || '').trim().slice(0, 200);
  if (q.length < 2) return json({ results: [] });
  const doi = C.doiOf(q);
  if (doi) return json({ results: [{ ...(await lookupDoi(ctx, doi)), doi }] });
  const mail = await contact(ctx);
  const d = await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=15${mail ? `&mailto=${encodeURIComponent(mail)}` : ''}`, UA(mail));
  if (!d) throw new HttpError(502, 'search_failed');
  return json({ results: (d.results || []).map((w: any) => { const x = C.fromOpenAlex(w); return { ...x, doi: x.csl.DOI || null }; }), credit: 'OpenAlex' });
}

/* ---------------- researches ---------------- */

/** GET /api/research/list → the researches with their counts, the open threads of all of them, and the inbox */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const db = ctx.env.DB;
  const [rs, counts, threads, inbox] = await Promise.all([
    db.prepare("SELECT * FROM researches WHERE email = ? AND status != 'deleted' ORDER BY updated_at DESC").bind(u.email).all<any>(),
    db.prepare(`SELECT r.id,
        (SELECT COUNT(*) FROM research_notes n JOIN notes x ON x.email = n.email AND x.id = n.note_id AND x.deleted = 0 WHERE n.email = r.email AND n.research_id = r.id) AS notes,
        (SELECT COUNT(*) FROM research_sources s WHERE s.email = r.email AND s.research_id = r.id) AS sources,
        (SELECT COUNT(*) FROM research_threads t WHERE t.email = r.email AND t.research_id = r.id AND t.status = 'open') AS open
      FROM researches r WHERE r.email = ?`).bind(u.email).all<any>(),
    db.prepare("SELECT t.*, r.title AS research FROM research_threads t JOIN researches r ON r.email = t.email AND r.id = t.research_id WHERE t.email = ? AND t.status = 'open' AND r.status != 'deleted' ORDER BY t.updated_at DESC LIMIT 200").bind(u.email).all<any>(),
    db.prepare('SELECT id, title, body, source_url, source_title, created_at FROM notes WHERE email = ? AND deleted = 0 AND COALESCE(inbox, 0) = 1 ORDER BY created_at DESC LIMIT 100').bind(u.email).all<any>(),
  ]);
  const by = new Map(counts.results.map((c) => [c.id, c]));
  return json({
    researches: rs.results.map((r) => ({ id: r.id, title: r.title, purpose: r.purpose, aim: r.aim || '', style: r.style, updatedAt: r.updated_at, done: !!r.done_at, notes: by.get(r.id)?.notes || 0, sources: by.get(r.id)?.sources || 0, open: by.get(r.id)?.open || 0 })),
    threads: threads.results.map(threadOut),
    inbox: inbox.results.map((n) => ({ id: n.id, title: n.title, body: n.body, source: n.source_url ? { url: n.source_url, title: n.source_title || '' } : null, createdAt: n.created_at })),
    styles: C.STYLES,
  });
}
const threadOut = (t: any) => ({ id: t.id, research: t.research_id, researchTitle: t.research || null, text: t.text, status: t.status, answer: t.answer || '', noteId: t.note_id || null, createdAt: t.created_at, updatedAt: t.updated_at });

async function ownResearch(ctx: Ctx, email: string, id: string) {
  const r = await ctx.env.DB.prepare("SELECT * FROM researches WHERE email = ? AND id = ? AND status != 'deleted'").bind(email, id).first<any>();
  if (!r) throw new HttpError(404, 'Not found');
  return r;
}

/** POST /api/research/new */
export async function create(ctx: Ctx) {
  const u = requireUser(ctx);
  const d = await read(ctx, ResearchIn), id = uid(), now = Date.now();
  await ctx.env.DB.prepare('INSERT INTO researches (email, id, title, purpose, aim, style, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(u.email, id, d.title, d.purpose, d.aim, d.style, 'active', now, now).run();
  return json({ ok: true, id });
}

/** GET /api/research/r/:id → the research, its notes (with their links and backlinks), threads and sources */
export async function get(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const db = ctx.env.DB;
  const [notes, threads, sources, allNotes] = await Promise.all([
    db.prepare('SELECT x.id, x.title, x.body, x.source_url, x.source_title, x.starred, x.updated_at FROM research_notes n JOIN notes x ON x.email = n.email AND x.id = n.note_id WHERE n.email = ? AND n.research_id = ? AND x.deleted = 0 ORDER BY n.sort, n.added_at').bind(u.email, r.id).all<any>(),
    db.prepare('SELECT * FROM research_threads WHERE email = ? AND research_id = ? ORDER BY CASE status WHEN \'open\' THEN 0 WHEN \'parked\' THEN 1 ELSE 2 END, updated_at DESC').bind(u.email, r.id).all<any>(),
    db.prepare('SELECT * FROM research_sources WHERE email = ? AND research_id = ? ORDER BY created_at').bind(u.email, r.id).all<any>(),
    db.prepare('SELECT id, title, body FROM notes WHERE email = ? AND deleted = 0').bind(u.email).all<{ id: string; title: string; body: string }>(),
  ]);
  // links by title ([[…]]) among all of the person's notes: what each note points to, and what points to it
  const byTitle = new Map(allNotes.results.map((n) => [n.title.trim(), n.id]));
  const titleOf = new Map(allNotes.results.map((n) => [n.id, n.title]));
  const out = new Map<string, string[]>(), back = new Map<string, string[]>();
  for (const n of allNotes.results) {
    for (const t of C.linksIn(n.body)) { const to = byTitle.get(t); if (!to || to === n.id) continue; (out.get(n.id) || out.set(n.id, []).get(n.id)!).push(to); (back.get(to) || back.set(to, []).get(to)!).push(n.id); }
  }
  const ref = (id: string) => ({ id, title: titleOf.get(id) || '' });
  return json({
    research: { id: r.id, title: r.title, purpose: r.purpose, aim: r.aim || '', style: r.style, goalId: r.goal_id || null, doneAt: r.done_at || null },
    notes: notes.results.map((n) => ({ id: n.id, title: n.title, body: n.body, starred: !!n.starred, source: n.source_url ? { url: n.source_url, title: n.source_title || '' } : null,
      links: (out.get(n.id) || []).map(ref), backlinks: (back.get(n.id) || []).map(ref), updatedAt: n.updated_at })),
    threads: threads.results.map(threadOut),
    sources: sources.results.map((s) => sourceOut(s, r.style)),
    styles: C.STYLES,
  });
}
const sourceOut = (s: any, style: C.Style) => {
  const csl = JSON.parse(s.csl || '{}') as C.Csl;
  return { id: s.id, csl, doi: s.doi || null, oa: s.oa_url || null, retracted: !!s.retracted, cited: s.cited ?? null, note: s.note || '', reliability: s.reliability || null,
    cite: C.format(csl, style), inText: C.inText(csl, style) };
};

/** PUT /api/research/r/:id {title?, purpose?, aim?, style?} · DELETE (kept as deleted; its notes stay in פתקים) */
export async function update(ctx: Ctx) {
  const u = requireUser(ctx);
  await ownResearch(ctx, u.email, ctx.params.id);
  const d = await read(ctx, ResearchIn.partial());
  const sets: string[] = [], vals: unknown[] = [];
  for (const k of ['title', 'purpose', 'aim', 'style'] as const) if (d[k] !== undefined) { sets.push(`${k} = ?`); vals.push(d[k]); }
  if (sets.length) await ctx.env.DB.prepare(`UPDATE researches SET ${sets.join(', ')}, updated_at = ? WHERE email = ? AND id = ?`).bind(...vals, Date.now(), u.email, ctx.params.id).run();
  return json({ ok: true });
}
export async function remove(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare("UPDATE researches SET status = 'deleted', updated_at = ? WHERE email = ? AND id = ?").bind(Date.now(), u.email, ctx.params.id).run();
  return json({ ok: true });
}
const touch = (ctx: Ctx, email: string, id: string) => ctx.env.DB.prepare('UPDATE researches SET updated_at = ? WHERE email = ? AND id = ?').bind(Date.now(), email, id).run();

/* ---------------- notes in a research (the same note in each: a link, not a copy) ---------------- */

/** POST /api/research/r/:id/notes {noteId} | {title, body} – an existing note joins the research, or a new one is written */
export async function addNote(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const d = await read(ctx, z.object({ noteId: z.string().max(40).optional(), title: z.string().trim().max(200).optional(), body: z.string().max(50000).optional() }));
  const db = ctx.env.DB, now = Date.now();
  let noteId = d.noteId;
  if (noteId) {
    const n = await db.prepare('SELECT id FROM notes WHERE email = ? AND id = ? AND deleted = 0').bind(u.email, noteId).first();
    if (!n) throw new HttpError(404, 'Not found');
  } else {
    if (!(d.title || '').trim() && !(d.body || '').trim()) throw new HttpError(400, 'Empty note');
    noteId = uid();
    await db.prepare('INSERT INTO notes (email, id, title, body, source_url, source_title, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 0)')
      .bind(u.email, noteId, (d.title || '').trim() || (d.body || '').trim().split(/\s+/).slice(0, 7).join(' ').slice(0, 60), (d.body || '').trim(), now, now).run();
  }
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO research_notes (email, research_id, note_id, sort, added_at) VALUES (?, ?, ?, ?, ?)').bind(u.email, r.id, noteId, now, now),
    // sorted out of the inbox once it is in a research
    db.prepare('UPDATE notes SET inbox = 0 WHERE email = ? AND id = ?').bind(u.email, noteId),
  ]);
  await touch(ctx, u.email, r.id);
  return json({ ok: true, id: noteId });
}
/** DELETE /api/research/r/:id/notes/:noteId – out of this research (the note itself stays) */
export async function removeNote(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM research_notes WHERE email = ? AND research_id = ? AND note_id = ?').bind(u.email, ctx.params.id, ctx.params.noteId).run();
  return json({ ok: true });
}
/** GET /api/research/of-note/:noteId → the researches a note belongs to (for the notes page) */
export async function ofNote(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT r.id, r.title FROM research_notes n JOIN researches r ON r.email = n.email AND r.id = n.research_id WHERE n.email = ? AND n.note_id = ? AND r.status != 'deleted'")
    .bind(u.email, ctx.params.noteId).all<{ id: string; title: string }>();
  return json({ researches: results });
}

/* ---------------- questions and threads ---------------- */

const ThreadIn = z.object({ text: z.string().trim().min(1).max(1000).optional(), status: z.enum(['open', 'answered', 'parked']).optional(), answer: z.string().max(4000).optional(), noteId: z.string().max(40).nullable().optional() });
/** POST /api/research/r/:id/threads {text} */
export async function addThread(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const d = await read(ctx, ThreadIn);
  if (!d.text) throw new HttpError(400, 'Empty question');
  const id = uid(), now = Date.now();
  await ctx.env.DB.prepare('INSERT INTO research_threads (email, id, research_id, text, status, answer, note_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(u.email, id, r.id, d.text, 'open', '', d.noteId || null, now, now).run();
  await touch(ctx, u.email, r.id);
  return json({ ok: true, id });
}
/** PUT /api/research/threads/:id {text?, status?, answer?, noteId?} · DELETE */
export async function editThread(ctx: Ctx) {
  const u = requireUser(ctx);
  const d = await read(ctx, ThreadIn);
  const sets: string[] = [], vals: unknown[] = [];
  if (d.text !== undefined) { sets.push('text = ?'); vals.push(d.text); }
  if (d.status !== undefined) { sets.push('status = ?'); vals.push(d.status); }
  if (d.answer !== undefined) { sets.push('answer = ?'); vals.push(d.answer); }
  if (d.noteId !== undefined) { sets.push('note_id = ?'); vals.push(d.noteId); }
  if (!sets.length) return json({ ok: true });
  const r = await ctx.env.DB.prepare(`UPDATE research_threads SET ${sets.join(', ')}, updated_at = ? WHERE email = ? AND id = ?`).bind(...vals, Date.now(), u.email, ctx.params.id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Not found');
  return json({ ok: true });
}
export async function removeThread(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM research_threads WHERE email = ? AND id = ?').bind(u.email, ctx.params.id).run();
  return json({ ok: true });
}

/* ---------------- sources ---------------- */

const SourceIn = z.object({
  doi: z.string().max(300).optional(),
  csl: z.object({ title: z.string().trim().min(1).max(500), author: z.array(z.object({ family: z.string().max(120).optional(), given: z.string().max(120).optional(), literal: z.string().max(200).optional() })).max(50).optional(),
    issued: z.object({ 'date-parts': z.array(z.array(z.number().int())).max(1) }).optional(), 'container-title': z.string().max(300).optional(), volume: z.string().max(40).optional(),
    issue: z.string().max(40).optional(), page: z.string().max(40).optional(), publisher: z.string().max(200).optional(), 'publisher-place': z.string().max(120).optional(),
    URL: z.string().max(1000).optional(), ISBN: z.string().max(40).optional(), type: z.string().max(40).optional() }).optional(),
  note: z.string().max(2000).optional(),
});
/** POST /api/research/r/:id/sources {doi} | {csl} – by a DOI (looked up), or typed in by hand */
export async function addSource(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const d = await read(ctx, SourceIn);
  let csl: C.Csl, doi: string | null = null, oa: string | null = null, retracted = false, cited: number | null = null;
  if (d.doi) {
    doi = C.doiOf(d.doi);
    if (!doi) throw new HttpError(400, 'bad_doi');
    const dup = await ctx.env.DB.prepare('SELECT id FROM research_sources WHERE email = ? AND research_id = ? AND doi = ?').bind(u.email, r.id, doi).first<{ id: string }>();
    if (dup) return json({ ok: true, id: dup.id, existed: true });
    ({ csl, oa, retracted, cited } = await lookupDoi(ctx, doi));
  } else if (d.csl) csl = d.csl as C.Csl;
  else throw new HttpError(400, 'Empty source');
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO research_sources (email, id, research_id, csl, doi, oa_url, retracted, cited, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(u.email, id, r.id, JSON.stringify(csl), doi, oa, retracted ? 1 : 0, cited, d.note || '', Date.now()).run();
  await touch(ctx, u.email, r.id);
  return json({ ok: true, id, source: sourceOut({ id, csl: JSON.stringify(csl), doi, oa_url: oa, retracted, cited, note: d.note || '' }, r.style) });
}
/** PUT /api/research/sources/:id {note?, reliability?} · DELETE */
export async function editSource(ctx: Ctx) {
  const u = requireUser(ctx);
  const d = await read(ctx, z.object({ note: z.string().max(2000).optional(), reliability: z.number().int().min(1).max(5).nullable().optional() }));
  const sets: string[] = [], vals: unknown[] = [];
  if (d.note !== undefined) { sets.push('note = ?'); vals.push(d.note); }
  if (d.reliability !== undefined) { sets.push('reliability = ?'); vals.push(d.reliability); }
  if (sets.length) await ctx.env.DB.prepare(`UPDATE research_sources SET ${sets.join(', ')} WHERE email = ? AND id = ?`).bind(...vals, u.email, ctx.params.id).run();
  return json({ ok: true });
}
export async function removeSource(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM research_sources WHERE email = ? AND id = ?').bind(u.email, ctx.params.id).run();
  return json({ ok: true });
}

/* ---------------- export ---------------- */

/** GET /api/research/r/:id/export?format=md|bib – the research as Markdown (purpose, notes, open questions, bibliography),
    or its sources as BibTeX (for Zotero, Mendeley and LaTeX) */
export async function exportResearch(ctx: Ctx) {
  const u = requireUser(ctx);
  const r = await ownResearch(ctx, u.email, ctx.params.id);
  const res = await get(ctx);
  const data = (await res.json()) as any;
  const fmt = ctx.url.searchParams.get('format') === 'bib' ? 'bib' : 'md';
  const safe = r.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'research';
  if (fmt === 'bib') {
    const used = new Set<string>();
    const text = data.sources.map((s: any) => C.bibtex(s.csl, used)).join('\n\n') + '\n';
    return new Response(text, { headers: { 'content-type': 'application/x-bibtex; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.bib` } });
  }
  const lines = [`# ${r.title}`, '', r.aim ? `> ${r.aim}` : '', ''];
  if (data.notes.length) { lines.push('## פתקים', ''); for (const n of data.notes) lines.push(`### ${n.title}`, '', n.body, n.source ? `\nמקור: [${n.source.title || n.source.url}](${n.source.url})` : '', ''); }
  const open = data.threads.filter((t: any) => t.status !== 'answered');
  if (open.length) { lines.push('## שאלות פתוחות', ''); for (const t of open) lines.push(`- ${t.text}${t.status === 'parked' ? ' (מושהית)' : ''}`); lines.push(''); }
  const answered = data.threads.filter((t: any) => t.status === 'answered');
  if (answered.length) { lines.push('## שאלות שנענו', ''); for (const t of answered) lines.push(`- **${t.text}** ${t.answer}`); lines.push(''); }
  if (data.sources.length) { lines.push('## ביבליוגרפיה', ''); for (const s of [...data.sources].sort((a: any, b: any) => a.cite.localeCompare(b.cite))) lines.push(`- ${s.cite}`); lines.push(''); }
  return new Response(lines.filter((l, i, a) => l || a[i - 1]).join('\n'), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.md` } });
}
