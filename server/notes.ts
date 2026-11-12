// Notes (פתקים): each person's own notes, dated, with a title the helper writes when none was given.
// Anything marked on the site (an article, a recipe, a song…) can be saved as a note, with where it came from.

import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, HttpError, body, json, requireUser, uid } from './core';

const toNote = (r: any) => ({ id: r.id, title: r.title, body: r.body, source: r.source_url ? { url: r.source_url, title: r.source_title || '' } : null, starred: !!r.starred, createdAt: r.created_at, updatedAt: r.updated_at });

/** A short title for a note: by the AI when it can (a few words, in the note's language), else its first words. */
async function titleFor(ctx: Ctx, text: string): Promise<string> {
  const first = text.replace(/\s+/g, ' ').trim().split(' ').slice(0, 7).join(' ').slice(0, 60);
  if (!ctx.env.GEMINI_API_KEY && !ctx.env.ANTHROPIC_API_KEY) return first;
  try {
    const r = await aiJson(ctx.env, {
      system: 'You title notes for a Hebrew-speaking family. Reply with a short, specific title (2–6 words) in Hebrew – unless the note itself is written in another language (formulas, numbers and calculations are not a language). No quotes, no final period.',
      prompt: text.slice(0, 2000), schema: z.object({ title: z.string() }), prefer: 'gemini', fast: true,
    });
    return (r.title || first).trim().slice(0, 80) || first;
  } catch { return first || 'פתק'; }
}

export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT * FROM notes WHERE email = ? AND deleted = 0 ORDER BY updated_at DESC LIMIT 1000').bind(u.email).all();
  return json({ notes: results.map(toNote) });
}

const Input = z.object({
  title: z.string().max(200).optional(), body: z.string().max(50000).optional(),
  source: z.object({ url: z.string().max(1000), title: z.string().max(300).optional() }).nullable().optional(),
  starred: z.boolean().optional(),
});
export async function create(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = Input.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid note');
  const text = (p.data.body || '').trim();
  const title = (p.data.title || '').trim() || (text ? await titleFor(ctx, text) : 'פתק חדש');
  const now = Date.now(), id = uid();
  await ctx.env.DB.prepare('INSERT INTO notes (email, id, title, body, source_url, source_title, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)')
    .bind(u.email, id, title, text, p.data.source?.url || null, p.data.source?.title || null, now, now).run();
  return json({ note: { id, title, body: text, source: p.data.source || null, createdAt: now, updatedAt: now } });
}

export async function update(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = Input.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid note');
  const row = await ctx.env.DB.prepare('SELECT * FROM notes WHERE email = ? AND id = ? AND deleted = 0').bind(u.email, ctx.params.id).first<any>();
  if (!row) throw new HttpError(404, 'Not found');
  // a star alone (vision batch 4, item 5): the note itself and its date stay as they were
  if (p.data.starred !== undefined && p.data.body === undefined && p.data.title === undefined) {
    await ctx.env.DB.prepare('UPDATE notes SET starred = ? WHERE email = ? AND id = ?').bind(p.data.starred ? 1 : 0, u.email, ctx.params.id).run();
    return json({ note: toNote({ ...row, starred: p.data.starred }) });
  }
  const text = p.data.body ?? row.body;
  let title = p.data.title ?? row.title;
  // a note that had no words yet gets its title once it has some
  if (!String(title).trim() || (title === 'פתק חדש' && text.trim() && p.data.title === undefined)) title = text.trim() ? await titleFor(ctx, text) : 'פתק חדש';
  const now = Date.now();
  await ctx.env.DB.prepare('UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE email = ? AND id = ?').bind(title, text, now, u.email, ctx.params.id).run();
  return json({ note: toNote({ ...row, title, body: text, updated_at: now }) });
}

export async function remove(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('UPDATE notes SET deleted = 1, updated_at = ? WHERE email = ? AND id = ?').bind(Date.now(), u.email, ctx.params.id).run();
  return json({ ok: true });
}
