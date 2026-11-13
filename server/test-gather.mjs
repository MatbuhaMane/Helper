// Tests for the family gathering's rules (server/gather-rules.ts):   node server/test-gather.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'gather-test-'));
const out = join(dir, 'gather.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/gather-rules.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
const G = await import(pathToFileURL(out).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.error('FAIL', name); } };
const eq = (name, got, want) => ok(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want));

/* ---- what goes in ---- */
eq('first name only', G.firstName('  רון   כהן '), 'רון');
eq('first name of nothing', G.firstName(undefined), '');
eq('clean keeps new lines, drops control characters', G.clean('a\u0000b\nc', 10), 'a b\nc');
ok('dates', G.isDate('2027-01-31') && !G.isDate('2027-1-31') && !G.isDate('31/01/2027'));
ok('times', G.isTime('09:30') && G.isTime('23:59') && !G.isTime('24:00') && !G.isTime('9:30'));
eq('a map link', G.mapUrl('https://maps.app.goo.gl/abc'), 'https://maps.app.goo.gl/abc');
eq('no script links', G.mapUrl('javascript:alert(1)'), '');
eq('not a link', G.mapUrl('אצל דוד משה'), '');

/* ---- the link's end ---- */
const end = G.expiresAt('2027-01-31');
ok('the link still works on the night of the gathering', end > Date.UTC(2027, 0, 31, 21, 0));
ok('and ends by the end of the next day', end <= Date.UTC(2027, 1, 1, 22, 0) && end >= Date.UTC(2027, 1, 1, 20, 0));

/* ---- when ---- */
eq('Shabbat', G.when({ date: '2026-11-14', time: '12:30' }), 'שבת, 14 בנובמבר 2026 (ד׳ בכסלו תשפ״ז) בשעה 12:30');
eq('a weekday, no hour', G.when({ date: '2026-11-12', time: null }), 'יום חמישי, 12 בנובמבר 2026 (ב׳ בכסלו תשפ״ז)');

/* ---- Shabbat, a holiday, a fast ---- */
const fri = [{ title: 'Candle lighting: 16:21', date: '2026-11-13T16:21:00+02:00', category: 'candles' }];
const sat = [{ title: 'Havdalah: 17:36', date: '2026-11-14T17:36:00+02:00', category: 'havdalah' }];
eq('on Shabbat', G.warnings({ date: '2026-11-14', time: '12:30' }, [...fri, ...sat]), ['המפגש בשבת (צאת השבת ב־17:36): מי ששומר שבת לא ייסע ולא יבשל.']);
eq('Friday after candle lighting', G.warnings({ date: '2026-11-13', time: '19:00' }, fri), ['המפגש אחרי כניסת השבת (הדלקת נרות ב־16:21).']);
eq('Friday before it', G.warnings({ date: '2026-11-13', time: '12:00' }, fri), ['ביום הזה נכנסת השבת: הדלקת נרות ב־16:21.']);
eq('Friday, no hour', G.warnings({ date: '2026-11-13', time: null }, fri), ['ביום הזה נכנסת השבת: הדלקת נרות ב־16:21.']);
const pesach = [{ title: 'Pesach I', date: '2027-04-22', category: 'holiday', subcat: 'major', hebrew: 'פֶּסַח א׳', yomtov: true }, { title: 'Havdalah', date: '2027-04-22T19:45:00+03:00', category: 'havdalah' }];
eq('a holiday', G.warnings({ date: '2027-04-22', time: '13:00' }, pesach), ['המפגש ביום טוב (פסח א׳), עד צאת החג ב־19:45: מי ששומר לא ייסע ולא יבשל.']);
const erev = [{ title: 'Candle lighting', date: '2027-04-21T18:50:00+03:00', category: 'candles' }];
eq('the eve of a holiday', G.warnings({ date: '2027-04-21', time: '20:00' }, erev), ['המפגש אחרי כניסת החג (הדלקת נרות ב־18:50).']);
const fast = [{ title: 'Tzom Gedaliah', date: '2027-10-05', category: 'holiday', subcat: 'fast', hebrew: 'צוֹם גְּדַלְיָה' }];
eq('a fast', G.warnings({ date: '2027-10-05', time: '18:00' }, fast), ['ביום הזה צום גדליה: יש מי שצם.']);
eq('an ordinary day', G.warnings({ date: '2026-11-11', time: '18:00' }, [{ title: 'x', date: '2026-11-12', category: 'holiday', yomtov: true }]), []);

/* ---- food ---- */
eq('no rule, no notes', G.foodNotes('', ['meat', 'dairy']), []);
eq('kosher', G.foodNotes('kosher', ['meat', 'parve']), ['אוכל כשר: סמנו ליד כל מנה אם היא בשרית, חלבית או פרווה.']);
eq('kosher, meat and dairy', G.foodNotes('kosher', ['meat', 'dairy']).length, 2);
eq('halal', G.foodNotes('halal', []), ['אוכל חלאל: בלי חזיר ובלי אלכוהול, ובשר שנשחט כהלכה.']);

/* ---- ideas ---- */
const fam = [
  { id: 'g', title: 'סבתא רחל', kind: 'birthday', date: '1946-12-01', after_sunset: false, recur: 'gregorian' },   // 80 in 2026
  { id: 'd', title: 'דנה', kind: 'birthday', date: '1990-12-05', after_sunset: false, recur: 'gregorian' },        // 36: not round
  { id: 'w', title: 'דוד ושרה', kind: 'anniversary', date: '2001-12-20', after_sunset: false, recur: 'gregorian' }, // 25
  { id: 'y', title: 'סבא משה', kind: 'yahrzeit', date: '2025-12-10', after_sunset: false, recur: 'gregorian' },     // the first
  { id: 'n', title: 'פעם אחת', kind: 'other', date: '2026-12-02', after_sunset: false, recur: 'none' },
];
const id = G.ideas(fam, new Date(Date.UTC(2026, 10, 12, 12)), new Date(Date.UTC(2027, 0, 31, 12)));
eq('round days only', id.map((i) => i.title), ['יום הולדת 80 לסבתא רחל', 'אזכרה: סבא משה', '25 שנים: דוד ושרה']);
eq('with their days', id.map((i) => i.date), ['2026-12-01', '2026-12-10', '2026-12-20']);

/* ---- sharing ---- */
const g = { title: 'יום הולדת 80 לסבתא', date: '2026-12-05', time: '12:30', place: 'אצל דוד משה, חיפה', map: '', note: 'מביאים מצב רוח', food: 'kosher' };
const msg = G.whatsappText(g, 'https://x.test/gather/invite/#abc');
ok('the WhatsApp text: title, day, place and the link last', msg.startsWith('🎉 יום הולדת 80 לסבתא\nשבת, 5 בדצמבר 2026') && msg.includes('📍 אצל דוד משה') && msg.endsWith('https://x.test/gather/invite/#abc'));
ok('without a place: no empty pin', !G.whatsappText({ ...g, place: '' }, 'u').includes('📍'));
eq('three hours', G.span(g), { allDay: false, start: '20261205T123000', end: '20261205T153000' });
eq('late: past midnight', G.span({ date: '2026-12-05', time: '22:30' }).end, '20261206T013000');
eq('no hour: the whole day', G.span({ date: '2026-12-05', time: null }), { allDay: true, start: '20261205', end: '20261206' });
const gl = new URL(G.googleLink(g, 'https://x.test/i'));
ok('the Google Calendar link', gl.hostname === 'calendar.google.com' && gl.searchParams.get('dates') === '20261205T123000/20261205T153000' && gl.searchParams.get('ctz') === 'Asia/Jerusalem' && gl.searchParams.get('text') === g.title);
const text = G.ics(g, 'abc', 'https://x.test/i', new Date('2026-11-12T10:00:00Z'));
const un = text.replace(/\r\n /g, '');
ok('ics: in Israel\'s time', un.includes('DTSTART;TZID=Asia/Jerusalem:20261205T123000') && un.includes('DTEND;TZID=Asia/Jerusalem:20261205T153000'));
ok('ics: reminders a day and two hours before', un.includes('TRIGGER:-P1D') && un.includes('TRIGGER:-PT2H'));
ok('ics: the place, escaped', un.includes('LOCATION:אצל דוד משה\\, חיפה'));
ok('ics: lines of at most 75 octets', text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
ok('ics: all day without an hour', G.ics({ ...g, time: null }, 'a', 'u').includes('DTSTART;VALUE=DATE:20261205') && !G.ics({ ...g, time: null }, 'a', 'u').includes('PT2H'));

/* ---- founding members: five invitees who confirmed ---- */
const yes = (email = null) => ({ coming: 'yes', email });
eq('five invitees confirmed', G.reachedFounding([yes(), yes(), yes(), yes('a@x'), yes('b@x')], 'host@x'), true);
eq('the organiser\'s own answer does not count', G.confirmedGuests([yes('HOST@x'), yes(), yes(), yes(), yes()], 'host@x'), 4);
eq('no and maybe do not count', G.confirmedGuests([yes(), { coming: 'no', email: null }, { coming: 'maybe', email: null }], 'host@x'), 1);
eq('answers, not heads', G.reachedFounding([yes(), yes(), yes(), yes()], 'host@x'), false);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
