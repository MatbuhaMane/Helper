// Goals part 2 (vision batch 28, docs/vision/goals.md "חלק 2", docs/design/goals-2.md): a consultation with the AI about one goal,
// "שמור מסקנה" (a conclusion pinned to the goal), and "עזור לי להגדיר" (the AI helps word a new goal).
// Free with a quota like every AI inside a tool (docs/business/ai-quota.md §5): FREE_A_DAY messages a person a day, renewed at midnight
// Israel time; beyond it 402 quota_done, and the page lets the person go on in credits (paid: true), as the chef does.
// Privacy: the conversation is NOT stored. Only what the person pins is kept (goal_notes), on their own goal.

import { z } from 'zod';
import { aiJson } from './ai';
import { dayStart } from './cook';
import { Ctx, HttpError, body, json, requireUser, uid } from './core';
import { freeOfCredits } from './meter';

export const FREE_A_DAY = 10;
const FEATURES = ['goals/ask', 'goals/ai/define'];

async function usedToday(env: Ctx['env'], email: string) {
  const r = await env.DB.prepare(`SELECT COUNT(DISTINCT at) AS n FROM ai_usage WHERE email = ? AND feature IN (${FEATURES.map(() => '?').join(',')}) AND own_key IS NULL AND at >= ?`)
    .bind(email, ...FEATURES, dayStart()).first<{ n: number }>().catch(() => null);
  return r?.n || 0;
}
async function read<T extends z.ZodTypeAny>(ctx: Ctx, schema: T): Promise<z.infer<T>> {
  const p = schema.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'bad_question');
  return p.data;
}
const History = z.array(z.object({ r: z.enum(['me', 'ai']), t: z.string().max(1500) })).max(8).default([]);
const talk = (h: z.infer<typeof History>) => h.map((m) => (m.r === 'me' ? 'האדם: ' : 'אתה: ') + m.t).join('\n');
const plain = (s: unknown, n: number) => String(s || '').replace(/[*#_`]/g, '').trim().slice(0, n);

/** the free messages: take one, or refuse (402) when they are done and the person did not choose to go on */
async function spend(ctx: Ctx, email: string, paid: boolean) {
  const used = await usedToday(ctx.env, email);
  if (used >= FREE_A_DAY && !paid) throw new HttpError(402, 'quota_done');
  if (used < FREE_A_DAY) freeOfCredits();
  return used;
}

/** GET /api/goals/ask → { used, free } */
export async function quota(ctx: Ctx) {
  const u = requireUser(ctx);
  return json({ used: await usedToday(ctx.env, u.email), free: FREE_A_DAY });
}

const Ask = z.object({ goal: z.string().min(1).max(60), q: z.string().trim().min(1).max(1000), history: History, paid: z.boolean().default(false) });
/** POST /api/goals/ask { goal, q, history, paid? } → { answer, used, free } — advice on one of the person's goals */
export async function ask(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await read(ctx, Ask);
  const g = await ctx.env.DB.prepare("SELECT id, title, why, kind, due FROM goals WHERE email = ? AND id = ? AND status != 'deleted'").bind(u.email, b.goal)
    .first<{ id: string; title: string; why: string | null; kind: string; due: string | null }>();
  if (!g) throw new HttpError(404, 'not_found');
  const used = await spend(ctx, u.email, b.paid);
  const [procs, steps, notes] = await Promise.all([
    ctx.env.DB.prepare('SELECT id, title FROM goal_processes WHERE email = ? AND goal_id = ? ORDER BY sort LIMIT 12').bind(u.email, g.id).all<{ id: string; title: string }>(),
    ctx.env.DB.prepare('SELECT process_id, text, done_at FROM goal_steps WHERE email = ? AND goal_id = ? ORDER BY sort LIMIT 60').bind(u.email, g.id).all<{ process_id: string; text: string; done_at: number | null }>(),
    ctx.env.DB.prepare('SELECT text FROM goal_notes WHERE email = ? AND goal_id = ? ORDER BY at DESC LIMIT 8').bind(u.email, g.id).all<{ text: string }>().catch(() => ({ results: [] as { text: string }[] })),
  ]);
  const path = procs.results.map((p) => `- ${p.title}: ` + steps.results.filter((s) => s.process_id === p.id).map((s) => (s.done_at ? '[v] ' : '[ ] ') + s.text).join('; ')).join('\n');
  const out = await aiJson(ctx.env, {
    prefer: 'claude', effort: 'low', schema: z.object({ answer: z.string() }),
    system: 'אתה יועץ חם, מעשי וכן שמלווה אדם בדרך למטרה שלו, בתוך אפליקציה משפחתית. ענה בעברית פשוטה, בקצרה (עד כ-120 מילים), בלי כוכביות ובלי אימוג׳י. '
      + 'התייחס למטרה ולצעדים שלה בפועל, תן המלצה אחת או שתיים שאפשר לעשות היום, ושאל שאלה אחת אם חסר לך משהו. אל תלחץ ואל תשפוט. '
      + 'אם השאלה לא קשורה למטרה, החזר בנימוס לעניין. בענייני בריאות, כסף או משפט אמור שזה כללי ושכדאי להתייעץ עם איש מקצוע.',
    prompt: `המטרה: ${g.title}\nלמה זה חשוב: ${g.why || '(לא נאמר)'}\nסוג: ${g.kind}${g.due ? `, עד ${g.due}` : ''}\nהדרך:\n${path || '(עוד אין תהליכים)'}\n`
      + (notes.results.length ? `מה שהאדם כבר החליט:\n${notes.results.map((n) => '- ' + n.text).join('\n')}\n` : '')
      + (b.history.length ? `השיחה עד כאן:\n${talk(b.history)}\n` : '') + `השאלה עכשיו: ${b.q}`,
  });
  return json({ answer: plain(out.answer, 1200) || 'לא הצלחתי לענות. נסו לשאול שוב.', used: used + 1, free: FREE_A_DAY });
}

const Define = z.object({ q: z.string().trim().min(1).max(1000), history: History, paid: z.boolean().default(false) });
/** POST /api/goals/ai/define { q, history, paid? } → { answer, draft?: { title, why }, used, free } — help wording a new goal; a draft comes when it is ready */
export async function define(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await read(ctx, Define);
  const used = await spend(ctx, u.email, b.paid);
  const out = await aiJson(ctx.env, {
    prefer: 'claude', effort: 'low', schema: z.object({ answer: z.string(), title: z.string().default(''), why: z.string().default('') }),
    system: 'אתה עוזר לאדם לנסח מטרה ברורה, בתוך אפליקציה משפחתית. שאל שאלה קצרה אחת בכל פעם (מה בדיוק, למה זה חשוב לו, עד מתי, איך ידע שהצליח), בעברית פשוטה, בלי כוכביות ובלי אימוג׳י. '
      + 'כשיש לך מספיק, החזר ב-title ניסוח של המטרה במשפט אחד (עד 12 מילים, ברור ואפשר למדוד) וב-why משפט אחד על למה זה חשוב לאדם, בלשון שלו. '
      + 'כל עוד אין מספיק, השאר title ו-why ריקים. ב-answer כתוב מה שאתה אומר לאדם עכשיו.',
    prompt: (b.history.length ? `השיחה עד כאן:\n${talk(b.history)}\n` : '') + `האדם אומר עכשיו: ${b.q}`,
  });
  const title = plain(out.title, 200), why = plain(out.why, 1000);
  return json({ answer: plain(out.answer, 800) || 'ספרו לי עוד על המטרה.', draft: title ? { title, why } : null, used: used + 1, free: FREE_A_DAY });
}

/** POST /api/goals/:id/notes { text } → { note } — "שמור מסקנה": pin what was decided to the goal */
export async function addNote(ctx: Ctx) {
  const u = requireUser(ctx);
  const b = await read(ctx, z.object({ text: z.string().trim().min(1).max(600) }));
  const g = await ctx.env.DB.prepare("SELECT 1 AS ok FROM goals WHERE email = ? AND id = ? AND status != 'deleted'").bind(u.email, ctx.params.id).first();
  if (!g) throw new HttpError(404, 'not_found');
  const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM goal_notes WHERE email = ? AND goal_id = ?').bind(u.email, ctx.params.id).first<{ n: number }>();
  if ((n?.n || 0) >= 30) throw new HttpError(400, 'too_many');
  const note = { id: uid(), text: plain(b.text, 600), at: Date.now() };
  await ctx.env.DB.prepare('INSERT INTO goal_notes (email, goal_id, id, text, at) VALUES (?, ?, ?, ?, ?)').bind(u.email, ctx.params.id, note.id, note.text, note.at).run();
  return json({ note });
}
/** DELETE /api/goals/notes/:id */
export async function removeNote(ctx: Ctx) {
  const u = requireUser(ctx);
  await ctx.env.DB.prepare('DELETE FROM goal_notes WHERE email = ? AND id = ?').bind(u.email, ctx.params.id).run();
  return json({ ok: true });
}
/** the pinned conclusions of every goal of a person, for the goals list */
export async function notesOf(env: Ctx['env'], email: string) {
  const { results } = await env.DB.prepare('SELECT goal_id, id, text, at FROM goal_notes WHERE email = ? ORDER BY at DESC LIMIT 600').bind(email)
    .all<{ goal_id: string; id: string; text: string; at: number }>().catch(() => ({ results: [] as { goal_id: string; id: string; text: string; at: number }[] }));
  return results;
}
