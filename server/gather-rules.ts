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
