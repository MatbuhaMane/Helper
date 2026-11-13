/* עץ מבנה: the owner's layer over the hub's menus, and the surprise eggs (rules in server/layout-rules.ts).
   - GET  /api/layout                          the current layout, for every page (public: it is only menu names)
   - GET  /api/admin/layout                    the current one and the versions (owner)
   - PUT  /api/admin/layout {layout, note}     publish a new version (owner)
   - POST /api/admin/layout/restore/:id        publish an old version again, as a new one (owner)
   - GET  /api/eggs?page=/food/                the live eggs on that page the person has not found yet
   - POST /api/eggs/:id/found                  found it (once a person)
   - GET  /api/admin/eggs                      every egg, with how many found it and who (owner)
   - POST /api/admin/eggs · PUT|DELETE /api/admin/eggs/:id                                (owner)
   Writing is the owner's only, from the owner's own account in the opened back door. */
import { Ctx, HttpError, body, json, requireOwner, requireUser, uid } from './core';
import { log, requireAdmin } from './admin';
import { LayoutError, cleanEgg, eggLive, eggState, pageOf, sanitizeLayout } from './layout-rules';

const owner = async (ctx: Ctx) => { requireOwner(ctx); return requireAdmin(ctx, 'own'); };
const bad = (e: unknown) => { if (e instanceof LayoutError) throw new HttpError(400, e.code); throw e; };

interface Row { id: number; json: string; by_email: string | null; at: number; note: string | null }
async function current(ctx: Ctx): Promise<Row | null> {
  return ctx.env.DB.prepare('SELECT id, json, by_email, at, note FROM site_layout ORDER BY id DESC LIMIT 1').first<Row>();
}
/** a stored layout as the pages get it; one that does not read (it should not happen) is no layout: the code's own menus */
const parsed = (r: Row | null) => { if (!r) return null; try { return sanitizeLayout(r.json); } catch { return null; } };

export async function get(ctx: Ctx): Promise<Response> {
  const r = await current(ctx);
  return json({ v: r?.id || 0, layout: parsed(r) }, 200, { 'cache-control': 'public, max-age=60' });
}

export async function adminGet(ctx: Ctx): Promise<Response> {
  await owner(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT id, by_email, at, note FROM site_layout ORDER BY id DESC LIMIT 30').all();
  const r = await current(ctx);
  return json({ v: r?.id || 0, layout: parsed(r), versions: results });
}

async function publish(ctx: Ctx, input: unknown, note: string) {
  const a = await owner(ctx);
  let layout;
  try { layout = sanitizeLayout(input); } catch (e) { bad(e); }
  const r = await ctx.env.DB.prepare('INSERT INTO site_layout (json, by_email, at, note) VALUES (?, ?, ?, ?)')
    .bind(JSON.stringify(layout), a.by, Date.now(), note.slice(0, 120) || null).run();
  log(ctx, a, 'layout', note);
  return json({ ok: true, v: r.meta.last_row_id, layout });
}

export async function put(ctx: Ctx): Promise<Response> {
  const b = await body<{ layout?: unknown; note?: unknown }>(ctx.req);
  return publish(ctx, b.layout, typeof b.note === 'string' ? b.note.trim() : '');
}

export async function restore(ctx: Ctx): Promise<Response> {
  await owner(ctx);
  const r = await ctx.env.DB.prepare('SELECT id, json, by_email, at, note FROM site_layout WHERE id = ?').bind(+ctx.params.id || 0).first<Row>();
  if (!r) throw new HttpError(404, 'not_found');
  return publish(ctx, r.json, `שחזור של גרסה ${r.id}`);
}

/* ---------- the eggs ---------- */
interface EggRow { id: string; page: string; text: string; kind: string; link: string | null; starts: number | null; ends: number | null; active: number; x: number; y: number; created_at: number }

export async function eggsHere(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const page = pageOf(new URL(ctx.req.url).searchParams.get('page'));
  if (!page) return json({ eggs: [] });
  const { results } = await ctx.env.DB.prepare(
    'SELECT e.id, e.x, e.y, e.starts, e.ends, e.active FROM eggs e WHERE e.page = ? AND e.active = 1 AND NOT EXISTS (SELECT 1 FROM egg_finds f WHERE f.egg_id = e.id AND f.email = ?) LIMIT 5')
    .bind(page, u.email).all<EggRow>();
  const now = Date.now();
  // what is inside stays a surprise until it is found: only where it sits
  return json({ eggs: results.filter((e) => eggLive(e, now)).map((e) => ({ id: e.id, x: e.x, y: e.y })) });
}

export async function found(ctx: Ctx): Promise<Response> {
  const u = requireUser(ctx);
  const e = await ctx.env.DB.prepare('SELECT * FROM eggs WHERE id = ?').bind(ctx.params.id).first<EggRow>();
  if (!e || !eggLive(e, Date.now())) throw new HttpError(404, 'not_found');
  const r = await ctx.env.DB.prepare('INSERT OR IGNORE INTO egg_finds (egg_id, email, at) VALUES (?, ?, ?)').bind(e.id, u.email, Date.now()).run();
  return json({ text: e.text, kind: e.kind, link: e.link, first: !!r.meta.changes });
}

export async function adminEggs(ctx: Ctx): Promise<Response> {
  await owner(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT * FROM eggs ORDER BY created_at DESC LIMIT 100').all<EggRow>();
  const { results: finds } = await ctx.env.DB.prepare(
    'SELECT f.egg_id, f.at, COALESCE(m.he_name, m.name, f.email) AS who FROM egg_finds f LEFT JOIN members m ON m.email = f.email ORDER BY f.at')
    .all<{ egg_id: string; at: number; who: string }>();
  const now = Date.now();
  return json({ eggs: results.map((e) => {
    const by = finds.filter((f) => f.egg_id === e.id);
    return { ...e, active: !!e.active, state: eggState(e, now), count: by.length, finders: by.map((f) => ({ who: f.who, at: f.at })) };
  }) });
}

async function saveEgg(ctx: Ctx, id: string | null) {
  const a = await owner(ctx);
  let e;
  try { e = cleanEgg(await body(ctx.req), Date.now()); } catch (x) { bad(x); }
  if (!e) throw new HttpError(400, 'bad_value');
  if (id) {
    const r = await ctx.env.DB.prepare('UPDATE eggs SET page = ?, text = ?, kind = ?, link = ?, starts = ?, ends = ?, active = ?, x = ?, y = ? WHERE id = ?')
      .bind(e.page, e.text, e.kind, e.link, e.starts, e.ends, e.active ? 1 : 0, e.x, e.y, id).run();
    if (!r.meta.changes) throw new HttpError(404, 'not_found');
  } else {
    id = uid();
    await ctx.env.DB.prepare('INSERT INTO eggs (id, page, text, kind, link, starts, ends, active, x, y, created_at, by_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, e.page, e.text, e.kind, e.link, e.starts, e.ends, e.active ? 1 : 0, e.x, e.y, Date.now(), a.by).run();
  }
  log(ctx, a, 'egg', `${id} ${e.page}`);
  return json({ ok: true, id });
}
export const eggAdd = (ctx: Ctx) => saveEgg(ctx, null);
export const eggPut = (ctx: Ctx) => saveEgg(ctx, ctx.params.id);
export async function eggDelete(ctx: Ctx): Promise<Response> {
  const a = await owner(ctx);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM egg_finds WHERE egg_id = ?').bind(ctx.params.id),
    ctx.env.DB.prepare('DELETE FROM eggs WHERE id = ?').bind(ctx.params.id),
  ]);
  log(ctx, a, 'egg-delete', ctx.params.id);
  return json({ ok: true });
}
