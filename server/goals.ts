// ניהול מטרות (vision's spec v1, docs/vision/goals.md): goals → processes (checklists) → small daily steps, each person's
// own, on the server so they follow them between devices. The logic without a database is goals-logic.ts (tested).
// Without AI: templates by the goal's words, guided questions when stuck, and the browser's own speech-to-text (on the page).
// With AI (✨, the person's own AI or credit): breaking a goal into processes, and small versions of a stuck step.
// Later (not v1): sharing, following a friend, advice, family goals and templates; a step as a calendar event or a gathering.

import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, HttpError, body, json, requireUser, uid } from './core';
import * as L from './goals-logic';
import * as D from './discover-logic';
import * as Social from './goal-social';

/** the request's body by a schema, or a 400 */
async function read<T extends z.ZodTypeAny>(ctx: Ctx, schema: T): Promise<z.infer<T>> {
  const p = schema.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid request');
  return p.data;
}
const Kind = z.enum(['short', 'regular', 'long']);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Text = (max: number) => z.string().trim().min(1).max(max);
const NewGoal = z.object({
  title: Text(200), why: z.string().trim().max(1000).default(''), kind: Kind.default('regular'),
  due: Day.nullable().optional(), days: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), template: z.string().max(30).nullable().optional(),
  processes: z.array(z.object({ title: Text(160), steps: z.array(Text(300)).max(40).default([]) })).max(20).default([]),
});
const GoalEdit = z.object({
  title: Text(200).optional(), why: z.string().trim().max(1000).optional(), kind: Kind.optional(), due: Day.nullable().optional(),
  days: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(), time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  status: z.enum(['active', 'done', 'archived']).optional(),
  shared: z.boolean().optional(),   // share its progress with the household (goal-social.ts)
});

/** the person's rest day: their own choice in prefs 'goals', else by the tradition in prefs 'me' */
async function restOf(ctx: Ctx, email: string) {
  const { results } = await ctx.env.DB.prepare("SELECT ns, data FROM user_prefs WHERE email = ? AND ns IN ('me', 'goals')").bind(email).all<{ ns: string; data: string }>();
  const p: Record<string, any> = {};
  for (const r of results) { try { p[r.ns] = JSON.parse(r.data); } catch { /* ignore */ } }
  const chosen = p.goals && 'rest' in p.goals ? p.goals.rest : undefined;
  return L.restDayFor(p.me?.religion, chosen);
}

async function all(ctx: Ctx, email: string) {
  const db = ctx.env.DB;
  const [g, p, s] = await Promise.all([
    db.prepare("SELECT * FROM goals WHERE email = ? AND status != 'deleted' ORDER BY sort, created_at").bind(email).all<any>(),
    db.prepare('SELECT * FROM goal_processes WHERE email = ? ORDER BY sort, created_at').bind(email).all<any>(),
    db.prepare('SELECT * FROM goal_steps WHERE email = ? ORDER BY sort, created_at').bind(email).all<any>(),
  ]);
  return { goals: g.results, processes: p.results, steps: s.results };
}
const parseDays = (s: string | null) => { try { const d = JSON.parse(s || 'null'); return Array.isArray(d) ? d : null; } catch { return null; } };

/** the badges earned now that were not before: kept, and returned so the page can celebrate them */
async function newBadges(ctx: Ctx, email: string, data: Awaited<ReturnType<typeof all>>, rest: number | null, today: string) {
  const doneAt = data.steps.filter((s) => s.done_at).map((s) => s.done_at as number);
  const byProcess = new Map<string, { n: number; done: number }>();
  for (const s of data.steps) { const b = byProcess.get(s.process_id) || { n: 0, done: 0 }; b.n++; if (s.done_at) b.done++; byProcess.set(s.process_id, b); }
  const longs = data.goals.filter((g) => g.kind === 'long' && g.status === 'active').map((g) => g.created_at as number);
  const ids = L.earned({
    doneAt, rest, today,
    processesDone: [...byProcess.values()].filter((b) => b.n && b.n === b.done).length,
    goalsDone: data.goals.filter((g) => g.status === 'done' && g.done_at).map((g) => ({ kind: g.kind, created: g.created_at, done: g.done_at })),
    longActiveSince: longs.length ? Math.min(...longs) : null,
  });
  const researched = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM researches WHERE email = ? AND done_at IS NOT NULL').bind(email).first<{ n: number }>().catch(() => null);
  const ids1 = (researched?.n || 0) > 0 && !ids.includes('tracker') ? [...ids, 'tracker'] : ids;
  // the tools already opened (also before their badges existed): each its badge, and "סייר" at 10 (server/discover.ts)
  const visited = (await ctx.env.DB.prepare('SELECT tool FROM tool_visits WHERE email = ?').bind(email).all<{ tool: string }>().catch(() => ({ results: [] as { tool: string }[] }))).results.map((r) => r.tool);
  const toolIds = D.TOOL_BADGES.map((b) => b.id).filter((id) => visited.includes(id.slice(5)));
  const ids2 = [...ids1, ...toolIds, ...(D.progress(visited).scout ? ['scout'] : [])];
  const { results } = await ctx.env.DB.prepare('SELECT badge, earned_at FROM goal_badges WHERE email = ?').bind(email).all<{ badge: string; earned_at: number }>();
  const had = new Set(results.map((r) => r.badge));
  const fresh = ids2.filter((id) => !had.has(id));
  if (fresh.length) {
    const now = Date.now();
    await ctx.env.DB.batch(fresh.map((b) => ctx.env.DB.prepare('INSERT OR IGNORE INTO goal_badges (email, badge, earned_at) VALUES (?, ?, ?)').bind(email, b, now)));
  }
  return { earned: [...results.map((r) => ({ id: r.badge, at: r.earned_at })), ...fresh.map((id) => ({ id, at: Date.now() }))], fresh };
}

/** GET /api/goals → everything for the dashboard: the goals with their processes and steps, today's steps, the week, the
    streak, whether the "why" or the weekly review is due, the badges (with the ones just earned) */
export async function list(ctx: Ctx) {
  const u = requireUser(ctx);
  const [data, rest] = await Promise.all([all(ctx, u.email), restOf(ctx, u.email)]);
  const today = L.dayOf(Date.now());
  const done: L.Done = new Set(data.steps.filter((s) => s.done_at).map((s) => L.dayOf(s.done_at)));
  const steps = data.steps.map((s) => ({ id: s.id, goal: s.goal_id, process: s.process_id, text: s.text, sort: s.sort, done: !!s.done_at, small: !!s.small, doneAt: s.done_at || null }));
  const goals = data.goals.map((g) => ({
    id: g.id, title: g.title, why: g.why || '', kind: g.kind, due: g.due || null, days: parseDays(g.days), time: g.time || null, status: g.status,
    template: g.template || null, sort: g.sort, createdAt: g.created_at, doneAt: g.done_at || null, shared: !!g.shared,
    processes: data.processes.filter((p) => p.goal_id === g.id).map((p) => ({ id: p.id, title: p.title, sort: p.sort, steps: steps.filter((s) => s.process === p.id) })),
  }));
  const today3 = L.todays(goals.map((g) => ({ ...g })), data.processes.map((p) => ({ id: p.id, goal: p.goal_id, sort: p.sort })), steps, today, rest);
  const review = await ctx.env.DB.prepare('SELECT week FROM goal_reviews WHERE email = ? ORDER BY week DESC LIMIT 1').bind(u.email).first<{ week: string }>();
  // one open thread of the research assistant for today ("חוט אחד ליום")
  const threads = await ctx.env.DB.prepare("SELECT t.id, t.text, t.research_id, r.title FROM research_threads t JOIN researches r ON r.email = t.email AND r.id = t.research_id WHERE t.email = ? AND t.status = 'open' AND r.status != 'deleted' ORDER BY t.created_at")
    .bind(u.email).all<{ id: string; text: string; research_id: string; title: string }>().catch(() => ({ results: [] as { id: string; text: string; research_id: string; title: string }[] }));
  const thread = L.threadOfDay(threads.results, today);
  const badges = await newBadges(ctx, u.email, data, rest, today);
  // the "why" of the goal that waited longest, with its smallest next step
  let why = null;
  if (L.whyDue(done, today, rest)) {
    const active = goals.filter((g) => g.status === 'active' && g.why);
    const g = active.sort((a, b) => lastStep(a) - lastStep(b))[0];
    if (g) why = { goal: g.id, title: g.title, why: g.why, step: steps.filter((s) => s.goal === g.id && !s.done).sort((a, b) => (b.small ? 1 : 0) - (a.small ? 1 : 0))[0] || null };
  }
  function lastStep(g: { id: string }) { return Math.max(0, ...steps.filter((s) => s.goal === g.id && s.doneAt).map((s) => s.doneAt as number)); }
  return json({
    goals, today: today3, date: today, rest, isRest: rest !== null && L.weekday(today) === rest,
    thread: thread ? { id: thread.id, text: thread.text, research: thread.research_id, researchTitle: thread.title } : null,
    week: L.week(done, today, rest), streak: L.streak(done, today, rest), why,
    review: L.reviewDue(today, rest, review?.week || null),
    badges: { earned: badges.earned, fresh: badges.fresh },
    // (the family badges wait for the shared goals: not shown until they can be earned – the readiness bar)
    catalog: L.BADGES.filter((b) => !b.soon).map((b) => ({ ...b, name: L.badgeName(b, rest) })),
  });
}

/** GET /api/goals/template?text= | ?id= → a template's processes (without AI) */
export async function template(ctx: Ctx) {
  requireUser(ctx);
  const id = ctx.url.searchParams.get('id');
  const t = id ? L.templateById(id) : L.templateFor(ctx.url.searchParams.get('text') || '');
  if (!t) throw new HttpError(404, 'Not found');
  return json({ template: { id: t.id, name: t.name, processes: t.processes }, all: L.TEMPLATES.map((x) => ({ id: x.id, name: x.name })), stuck: { prompts: L.STUCK_PROMPTS, starters: L.SMALL_STARTERS } });
}

/** POST /api/goals → a goal with its processes and steps */
export async function create(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = NewGoal.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid goal');
  return json({ ok: true, id: await insertGoal(ctx, u.email, p.data) });
}
/** a goal with its processes and steps (also for the research assistant: a research becomes a goal of the same engine) */
export async function insertGoal(ctx: Ctx, email: string, g: z.infer<typeof NewGoal>) {
  const now = Date.now(), id = uid(), db = ctx.env.DB;
  const count = await db.prepare("SELECT COUNT(*) AS n FROM goals WHERE email = ? AND status != 'deleted'").bind(email).first<{ n: number }>();
  if ((count?.n || 0) >= 200) throw new HttpError(400, 'too_many_goals');
  const stmts = [db.prepare('INSERT INTO goals (email, id, title, why, kind, due, status, days, time, template, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(email, id, g.title, g.why, g.kind, g.due || null, 'active', g.days ? JSON.stringify(g.days) : null, g.time || null, g.template || null, now, now, now)];
  g.processes.forEach((pr, i) => {
    const pid = uid();
    stmts.push(db.prepare('INSERT INTO goal_processes (email, goal_id, id, title, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(email, id, pid, pr.title, i, now));
    pr.steps.forEach((t, k) => stmts.push(db.prepare('INSERT INTO goal_steps (email, goal_id, process_id, id, text, sort, small, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)').bind(email, id, pid, uid(), t, k, now)));
  });
  await db.batch(stmts);
  return id;
}
export { NewGoal };

/** PUT /api/goals/:id */
export async function update(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = GoalEdit.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'Invalid goal');
  const d = p.data, sets: string[] = [], vals: unknown[] = [];
  const put = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };
  if (d.title !== undefined) put('title', d.title);
  if (d.why !== undefined) put('why', d.why);
  if (d.kind !== undefined) put('kind', d.kind);
  if (d.due !== undefined) put('due', d.due);
  if (d.days !== undefined) put('days', d.days ? JSON.stringify(d.days) : null);
  if (d.time !== undefined) put('time', d.time);
  if (d.status !== undefined) { put('status', d.status); put('done_at', d.status === 'done' ? Date.now() : null); }
  if (d.shared !== undefined) put('shared', d.shared ? 1 : 0);
  if (!sets.length) return json({ ok: true });
  put('updated_at', Date.now());
  const r = await ctx.env.DB.prepare(`UPDATE goals SET ${sets.join(', ')} WHERE email = ? AND id = ? AND status != 'deleted'`).bind(...vals, u.email, ctx.params.id).run();
  if (!r.meta.changes) throw new HttpError(404, 'Not found');
  if (d.status === 'done') await Social.progress(ctx, u, ctx.params.id, 'goal');
  return json({ ok: true });
}

/** DELETE /api/goals/:id (kept as deleted, out of sight) */
export async function remove(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare("UPDATE goals SET status = 'deleted', updated_at = ? WHERE email = ? AND id = ?").bind(Date.now(), u.email, ctx.params.id).run();
  return json({ ok: true });
}

const own = async (ctx: Ctx, email: string, table: 'goals' | 'goal_processes' | 'goal_steps', id: string) => {
  const r = await ctx.env.DB.prepare(`SELECT * FROM ${table} WHERE email = ? AND id = ?`).bind(email, id).first<any>();
  if (!r) throw new HttpError(404, 'Not found');
  return r;
};

/** POST /api/goals/:id/processes {title} */
export async function addProcess(ctx: Ctx) {
  const u = requireUser(ctx);
  await own(ctx, u.email, 'goals', ctx.params.id);
  const { title } = await read(ctx, z.object({ title: Text(160) }));
  const id = uid(), n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM goal_processes WHERE email = ? AND goal_id = ?').bind(u.email, ctx.params.id).first<{ n: number }>();
  await ctx.env.DB.prepare('INSERT INTO goal_processes (email, goal_id, id, title, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(u.email, ctx.params.id, id, title, n?.n || 0, Date.now()).run();
  return json({ ok: true, id });
}
/** PUT /api/goals/processes/:id {title} · DELETE (with its steps) */
export async function editProcess(ctx: Ctx) {
  const u = requireUser(ctx);
  await own(ctx, u.email, 'goal_processes', ctx.params.id);
  const { title } = await read(ctx, z.object({ title: Text(160) }));
  await ctx.env.DB.prepare('UPDATE goal_processes SET title = ? WHERE email = ? AND id = ?').bind(title, u.email, ctx.params.id).run();
  return json({ ok: true });
}
export async function removeProcess(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM goal_steps WHERE email = ? AND process_id = ?').bind(u.email, ctx.params.id),
    ctx.env.DB.prepare('DELETE FROM goal_processes WHERE email = ? AND id = ?').bind(u.email, ctx.params.id),
  ]);
  return json({ ok: true });
}

/** POST /api/goals/processes/:id/steps {text, small?, before?} – a step (a 5-minute version goes before the step it eases) */
export async function addStep(ctx: Ctx) {
  const u = requireUser(ctx);
  const pr = await own(ctx, u.email, 'goal_processes', ctx.params.id);
  const b = await read(ctx, z.object({ text: Text(300), small: z.boolean().optional(), before: z.string().max(40).optional() }));
  let sort: number;
  if (b.before) sort = ((await own(ctx, u.email, 'goal_steps', b.before)).sort as number) - 0.5;
  else sort = ((await ctx.env.DB.prepare('SELECT MAX(sort) AS m FROM goal_steps WHERE email = ? AND process_id = ?').bind(u.email, pr.id).first<{ m: number | null }>())?.m ?? -1) + 1;
  const id = uid();
  await ctx.env.DB.prepare('INSERT INTO goal_steps (email, goal_id, process_id, id, text, sort, small, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(u.email, pr.goal_id, pr.id, id, b.text, sort, b.small ? 1 : 0, Date.now()).run();
  return json({ ok: true, id });
}

/** PUT /api/goals/steps/:id {text?, done?} → with done: the badges just earned, and whether the goal is all done */
export async function editStep(ctx: Ctx) {
  const u = requireUser(ctx);
  const s = await own(ctx, u.email, 'goal_steps', ctx.params.id);
  const b = await read(ctx, z.object({ text: Text(300).optional(), done: z.boolean().optional() }));
  if (b.text !== undefined) await ctx.env.DB.prepare('UPDATE goal_steps SET text = ? WHERE email = ? AND id = ?').bind(b.text, u.email, s.id).run();
  if (b.done === undefined) return json({ ok: true });
  await ctx.env.DB.prepare('UPDATE goal_steps SET done_at = ? WHERE email = ? AND id = ?').bind(b.done ? Date.now() : null, u.email, s.id).run();
  if (!b.done) return json({ ok: true });
  await Social.progress(ctx, u, s.goal_id, 'step');   // (a shared goal: the household's feed)
  const [data, rest] = await Promise.all([all(ctx, u.email), restOf(ctx, u.email)]);
  const { fresh } = await newBadges(ctx, u.email, data, rest, L.dayOf(Date.now()));
  const left = data.steps.filter((x) => x.goal_id === s.goal_id && !x.done_at).length;
  return json({ ok: true, fresh, goalDone: left === 0 });
}
/** DELETE /api/goals/steps/:id */
export async function removeStep(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM goal_steps WHERE email = ? AND id = ?').bind(u.email, ctx.params.id).run();
  return json({ ok: true });
}

/** POST /api/goals/review {good, stuck, change} – the weekly minute */
export async function review(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await read(ctx, z.object({ good: z.string().max(1000).default(''), stuck: z.string().max(1000).default(''), change: z.string().max(1000).default('') }));
  const day = L.dayOf(Date.now());
  await ctx.env.DB.prepare('INSERT INTO goal_reviews (email, week, good, stuck, change, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email, week) DO UPDATE SET good = excluded.good, stuck = excluded.stuck, change = excluded.change')
    .bind(u.email, day, b.good, b.stuck, b.change, Date.now()).run();
  return json({ ok: true });
}

/* ---------------- ✨ (the person's own AI or credit; 402 invites when none is left) ---------------- */

const Plan = z.object({ processes: z.array(z.object({ title: z.string(), steps: z.array(z.string()) })) });
/** POST /api/goals/ai/plan {title, why, kind} → processes, each with small steps */
export async function aiPlan(ctx: Ctx) {
  requireUser(ctx);
  const b = await read(ctx, z.object({ title: Text(200), why: z.string().max(1000).default(''), kind: Kind.default('regular') }));
  const r = await aiJson(ctx.env, {
    prefer: 'gemini', fast: true, schema: Plan,
    system: `You help a person in Israel turn a goal into a clear path. Write in Hebrew. Break the goal into 3–6 processes (parts that are easy to grasp), in order; each with 2–5 small, concrete steps that take 5–30 minutes and start with a verb in the infinitive ("לכתוב…", "להתקשר ל…"). ${b.kind === 'short' ? 'The goal is short (under a day): 1–2 processes, few steps.' : b.kind === 'long' ? 'The goal is long (over a year): processes are stages, steps only for the first stages.' : ''} No preaching, no generic advice. JSON only: {"processes": [{"title": "", "steps": [""]}]}`,
    prompt: `The goal: ${b.title}\nWhy it matters: ${b.why || '(not given)'}`,
  });
  const clean = r.processes.map((p) => ({ title: p.title.trim().slice(0, 160), steps: p.steps.map((s) => s.trim().slice(0, 300)).filter(Boolean).slice(0, 8) })).filter((p) => p.title && p.steps.length).slice(0, 8);
  if (!clean.length) throw new HttpError(502, 'ai_failed');
  return json({ processes: clean });
}

const Small = z.object({ steps: z.array(z.string()) });
/** POST /api/goals/ai/stuck {step, goal} → three 5-minute versions of a step */
export async function aiStuck(ctx: Ctx) {
  requireUser(ctx);
  const b = await read(ctx, z.object({ step: Text(300), goal: z.string().max(200).default('') }));
  const r = await aiJson(ctx.env, {
    prefer: 'gemini', fast: true, schema: Small,
    system: 'A person is stuck on a step toward their goal. Offer exactly three much smaller versions of it, each doable in about five minutes, concrete, in Hebrew, each starting with a verb in the infinitive. No advice, no explanations. JSON only: {"steps": ["", "", ""]}',
    prompt: `The goal: ${b.goal}\nThe step that feels too big: ${b.step}`,
  });
  return json({ steps: r.steps.map((s) => s.trim().slice(0, 300)).filter(Boolean).slice(0, 3) });
}
