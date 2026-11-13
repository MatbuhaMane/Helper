// The notification gate (master, batch 13: docs/vision/shabbat-notifications.md). Pure rules, no network, tested in test-push-gate.mjs.
// Every push passes here: an emergency always goes; during the day only five kinds go at once; quiet hours and quiet Shabbat hold
// everything else, and whatever is held waits for the daily summary on the home screen.

/** what a notification is about. Only the first five may arrive during the day. */
export type Kind = 'family' | 'gather' | 'reminder' | 'familyday' | 'emergency' | 'other' | 'test' | 'summary';
export const IMMEDIATE: Kind[] = ['family', 'gather', 'reminder', 'familyday', 'emergency', 'summary'];   // summary: the morning note, below

export interface NotifyPrefs { quietFrom?: string; quietTo?: string; shabbat?: boolean }
export interface Window { from: number; to: number }    // candle lighting → havdalah, epoch ms

const hm = (s: unknown, d: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '')) || /^(\d{1,2}):(\d{2})$/.exec(d)!; return +m[1] * 60 + +m[2]; };

/** minutes since midnight, Israel time */
export function israelMinutes(now: number): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  return +p.find((x) => x.type === 'hour')!.value * 60 + +p.find((x) => x.type === 'minute')!.value;
}

/** inside the quiet hours (default 22:00–07:00, across midnight or not) */
export function quiet(prefs: NotifyPrefs, minutes: number): boolean {
  const a = hm(prefs.quietFrom, '22:00'), b = hm(prefs.quietTo, '07:00');
  if (a === b) return false;                               // the same time twice: no quiet hours
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

export const inShabbat = (now: number, windows: Window[]) => windows.some((w) => now >= w.from && now < w.to);

/** send now, or hold for the daily summary */
export function decide(kind: Kind, now: number, prefs: NotifyPrefs, windows: Window[]): 'send' | 'hold' {
  if (kind === 'emergency' || kind === 'test') return 'send';   // a test is the person asking for it now
  if (prefs.shabbat && inShabbat(now, windows)) return 'hold';
  if (quiet(prefs, israelMinutes(now))) return 'hold';
  return IMMEDIATE.includes(kind) ? 'send' : 'hold';
}

/** Hebcal's /shabbat items → windows: each candle lighting to the havdalah after it (Shabbat and Yom Tov alike) */
export function windowsFrom(items: { category: string; date: string }[]): Window[] {
  const t = items.filter((i) => (i.category === 'candles' || i.category === 'havdalah') && i.date.length > 10)
    .map((i) => ({ c: i.category, at: Date.parse(i.date) })).filter((x) => !isNaN(x.at)).sort((a, b) => a.at - b.at);
  const out: Window[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i].c !== 'candles') continue;
    const end = t.slice(i + 1).find((x) => x.c === 'havdalah');
    if (end) { out.push({ from: t[i].at, to: end.at }); i = t.indexOf(end); }
  }
  return out;
}
