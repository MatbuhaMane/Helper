// The coach's pushes (wave 2, the הקפדה coach; owner 2026-11-15): short human words from the coach, no AI and nothing but the dates of
// the person's own workouts (prefs 'hakpada', .done = timestamps). Two moments a day, Israel time; the level decides what the person
// gets (tool 'coach', item 'nudge' or 'cheer'; quiet by default = only the daily summary). Pure rules; tested in test-coach-remind.mjs.
import { daysBetween, dayOf, weekday } from './goals-logic';

export const NUDGE_AT = '18:30';
export const CHEER_AT = '20:30';
export type CoachKind = 'nudge' | 'cheer';
export const kindAt = (hhmm: string): CoachKind | null => (hhmm === NUDGE_AT ? 'nudge' : hhmm === CHEER_AT ? 'cheer' : null);

/** the words for one person at one moment, or null: nothing to say. `done` are the workout timestamps, `rest` the weekly rest day. */
export function words(kind: CoachKind, done: unknown, now: number, rest: number | null): { title: string; body: string } | null {
  if (!Array.isArray(done)) return null;
  const days = [...new Set(done.filter((t): t is number => typeof t === 'number' && t > 0 && t <= now).map((t) => dayOf(t)))].sort();
  if (!days.length) return null;
  const today = dayOf(now);
  if (rest !== null && weekday(today) === rest) return null;
  const last = days[days.length - 1];
  if (kind === 'cheer') {
    if (last !== today) return null;
    const week = days.filter((d) => daysBetween(d, today) < 7).length;
    return { title: '💪 המאמן', body: week >= 3 ? `כבר ${week} אימונים השבוע. כל הכבוד, ממשיכים!` : 'כל הכבוד על האימון היום!' };
  }
  const gap = daysBetween(last, today);
  if (gap < 2 || gap > 14) return null;   // a day off is fine; after two weeks the coach stops nagging and waits to be asked
  return { title: '💪 המאמן', body: gap < 4 ? `עברו ${gap} ימים מהאימון האחרון. אימון קצר היום?` : `עברו ${gap} ימים בלי אימון. אפשר להתחיל בקטן, אימון של עשר דקות.` };
}
