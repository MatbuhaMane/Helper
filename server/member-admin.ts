// Editing the family's members from the owner's room (the חברים section of public/admin/admin.js): the list of a household,
// a search across every household, and one edit (name, Hebrew name, household, role). The rules are in member-admin-rules.ts.
// Every call needs the app's owner with the room open from their own account (admin.requireAdmin 'own'); changing a role or a
// household also needs the room opened by an OWNER_EMAIL address (not a super). Every change goes to the room's audit log.

import { Ctx, HttpError, body, json, requireOwner, uid } from './core';
import * as admin from './admin';
import * as R from './member-admin-rules';

interface Row { email: string; name: string | null; he_name: string | null; household: string; role: string; birth_year: number | null; first_seen: number | null; approved_at: number | null }
const COLS = 'email, name, he_name, household, role, birth_year, first_seen, approved_at';

async function gate(ctx: Ctx) {
  requireOwner(ctx);
  return admin.requireAdmin(ctx, 'own');
}

async function headsOf(ctx: Ctx): Promise<Map<string, string[]>> {
  const { results } = await ctx.env.DB.prepare("SELECT household, email FROM family_roles WHERE role = 'head'").all<{ household: string; email: string }>();
  const m = new Map<string, string[]>();
  for (const r of results) m.set(r.email, [...(m.get(r.email) || []), r.household]);
  return m;
}
/** every household: those members live in and those that have a name, with the name and how many live there */
async function households(ctx: Ctx) {
  const [{ results: used }, { results: named }] = await Promise.all([
    ctx.env.DB.prepare('SELECT household AS id, COUNT(*) AS n FROM members GROUP BY household').all<{ id: string; n: number }>(),
    ctx.env.DB.prepare('SELECT id, title FROM family_households').all<{ id: string; title: string }>(),
  ]);
  const map = new Map<string, { id: string; title: string; members: number }>();
  for (const h of named) map.set(h.id, { id: h.id, title: h.title, members: 0 });
  for (const h of used) map.set(h.id, { id: h.id, title: map.get(h.id)?.title || '', members: h.n });
  return [...map.values()].sort((a, b) => b.members - a.members || a.id.localeCompare(b.id));
}
const shown = (rows: Row[], heads: Map<string, string[]>) =>
  rows.map((r) => ({ ...r, role: R.roleOf(r.role, heads.get(r.email) || [], r.household) }));

/** GET /api/admin/people?household=…  or  ?q=…  : one household's members, or a search across all of them */
export async function people(ctx: Ctx) {
  const a = await gate(ctx);
  const url = new URL(ctx.req.url);
  const q = url.searchParams.get('q');
  let rows: Row[];
  if (q !== null) {
    // the search: words in the names, the email or the household, and the advanced filters (member-admin-rules searchSql)
    const s = R.searchSql(q, R.filtersOf((k) => url.searchParams.get(k)));
    const cols = COLS.split(', ').map((c) => 'm.' + c).join(', ');
    rows = s ? (await ctx.env.DB.prepare(`SELECT ${cols} FROM members m LEFT JOIN family_households h ON h.id = m.household WHERE ${s.where} ORDER BY m.household, m.email LIMIT 30`)
      .bind(...s.binds).all<Row>()).results : [];
  } else {
    let house = url.searchParams.get('household');
    if (!house) house = (await ctx.env.DB.prepare('SELECT household FROM members WHERE email = ?').bind(a.as).first<{ household: string }>())?.household || 'family';
    rows = (await ctx.env.DB.prepare(`SELECT ${COLS} FROM members WHERE household = ? ORDER BY role DESC, email`).bind(house).all<Row>()).results;
  }
  const [heads, hs] = await Promise.all([headsOf(ctx), households(ctx)]);
  return json({ members: shown(rows, heads), households: hs, owners: [...admin.owners(ctx.env)].filter((e) => rows.some((r) => r.email === e)) });
}

/** PUT /api/admin/people/:email {name?, he_name?, household?, newHousehold?, role?, confirm?} */
export async function edit(ctx: Ctx) {
  const a = await gate(ctx);
  const email = decodeURIComponent(ctx.params.email).toLowerCase();
  const row = await ctx.env.DB.prepare(`SELECT ${COLS} FROM members WHERE email = ?`).bind(email).first<Row>();
  if (!row) throw new HttpError(404, 'not_member');
  const heads = await headsOf(ctx);
  const t: R.Target = { email, household: row.household, role: R.roleOf(row.role, heads.get(email) || [], row.household) };
  const owners = admin.owners(ctx.env);
  const ownerCount = (await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE role = 'owner'").first<{ n: number }>())?.n || 0;
  const hs = new Set((await households(ctx)).map((h) => h.id));
  let c: R.Change;
  try { c = R.checkEdit(t, await body<R.Want>(ctx.req), owners, ownerCount, hs); }
  catch (e) { if (e instanceof R.RuleError) throw new HttpError(400, e.code); throw e; }
  if ((c.role !== undefined || c.household !== undefined) && a.level !== 'owner') throw new HttpError(403, 'owner_level_only');

  const DB = ctx.env.DB, now = Date.now(), steps: D1PreparedStatement[] = [];
  if (c.name !== undefined) steps.push(DB.prepare('UPDATE members SET name = ? WHERE email = ?').bind(c.name, email));
  if (c.he_name !== undefined) steps.push(DB.prepare('UPDATE members SET he_name = ? WHERE email = ?').bind(c.he_name, email));
  let house = t.household;
  if (c.household !== undefined) {
    house = c.household || 'h' + uid().slice(0, 10);
    if (c.newTitle) steps.push(DB.prepare('INSERT INTO family_households (id, title, updated_by, updated_at) VALUES (?, ?, ?, ?)').bind(house, c.newTitle, a.by, now));
    steps.push(DB.prepare('UPDATE members SET household = ? WHERE email = ?').bind(house, email));
  }
  const role = c.role ?? t.role;
  if (c.role !== undefined || c.household !== undefined) {
    // members.role holds only owner/member; a head is a row in family_roles for the household they live in
    steps.push(DB.prepare('UPDATE members SET role = ? WHERE email = ?').bind(role === 'owner' ? 'owner' : 'member', email));
    steps.push(DB.prepare("DELETE FROM family_roles WHERE email = ? AND role = 'head'").bind(email));
    if (role === 'head') steps.push(DB.prepare("INSERT OR IGNORE INTO family_roles (household, email, role, named_by, created_at) VALUES (?, ?, 'head', ?, ?)").bind(house, email, a.by, now));
  }
  if (steps.length) await DB.batch(steps);
  await admin.log(ctx, a, 'member:edit', R.describe(email, c, t));
  return json({ ok: true, household: house, role });
}
