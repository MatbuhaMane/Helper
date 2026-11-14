/* פרנסה (docs/decisions.md 2026-11-13): the household's money. The rules only, no database or network.
   Tests: node server/test-parnasa.mjs
   - amounts are signed numbers in shekels: an expense is negative, money coming in positive;
   - dates are 'YYYY-MM-DD' strings (the person's own calendar day, no time zone), a month is 'YYYY-MM';
   - a category is a key from CATS; its colour number (c, 1..8) never moves, so a category keeps its colour. */

export class ParnasaError extends Error {
  constructor(public code: string) { super(code); }
}

export const CATS = [
  // the expenses (c is design's --pr-c1..8; 8 is שונות)
  { key: 'food', name: 'מכולת וסופר', c: 1, kind: 'out' },
  { key: 'home', name: 'בית ודיור', c: 2, kind: 'out' },
  { key: 'bills', name: 'חשבונות ותקשורת', c: 3, kind: 'out' },
  { key: 'car', name: 'רכב ותחבורה', c: 4, kind: 'out' },
  { key: 'health', name: 'בריאות וביטוח', c: 5, kind: 'out' },
  { key: 'kids', name: 'ילדים וחינוך', c: 6, kind: 'out' },
  { key: 'fun', name: 'בילוי, מסעדות וקניות', c: 7, kind: 'out' },
  { key: 'other', name: 'שונות', c: 8, kind: 'out' },
  // the income (shown in the vine, --pr-in)
  { key: 'salary', name: 'משכורת', c: 0, kind: 'in' },
  { key: 'benefit', name: 'קצבאות והחזרים', c: 0, kind: 'in' },
  { key: 'in_other', name: 'הכנסה אחרת', c: 0, kind: 'in' },
] as const;
export type CatKey = (typeof CATS)[number]['key'];
const CAT_KEYS = new Set<string>(CATS.map((c) => c.key));
export const catOf = (key: string) => CATS.find((c) => c.key === key) || CATS.find((c) => c.key === 'other')!;

/* ---------- dates and months ---------- */
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'))
  && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
export const isMonth = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
/** the month n months from this one ('2026-11', -1 → '2026-10') */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
const daysIn = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
/** the same day n months later; a day the month does not have becomes its last (31 Jan + 1 → 28/29 Feb) */
export function addMonthsToDate(date: string, n: number, day = +date.slice(8, 10)): string {
  const month = addMonths(date.slice(0, 7), n);
  return `${month}-${String(Math.min(day, daysIn(month))).padStart(2, '0')}`;
}
/** the first and last day of a month, for a BETWEEN */
export const monthRange = (month: string): [string, string] => [`${month}-01`, `${month}-${String(daysIn(month)).padStart(2, '0')}`];

/* ---------- one payment, as the server keeps it ---------- */
export interface CleanTx { date: string; amount: number; what: string; cat: CatKey; key: string }
const MAX_AMOUNT = 10_000_000;
/** a line of text: no control characters, single spaces, at most n characters */
export const line = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
/** a payment from a page (an entry or an import row); throws ParnasaError on what is not one */
export function cleanTx(input: unknown): CleanTx {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const amount = typeof r.amount === 'number' ? r.amount : typeof r.amount === 'string' ? Number(r.amount) : NaN;
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_AMOUNT) throw new ParnasaError('bad_amount');
  if (!isDate(r.date)) throw new ParnasaError('bad_date');
  const what = line(r.what, 120);
  let cat = typeof r.cat === 'string' && CAT_KEYS.has(r.cat) ? (r.cat as CatKey) : null;
  // a category of the other kind (an expense filed as a salary) is not kept: the kind follows the sign
  if (!cat || (catOf(cat).kind === 'in') !== amount > 0) cat = amount > 0 ? 'in_other' : 'other';
  return { date: r.date, amount: Math.round(amount * 100) / 100, what: what || (amount > 0 ? 'הכנסה' : 'הוצאה'), cat, key: line(r.key, 60).toLowerCase() };
}

/** what makes two payments the same one (a file imported twice, or a payment entered by hand and then imported) */
export const dupKey = (t: { date: string; amount: number; what: string }) =>
  `${t.date}|${Math.round(t.amount * 100)}|${line(t.what, 120).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')}`;

/* ---------- recurring payments ---------- */
export interface Recur { id: string; every: number; day: number; next_date: string }
/** the dates a recurring payment is due up to today (at most 24 at once), and its next date after them */
export function dueDates(r: Recur, today: string): { dates: string[]; next: string } {
  const dates: string[] = [];
  let next = r.next_date;
  while (next <= today && dates.length < 24) { dates.push(next); next = addMonthsToDate(next, Math.max(1, r.every), r.day); }
  return { dates, next };
}

/* ---------- the dashboard's sums ---------- */
export interface Tx { date: string; amount: number; what: string; cat: string; key?: string | null }
export function sums(txs: Tx[]) {
  let inc = 0, out = 0;
  const byCat: Record<string, number> = {};
  for (const t of txs) {
    if (t.amount > 0) inc += t.amount; else out -= t.amount;
    if (t.amount < 0) byCat[t.cat] = (byCat[t.cat] || 0) - t.amount;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { in: r2(inc), out: r2(out), left: r2(inc - out), byCat: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, r2(v)])) };
}

/** the entries made again and again (the one-tap chips): the last 90 days, at least twice, the most frequent first.
    `same` says every time was the same amount (one tap enters it); else the sheet opens with the usual amount. */
export function frequent(txs: Tx[], n = 6) {
  const groups = new Map<string, { what: string; cat: string; key: string; amounts: number[]; last: string }>();
  for (const t of txs) {
    const id = `${line(t.what, 120).toLowerCase()}|${t.cat}`;
    const g = groups.get(id) || { what: line(t.what, 120), cat: t.cat, key: t.key || '', amounts: [], last: t.date };
    g.amounts.push(t.amount);
    if (t.date > g.last) g.last = t.date;
    groups.set(id, g);
  }
  return [...groups.values()].filter((g) => g.amounts.length >= 2)
    .sort((a, b) => b.amounts.length - a.amounts.length || (b.last > a.last ? 1 : -1))
    .slice(0, n)
    .map((g) => {
      const s = [...g.amounts].sort((a, b) => a - b);
      const median = s[Math.floor(s.length / 2)];
      return { what: g.what, cat: g.cat, key: g.key, amount: median, same: s[0] === s[s.length - 1], count: s.length };
    });
}

/** what Claude may see for the tips: the month's sums by category and last month's, the totals and the fixed charges.
    Never a line, a name, a place or a note: the decision's rule. */
export function aiSummary(month: string, now: ReturnType<typeof sums>, prev: ReturnType<typeof sums>, recurMonthly: number, dayOfMonth: number) {
  const named = (by: Record<string, number>) => Object.fromEntries(Object.entries(by).map(([k, v]) => [catOf(k).name, Math.round(v)]));
  return {
    month, dayOfMonth, daysInMonth: daysIn(month),
    income: Math.round(now.in), spent: Math.round(now.out),
    byCategory: named(now.byCat),
    lastMonth: { income: Math.round(prev.in), spent: Math.round(prev.out), byCategory: named(prev.byCat) },
    fixedChargesPerMonth: Math.round(recurMonthly),
  };
}

/* ---------- holdings ---------- */
export interface CleanHolding { symbol: string; name: string; qty: number; cost: number }
/** a holding entered by hand: a symbol (letters, digits, a dot or a dash), how many units, what it cost in all (₪) */
export function cleanHolding(input: unknown): CleanHolding {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const symbol = line(r.symbol, 16).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.\-]{0,15}$/.test(symbol)) throw new ParnasaError('bad_symbol');
  const qty = Number(r.qty), cost = Number(r.cost ?? 0);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 1e9) throw new ParnasaError('bad_qty');
  if (!Number.isFinite(cost) || cost < 0 || cost > MAX_AMOUNT * 10) throw new ParnasaError('bad_amount');
  return { symbol, name: line(r.name, 60) || symbol, qty, cost: Math.round(cost * 100) / 100 };
}
/** the price feed's symbol: a US ticker (letters) is asked as "voo.us"; anything else is not priced (valued at cost) */
export const feedSymbol = (symbol: string) => (/^[A-Z]{1,6}(\.[A-Z])?$/.test(symbol) ? symbol.toLowerCase().replace('.', '-') + '.us' : null);
/** one line of the price feed's CSV (Symbol,Date,Time,Open,High,Low,Close,Volume) → the close, or null */
export function parsePriceCsv(csv: string): number | null {
  const rows = csv.trim().split(/\r?\n/);
  if (rows.length < 2) return null;
  const head = rows[0].toLowerCase().split(','), vals = rows[1].split(',');
  const close = Number(vals[head.indexOf('close')]);
  return Number.isFinite(close) && close > 0 ? close : null;
}

/* ---------- the shared קופה ---------- */
export const kupaName = (v: unknown) => line(v, 40) || 'קופת הבית';
