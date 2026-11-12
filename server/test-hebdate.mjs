// Tests for server/hebdate.ts (the family's days in the subscribed calendar):   node server/test-hebdate.mjs
// Besides fixed cases, it checks that the server finds every family day on the same days as the calendar page does
// (the page's own algorithm is copied below, in the browser's local time).
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'hebdate-test-'));
const out = join(dir, 'hebdate.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/hebdate.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const D = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));

/* ---- the Hebrew date ---- */
eq('Rosh Hashana 5787', D.iso(D.yearStart(5787)), '2026-09-12');
eq('Rosh Hashana 5788', D.iso(D.yearStart(5788)), '2027-10-02');
eq('a Hebrew date', D.heb(D.fromIso('2026-09-12')), { day: 1, month: 'תשרי', year: 5787 });
eq('in letters', D.heFull(D.fromIso('2026-09-12')), 'א׳ בתשרי תשפ״ז');
eq('gem 15', D.gem(15), 'ט״ו');
eq('gem 787', D.gem(787), 'תשפ״ז');
ok('leap years', D.leap(5784) && !D.leap(5785) && D.leap(5787));

/* ---- fixed cases ---- */
const day = (o) => ({ id: 'x', title: 'דנה', kind: 'birthday', after_sunset: false, recur: 'hebrew', ...o });
const on = (e, a, b) => D.familyBetween([e], D.fromIso(a), D.fromIso(b)).map((x) => x.date);
eq('Gregorian: every year on the day', on(day({ date: '2000-05-10', recur: 'gregorian' }), '2026-01-01', '2027-12-31'), ['2026-05-10', '2027-05-10']);
eq('Gregorian 29 February: the 28th in other years', on(day({ date: '2024-02-29', recur: 'gregorian' }), '2026-01-01', '2028-12-31'), ['2026-02-28', '2027-02-28', '2028-02-29']);
eq('once', on(day({ date: '2026-06-01', recur: 'none' }), '2026-01-01', '2027-12-31'), ['2026-06-01']);
eq('nothing before it happened', on(day({ date: '2027-06-01', recur: 'gregorian' }), '2026-01-01', '2026-12-31'), []);
// born 1 Tishrei 5760 (1999-09-11): every Rosh Hashana
eq('Hebrew: every year on its Hebrew date', on(day({ date: '1999-09-11' }), '2026-01-01', '2027-12-31'), ['2026-09-12', '2027-10-02']);
// after sunset on 1999-09-10 (29 Elul): the Hebrew date is 1 Tishrei
eq('after sunset: the next day\'s Hebrew date', on(day({ date: '1999-09-10', after_sunset: true }), '2026-01-01', '2027-12-31'), ['2026-09-12', '2027-10-02']);
// Adar in a year with one Adar (5785, 2025-03-14 = 14 Adar) → in a leap year: Adar II for a birthday, Adar I for a memorial day
const adar = D.iso(D.fromIso('2025-03-14'));
eq('14 Adar 5785', D.heb(D.fromIso(adar)).month, 'אדר');
const purim5787 = on(day({ date: adar }), '2027-01-01', '2027-12-31');
eq('a birthday in Adar → Adar II in a leap year', purim5787.map((x) => D.heb(D.fromIso(x)).month), ['אדר ב׳']);
const yz = on(day({ date: adar, kind: 'yahrzeit' }), '2027-01-01', '2027-12-31');
eq('a memorial day in Adar → Adar I in a leap year', yz.map((x) => D.heb(D.fromIso(x)).month), ['אדר א׳']);
// 30 Cheshvan in a year where Cheshvan has 29 days → the 29th
const c30 = []; for (let d = D.fromIso('2020-10-01'); d < D.fromIso('2030-01-01'); d = D.addDays(d, 1)) { const h = D.heb(d); if (h.month === 'חשוון' && h.day === 30) { c30.push(D.iso(d)); break; } }
ok('found a 30 Cheshvan', c30.length === 1);
const short = on(day({ date: c30[0] }), '2020-10-01', '2030-12-31').map((x) => D.heb(D.fromIso(x)));
ok('a 30th falls each year, on the 29th when the month is short', short.length >= 8 && short.every((h) => h.month === 'חשוון' && (h.day === 30 || h.day === 29)));
eq('the label counts the years', D.familyLabel(day({ date: '1999-09-11' }), D.fromIso('2026-09-12')), '🎂 דנה (27)');
eq('a memorial day: years', D.familyLabel(day({ date: '1999-09-11', kind: 'yahrzeit' }), D.fromIso('2026-09-12')), '🕯️ דנה · 27 שנים');

/* ---- the same days as the calendar page ---- */
// the page's algorithm (public/tools/calendar/calendar.js), in local time, as the browser runs it
const hp = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'numeric', year: 'numeric' });
const hMonth = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long' });
const pHeb = (d) => { const p = Object.fromEntries(hp.formatToParts(d).map((x) => [x.type, x.value])); return { day: +p.day, month: hMonth.format(d), year: +p.year }; };
const pAdd = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const pIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pFrom = (s) => new Date(s.slice(0, 10) + 'T12:00');
function pageOccurs(e, d) {
  const base = e.after_sunset ? pAdd(pFrom(e.date), 1) : pFrom(e.date);
  if (pIso(d) < pIso(pFrom(e.date))) return false;
  if (e.recur === 'none') return pIso(d) === e.date;
  if (e.recur === 'gregorian') {
    const b = pFrom(e.date);
    if (b.getMonth() !== d.getMonth()) return false;
    if (b.getDate() === d.getDate()) return true;
    return b.getMonth() === 1 && b.getDate() === 29 && d.getDate() === 28 && new Date(d.getFullYear(), 1, 29).getMonth() !== 1;
  }
  const hb = pHeb(base), hd = pHeb(d);
  let month = hb.month;
  if (/^אדר/.test(month)) month = !D.leap(hd.year) ? 'אדר' : month === 'אדר' ? (e.kind === 'yahrzeit' ? 'אדר א׳' : 'אדר ב׳') : month;
  if (hd.month !== month) return false;
  if (hd.day === hb.day) return true;
  return hb.day === 30 && hd.day === 29 && pHeb(pAdd(d, 1)).day === 1;
}
// a spread of family days: every 37th day over 30 years, by each rule, before and after sunset, birthday and memorial day
const sample = [];
for (let d = D.fromIso('1990-01-03'), i = 0; d < D.fromIso('2020-01-01'); d = D.addDays(d, 37), i++)
  sample.push(day({ id: 's' + i, date: D.iso(d), recur: ['hebrew', 'gregorian', 'hebrew', 'none'][i % 4], after_sunset: i % 3 === 0, kind: i % 2 ? 'yahrzeit' : 'birthday' }));
let same = 0, differ = [];
for (let d = D.fromIso('2026-01-01'); d <= D.fromIso('2027-12-31'); d = D.addDays(d, 1)) {
  const local = pFrom(D.iso(d));
  for (const e of sample) { if (D.occursOn(e, d) === pageOccurs(e, local)) same++; else if (differ.length < 3) differ.push(`${e.date}/${e.recur} on ${D.iso(d)}`); }
}
ok(`the server and the page agree on every day of 2026–2027 (${sample.length} family days): ${differ.join(', ')}`, !differ.length && same > 0);
// familyBetween looks each day up directly: the same days as asking occursOn of every day, over several ranges
for (const [a, b] of [['2026-01-01', '2027-12-31'], ['2026-09-12', '2028-09-20'], ['2027-02-15', '2027-03-20'], ['2027-11-01', '2027-11-30']]) {
  const want = [];
  for (let d = D.fromIso(a); d <= D.fromIso(b); d = D.addDays(d, 1)) for (const e of sample) if (D.occursOn(e, d)) want.push(e.id + '@' + D.iso(d));
  const got = D.familyBetween(sample, D.fromIso(a), D.fromIso(b)).map((x) => x.day.id + '@' + x.date);
  eq(`familyBetween ${a}…${b} finds the same days (${want.length})`, got.slice().sort(), want.slice().sort());
}
const ordered = D.familyBetween(sample, D.fromIso('2026-01-01'), D.fromIso('2027-12-31')).map((x) => x.date);
ok('in date order', ordered.every((x, i) => !i || ordered[i - 1] <= x));

/* ---- Hebcal's groups ---- */
const items = [
  { title: 'Pesach I', date: '2027-04-22', category: 'holiday', subcat: 'major', hebrew: 'פֶּסַח א׳', link: 'https://hebcal.com/holidays/pesach-2027' },
  { title: 'Pesach II', date: '2027-04-23', category: 'holiday', subcat: 'major', hebrew: 'פֶּסַח ב׳', link: 'https://hebcal.com/holidays/pesach-2027' },
  { title: 'Rosh Chodesh Iyyar', date: '2027-05-07', category: 'roshchodesh', hebrew: 'ראש חודש אייר', link: 'https://hebcal.com/holidays/rosh-chodesh-iyyar-2027' },
  { title: 'Parashat', date: '2027-04-24', category: 'parashat', hebrew: 'פרשת' },
];
const g = D.groupsOf(items);
eq('a festival\'s days together, the parasha left out', g.map((x) => [x.from, x.to, x.items.length]), [['2027-04-22', '2027-04-23', 2], ['2027-05-07', '2027-05-07', 1]]);
eq('its name without vowels or day number', D.nameOf(g[0].items), 'פסח');
eq('kinds', items.map(D.kindOf), ['major', 'major', 'roshchodesh', 'parashat']);

/* ---- iCalendar ---- */
const text = D.ics('לוח השנה – האוהל', [{ uid: 'a@x', from: '2027-04-22', to: '2027-04-23', title: '🎂 דנה, הבת; של רינה ויוסי – יום הולדת ארוך מאוד מאוד מאוד מאוד מאוד', description: 'שורה\nשנייה' }], 3, new Date('2026-11-12T10:00:00Z'));
const lines = text.split('\r\n');
ok('every line ends with CRLF', text.endsWith('\r\n') && !/[^\r]\n/.test(text));
ok('no line is over 75 octets', lines.every((l) => new TextEncoder().encode(l).length <= 75));
const unfolded = text.replace(/\r\n /g, '');
ok('the end is the next day (exclusive)', unfolded.includes('DTSTART;VALUE=DATE:20270422') && unfolded.includes('DTEND;VALUE=DATE:20270424'));
ok('commas, semicolons and new lines escaped', unfolded.includes('דנה\\, הבת\\; של') && unfolded.includes('שורה\\nשנייה'));
ok('the alarm', unfolded.includes('TRIGGER:-P3D'));
ok('no alarm when not asked', !D.ics('x', [{ uid: 'a', from: '2027-01-01', to: '2027-01-01', title: 't', description: '' }], 0).includes('VALARM'));
ok('a folded multi-byte letter is never cut', !unfolded.includes('�'));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
