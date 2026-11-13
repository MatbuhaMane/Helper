// Discovery (docs/ai/social-plan.md, slice A): a page tells the server which tool was opened; the home page asks how
// many have been found. Only the tool and when are kept (tool_visits), never what is in it.
//   POST /api/visits {path}  → { tool, fresh }   (fresh: the first time this person opened this tool)
//   GET  /api/discover       → { found, total, scout, tools: [{ id, name, href, found }] }

import { Ctx, body, json, requireUser } from './core';
import * as D from './discover-logic';

/** POST /api/visits – once a page load at most (apply.js keeps it to once a day per tool on each device) */
export async function visit(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await body<{ path?: string }>(ctx.req);
  const tool = D.toolOf(String(b.path || '').slice(0, 200));
  if (!tool) return json({ tool: null, fresh: false });
  const now = Date.now();
  const had = await ctx.env.DB.prepare('SELECT 1 FROM tool_visits WHERE email = ? AND tool = ?').bind(u.email, tool).first();
  await ctx.env.DB.prepare('INSERT INTO tool_visits (email, tool, first_at, last_at, n) VALUES (?, ?, ?, ?, 1) ON CONFLICT(email, tool) DO UPDATE SET last_at = excluded.last_at, n = n + 1')
    .bind(u.email, tool, now, now).run();
  // a new tool may make a scout: the badge is kept with the goals' badges, and returned once for the page to celebrate
  let badge: string | null = null;
  if (!had) {
    const p = D.progress(await foundBy(ctx, u.email));
    if (p.scout) {
      const r = await ctx.env.DB.prepare('INSERT OR IGNORE INTO goal_badges (email, badge, earned_at) VALUES (?, ?, ?)').bind(u.email, 'scout', now).run();
      if (r.meta.changes) badge = 'scout';
    }
    return json({ tool, fresh: true, found: p.found, total: p.total, badge });
  }
  return json({ tool, fresh: false });
}

/** the tools this person has found */
export async function foundBy(ctx: Ctx, email: string): Promise<string[]> {
  const { results } = await ctx.env.DB.prepare('SELECT tool FROM tool_visits WHERE email = ?').bind(email).all<{ tool: string }>();
  return results.map((r) => r.tool);
}

/** GET /api/discover */
export async function discover(ctx: Ctx) {
  const u = requireUser(ctx);
  return json(D.progress(await foundBy(ctx, u.email)));
}
