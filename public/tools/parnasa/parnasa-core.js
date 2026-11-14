/* פרנסה, the page's rules (no page, no network), so node can test them: server/test-parnasa.mjs.
   - the category guess for "על מה" and for a bank file's rows (a remembered choice first, then known businesses);
   - reading a bank or card file on the device: CSV, xlsx (unzipped here) and the HTML-table ".xls" Israeli banks give;
     the file itself never leaves the device, only the reviewed rows do;
   - amounts as the design contract writes them (U+2212 for minus, a space before ₪);
   - the plain tips, from the month's sums. */
(function (root) {
  'use strict';

  /* ---------- the category guess ---------- */
  // businesses and words seen on Israeli statements, per category (lower case; matched as a part of the description)
  const WORDS = {
    food: ['שופרסל', 'רמי לוי', 'יוחננוף', 'ויקטורי', 'טיב טעם', 'מגה ', 'אושר עד', 'יינות ביתן', 'חצי חינם', 'קרפור', 'carrefour', 'סופר', 'מכולת', 'מאפי', 'ירקן', 'ירקות', 'קצב', 'am:pm', 'am pm', 'פרש מרקט', 'זול ובגדול', 'מחסני השוק', 'נתיב החסד', 'קואופ', 'שוק '],
    home: ['ארנונה', 'שכירות', 'שכר דירה', 'ועד בית', 'משכנתא', 'איקאה', 'ikea', 'הום סנטר', 'ace ', 'אייס', 'עירייה', 'עיריית', 'מועצה', 'טמבור'],
    bills: ['חברת החשמל', 'חשמל', 'מים', 'תאגיד', 'מי ', 'בזק', 'פרטנר', 'סלקום', 'הוט', 'hot ', 'yes', 'גולן טלקום', 'רמי לוי תקשורת', 'פלאפון', 'נטפליקס', 'netflix', 'ספוטיפיי', 'spotify', 'אינטרנט', 'סופרגז', 'אמישראגז', 'פזגז', 'גז ', 'apple.com', 'google', 'icloud'],
    car: ['דלק', 'סונול', 'דור אלון', 'פז ', 'ten ', 'yellow', 'חניה', 'חניון', 'פנגו', 'pango', 'סלופארק', 'כביש 6', 'כביש6', 'רב קו', 'רב-קו', 'רכבת', 'מוסך', 'צמיגים', 'טסט', 'gett', 'מונית', 'אגד', 'דן ', 'מטרופולין', 'משרד הרישוי', 'קורקינט'],
    health: ['מכבי', 'כללית', 'מאוחדת', 'לאומית', 'סופר-פארם', 'סופר פארם', 'superpharm', 'בית מרקחת', 'פארם', 'ביטוח', 'הראל', 'מגדל', 'הפניקס', 'מנורה', 'איילון', 'רופא', 'שיניים', 'אופטיק', 'משקפיים', 'קופת חולים'],
    kids: ['גן ', 'צהרון', 'בית ספר', 'בית הספר', 'חוג', 'מעון', 'צעצוע', 'שילב', 'מטפלת', 'שמרטף', 'קייטנה', 'תנועת', 'ספרים', 'צומת ספרים', 'סטימצקי', 'ועד הורים'],
    fun: ['מסעדה', 'מסעדת', 'קפה', 'ארומה', 'מקדונלד', 'פיצה', 'בורגר', 'וולט', 'wolt', 'תן ביס', '10bis', 'סינמה', 'קולנוע', 'יס פלאנט', 'זארה', 'zara', 'h&m', 'קסטרו', 'פוקס', 'אמזון', 'amazon', 'aliexpress', 'עלי אקספרס', 'שיין', 'shein', 'ksp', 'באג', 'איביי', 'ebay', 'נעלי', 'מלון', 'booking', 'airbnb', 'גלידה', 'בר '],
    salary: ['משכורת', 'שכר ', 'משכ'],
    benefit: ['ביטוח לאומי', 'בטוח לאומי', 'קצבה', 'קצבת', 'החזר', 'מס הכנסה', 'זיכוי', 'מענק'],
  };
  // transfers to a person: their category cannot be known (an unsure row in a file)
  const TRANSFER = /(^|[^\p{L}])(bit|ביט|פייבוקס|paybox|pepper|פפר)([^\p{L}]|$)|העברה|העב'|הע\. /iu;
  // a credit card's monthly bill in a bank file: its lines are in the card's own file (counting both counts twice)
  const CARD_BILL = /ישראכרט|isracard|לאומי קארד|לאומיקארד|מקס איט|max it|כאל|cal |ויזה|visa|אמריקן|אמקס|amex|דיינרס|diners|כרטיס אשראי|כרטיסי אשראי|חיוב כרטיס/iu;

  /** the key a choice is remembered by: the business without numbers, branches or punctuation (its first three words) */
  function learnKey(what) {
    return String(what || '').toLowerCase().replace(/[^\p{L}&]+/gu, ' ').trim().split(' ').filter((w) => w.length > 1).slice(0, 3).join(' ').slice(0, 60);
  }
  const OUT = ['food', 'home', 'bills', 'car', 'health', 'kids', 'fun', 'other'], IN = ['salary', 'benefit', 'in_other'];
  /** the categories to offer for a description, the best guess first: [best, two more]. learned is { key: cat }. */
  function guess(what, kind, learned) {
    const pool = kind === 'in' ? IN : OUT;
    const text = ' ' + String(what || '').toLowerCase() + ' ';
    const found = [];
    const k = learnKey(what);
    if (k && learned && pool.includes(learned[k])) found.push(learned[k]);
    else if (learned && k) {
      // a remembered business by its first word (שופרסל דיל and שופרסל אקספרס)
      const first = k.split(' ')[0];
      const hit = first.length > 2 && Object.keys(learned).find((x) => x.split(' ')[0] === first && pool.includes(learned[x]));
      if (hit) found.push(learned[hit]);
    }
    for (const c of pool) if ((WORDS[c] || []).some((w) => text.includes(w)) && !found.includes(c)) found.push(c);
    // nothing known: "שונות" (or "הכנסה אחרת"), with the most common ones offered beside it
    const known = found.length > 0, best = found[0] || (kind === 'in' ? 'in_other' : 'other');
    if (!known) found.push(best);
    const rest = kind === 'in' ? IN : ['food', 'fun', 'bills', 'car', 'home', 'health', 'kids'];
    for (const c of rest) { if (found.length >= 3) break; if (!found.includes(c)) found.push(c); }
    return { best, known, offer: found.slice(0, 3) };
  }

  /* ---------- reading a file ---------- */
  /** CSV (or ; or tab separated), with quotes */
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const sep = [',', ';', '\t'].map((s) => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && cell === '') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map((r) => r.map((c) => c.trim()));
  }

  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const unent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m));
  const textOf = (html) => unent(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  /** the ".xls" most Israeli banks give is an HTML page with a table: its rows */
  function parseHtmlTable(html) {
    const rows = [];
    for (const tr of String(html).match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      rows.push((tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(textOf));
    }
    return rows;
  }

  /** an xlsx file (a zip of XML): the first sheet's rows. inflate(bytes) → bytes is DecompressionStream('deflate-raw'). */
  async function parseXlsx(buf, inflate) {
    const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // the end of the central directory, then each entry
    let end = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error('not_zip');
    const files = {};
    let p = dv.getUint32(end + 16, true);
    const n = dv.getUint16(end + 10, true);
    const dec = new TextDecoder();
    for (let i = 0; i < n && dv.getUint32(p, true) === 0x02014b50; i++) {
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nameLen = dv.getUint16(p + 28, true);
      const extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
      files[dec.decode(b.subarray(p + 46, p + 46 + nameLen))] = { method, size, local };
      p += 46 + nameLen + extra + comment;
    }
    const read = async (name) => {
      const f = files[name]; if (!f) return null;
      const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
      const raw = b.subarray(start, start + f.size);
      return dec.decode(f.method === 0 ? raw : await inflate(raw));
    };
    const shared = [];
    const ss = await read('xl/sharedStrings.xml');
    if (ss) for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) || []) shared.push(unent((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
    const sheet = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort((a, x) => parseInt(a.match(/\d+/)) - parseInt(x.match(/\d+/)))[0];
    const xml = sheet && (await read(sheet));
    if (!xml) throw new Error('no_sheet');
    const col = (ref) => { let c = 0; for (const ch of ref.replace(/\d+/g, '')) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };
    const rows = [];
    for (const r of xml.match(/<row[\s\S]*?<\/row>|<row[^>]*\/>/g) || []) {
      const row = [];
      for (const c of r.match(/<c [^>]*\/>|<c [\s\S]*?<\/c>/g) || []) {
        const ref = (c.match(/ r="([A-Z]+)\d+"/) || [])[1], t = (c.match(/ t="(\w+)"/) || [])[1];
        const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = t === 's' ? shared[+v] ?? '' : t === 'inlineStr' ? unent((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '') : v != null ? unent(v) : '';
        row[ref ? col(ref) : row.length] = String(val).trim();
      }
      rows.push(Array.from(row, (x) => x ?? ''));
    }
    return rows;
  }

  /** what kind of file it is from its first bytes: 'xlsx', 'html', 'biff' (old binary Excel, not read here) or 'csv' */
  function sniff(bytes) {
    const b = new Uint8Array(bytes.slice ? bytes.slice(0, 512) : bytes);
    if (b[0] === 0x50 && b[1] === 0x4b) return 'xlsx';
    if (b[0] === 0xd0 && b[1] === 0xcf) return 'biff';
    const head = new TextDecoder().decode(b).toLowerCase();
    return /<(html|table|tr|meta|!doctype)/.test(head) ? 'html' : 'csv';
  }

  /* ---------- from a table to payments ---------- */
  /** a date cell: 12/11/2026, 12.11.26, 2026-11-12, or an Excel day number */
  function parseDate(v) {
    const s = String(v ?? '').trim();
    let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
    if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return ok(y, +m[2], +m[1]); }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return ok(+m[1], +m[2], +m[3]);
    if (/^\d{5}(\.\d+)?$/.test(s) && +s > 30000 && +s < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5); return ok(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    return null;
    function ok(y, mo, d) {
      const t = new Date(Date.UTC(y, mo - 1, d));
      return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && y > 1990 && y < 2100 ? t.toISOString().slice(0, 10) : null;
    }
  }
  /** an amount cell: "1,234.50", "₪ -45", "45.00-", "(45)" → a number, or null */
  function parseAmount(v) {
    let s = String(v ?? '').replace(/[₪\s‎‏‪-‮]|ש"ח|NIS|ILS/gi, '').replace(/−/g, '-');
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1); }
    if (!/^\d[\d,]*(\.\d+)?$/.test(s)) return null;
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? (neg ? -n : n) : null;
  }

  const HEAD = {
    date: [/תאריך עסקה/, /תאריך רכישה/, /^תאריך$/, /תאריך ערך/, /תאריך/, /^date/i],
    what: [/שם בית ה?עסק/, /בית עסק/, /תיאור/, /פרטים/, /^פעולה$/, /הפעולה/, /אסמכתא ותיאור/, /description|merchant|payee/i],
    charge: [/סכום חיוב/, /סכום לחיוב/, /חיוב בש"ח/, /סכום החיוב/],
    deal: [/סכום עסקה/, /סכום העסקה/, /סכום מקורי/],
    debit: [/^חובה/, /בחובה/, /debit/i],
    credit: [/^זכות/, /בזכות/, /credit/i],
    amount: [/^סכום/, /סכום/, /amount/i],
  };
  const findCol = (head, list) => { for (const re of list) { const i = head.findIndex((h) => re.test(h)); if (i >= 0) return i; } return -1; };
  /** the header row (within the first 40) and its columns; a card file's charges are expenses, a bank's debits are */
  function detect(rows) {
    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      const head = rows[r].map((h) => String(h || '').replace(/\s+/g, ' ').trim());
      const cols = { date: findCol(head, HEAD.date), what: findCol(head, HEAD.what) };
      if (cols.date < 0 || cols.what < 0) continue;
      cols.charge = findCol(head, HEAD.charge); cols.deal = findCol(head, HEAD.deal);
      cols.debit = findCol(head, HEAD.debit); cols.credit = findCol(head, HEAD.credit);
      cols.amount = findCol(head, HEAD.amount);
      const card = cols.charge >= 0 || cols.deal >= 0 || head.some((h) => /בית ה?עסק/.test(h));
      if (cols.charge < 0 && cols.deal < 0 && cols.debit < 0 && cols.credit < 0 && cols.amount < 0) continue;
      return { header: r, cols, kind: card ? 'card' : 'bank' };
    }
    return null;
  }

  /** the table's payments, each with its guessed category and a state: new, unsure (with why) */
  function toPayments(rows, found, opts = {}) {
    const { cols, kind } = found, flip = !!opts.flip, learned = opts.learned || {};
    const out = [];
    for (let r = found.header + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const date = parseDate(row[cols.date]);
      const what = String(row[cols.what] ?? '').replace(/\s+/g, ' ').trim();
      if (!date || !what) continue;
      let amount = null;
      if (kind === 'card') {
        const v = parseAmount(row[cols.charge >= 0 ? cols.charge : cols.deal >= 0 ? cols.deal : cols.amount]) ?? parseAmount(row[cols.deal]);
        if (v != null) amount = -v;   // a charge is money going out; a refund (negative) comes back in
      } else if (cols.debit >= 0 || cols.credit >= 0) {
        const d = parseAmount(row[cols.debit]), c = parseAmount(row[cols.credit]);
        if (d) amount = -Math.abs(d); else if (c) amount = Math.abs(c);
      } else amount = parseAmount(row[cols.amount]);
      if (!amount) continue;
      if (flip) amount = -amount;
      amount = Math.round(amount * 100) / 100;
      const g = guess(what, amount > 0 ? 'in' : 'out', learned);
      const p = { date, what, amount, cat: g.best, key: learnKey(what), state: 'new', why: '', pick: true };
      if (kind === 'bank' && amount < 0 && CARD_BILL.test(what)) {
        p.state = 'unsure'; p.pick = false;
        p.why = 'נראה כמו החיוב החודשי של כרטיס אשראי. אם מייבאים גם את קובץ הכרטיס, השורה הזאת תיספר פעמיים.';
      } else if (TRANSFER.test(what) && !(learned[p.key])) {
        p.state = 'unsure'; p.why = amount < 0 ? 'לא בטוח: העברה לאדם. לאיזו קטגוריה?' : 'לא בטוח: העברה מאדם. מה זה?';
      }
      out.push(p);
    }
    return out;
  }

  /* ---------- writing amounts ---------- */
  const fmtN = (n, digits) => Math.abs(n).toLocaleString('he-IL', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  /** "1,234 ₪", "−342.5 ₪"; sign: '+' also writes the plus. Whole shekels from 1,000 up. */
  function money(n, sign) {
    const x = Number(n) || 0;
    const s = fmtN(x, Math.abs(x) >= 1000 ? 0 : 2);
    return `${x < 0 ? '−' : sign && x > 0 ? '+' : ''}${s} ₪`;
  }

  /* ---------- the plain tips (before Claude's) ---------- */
  /** at most two short tips from the sums alone. cats: [{key, name}], day: today's day of the month (or 31 for a past month) */
  function ruleTips(sum, prev, recurMonthly, cats, day, monthName) {
    const name = (k) => (cats.find((c) => c.key === k) || {}).name || k;
    const tips = [];
    if (sum.in > 0 && sum.out > sum.in) tips.push(`החודש יצא יותר ממה שנכנס, ב-${money(sum.out - sum.in)}.`);
    // the category that grew most against last month (a real change: 25% and ₪200 at least, and a month far enough along)
    if (prev.out > 0 && day >= 20) {
      const grew = Object.entries(sum.byCat).map(([k, v]) => [k, v, prev.byCat[k] || 0]).filter(([, v, p]) => p > 0 && v - p >= 200 && v / p >= 1.25)
        .sort((a, b) => (b[1] - b[2]) - (a[1] - a[2]))[0];
      if (grew) tips.push(`${name(grew[0])} עלה ב-${Math.round((grew[1] / grew[2] - 1) * 100)}% מ${monthName || 'החודש הקודם'}.`);
    }
    const fixed = Math.abs(recurMonthly || 0);
    if (fixed > 0 && sum.in > 0 && fixed / sum.in >= 0.5) tips.push(`החיובים הקבועים לוקחים ${Math.round((fixed / sum.in) * 100)}% מההכנסה. כדאי לעבור עליהם פעם בשנה.`);
    return tips.slice(0, 2);
  }

  const api = { WORDS, learnKey, guess, parseCsv, parseHtmlTable, parseXlsx, sniff, parseDate, parseAmount, detect, toPayments, money, ruleTips, TRANSFER, CARD_BILL };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PRCore = api;
})(typeof self !== 'undefined' ? self : this);
