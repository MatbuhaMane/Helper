// "יד ביד": the first catalog, the two lists the owner approved (2026-11-15): 26 services between members, 23 deeds for the community.
// Scores: difficulty 0..2 + expertise 0..2 decide the level (yad-rules.ts). declaration: 'license' for the nine types that ask for a professional licence,
// 'driving' for the two rides ("יש לי רישיון נהיגה בתוקף, והרכב מבוטח"); it is only ever shown as "לפי הצהרת המשתמש", never as verified.
// note: the one-sentence limit of the type (23 of 49 have one; the wording is the owner's, with the corrections of legal, batches 43-44).

import type { Env } from './core';

export type Declaration = 'none' | 'license' | 'driving';
export interface SeedType { id: string; kind: 'service' | 'deed'; name: string; d: 0 | 1 | 2; e: 0 | 1 | 2; decl?: Declaration; note?: string }

const S = (id: string, name: string, d: 0 | 1 | 2, e: 0 | 1 | 2, decl?: Declaration, note?: string): SeedType => ({ id, kind: 'service', name, d, e, decl, note });
const D = (id: string, name: string, d: 0 | 1 | 2, e: 0 | 1 | 2, decl?: Declaration, note?: string): SeedType => ({ id, kind: 'deed', name, d, e, decl, note });

const ELDER = 'לא נוגעים בכסף, בסיסמאות או בחשבון הבנק.';
const AREA = 'רק בתיאום עם מי שאחראי על השטח.';

export const SEED: SeedType[] = [
  // list 1: services between members
  S('s-babysit', 'בייביסיטר', 0, 0), S('s-dog', 'טיול עם כלב / האכלת חיות', 0, 0), S('s-plants', 'השקיית עציצים בהיעדרות', 0, 0),
  S('s-shop', 'קניות פשוטות / איסוף חבילה', 0, 0), S('s-doctor-escort', 'ליווי לתור אצל רופא', 0, 0),
  S('s-ride', 'הסעה', 1, 0, 'driving'), S('s-cook', 'בישול ארוחה', 1, 0), S('s-clean', 'ניקיון בית', 1, 0),
  S('s-garden', 'גינון בסיסי', 1, 0, 'none', 'בלי ריסוס בחומרי הדברה.'), S('s-homework', 'עזרה בשיעורי בית ליסודי', 0, 1),
  S('s-phone', 'עזרה בסיסית בטלפון או במחשב', 0, 1, 'none', 'נכנסים לחשבון רק יחד עם האדם ובאישורו, ולא שומרים סיסמאות.'), S('s-sew', 'תיקוני תפירה', 0, 1),
  S('s-move', 'הובלת רהיטים', 2, 0, 'none', 'בלי משאית כבדה, אלא אם יש רישיון מתאים.'), S('s-assemble', 'הרכבת רהיטים', 1, 1), S('s-paint', 'צביעת חדר', 2, 1),
  S('s-tutor', 'שיעור פרטי לבגרות', 1, 1), S('s-pc', 'תיקון מחשב או התקנה', 1, 1, 'none', 'המידע במחשב נשאר פרטי: לא מעתיקים ממנו ולא שומרים ממנו דבר.'),
  S('s-plumb', 'תיקון ברז / אינסטלציה פשוטה', 1, 1, 'none', 'בלי עבודה על גז או על חשמל.'),
  S('s-photo', 'צילום אירוע', 1, 1, 'none', 'התמונות שייכות למי שביקש את הצילום, ולא מפרסמים אותן בלי הסכמתו.'),
  S('s-cv', 'תרגום או עריכת קורות חיים', 1, 1, 'none', 'לא תרגום נוטריוני.'), S('s-dr-letter', 'מכתב המלצה של רופא', 0, 2, 'license'),
  S('s-electric', 'עבודת חשמל מורכבת של חשמלאי מוסמך', 2, 2, 'license'), S('s-lawyer', 'ייעוץ משפטי של עורך דין', 2, 2, 'license'),
  S('s-accountant', 'דוח שנתי של רואה חשבון', 2, 2, 'license'), S('s-medical', 'טיפול רפואי או פיזיותרפיה', 2, 2, 'license'),
  S('s-engineer', 'תכנון של מהנדס או אדריכל', 2, 2, 'license'),
  // list 2: deeds for the community and the environment
  D('d-litter', 'איסוף פסולת בחוף, בפארק או ביער', 0, 0), D('d-sort', 'מיון תרומות', 0, 0), D('d-water', 'השקיית גינה קהילתית', 0, 0, 'none', AREA),
  D('d-elder-visit', 'ביקור אצל קשיש בודד', 0, 0, 'none', ELDER), D('d-library', 'קריאה לילדים בספרייה', 0, 0, 'none', 'רק בתיאום עם הספרייה, ולפי הכללים שלה.'),
  D('d-recycle', 'איסוף מיחזור בשכונה', 0, 0), D('d-food-hand', 'חלוקת מזון', 0, 0, 'none', 'רק דרך ארגון שמחלק מזון.'),
  D('d-cook', 'בישול למשפחות נזקקות', 1, 0, 'none', 'רק דרך ארגון שמחלק מזון, ומציינים אלרגנים.'), D('d-plant', 'נטיעת עצים', 1, 0, 'none', AREA),
  D('d-garden-keep', 'תחזוקת גינה קהילתית', 1, 0, 'none', AREA), D('d-elder-ride', 'הסעת קשישים לטיפולים', 1, 0, 'driving', ELDER),
  D('d-elder-phone', 'ללמד קשישים להשתמש בטלפון', 0, 1, 'none', 'לא נוגעים בכסף ובחשבון הבנק, ולא שומרים סיסמאות.'),
  D('d-stream', 'ניקוי נחל או שיקום שביל', 2, 0, 'none', AREA), D('d-farm', 'עזרה לחקלאים בשעת חירום', 2, 0, 'none', 'בלי נהיגה בטרקטור או ברכב חקלאי, אלא אם יש רישיון מתאים.'),
  D('d-garden-new', 'הקמת גינה קהילתית', 2, 1, 'none', AREA), D('d-volday', 'ארגון והובלה של יום התנדבות', 1, 1, 'none', 'המארגן אחראי לאישורים ולתיאום עם בעל המקום.'),
  D('d-mentor', 'חונכות לנוער', 1, 1, 'none', 'בשלב הזה רק במשפחה ובין חברים.'), D('d-nature', 'סקר טבע, למשל ספירת ציפורים', 1, 1, 'none', 'בשמורת טבע, לפי הכללים של רשות הטבע והגנים.'),
  D('d-repair', 'תיקון מכשירים ב"תקן אל תזרוק"', 1, 1, 'none', 'רק מכשירים: בלי עבודה על לוח החשמל או על החיווט בבית.'),
  D('d-pro-build', 'עבודה מקצועית בהתנדבות במבנה ציבורי (חשמלאי או מהנדס)', 2, 2, 'license'), D('d-eco', 'ייעוץ אקולוגי מקצועי לתוכנית ציבורית', 2, 2),
  D('d-medical', 'רפואה בהתנדבות', 2, 2, 'license'), D('d-legal', 'ייעוץ משפטי לעמותה', 2, 2, 'license'),
];

/** put the catalog in on first use; a type the owner changed or switched off later is never overwritten (INSERT OR IGNORE by id) */
export async function ensureCatalog(db: Env['DB']): Promise<void> {
  const n = await db.prepare('SELECT COUNT(*) AS n FROM yad_types').first<{ n: number }>();
  if ((n?.n || 0) >= SEED.length) return;
  await db.batch(SEED.map((t, i) => db.prepare('INSERT OR IGNORE INTO yad_types (id, kind, name, difficulty, expertise, declaration, note, sort, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
    .bind(t.id, t.kind, t.name, t.d, t.e, t.decl || 'none', t.note || '', i)));
}
