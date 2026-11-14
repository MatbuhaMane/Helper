/**
 * עוזר מטבח, the pure part (no page, no storage): reading times out of a recipe step, the timers' arithmetic, and the
 * converter's sums. Tested in server/test-kitchen.mjs.
 *   Kitchen.times(step)              → [{ sec, label }] every time the step names ("10 דקות", "שעה וחצי", "5-7 דקות")
 *   Kitchen.clock(sec)               → "4:05", "1:02:30"
 *   Kitchen.left(timer, now)         → seconds left (a paused timer keeps what it had)
 *   Kitchen.pause / resume / addTime → a new timer object
 *   Kitchen.temp(n, from)            → { c, f } from 'c' or 'f'
 */
(function () {
  const NUM = { 'דקה': 1, 'שעה': 1, 'שנייה': 1, 'שניה': 1, 'שעתיים': 2, 'דקותיים': 2 };
  const UNIT = { 'דקות': 60, 'דקה': 60, "דק'": 60, 'דק׳': 60, 'שעות': 3600, 'שעה': 3600, 'שניות': 1, 'שנייה': 1, 'שניה': 1, 'שעתיים': 3600 };
  const WORD_NUM = { 'חצי': 0.5, 'רבע': 0.25, 'שלושת רבעי': 0.75, 'כמה': null };

  /** a short label for a number of seconds: "10 דק׳", "שעה וחצי", "45 שנ׳" */
  function label(sec) {
    if (sec % 3600 === 0) return sec === 3600 ? 'שעה' : sec === 7200 ? 'שעתיים' : `${sec / 3600} שעות`;
    if (sec === 5400) return 'שעה וחצי';
    if (sec >= 3600) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return `${h === 1 ? 'שעה' : h + ' ש׳'} ו-${m} דק׳`; }
    if (sec % 60 === 0) return `${sec / 60} דק׳`;
    if (sec < 60) return `${sec} שנ׳`;
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} דק׳`;
  }

  /** every time a recipe step names, in order, without repeats. A range ("5-7 דקות") gives its lower end: check early. */
  function times(step) {
    const s = String(step || '');
    const out = [];
    const push = (sec) => { sec = Math.round(sec); if (sec > 0 && sec <= 48 * 3600 && !out.some((t) => t.sec === sec)) out.push({ sec, label: label(sec) }); };
    // "שעה וחצי", "שעה ורבע", "שעתיים וחצי"
    const re = /(?:(\d+(?:[.,]\d+)?)(?:\s*[-–עד]+\s*(\d+(?:[.,]\d+)?))?\s*|(חצי|רבע|שלושת רבעי)\s+)?(דקות|דקה|דק['׳]|שעות|שעתיים|שעה|שניות|שנייה|שניה)(\s+ו(חצי|רבע))?/g;
    let m;
    while ((m = re.exec(s))) {
      const [, a, , word, unit, , extra] = m;
      // a bare "דקה" / "שעה" means one; a bare plural ("כמה דקות") is not a time
      let n = a ? parseFloat(a.replace(',', '.')) : word ? WORD_NUM[word] : NUM[unit] ?? null;
      if (n == null) continue;
      let sec = n * UNIT[unit];
      if (unit === 'שעתיים') sec = 7200;
      if (extra) sec += (extra === 'חצי' ? 0.5 : 0.25) * (UNIT[unit] === 1 ? 60 : UNIT[unit]);
      push(sec);
    }
    return out;
  }

  const clock = (sec) => {
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
  };

  /** a timer is { id, name, sec, end } while it runs, { id, name, sec, rest } while paused */
  const left = (t, now = Date.now()) => (t.rest != null ? t.rest : Math.max(0, (t.end - now) / 1000));
  const start = (name, sec, now = Date.now()) => ({ id: 't' + now.toString(36) + Math.random().toString(36).slice(2, 6), name: String(name || '').slice(0, 40) || label(sec), sec, end: now + sec * 1000 });
  const pause = (t, now = Date.now()) => (t.rest != null ? t : { id: t.id, name: t.name, sec: t.sec, rest: left(t, now) });
  const resume = (t, now = Date.now()) => (t.rest == null ? t : { id: t.id, name: t.name, sec: t.sec, end: now + t.rest * 1000 });
  const addTime = (t, sec, now = Date.now()) => (t.rest != null ? { ...t, rest: t.rest + sec, sec: t.sec + sec }
    : { ...t, end: Math.max(t.end, now) + sec * 1000, sec: t.sec + sec });

  const round1 = (n) => Math.round(n * 10) / 10;
  const temp = (n, from) => (from === 'f' ? { c: Math.round(((n - 32) * 5) / 9), f: n } : { c: n, f: Math.round((n * 9) / 5 + 32) });

  const api = { times, label, clock, left, start, pause, resume, addTime, temp, round1 };
  if (typeof window !== 'undefined') window.Kitchen = api;
  if (typeof globalThis !== 'undefined') globalThis.Kitchen = api;
})();
