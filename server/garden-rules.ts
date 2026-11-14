// הגינה (docs/vision/future-specs.md §4), the pure rules (no database, no AI): the ready-made plants, cleaning what a
// person sends, and when each plant needs water. Watering follows the weather by a fixed rule (the spec: no AI):
// rain counts as watering for a plant outside, and a hot day brings the next watering a day earlier. Tested by
// server/test-garden.mjs.

export type Plant = {
  id: string; name: string; kind: string; place: 'in' | 'out'; every_days: number; last_watered: string | null; note: string | null;
};
/** the weather where the household is: today's highest temperature, and the last day (yesterday or today) it rained enough
    to water a garden (at least RAIN_MM), or null */
export type Wx = { max: number | null; rained: string | null };
export type State = 'late' | 'today' | 'soon' | 'ok' | 'new';

export const RAIN_MM = 4;      // a rain of at least this much waters the plants outside
export const HOT_OUT = 32;     // from this, the plants outside are watered a day earlier
export const HOT_IN = 35;      // from this, the plants inside too

/** the plants most Israeli homes grow (each has its picture in /assets/kit/garden/<kind>.webp) */
export const PRESETS: { kind: string; name: string; place: 'in' | 'out'; every_days: number; tip: string }[] = [
  { kind: 'basil', name: 'ריחן (בזיליקום)', place: 'out', every_days: 2, tip: 'אוהב שמש ואדמה לחה. קוטמים את הפרחים כדי שימשיך לתת עלים.' },
  { kind: 'mint', name: 'נענע', place: 'out', every_days: 2, tip: 'צמאה למים וגדלה מהר. בעציץ משלה, כי היא משתלטת על השכנים.' },
  { kind: 'tomato', name: 'עגבנייה', place: 'out', every_days: 2, tip: 'משקים בבוקר ליד השורש, לא על העלים. צריכה סמוכה כשהיא גדלה.' },
  { kind: 'olive', name: 'זית', place: 'out', every_days: 14, tip: 'עמיד ליובש. בעציץ משקים כשהאדמה יבשה עד עומק של כמה סנטימטרים.' },
  { kind: 'monstera', name: 'מונסטרה', place: 'in', every_days: 7, tip: 'אור עקיף. משקים כשהשכבה העליונה של האדמה יבשה, ומנגבים אבק מהעלים.' },
  { kind: 'pothos', name: 'פוטוס', place: 'in', every_days: 7, tip: 'מסתדר גם באור חלש. עלים צהובים הם בדרך כלל סימן להשקיה מרובה.' },
  { kind: 'snake-plant', name: 'סנסווריה (לשון חמות)', place: 'in', every_days: 21, tip: 'כמעט לא צריכה מים. עודף מים מרקיב את השורשים.' },
  { kind: 'cactus', name: 'קקטוס', place: 'in', every_days: 21, tip: 'שמש מלאה והשקיה נדירה. בחורף, פעם בחודש מספיק.' },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export class RuleError extends Error { constructor(public code: string) { super(code); } }

/** what a person sent → a clean plant (without id). Throws RuleError('bad_name' | 'bad_every' | 'bad_date'). */
export function clean(input: any, today: string): Omit<Plant, 'id'> {
  const preset = PRESETS.find((p) => p.kind === input?.kind);
  const name = text(input?.name, 60) || preset?.name || '';
  if (!name) throw new RuleError('bad_name');
  const raw = input?.every_days == null || input.every_days === '' ? preset?.every_days ?? 7 : Number(input.every_days);
  const every = Math.round(raw);
  if (!(every >= 1 && every <= 60)) throw new RuleError('bad_every');
  let last: string | null = null;
  if (input?.last_watered != null && input.last_watered !== '') {
    if (!isDate(input.last_watered) || input.last_watered > today) throw new RuleError('bad_date');
    last = input.last_watered;
  }
  const place = input?.place === 'in' || input?.place === 'out' ? input.place : preset?.place || 'in';
  return { name, kind: preset ? preset.kind : 'custom', place, every_days: every, last_watered: last, note: text(input?.note, 300) || null };
}

const day = 86400000;
export const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * day).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / day);

/** when the plant next needs water, how it stands today, and why the weather moved it ('rain', 'heat', or null).
    Rain counts as watering for a plant outside. A hot day (HOT_OUT outside, HOT_IN inside) brings it a day earlier,
    never to a day already past and never for a plant watered every day. */
export function due(p: Pick<Plant, 'place' | 'every_days' | 'last_watered'>, today: string, wx: Wx | null = null):
  { next: string | null; days: number | null; state: State; why: 'rain' | 'heat' | null } {
  let last = p.last_watered;
  let why: 'rain' | 'heat' | null = null;
  if (p.place === 'out' && wx?.rained && wx.rained <= today && (!last || wx.rained > last)) { last = wx.rained; why = 'rain'; }
  if (!last) return { next: null, days: null, state: 'new', why: null };
  let next = addDays(last, p.every_days);
  const hot = wx?.max != null && wx.max >= (p.place === 'out' ? HOT_OUT : HOT_IN);
  if (hot && p.every_days > 1 && why !== 'rain') {
    const earlier = addDays(next, -1);
    if (earlier > last && earlier >= today) { next = earlier; why = 'heat'; }
  }
  const days = daysBetween(today, next);
  return { next, days, why, state: days < 0 ? 'late' : days === 0 ? 'today' : days === 1 ? 'soon' : 'ok' };
}

/** the morning reminder: the date to remind about today (due today or late), once for each date, or null */
export function remindFor(p: Pick<Plant, 'place' | 'every_days' | 'last_watered'> & { reminded?: string | null }, today: string, wx: Wx | null = null): string | null {
  const d = due(p, today, wx);
  if (!d.next || d.days == null || d.days > 0) return null;
  return p.reminded === d.next ? null : d.next;
}

/** the weather as open-meteo gives it (daily, past_days=1: [yesterday, today, …]) → Wx */
export function wxOf(daily: any, today: string): Wx | null {
  if (!daily || !Array.isArray(daily.time)) return null;
  const i = daily.time.indexOf(today);
  if (i < 0) return null;
  const v = daily.temperature_2m_max?.[i];
  const max = v == null ? NaN : Number(v);
  let rained: string | null = null;
  for (let j = 0; j <= i; j++) if (Number(daily.precipitation_sum?.[j]) >= RAIN_MM) rained = daily.time[j];
  return { max: Number.isFinite(max) ? max : null, rained };
}

const ORDER: Record<State, number> = { late: 0, today: 1, soon: 2, new: 3, ok: 4 };
/** the list as the page shows it: what needs water first */
export function sortPlants<T extends Plant>(plants: T[], today: string, wx: Wx | null = null) {
  return plants.map((p) => ({ ...p, due: due(p, today, wx) }))
    .sort((a, b) => ORDER[a.due.state] - ORDER[b.due.state] || (a.due.next || '9').localeCompare(b.due.next || '9') || a.name.localeCompare(b.name, 'he'));
}

/** the identifier's and the plant doctor's answers, cleaned (the AI's words are data) */
export function cleanIdentify(raw: any) {
  const kind = PRESETS.some((p) => p.kind === raw?.kind) ? raw.kind as string : 'custom';
  const every = Math.round(Number(raw?.every_days));
  return {
    name: text(raw?.name, 60) || 'צמח',
    kind,
    place: raw?.place === 'out' ? 'out' as const : 'in' as const,
    every_days: every >= 1 && every <= 60 ? every : PRESETS.find((p) => p.kind === kind)?.every_days ?? 7,
    care: text(raw?.care, 400),
    sure: raw?.sure === true,
  };
}
export function cleanDoctor(raw: any) {
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => text(x, 200)).filter(Boolean).slice(0, 6) : []);
  return { plant: text(raw?.plant, 60), problem: text(raw?.problem, 200) || 'לא ברור מהתמונה', why: text(raw?.why, 400), steps: list(raw?.steps), urgent: raw?.urgent === true };
}
