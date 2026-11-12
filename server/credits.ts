// The AI allowance (the owner's decision; rules and tests in credits-rules.ts).
//   * The owner's family – every member with no allowance row, which is everyone the owner invited; the owner can mark
//     anyone limited or unlimited in the room – uses the AI with no limit, at the owner's cost.
//   * A new account that came through an invitation is started with startTrial(): a one-time trial grant (about ₪1.5 of
//     real AI cost, a setting), used with no notice. When nothing is left, the call is refused with 402 ai_credit_needed
//     and the page invites them to connect their own service or get credits (/settings/, "חיבור לשירותים").
//   * Anyone may connect their own Claude or Gemini key (sealed with the vault's key): the meter then sends that
//     person's requests with their key, they cost the owner nothing and need no credit (ai_usage.own_key).
// The gate is called by the meter (server/meter.ts) before every request to Claude or Gemini, so every feature is
// covered without touching it.

import { Env, HttpError, Ctx, body, json, requireUser, uid } from './core';
import { costOf, UsageRow } from './prices';
import { seal, unseal } from './vault/crypto';
import { setting } from './settings';
import { rateLimit } from './vault';
import * as R from './credits-rules';

interface Allowance { email: string; limited: number; since: number }

/** a person's own key for a provider, if they connected one */
async function ownKey(env: Env, email: string, provider: 'claude' | 'gemini'): Promise<string | null> {
  const row = await env.DB.prepare('SELECT key_enc FROM user_ai_keys WHERE email = ? AND provider = ?').bind(email, provider).first<{ key_enc: string }>();
  return row ? (await unseal(env, row.key_enc, `aikey:${email}:${provider}`)) || null : null;
}
/** the balance of a limited account: its grants, less the real cost of what it used since it started (not with its own key) */
export async function balance(env: Env, email: string, since: number) {
  const [{ results: grants }, { results: used }] = await Promise.all([
    env.DB.prepare('SELECT source, usd, created_at AS at FROM ai_credits WHERE email = ?').bind(email).all<R.Grant>(),
    env.DB.prepare('SELECT at, model, provider, input, output, cache_write, cache_read, searches, grounded, audio_out, image_out FROM ai_usage WHERE email = ? AND at >= ? AND COALESCE(own_key, 0) = 0').bind(email, since).all<UsageRow & { at: number }>(),
  ]);
  const spent = used.reduce((s, r) => s + (costOf(r) ?? 0), 0);
  return { ...R.remaining(grants, spent), spent };
}

/** the meter's gate, before a request to Claude or Gemini: their own key to use (if any), or a refusal when nothing is left */
export async function gate(env: Env, email: string | null, provider: 'claude' | 'gemini'): Promise<{ key: string | null }> {
  if (!email) return { key: null };                                          // the system's own jobs
  let key: string | null = null, a: Allowance | null = null, left = 0;
  try {
    key = await ownKey(env, email, provider).catch(() => null);
    a = await env.DB.prepare('SELECT email, limited, since FROM ai_allowance WHERE email = ?').bind(email).first<Allowance>();
    if (a?.limited && !key) left = (await balance(env, email, a.since)).total;
  } catch (e) {
    // the allowance could not be read: the AI stays open (as for the family) rather than failing everyone
    console.error('credits gate', e instanceof Error ? e.message : e);
    return { key };
  }
  if (!R.mayUse(!!a?.limited, left, !!key)) throw new HttpError(402, 'ai_credit_needed');
  return { key };
}

/** a new account (from an invitation): limited, with the one-time trial grant. Calling it twice changes nothing. */
export async function startTrial(env: Env, email: string) {
  const had = await env.DB.prepare('SELECT 1 FROM ai_allowance WHERE email = ?').bind(email).first();
  if (had) return;
  const usd = R.trialUsd(await setting<number>(env, 'credits.trial_ils'), await setting<number>(env, 'money.usd_ils'));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ai_allowance (email, limited, since, updated_by, updated_at) VALUES (?, 1, ?, ?, ?)').bind(email, now, 'trial', now),
    env.DB.prepare('INSERT INTO ai_credits (id, email, source, usd, note, by_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(uid(), email, 'trial', usd, 'מתנת פתיחה', null, now),
  ]);
}

/** for the room: a member's allowance (limited or not, the balance), and marking them limited or family */
export async function allowanceOf(env: Env, email: string) {
  const a = await env.DB.prepare('SELECT email, limited, since FROM ai_allowance WHERE email = ?').bind(email).first<Allowance>();
  if (!a || !a.limited) return { limited: false };
  return { limited: true, ...(await balance(env, email, a.since)) };
}
export async function setLimited(env: Env, email: string, limited: boolean, by: string) {
  const now = Date.now();
  await env.DB.prepare('INSERT INTO ai_allowance (email, limited, since, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET limited = excluded.limited, updated_by = excluded.updated_by, updated_at = excluded.updated_at')
    .bind(email, limited ? 1 : 0, now, by, now).run();
}

/* ---------------- the person's own side: /settings/, "חיבור לשירותים" ---------------- */

/** GET /api/me/ai – what is connected, and (for a limited account) what is left */
export async function mine(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results } = await ctx.env.DB.prepare('SELECT provider, hint, added_at FROM user_ai_keys WHERE email = ?').bind(u.email).all<{ provider: string; hint: string; added_at: number }>();
  const a = await allowanceOf(ctx.env, u.email) as { limited: boolean; total?: number };
  const rate = await setting<number>(ctx.env, 'money.usd_ils');
  // amounts only for an account that bought credit or got a gift; on the trial alone, nothing but whether it ran out
  const { results: grants } = await ctx.env.DB.prepare('SELECT source FROM ai_credits WHERE email = ?').bind(u.email).all<{ source: string }>();
  const shows = a.limited && R.showsAmounts(grants);
  return json({
    keys: Object.fromEntries(results.map((r) => [r.provider, { hint: r.hint, added: r.added_at }])),
    limited: a.limited, out: a.limited && (a.total || 0) <= 0,
    left_ils: shows ? Math.max(0, Math.round((a.total || 0) * rate * 100) / 100) : null,
    buy: false,                                                            // no payment flow yet
  });
}
/** PUT /api/me/ai/keys {provider, key} – checked with the provider before it is kept (sealed) */
export async function keySave(ctx: Ctx) {
  const u = requireUser(ctx);
  await rateLimit(ctx, 'aikey:' + u.email, 10, 3600e3);                  // ten tries an hour: no testing of stolen keys here
  const b = await body<{ provider?: string; key?: string }>(ctx.req);
  const provider = b.provider === 'claude' || b.provider === 'gemini' ? b.provider : null;
  const key = provider && R.cleanKey(provider, b.key);
  if (!provider || !key) throw new HttpError(400, 'bad_key');
  // a cheap question to the provider: does this key work? (listing the models costs nothing)
  const r = provider === 'claude'
    ? await fetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } })
    : await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': key } });
  if (!r.ok) throw new HttpError(400, 'key_refused');
  await ctx.env.DB.prepare('INSERT INTO user_ai_keys (email, provider, key_enc, hint, added_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email, provider) DO UPDATE SET key_enc = excluded.key_enc, hint = excluded.hint, added_at = excluded.added_at')
    .bind(u.email, provider, await seal(ctx.env, key, `aikey:${u.email}:${provider}`), R.keyHint(key), Date.now()).run();
  return json({ ok: true, hint: R.keyHint(key) });
}
export async function keyDelete(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM user_ai_keys WHERE email = ? AND provider = ?').bind(u.email, ctx.params.provider).run();
  return json({ ok: true });
}
