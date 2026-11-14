// תחזוקת הבית, the pure rules (no database): the ready-made list of things a home needs, cleaning what a person sends,
// and when each thing is due. Tested by server/test-home.mjs.

export type HomeItem = {
  id: string; name: string; kind: string; every_days: number | null; last_done: string | null;
  warranty_until: string | null; note: string | null;
};
export type State = 'late' | 'soon' | 'ok' | 'new' | 'none';

/** the things most Israeli homes have, each with a sensible interval (days) and one line of what to do */
export const PRESETS: { kind: string; name: string; every_days: number; tip: string }[] = [
  { kind: 'ac_filter', name: 'מסנן המזגן', every_days: 60, tip: 'שוטפים את המסננים במים פושרים ומייבשים בצל. בעונה החמה, פעם בחודש.' },
  { kind: 'ac_service', name: 'טכנאי מזגנים', every_days: 365, tip: 'ניקוי יסודי וגז לפני הקיץ.' },
  { kind: 'boiler', name: 'הדוד', every_days: 730, tip: 'טכנאי בודק את גוף החימום ואת האנודה ומנקה אבנית.' },
  { kind: 'solar', name: 'דוד השמש', every_days: 180, tip: 'שוטפים אבק מהקולטים, בודקים שאין דליפה.' },
  { kind: 'smoke', name: 'גלאי העשן', every_days: 30, tip: 'לוחצים על כפתור הבדיקה. מחליפים סוללה פעם בשנה.' },
  { kind: 'water_filter', name: 'מסנן המים', every_days: 180, tip: 'מחליפים מחסנית, או לפי ההוראות של היצרן.' },
  { kind: 'washer', name: 'מסנן מכונת הכביסה', every_days: 90, tip: 'מנקים את המסנן למטה, ומריצים תוכנית ניקוי ריקה בחום.' },
  { kind: 'dishwasher', name: 'מסנן מדיח הכלים', every_days: 30, tip: 'מוציאים את המסנן ושוטפים.' },
  { kind: 'gutters', name: 'המרזבים', every_days: 365, tip: 'מנקים עלים לפני הגשם הראשון.' },
  { kind: 'extinguisher', name: 'מטף הכיבוי', every_days: 365, tip: 'בודקים שהמחוג בירוק ושהתוקף בתוקף.' },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export class RuleError extends Error { constructor(public code: string) { super(code); } }

/** what a person sent → a clean item (without id). Throws RuleError('bad_name' | 'bad_every' | 'bad_date'). */
export function clean(input: any, today: string): Omit<HomeItem, 'id'> {
  const preset = PRESETS.find((p) => p.kind === input?.kind);
  const name = text(input?.name, 60) || preset?.name || '';
  if (!name) throw new RuleError('bad_name');
  let every: number | null = input?.every_days == null || input.every_days === '' ? null : Math.round(Number(input.every_days));
  if (every != null && !(every >= 1 && every <= 3650)) throw new RuleError('bad_every');
  const date = (v: unknown) => {
    if (v == null || v === '') return null;
    if (!isDate(v)) throw new RuleError('bad_date');
    return v;
  };
  const last = date(input?.last_done);
  if (last && last > today) throw new RuleError('bad_date');   // nothing is done in the future
  return { name, kind: preset ? preset.kind : 'custom', every_days: every, last_done: last, warranty_until: date(input?.warranty_until), note: text(input?.note, 300) || null };
}

const day = 86400000;
export const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * day).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / day);

/** when it is next due, and how it stands today. "soon" is within a week (or a tenth of the interval, if shorter). */
export function due(it: Pick<HomeItem, 'every_days' | 'last_done'>, today: string): { next: string | null; state: State; days: number | null } {
  if (!it.every_days) return { next: null, state: 'none', days: null };
  if (!it.last_done) return { next: null, state: 'new', days: null };
  const next = addDays(it.last_done, it.every_days);
  const days = daysBetween(today, next);
  const near = Math.min(7, Math.max(1, Math.round(it.every_days / 10)));
  return { next, days, state: days < 0 ? 'late' : days <= near ? 'soon' : 'ok' };
}

/** the morning reminder (the owner's answer ש7): the due date to remind about today, or null. It goes on the day an item
    is due, or the first morning it is late, and once for each due date (reminded holds the last one). */
export function remindFor(it: Pick<HomeItem, 'every_days' | 'last_done'> & { reminded?: string | null }, today: string): string | null {
  const d = due(it, today);
  if (!d.next || d.days == null || d.days > 0) return null;
  return it.reminded === d.next ? null : d.next;
}

/** the warranty: 'over', 'ending' (within 60 days), 'on', or null when none was written */
export function warranty(until: string | null, today: string): { state: 'over' | 'ending' | 'on'; days: number } | null {
  if (!until) return null;
  const days = daysBetween(today, until);
  return { days, state: days < 0 ? 'over' : days <= 60 ? 'ending' : 'on' };
}

const ORDER: Record<State, number> = { late: 0, soon: 1, new: 2, ok: 3, none: 4 };
/** the list as the page shows it: what is late first, then soon, then the rest by the date it is due */
export function sortItems<T extends HomeItem>(items: T[], today: string) {
  return items.map((it) => ({ ...it, due: due(it, today), warranty: warranty(it.warranty_until, today) }))
    .sort((a, b) => ORDER[a.due.state] - ORDER[b.due.state] || (a.due.next || '9').localeCompare(b.due.next || '9') || a.name.localeCompare(b.name, 'he'));
}
