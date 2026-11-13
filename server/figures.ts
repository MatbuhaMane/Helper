// Paid companion figures, bought with credits (the master's: money). Rules and tests in figures-rules.ts.
//   GET  /api/daemon/figures          → { owned, paid, priceIls }
//   POST /api/daemon/figures/:id/buy  { confirm: true } → { ok, how, owned }
// The owner's family gets a paid figure for nothing (at the owner's cost, like the AI). A limited account pays the price
// (the setting figures.price_ils) from what is left of its credits: the purchase is counted as spent in credits.balance().

import { Env, Ctx, HttpError, body, json, requireUser } from './core';
import { setting } from './settings';
import { balance } from './credits';
import { ilsToUsd } from './credits-rules';
import * as R from './figures-rules';

export async function owned(env: Env, email: string): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT figure FROM figure_owned WHERE email = ? ORDER BY bought_at').bind(email).all<{ figure: string }>();
  return results.map((r) => r.figure);
}

export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const [mine, base, special] = await Promise.all([owned(ctx.env, u.email), setting<number>(ctx.env, 'figures.price_ils'), setting<number>(ctx.env, 'figures.special_price_ils')]);
  // priceIls: the usual price; prices: each paid figure's own (the special ones cost more)
  return json({ owned: mine, paid: R.PAID, priceIls: base, prices: Object.fromEntries(R.PAID.map((id) => [id, R.priceIlsOf(id, base, special)])) });
}

export async function buy(ctx: Ctx) {
  const u = requireUser(ctx);
  const id = String(ctx.params.id || '').toLowerCase();
  const { confirm } = await body<{ confirm?: unknown }>(ctx.req).catch(() => ({ confirm: undefined }));
  const env = ctx.env;
  const [mine, a, base, special, usdIls] = await Promise.all([
    owned(env, u.email),
    env.DB.prepare('SELECT limited, since FROM ai_allowance WHERE email = ?').bind(u.email).first<{ limited: number; since: number }>(),
    setting<number>(env, 'figures.price_ils'),
    setting<number>(env, 'figures.special_price_ils'),
    setting<number>(env, 'money.usd_ils'),
  ]);
  const priceIls = R.priceIlsOf(id, base, special);
  const limited = !!a?.limited;
  const left = limited ? (await balance(env, u.email, a!.since)).total : 0;
  const d = R.decide({ id, owned: mine, limited, left, priceUsd: ilsToUsd(priceIls, usdIls), confirm });
  if (!d.ok) throw new HttpError(d.error === 'not_enough_credit' ? 402 : 400, d.error);
  if (d.how !== 'owned') {
    // the primary key keeps a double click from buying twice
    await env.DB.prepare('INSERT OR IGNORE INTO figure_owned (email, figure, usd, how, bought_at) VALUES (?, ?, ?, ?, ?)')
      .bind(u.email, id, d.usd, d.how, Date.now()).run();
  }
  return json({ ok: true, how: d.how, owned: await owned(env, u.email) });
}
