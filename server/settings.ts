// The app's settings, changed from the owner's room (/admin/) without a deploy. Each one is declared here with its kind,
// its default and a Hebrew explanation; the value lives in app_settings. Any module reads one with setting(env, key)
// (kept for half a minute in the isolate, so a change shows within that). Rules: admin-rules.ts (settingValue).

import { Env } from './core';
import { Setting, settingValue } from './admin-rules';

export const SETTINGS: Setting[] = [
  { key: 'gather.enabled', group: 'מפגש משפחתי', label: 'אפשר ליצור מפגשים', help: 'כשכבוי, אי אפשר לפתוח מפגש חדש (מפגשים קיימים ממשיכים).', type: 'bool', def: true },
  { key: 'gather.guest_signup', group: 'מפגש משפחתי', label: 'הצטרפות מהזמנה', help: 'אורח שנכנס עם Google מהזמנה למפגש מקבל משק בית משלו ומתנת פתיחה של AI. כשכבוי, רק מי שהוזמן לאוהל נכנס.', type: 'bool', def: true },
  { key: 'gather.link_days', group: 'מפגש משפחתי', label: 'ימי ההזמנה אחרי המפגש', help: 'כמה ימים אחרי המפגש קישור ההזמנה עוד נפתח (לתמונות ולתודות).', type: 'number', def: 1, min: 0, max: 30 },
  { key: 'calendar.feed', group: 'לוח שנה', label: 'קישור ליומן Google פעיל', help: 'כשכבוי, היומנים שנרשמו מפסיקים לקבל עדכונים (הקישורים נשמרים).', type: 'bool', def: true },
  { key: 'ai.monthly_budget_usd', group: 'בינה מלאכותית', label: 'תקציב חודשי ל־AI (דולר)', help: 'מעבר לסכום הזה הלוח מציג אזהרה. 0: בלי תקציב. (עצירה של הקריאות עצמן: הצעה לסשן הראשי.)', type: 'number', def: 0, min: 0, max: 10000 },
  { key: 'credits.trial_ils', group: 'בינה מלאכותית', label: 'מתנת פתיחה לחשבון חדש (₪)', help: 'כמה AI מקבל חשבון חדש שהגיע מהזמנה, בשקלים של עלות אמיתית. בני המשפחה בלי הגבלה.', type: 'number', def: 1.5, min: 0, max: 50 },
  { key: 'design.images_per_day', group: 'בינה מלאכותית', label: 'תמונות לעיצוב ביום', help: 'כמה תמונות כלי העיצוב (Gemini) מכין ביום לכל היותר, כדי שלולאה לא תריץ חשבון.', type: 'number', def: 40, min: 0, max: 400 },
  { key: "figures.price_ils", group: "כסף", label: "מחיר דמות בתשלום (₪)", help: "כמה עולה דמות לוויה בתשלום למי שמשתמש בקרדיטים. המשפחה מקבלת אותה בחינם.", type: "number", def: 10, min: 0, max: 200 },
  { key: "figures.special_price_ils", group: "כסף", label: "מחיר דמות מיוחדת (₪)", help: "הקוסם, האסטרונומית ובובת הטלאים: כל אחת עם תנועה משלה, ולכן יקרה יותר. המשפחה מקבלת אותן בחינם.", type: "number", def: 20, min: 0, max: 400 },
  { key: 'research.contact_email', group: 'עוזר מחקר', label: 'כתובת קשר למקורות הפתוחים', help: 'OpenAlex, Crossref ו־Unpaywall מבקשים כתובת מייל של מי שפונה אליהם (ואז עונים מהר ויציב יותר). לא הכתובת הפרטית שלך: כתובת של האוהל. ריק: פונים בלי כתובת.', type: 'text', def: '' },
  { key: 'money.usd_ils', group: 'כסף', label: 'שער הדולר (₪)', help: 'לחישוב ההוצאות בדולרים בשקלים. שער משוער – עדכנו מדי פעם.', type: 'number', def: 3.7, min: 1, max: 10 },
];
const byKey = new Map(SETTINGS.map((s) => [s.key, s]));

let cache: { at: number; values: Map<string, unknown> } | null = null;
async function all(env: Env): Promise<Map<string, unknown>> {
  if (cache && Date.now() - cache.at < 30e3) return cache.values;
  const { results } = await env.DB.prepare('SELECT key, value FROM app_settings').all<{ key: string; value: string }>();
  const values = new Map<string, unknown>();
  for (const r of results) { try { values.set(r.key, JSON.parse(r.value)); } catch { /* a broken row: the default */ } }
  cache = { at: Date.now(), values };
  return values;
}
/** a setting's value (its default when unset, or when what is stored no longer fits its kind) */
export async function setting<T extends boolean | number | string>(env: Env, key: string): Promise<T> {
  const s = byKey.get(key);
  if (!s) throw new Error('unknown setting ' + key);
  const v = (await all(env).catch(() => new Map())).get(key);
  const ok = v === undefined ? null : settingValue(s, v);
  return (ok === null ? s.def : ok) as T;
}
export async function settingsNow(env: Env) {
  const values = await all(env);
  return SETTINGS.map((s) => { const v = values.get(s.key); const ok = v === undefined ? null : settingValue(s, v); return { ...s, value: ok === null ? s.def : ok, changed: ok !== null }; });
}
export async function saveSetting(env: Env, key: string, value: unknown, by: string) {
  const s = byKey.get(key);
  if (!s) return 'unknown_setting';
  const v = settingValue(s, value);
  if (v === null) return 'bad_value';
  await env.DB.prepare('INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at')
    .bind(key, JSON.stringify(v), by, Date.now()).run();
  cache = null;
  return null;
}
