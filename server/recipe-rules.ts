// The recipe check without AI (docs/ai/without-ai.md #4): kashrut and keto by word lists, and the ingredients with no
// amount – in the same shape as the AI's check (recipecheck.ts), so the stamps, the pencil and the substitutes work as
// they are. It knows names, not dishes: the AI (✨) reads the whole recipe. Not a hechsher either way.
// Tests: node server/test-recipe-rules.mjs

export interface Ingredient { name: string; measure?: string }
export interface KosherIssue { index: number; kind: 'forbidden' | 'shrimp' | 'meat_dairy'; reason_he: string; subs: string[] }
export interface KetoIssue { index: number; reason_he: string; subs: string[] }

const NIKUD = /[֑-ׇ]/g;
const norm = (s: string) => ` ${String(s || '').replace(NIKUD, '').replace(/[״"]/g, '"').replace(/[׳']/g, "'").toLowerCase().replace(/[^\p{L}\p{N}"']+/gu, ' ').trim()} `;
/** a word list as one pattern: a whole word, in Hebrew also with up to two prefix letters (ו, ה, ב, ל, מ, ש, כ: "והחמאה") */
const words = (list: string[]) => new RegExp(`(?:^|\\s)[והבלמשכ]{0,2}(?:${list.map((w) => w.replace(/[.*+^${}()|[\]\\]/g, '\\$&')).join('|')})(?=\\s|$)`, 'u');

/* ---- kashrut ---- */
const FORBIDDEN: [RegExp, string, string[]][] = [
  [words(['חזיר', 'בייקון', 'בקון', 'פנצ\'טה', 'פנצטה', 'גואנצ\'יאלה', 'פרושוטו', 'שומן חזיר', 'צ\'וריסו', 'צוריסו', 'נקניק חזיר', 'שינקן', 'pork', 'bacon', 'ham', 'pancetta', 'guanciale', 'prosciutto', 'lard', 'chorizo']),
    'חזיר', ['פסטרמה מעושנת', 'חזה אווז מעושן', 'נקניק בקר']],
  [words(['סרטן', 'סרטנים', 'לובסטר', 'מולים', 'צדפות', 'צדפה', 'צדפים', 'קלמרי', 'קלמארי', 'דיונון', 'תמנון', 'סקאלופ', 'סקלופ', 'crab', 'lobster', 'mussels?', 'clams?', 'oysters?', 'scallops?', 'squid', 'calamari', 'octopus']),
    'פירות ים', ['דג לבן בקוביות', 'סלמון', 'חזה עוף בקוביות']],
  [words(['ארנב', 'שפמנון', 'צלופח', 'כריש', 'rabbit', 'catfish', 'eel', 'shark']), 'לא כשר', ['עוף', 'דג לבן']],
];
const SHRIMP = words(['שרימפס', 'שרימפ', 'חסילונים', 'חסילון', 'shrimps?', 'prawns?']);
const MEAT = words(['בשר', 'בשר טחון', 'בקר', 'עוף', 'עופות', 'פרגית', 'פרגיות', 'הודו', 'כבש', 'טלה', 'עגל', 'אנטריקוט', 'סינטה', 'פילה בקר', 'צלעות', 'אסאדו', 'שניצל', 'שניצלים', 'קציצות', 'נקניק', 'נקניקיות', 'נקניקייה',
  'פסטרמה', 'קבב', 'המבורגר', 'כבד', 'כבדי עוף', 'שוקיים', 'כרעיים', 'כנפיים', 'אווז', 'ברווז', 'צלי', 'חזה עוף', 'פרגיות', 'beef', 'hamburgers?', 'burgers?', 'chicken', 'turkey', 'lamb', 'veal', 'sausages?', 'steak', 'mince', 'meatballs?', 'duck']);
const DAIRY: [RegExp, string[]][] = [
  [words(['חמאה', 'butter']), ['שמן זית', 'מרגרינה פרווה', 'שמן קוקוס']],
  [words(['שמנת', 'שמנת מתוקה', 'שמנת חמוצה', 'שמנת לבישול', 'קרם פרש', 'cream', 'sour cream', 'creme fraiche']), ['שמנת צמחית פרווה', 'קרם קוקוס', 'חלב קוקוס']],
  [words(['חלב', 'milk']), ['חלב סויה', 'חלב שקדים', 'חלב שיבולת שועל']],
  [words(['גבינה', 'גבינת', 'גבינות', 'פרמזן', 'מוצרלה', 'צ\'דר', 'צדר', 'ריקוטה', 'מסקרפונה', 'פטה', 'בולגרית', 'קוטג\'', 'קוטג', 'גאודה', 'עמק', 'cheese', 'parmesan', 'mozzarella', 'cheddar', 'ricotta', 'mascarpone', 'feta']),
    ['גבינה טבעונית', 'שמרי בירה', 'טחינה']],
  [words(['יוגורט', 'לבנה', 'yogurt', 'yoghurt']), ['יוגורט סויה', 'יוגורט קוקוס', 'טחינה']],
];
// names that look like dairy but are not (or are kept apart on purpose)
const NOT_DAIRY = words(['חלב קוקוס', 'חלב שקדים', 'חלב סויה', 'חלב שיבולת שועל', 'חלב אורז', 'חלב צמחי', 'חמאת בוטנים', 'חמאת שקדים', 'חמאת קקאו', 'חמאת שומשום',
  'שמנת צמחית', 'שמנת קוקוס', 'קרם קוקוס', 'גבינה טבעונית', 'גבינה צמחית', 'יוגורט סויה', 'יוגורט קוקוס', 'פרווה', 'coconut milk', 'almond milk', 'soy milk', 'oat milk', 'peanut butter', 'coconut cream', 'vegan']);

/* ---- keto ---- */
const KETO: [RegExp, string, string[]][] = [
  [words(['סוכר', 'סוכר חום', 'אבקת סוכר', 'sugar']), 'סוכר', ['אריתריטול', 'סטיביה', 'מונק פרוט']],
  [words(['דבש', 'סילאן', 'סירופ', 'סירופ מייפל', 'מייפל', 'ריבה', 'honey', 'syrup', 'maple', 'jam']), 'מתוק ועשיר בפחמימות', ['סירופ ללא סוכר', 'אריתריטול']],
  [words(['קמח', 'קמח לבן', 'קמח מלא', 'קמח תופח', 'flour']), 'קמח', ['קמח שקדים', 'קמח קוקוס']],
  [words(['לחם', 'פירורי לחם', 'פנקו', 'פיתה', 'פיתות', 'לחמניה', 'לחמניות', 'בגט', 'bread', 'breadcrumbs', 'panko', 'pita']), 'לחם', ['קמח שקדים', 'זרעי פשתן טחונים', 'שקדים טחונים']],
  [words(['פסטה', 'ספגטי', 'אטריות', 'מקרוני', 'פנה', 'פטוצ\'יני', 'לזניה', 'פתיתים', 'קוסקוס', 'pasta', 'spaghetti', 'noodles', 'macaroni', 'penne', 'fettuccine', 'lasagna', 'couscous']), 'פסטה', ['אטריות קישוא', 'אטריות שיראטאקי', 'ספגטי דלעת']],
  [words(['אורז', 'אורז בסמטי', 'rice']), 'אורז', ['אורז כרובית', 'שיראטאקי']],
  [words(['תפוחי אדמה', 'תפוח אדמה', 'תפו"א', 'פירה', 'בטטה', 'בטטות', 'potato', 'potatoes', 'sweet potato']), 'תפוחי אדמה', ['כרובית', 'סלק לבן', 'קולרבי']],
  [words(['תירס', 'קורנפלקס', 'שיבולת שועל', 'קוואקר', 'corn', 'oats', 'cornflakes']), 'דגנים', ['זרעי צ\'יה', 'קוקוס טחון']],
  [words(['שעועית', 'עדשים', 'גרגירי חומוס', 'אפונה', 'beans', 'lentils', 'chickpeas', 'peas']), 'קטניות', ['פטריות', 'חצילים', 'שעועית ירוקה']],
  [words(['בננה', 'בננות', 'תמרים', 'תמר', 'צימוקים', 'ענבים', 'מנגו', 'אננס', 'banana', 'dates', 'raisins', 'grapes', 'mango', 'pineapple']), 'פרי מתוק', ['פטל', 'אוכמניות', 'תותים']],
  [words(['קטשופ', 'רוטב ברביקיו', 'רוטב צ\'ילי מתוק', 'ketchup', 'bbq sauce']), 'רוטב מתוק', ['רסק עגבניות', 'רוטב ללא סוכר']],
];
const NOT_KETO = words(['קמח שקדים', 'קמח קוקוס', 'אטריות קישוא', 'אטריות שיראטאקי', 'ספגטי דלעת', 'אורז כרובית', 'ללא סוכר', 'בלי סוכר', 'תחליף סוכר', 'שעועית ירוקה', 'almond flour', 'coconut flour', 'sugar free', 'cauliflower rice', 'green beans', 'zucchini noodles']);

// no amount needed for these
const NO_AMOUNT = words(['מלח', 'פלפל', 'פלפל שחור', 'לפי הטעם', 'קורט', 'לקישוט', 'להגשה', 'לטיגון', 'שמן לטיגון', 'מים', 'salt', 'pepper', 'to taste']);

/** kashrut, keto and the ingredients with no amount, by the names alone */
export function checkByRules(ingredients: Ingredient[]) {
  const n = ingredients.map((i) => norm(i.name));
  const kosher: KosherIssue[] = [];
  n.forEach((name, index) => {
    if (!name.trim()) return;
    const f = FORBIDDEN.find(([re]) => re.test(name));
    if (f) kosher.push({ index, kind: 'forbidden', reason_he: f[1], subs: f[2] });
    else if (SHRIMP.test(name)) kosher.push({ index, kind: 'shrimp', reason_he: 'שרימפס', subs: ['דג לבן בקוביות', 'חזה עוף בקוביות', 'פטריות'] });
  });
  // meat and dairy together: the dairy ones are marked (they are the easiest to replace)
  if (n.some((name) => MEAT.test(name) && !FORBIDDEN.some(([re]) => re.test(name)))) {
    n.forEach((name, index) => {
      if (!name.trim() || NOT_DAIRY.test(name) || kosher.some((k) => k.index === index)) return;
      const d = DAIRY.find(([re]) => re.test(name));
      if (d) kosher.push({ index, kind: 'meat_dairy', reason_he: 'בשר וחלב יחד', subs: d[1] });
    });
  }
  const keto: KetoIssue[] = [];
  n.forEach((name, index) => {
    if (!name.trim() || NOT_KETO.test(name)) return;
    const k = KETO.find(([re]) => re.test(name));
    if (k) keto.push({ index, reason_he: k[1] === 'סוכר' || k[1] === 'קמח' || k[1] === 'לחם' || k[1] === 'פסטה' || k[1] === 'אורז' || k[1] === 'תפוחי אדמה' ? 'עשיר בפחמימות' : k[1], subs: k[2] });
  });
  const missing = ingredients.map((i, index) => ({ i, index })).filter(({ i }) => i.name?.trim() && !String(i.measure || '').trim() && !NO_AMOUNT.test(norm(i.name))).map(({ index }) => index);
  return { kosher: kosher.sort((a, b) => a.index - b.index), keto, missing };
}
