// The owner's room (/admin/): the pure rules, with no database, so they can be tested alone (node server/test-admin.mjs):
// what the project earned and spent month by month (entries once or every month, in shekels or dollars, and the AI as
// the meter counted it), how long an entry into the room lasts, and the settings' values checked against their kind.

/* ---------------- money ---------------- */

export interface Entry {
  kind: 'income' | 'expense'; title: string; amount: number; currency: 'ILS' | 'USD';
  date: string;              // the first (or only) day it was paid
  monthly: boolean;          // paid again every month on that day
  until: string | null;      // the last day of a monthly one (inclusive), or none
}
export const month = (iso: string) => iso.slice(0, 7);
const addMonth = (m: string, n: number) => { const y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n; return `${y + Math.floor(mo / 12)}-${String(((mo % 12) + 12) % 12 + 1).padStart(2, '0')}`; };
const daysIn = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();

/** the months in which an entry was paid, up to today: once, or every month on its day (the last day of a shorter month) */
export function paidMonths(e: Entry, today: string): string[] {
  if (e.date > today) return [];
  if (!e.monthly) return [month(e.date)];
  const out: string[] = [], day = +e.date.slice(8, 10), end = e.until && e.until < today ? e.until : today;
  for (let m = month(e.date); m <= month(end); m = addMonth(m, 1)) {
    const on = `${m}-${String(Math.min(day, daysIn(m))).padStart(2, '0')}`;
    if (on <= end) out.push(m);
  }
  return out;
}
export const toIls = (amount: number, currency: 'ILS' | 'USD', usdIls: number) => (currency === 'USD' ? amount * usdIls : amount);

export interface MonthSum { month: string; income: number; expense: number; ai: number; net: number }
/** month by month and in all: income, expenses entered by hand, and the AI (dollars by month, from the meter) – in shekels */
export function money(entries: Entry[], aiUsdByMonth: Record<string, number>, usdIls: number, today: string) {
  const by = new Map<string, MonthSum>();
  const at = (m: string) => by.get(m) || by.set(m, { month: m, income: 0, expense: 0, ai: 0, net: 0 }).get(m)!;
  for (const e of entries) for (const m of paidMonths(e, today)) at(m)[e.kind] += toIls(e.amount, e.currency, usdIls);
  for (const [m, usd] of Object.entries(aiUsdByMonth)) if (m <= month(today)) at(m).ai += usd * usdIls;
  const months = [...by.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  for (const s of months) s.net = s.income - s.expense - s.ai;
  const total = months.reduce((t, s) => ({ income: t.income + s.income, expense: t.expense + s.expense, ai: t.ai + s.ai, net: t.net + s.net }), { income: 0, expense: 0, ai: 0, net: 0 });
  // what a month costs now: the monthly entries still running, and the AI of the last full month
  const running = entries.filter((e) => e.monthly && e.date <= today && (!e.until || e.until >= today));
  const last = addMonth(month(today), -1);
  const perMonth = { income: 0, expense: 0, ai: (aiUsdByMonth[last] || 0) * usdIls };
  for (const e of running) perMonth[e.kind] += toIls(e.amount, e.currency, usdIls);
  return { months, total, perMonth };
}
const round2 = (n: number) => Math.round(n * 100) / 100;
/** an entry as it came from the page, checked */
export function cleanEntry(b: Record<string, unknown>): Entry {
  const kind = b.kind === 'income' ? 'income' : 'expense';
  const title = String(b.title ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
  const amount = round2(Number(b.amount));
  const date = String(b.date ?? '');
  if (!title) throw new Error('title_required');
  if (!(amount > 0 && amount < 1e8)) throw new Error('bad_amount');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad_date');
  const until = typeof b.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.until) && b.until >= date ? b.until : null;
  return { kind, title, amount, currency: b.currency === 'USD' ? 'USD' : 'ILS', date, monthly: !!b.monthly, until: b.monthly ? until : null };
}

/* ---------------- entering the room ---------------- */

export const IDLE = 15 * 60e3, MAX = 2 * 3600e3;
/** an entry lasts a quarter of an hour from the last action, two hours at most */
export const entryAlive = (s: { created_at: number; last_at: number }, now = Date.now()) => now - s.last_at < IDLE && now - s.created_at < MAX;

/* ---------------- settings ---------------- */

export interface Setting {
  key: string; label: string; help: string; group: string;
  type: 'bool' | 'number' | 'text' | 'select'; def: boolean | number | string;
  min?: number; max?: number; options?: [string, string][];
}
/** a value as the page sent it, checked against the setting's kind; null when it does not fit */
export function settingValue(s: Setting, v: unknown): boolean | number | string | null {
  if (s.type === 'bool') return typeof v === 'boolean' ? v : null;
  if (s.type === 'number') { const n = Number(v); return Number.isFinite(n) && (s.min === undefined || n >= s.min) && (s.max === undefined || n <= s.max) ? n : null; }
  if (s.type === 'select') return s.options?.some(([k]) => k === v) ? String(v) : null;
  return typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').slice(0, 500) : null;
}
