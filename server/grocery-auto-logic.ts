// The automatic shopping list (the owner, 2026-11-14, docs/vision/batch.md 8): what the fridge usually has and is
// missing now, offered as a fixed list called "אוטומטית" on the groceries page. It only suggests: a person approves each
// item (or all of them) with one tap, and nothing is ever added by itself. Pure logic, tested in test-grocery-auto.mjs.

export interface FridgeRow { name: string; cat?: string | null; qty: number; deleted: number | boolean; expires?: string | null; updated_at: number }
export type Why = 'gone' | 'low' | 'expired';
export interface Suggestion { key: string; name: string; why: Why; times: number; cat: string | null }

/** At least this many times in the fridge before it counts as "usually there". */
export const USUAL = 2;

/**
 * What to restock, from every row the fridge(s) ever had:
 * - gone: usually there, none now;
 * - expired: what is there has all passed its date (to throw, and to buy again);
 * - low: one left (or less).
 * Skips what is already waiting on the shopping list and what the person put off ("לא הפעם") until a day after today.
 * Order: gone, then expired, then low; within each, the most usual first.
 */
export function suggest(rows: FridgeRow[], norm: (s: string) => string, onList: Set<string>, skip: Record<string, string>, today: string, max = 24): Suggestion[] {
  const by = new Map<string, { name: string; last: number; times: number; qty: number; fresh: number; here: number; cat: string | null }>();
  for (const r of rows) {
    const key = norm(r.name || '');
    if (!key) continue;
    const g = by.get(key) || { name: r.name.trim(), last: 0, times: 0, qty: 0, fresh: 0, here: 0, cat: null };
    g.times++;
    if (r.updated_at >= g.last) { g.last = r.updated_at; g.name = r.name.trim(); g.cat = r.cat || g.cat; }
    if (!r.deleted) {
      g.here++;
      g.qty += Math.max(0, Number(r.qty) || 0);
      if (!r.expires || r.expires >= today) g.fresh += Math.max(0, Number(r.qty) || 0) || 1;
    }
    by.set(key, g);
  }
  const rank: Record<Why, number> = { gone: 0, expired: 1, low: 2 };
  const out: Suggestion[] = [];
  for (const [key, g] of by) {
    if (g.times < USUAL || onList.has(key) || (skip[key] && skip[key] >= today)) continue;
    const why: Why | null = !g.here ? 'gone' : !g.fresh ? 'expired' : g.qty <= 1 ? 'low' : null;
    if (why) out.push({ key, name: g.name, why, times: g.times, cat: g.cat });
  }
  return out.sort((a, b) => rank[a.why] - rank[b.why] || b.times - a.times || a.name.localeCompare(b.name, 'he')).slice(0, max);
}

/** The person's "not this time" list, without what ran out (kept small: it lives in their preferences). */
export function pruneSkip(skip: Record<string, string> | null | undefined, today: string, max = 40): Record<string, string> {
  const live = Object.entries(skip || {}).filter(([, until]) => typeof until === 'string' && until >= today);
  return Object.fromEntries(live.sort((a, b) => b[1].localeCompare(a[1])).slice(0, max));
}
