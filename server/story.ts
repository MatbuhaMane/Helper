// הסיפור המשפחתי (docs/vision/story.md): stories, recordings, readings, documents and photos, tagged with people of the
// tree, a date (even a rough one) and a place. Every read goes through the view filter in story-rules.ts.
// Sealed like the vault's items: titles, texts and places with the vault key, files only as ciphertext (vault/crypto.ts,
// vault/store.ts, used as they are). The household's own story opens like its tree (the tree lock, server/lock.ts).
// Storage: 2 GB a household; over it only new uploads stop, nothing is ever deleted for it.

import { Ctx, HttpError, Member, body, json, requireUser, uid } from './core';
import { decryptFile, encryptFile, newDataKey, openDataKey, seal, unseal } from './vault/crypto';
import { defaultStore, store, StoreName } from './vault/store';
import { distance, Distance } from './vault/kin';
import { auditProfile, profilePeople, rateLimit } from './vault';
import { treeOpen } from './lock';
import * as R from './story-rules';

interface Row {
  id: string; household: string; kind: string; level: string; owner_email: string;
  title_enc: string | null; text_enc: string | null; when_text: string; year: number | null; place_enc: string | null; people: string;
  mime: string | null; size: number | null; store: string | null; object_key: string | null; dek: string | null;
  created_at: number; updated_at: number; deleted_at: number | null;
}
const parse = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

async function stored(ctx: Ctx, r: Row): Promise<R.Stored> {
  const [title, text, place] = await Promise.all([
    unseal(ctx.env, r.title_enc, `story:${r.id}:title`), unseal(ctx.env, r.text_enc, `story:${r.id}:text`), unseal(ctx.env, r.place_enc, `story:${r.id}:place`),
  ]);
  return {
    id: r.id, household: r.household, kind: (R.KINDS as readonly string[]).includes(r.kind) ? (r.kind as R.Kind) : 'story',
    level: (R.LEVELS as readonly string[]).includes(r.level) ? (r.level as R.Level) : 'private',   // an unknown level: the strictest
    owner: r.owner_email, title, text, when: r.when_text, year: r.year, place, people: parse(r.people, []),
    mime: r.mime, size: r.size, hasFile: !!r.object_key, created: r.created_at, deleted: !!r.deleted_at,
  };
}

/** the household's own story opens like its tree; another household's only by its items' levels (no lock of ours on it) */
async function viewer(ctx: Ctx): Promise<{ u: Member; house: string; d: Distance }> {
  const u = requireUser(ctx);
  const h = (ctx.url.searchParams.get('h') || '').slice(0, 40);
  if (!h || h === u.household) {
    if (!(await treeOpen(ctx, u.email))) throw new HttpError(423, 'tree_locked');
    return { u, house: u.household, d: 'household' };
  }
  const { bridges } = await profilePeople(ctx, h);
  const d = distance(u.household, h, bridges);
  if (d === 'none') throw new HttpError(404, 'not_found');
  return { u, house: h, d };
}
const used = async (ctx: Ctx, house: string) =>
  (await ctx.env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM story_items WHERE household = ?').bind(house).first<{ n: number }>())?.n || 0;

/** the household's tree people ids (a tag must be one of them) */
async function treeIds(ctx: Ctx, house: string): Promise<Set<string>> {
  const { results } = await ctx.env.DB.prepare('SELECT id FROM family_people WHERE household = ? AND deleted_at IS NULL').bind(house).all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

/** GET /api/story[?h=household]: the collection as this viewer may see it, the questions, and (at home) the storage */
export async function list(ctx: Ctx) {
  const { u, house, d } = await viewer(ctx);
  const { results } = await ctx.env.DB.prepare(`SELECT * FROM story_items WHERE household = ? AND deleted_at IS NULL ${d === 'household' ? '' : "AND level = 'tribe'"} ORDER BY created_at`)
    .bind(house).all<Row>();
  const items = R.shapeAll(await Promise.all(results.map((r) => stored(ctx, r))), d, u.email);
  if (d !== 'household') { await auditProfile(ctx, house, u, 'story:' + d); return json({ items, mine: false }); }
  return json({ items, mine: true, questions: R.QUESTIONS, storage: { used: await used(ctx, house), quota: R.QUOTA } });
}

/** POST /api/story (multipart: kind, title, text, when, place, people (JSON), level, file?): a new item of this household */
export async function add(ctx: Ctx) {
  const u = requireUser(ctx);
  if (!(await treeOpen(ctx, u.email))) throw new HttpError(423, 'tree_locked');
  await rateLimit(ctx, 'story:' + u.email, 120, 3600e3);
  const form = await ctx.req.formData();
  const inp = R.cleanInput({
    kind: form.get('kind'), title: form.get('title') ?? '', text: form.get('text') ?? '', when: form.get('when') ?? '',
    place: form.get('place') ?? '', people: parse(String(form.get('people') || '[]'), []), level: form.get('level') || 'household',
  });
  if (!inp.kind) throw new HttpError(400, 'bad_kind');
  const ids = await treeIds(ctx, u.household);
  const people = (inp.people || []).filter((p) => ids.has(p));
  const id = uid(), now = Date.now();
  let mime: string | null = null, size: number | null = null, objectKey: string | null = null, dek: string | null = null, storeName: StoreName | null = null;
  const file = form.get('file') as unknown as File | null;
  if (file && typeof file === 'object' && 'arrayBuffer' in file && file.size) {
    if (!R.roomFor(await used(ctx, u.household), file.size)) throw new HttpError(file.size > R.MAX_FILE ? 413 : 507, file.size > R.MAX_FILE ? 'file_too_large' : 'storage_full');
    const bytes = new Uint8Array(await file.arrayBuffer());
    mime = R.fileType(inp.kind, bytes);
    if (!mime) throw new HttpError(415, 'file_type_not_allowed');
    size = bytes.length;
    const st = defaultStore(ctx.env);
    storeName = st.name;
    const k = await newDataKey(ctx.env, 'story:' + id);
    objectKey = `story/${u.household}/${id}`;
    await st.put(objectKey, await encryptFile(k.key, bytes, 'story:' + id));
    dek = k.wrapped;
    bytes.fill(0);
  } else if (inp.kind !== 'story' && !inp.text) throw new HttpError(400, 'file_required');
  if (inp.kind === 'story' && !inp.text && !inp.title) throw new HttpError(400, 'nothing_to_save');
  await ctx.env.DB.prepare(`INSERT INTO story_items (id, household, kind, level, owner_email, title_enc, text_enc, when_text, year, place_enc, people, mime, size, store, object_key, dek, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, u.household, inp.kind, inp.level || 'household', u.email, await seal(ctx.env, inp.title || '', `story:${id}:title`), await seal(ctx.env, inp.text || '', `story:${id}:text`),
      inp.when || '', R.yearOf(inp.when || ''), await seal(ctx.env, inp.place || '', `story:${id}:place`), JSON.stringify(people), mime, size, storeName, objectKey, dek, now, now).run();
  return json({ id });
}

async function own(ctx: Ctx): Promise<{ u: Member; row: Row; it: R.Stored }> {
  const u = requireUser(ctx);
  if (!(await treeOpen(ctx, u.email))) throw new HttpError(423, 'tree_locked');
  const row = await ctx.env.DB.prepare('SELECT * FROM story_items WHERE id = ? AND household = ?').bind(ctx.params.id, u.household).first<Row>();
  const it = row && (await stored(ctx, row));
  // someone else's private item, or a deleted one: as if it were not there
  if (!row || !it || (it.level === 'private' && it.owner !== u.email)) throw new HttpError(404, 'not_found');
  return { u, row, it };
}

/** PUT /api/story/:id {title, text, when, place, people, level}: the one who added it edits it (and alone sets its level) */
export async function save(ctx: Ctx) {
  const { u, row, it } = await own(ctx);
  if (it.owner !== u.email || it.deleted) throw new HttpError(403, 'only_who_added');
  const inp = R.cleanInput(await body(ctx.req));
  const ids = inp.people ? await treeIds(ctx, u.household) : null;
  const next = {
    title: inp.title ?? it.title, text: inp.text ?? it.text, when: inp.when ?? it.when, place: inp.place ?? it.place,
    people: inp.people ? inp.people.filter((p) => ids!.has(p)) : it.people, level: R.nextLevel(it, u.email, inp.level ?? it.level),
  };
  await ctx.env.DB.prepare('UPDATE story_items SET title_enc = ?, text_enc = ?, when_text = ?, year = ?, place_enc = ?, people = ?, level = ?, updated_at = ? WHERE id = ?')
    .bind(await seal(ctx.env, next.title, `story:${row.id}:title`), await seal(ctx.env, next.text, `story:${row.id}:text`), next.when, R.yearOf(next.when),
      await seal(ctx.env, next.place, `story:${row.id}:place`), JSON.stringify(next.people), next.level, Date.now(), row.id).run();
  return json({ ok: true });
}

/** DELETE /api/story/:id: the one who added it puts it aside (kept; the file stays, it can come back) */
export async function remove(ctx: Ctx) {
  const { u, row, it } = await own(ctx);
  if (it.owner !== u.email) throw new HttpError(403, 'only_who_added');
  await ctx.env.DB.prepare('UPDATE story_items SET deleted_at = ? WHERE id = ?').bind(Date.now(), row.id).run();
  return json({ ok: true });
}
/** POST /api/story/:id/restore */
export async function restore(ctx: Ctx) {
  const { u, row, it } = await own(ctx);
  if (it.owner !== u.email) throw new HttpError(403, 'only_who_added');
  await ctx.env.DB.prepare('UPDATE story_items SET deleted_at = NULL WHERE id = ?').bind(row.id).run();
  return json({ ok: true });
}

/** GET /api/story/:id/file: the file, decrypted, for one who may see it (at home only; never cached, never run) */
export async function file(ctx: Ctx) {
  const { u, row, it } = await own(ctx);
  if (!R.fileShows(it, 'household', u.email) || !row.object_key || !row.dek) throw new HttpError(404, 'not_found');
  const key = await openDataKey(ctx.env, row.dek, 'story:' + row.id);
  const bytes = await decryptFile(key, await store(ctx.env, (row.store as StoreName) || 'r2').get(row.object_key), 'story:' + row.id);
  return new Response(bytes, { headers: {
    'content-type': row.mime || 'application/octet-stream', 'content-length': String(bytes.length),
    'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'", 'cross-origin-resource-policy': 'same-origin',
  } });
}
