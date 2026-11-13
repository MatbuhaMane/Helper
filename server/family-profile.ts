// פרופיל המשפחה (docs/vision/family-profile.md): what a household publishes about itself. Every read goes through the
// view filter in family-profile-rules.ts (default: the household only; a head may open it to the tribe or by an
// invitation link; it never widens an item's own privacy). Heads edit; other members suggest and a head approves.

import { Ctx, HttpError, Member, body, json, requireUser, uid } from './core';
import { b64url, fingerprint } from './vault/crypto';
import { auditProfile, profilePeople, rolesOf } from './vault';
import * as R from './family-profile-rules';

interface Row {
  household: string; line: string; cover: string; cover_own: number; origins: string; traditions: string; dishes: string;
  open_tribe: number; link_hash: string | null; updated_at: number;
}
const parse = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
const MAX_COVER = 2_500_000;
const coverKey = (house: string) => `profile/${house}/cover`;

async function titleOf(ctx: Ctx, house: string) {
  return (await ctx.env.DB.prepare('SELECT title FROM family_households WHERE id = ?').bind(house).first<{ title: string }>())?.title || '';
}
async function load(ctx: Ctx, house: string): Promise<{ s: R.Stored; row: Row | null }> {
  const [row, title] = await Promise.all([
    ctx.env.DB.prepare('SELECT * FROM family_profiles WHERE household = ?').bind(house).first<Row>(),
    titleOf(ctx, house),
  ]);
  if (!row) return { s: R.blank(title), row: null };
  return {
    row,
    s: {
      title, line: row.line, cover: (R.COVERS as readonly string[]).includes(row.cover) || row.cover === 'own' ? (row.cover as R.Cover) : 'olive',
      coverOwn: !!row.cover_own, origins: parse(row.origins, []), traditions: row.traditions, dishes: parse(row.dishes, []),
      open: { tribe: !!row.open_tribe, link: !!row.link_hash },
    },
  };
}
async function store(ctx: Ctx, u: Member, house: string, s: R.Stored, before: R.Stored) {
  const now = Date.now();
  await ctx.env.DB.prepare(`INSERT INTO family_profiles (household, line, cover, cover_own, origins, traditions, dishes, open_tribe, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(household) DO UPDATE SET line = excluded.line, cover = excluded.cover, cover_own = excluded.cover_own,
      origins = excluded.origins, traditions = excluded.traditions, dishes = excluded.dishes, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(house, s.line, s.cover, s.coverOwn ? 1 : 0, JSON.stringify(s.origins), s.traditions, JSON.stringify(s.dishes), s.open.tribe ? 1 : 0, u.email, now).run();
  if (s.title && s.title !== before.title)
    await ctx.env.DB.prepare('INSERT INTO family_households (id, title, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_by = excluded.updated_by, updated_at = excluded.updated_at')
      .bind(house, s.title, u.email, now).run();
}
const linkHash = (ctx: Ctx, token: string) => fingerprint(ctx.env, 'profile-link:' + token);

/** which household's profile the request asks for, and how the viewer reaches it (404 when they may not) */
async function target(ctx: Ctx, u: Member): Promise<{ house: string; reach: R.Reach; s: R.Stored }> {
  const t = (ctx.url.searchParams.get('t') || '').slice(0, 64), h = (ctx.url.searchParams.get('h') || '').slice(0, 40);
  let house = u.household, linkOk = false;
  if (t) {
    const row = await ctx.env.DB.prepare('SELECT household FROM family_profiles WHERE link_hash = ?').bind(await linkHash(ctx, t)).first<{ household: string }>();
    if (!row) throw new HttpError(404, 'not_found');
    house = row.household; linkOk = true;
  } else if (h) house = h;
  const { s } = await load(ctx, house);
  const { bridges } = house === u.household ? { bridges: [] } : await profilePeople(ctx, house);
  const reach = R.reach(u.household, house, s.open, bridges, linkOk);
  if (!reach) throw new HttpError(404, 'not_found');            // the same answer as a household with no profile
  return { house, reach, s };
}

/** GET /api/family/profile[?t=link | ?h=household]: the profile as this viewer may see it */
export async function get(ctx: Ctx) {
  const u = requireUser(ctx);
  const { house, reach, s } = await target(ctx, u);
  const mine = reach === 'household';
  const [{ people }, head, recipes] = await Promise.all([
    profilePeople(ctx, house),
    mine ? rolesOf(ctx, u).then((r) => r.head) : Promise.resolve(false),
    mine && s.dishes.length
      ? ctx.env.DB.prepare(`SELECT id, title, image FROM recipes WHERE household = ? AND id IN (${s.dishes.map(() => '?').join(', ')})`).bind(house, ...s.dishes).all<R.RecipeIn>().then((r) => r.results)
      : Promise.resolve(s.dishes.map((id) => ({ id, title: '', image: null }))),   // outside, only that they exist (each a gap)
  ]);
  const shown = R.shape(s, reach, head, people, recipes);
  let suggestions: unknown[] = [];
  if (shown.head) {
    const { results } = await ctx.env.DB.prepare('SELECT s.id, s.email, s.patch, s.created_at, m.he_name, m.name FROM family_profile_suggestions s LEFT JOIN members m ON m.email = s.email WHERE s.household = ? ORDER BY s.created_at')
      .bind(house).all<{ id: string; email: string; patch: string; created_at: number; he_name: string | null; name: string | null }>();
    suggestions = results.map((r) => ({ id: r.id, by: r.he_name || r.name || r.email.split('@')[0], patch: parse(r.patch, {}), at: r.created_at }));
  }
  if (!mine) await auditProfile(ctx, house, u, reach);
  return json({ ...shown, coverUrl: s.cover === 'own' ? '/api/family/profile/cover' + ctx.url.search : null, covers: R.COVERS, suggestions });
}

/** PUT /api/family/profile {title, line, cover, origins, traditions, dishes}: a head saves; anyone else in the household suggests */
export async function save(ctx: Ctx) {
  const u = requireUser(ctx);
  const patch = R.cleanPatch(await body(ctx.req));
  if (!Object.keys(patch).length) throw new HttpError(400, 'nothing_to_save');
  if (!(await rolesOf(ctx, u)).head) {
    await ctx.env.DB.prepare('INSERT INTO family_profile_suggestions (id, household, email, patch, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(uid(), u.household, u.email, JSON.stringify(patch), Date.now()).run();
    return json({ ok: true, suggested: true });
  }
  const { s } = await load(ctx, u.household);
  await store(ctx, u, u.household, R.apply(s, patch), s);
  return json({ ok: true });
}

/** POST /api/family/profile/suggestions/:id {approve}: a head takes a suggestion in, or lets it go */
export async function decide(ctx: Ctx) {
  const u = requireUser(ctx);
  if (!(await rolesOf(ctx, u)).head) throw new HttpError(403, 'only_a_head');
  const row = await ctx.env.DB.prepare('SELECT patch FROM family_profile_suggestions WHERE id = ? AND household = ?').bind(ctx.params.id, u.household).first<{ patch: string }>();
  if (!row) throw new HttpError(404, 'not_found');
  if ((await body<{ approve?: boolean }>(ctx.req)).approve) {
    const { s } = await load(ctx, u.household);
    await store(ctx, u, u.household, R.apply(s, R.cleanPatch(parse(row.patch, {}))), s);
  }
  await ctx.env.DB.prepare('DELETE FROM family_profile_suggestions WHERE id = ?').bind(ctx.params.id).run();
  return json({ ok: true });
}

/** POST /api/family/profile/open {tribe?: boolean, link?: 'make' | 'remove'}: a head chooses who besides the household sees it.
    A new link is returned once (only its hash is kept); making one again replaces the old. */
export async function open(ctx: Ctx) {
  const u = requireUser(ctx);
  if (!(await rolesOf(ctx, u)).head) throw new HttpError(403, 'only_a_head');
  const b = await body<{ tribe?: boolean; link?: string }>(ctx.req);
  const { s } = await load(ctx, u.household);
  await store(ctx, u, u.household, { ...s, open: { ...s.open, tribe: typeof b.tribe === 'boolean' ? b.tribe : s.open.tribe } }, s);
  let token: string | null = null;
  if (b.link === 'make') {
    token = b64url(crypto.getRandomValues(new Uint8Array(18)));
    await ctx.env.DB.prepare('UPDATE family_profiles SET link_hash = ? WHERE household = ?').bind(await linkHash(ctx, token), u.household).run();
  } else if (b.link === 'remove') await ctx.env.DB.prepare('UPDATE family_profiles SET link_hash = NULL WHERE household = ?').bind(u.household).run();
  return json({ ok: true, link: token ? `/family/profile.html?t=${token}` : null });
}

/** PUT /api/family/profile/cover (the image itself, made small on the page): a head's own cover photo */
export async function coverPut(ctx: Ctx) {
  const u = requireUser(ctx);
  if (!(await rolesOf(ctx, u)).head) throw new HttpError(403, 'only_a_head');
  const type = (ctx.req.headers.get('content-type') || '').split(';')[0];
  if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new HttpError(415, 'image_only');
  const bytes = new Uint8Array(await ctx.req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_COVER) throw new HttpError(413, 'too_big');
  if (!ctx.env.MEDIA) throw new HttpError(503, 'no_storage');
  await ctx.env.MEDIA.put(coverKey(u.household), bytes, { httpMetadata: { contentType: type } });
  const { s } = await load(ctx, u.household);
  await store(ctx, u, u.household, { ...s, cover: 'own', coverOwn: true }, s);
  return json({ ok: true });
}

/** GET /api/family/profile/cover[?t= | ?h=]: the own cover photo, to whoever may open the profile */
export async function coverGet(ctx: Ctx) {
  const u = requireUser(ctx);
  const { house, s } = await target(ctx, u);
  const obj = s.coverOwn && ctx.env.MEDIA ? await ctx.env.MEDIA.get(coverKey(house)) : null;
  if (!obj) throw new HttpError(404, 'not_found');
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'image/jpeg', 'cache-control': 'private, no-store' } });
}
