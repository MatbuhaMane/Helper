// Each person's preferences, one small JSON object per tool ("namespace"), stored on the server so they follow
// the person from phone to PC to any other device. The browser keeps a copy for offline use (common.js, H.prefs).

import { Ctx, Env, HttpError, body, json, requireUser } from './core';

const NS = /^[a-z][a-z0-9_-]{0,31}$/;
const MAX_BYTES = 8000;

export async function prefsFor(env: Env, email: string): Promise<Record<string, { data: Record<string, unknown>; at: number }>> {
  const { results } = await env.DB.prepare('SELECT ns, data, updated_at FROM user_prefs WHERE email = ?').bind(email).all<{ ns: string; data: string; updated_at: number }>();
  const out: Record<string, { data: Record<string, unknown>; at: number }> = {};
  for (const r of results) {
    try { out[r.ns] = { data: JSON.parse(r.data), at: r.updated_at }; } catch { /* skip a broken row */ }
  }
  return out;
}

export async function getPrefs(ctx: Ctx) {
  const u = requireUser(ctx);
  return json({ prefs: await prefsFor(ctx.env, u.email) });
}

/** Merge a patch into one tool's preferences. `at` (the device's clock when it changed) keeps an older offline change from overwriting a newer one. */
export async function putPrefs(ctx: Ctx) {
  const u = requireUser(ctx);
  const ns = ctx.params.ns;
  if (!NS.test(ns)) throw new HttpError(400, 'Invalid namespace');
  const b = await body<{ data: Record<string, unknown>; at?: number }>(ctx.req);
  if (!b || typeof b.data !== 'object' || Array.isArray(b.data) || b.data === null) throw new HttpError(400, 'Invalid prefs');
  const at = Math.min(Number(b.at) || Date.now(), Date.now());
  const row = await ctx.env.DB.prepare('SELECT data, updated_at FROM user_prefs WHERE email = ? AND ns = ?').bind(u.email, ns).first<{ data: string; updated_at: number }>();
  if (row && row.updated_at > at) return json({ data: JSON.parse(row.data), at: row.updated_at, stale: true });
  let current: Record<string, unknown> = {};
  try { current = row ? JSON.parse(row.data) : {}; } catch { /* start over */ }
  const merged = { ...current, ...b.data };
  const text = JSON.stringify(merged);
  if (text.length > MAX_BYTES) throw new HttpError(413, 'Prefs too large');
  await ctx.env.DB.prepare('INSERT INTO user_prefs (email, ns, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(email, ns) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(u.email, ns, text, at).run();
  return json({ data: merged, at });
}
