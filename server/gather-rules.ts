// המפגש המשפחתי (docs/business/gathering.md): the pure rules, with no database, so they can be tested alone
// (node server/test-gather.mjs): what the invitation says, when its link ends, the warnings for Shabbat, a holiday or a
// fast, the food notes (kosher, halal), the ideas for a gathering from the family's days, and the calendar links.

import * as HD from './hebdate';

export interface Gathering { title: string; date: string; time: string | null; place: string; map: string; note: string; food: '' | 'kosher' | 'halal' }

/** a name as others see it on the invitation: the first name only (the owner's rule) */
export const firstName = (s: unknown) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().split(/\s+/)[0]?.slice(0, 24) || '';
/** free text from outside: no control characters, trimmed, at most n characters */
export const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, n);
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(HD.fromIso(s).getTime());
export const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
/** a link to a map, or nothing: only http(s), so nothing else runs from it */
export const mapUrl = (s: unknown) => { const v = clean(s, 500); try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };

/** the invitation link works until the end of the day after the gathering – or `daysAfter` days (Israel's midnight, give or take an hour) */
export function expiresAt(date: string, daysAfter = 1) {
  const d = HD.fromIso(date);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1 + daysAfter) - 2 * 3600e3;
}

const WEEK = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
/** "שבת, 14 בנובמבר 2026 (ג׳ בכסלו תשפ״ז) בשעה 12:30" */
export function when(g: Pick<Gathering, 'date' | 'time'>) {
  const d = HD.fromIso(g.date);
  const day = d.getUTCDay() === 6 ? 'שבת' : `יום ${WEEK[d.getUTCDay()]}`;
  return `${day}, ${d.getUTCDate()} ב${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} (${HD.heFull(d)})${g.time ? ` בשעה ${g.time}` : ''}`;
}

/* ---- the calendar of the day: Shabbat, a holiday, a fast ---- */

export interface DayItem { title: string; date: string; category: string; subcat?: string; hebrew?: string; yomtov?: boolean }
const hhmm = (s: string) => s.slice(11, 16);
const minutes = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
/** what someone who keeps Shabbat and the holidays should know about the day: Hebcal's items of that day (with candle
    lighting and havdalah for the family's city) */
export function warnings(g: Pick<Gathering, 'date' | 'time'>, items: DayItem[]): string[] {
  const out: string[] = [];
  const day = items.filter((i) => i.date.slice(0, 10) === g.date);
  const dow = HD.fromIso(g.date).getUTCDay();
  const t = g.time ? minutes(g.time) : null;
  const candles = day.find((i) => i.category === 'candles' && i.date.length > 10);
  const havdalah = day.find((i) => i.category === 'havdalah' && i.date.length > 10);
  const holy = day.filter((i) => i.category === 'holiday' && i.yomtov);
  const name = (i: DayItem) => HD.plain(i.hebrew || i.title);
  if (dow === 6) out.push(`המפגש בשבת${havdalah ? ` (צאת השבת ב־${hhmm(havdalah.date)})` : ''}: מי ששומר שבת לא ייסע ולא יבשל.`);
  else if (holy.length) out.push(`המפגש ביום טוב (${name(holy[0])})${havdalah ? `, עד צאת החג ב־${hhmm(havdalah.date)}` : ''}: מי ששומר לא ייסע ולא יבשל.`);
  else if (candles) {
    const what = dow === 5 ? 'השבת' : 'החג';
    if (t !== null && t >= minutes(hhmm(candles.date))) out.push(`המפגש אחרי כניסת ${what} (הדלקת נרות ב־${hhmm(candles.date)}).`);
    else out.push(`ביום הזה נכנס${dow === 5 ? 'ת' : ''} ${what}: הדלקת נרות ב־${hhmm(candles.date)}.`);
  }
  for (const f of day.filter((i) => i.category === 'holiday' && i.subcat === 'fast')) out.push(`ביום הזה ${name(f)}: יש מי שצם.`);
  return out;
}

/* ---- food ---- */

export const FOOD_KINDS = ['meat', 'dairy', 'parve', ''] as const;
export type FoodKind = (typeof FOOD_KINDS)[number];
/** the notes for the list of what to bring, by the gathering's food rule and what is on the list */
export function foodNotes(food: Gathering['food'], kinds: FoodKind[]): string[] {
  if (food === 'kosher') {
    const out = ['אוכל כשר: סמנו ליד כל מנה אם היא בשרית, חלבית או פרווה.'];
    if (kinds.includes('meat') && kinds.includes('dairy')) out.push('ברשימה יש גם בשרי וגם חלבי: כדאי להחליט אם הארוחה בשרית או חלבית.');
    return out;
  }
  if (food === 'halal') return ['אוכל חלאל: בלי חזיר ובלי אלכוהול, ובשר שנשחט כהלכה.'];
  return [];
}

/* ---- ideas: the family's days that call for a gathering ---- */

const ROUND_BIRTHDAY = new Set([1, 13, 18, 20, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100]);
const ROUND_ANNIVERSARY = new Set([1, 10, 18, 20, 25, 30, 40, 50, 60, 70]);
export interface Idea { date: string; title: string; why: string; kind: string }
/** round birthdays and anniversaries, and the first and round yahrzeits, between a and b */
export function ideas(days: HD.FamilyDay[], a: Date, b: Date): Idea[] {
  const out: Idea[] = [];
  for (const x of HD.familyBetween(days.filter((d) => d.recur !== 'none'), a, b)) {
    const n = HD.yearsSince(x.day, HD.fromIso(x.date));
    const who = x.day.title;
    if (x.day.kind === 'birthday' && ROUND_BIRTHDAY.has(n)) out.push({ date: x.date, kind: 'birthday', title: `יום הולדת ${n} ל${who}`, why: `${who} חוגג/ת ${n}` });
    else if (x.day.kind === 'anniversary' && ROUND_ANNIVERSARY.has(n)) out.push({ date: x.date, kind: 'anniversary', title: `${n} שנים: ${who}`, why: `${n} שנה ל${who}` });
    else if (x.day.kind === 'yahrzeit' && (n === 1 || n % 10 === 0)) out.push({ date: x.date, kind: 'yahrzeit', title: `אזכרה: ${who}`, why: n === 1 ? 'האזכרה הראשונה' : `${n} שנים` });
  }
  return out;
}

/* ---- sharing it, and putting it in a calendar ---- */

/** the message for the family's WhatsApp group (the link last, so WhatsApp shows it as a link) */
export function whatsappText(g: Gathering, url: string) {
  const head = [`🎉 ${g.title}`, when(g)];
  if (g.place) head.push(`📍 ${g.place}`);
  return [...head, '', 'מגיעים? מה מביאים? כאן, בלי הרשמה:', url].join('\n');
}
const d8 = (s: string) => s.replace(/-/g, '');
/** start and end: a gathering with an hour lasts three hours; without one, the whole day */
export function span(g: Pick<Gathering, 'date' | 'time'>): { allDay: boolean; start: string; end: string } {
  if (!g.time) return { allDay: true, start: d8(g.date), end: d8(HD.iso(HD.addDays(HD.fromIso(g.date), 1))) };
  const [h, m] = g.time.split(':').map(Number);
  const s = new Date(Date.UTC(+g.date.slice(0, 4), +g.date.slice(5, 7) - 1, +g.date.slice(8, 10), h, m));
  const e = new Date(s.getTime() + 3 * 3600e3);
  const fmt = (d: Date) => d.toISOString().slice(0, 16).replace(/[-:]/g, '') + '00';
  return { allDay: false, start: fmt(s), end: fmt(e) };             // wall-clock times, in Israel's time zone
}
/** "add to Google Calendar", without a file */
export function googleLink(g: Gathering, url: string) {
  const s = span(g);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: g.title, dates: `${s.start}/${s.end}`, ctz: 'Asia/Jerusalem', location: g.place, details: [g.note, url].filter(Boolean).join('\n\n') });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}
const esc = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** the gathering as an .ics file (Apple, Outlook, Google), with reminders a day and two hours before */
export function ics(g: Gathering, uid: string, url: string, now = new Date()) {
  const s = span(g);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const at = (k: string, v: string) => (s.allDay ? `${k};VALUE=DATE:${v}` : `${k};TZID=Asia/Jerusalem:${v}`);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Haohel//Gathering//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${uid}@haohel`, `DTSTAMP:${stamp}`, at('DTSTART', s.start), at('DTEND', s.end),
    `SUMMARY:${esc(g.title)}`, g.place ? `LOCATION:${esc(g.place)}` : '', `DESCRIPTION:${esc([g.note, url].filter(Boolean).join('\n\n'))}`, `URL:${url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(g.title)}`, 'TRIGGER:-P1D', 'END:VALARM'];
  if (!s.allDay) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(g.title)}`, 'TRIGGER:-PT2H', 'END:VALARM');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.filter(Boolean).map(HD.fold).join('\r\n') + '\r\n';
}

/* Founding members (docs/business/founders.md, the owner's decision of 2026-11-13): the moment a gathering first has five
   invitees who confirmed they are coming is recorded once, with its organiser, and kept forever – the founders' order and
   "the millionth" are counted from it, and it cannot be rebuilt afterwards. Answers count, not heads; the organiser's own
   answer does not. */
export const FOUNDING_CONFIRMED = 5;
/** how many invitees confirmed: answers "yes", each answer once, not the organiser's own */
export function confirmedGuests(rsvps: Array<{ coming: string; email: string | null }>, hostEmail: string): number {
  return rsvps.filter((r) => r.coming === 'yes' && (r.email || '').toLowerCase() !== hostEmail.toLowerCase()).length;
}
export const reachedFounding = (rsvps: Array<{ coming: string; email: string | null }>, hostEmail: string) => confirmedGuests(rsvps, hostEmail) >= FOUNDING_CONFIRMED;

/* ---- the food calculator (docs/design/gather-calc.md): how much of what, for how many ----
   A proposal, not a recipe: the host ticks, changes the quantities and adds their own. Children eat about 60% of an adult.
   Meat goes only to those who eat it; vegetarians and vegans get dishes of their own, and gluten-free bread is added for
   those who need it. A kosher meal leaves out the other kind: a meat meal has no dairy and a dairy meal no meat; a parve
   meal neither. A dairy dish that has a parve version (a cake, the vegetarians' main dish) stays, as parve. */

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type Meal = (typeof MEALS)[number];
export type Diet = 'veg' | 'vegan' | 'gf';
export const DIETS: Diet[] = ['veg', 'vegan', 'gf'];
export const DIET_NAME: Record<Diet, string> = { veg: 'צמחוני', vegan: 'טבעוני', gf: 'ללא גלוטן' };
export interface CalcInput { adults: number; kids: number; meal: Meal; veg: number; vegan: number; gf: number; kosher: FoodKind }
export interface CalcItem { title: string; qty: string; kind: FoodKind; diet: Diet | '' }

const int = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
/** the calculator's input from outside: whole numbers in range, the diets never more than the people */
export function calcInput(b: Record<string, unknown>): CalcInput {
  const adults = int(b.adults, 300), kids = int(b.kids, 300), all = adults + kids;
  const meal = (MEALS as readonly string[]).includes(String(b.meal)) ? (String(b.meal) as Meal) : 'lunch';
  const kosher = ['meat', 'dairy', 'parve'].includes(String(b.kosher)) ? (String(b.kosher) as FoodKind) : '';
  const vegan = Math.min(int(b.vegan, 300), all), veg = Math.min(int(b.veg, 300), all - vegan), gf = Math.min(int(b.gf, 300), all);
  return { adults, kids, meal, veg, vegan, gf, kosher };
}

/** "3 כיכרות", "כיכר"; a weight in kilos rounded up to half a kilo, or in grams under one */
const count = (n: number, one: string, many: string) => (n <= 1 ? one : `${n} ${many}`);
const kilos = (g: number) => (g < 1000 ? `${Math.max(100, Math.ceil(g / 100) * 100)} גרם` : `${Math.ceil(g / 500) / 2} ק"ג`);
const up = (n: number) => Math.max(1, Math.ceil(n - 1e-9));
const BOTTLE: [string, string] = ['בקבוק 1.5 ליטר', 'בקבוקים של 1.5 ליטר'];

/** the proposal: a list of items with quantities, by the meal, the people and the kosher kind */
export function foodPlan(input: CalcInput): CalcItem[] {
  const { adults, kids, meal, veg, vegan, gf, kosher } = input;
  const all = adults + kids;
  if (all === 0) return [];
  const eaters = adults + kids * 0.6;                         // in adult portions
  const meatEaters = eaters * (1 - (veg + vegan) / all);
  const out: CalcItem[] = [];
  /** `parve`: the item's parve version for a meal of the other kind (a title), or null when it simply goes */
  const add = (title: string, qty: string, kind: FoodKind = 'parve', diet: Diet | '' = '', parve: string | null = null) => {
    const clash = (kosher === 'meat' && kind === 'dairy') || (kosher === 'dairy' && kind === 'meat') || (kosher === 'parve' && kind !== 'parve' && kind !== '');
    if (!clash) out.push({ title, qty, kind, diet });
    else if (kind === 'dairy' && parve !== null) out.push({ title: parve || title, qty, kind: 'parve', diet });
  };

  if (meal === 'breakfast') {
    add('לחמניות', `${up(adults * 1.5 + kids)}`);
    if (eaters - vegan > 0) add('גבינות', kilos((eaters - vegan) * 60), 'dairy');
    add('ביצים', `${up(adults * 1.5 + kids)}`);
    add('ירקות לסלט', kilos(eaters * 150));
    add('ממרחים (טחינה, חומוס, ריבה)', count(up(all / 8), 'קופסה', 'קופסאות'));
    add('חלב לקפה', count(up(adults / 10), 'קרטון', 'קרטונים'), 'dairy', '', 'חלב צמחי לקפה');
    add('קפה ותה', count(up(adults / 15), 'חבילה', 'חבילות'));
    add('מיץ', count(up(all * 0.25 / 1.5), ...BOTTLE));
    add('פירות', kilos(eaters * 150));
    if (vegan) add('ממרח טבעוני וחלב צמחי', count(up(vegan / 6), 'סט', 'סטים'), 'parve', 'vegan');
  } else if (meal === 'snacks') {
    add('עוגות', count(up(all / 10), 'עוגה', 'עוגות'), 'dairy', '', 'עוגות פרווה');
    add('בורקס ומאפים', `${up(eaters * 2)}`, 'dairy', '', 'בורקס ומאפים (פרווה)');
    add('פירות חתוכים', kilos(eaters * 150));
    add('ירקות חתוכים ומטבלים', kilos(eaters * 100));
    if (kids) add('חטיפים לילדים', count(up(kids / 5), 'שקית', 'שקיות'));
    if (vegan) add('מאפה טבעוני', `${up(vegan * 2)}`, 'parve', 'vegan');
    add('קפה ותה', count(up(adults / 15), 'חבילה', 'חבילות'));
  } else {
    // lunch or dinner: the main meal
    add(meal === 'lunch' ? 'לחם וחלות' : 'לחם', count(up(all / 5), 'כיכר', 'כיכרות'));
    add('סלט ירקות', count(up(all / 8), 'קערה גדולה', 'קערות גדולות'));
    add('חומוס וטחינה', count(up(all / 10), 'קופסה גדולה', 'קופסאות גדולות'));
    if (meatEaters > 0) add('מנה עיקרית: עוף או בשר', kilos(meatEaters * (meal === 'lunch' ? 300 : 220)), 'meat');
    if (meatEaters > 0) add('פשטידה או לזניה', count(up(meatEaters / 6), 'תבנית', 'תבניות'), 'dairy');
    add('תוספת: אורז, פסטה או תפוחי אדמה', kilos(eaters * 100));
    if (veg) add('מנה עיקרית צמחונית', count(up(veg / 4), 'תבנית', 'תבניות'), 'dairy', 'veg', '');
    if (vegan) add('מנה עיקרית טבעונית', count(up(vegan / 4), 'תבנית', 'תבניות'), 'parve', 'vegan');
    add('קינוח', count(up(all / 10), 'עוגה או מגש', 'עוגות או מגשים'));
    add('פירות', kilos(eaters * 120));
  }
  if (gf) add(meal === 'snacks' ? 'מאפה ללא גלוטן' : 'לחם ללא גלוטן', count(up(gf / 4), 'חבילה', 'חבילות'), 'parve', 'gf');
  add('שתייה קלה', count(up((adults * 0.5 + kids * 0.4) / 1.5), ...BOTTLE));
  add('מים', count(up(all * 0.4 / 1.5), ...BOTTLE));
  add('צלחות חד־פעמיות', `${Math.ceil(all * 1.5 / 10) * 10}`);
  add('כוסות', `${Math.ceil(all * 3 / 10) * 10}`);
  add('מפיות', count(up(all * 3 / 50), 'חבילה', 'חבילות'));
  return out;
}

/** the line on the list of what to bring: "לחם (3 כיכרות)", at most 80 characters */
export const calcTitle = (i: { title?: unknown; qty?: unknown }) => {
  const t = clean(i.title, 60), q = clean(i.qty, 30).replace(/[()]/g, '');
  return t ? (q ? `${t} (${q})` : t).slice(0, 80) : '';
};

/** the calculator's first guess from the answers: everyone who said yes counts as an adult (the host changes it), and
    each answer's diet ticks count once */
export function calcDefaults(rsvps: Array<{ coming: string; count: number; diets?: string | null }>, food: Gathering['food']) {
  const yes = rsvps.filter((r) => r.coming === 'yes');
  const n = (d: Diet) => yes.filter((r) => String(r.diets || '').split(',').includes(d)).length;
  return { adults: yes.reduce((s, r) => s + (r.count || 1), 0), kids: 0, veg: n('veg'), vegan: n('vegan'), gf: n('gf'), kosher: food === 'kosher' ? 'meat' : '' };
}
/** the diet ticks an answer carries, as stored: "veg,gf" */
export const dietsOf = (v: unknown) => (Array.isArray(v) ? DIETS.filter((d) => v.includes(d)).join(',') : '');
