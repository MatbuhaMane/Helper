// עוזר מחקר – researches, each with its purpose and citation style; notes – the hub's own notes, so one note belongs to
// several researches (the same note, not a copy), with [[links]] between them and backlinks; questions and threads (open,
// answered, parked) with one screen of all the open ones; sources by DOI (Crossref's metadata, OpenAlex's open copy and
// retraction mark – neither's abstracts are stored); an inbox for what was captured from anywhere (/capture/); export to
// Markdown and BibTeX (docs/vision/research.md, step 1).
// Step 3, shared research: a research has members – editor, contributor, reader – besides its owner (research-share.ts
// says who may do what). Every row of a research is kept under its owner's address; what someone else wrote carries
// their address in created_by (a note stays in its author's own notes: note_email). A private note linked into a shared
// research is shared only if its author says so each time; if not, the others see only that there is one. Changes go to
// the history, which an editor can restore; everyone comments. Someone outside the household joins only by accepting.
// The shared engine: the open sources and the citations are here and in research-cite.ts; the Torah researcher
// (research.ts) is the Sefaria "source pack" of the same engine.

import { z } from 'zod';
import { Ctx, HttpError, body, json, requireUser, uid } from './core';
import * as C from './research-cite';
import * as S from './research-share';
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
  return json({ results: await searchOpenAlex(ctx, q), credit: 'OpenAlex' });
}
/** works from OpenAlex for words (the ✨ focused search runs several of these) */
export async function searchOpenAlex(ctx: Ctx, q: string, per = 15) {
  const mail = await contact(ctx);
  const d = await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${per}${mail ? `&mailto=${encodeURIComponent(mail)}` : ''}`, UA(mail));
  if (!d) throw new HttpError(502, 'search_failed');
  return (d.results || []).map((w: any) => { const x = C.fromOpenAlex(w); return { ...x, doi: x.csl.DOI || null }; });
}
/** a work's abstract from OpenAlex (rebuilt from its word index), live and never stored – for ✨ summaries and comparisons */
export async function abstractOf(ctx: Ctx, doi: string): Promise<string> {
  const mail = await contact(ctx);
  const w = await getJson(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}${mail ? `?mailto=${encodeURIComponent(mail)}` : ''}`, UA(mail)).catch(() => null);
  const idx = w?.abstract_inverted_index as Record<string, number[]> | undefined;
  if (!idx) return '';
  const words: string[] = [];
  for (const [word, at] of Object.entries(idx)) for (const i of at) words[i] = word;
  return words.filter(Boolean).join(' ').slice(0, 6000);
}

/* ---------------- access: the owner, or a member in a role ---------------- */

export interface Access { r: any; owner: string; role: S.Role; me: string }
/** the research and this person's role in it – or 404, as if it were not there, for anyone who is not in it; with `need`,
    403 when the role does not allow it */
export async function access(ctx: Ctx, id: string, need?: S.Action, opts?: { mine?: boolean; inviteAs?: S.Role }): Promise<Access> {
  const u = requireUser(ctx);
  const db = ctx.env.DB;
  const own = await db.prepare("SELECT * FROM researches WHERE email = ? AND id = ? AND status != 'deleted'").bind(u.email, id).first<any>();
  let r = own, role: S.Role | null = own ? 'owner' : null;
  if (!own) {
    const m = await db.prepare("SELECT m.role, r.* FROM research_members m JOIN researches r ON r.email = m.owner AND r.id = m.research_id WHERE m.research_id = ? AND m.email = ? AND m.status = 'active' AND r.status != 'deleted'")
      .bind(id, u.email).first<any>();
    if (m) { r = m; role = m.role as S.Role; }
  }
  if (!r || !role) throw new HttpError(404, 'Not found');
  if (need && !S.can(role, need, opts)) throw new HttpError(403, 'not_allowed');
  return { r, owner: r.email, role, me: u.email };
}
/** a thread, a source or a draft by its id, with access to its research (and whether this person may change it) */
async function item(ctx: Ctx, table: 'research_threads' | 'research_sources' | 'research_drafts', id: string) {
  const u = requireUser(ctx);
  const rows = (await ctx.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).all<any>()).results;
  for (const row of rows) {
    const a = await access(ctx, row.research_id).catch(() => null);
    if (a && a.owner === row.email) return { row, a, mayEdit: S.mayEdit(a.role, row.created_by || null, u.email) };
  }
  throw new HttpError(404, 'Not found');
}
export const researchItem = item;

/** the history of a research: what changed, by whom, and how it was before (to restore) */
export async function log(ctx: Ctx, a: Access, kind: string, itemId: string, action: 'add' | 'edit' | 'remove' | 'restore', before: unknown, after: unknown) {
  await ctx.env.DB.prepare('INSERT INTO research_history (owner, research_id, id, at, by, kind, item_id, action, before, after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(a.owner, a.r.id, uid(), Date.now(), a.me, kind, itemId, action, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)).run().catch(() => {});
}
const touch = (ctx: Ctx, a: Access) => ctx.env.DB.prepare('UPDATE researches SET updated_at = ? WHERE email = ? AND id = ?').bind(Date.now(), a.owner, a.r.id).run();
/** members' names, for the page (the Hebrew name when there is one) */
async function names(ctx: Ctx, emails: string[]) {
  const list = [...new Set(emails.filter(Boolean))];
  if (!list.length) return new Map<string, string>();
  const { results } = await ctx.env.DB.prepare(`SELECT email, name, he_name FROM members WHERE email IN (${list.map(() => '?').join(',')})`).bind(...list).all<any>();
  return new Map(results.map((m) => [m.email, m.he_name || m.name || m.email.split('@')[0]]));
}
const isShared = async (ctx: Ctx, a: Access) => !!(await ctx.env.DB.prepare('SELECT 1 FROM research_members WHERE owner = ? AND research_id = ? LIMIT 1').bind(a.owner, a.r.id).first());

/* ---------------- researches ---------------- */

/** GET /api/research/list → mine and those shared with me (with my role), invitations waiting for me, every open thread,
    and my inbox */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const db = ctx.env.DB;
  const [rs, shared, invites, inbox] = await Promise.all([
    db.prepare("SELECT *, 'owner' AS role FROM researches WHERE email = ? AND status != 'deleted' ORDER BY updated_at DESC").bind(u.email).all<any>(),
    db.prepare("SELECT r.*, m.role FROM research_members m JOIN researches r ON r.email = m.owner AND r.id = m.research_id WHERE m.email = ? AND m.status = 'active' AND r.status != 'deleted' ORDER BY r.updated_at DESC").bind(u.email).all<any>(),
    db.prepare("SELECT m.role, m.invited_by, m.outside, r.id, r.title, r.email AS owner FROM research_members m JOIN researches r ON r.email = m.owner AND r.id = m.research_id WHERE m.email = ? AND m.status = 'invited' AND r.status != 'deleted'").bind(u.email).all<any>(),
    db.prepare('SELECT id, title, body, source_url, source_title, created_at FROM notes WHERE email = ? AND deleted = 0 AND COALESCE(inbox, 0) = 1 ORDER BY created_at DESC LIMIT 100').bind(u.email).all<any>(),
  ]);
  const all = [...rs.results, ...shared.results];
  const counts = new Map<string, any>();
  const threads: any[] = [];
  for (const r of all) {
    const [c, t] = await Promise.all([
      db.prepare(`SELECT
          (SELECT COUNT(*) FROM research_notes n WHERE n.email = ? AND n.research_id = ?) AS notes,
          (SELECT COUNT(*) FROM research_sources s WHERE s.email = ? AND s.research_id = ?) AS sources,
          (SELECT COUNT(*) FROM research_threads t WHERE t.email = ? AND t.research_id = ? AND t.status = 'open') AS open,
          (SELECT COUNT(*) FROM research_members m WHERE m.owner = ? AND m.research_id = ? AND m.status = 'active') AS members`)
        .bind(r.email, r.id, r.email, r.id, r.email, r.id, r.email, r.id).first<any>(),
      db.prepare("SELECT * FROM research_threads WHERE email = ? AND research_id = ? AND status = 'open' ORDER BY updated_at DESC LIMIT 50").bind(r.email, r.id).all<any>(),
    ]);
    counts.set(r.email + '|' + r.id, c);
    threads.push(...t.results.map((x) => ({ ...x, research: r.title })));
  }
  const who = await names(ctx, [...shared.results.map((r) => r.email), ...invites.results.map((i) => i.invited_by)]);
  return json({
    researches: all.map((r) => { const c = counts.get(r.email + '|' + r.id) || {}; return { id: r.id, title: r.title, purpose: r.purpose, aim: r.aim || '', style: r.style, updatedAt: r.updated_at, done: !!r.done_at,
      role: r.role, owner: r.email === u.email ? null : who.get(r.email) || '', notes: c.notes || 0, sources: c.sources || 0, open: c.open || 0, members: c.members || 0 }; }),
    invitations: invites.results.map((i) => ({ id: i.id, title: i.title, role: i.role, roleName: S.ROLE_NAME[i.role as S.Role], from: who.get(i.invited_by) || i.invited_by, outside: !!i.outside })),
    threads: threads.sort((a, b) => b.updated_at - a.updated_at).slice(0, 200).map(threadOut),
    inbox: inbox.results.map((n) => ({ id: n.id, title: n.title, body: n.body, source: n.source_url ? { url: n.source_url, title: n.source_title || '' } : null, createdAt: n.created_at })),
    styles: C.STYLES,
  });
}
const threadOut = (t: any) => ({ id: t.id, research: t.research_id, researchTitle: t.research || null, text: t.text, status: t.status, answer: t.answer || '', noteId: t.note_id || null, createdBy: t.created_by || null, createdAt: t.created_at, updatedAt: t.updated_at });

/** POST /api/research/new */
export async function create(ctx: Ctx) {
  const u = requireUser(ctx);
  const d = await read(ctx, ResearchIn), id = uid(), now = Date.now();
  await ctx.env.DB.prepare('INSERT INTO researches (email, id, title, purpose, aim, style, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(u.email, id, d.title, d.purpose, d.aim, d.style, 'active', now, now).run();
  return json({ ok: true, id });
}

/** the notes of a research as this person may see them (a private note of someone else: only that it is there) */
export async function visibleNotes(ctx: Ctx, a: Access) {
  const { results } = await ctx.env.DB.prepare(`SELECT x.id, x.email AS author, x.title, x.body, x.source_url, x.source_title, x.starred, x.updated_at, COALESCE(n.shared, 1) AS shared
      FROM research_notes n JOIN notes x ON x.email = COALESCE(n.note_email, n.email) AND x.id = n.note_id
      WHERE n.email = ? AND n.research_id = ? AND x.deleted = 0 ORDER BY n.sort, n.added_at`).bind(a.owner, a.r.id).all<any>();
  const who = await names(ctx, results.map((n) => n.author));
  return results.map((n) => {
    const v = S.noteView({ title: n.title, body: n.body, author: n.author, shared: !!n.shared }, a.me, who.get(n.author) || '');
    return { id: n.id, author: n.author, authorName: who.get(n.author) || '', mine: n.author === a.me, shared: !!n.shared, hidden: v.hidden, title: v.title, body: v.body,
      starred: !!n.starred && !v.hidden, source: !v.hidden && n.source_url ? { url: n.source_url, title: n.source_title || '' } : null, updatedAt: n.updated_at };
  });
}

/** GET /api/research/r/:id → the research, its notes (with their links and backlinks), threads, sources, members, comments
    and recent history, and this person's role */
export async function get(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id);
  const db = ctx.env.DB;
  const [notes, threads, sources, members, comments, history] = await Promise.all([
    visibleNotes(ctx, a),
    db.prepare('SELECT * FROM research_threads WHERE email = ? AND research_id = ? ORDER BY CASE status WHEN \'open\' THEN 0 WHEN \'parked\' THEN 1 ELSE 2 END, updated_at DESC').bind(a.owner, a.r.id).all<any>(),
    db.prepare('SELECT * FROM research_sources WHERE email = ? AND research_id = ? ORDER BY created_at').bind(a.owner, a.r.id).all<any>(),
    db.prepare('SELECT email, role, status, outside FROM research_members WHERE owner = ? AND research_id = ? ORDER BY created_at').bind(a.owner, a.r.id).all<any>(),
    db.prepare('SELECT * FROM research_comments WHERE owner = ? AND research_id = ? ORDER BY created_at').bind(a.owner, a.r.id).all<any>(),
    db.prepare('SELECT id, at, by, kind, item_id, action FROM research_history WHERE owner = ? AND research_id = ? ORDER BY at DESC LIMIT 60').bind(a.owner, a.r.id).all<any>(),
  ]);
  const who = await names(ctx, [a.owner, ...members.results.map((m) => m.email), ...comments.results.map((c) => c.by), ...history.results.map((h) => h.by)]);
  // links by title ([[…]]) among the notes this person sees: what each points to, and what points to it
  const seen = notes.filter((n) => !n.hidden);
  const byTitle = new Map(seen.map((n) => [n.title.trim(), n.id]));
  const titleOf = new Map(seen.map((n) => [n.id, n.title]));
  const out = new Map<string, string[]>(), back = new Map<string, string[]>();
  for (const n of seen) for (const t of C.linksIn(n.body)) { const to = byTitle.get(t); if (!to || to === n.id) continue; (out.get(n.id) || out.set(n.id, []).get(n.id)!).push(to); (back.get(to) || back.set(to, []).get(to)!).push(n.id); }
  const ref = (id: string) => ({ id, title: titleOf.get(id) || '' });
  const by = (e: string | null) => (e ? who.get(e) || e.split('@')[0] : null);
  const r = a.r;
  return json({
    research: { id: r.id, title: r.title, purpose: r.purpose, aim: r.aim || '', style: r.style, goalId: a.role === 'owner' ? r.goal_id || null : null, doneAt: r.done_at || null },
    role: a.role, roleName: S.ROLE_NAME[a.role], me: a.me, shared: members.results.length > 0,
    can: { add: S.can(a.role, 'add'), editAny: S.can(a.role, 'editAny'), restore: S.can(a.role, 'restore'), manage: S.can(a.role, 'manage'), invite: S.can(a.role, 'invite', { inviteAs: 'reader' }) },
    members: [{ email: a.owner, name: by(a.owner), role: 'owner', roleName: S.ROLE_NAME.owner, status: 'active', outside: false },
      ...members.results.map((m) => ({ email: m.email, name: by(m.email), role: m.role, roleName: S.ROLE_NAME[m.role as S.Role], status: m.status, outside: !!m.outside }))],
    notes: notes.map((n) => ({ ...n, links: n.hidden ? [] : (out.get(n.id) || []).map(ref), backlinks: n.hidden ? [] : (back.get(n.id) || []).map(ref), mayEdit: S.mayEdit(a.role, n.author, a.me) })),
    threads: threads.results.map((t) => ({ ...threadOut(t), by: by(t.created_by), mayEdit: S.mayEdit(a.role, t.created_by || null, a.me) })),
    sources: sources.results.map((s) => ({ ...sourceOut(s, r.style), by: by(s.created_by), mayEdit: S.mayEdit(a.role, s.created_by || null, a.me) })),
    comments: comments.results.map((c) => ({ id: c.id, on: c.on_kind, onId: c.on_id, by: by(c.by), mine: c.by === a.me, text: c.text, at: c.created_at })),
    history: history.results.map((h) => ({ id: h.id, at: h.at, by: by(h.by), kind: h.kind, itemId: h.item_id, action: h.action })),
    styles: C.STYLES,
  });
}
const sourceOut = (s: any, style: C.Style) => {
  const csl = JSON.parse(s.csl || '{}') as C.Csl;
  return { id: s.id, csl, doi: s.doi || null, oa: s.oa_url || null, retracted: !!s.retracted, cited: s.cited ?? null, note: s.note || '', reliability: s.reliability || null,
    cite: C.format(csl, style), inText: C.inText(csl, style), createdBy: s.created_by || null };
};

/** PUT /api/research/r/:id {title?, purpose?, aim?, style?} (the owner) · DELETE (kept as deleted; its notes stay in פתקים) */
export async function update(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id, 'settings');
  const d = await read(ctx, ResearchIn.partial());
  const sets: string[] = [], vals: unknown[] = [];
  for (const k of ['title', 'purpose', 'aim', 'style'] as const) if (d[k] !== undefined) { sets.push(`${k} = ?`); vals.push(d[k]); }
  if (sets.length) await ctx.env.DB.prepare(`UPDATE researches SET ${sets.join(', ')}, updated_at = ? WHERE email = ? AND id = ?`).bind(...vals, Date.now(), a.owner, a.r.id).run();
  return json({ ok: true });
}
export async function remove(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id, 'delete');
  await ctx.env.DB.prepare("UPDATE researches SET status = 'deleted', updated_at = ? WHERE email = ? AND id = ?").bind(Date.now(), a.owner, a.r.id).run();
  return json({ ok: true });
}

/* ---------------- notes in a research (the same note in each: a link, not a copy) ---------------- */

/** POST /api/research/r/:id/notes {noteId, share?} | {title, body} – one of my notes joins the research, or a new one is
    written there. In a shared research, a note of mine that was private asks first: 409 ask_share until share is given
    (true: the others see it; false: they see only that there is a note of mine there). */
export async function addNote(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id, 'add');
  const d = await read(ctx, z.object({ noteId: z.string().max(40).optional(), title: z.string().trim().max(200).optional(), body: z.string().max(50000).optional(), share: z.boolean().optional() }));
  const db = ctx.env.DB, now = Date.now();
  let noteId = d.noteId, shared = true;
  if (noteId) {
    const n = await db.prepare('SELECT id FROM notes WHERE email = ? AND id = ? AND deleted = 0').bind(a.me, noteId).first();
    if (!n) throw new HttpError(404, 'Not found');
    if (await isShared(ctx, a) || a.role !== 'owner') {
      if (d.share === undefined) throw new HttpError(409, 'ask_share');
      shared = d.share;
    }
  } else {
    if (!(d.title || '').trim() && !(d.body || '').trim()) throw new HttpError(400, 'Empty note');
    noteId = uid();
    await db.prepare('INSERT INTO notes (email, id, title, body, source_url, source_title, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 0)')
      .bind(a.me, noteId, (d.title || '').trim() || (d.body || '').trim().split(/\s+/).slice(0, 7).join(' ').slice(0, 60), (d.body || '').trim(), now, now).run();
  }
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO research_notes (email, research_id, note_id, sort, added_at, note_email, shared) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(a.owner, a.r.id, noteId, now, now, a.me, shared ? 1 : 0),
    // sorted out of the inbox once it is in a research
    db.prepare('UPDATE notes SET inbox = 0 WHERE email = ? AND id = ?').bind(a.me, noteId),
  ]);
  await log(ctx, a, 'note', noteId, 'add', null, { shared });
  await touch(ctx, a);
  return json({ ok: true, id: noteId });
}
async function linkedNote(ctx: Ctx, a: Access, noteId: string) {
  const n = await ctx.env.DB.prepare('SELECT x.*, COALESCE(n.note_email, n.email) AS author, COALESCE(n.shared, 1) AS shared FROM research_notes n JOIN notes x ON x.email = COALESCE(n.note_email, n.email) AND x.id = n.note_id WHERE n.email = ? AND n.research_id = ? AND n.note_id = ?')
    .bind(a.owner, a.r.id, noteId).first<any>();
  if (!n) throw new HttpError(404, 'Not found');
  return n;
}
/** PUT /api/research/r/:id/notes/:noteId {title?, body?} – a note in the research, by its author or an editor (the same note
    in its author's פתקים); a private note of someone else cannot be opened, nor changed */
export async function editNote(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id);
  const n = await linkedNote(ctx, a, ctx.params.noteId);
  if (!S.mayEdit(a.role, n.author, a.me) || (!n.shared && n.author !== a.me)) throw new HttpError(403, 'not_allowed');
  const d = await read(ctx, z.object({ title: z.string().trim().min(1).max(200).optional(), body: z.string().max(50000).optional() }));
  await ctx.env.DB.prepare('UPDATE notes SET title = COALESCE(?, title), body = COALESCE(?, body), updated_at = ? WHERE email = ? AND id = ?').bind(d.title ?? null, d.body ?? null, Date.now(), n.author, n.id).run();
  await log(ctx, a, 'note', n.id, 'edit', { title: n.title, body: n.body, author: n.author }, d);
  return json({ ok: true });
}
/** PUT /api/research/r/:id/notes/:noteId/share {shared} – only the note's author decides whether the others see it */
export async function shareNote(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id);
  const n = await linkedNote(ctx, a, ctx.params.noteId);
  if (n.author !== a.me) throw new HttpError(403, 'not_allowed');
  const { shared } = await read(ctx, z.object({ shared: z.boolean() }));
  await ctx.env.DB.prepare('UPDATE research_notes SET shared = ? WHERE email = ? AND research_id = ? AND note_id = ?').bind(shared ? 1 : 0, a.owner, a.r.id, n.id).run();
  await log(ctx, a, 'note', n.id, 'edit', { shared: !!n.shared }, { shared });
  return json({ ok: true });
}
/** DELETE /api/research/r/:id/notes/:noteId – out of this research (the note itself stays in its author's פתקים) */
export async function removeNote(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id);
  const n = await linkedNote(ctx, a, ctx.params.noteId);
  if (!S.mayEdit(a.role, n.author, a.me)) throw new HttpError(403, 'not_allowed');
  await ctx.env.DB.prepare('DELETE FROM research_notes WHERE email = ? AND research_id = ? AND note_id = ?').bind(a.owner, a.r.id, n.id).run();
  await log(ctx, a, 'note', n.id, 'remove', { author: n.author, shared: !!n.shared }, null);
  return json({ ok: true });
}
/** GET /api/research/of-note/:noteId → the researches a note of mine belongs to (for the notes page) */
export async function ofNote(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare("SELECT r.id, r.title FROM research_notes n JOIN researches r ON r.email = n.email AND r.id = n.research_id WHERE COALESCE(n.note_email, n.email) = ? AND n.note_id = ? AND r.status != 'deleted'")
    .bind(u.email, ctx.params.noteId).all<{ id: string; title: string }>();
  return json({ researches: results });
}

/* ---------------- questions and threads ---------------- */

const ThreadIn = z.object({ text: z.string().trim().min(1).max(1000).optional(), status: z.enum(['open', 'answered', 'parked']).optional(), answer: z.string().max(4000).optional(), noteId: z.string().max(40).nullable().optional() });
/** POST /api/research/r/:id/threads {text} */
export async function addThread(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id, 'add');
  const d = await read(ctx, ThreadIn);
  if (!d.text) throw new HttpError(400, 'Empty question');
  const id = uid(), now = Date.now();
  await ctx.env.DB.prepare('INSERT INTO research_threads (email, id, research_id, text, status, answer, note_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(a.owner, id, a.r.id, d.text, 'open', '', d.noteId || null, now, now, a.me).run();
  await log(ctx, a, 'thread', id, 'add', null, { text: d.text });
  await touch(ctx, a);
  return json({ ok: true, id });
}
/** PUT /api/research/threads/:id {text?, status?, answer?, noteId?} · DELETE – by its author, or an editor */
export async function editThread(ctx: Ctx) {
  const { row, a, mayEdit } = await item(ctx, 'research_threads', ctx.params.id);
  if (!mayEdit) throw new HttpError(403, 'not_allowed');
  const d = await read(ctx, ThreadIn);
  const sets: string[] = [], vals: unknown[] = [];
  if (d.text !== undefined) { sets.push('text = ?'); vals.push(d.text); }
  if (d.status !== undefined) { sets.push('status = ?'); vals.push(d.status); }
  if (d.answer !== undefined) { sets.push('answer = ?'); vals.push(d.answer); }
  if (d.noteId !== undefined) { sets.push('note_id = ?'); vals.push(d.noteId); }
  if (!sets.length) return json({ ok: true });
  await ctx.env.DB.prepare(`UPDATE research_threads SET ${sets.join(', ')}, updated_at = ? WHERE email = ? AND id = ?`).bind(...vals, Date.now(), a.owner, row.id).run();
  await log(ctx, a, 'thread', row.id, 'edit', { text: row.text, status: row.status, answer: row.answer }, d);
  return json({ ok: true });
}
export async function removeThread(ctx: Ctx) {
  const { row, a, mayEdit } = await item(ctx, 'research_threads', ctx.params.id);
  if (!mayEdit) throw new HttpError(403, 'not_allowed');
  await ctx.env.DB.prepare('DELETE FROM research_threads WHERE email = ? AND id = ?').bind(a.owner, row.id).run();
  await log(ctx, a, 'thread', row.id, 'remove', row, null);
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
  const a = await access(ctx, ctx.params.id, 'add');
  const d = await read(ctx, SourceIn);
  let csl: C.Csl, doi: string | null = null, oa: string | null = null, retracted = false, cited: number | null = null;
  if (d.doi) {
    doi = C.doiOf(d.doi);
    if (!doi) throw new HttpError(400, 'bad_doi');
    const dup = await ctx.env.DB.prepare('SELECT id FROM research_sources WHERE email = ? AND research_id = ? AND doi = ?').bind(a.owner, a.r.id, doi).first<{ id: string }>();
    if (dup) return json({ ok: true, id: dup.id, existed: true });
    ({ csl, oa, retracted, cited } = await lookupDoi(ctx, doi));
  } else if (d.csl) csl = d.csl as C.Csl;
  else throw new HttpError(400, 'Empty source');
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO research_sources (email, id, research_id, csl, doi, oa_url, retracted, cited, note, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(a.owner, id, a.r.id, JSON.stringify(csl), doi, oa, retracted ? 1 : 0, cited, d.note || '', Date.now(), a.me).run();
  await log(ctx, a, 'source', id, 'add', null, { title: csl.title });
  await touch(ctx, a);
  return json({ ok: true, id, source: sourceOut({ id, csl: JSON.stringify(csl), doi, oa_url: oa, retracted, cited, note: d.note || '' }, a.r.style) });
}
/** PUT /api/research/sources/:id {note?, reliability?} · DELETE – by whoever added it, or an editor */
export async function editSource(ctx: Ctx) {
  const { row, a, mayEdit } = await item(ctx, 'research_sources', ctx.params.id);
  if (!mayEdit) throw new HttpError(403, 'not_allowed');
  const d = await read(ctx, z.object({ note: z.string().max(2000).optional(), reliability: z.number().int().min(1).max(5).nullable().optional() }));
  const sets: string[] = [], vals: unknown[] = [];
  if (d.note !== undefined) { sets.push('note = ?'); vals.push(d.note); }
  if (d.reliability !== undefined) { sets.push('reliability = ?'); vals.push(d.reliability); }
  if (sets.length) await ctx.env.DB.prepare(`UPDATE research_sources SET ${sets.join(', ')} WHERE email = ? AND id = ?`).bind(...vals, a.owner, row.id).run();
  await log(ctx, a, 'source', row.id, 'edit', { note: row.note, reliability: row.reliability }, d);
  return json({ ok: true });
}
export async function removeSource(ctx: Ctx) {
  const { row, a, mayEdit } = await item(ctx, 'research_sources', ctx.params.id);
  if (!mayEdit) throw new HttpError(403, 'not_allowed');
  await ctx.env.DB.prepare('DELETE FROM research_sources WHERE email = ? AND id = ?').bind(a.owner, row.id).run();
  await log(ctx, a, 'source', row.id, 'remove', row, null);
  return json({ ok: true });
}

/* ---------------- members: invite, accept, roles ---------------- */

/** POST /api/research/r/:id/members {email, role} – the owner invites anyone (but another owner), an editor invites readers.
    Someone who is not in הָאֹהֶל cannot be invited (no mail goes out); a child is never added from outside the family; the
    invited person joins only by accepting it. */
export async function invite(ctx: Ctx) {
  const a0 = await access(ctx, ctx.params.id);
  const d = await read(ctx, z.object({ email: z.string().trim().toLowerCase().email().max(200), role: z.enum(['editor', 'contributor', 'reader']) }));
  if (!S.can(a0.role, 'invite', { inviteAs: d.role })) throw new HttpError(403, 'not_allowed');
  if (d.email === a0.owner || d.email === a0.me) throw new HttpError(400, 'already_in');
  const db = ctx.env.DB;
  const [who, owner] = await Promise.all([
    db.prepare('SELECT email, household FROM members WHERE email = ?').bind(d.email).first<{ email: string; household: string }>(),
    db.prepare('SELECT household FROM members WHERE email = ?').bind(a0.owner).first<{ household: string }>(),
  ]);
  if (!who) throw new HttpError(404, 'not_a_member');
  // (the members' age is not kept yet: when it is, inviteeChild and ownerChild come from there)
  const j = S.mayJoin({ sameHousehold: !!owner && who.household === owner.household, inviteeChild: false, ownerChild: false });
  if (!j.ok) throw new HttpError(403, j.why || 'not_allowed');
  const had = await db.prepare('SELECT status FROM research_members WHERE owner = ? AND research_id = ? AND email = ?').bind(a0.owner, a0.r.id, d.email).first<{ status: string }>();
  if (had) throw new HttpError(409, 'already_in');
  await db.prepare('INSERT INTO research_members (owner, research_id, email, role, status, outside, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(a0.owner, a0.r.id, d.email, d.role, 'invited', j.outside ? 1 : 0, a0.me, Date.now()).run();
  await log(ctx, a0, 'member', d.email, 'add', null, { role: d.role });
  return json({ ok: true, outside: j.outside });
}
/** POST /api/research/r/:id/join {accept} – the invited person accepts (joins) or declines (the invitation goes) */
export async function join(ctx: Ctx) {
  const u = requireUser(ctx);
  const { accept } = await read(ctx, z.object({ accept: z.boolean() }));
  const m = await ctx.env.DB.prepare("SELECT * FROM research_members WHERE research_id = ? AND email = ? AND status = 'invited'").bind(ctx.params.id, u.email).first<any>();
  if (!m) throw new HttpError(404, 'Not found');
  if (accept) await ctx.env.DB.prepare("UPDATE research_members SET status = 'active' WHERE owner = ? AND research_id = ? AND email = ?").bind(m.owner, m.research_id, u.email).run();
  else await ctx.env.DB.prepare('DELETE FROM research_members WHERE owner = ? AND research_id = ? AND email = ?').bind(m.owner, m.research_id, u.email).run();
  return json({ ok: true });
}
/** PUT /api/research/r/:id/members/:email {role} – the owner changes a role · DELETE – the owner removes, or a member leaves */
export async function setRole(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id, 'manage');
  const { role } = await read(ctx, z.object({ role: z.enum(['editor', 'contributor', 'reader']) }));
  const email = decodeURIComponent(ctx.params.email).toLowerCase();
  const r = await ctx.env.DB.prepare('UPDATE research_members SET role = ? WHERE owner = ? AND research_id = ? AND email = ?').bind(role, a.owner, a.r.id, email).run();
  if (!r.meta.changes) throw new HttpError(404, 'Not found');
  await log(ctx, a, 'member', email, 'edit', null, { role });
  return json({ ok: true });
}
export async function removeMember(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id);
  const email = decodeURIComponent(ctx.params.email).toLowerCase();
  if (email !== a.me && !S.can(a.role, 'manage')) throw new HttpError(403, 'not_allowed');
  await ctx.env.DB.prepare('DELETE FROM research_members WHERE owner = ? AND research_id = ? AND email = ?').bind(a.owner, a.r.id, email).run();
  await log(ctx, a, 'member', email, 'remove', null, null);
  return json({ ok: true });
}

/* ---------------- comments: everyone in the research ---------------- */

/** POST /api/research/r/:id/comments {on, onId, text} · DELETE /api/research/comments/:id (its writer, or an editor) */
export async function comment(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id, 'comment');
  const d = await read(ctx, z.object({ on: z.enum(['research', 'note', 'thread', 'source', 'draft']), onId: z.string().max(40).default(''), text: z.string().trim().min(1).max(2000) }));
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO research_comments (owner, research_id, id, on_kind, on_id, by, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(a.owner, a.r.id, id, d.on, d.onId, a.me, d.text, Date.now()).run();
  return json({ ok: true, id });
}
export async function removeComment(ctx: Ctx) {
  const u = requireUser(ctx);
  const c = await ctx.env.DB.prepare('SELECT * FROM research_comments WHERE id = ?').bind(ctx.params.id).first<any>();
  if (!c) throw new HttpError(404, 'Not found');
  const a = await access(ctx, c.research_id);
  if (a.owner !== c.owner || (c.by !== u.email && !S.can(a.role, 'editAny'))) throw new HttpError(403, 'not_allowed');
  await ctx.env.DB.prepare('DELETE FROM research_comments WHERE owner = ? AND id = ?').bind(c.owner, c.id).run();
  return json({ ok: true });
}

/* ---------------- the history, and restoring from it (an editor) ---------------- */

/** POST /api/research/history/:id/restore – back to how it was before that change: a thread or a source brought back, a
    note's or a draft's text as it was, a note's sharing as it was */
export async function restore(ctx: Ctx) {
  requireUser(ctx);
  const h = await ctx.env.DB.prepare('SELECT * FROM research_history WHERE id = ?').bind(ctx.params.id).first<any>();
  if (!h) throw new HttpError(404, 'Not found');
  const a = await access(ctx, h.research_id, 'restore');
  if (a.owner !== h.owner) throw new HttpError(404, 'Not found');
  const before = h.before ? JSON.parse(h.before) : null, db = ctx.env.DB;
  if (!before) throw new HttpError(400, 'nothing_to_restore');
  if (h.kind === 'thread' && h.action === 'remove') {
    const t = before;
    await db.prepare('INSERT OR IGNORE INTO research_threads (email, id, research_id, text, status, answer, note_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(a.owner, t.id, a.r.id, t.text, t.status, t.answer || '', t.note_id || null, t.created_at, Date.now(), t.created_by || null).run();
  } else if (h.kind === 'thread') {
    await db.prepare('UPDATE research_threads SET text = ?, status = ?, answer = ?, updated_at = ? WHERE email = ? AND id = ?').bind(before.text, before.status, before.answer || '', Date.now(), a.owner, h.item_id).run();
  } else if (h.kind === 'source' && h.action === 'remove') {
    const s = before;
    await db.prepare('INSERT OR IGNORE INTO research_sources (email, id, research_id, csl, doi, oa_url, retracted, cited, note, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(a.owner, s.id, a.r.id, s.csl, s.doi, s.oa_url, s.retracted || 0, s.cited ?? null, s.note || '', s.created_at, s.created_by || null).run();
  } else if (h.kind === 'source') {
    await db.prepare('UPDATE research_sources SET note = ?, reliability = ? WHERE email = ? AND id = ?').bind(before.note || '', before.reliability ?? null, a.owner, h.item_id).run();
  } else if (h.kind === 'note' && h.action === 'remove') {
    await db.prepare('INSERT OR IGNORE INTO research_notes (email, research_id, note_id, sort, added_at, note_email, shared) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(a.owner, a.r.id, h.item_id, Date.now(), Date.now(), before.author, before.shared ? 1 : 0).run();
  } else if (h.kind === 'note' && 'shared' in before) {
    // a note's sharing is its author's to decide: an editor cannot reopen what its author closed
    throw new HttpError(403, 'not_allowed');
  } else if (h.kind === 'note') {
    await db.prepare('UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE email = ? AND id = ?').bind(before.title, before.body, Date.now(), before.author, h.item_id).run();
  } else if (h.kind === 'draft') {
    await db.prepare('UPDATE research_drafts SET title = ?, body = ?, updated_at = ? WHERE email = ? AND id = ?').bind(before.title, before.body, Date.now(), a.owner, h.item_id).run();
  } else throw new HttpError(400, 'nothing_to_restore');
  await log(ctx, a, h.kind, h.item_id, 'restore', null, { from: h.id });
  return json({ ok: true });
}

/* ---------------- export ---------------- */

/** GET /api/research/r/:id/export?format=md|bib – the research as Markdown (purpose, notes, open questions, bibliography),
    or its sources as BibTeX (for Zotero, Mendeley and LaTeX); only what this person may see */
export async function exportResearch(ctx: Ctx) {
  const a = await access(ctx, ctx.params.id);
  const r = a.r;
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
  const notes = data.notes.filter((n: any) => !n.hidden);
  if (notes.length) { lines.push('## פתקים', ''); for (const n of notes) lines.push(`### ${n.title}`, '', n.body, n.source ? `\nמקור: [${n.source.title || n.source.url}](${n.source.url})` : '', ''); }
  const open = data.threads.filter((t: any) => t.status !== 'answered');
  if (open.length) { lines.push('## שאלות פתוחות', ''); for (const t of open) lines.push(`- ${t.text}${t.status === 'parked' ? ' (מושהית)' : ''}`); lines.push(''); }
  const answered = data.threads.filter((t: any) => t.status === 'answered');
  if (answered.length) { lines.push('## שאלות שנענו', ''); for (const t of answered) lines.push(`- **${t.text}** ${t.answer}`); lines.push(''); }
  if (data.sources.length) { lines.push('## ביבליוגרפיה', ''); for (const s of [...data.sources].sort((a2: any, b: any) => a2.cite.localeCompare(b.cite))) lines.push(`- ${s.cite}`); lines.push(''); }
  return new Response(lines.filter((l, i, arr) => l || arr[i - 1]).join('\n'), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.md` } });
}
