// Shared goals and encouragement (vision batch 8, slice C; the rules in goal-social-logic.ts). A goal the person chose to
// share makes progress posts – one a day for each goal, and one when it is achieved – that the household sees in a small
// feed, with hearts and short advice. Encouragement earns the badges יועץ, כתף תומכת and מלאך דרך.
//   GET  /api/goals/feed                 → { posts: [{ id, who, mine, kind, text, at, hearts, hearted, advice: [...] }] }
//   POST /api/goals/posts/:id/heart      → { hearted, hearts }          (a tap, or a double tap on the page)
//   POST /api/goals/posts/:id/advice {text}
//   POST /api/goals/advice/:id/heart     → the post's owner marks advice as good: the adviser badge for its author

import { Ctx, HttpError, Member, body, json, requireUser, uid } from './core';
import { childOf } from './members';
import * as S from './goal-social-logic';

const DAY = 864e5;
interface PostRow { id: string; goal_id: string; email: string; household: string; kind: string; text: string; steps: number; at: number }

async function viewer(ctx: Ctx, u: Member): Promise<S.Viewer> { return { email: u.email, household: u.household, child: await childOf(ctx.env, u.email) }; }
async function postOf(ctx: Ctx, id: string): Promise<PostRow> {
  const p = await ctx.env.DB.prepare('SELECT * FROM goal_posts WHERE id = ? AND deleted = 0').bind(id).first<PostRow>();
  if (!p) throw new HttpError(404, 'not_found');
  return p;
}
const ownerOf = async (ctx: Ctx, p: PostRow): Promise<S.PostOwner> => ({ email: p.email, household: p.household, child: await childOf(ctx.env, p.email) });

/** badges given now (with the goals' badges) */
async function award(ctx: Ctx, email: string, ids: string[]) {
  const now = Date.now();
  for (const id of ids) await ctx.env.DB.prepare('INSERT OR IGNORE INTO goal_badges (email, badge, earned_at) VALUES (?, ?, ?)').bind(email, id, now).run();
}
async function encouragement(ctx: Ctx, email: string) {
  const [hearted, given, done] = await Promise.all([
    ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM post_advice WHERE email = ? AND hearted = 1 AND deleted = 0').bind(email).first<{ n: number }>(),
    ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM post_hearts h JOIN goal_posts p ON p.id = h.post_id WHERE h.email = ? AND p.email != ?').bind(email, email).first<{ n: number }>(),
    ctx.env.DB.prepare(`SELECT COUNT(DISTINCT p.goal_id) AS n FROM post_advice a JOIN goal_posts p ON p.id = a.post_id JOIN goals g ON g.id = p.goal_id
      WHERE a.email = ? AND a.deleted = 0 AND g.status = 'done'`).bind(email).first<{ n: number }>(),
  ]);
  await award(ctx, email, S.encouragementBadges({ adviceHearted: hearted?.n || 0, heartsGiven: given?.n || 0, advisedGoalsDone: done?.n || 0 }));
}

/** a shared goal's progress (from goals.ts): a step (one post a day, counting) or the goal achieved */
export async function progress(ctx: Ctx, u: Member, goalId: string, kind: 'step' | 'goal') {
  const g = await ctx.env.DB.prepare("SELECT id, title, shared FROM goals WHERE id = ? AND email = ? AND status != 'deleted'").bind(goalId, u.email).first<{ id: string; title: string; shared: number | null }>();
  if (!g?.shared) return;
  const now = Date.now();
  if (kind === 'goal') {
    await ctx.env.DB.prepare('INSERT INTO goal_posts (id, goal_id, email, household, kind, text, steps, at, deleted) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)')
      .bind(uid(), g.id, u.email, u.household, 'goal', S.goalPostText(g.title), now).run();
    // those who advised on it: מלאך דרך
    const { results } = await ctx.env.DB.prepare('SELECT DISTINCT a.email FROM post_advice a JOIN goal_posts p ON p.id = a.post_id WHERE p.goal_id = ? AND a.deleted = 0').bind(g.id).all<{ email: string }>();
    for (const r of results) await encouragement(ctx, r.email);
    return;
  }
  const today = await ctx.env.DB.prepare("SELECT id, steps FROM goal_posts WHERE goal_id = ? AND kind = 'step' AND at > ? AND deleted = 0 ORDER BY at DESC LIMIT 1").bind(g.id, now - DAY).first<{ id: string; steps: number }>();
  if (today) await ctx.env.DB.prepare('UPDATE goal_posts SET steps = ?, text = ?, at = ? WHERE id = ?').bind(today.steps + 1, S.stepPostText(g.title, today.steps + 1), now, today.id).run();
  else await ctx.env.DB.prepare('INSERT INTO goal_posts (id, goal_id, email, household, kind, text, steps, at, deleted) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0)')
    .bind(uid(), g.id, u.email, u.household, 'step', S.stepPostText(g.title, 1), now).run();
}

/** GET /api/goals/feed – the household's shared progress of the last month */
export async function feed(ctx: Ctx) {
  const u = requireUser(ctx);
  const { results: posts } = await ctx.env.DB.prepare(`SELECT p.*, COALESCE(m.he_name, m.name) AS who,
      (SELECT COUNT(*) FROM post_hearts h WHERE h.post_id = p.id) AS hearts,
      EXISTS (SELECT 1 FROM post_hearts h WHERE h.post_id = p.id AND h.email = ?) AS hearted
    FROM goal_posts p LEFT JOIN members m ON m.email = p.email
    WHERE p.household = ? AND p.deleted = 0 AND p.at > ?
      AND EXISTS (SELECT 1 FROM goals g WHERE g.id = p.goal_id AND g.shared = 1 AND g.status != 'deleted')   -- (a deleted goal, or one no longer shared, leaves the feed)
    ORDER BY p.at DESC LIMIT 60`).bind(u.email, u.household, Date.now() - 30 * DAY).all<PostRow & { who: string; hearts: number; hearted: number }>();
  const ids = posts.map((p) => p.id);
  const advice = ids.length ? (await ctx.env.DB.prepare(`SELECT a.id, a.post_id, a.email, a.text, a.at, a.hearted, COALESCE(m.he_name, m.name) AS who FROM post_advice a
      LEFT JOIN members m ON m.email = a.email WHERE a.deleted = 0 AND a.post_id IN (${ids.map(() => '?').join(',')}) ORDER BY a.at`).bind(...ids).all<any>()).results : [];
  return json({ posts: posts.map((p) => ({ id: p.id, who: p.who || '', mine: p.email === u.email, kind: p.kind, text: p.text, at: p.at, hearts: p.hearts, hearted: !!p.hearted,
    advice: advice.filter((a) => a.post_id === p.id).map((a) => ({ id: a.id, who: a.who || '', mine: a.email === u.email, text: a.text, at: a.at, hearted: !!a.hearted })) })) });
}

/** POST /api/goals/posts/:id/heart – on, or off again */
export async function heart(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = await postOf(ctx, ctx.params.id);
  if (!S.mayHeart(await viewer(ctx, u), await ownerOf(ctx, p))) throw new HttpError(403, 'not_allowed');
  const had = await ctx.env.DB.prepare('SELECT 1 FROM post_hearts WHERE post_id = ? AND email = ?').bind(p.id, u.email).first();
  if (had) await ctx.env.DB.prepare('DELETE FROM post_hearts WHERE post_id = ? AND email = ?').bind(p.id, u.email).run();
  else { await ctx.env.DB.prepare('INSERT INTO post_hearts (post_id, email, at) VALUES (?, ?, ?)').bind(p.id, u.email, Date.now()).run(); await encouragement(ctx, u.email); }
  const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM post_hearts WHERE post_id = ?').bind(p.id).first<{ n: number }>();
  return json({ hearted: !had, hearts: n?.n || 0 });
}

/** POST /api/goals/posts/:id/advice {text} */
export async function advise(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = await postOf(ctx, ctx.params.id);
  if (!S.mayAdvise(await viewer(ctx, u), await ownerOf(ctx, p))) throw new HttpError(403, 'not_allowed');
  const text = S.cleanAdvice((await body<{ text?: string }>(ctx.req)).text);
  if (!text) throw new HttpError(400, 'text_required');
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO post_advice (id, post_id, email, text, at, hearted, deleted) VALUES (?, ?, ?, ?, ?, 0, 0)').bind(id, p.id, u.email, text, Date.now()).run();
  return json({ id });
}

/** POST /api/goals/advice/:id/heart – only the one who was advised marks it: the adviser badge for its author */
export async function heartAdvice(ctx: Ctx) {
  const u = requireUser(ctx);
  const a = await ctx.env.DB.prepare('SELECT a.id, a.email, a.hearted, p.email AS owner FROM post_advice a JOIN goal_posts p ON p.id = a.post_id WHERE a.id = ? AND a.deleted = 0')
    .bind(ctx.params.id).first<{ id: string; email: string; hearted: number; owner: string }>();
  if (!a) throw new HttpError(404, 'not_found');
  if (a.owner !== u.email) throw new HttpError(403, 'not_allowed');
  await ctx.env.DB.prepare('UPDATE post_advice SET hearted = ? WHERE id = ?').bind(a.hearted ? 0 : 1, a.id).run();
  if (!a.hearted) await encouragement(ctx, a.email);
  return json({ hearted: !a.hearted });
}
