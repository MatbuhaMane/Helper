// Notes (פתקים): each person's own notes, dated, with a title the helper writes when none was given.
// Anything marked on the site (an article, a recipe, a song…) can be saved as a note, with where it came from.
// Rich notes (notes-rich.ts): `rich` is the note with its formatting, cleaned to a strict allowlist here on every save;
// `body` is always its plain text, which search, tags, titles and the research read. A note with no formatting has no rich.
// Without AI (docs/ai/without-ai.md #12): the title is the note's first real line, and its #words are its tags (notes-plain.ts).

import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, DRIVE_FILE_SCOPE, HttpError, body, googleAccessToken, json, requireUser, uid } from './core';
import { plainTitle, tagsOf } from './notes-plain';
import { cleanRich } from './notes-rich';

const toNote = (r: any) => ({ id: r.id, title: r.title, body: r.body, rich: r.rich || null, tags: tagsOf(r.body), source: r.source_url ? { url: r.source_url, title: r.source_title || '' } : null, starred: !!r.starred, drive: r.drive_id ? { at: r.drive_at } : null, createdAt: r.created_at, updatedAt: r.updated_at });

/** A short title for a note: by the AI when it can (a few words, in the note's language), else its first real line. */
async function titleFor(ctx: Ctx, text: string, source?: { url?: string | null; title?: string | null } | null): Promise<string> {
  const first = plainTitle(text, source);
  if (!ctx.env.GEMINI_API_KEY && !ctx.env.ANTHROPIC_API_KEY) return first;
  try {
    const r = await aiJson(ctx.env, {
      system: 'You title notes for a Hebrew-speaking family. Reply with a short, specific title (2–6 words) in Hebrew – unless the note itself is written in another language (formulas, numbers and calculations are not a language). No quotes, no final period.',
      prompt: text.slice(0, 2000), schema: z.object({ title: z.string() }), prefer: 'gemini', fast: true,
    });
    return (r.title || first).trim().slice(0, 80) || first;
  } catch { return first; }
}

export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT * FROM notes WHERE email = ? AND deleted = 0 ORDER BY updated_at DESC LIMIT 1000').bind(u.email).all();
  return json({ notes: results.map(toNote) });
}

const Input = z.object({
  title: z.string().max(200).optional(), body: z.string().max(50000).optional(),
  rich: z.string().max(200000).optional(),   // the formatted note (allowlist HTML), cleaned again here; its text becomes the body
  source: z.object({ url: z.string().max(1000), title: z.string().max(300).optional() }).nullable().optional(),
  starred: z.boolean().optional(),
  inbox: z.boolean().optional(),   // captured from anywhere (/capture/): waits in the research assistant's inbox
});
/** the formatted note, cleaned: its plain text, and its HTML only when it has formatting (else the note stays plain) */
function richOf(d: { rich?: string }) {
  if (d.rich === undefined) return null;
  const c = cleanRich(d.rich);
  if (c.text.length > 50000) throw new HttpError(400, 'Invalid note');
  return { text: c.text, rich: c.formatted ? c.html : null };
}

export async function create(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = Input.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid note');
  const r = richOf(p.data);
  const text = r ? r.text : (p.data.body || '').trim();
  const rich = r?.rich ?? null;
  const title = (p.data.title || '').trim() || (text ? await titleFor(ctx, text, p.data.source) : 'פתק חדש');
  const now = Date.now(), id = uid();
  await ctx.env.DB.prepare('INSERT INTO notes (email, id, title, body, rich, source_url, source_title, created_at, updated_at, deleted, inbox) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)')
    .bind(u.email, id, title, text, rich, p.data.source?.url || null, p.data.source?.title || null, now, now, p.data.inbox ? 1 : 0).run();
  return json({ note: { id, title, body: text, rich, tags: tagsOf(text), source: p.data.source || null, createdAt: now, updatedAt: now } });
}

export async function update(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = Input.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid note');
  const row = await ctx.env.DB.prepare('SELECT * FROM notes WHERE email = ? AND id = ? AND deleted = 0').bind(u.email, ctx.params.id).first<any>();
  if (!row) throw new HttpError(404, 'Not found');
  // a star alone (vision batch 4, item 5): the note itself and its date stay as they were
  if (p.data.starred !== undefined && p.data.body === undefined && p.data.rich === undefined && p.data.title === undefined) {
    await ctx.env.DB.prepare('UPDATE notes SET starred = ? WHERE email = ? AND id = ?').bind(p.data.starred ? 1 : 0, u.email, ctx.params.id).run();
    return json({ note: toNote({ ...row, starred: p.data.starred }) });
  }
  const r = richOf(p.data);
  const text = r ? r.text : p.data.body ?? row.body;
  // a plain body alone (the calculator's pad, an older page) replaces the formatted note too
  const rich = r ? r.rich : p.data.body !== undefined ? null : row.rich ?? null;
  let title = p.data.title ?? row.title;
  // a note that had no words yet gets its title once it has some
  if (!String(title).trim() || (title === 'פתק חדש' && text.trim() && p.data.title === undefined)) title = text.trim() ? await titleFor(ctx, text) : 'פתק חדש';
  const now = Date.now();
  await ctx.env.DB.prepare('UPDATE notes SET title = ?, body = ?, rich = ?, updated_at = ? WHERE email = ? AND id = ?').bind(title, text, rich, now, u.email, ctx.params.id).run();
  return json({ note: toNote({ ...row, title, body: text, rich, updated_at: now }) });
}

export async function remove(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('UPDATE notes SET deleted = 1, updated_at = ? WHERE email = ? AND id = ?').bind(Date.now(), u.email, ctx.params.id).run();
  return json({ ok: true });
}

/* ---------------- a note in the person's own Google Drive (vision batch 4, item 5) ----------------
   With the drive.file scope only: the helper sees nothing in Drive but the files it made itself. The grant is the
   person's own, asked for the first time they save a note there (/api/auth/login?drive=1, core.ts), and its token is the
   sealed one in google_tokens. A note becomes a Google Doc in a folder "האוהל · פתקים"; saving again updates the same Doc. */

const FOLDER = 'האוהל · פתקים';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

async function hasDrive(ctx: Ctx, email: string) {
  const row = await ctx.env.DB.prepare('SELECT scope FROM google_tokens WHERE email = ?').bind(email).first<{ scope: string | null }>();
  return !!row?.scope?.includes(DRIVE_FILE_SCOPE);
}

/** GET /api/notes/drive – may this person's notes go to their Drive yet */
export async function driveStatus(ctx: Ctx) {
  const u = requireUser(ctx);
  return json({ connected: await hasDrive(ctx, u.email) });
}

/** the folder the helper made (drive.file sees only those), or a new one */
async function folderId(token: string, folder = FOLDER): Promise<string> {
  const q = encodeURIComponent(`name = '${folder.replace(/'/g, '')}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const found = await fetch(`${DRIVE}?q=${q}&fields=files(id)&pageSize=1`, { headers: { authorization: `Bearer ${token}` } });
  if (found.ok) { const id = ((await found.json()) as { files: { id: string }[] }).files[0]?.id; if (id) return id; }
  const made = await fetch(`${DRIVE}?fields=id`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: folder, mimeType: 'application/vnd.google-apps.folder' }) });
  if (!made.ok) throw new HttpError(502, `drive_error_${made.status}`);
  return ((await made.json()) as { id: string }).id;
}

/** the note as a Doc: its metadata and its text, in one multipart request */
function multipart(meta: Record<string, unknown>, text: string, mime = 'text/plain') {
  const b = 'helper' + uid();
  return { type: `multipart/related; boundary=${b}`,
    body: `--${b}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\ncontent-type: ${mime}; charset=UTF-8\r\n\r\n${text}\r\n--${b}--` };
}

/** a Google Doc in the person's Drive, made or (with its id) updated: the notes' and the research drafts' way (drive.file;
    the person's own grant, asked for the first time – 409 drive_not_connected until then). HTML becomes a formatted Doc. */
export async function saveToDrive(ctx: Ctx, email: string, f: { id?: string | null; name: string; content: string; html?: boolean; folder?: string }) {
  if (!(await hasDrive(ctx, email))) throw new HttpError(409, 'drive_not_connected');
  let token: string;
  try { token = await googleAccessToken(ctx.env, email); } catch { throw new HttpError(409, 'drive_not_connected'); }
  const auth = { authorization: `Bearer ${token}` }, mime = f.html ? 'text/html' : 'text/plain';
  if (f.id) {
    const m = multipart({ name: f.name }, f.content, mime);
    const r = await fetch(`${UPLOAD}/${encodeURIComponent(f.id)}?uploadType=multipart&fields=id,webViewLink`, { method: 'PATCH', headers: { ...auth, 'content-type': m.type }, body: m.body });
    if (r.ok) return (await r.json()) as { id: string; webViewLink: string };
    if (r.status !== 404) throw new HttpError(502, `drive_error_${r.status}`);    // 404: the person deleted it – a new one
  }
  const m = multipart({ name: f.name, mimeType: 'application/vnd.google-apps.document', parents: [await folderId(token, f.folder)] }, f.content, mime);
  const r = await fetch(`${UPLOAD}?uploadType=multipart&fields=id,webViewLink`, { method: 'POST', headers: { ...auth, 'content-type': m.type }, body: m.body });
  if (!r.ok) throw new HttpError(502, `drive_error_${r.status}`);
  return (await r.json()) as { id: string; webViewLink: string };
}

/** POST /api/notes/:id/drive → { url } – the note saved (or saved again) as a Google Doc in the person's Drive */
export async function toDrive(ctx: Ctx) {
  const u = requireUser(ctx);
  const row = await ctx.env.DB.prepare('SELECT * FROM notes WHERE email = ? AND id = ? AND deleted = 0').bind(u.email, ctx.params.id).first<any>();
  if (!row) throw new HttpError(404, 'Not found');
  const text = `${row.title}\n\n${row.body}${row.source_url ? `\n\n${row.source_title || 'המקור'}: ${row.source_url}` : ''}`;
  // a formatted note goes as HTML (cleaned once more), so its bold, italics, underline and strikethrough reach the Doc
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const content = row.rich
    ? `<h1>${esc(row.title)}</h1>${cleanRich(row.rich).html}${row.source_url ? `<p>${esc(row.source_title || 'המקור')}: ${esc(row.source_url)}</p>` : ''}`
    : text;
  const file = await saveToDrive(ctx, u.email, { id: row.drive_id, name: row.title, content, html: !!row.rich });
  await ctx.env.DB.prepare('UPDATE notes SET drive_id = ?, drive_at = ? WHERE email = ? AND id = ?').bind(file.id, Date.now(), u.email, row.id).run();
  return json({ url: file.webViewLink, id: file.id });
}
