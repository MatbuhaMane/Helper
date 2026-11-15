// A goal's reminder (vision batch 28 + 31): a goal that has a time ("HH:MM") reminds its person at that minute, on the days the goal
// works (no days: every day but the rest day), once a day, with the next open step. Pure rules, no network; tested in test-goals-remind.mjs.
// The level (off / quiet / normal / nag) is not decided here: the push gate does it, by tool 'goals' and the goal's id as the item.
import { dayOf, parseRepeat, periodStart, weekday } from './goals-logic';

export interface RemindGoal { id: string; title: string; days: number[] | null; time: string | null; repeat: string | null; created_at: number; reminded: string | null }
export interface RemindStep { id: string; goal_id: string; process_sort: number; sort: number; small: boolean; text: string; done_at: number | null }

/** "HH:MM" of an instant in Israel */
export const hhmmOf = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));

/** is this goal to be reminded at this minute? */
export function dueNow(g: RemindGoal, now: number, rest: number | null): boolean {
  if (!g.time || g.time !== hhmmOf(now)) return false;
  const today = dayOf(now);
  if (g.reminded === today) return false;
  const wd = weekday(today);
  if (rest !== null && wd === rest) return false;
  if (g.days?.length && !g.days.includes(wd)) return false;
  return true;
}

/** the next open step of the goal (a recurring goal counts only what was done in the running round), small ones first; null: nothing left to do */
export function nextStep(g: RemindGoal, steps: RemindStep[], now: number): RemindStep | null {
  const r = parseRepeat(g.repeat), today = dayOf(now);
  const since = r ? periodStart(r, dayOf(g.created_at), today) : null;
  const open = steps.filter((s) => s.goal_id === g.id && !(s.done_at && (!since || dayOf(s.done_at) >= since)));
  open.sort((a, b) => a.process_sort - b.process_sort || (a.small ? -1 : 0) - (b.small ? -1 : 0) || a.sort - b.sort);
  return open[0] || null;
}

/** the words of the notification */
export function message(g: RemindGoal, step: RemindStep | null) {
  return { title: '🎯 ' + g.title.slice(0, 80), body: step ? 'הצעד הבא: ' + step.text.slice(0, 160) : 'הגיע הזמן לעבוד על המטרה.' };
}
