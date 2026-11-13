// The rules for buying a paid companion figure (the owner's decision, 2026-11-13), and for a member's age.
// Pure functions, tested in test-figures.mjs.

/** The paid figures (design's catalogue, Figure2D.FIGURES with paid: true). Design tells the master when this changes. */
export const PAID = ['maryshelley', 'leonardo', 'cleopatra', 'dracula', 'magician', 'astronomer', 'doll', 'nightwizard', 'forestwitch', 'littlewizard', 'littlewitch'] as const;
export const isPaid = (id: string) => (PAID as readonly string[]).includes(id);
/** the special figures, each with its own move, cost more (the owner: ₪20; the setting figures.special_price_ils) */
export const SPECIAL = ['magician', 'astronomer', 'doll', 'nightwizard', 'forestwitch', 'littlewizard', 'littlewitch'] as const;
export const priceIlsOf = (id: string, base: number, special: number) => ((SPECIAL as readonly string[]).includes(id) ? special : base);

export type Decision =
  | { ok: true; how: 'owned' | 'family' | 'credits'; usd: number }
  | { ok: false; error: 'not_paid' | 'confirm_needed' | 'not_enough_credit' };

/**
 * Whether this person may take this figure, and what it costs them.
 *  - owned: they have it already, nothing happens.
 *  - family: the owner's family (no allowance row, or not limited) gets it at the owner's cost, for nothing.
 *  - credits: a limited account pays the price from what is left of its credits.
 * Each purchase is confirmed by the person (confirm: true).
 */
export function decide(o: { id: string; owned: string[]; limited: boolean; left: number; priceUsd: number; confirm: unknown }): Decision {
  if (!isPaid(o.id)) return { ok: false, error: 'not_paid' };
  if (o.owned.includes(o.id)) return { ok: true, how: 'owned', usd: 0 };
  if (o.confirm !== true) return { ok: false, error: 'confirm_needed' };
  if (!o.limited) return { ok: true, how: 'family', usd: 0 };
  if (!(o.priceUsd > 0) || o.left < o.priceUsd) return { ok: false, error: 'not_enough_credit' };
  return { ok: true, how: 'credits', usd: o.priceUsd };
}

/* ---- a member's age (the birth year, kept private: only the owner sees it, in the room) ---- */

/** a birth year the owner may set: from 1900 to this year, or nothing */
export function birthYear(v: unknown, now: number): number | null {
  if (v === null || v === '' || v === undefined) return null;
  const y = Number(v), top = new Date(now).getUTCFullYear();
  if (!Number.isInteger(y) || y < 1900 || y > top) throw new Error('bad_year');
  return y;
}
/** under 12 this year (by the year alone: a child born this year counts as 0). No year: not a child. */
export const isChild = (year: number | null | undefined, now: number) => !!year && new Date(now).getUTCFullYear() - year < 12;
