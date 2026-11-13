// Discovery (docs/ai/social-plan.md, slice A; docs/vision/first-minute.md): which of הָאֹהֶל's tools a person has found.
// "גילית 6 מתוך 18 כלים", and the "סייר" badge. The same visits feed the owner's usage dashboard (which tools, never what is
// in them). Pure: server/discover.ts keeps the visits. Tests: server/test-discover.mjs.

export interface Tool { id: string; name: string; href: string }
/** the tools, each by the start of its address (the folders – /tools/, /food/ – are ways in, not tools) */
export const TOOLS: Tool[] = [
  { id: 'family', name: 'עץ המשפחה', href: '/family/' },
  { id: 'gather', name: 'מפגש משפחתי', href: '/gather/' },
  { id: 'groceries', name: 'רשימת קניות ומתכונים', href: '/groceries/' },
  { id: 'fridge', name: 'המקרר', href: '/food/fridge/' },
  { id: 'diet', name: 'תזונה', href: '/food/diet/' },
  { id: 'restaurants', name: 'מסעדות', href: '/food/restaurants/' },
  { id: 'goals', name: 'מטרות', href: '/tools/tasks/' },
  { id: 'research', name: 'עוזר המחקר', href: '/tools/research/' },
  { id: 'notes', name: 'פתקים', href: '/tools/notes/' },
  { id: 'calendar', name: 'לוח שנה', href: '/tools/calendar/' },
  { id: 'calc', name: 'מחשבון', href: '/tools/calc/' },
  { id: 'weather', name: 'מזג אוויר', href: '/tools/weather/' },
  { id: 'news', name: 'חדשות', href: '/news/' },
  { id: 'fun', name: 'בידור', href: '/fun/' },
  { id: 'songs', name: 'שירון', href: '/songs/' },
  { id: 'parasha', name: 'פרשת השבוע', href: '/parasha/' },
  { id: 'mail', name: 'סידור המייל', href: '/mail/' },
  { id: 'pc', name: 'מדריך למחשב', href: '/pc/' },
  { id: 'settings', name: 'הגדרות', href: '/settings/' },
];
const BY_LENGTH = [...TOOLS].sort((a, b) => b.href.length - a.href.length);

/** the tool an address belongs to (the longest matching start), or null (the home page, a folder, anything else) */
export function toolOf(path: string): string | null {
  const p = String(path || '').split(/[?#]/)[0].replace(/\/?$/, '/');
  return BY_LENGTH.find((t) => p.startsWith(t.href))?.id || null;
}

/** "סייר": found this many of the tools */
export const SCOUT_AT = 10;

/** what the home page shows: every tool, found or not, and how many */
export function progress(found: Iterable<string>) {
  const have = new Set(found);
  const tools = TOOLS.map((t) => ({ ...t, found: have.has(t.id) }));
  const n = tools.filter((t) => t.found).length;
  return { found: n, total: TOOLS.length, scout: n >= SCOUT_AT, tools };
}
