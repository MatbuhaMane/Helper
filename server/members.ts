// A member's age, for the rules that protect children (the master's). The birth year is private: only the owner sets and
// sees it, in the room (/api/members). Everyone else gets only "a child or not", from childOf().
//   - horror companion figures are hidden from a child;
//   - a child is never added to a shared research from outside the family (research-share.ts mayJoin).

import { Env } from './core';
import { isChild } from './figures-rules';

/** under 12 (by the birth year the owner set); no year: not a child */
export async function childOf(env: Env, email: string): Promise<boolean> {
  const r = await env.DB.prepare('SELECT birth_year FROM members WHERE email = ?').bind(email).first<{ birth_year: number | null }>().catch(() => null);
  return isChild(r?.birth_year ?? null, Date.now());
}
