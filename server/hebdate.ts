// The Hebrew calendar for the family's days, on the server (for the calendar link that Google, Apple or Outlook subscribe to).
// The same rules as the calendar page (public/tools/calendar/calendar.js): a day repeats by its Hebrew date, its Gregorian
// date, or not at all; after sunset the Hebrew date is the next day's; Adar in a leap year; the 30th of a short month.
// Days are noon UTC, so that no time zone moves them. Tests: node server/test-hebdate.mjs

const hp = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
const hMonth = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long', timeZone: 'UTC' });

export interface Heb { day: number; month: string; year: number }
const cache = new Map<number, Heb>();
export function heb(d: Date): Heb {
  const k = Math.floor(d.getTime() / 864e5);
  const hit = cache.get(k);
  if (hit) return hit;
  const parts = Object.fromEntries(hp.formatToParts(d).map((p) => [p.type, p.value]));
  const v = { day: +parts.day, month: hMonth.format(d), year: +(parts.year || parts.relatedYear) };
  if (cache.size > 5000) cache.clear();
  cache.set(k, v);
  return v;
}
export const fromIso = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 12));
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
export const leap = (hy: number) => [0, 3, 6, 8, 11, 14, 17].includes(hy % 19);

/** Hebrew numerals: 15 → ט״ו, 787 → תשפ״ז */
export function gem(n: number, marks = true) {
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  let s = '', h = Math.floor(n / 100);
  n %= 100;
  while (h >= 4) { s += 'ת'; h -= 4; }
  s += ['', 'ק', 'ר', 'ש'][h];
  s += n === 15 ? 'טו' : n === 16 ? 'טז' : tens[Math.floor(n / 10)] + ones[n % 10];
  if (!marks) return s;
  return s.length > 1 ? s.slice(0, -1) + '״' + s.slice(-1) : s + '׳';
}
export const heFull = (d: Date) => { const h = heb(d); return `${gem(h.day)} ב${h.month} ${gem(h.year % 1000)}`; };

/** the first day (1 Tishrei) of the Hebrew year hy */
export function yearStart(hy: number) {
  let x = new Date(Date.UTC(hy - 3761, 8, 1, 12));
  for (let i = 0; i < 70 && !(heb(x).year === hy && heb(x).day === 1 && heb(x).month === 'תשרי'); i++) x = addDays(x, 1);
  return x;
}

export interface FamilyDay { id: string; title: string; kind: string; date: string; after_sunset: boolean; recur: string; note?: string }

/** does the family day e fall on the day d? */
export function occursOn(e: FamilyDay, d: Date): boolean {
  const base = e.after_sunset ? addDays(fromIso(e.date), 1) : fromIso(e.date);
  if (iso(d) < e.date) return false;
  if (e.recur === 'none') return iso(d) === e.date;
  if (e.recur === 'gregorian') {
    const b = fromIso(e.date);
    if (b.getUTCMonth() !== d.getUTCMonth()) return false;
    if (b.getUTCDate() === d.getUTCDate()) return true;
    // 29 February, in a year without one: the 28th
    return b.getUTCMonth() === 1 && b.getUTCDate() === 29 && d.getUTCDate() === 28 && new Date(Date.UTC(d.getUTCFullYear(), 1, 29)).getUTCMonth() !== 1;
  }
  const hb = heb(base), hd = heb(d);
  // Adar: in a year with one Adar the day is in it; in a leap year a birthday is in Adar II, a memorial day in Adar I
  let month = hb.month;
  if (/^אדר/.test(month)) month = !leap(hd.year) ? 'אדר' : month === 'אדר' ? (e.kind === 'yahrzeit' ? 'אדר א׳' : 'אדר ב׳') : month;
  if (hd.month !== month) return false;
  if (hd.day === hb.day) return true;
  return hb.day === 30 && hd.day === 29 && heb(addDays(d, 1)).day === 1;   // a 30th in a month of 29 days: the 29th
}
export function yearsSince(e: FamilyDay, d: Date) {
  const base = e.after_sunset ? addDays(fromIso(e.date), 1) : fromIso(e.date);
  return e.recur === 'hebrew' ? heb(d).year - heb(base).year : d.getUTCFullYear() - fromIso(e.date).getUTCFullYear();
}
const FAMILY: Record<string, string> = { birthday: '🎂', yahrzeit: '🕯️', anniversary: '💍', other: '⭐' };
export function familyLabel(e: FamilyDay, d: Date) {
  const n = yearsSince(e, d);
  const count = e.recur === 'none' || n <= 0 ? '' : e.kind === 'birthday' ? ` (${n})` : ` · ${n} שנים`;
  return `${FAMILY[e.kind] || FAMILY.other} ${e.title}${count}`;
}
/** the family's days between a and b (inclusive), each with the day it falls on, in date order. The same days as
    asking occursOn of every day (the tests check it), but each one is looked up directly: a few milliseconds, not forty. */
export function familyBetween(days: FamilyDay[], a: Date, b: Date) {
  // every Hebrew date in the range, once
  const byHeb = new Map<string, Date>(), hyears = new Set<number>();
  for (let d = a; d <= b; d = addDays(d, 1)) { const h = heb(d); byHeb.set(`${h.year}|${h.month}|${h.day}`, d); hyears.add(h.year); }
  const out: { day: FamilyDay; date: string; title: string }[] = [];
  const at = (e: FamilyDay, d: Date | undefined) => { if (d && d >= a && d <= b && iso(d) >= e.date) out.push({ day: e, date: iso(d), title: familyLabel(e, d) }); };
  for (const e of days) {
    if (e.recur === 'none') { at(e, fromIso(e.date)); continue; }
    if (e.recur === 'gregorian') {
      const o = fromIso(e.date);
      for (let y = a.getUTCFullYear(); y <= b.getUTCFullYear(); y++) {
        const d = new Date(Date.UTC(y, o.getUTCMonth(), o.getUTCDate(), 12));
        at(e, d.getUTCMonth() === o.getUTCMonth() ? d : new Date(Date.UTC(y, 1, 28, 12)));      // 29 February → the 28th
      }
      continue;
    }
    const hb = heb(e.after_sunset ? addDays(fromIso(e.date), 1) : fromIso(e.date));
    for (const y of hyears) {
      let month = hb.month;
      if (/^אדר/.test(month)) month = !leap(y) ? 'אדר' : month === 'אדר' ? (e.kind === 'yahrzeit' ? 'אדר א׳' : 'אדר ב׳') : month;
      const d = byHeb.get(`${y}|${month}|${hb.day}`);
      if (d) { at(e, d); continue; }
      // a 30th in a month of 29 days: the 29th (and only then – not when the 30th is just outside the range)
      const d29 = hb.day === 30 ? byHeb.get(`${y}|${month}|29`) : undefined;
      if (d29 && heb(addDays(d29, 1)).day === 1) at(e, d29);
    }
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/* ---- Hebcal's items, grouped as in the page: the days of one festival together ---- */

export interface HebcalItem { title: string; date: string; category: string; subcat?: string; hebrew?: string; memo?: string; link?: string }
export const plain = (s: unknown) => String(s || '').replace(/[\u0591-\u05C7]/g, '');
export const kindOf = (i: HebcalItem) => (i.category === 'roshchodesh' ? 'roshchodesh' : i.category === 'holiday' ? (i.subcat === 'shabbat' ? 'minor' : i.subcat || 'minor') : i.category);
export function groupsOf(items: HebcalItem[]) {
  const groups: { key: string; from: string; to: string; items: HebcalItem[] }[] = [];
  for (const i of items.filter((x) => x.category === 'holiday' || x.category === 'roshchodesh')) {
    const key = (i.link || '').replace(/\?.*$/, '').replace(/-\d{4}$/, '') + '|' + (i.category === 'roshchodesh' ? i.date.slice(0, 7) : '');
    const last = groups[groups.length - 1];
    if (last && last.key === key && fromIso(i.date).getTime() - fromIso(last.to).getTime() <= 864e5 * 2) { last.to = i.date; last.items.push(i); }
    else groups.push({ key, from: i.date, to: i.date, items: [i] });
  }
  return groups;
}
export function nameOf(items: HebcalItem[]) {
  const main = items.find((i) => !/^ערב /.test(i.hebrew || '')) || items[0];
  return plain(main.hebrew || main.title).replace(/\s+\d{4}$/, '').replace(/\s+[א-ח]׳(\s*\(.*\))?$/, '').replace(/\s*\(.*?\)\s*$/, '');
}

/* ---- iCalendar ---- */

const esc = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** a content line folded at 75 octets, as RFC 5545 asks (Hebrew is 2 bytes a letter, emoji 4) */
function fold(line: string) {
  const enc = new TextEncoder(), out: string[] = [];
  let cur = '', size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
export interface IcsDay { uid: string; from: string; to: string; title: string; description: string }
/** an all-day event per day (to is inclusive), with an alarm `remind` days before when asked */
export function ics(name: string, days: IcsDay[], remind: number, now = new Date()) {
  const d8 = (s: string) => s.replace(/-/g, '');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Haohel//Family calendar//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:Asia/Jerusalem', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const g of days) {
    lines.push('BEGIN:VEVENT', `UID:${g.uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(g.from)}`, `DTEND;VALUE=DATE:${d8(iso(addDays(fromIso(g.to), 1)))}`,
      `SUMMARY:${esc(g.title)}`, `DESCRIPTION:${esc(g.description)}`, 'TRANSP:TRANSPARENT');
    if (remind > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(g.title)}`, `TRIGGER:-P${remind}D`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
