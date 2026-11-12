// The AI cost report (the owner only): what the AI cost, by person, by feature, by model and by day – and, per person,
// what a month at this pace would cost. The basis for deciding on a price for a public version.
//   GET /api/usage?days=14

import { Ctx, json, requireOwner } from './core';
import { costOf, UsageRow } from './prices';
import { requireAdmin } from './admin';

interface Row extends UsageRow { email: string | null; feature: string; provider: string }

export async function report(ctx: Ctx) {
  requireOwner(ctx);
  await requireAdmin(ctx, 'own');            // and the owner's room is open, from their own account
  const days = Math.min(90, Math.max(1, Number(ctx.url.searchParams.get('days')) || 14));
  const since = Date.now() - days * 864e5;
  const [{ results }, names] = await Promise.all([
    ctx.env.DB.prepare('SELECT at, email, feature, provider, model, input, output, cache_write, cache_read, searches, grounded, audio_out, image_out FROM ai_usage WHERE at >= ? AND COALESCE(own_key, 0) = 0 ORDER BY at LIMIT 100000').bind(since).all<Row>(),
    ctx.env.DB.prepare('SELECT email, he_name, name FROM members').all<{ email: string; he_name: string | null; name: string | null }>(),
  ]);
  const nameOf = new Map(names.results.map((m) => [m.email, m.he_name || m.name || m.email]));
  type Sum = { cost: number; calls: number; unpriced: number; first: number; last: number; tokens: number };
  const blank = (): Sum => ({ cost: 0, calls: 0, unpriced: 0, first: Infinity, last: 0, tokens: 0 });
  const by = { user: new Map<string, Sum>(), feature: new Map<string, Sum>(), model: new Map<string, Sum>(), day: new Map<string, Sum>() };
  const total = blank();
  for (const r of results) {
    const c = costOf(r);
    const day = new Date(r.at + 2 * 3600e3).toISOString().slice(0, 10);   // Israel's day, roughly
    for (const [map, key] of [[by.user, r.email || 'המערכת'], [by.feature, r.feature], [by.model, r.model], [by.day, day]] as [Map<string, Sum>, string][]) {
      const s = map.get(key) || blank(); map.set(key, s); add(s, r, c);
    }
    add(total, r, c);
  }
  function add(s: Sum, r: Row, c: number | null) {
    s.calls++; s.tokens += r.input + r.output + r.cache_read + r.cache_write + r.audio_out + r.image_out;
    if (c == null) s.unpriced++; else s.cost += c;
    s.first = Math.min(s.first, r.at); s.last = Math.max(s.last, r.at);
  }
  const list = (m: Map<string, Sum>) => [...m].map(([key, s]) => ({ key, cost: round(s.cost), calls: s.calls, unpriced: s.unpriced, tokens: s.tokens })).sort((a, b) => b.cost - a.cost);
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const users = [...by.user].map(([email, s]) => {
    const span = Math.max(1, (Date.now() - s.first) / 864e5);      // since this person's first call in the window
    return { email, name: nameOf.get(email) || email, cost: round(s.cost), calls: s.calls, unpriced: s.unpriced, perMonth: round((s.cost / span) * 30) };
  }).sort((a, b) => b.cost - a.cost);
  return json({
    // a month at this pace: from the first call measured (so a short measurement is not diluted by empty days)
    days, since, total: { cost: round(total.cost), calls: total.calls, unpriced: total.unpriced, perMonth: round((total.cost / Math.max(1, (Date.now() - total.first) / 864e5)) * 30) },
    users, features: list(by.feature), models: list(by.model),
    daily: [...by.day].map(([day, s]) => ({ day, cost: round(s.cost), calls: s.calls })).sort((a, b) => (a.day < b.day ? -1 : 1)),
  });
}
