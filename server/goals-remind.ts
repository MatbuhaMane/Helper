// A goal that has a time reminds its person at that minute (rules: goals-remind-rules.ts). Called by the minute cron (src/worker.ts).
// The push goes through the gate with tool 'goals' and the goal's id as the item: the person's level decides (quiet by default: the
// daily summary; "נודניק" repeats until a step of the goal is done, POST /api/nag/done). Sends only a goal's title and next step.
import type { Env } from './core';
import { dayOf, restDayFor } from './goals-logic';
import { dueNow, message, nextStep, type RemindGoal, type RemindStep } from './goals-remind-rules';
import { pushTo } from './push';

const parseDays = (s: string | null) => { try { const d = JSON.parse(s || 'null'); return Array.isArray(d) ? d : null; } catch { return null; } };

export async function tick(env: Env, now = Date.now()): Promise<number> {
  const hh = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now));
  const today = dayOf(now);
  const { results } = await env.DB.prepare("SELECT email, id, title, days, time, repeat, created_at, reminded FROM goals WHERE status = 'active' AND time = ? AND (reminded IS NULL OR reminded != ?)")
    .bind(hh, today).all<{ email: string; id: string; title: string; days: string | null; time: string | null; repeat: string | null; created_at: number; reminded: string | null }>();
  let sent = 0;
  for (const r of results) {
    const g: RemindGoal = { ...r, days: parseDays(r.days) };
    const { results: pr } = await env.DB.prepare("SELECT ns, data FROM user_prefs WHERE email = ? AND ns IN ('me', 'goals')").bind(r.email).all<{ ns: string; data: string }>();
    const p: Record<string, any> = {};
    for (const x of pr) { try { p[x.ns] = JSON.parse(x.data); } catch { /* ignore */ } }
    const rest = restDayFor(p.me?.religion, p.goals && 'rest' in p.goals ? p.goals.rest : undefined);
    if (!dueNow(g, now, rest)) continue;
    await env.DB.prepare('UPDATE goals SET reminded = ? WHERE email = ? AND id = ?').bind(today, r.email, r.id).run();
    const { results: sr } = await env.DB.prepare('SELECT s.id, s.goal_id, COALESCE(p.sort, 0) AS process_sort, s.sort, s.small, s.text, s.done_at FROM goal_steps s LEFT JOIN goal_processes p ON p.email = s.email AND p.id = s.process_id WHERE s.email = ? AND s.goal_id = ?')
      .bind(r.email, r.id).all<any>();
    const steps: RemindStep[] = sr.map((s) => ({ ...s, small: !!s.small }));
    const m = message(g, nextStep(g, steps, now));
    sent += await pushTo(env, [r.email], { ...m, url: '/tools/tasks/', tag: 'goal-' + r.id, kind: 'reminder', tool: 'goals', item: r.id }).catch(() => 0);
  }
  return sent;
}
