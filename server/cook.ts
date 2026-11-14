// עוזר מטבח, the server's part (public/food/kitchen/; the owner's answers ש1–ש3, 2026-11-14):
//   * the voice chef: a question asked aloud while cooking, answered in two or three spoken sentences about this recipe
//     and this step. AI inside a tool is "free with a quota" (ש3): FREE_A_DAY questions a day are shown as free; the
//     meter and the credits gate (server/meter.ts, credits.ts) apply as for every AI call. Exempting the free questions
//     from a limited account's credits needs the master's gate (requested in docs/decisions.md).
//   * timers that ring with the app closed: the page tells the server when each timer ends; the minute cron
//     (src/worker.ts) calls tick(), which waits for the exact second and sends a push to the person's devices.
// Each person's own: a timer belongs to whoever set it.

import { z } from 'zod';
import { aiJson } from './ai';
import { Ctx, Env, HttpError, body, json, requireUser } from './core';
import { pushTo } from './push';

export const FREE_A_DAY = 5;   // until business sets the quota (ש3)

const Ask = z.object({
  title: z.string().trim().max(200).default(''),
  ingredients: z.array(z.string().max(200)).max(80).default([]),
  steps: z.array(z.string().max(1200)).max(80).default([]),
  step: z.number().int().min(0).max(80).default(0),
  q: z.string().trim().min(1).max(400),
});

const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
async function usedToday(env: Env, email: string) {
  const r = await env.DB.prepare("SELECT COUNT(DISTINCT at) AS n FROM ai_usage WHERE email = ? AND feature = 'cook/ask' AND at >= ?")
    .bind(email, dayStart()).first<{ n: number }>().catch(() => null);
  return r?.n || 0;
}

/** POST /api/cook/ask {title, ingredients, steps, step, q} → { answer, used, free } */
export async function ask(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = Ask.safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'bad_question');
  const b = p.data;
  const steps = b.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const out = await aiJson(ctx.env, {
    prefer: 'gemini',
    effort: 'low',
    schema: z.object({ answer: z.string() }),
    system: 'אתה שף ביתי חם ומעשי שעוזר למישהו שמבשל עכשיו, והתשובה שלך תוקרא בקול. ענה בעברית פשוטה, בשניים או שלושה משפטים קצרים, '
      + 'בלי רשימות, בלי כוכביות ובלי אימוג׳י. ענה על המתכון הזה ועל השלב שבו הוא נמצא. אם שואלים על תחליף, תן אחד או שניים. '
      + 'אם השאלה נוגעת לבטיחות מזון (בשר לא מבושל, אלרגיה), אמור זאת בפשטות. אם השאלה לא קשורה לבישול, אמור בנימוס שאתה עוזר רק במטבח.',
    prompt: `המתכון: ${b.title || 'בלי שם'}\nמצרכים:\n${b.ingredients.join('\n') || '(לא צוינו)'}\nשלבים:\n${steps || '(לא צוינו)'}\n`
      + `השלב שבו הוא נמצא עכשיו: ${b.step + 1}\nהשאלה: ${b.q}`,
  });
  const answer = String(out.answer || '').replace(/[*#_`]/g, '').trim().slice(0, 800) || 'לא הצלחתי לענות. נסו לשאול שוב.';
  return json({ answer, used: (await usedToday(ctx.env, u.email)) + 1, free: FREE_A_DAY });
}

/** GET /api/cook/ask → how many of today's free questions were used */
export async function quota(ctx: Ctx) {
  const u = requireUser(ctx);
  return json({ used: await usedToday(ctx.env, u.email), free: FREE_A_DAY });
}

const Timer = z.object({ id: z.string().regex(/^t[a-z0-9]{4,24}$/), name: z.string().trim().max(40).default(''), end: z.number().int().positive() });

/** PUT /api/cook/timers {timers: [{id, name, end}]} — the page's running timers, all at once (paused ones are left out) */
export async function setTimers(ctx: Ctx) {
  const u = requireUser(ctx);
  const p = z.object({ timers: z.array(Timer).max(20) }).safeParse(await body(ctx.req));
  if (!p.success) throw new HttpError(400, 'bad_timers');
  const now = Date.now();
  const keep = p.data.timers.filter((t) => t.end > now && t.end < now + 48 * 3600_000);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM cook_timers WHERE email = ?').bind(u.email),
    ...keep.map((t) => ctx.env.DB.prepare('INSERT INTO cook_timers (email, id, name, end_at) VALUES (?, ?, ?, ?)').bind(u.email, t.id, t.name || 'טיימר', t.end)),
  ]);
  return json({ ok: true, kept: keep.length });
}

/** the minute cron: every timer that ends within the coming minute rings at its second (a timer someone set rings
    even in quiet hours: it is sent as urgent) */
export async function tick(env: Env): Promise<number> {
  const now = Date.now();
  const { results } = await env.DB.prepare('SELECT email, id, name, end_at FROM cook_timers WHERE end_at <= ? ORDER BY end_at')
    .bind(now + 60_000).all<{ email: string; id: string; name: string; end_at: number }>();
  if (!results.length) return 0;
  await env.DB.batch(results.map((t) => env.DB.prepare('DELETE FROM cook_timers WHERE email = ? AND id = ?').bind(t.email, t.id)));
  const late = now - 10 * 60_000;
  let n = 0;
  for (const t of results) {
    if (t.end_at < late) continue;   // a timer that was missed by far is not rung now
    const wait = t.end_at - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    n += await pushTo(env, [t.email], { title: `⏰ ${t.name}`, body: 'הזמן נגמר.', url: '/food/kitchen/#timers', tag: `kt${t.id}`, urgent: true, kind: 'reminder' }).catch(() => 0);
  }
  return n;
}
