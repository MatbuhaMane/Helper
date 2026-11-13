// Secret grants (master; docs/vision/profile.md): the owner gives one member, from the owner's room (behind the owner's
// biometric), options the others never see: secret frames, the bio and the name in the ancient script. The server is the
// only judge: /api/me carries a member's own grants and nothing else, and the profile's save checks hasGrant.
// The whole interface in the ancient script ('ancient_ui') is the owner's alone and can never be granted.
import type { Ctx, Env } from './core';
import { HttpError, json, body, requireOwner } from './core';
import { requireAdmin, log } from './admin';

export const GRANTS = ['frames', 'bio_ancient', 'name_ancient'] as const;
export type Grant = (typeof GRANTS)[number] | 'ancient_ui';

const isOwner = (env: Env, email: string) => (env.OWNER_EMAIL || '').toLowerCase().split(',').map((s) => s.trim()).includes(email.toLowerCase());

/** what this member may use: the owner has everything, others only what was granted */
export async function grantsFor(env: Env, email: string): Promise<Grant[]> {
  if (isOwner(env, email)) return [...GRANTS, 'ancient_ui'];
  try {
    const { results } = await env.DB.prepare('SELECT grant_key FROM user_grants WHERE email = ?').bind(email.toLowerCase()).all<{ grant_key: string }>();
    return results.map((r) => r.grant_key).filter((k): k is Grant => (GRANTS as readonly string[]).includes(k));
  } catch { return []; }
}
export async function hasGrant(env: Env, email: string, g: Grant): Promise<boolean> {
  return (await grantsFor(env, email)).includes(g);
}

/** GET /api/admin/grants — every grant (the owner's room) */
export async function list(ctx: Ctx): Promise<Response> {
  requireOwner(ctx);
  await requireAdmin(ctx, 'own');
  const { results } = await ctx.env.DB.prepare('SELECT email, grant_key, by_email, created_at FROM user_grants ORDER BY email, grant_key').all();
  return json({ grants: results, keys: GRANTS });
}

/** PUT /api/admin/grants/:email { key, on } — grant or revoke, at any moment */
export async function put(ctx: Ctx): Promise<Response> {
  requireOwner(ctx);
  const a = await requireAdmin(ctx, 'own');
  const email = decodeURIComponent(ctx.params.email || '').trim().toLowerCase();
  const b = await body<{ key?: string; on?: boolean }>(ctx.req);
  if (!(GRANTS as readonly string[]).includes(b.key || '')) throw new HttpError(400, 'unknown_grant');   // ancient_ui is never grantable
  if (!email || isOwner(ctx.env, email)) throw new HttpError(400, 'bad_member');
  const m = await ctx.env.DB.prepare('SELECT 1 FROM members WHERE email = ?').bind(email).first();
  if (!m) throw new HttpError(404, 'not_a_member');
  if (b.on) {
    await ctx.env.DB.prepare('INSERT OR IGNORE INTO user_grants (email, grant_key, by_email, created_at) VALUES (?, ?, ?, ?)').bind(email, b.key, a.by, Date.now()).run();
  } else {
    await ctx.env.DB.prepare('DELETE FROM user_grants WHERE email = ? AND grant_key = ?').bind(email, b.key).run();
  }
  await log(ctx, a, b.on ? 'grant' : 'revoke', `${email} ${b.key}`);
  return json({ ok: true, grants: await grantsFor(ctx.env, email) });
}
