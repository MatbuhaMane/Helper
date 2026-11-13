// ניהול מטרות – the logic without a database (vision's spec v1, docs/vision/goals.md): the rest day by tradition, the
// forgiving consistency ("4 of 7", a streak the rest day never breaks), when the "why" comes back and when the weekly
// review is due, today's 2–3 steps, the templates that break a goal into processes without AI, and the badges.
// Days are dates in Israel's time ("YYYY-MM-DD"); a weekday is 0 (Sunday) … 6 (Saturday).
// Tests: node server/test-goals.mjs

import { TOOL_BADGES } from './discover-logic';

export type Kind = 'short' | 'regular' | 'long';
export const TZ = 'Asia/Jerusalem';

/* ---------------- days ---------------- */

/** a moment as a date in Israel */
export const dayOf = (t: number, tz = TZ) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(t));
/** the hour of a moment in Israel (0–23) */
export const hourOf = (t: number, tz = TZ) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)));
const toUTC = (d: string) => Date.parse(d + 'T00:00:00Z');
export const addDays = (d: string, n: number) => new Date(toUTC(d) + n * 864e5).toISOString().slice(0, 10);
export const weekday = (d: string) => new Date(toUTC(d)).getUTCDay();
export const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 864e5);

/** the rest day of a tradition (settings' "דת"): Saturday, Friday or Sunday; none for "none" (the person may pick one) */
export function restDayFor(religion: string | undefined, chosen?: number | null): number | null {
  if (chosen === null) return null;                                   // chose to keep none
  if (typeof chosen === 'number' && chosen >= 0 && chosen <= 6) return chosen;
  return ({ jewish: 6, muslim: 5, druze: 5, christian: 0 } as Record<string, number>)[religion || 'jewish'] ?? null;
}

/** the days a step was done on (a set of dates) */
export type Done = Set<string>;

/** the streak up to today: consecutive days with a step; a rest day neither breaks nor counts; today not yet done does not break it */
export function streak(done: Done, today: string, rest: number | null): number {
  let n = 0, d = today;
  if (!done.has(d)) d = addDays(d, -1);                               // the day is not over yet
  for (let k = 0; k < 4000; k++, d = addDays(d, -1)) {
    if (rest !== null && weekday(d) === rest) continue;
    if (!done.has(d)) break;
    n++;
  }
  return n;
}

/** the forgiving week: of the last 7 days (today included), on how many was a step done, out of the working days */
export function week(done: Done, today: string, rest: number | null) {
  let n = 0, of = 0;
  for (let k = 0; k < 7; k++) {
    const d = addDays(today, -k);
    if (rest !== null && weekday(d) === rest) continue;
    of++;
    if (done.has(d)) n++;
  }
  return { done: n, of };
}

/** two working days or more with no step (and some step once): time to show the "why", gently */
export function whyDue(done: Done, today: string, rest: number | null): boolean {
  if (!done.size) return false;
  let quiet = 0;
  for (let d = addDays(today, -1), k = 0; k < 60; k++, d = addDays(d, -1)) {
    if (done.has(d)) break;
    if (rest !== null && weekday(d) === rest) continue;
    quiet++;
  }
  return quiet >= 2 && !done.has(today);
}

/** the weekly review: on the day before the rest day (with no rest day: Thursday), once a week */
export const reviewDay = (rest: number | null) => ((rest ?? 5) + 6) % 7;
export const reviewDue = (today: string, rest: number | null, lastReview: string | null) =>
  weekday(today) === reviewDay(rest) && (!lastReview || daysBetween(lastReview, today) >= 6);

/* ---------------- today's steps ---------------- */

export interface StepLite { id: string; goal: string; process: string; text: string; sort: number; done: boolean; small?: boolean }
export interface GoalLite { id: string; title: string; kind: Kind; due: string | null; days: number[] | null; status: string; sort: number }
export interface ProcessLite { id: string; goal: string; sort: number }

/** one open research thread for today (the research assistant's "חוט אחד ליום"): the same all day, another tomorrow */
export function threadOfDay<T>(threads: T[], today: string): T | null {
  if (!threads.length) return null;
  let h = 0;
  for (const ch of today) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return threads[h % threads.length];
}

/** 2–3 small steps for today: the next open step of each active goal that works today (short goals first, then the nearest
    due date), and a second one from the first goal when there are fewer goals than three */
export function todays(goals: GoalLite[], processes: ProcessLite[], steps: StepLite[], today: string, rest: number | null, max = 3): StepLite[] {
  const wd = weekday(today);
  if (rest !== null && wd === rest) return [];
  const pOrder = new Map(processes.map((p) => [p.id, p.sort]));
  const live = goals.filter((g) => g.status === 'active' && (!g.days?.length || g.days.includes(wd)))
    .sort((a, b) => (a.kind === 'short' ? 0 : 1) - (b.kind === 'short' ? 0 : 1) || (a.due || '9999').localeCompare(b.due || '9999') || a.sort - b.sort);
  const open = (g: GoalLite) => steps.filter((s) => s.goal === g.id && !s.done)
    .sort((a, b) => (pOrder.get(a.process) ?? 0) - (pOrder.get(b.process) ?? 0) || (a.small ? -1 : 0) - (b.small ? -1 : 0) || a.sort - b.sort);
  const out: StepLite[] = [];
  for (let round = 0; round < max && out.length < max; round++) {
    for (const g of live) {
      const s = open(g)[round];
      if (s && out.length < max) out.push(s);
    }
  }
  return out;
}

/* ---------------- templates (without AI) ---------------- */

export interface Template { id: string; name: string; match: RegExp; processes: { title: string; steps: string[] }[] }
const T = (id: string, name: string, match: RegExp, processes: [string, string[]][]): Template => ({ id, name, match, processes: processes.map(([title, steps]) => ({ title, steps })) });
export const TEMPLATES: Template[] = [
  T('ohel', 'האוהל: מוצר שעוזר למשפחה ומפרנס', /האוהל|אפליקציה|מוצר|סטארט|עסק|פרנסה/, [
    ['בטא במשפחה המורחבת', ['להזמין חמישה בני משפחה', 'לשבת עם אחד מהם ולראות איך הוא משתמש', 'לרשום את שלושת הדברים שהכי מבלבלים']],
    ['מדד הצפון: בני משפחה פעילים בשבוע', ['להחליט מה נחשב "פעיל"', 'לבדוק את המספר של השבוע', 'לבחור דבר אחד שיעלה אותו']],
    ['תנאי עצירה אחרי שלושה חודשים', ['לכתוב מה ייחשב הצלחה', 'לקבוע תאריך לבדיקה ביומן']],
    ['לפני המכירה הראשונה', ['לקבוע פגישה עם רואה חשבון', 'לרשום את השאלות לפגישה']],
    ['המוצר מממן את עצמו', ['לחשב כמה עולה חודש', 'לבדוק כמה משלמים היום', 'לבחור צעד אחד שמקרב']],
  ]),
  // the research assistant's own path (a research becomes a goal of this engine: docs/vision/research.md, step 2)
  T('research', 'מחקר', /^\s*מחקר|לחקור|עבודה סמינריונית|תזה|מאמר אקדמי/, [
    ['לברר מה השאלה', ['לנסח את שאלת המחקר במשפט אחד', 'לכתוב למה היא חשובה לי']],
    ['לאסוף מקורות', ['למצוא חמישה מקורות', 'לסמן את שלושת החשובים']],
    ['לקרוא ולכתוב פתקים', ['לקרוא מקור אחד ולכתוב ממנו פתק', 'לקשר בין שני פתקים']],
    ['לכתוב', ['לבנות שלד מהפתקים', 'לכתוב פסקה אחת']],
    ['לעבור ולסיים', ['לבדוק את הציטוטים', 'לייצא ולשלוח']],
  ]),
  T('study', 'לימודים ומבחן', /מבחן|בחינה|ללמוד|לימוד|קורס|תואר|בגרות|מבחנים/, [
    ['להבין מה צריך', ['לרשום את הנושאים למבחן', 'לסמן מה כבר יודעים', 'לבחור את הנושא הקשה ביותר']],
    ['ללמוד', ['ללמוד נושא אחד 25 דקות', 'לסכם את הנושא בעמוד אחד', 'לפתור שלוש שאלות']],
    ['לתרגל', ['לפתור מבחן ישן', 'לבדוק את הטעויות', 'לחזור על מה שנפל']],
  ]),
  T('fitness', 'כושר ובריאות', /כושר|ריצה|לרוץ|להתאמן|אימון|משקל|לרזות|הליכה|בריאות|שחייה/, [
    ['להתחיל בקטן', ['ללכת 10 דקות', 'להכין את הנעליים והבגדים מראש', 'לבחור שעה קבועה']],
    ['להתמיד', ['שלושה אימונים השבוע', 'לרשום אחרי כל אימון איך היה', 'להאריך ב־5 דקות']],
    ['לעקוב', ['למדוד נקודת התחלה', 'לבדוק שוב אחרי חודש']],
  ]),
  T('money', 'חיסכון וכסף', /לחסוך|חיסכון|כסף|חוב|חובות|תקציב|הוצאות/, [
    ['לראות את התמונה', ['לרשום את ההכנסות בחודש', 'לרשום את ההוצאות הקבועות', 'למצוא שלוש הוצאות קטנות שחוזרות']],
    ['לקבוע יעד', ['להחליט כמה לחסוך בחודש', 'לפתוח הוראת קבע לחיסכון']],
    ['להתמיד', ['לבדוק את החשבון פעם בשבוע', 'לוותר על הוצאה אחת השבוע']],
  ]),
  T('move', 'מעבר דירה', /מעבר דירה|לעבור דירה|דירה חדשה|לעבור ל/, [
    ['לתכנן', ['לקבוע תאריך מעבר', 'להזמין מובילים או לבקש עזרה', 'לרשום מה צריך לבטל ולהעביר (חשמל, מים, ארנונה, אינטרנט)']],
    ['לארוז', ['לאסוף קרטונים', 'לארוז חדר אחד', 'לסמן כל קרטון לאיזה חדר']],
    ['להתמקם', ['לעדכן כתובת במשרד הפנים ובבנק', 'לפרוק את המטבח קודם']],
  ]),
  T('barmitzva', 'הכנה לבר/בת מצווה', /בר מצווה|בת מצווה|בר־מצווה|בת־מצווה/, [
    ['לבחור', ['לקבוע תאריך ופרשה', 'לבחור מקום', 'לסגור תקציב']],
    ['להכין', ['ללמוד את הקריאה או הדרשה פעם בשבוע', 'לבחור פרויקט מצווה']],
    ['להזמין', ['לרשום את רשימת המוזמנים', 'לשלוח הזמנות']],
  ]),
  T('event', 'אירוע או שמחה', /חתונה|אירוע|מסיבה|יום הולדת|שמחה|ברית|כנס/, [
    ['לתכנן', ['לקבוע תאריך ומקום', 'לסגור תקציב', 'לרשום את רשימת המוזמנים']],
    ['להכין', ['לבחור אוכל', 'להזמין את מה שצריך מראש']],
    ['ביום עצמו', ['לרשום מי עושה מה', 'להכין את מה שאפשר יום לפני']],
  ]),
  T('habit', 'הרגל חדש', /הרגל|כל יום|כל בוקר|להפסיק|לעשן|מדיטציה|לישון/, [
    ['להתחיל קטן מאוד', ['לבחור גרסה של שתי דקות', 'לקשור אותה לדבר שכבר עושים כל יום']],
    ['לחזור', ['לעשות שבעה ימים', 'לסמן כל יום שעשיתי']],
    ['לגדול', ['להוסיף עוד מעט', 'לבדוק מה עוזר ומה מפריע']],
  ]),
  T('read', 'לקרוא ספר', /לקרוא|ספר|קריאה/, [
    ['להתחיל', ['לבחור את הספר', 'לקרוא עשרה עמודים']],
    ['להמשיך', ['לקרוא כל יום עשרה עמודים', 'לרשום משפט אחד שאהבתי']],
  ]),
  T('language', 'ללמוד שפה', /שפה|אנגלית|ערבית|צרפתית|ספרדית|לדבר ב/, [
    ['יסודות', ['ללמוד עשר מילים', 'לשמוע עשר דקות']],
    ['להשתמש', ['לכתוב שלושה משפטים', 'לדבר חמש דקות עם מישהו']],
  ]),
  T('project', 'פרויקט בבית', /לשפץ|שיפוץ|לסדר|לבנות|לתקן|גינה|ארון|מחסן|פרויקט/, [
    ['לתכנן', ['לצלם את המצב היום', 'לרשום מה צריך לקנות', 'לקבוע יום לעבודה']],
    ['לעשות', ['להתחיל בחלק הקטן ביותר', 'לסיים חלק אחד']],
    ['לסיים', ['לנקות ולסדר', 'לצלם את התוצאה']],
  ]),
];
const GENERIC = T('generic', 'מטרה', /$^/, [
  ['להבין', ['לכתוב איך ייראה "הצלחתי"', 'לרשום מה כבר יש לי ומה חסר']],
  ['לתכנן', ['לחלק לשלושה חלקים', 'לבחור את החלק הראשון']],
  ['לעשות', ['לעשות את הצעד הקטן ביותר', 'להמשיך בצעד הבא']],
  ['לבדוק ולסיים', ['לבדוק מה הושג', 'לחגוג']],
]);
/** the template that fits a goal's words, else the general one */
export const templateFor = (text: string) => TEMPLATES.find((t) => t.match.test(text || '')) || GENERIC;
export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id) || (id === 'generic' ? GENERIC : null);

/** "נתקעתי" without AI: guided questions that turn a step into its 5-minute version */
export const STUCK_PROMPTS = [
  'מה הדבר הראשון שאפשר לעשות בחמש דקות?',
  'מה אפשר להכין עכשיו, כדי שמחר יהיה קל יותר?',
  'למי אפשר לשלוח הודעה אחת שתקדם את זה?',
  'מה החלק הכי קטן שאפשר לסמן היום?',
];
export const SMALL_STARTERS = ['לפתוח את ', 'לכתוב שורה אחת על ', 'לשלוח הודעה אחת על ', 'לחפש חמש דקות על ', 'לסדר את המקום ל'];

/* ---------------- badges ---------------- */

export interface Badge { id: string; name: string; how: string; group: 'start' | 'progress' | 'family' | 'tools'; secret?: boolean; soon?: boolean }
export const BADGES: Badge[] = [
  { id: 'peg', name: 'יתד ראשונה', how: 'הצעד הראשון במטרה חדשה', group: 'start' },
  { id: 'ember', name: 'גחלת', how: '3 ימים של צעדים ברצף', group: 'start' },
  { id: 'fire', name: 'מדורה', how: '7 ימים ברצף', group: 'start' },
  { id: 'eternal', name: 'אש תמיד', how: '30 ימים ברצף ("אֵשׁ תָּמִיד תּוּקַד עַל הַמִּזְבֵּחַ, לֹא תִכְבֶּה")', group: 'start' },
  { id: 'rest_return', name: 'שבת למנוחה', how: 'חזרת לצעדים אחרי יום המנוחה', group: 'start' },
  { id: 'scout', name: 'סייר', how: 'גילית 10 כלים באוהל', group: 'start' },   // (awarded by server/discover.ts, at discover-logic's SCOUT_AT)
  { id: 'pitched', name: 'נטית את האוהל', how: 'השלמת את ההגדרה הראשונית', group: 'start' },   // (server/discover.ts, from the setup)
  ...TOOL_BADGES,
  { id: 'rest_seven', name: 'אֶת־שַׁבְּתֹתַי תִּשְׁמֹרוּ', how: 'שמרת על יום המנוחה שבעה שבועות ברצף, ועבדת בשאר הימים', group: 'start' },
  { id: 'pole', name: 'עמוד האוהל', how: 'סיימת תהליך שלם', group: 'progress' },
  { id: 'standing', name: 'האוהל עומד', how: 'השגת מטרה', group: 'progress' },
  { id: 'journey', name: 'מסע', how: '100 צעדים בסך הכול', group: 'progress' },
  { id: 'tracker', name: 'גשש', how: 'סיימת מחקר בעוזר המחקר', group: 'progress' },
  { id: 'dawn', name: 'עלות השחר', how: 'צעד מוקדם בבוקר (4:00–7:00)', group: 'progress' },
  { id: 'night', name: 'משמרת לילה', how: 'צעד מאוחר בלילה (23:00–3:00)', group: 'progress' },
  { id: 'traveller', name: 'איש/אשת מסע', how: 'השגת מטרה שנמשכה יותר משנה', group: 'progress' },
  { id: 'gifts', name: 'מתנות קטנות', how: 'השגת 10 מטרות קצרות', group: 'progress' },
  { id: 'milestones', name: 'אבני דרך', how: 'השגת מטרה קצרה בכל יום במשך שבוע', group: 'progress' },
  { id: 'highway', name: 'דרך ראשית', how: 'השגת מטרה קצרה בכל יום במשך חודש', group: 'progress' },
  { id: 'way_of_life', name: 'דרך חיים', how: 'השגת מטרה קצרה בכל יום במשך שנה', group: 'progress' },
  { id: 'the_way', name: 'דרך החיים', how: 'השגת מטרה קצרה בכל יום במשך שנה, תוך כדי עבודה על מטרה של יותר משנה', group: 'progress', secret: true },
  { id: 'kings_way', name: 'דרך המלך', how: 'צעדים בכל אחת מעשר שנים', group: 'progress' },
  { id: 'tribe', name: 'שבט', how: 'עודדת בן משפחה, או השלמתם יחד מטרה משותפת', group: 'family', soon: true },
  // (earned through encouragement on shared goals, server/goal-social.ts; שבט waits for the family goal and the tree's relatives)
  { id: 'angel', name: 'מלאך דרך', how: 'נתת עצה על מטרה, והמטרה הושגה', group: 'family' },
  { id: 'adviser', name: 'יועץ', how: 'נתת עצה, ומי שקיבל אותה סימן אותה בלב', group: 'family' },
  { id: 'shoulder', name: 'כתף תומכת', how: 'נתת 5 לבבות להתקדמות של בני המשפחה', group: 'family' },
];
/** the rest badges keep their names for those who keep Shabbat; another tradition's names are to be set with someone of it */
export function badgeName(b: Badge, rest: number | null) {
  if (rest === 6 || rest === null) return b.name;
  if (b.id === 'rest_return') return 'חזרה אחרי המנוחה';
  if (b.id === 'rest_seven') return 'שבע מנוחות';
  return b.name;
}

export interface Stats {
  doneAt: number[];                 // every done step's moment
  processesDone: number;            // processes with all their steps done (and at least one)
  goalsDone: { kind: Kind; created: number; done: number }[];
  longActiveSince: number | null;   // the oldest active long goal's start
  researchesDone?: number;          // researches finished in the research assistant ("גשש")
  rest: number | null;
  today: string;
}
/** the longest run of consecutive days in a set (rest days skipped when `rest` is given) */
function longestRun(days: Set<string>, rest: number | null = null): number {
  let best = 0;
  for (const d of days) {
    // start only where the day before (past rest days) is not in the set
    let prev = addDays(d, -1);
    while (rest !== null && weekday(prev) === rest) prev = addDays(prev, -1);
    if (days.has(prev)) continue;
    let n = 0, cur = d;
    for (let k = 0; k < 4000; k++) {
      if (rest !== null && weekday(cur) === rest) { cur = addDays(cur, 1); continue; }
      if (!days.has(cur)) break;
      n++; cur = addDays(cur, 1);
    }
    best = Math.max(best, n);
  }
  return best;
}
/** every badge the stats earn (the family ones come later) */
export function earned(s: Stats): string[] {
  const out: string[] = [];
  const days = new Set(s.doneAt.map((t) => dayOf(t)));
  const run = longestRun(days, s.rest);
  if (s.doneAt.length) out.push('peg');
  if (run >= 3) out.push('ember');
  if (run >= 7) out.push('fire');
  if (run >= 30) out.push('eternal');
  if (s.rest !== null) {
    // back after the rest day: a step on the day after a rest day with no step on it
    if ([...days].some((d) => weekday(d) === (s.rest! + 1) % 7 && !days.has(addDays(d, -1)) && days.has(addDays(d, -2)))) out.push('rest_return');
    // seven rest days in a row kept, each in a week with steps
    let kept = 0, best = 0;
    const first = [...days].sort()[0];
    if (first) {
      for (let d = first; d <= s.today; d = addDays(d, 1)) {
        if (weekday(d) !== s.rest) continue;
        const worked = [1, 2, 3, 4, 5, 6].some((k) => days.has(addDays(d, -k)));
        if (!days.has(d) && worked) { kept++; best = Math.max(best, kept); } else kept = 0;
      }
    }
    if (best >= 7) out.push('rest_seven');
  }
  if (s.processesDone > 0) out.push('pole');
  if (s.goalsDone.length) out.push('standing');
  if (s.doneAt.length >= 100) out.push('journey');
  if ((s.researchesDone || 0) > 0) out.push('tracker');
  if (s.doneAt.some((t) => { const h = hourOf(t); return h >= 4 && h < 7; })) out.push('dawn');
  if (s.doneAt.some((t) => { const h = hourOf(t); return h >= 23 || h < 3; })) out.push('night');
  if (s.goalsDone.some((g) => g.done - g.created > 365 * 864e5)) out.push('traveller');
  const shorts = s.goalsDone.filter((g) => g.kind === 'short');
  if (shorts.length >= 10) out.push('gifts');
  const shortRun = longestRun(new Set(shorts.map((g) => dayOf(g.done))));
  if (shortRun >= 7) out.push('milestones');
  if (shortRun >= 30) out.push('highway');
  if (shortRun >= 365) out.push('way_of_life');
  if (shortRun >= 365 && s.longActiveSince !== null && Date.now() - s.longActiveSince > 365 * 864e5) out.push('the_way');
  const years = new Set(s.doneAt.map((t) => dayOf(t).slice(0, 4)));
  if (years.size >= 10) {
    const ys = [...years].map(Number).sort();
    if (ys[ys.length - 1] - ys[0] >= 9 && ys.every((y, i) => !i || y - ys[i - 1] === 1)) out.push('kings_way');
  }
  return out;
}
