// Tests for פרנסה: the server's rules (server/parnasa-rules.ts) and the page's (public/tools/parnasa/parnasa-core.js).
//   node server/test-parnasa.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const dir = mkdtempSync(join(tmpdir(), 'parnasa-test-'));
const out = join(dir, 'p.mjs');
execFileSync(process.execPath, [join(process.cwd(), 'node_modules/esbuild/bin/esbuild'), join(process.cwd(), 'server/parnasa-rules.ts'), '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error']);
const R = await import(pathToFileURL(out).href);
// the page's file is a plain script (window.PRCore); here it fills module.exports
const C = (() => { const m = { exports: {} }; new Function('module', readFileSync(join(process.cwd(), 'public/tools/parnasa/parnasa-core.js'), 'utf8'))(m); return m.exports; })();

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const throws = (name, fn, code) => { try { fn(); fail++; console.error(`FAIL ${name}: did not throw`); } catch (e) { eq(name, e.code, code); } };

/* ---- months and dates ---- */
eq('a month back over the year', R.addMonths('2026-01', -1), '2025-12');
eq('a month on', R.addMonths('2026-11', 2), '2027-01');
eq('31 Jan + 1 is the end of February', R.addMonthsToDate('2026-01-31', 1), '2026-02-28');
eq('and back to the 31st after it', R.addMonthsToDate('2026-02-28', 1, 31), '2026-03-31');
eq('a month range', R.monthRange('2028-02'), ['2028-02-01', '2028-02-29']);
eq('a real date', R.isDate('2026-11-14'), true);
eq('no 31 November', R.isDate('2026-11-31'), false);

/* ---- one payment ---- */
eq('an expense', R.cleanTx({ date: '2026-11-14', amount: -42.456, what: '  קפה\n ארומה ', cat: 'fun', key: 'ארומה' }),
  { date: '2026-11-14', amount: -42.46, what: 'קפה ארומה', cat: 'fun', key: 'ארומה' });
eq('the kind follows the sign (an expense filed as salary)', R.cleanTx({ date: '2026-11-14', amount: -10, cat: 'salary' }).cat, 'other');
eq('income filed as food', R.cleanTx({ date: '2026-11-14', amount: 10, cat: 'food' }).cat, 'in_other');
eq('an unknown category', R.cleanTx({ date: '2026-11-14', amount: -10, cat: 'drop table' }).cat, 'other');
eq('no description', R.cleanTx({ date: '2026-11-14', amount: 5 }).what, 'הכנסה');
throws('a zero', () => R.cleanTx({ date: '2026-11-14', amount: 0 }), 'bad_amount');
throws('not a number', () => R.cleanTx({ date: '2026-11-14', amount: '12abc' }), 'bad_amount');
throws('too much', () => R.cleanTx({ date: '2026-11-14', amount: 2e7 }), 'bad_amount');
throws('a bad date', () => R.cleanTx({ date: '14/11/2026', amount: 5 }), 'bad_date');
eq('the same payment twice', R.dupKey({ date: '2026-11-01', amount: -342.5, what: 'שופרסל דיל, רעננה' }), R.dupKey({ date: '2026-11-01', amount: -342.50, what: 'שופרסל דיל רעננה ' }));

/* ---- recurring ---- */
eq('due twice since', R.dueDates({ id: 'r', every: 1, day: 31, next_date: '2026-09-30' }, '2026-11-14'), { dates: ['2026-09-30', '2026-10-31'], next: '2026-11-30' });
eq('every two months', R.dueDates({ id: 'r', every: 2, day: 3, next_date: '2026-10-03' }, '2026-11-14'), { dates: ['2026-10-03'], next: '2026-12-03' });
eq('not yet', R.dueDates({ id: 'r', every: 1, day: 20, next_date: '2026-11-20' }, '2026-11-14').dates, []);
eq('at most 24 at once', R.dueDates({ id: 'r', every: 1, day: 1, next_date: '2020-01-01' }, '2026-11-14').dates.length, 24);

/* ---- sums ---- */
const tx = [{ date: '2026-11-01', amount: 10000, what: 'משכורת', cat: 'salary' }, { date: '2026-11-02', amount: -300, what: 'שופרסל', cat: 'food' },
  { date: '2026-11-03', amount: -120.5, what: 'שופרסל', cat: 'food' }, { date: '2026-11-04', amount: -14, what: 'קפה', cat: 'fun' }];
eq('sums', R.sums(tx), { in: 10000, out: 434.5, left: 9565.5, byCat: { food: 420.5, fun: 14 } });
eq('frequent: twice and more, the median', R.frequent(tx), [{ what: 'שופרסל', cat: 'food', key: '', amount: -120.5, same: false, count: 2 }]);
const ai = R.aiSummary('2026-11', R.sums(tx), R.sums([]), -400, 14);
eq('the AI sees category names and sums only', ai.byCategory, { 'מכולת וסופר': 421, 'בילוי, מסעדות וקניות': 14 });
eq('never a description', JSON.stringify(ai).includes('שופרסל') || JSON.stringify(ai).includes('קפה'), false);

/* ---- holdings ---- */
eq('a holding', R.cleanHolding({ symbol: ' voo ', qty: '3', cost: 5000.555 }), { symbol: 'VOO', name: 'VOO', qty: 3, cost: 5000.56 });
throws('a bad symbol', () => R.cleanHolding({ symbol: 'V O O', qty: 1 }), 'bad_symbol');
throws('no units', () => R.cleanHolding({ symbol: 'VOO', qty: 0 }), 'bad_qty');
eq('a US ticker', R.feedSymbol('BRK.B'), 'brk-b.us');
eq('an Israeli fund number is not priced', R.feedSymbol('1159250'), null);
eq('the price feed', R.parsePriceCsv('Symbol,Date,Time,Open,High,Low,Close,Volume\r\nVOO.US,2026-11-13,22:00:19,560.1,565,559,563.27,4000000\r\n'), 563.27);
eq('no price', R.parsePriceCsv('Symbol,Date,Time,Open,High,Low,Close,Volume\nX.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D'), null);
eq('a קופה name', R.kupaName('  '), 'קופת הבית');

/* ---- the page: the category guess ---- */
eq('a supermarket', C.guess('שופרסל דיל רעננה', 'out', {}).best, 'food');
eq('fuel', C.guess('סונול ירושלים', 'out', {}).best, 'car');
eq('three offered', C.guess('שופרסל', 'out', {}).offer.length, 3);
eq('a remembered choice wins', C.guess('שופרסל דיל רעננה', 'out', { 'שופרסל דיל רעננה': 'home' }).best, 'home');
eq('remembered by the first word', C.guess('שופרסל אקספרס', 'out', { 'שופרסל דיל': 'fun' }).best, 'fun');
eq('salary', C.guess('משכורת נובמבר', 'in', {}).best, 'salary');
eq('an unknown business', C.guess('אבגד הוז', 'out', {}).known, false);
eq('the key: no numbers or branches', C.learnKey('שופרסל דיל 123 ת"א, רעננה'), 'שופרסל דיל רעננה');

/* ---- the page: reading files ---- */
eq('dates', ['12/11/2026', '1.2.26', '2026-11-03', '46338', '31/02/2026'].map(C.parseDate), ['2026-11-12', '2026-02-01', '2026-11-03', '2026-11-12', null]);
eq('amounts', ['1,234.50', '₪ -45', '45.00-', '(45)', '−12', '', 'סה"כ'].map(C.parseAmount), [1234.5, -45, -45, -45, -12, null, null]);
eq('csv with quotes', C.parseCsv('﻿תאריך,תיאור,סכום\n"01/11/2026","שופרסל, רעננה","1,200.5"\r\n'), [['תאריך', 'תיאור', 'סכום'], ['01/11/2026', 'שופרסל, רעננה', '1,200.5']]);

// a card company's file: a title above the header, a charge column, a summary line
const card = [['פירוט עסקאות לכרטיס 1234'], [], ['תאריך עסקה', 'שם בית העסק', 'סכום עסקה', 'סכום חיוב', 'הערות'],
  ['02/11/2026', 'שופרסל דיל רעננה', '342.50', '342.50', ''], ['03/11/2026', 'BIT העברה לנועה', '100', '100', ''],
  ['05/11/2026', 'זארה החזר', '-89.9', '-89.9', 'זיכוי'], ['', 'סה"כ', '', '352.60', '']];
const fc = C.detect(card);
eq('card: the header found', [fc.header, fc.kind], [2, 'card']);
const pc = C.toPayments(card, fc, {});
eq('card: charges are expenses, a refund comes in', pc.map((p) => p.amount), [-342.5, -100, 89.9]);
eq('card: a transfer is unsure', pc.map((p) => p.state), ['new', 'unsure', 'new']);
eq('card: the guess', pc[0].cat, 'food');

// a bank's file (debit and credit columns), with a card's monthly bill
const bank = C.parseHtmlTable(`<html><body><table><tr><th>תאריך</th><th>הפעולה</th><th>חובה</th><th>זכות</th><th>היתרה בש&quot;ח</th></tr>
<tr><td>01/11/2026</td><td>משכורת</td><td></td><td>11,800.00</td><td>15,000</td></tr>
<tr><td>10/11/2026</td><td>ישראכרט</td><td>3,210.40</td><td></td><td>11,789.6</td></tr>
<tr><td>12/11/2026</td><td>חברת החשמל</td><td>412.00</td><td></td><td>11,377.6</td></tr></table></body></html>`);
const fb = C.detect(bank);
eq('bank: the header found', [fb.header, fb.kind], [0, 'bank']);
const pb = C.toPayments(bank, fb, {});
eq('bank: debit out, credit in', pb.map((p) => p.amount), [11800, -3210.4, -412]);
eq('bank: the card bill is unsure and unticked', [pb[1].state, pb[1].pick], ['unsure', false]);
eq('bank: salary and electricity', [pb[0].cat, pb[2].cat], ['salary', 'bills']);
eq('flipped signs', C.toPayments(bank, fb, { flip: true })[0].amount, -11800);

// an xlsx file, zipped here the way Excel does (deflate), read back with node's inflate
const zip = (files) => {
  const parts = [], central = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text)), nm = Buffer.from(name);
    const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(8, 8); loc.writeUInt32LE(data.length, 18); loc.writeUInt16LE(nm.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(data.length, 20); cen.writeUInt16LE(nm.length, 28); cen.writeUInt32LE(off, 42);
    parts.push(loc, nm, data); central.push(cen, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
};
const xlsx = zip({
  'xl/sharedStrings.xml': '<sst><si><t>תאריך</t></si><si><t>תיאור</t></si><si><t>סכום</t></si><si><r><t>סונול </t></r><r><t>חיפה</t></r></si></sst>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
    + '<row r="2"><c r="A2"><v>46338</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>-250.3</v></c></row></sheetData></worksheet>',
});
eq('xlsx: sniffed', C.sniff(xlsx), 'xlsx');
eq('html: sniffed', C.sniff(Buffer.from('<html><table>')), 'html');
eq('old excel: sniffed', C.sniff(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), 'biff');
const xr = await C.parseXlsx(xlsx, async (b) => new Uint8Array(await import('node:zlib').then((z) => z.inflateRawSync(b))));
eq('xlsx: rows', xr, [['תאריך', 'תיאור', 'סכום'], ['46338', 'סונול חיפה', '-250.3']]);
const px = C.toPayments(xr, C.detect(xr), {});
eq('xlsx: a payment', [px[0].date, px[0].amount, px[0].cat], ['2026-11-12', -250.3, 'car']);

/* ---- the page: amounts and tips ---- */
eq('money', [C.money(-342.5), C.money(11800, true), C.money(0.5), C.money(-1234.56)], ['−342.5 ₪', '+11,800 ₪', '0.5 ₪', '−1,235 ₪']);
const cats = [{ key: 'food', name: 'מכולת וסופר' }];
eq('a tip: more out than in', C.ruleTips({ in: 1000, out: 1500, byCat: {} }, { out: 0, byCat: {} }, 0, cats, 10).length, 1);
eq('a tip: a category grew', C.ruleTips({ in: 9000, out: 3000, byCat: { food: 3000 } }, { out: 2000, byCat: { food: 2000 } }, 0, cats, 25, 'אוקטובר'), ['מכולת וסופר עלה ב-50% מאוקטובר.']);
eq('no tip early in the month', C.ruleTips({ in: 9000, out: 3000, byCat: { food: 3000 } }, { out: 2000, byCat: { food: 2000 } }, 0, cats, 5), []);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
