// "יד ביד" is built in full but locked behind its own switch (owner's decision, 2026-11-15: a feature that waits for approvals).
// While the switch "yad" (server/switches-rules.ts) is off, every /api/yad route answers 404 to everyone except the owner,
// who alone can try it. The app hides the tile, the links, the approval count and the pushes the same way (public/assets/yad-gate.js).

import { Ctx, HttpError, requireUser } from './core';
import { switchesNow } from './switches';
import { yadOpen } from './yad-rules';

export async function yadOn(ctx: Ctx, email: string): Promise<boolean> {
  return yadOpen((await switchesNow(ctx.env)).yad === true, email, ctx.env.OWNER_EMAIL || '');
}
/** the first line of every /api/yad handler: the user, or 404 as if the route did not exist */
export async function requireYad(ctx: Ctx) {
  const u = requireUser(ctx);
  if (!(await yadOn(ctx, u.email))) throw new HttpError(404, 'not_found');
  return u;
}
