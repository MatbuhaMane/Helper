// The switchboard's rules (pure: tested by server/test-switches.mjs). The switches are app-wide, set by the owner in the
// back door (/admin/) and read by every member through /api/me. Each one is declared here with its category, its kind
// and its default; the values live in app_switches (server/switches.ts). The page applies them in common.js and apps.js
// (master files) and draws the moods in /assets/switches.js.
//
// exp (three states): 'hide' hides what is experimental (an app tagged ניסיוני or beta, the "בעתיד" and "בקרוב" items);
// 'only' shows only the experimental apps (and the fixed items: the tree, the tools, the settings); 'all' shows everything.
// mood: 'normal' | 'party' (confetti and balloons on opening) | 'mourning' (candles and a faded palette).
// kodesh: the Shabbat mode; kodesh_auto turns it on by itself from candle lighting to havdalah (Shabbat and Yom Tov).

export type Kind = 'bool' | 'choice';
export interface Switch {
  key: string; cat: string; label: string; help: string; kind: Kind; def: boolean | string;
  options?: [string, string][];
}

/** the categories, in the board's order (design's data-cat) */
export const CATS: [string, string][] = [
  ['view', 'תצוגה ואווירה'], ['kodesh', 'קודש וחול'], ['ai', 'העוזר החכם'], ['notify', 'התראות והודעות'], ['tools', 'כלים'], ['family', 'משפחה'], ['money', 'כסף'],
];

export const SWITCHES: Switch[] = [
  { key: 'exp', cat: 'view', label: 'תוכן ניסיוני', kind: 'choice', def: 'all',
    options: [['hide', 'הסתר ניסיוני'], ['only', 'רק ניסיוני'], ['all', 'הכל']],
    help: 'הסתר: בלי כלים ניסיוניים ובלי מה שעוד "בעתיד" או "בקרוב". רק ניסיוני: רק הכלים הניסיוניים (והעץ, הכלים וההגדרות). הכל: הכול מוצג.' },
  { key: 'mood', cat: 'view', label: 'אווירה', kind: 'choice', def: 'normal',
    options: [['normal', 'רגיל'], ['party', 'חגיגה'], ['mourning', 'אבל']],
    help: 'חגיגה: קונפטי ובלונים כשנכנסים לאוהל. אבל: נרות ופלטת צבעים דהויה.' },
  { key: 'eggs', cat: 'view', label: 'הפתעות בדפים', kind: 'bool', def: true, help: 'ההפתעות הקטנות שהוסתרו בדפים (מעץ המבנה).' },
  { key: 'kodesh', cat: 'kodesh', label: 'קודש', kind: 'bool', def: false,
    help: 'בלי התראות לטלפון (חוץ מחירום), הכלים של יום חול מקופלים (קניות, מייל, פרנסה, המחשב), העוזר שקט, ומראה של שבת.' },
  { key: 'kodesh_auto', cat: 'kodesh', label: 'אוטומטי לפי זמני שבת וחג', kind: 'bool', def: false,
    help: 'קודש נדלק לבד מהדלקת הנרות ועד ההבדלה (לפי ירושלים), בשבת ובחג.' },
  { key: 'daemon', cat: 'ai', label: 'העוזר על המסך', kind: 'bool', def: true, help: 'כבוי: העוזר לא מופיע, לא באוהל ולא כשמבקשים שילווה בדפים.' },
  { key: 'push', cat: 'notify', label: 'התראות לטלפון', kind: 'bool', def: true, help: 'כבוי: לא נשלחת אף התראה (חוץ מחירום ובדיקה). מה שהיה נשלח נאסף לסיכום.' },
  { key: 'messages', cat: 'notify', label: 'הודעות ממך לכולם', kind: 'bool', def: true, help: 'הפס שמציג את ההודעות ששלחת מהדלת האחורית.' },
  { key: 'dm', cat: 'notify', label: 'הודעות בין בני הבית', kind: 'bool', def: true, help: 'הנקודה והכניסה בתפריט. הדף עצמו נשאר.' },
  { key: 'reports', cat: 'notify', label: 'דיווח על תקלה', kind: 'bool', def: true, help: 'ניעור הטלפון, "דווח על בעיה" בתפריט ונקודת התשובה.' },
  { key: 'music', cat: 'tools', label: 'נגן המוזיקה', kind: 'bool', def: true, help: 'הנגן שבתפריט של כל מסך.' },
  { key: 'yad', cat: 'tools', label: 'יד ביד (ממתין לאישורים)', kind: 'bool', def: false,
    help: 'בנוי במלואו וננעל עד שמגיעות האישורים. כבוי: כל הנתיבים של יד ביד עונים 404 לכולם חוץ מהבעלים, והאפליקציה מסתירה את הכרטיס, הקישורים, מספר האישורים וההתראות. הבעלים לבדו יכול לנסות.' },
  { key: 'capture', cat: 'tools', label: 'שמירת טקסט מסומן', kind: 'bool', def: true, help: 'מסמנים טקסט בכל מקום ושומרים אותו כפתק.' },
];
const byKey = new Map(SWITCHES.map((s) => [s.key, s]));

/** the app's bool settings (server/settings.ts) that the board shows too, in its categories */
export const SETTING_CATS: Record<string, string> = {
  'gather.enabled': 'family', 'gather.guest_signup': 'family', 'calendar.feed': 'tools', 'money.shop_open': 'money',
};

/** a value that fits the switch, or null */
export function switchValue(key: string, v: unknown): boolean | string | null {
  const s = byKey.get(key);
  if (!s) return null;
  if (s.kind === 'bool') return typeof v === 'boolean' ? v : null;
  return typeof v === 'string' && s.options!.some(([o]) => o === v) ? v : null;
}

export type State = Record<string, boolean | string>;
/** every switch's value: what is stored when it still fits, else the default */
export function stateOf(stored: Record<string, unknown>): State {
  const out: State = {};
  for (const s of SWITCHES) { const v = s.key in stored ? switchValue(s.key, stored[s.key]) : null; out[s.key] = v === null ? s.def : v; }
  return out;
}
/** what members get: the state, with kodesh on when the owner set it or when auto and inside a Shabbat/Yom Tov window */
export function publicState(state: State, inWindow: boolean): State {
  return { ...state, kodesh: state.kodesh === true || (state.kodesh_auto === true && inWindow) };
}

/** who may change a switch: the owner only (a super sees the board but cannot change it) */
export const mayChange = (a: { own: boolean; level: string }) => a.own && a.level === 'owner';

/* ---- what the page shows (apps.js keeps the same rules; the test checks they agree) ---- */
/** the weekday tools, tucked away in קודש */
export const WEEKDAY = ['/groceries/', '/mail/', '/tools/parnasa/', '/pc/'];
export interface AppLike { href: string; fixed?: boolean; tag?: string; access?: string }
export const isExp = (a: AppLike) => !!a.tag || a.access === 'beta';
/** is this app shown under these switches? */
export function shows(a: AppLike, sw: { exp?: unknown; kodesh?: unknown }): boolean {
  if (a.fixed) return true;
  if (sw.kodesh === true && WEEKDAY.includes(a.href)) return false;
  if (sw.exp === 'hide') return !isExp(a);
  if (sw.exp === 'only') return isExp(a);
  return true;
}
/** are the "בעתיד" / "בקרוב" items shown? (they are what is not yet reachable: hidden by 'hide' only) */
export const showsFuture = (sw: { exp?: unknown }) => sw.exp !== 'hide';
