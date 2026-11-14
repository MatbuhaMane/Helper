// Beta and secret apps (the owner, 2026-11-14): the back door gives a person the leave 'beta' (a beta tester) or the
// leave for one secret app (its address). /api/me carries the person's own leaves; the APIs of a gated app refuse without
// one (requireApp). The rules and the list of gated apps are in app-access-rules.ts.
import type { Ctx, Env, Member } from './core';
import { HttpError, body, json, requireOwner, requireUser } from './core';
import { requireAdmin, log } from './admin';
import { GATED, grantable, leaveFor, mayOpen } from './app-access-rules';

/** the person's leaves: the owner has all of them; others what the back door gave (an unknown leave is dropped) */
export async function leavesFor(env: Env, m: Pick<Member, 'email' | 'role'>): Promise<string[]> {
  const all = grantable();
  if (m.role === 'owner') return all;
  try {
    const { results } = await env.DB.prepare('SELECT app FROM app_access WHERE email = ?').bind(m.email.toLowerCase()).all<{ app: string }>();
    return results.map((r) => r.app).filter((a) => all.includes(a));
  } catch { return []; }
}

/** an API of a gated app: refuses (403 app_closed) a person without its leave. An open app passes at once. */
export async function requireApp(ctx: Ctx, href: string): Promise<Member> {
  const u = requireUser(ctx);
  if (!leaveFor(href)) return u;
  if (!mayOpen(href, u.role === 'owner', await leavesFor(ctx.env, u))) throw new HttpError(403, 'app_closed');
  return u;
}
/** the same, for code that has no request (the companion acting for someone) */
export async function mayUse(env: Env, m: Pick<Member, 'email' | 'role'>, href: string): Promise<boolean> {
  return mayOpen(href, m.role === 'owner', await leavesFor(env, m));
}

/** GET /api/admin/app-access — who has which leave, and what can be given (the owner's room) */
export async function list(ctx: Ctx): Promise<Response> {
  requireOwner(ctx);
  await requireAdmin(ctx, 'own');
  const { results } = await ctx.env.DB.prepare('SELECT email, app, by_email, created_at FROM app_access ORDER BY email, app').all();
  return json({ access: results, leaves: grantable(), gated: Object.entries(GATED).map(([href, g]) => ({ href, access: g.access })) });
}

/** PUT /api/admin/app-access/:email { app: 'beta' | '/secret/', on } — give or take, logged */
export async function put(ctx: Ctx): Promise<Response> {
  requireOwner(ctx);
  const a = await requireAdmin(ctx, 'own');
  const email = decodeURIComponent(ctx.params.email || '').trim().toLowerCase();
  const b = await body<{ app?: string; on?: boolean }>(ctx.req);
  const app = String(b.app || '');
  if (!grantable().includes(app)) throw new HttpError(400, 'unknown_app');
  const m = await ctx.env.DB.prepare('SELECT role FROM members WHERE email = ?').bind(email).first<{ role: string }>();
  if (!m) throw new HttpError(404, 'not_a_member');
  if (m.role === 'owner') throw new HttpError(400, 'owner_has_all');
  if (b.on) {
    await ctx.env.DB.prepare('INSERT OR IGNORE INTO app_access (email, app, by_email, created_at) VALUES (?, ?, ?, ?)').bind(email, app, a.by, Date.now()).run();
  } else {
    await ctx.env.DB.prepare('DELETE FROM app_access WHERE email = ? AND app = ?').bind(email, app).run();
  }
  await log(ctx, a, b.on ? 'app_open' : 'app_close', `${email} ${app}`);
  return json({ ok: true, apps: await leavesFor(ctx.env, { email, role: m.role as Member['role'] }) });
}
