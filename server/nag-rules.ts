// "רמת הניג'וס" (vision batch 31, docs/design/nag-level.md): the notification level of a tool, and of one item inside it.
// Pure rules, no network; tested in test-nag.mjs. The levels are stored per person in the prefs namespace "nag":
//   { lv: { goals: 'normal' }, it: { 'goals:abc123': 'nag' } }     (an item beats its tool, a tool beats the default)

export type Level = 'off' | 'quiet' | 'normal' | 'nag';
export const LEVELS: Level[] = ['off', 'quiet', 'normal', 'nag'];

export interface NagTool { id: string; label: string; note: string; def: Level }
/** every tool that sends phone notifications. The first five stay "רגיל" (the owner's list); the rest start at "שקט". Emergency is not here: it is fixed. */
export const TOOLS: NagTool[] = [
  { id: 'family', label: 'הודעות מהמשפחה', note: 'הודעה אישית', def: 'normal' },
  { id: 'gather', label: 'מפגשים', note: 'מפגש שהוזמנת אליו', def: 'normal' },
  { id: 'familyday', label: 'ימי הולדת ואזכרות', note: 'היום המיוחד של מישהו במשפחה', def: 'normal' },
  { id: 'home', label: 'הבית', note: 'תזכורת שקבעת לטיפול בבית', def: 'normal' },
  { id: 'kitchen', label: 'טיימרים במטבח', note: 'טיימר שהפעלת מצלצל גם בשעות השקט', def: 'normal' },
  { id: 'garden', label: 'הגינה', note: 'צמח שצריך מים', def: 'quiet' },
  { id: 'goals', label: 'מטרות', note: 'תזכורת לצעד הבא', def: 'quiet' },
  { id: 'coach', label: 'המאמן בהקפדה', note: 'אימון ותזכורת', def: 'quiet' },
];
export const toolDef = (tool: string): Level => TOOLS.find((t) => t.id === tool)?.def || 'quiet';

const isLevel = (v: unknown): v is Level => typeof v === 'string' && (LEVELS as string[]).includes(v);
export interface NagPrefs { lv?: Record<string, unknown>; it?: Record<string, unknown> }

/** the level for one notification: the item's own, else the tool's, else the tool's default */
export function levelFor(p: NagPrefs | undefined, tool: string, item?: string): Level {
  const own = item ? p?.it?.[tool + ':' + item] : undefined;
  if (isLevel(own)) return own;
  const t = p?.lv?.[tool];
  return isLevel(t) ? t : toolDef(tool);
}

/** what the gate does with it, before quiet hours and Shabbat (push-gate.ts decides those):
 *  off: nothing at all; quiet: only the daily summary; normal and nag: a notification at the right time. */
export function route(level: Level): 'drop' | 'summary' | 'now' {
  return level === 'off' ? 'drop' : level === 'quiet' ? 'summary' : 'now';
}

// the nag: a repeat until the person marks it handled
export const REPEAT_EVERY_MS = 20 * 60_000;
export const MAX_REPEATS = 5;                 // then it stops by itself: a nag that never ends is a bug
/** when the next repeat is due, or null when the nag is over */
export function nextRepeat(sent: number, now: number): number | null {
  return sent >= MAX_REPEATS ? null : now + REPEAT_EVERY_MS;
}

/** a clean picker payload: only known tools and levels, an item key as "tool:id", at most 200 items */
export function cleanNag(raw: unknown): { lv: Record<string, Level>; it: Record<string, Level> } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as NagPrefs;
  const lv: Record<string, Level> = {}, it: Record<string, Level> = {};
  for (const t of TOOLS) { const v = r.lv?.[t.id]; if (isLevel(v)) lv[t.id] = v; }
  let n = 0;
  for (const [k, v] of Object.entries(r.it || {})) {
    const m = /^([a-z]+):([A-Za-z0-9_-]{1,40})$/.exec(k);
    if (m && TOOLS.some((t) => t.id === m[1]) && isLevel(v) && n++ < 200) it[k] = v;
  }
  return { lv, it };
}
