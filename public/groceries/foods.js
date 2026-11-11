/* ערכי תזונה ל-100 גרם של מזונות נפוצים (שומן, חלבון, פחמימות כולל סיבים, סיבים), לפי טבלאות מקובלות (USDA / תוויות בארץ).
 * מזון שלא נמצא כאן מוערך פעם אחת על ידי העוזר החכם ונשמר בשרת. משפחה יכולה לתקן ערכים לפי התווית.
 * u = משקל יחידה אחת בגרם (ביצה, עגבנייה), כשיש לה יחידה. */
const KETO_FOODS = [
  // מוצרי חלב וביצים
  { n: 'ביצה', a: ['ביצים', 'ביצה L', 'ביצים L'], f: 9.5, p: 12.6, c: 0.7, fb: 0, u: 55 },
  { n: 'חמאה', f: 81, p: 0.9, c: 0.1, fb: 0 },
  { n: 'שמנת מתוקה', a: ['שמנת מתוקה 38%', 'שמנת להקצפה'], f: 38, p: 2.1, c: 3.2, fb: 0 },
  { n: 'שמנת חמוצה', a: ['שמנת חמוצה 15%'], f: 15, p: 3, c: 4, fb: 0 },
  { n: 'שמנת לבישול', a: ['שמנת לבישול 15%'], f: 15, p: 2.8, c: 4, fb: 0 },
  { n: 'גבינת שמנת', a: ['גבינת שמנת 30%', 'קרם צ\'יז', 'cream cheese'], f: 30, p: 6, c: 4, fb: 0 },
  { n: 'גבינה צהובה', a: ['גבינה צהובה 28%', 'גבינת עמק', 'גבינת גאודה', 'גאודה', 'צ\'דר'], f: 28, p: 25, c: 1, fb: 0, u: 20 },
  { n: 'פרמזן', a: ['גבינת פרמזן', 'parmesan'], f: 28, p: 36, c: 3.2, fb: 0 },
  { n: 'מוצרלה', a: ['גבינת מוצרלה', 'mozzarella'], f: 22, p: 22, c: 2.2, fb: 0 },
  { n: 'גבינה בולגרית', a: ['בולגרית', 'גבינה בולגרית 5%'], f: 5, p: 15, c: 1.5, fb: 0 },
  { n: 'פטה', a: ['גבינת פטה', 'feta'], f: 21, p: 14, c: 4, fb: 0 },
  { n: 'קוטג\'', a: ['קוטג', 'גבינת קוטג\'', 'קוטג\' 5%'], f: 5, p: 11, c: 1.5, fb: 0 },
  { n: 'גבינה לבנה', a: ['גבינה לבנה 5%'], f: 5, p: 9, c: 3.5, fb: 0 },
  { n: 'לבנה', f: 9, p: 6, c: 4, fb: 0 },
  { n: 'מסקרפונה', a: ['mascarpone'], f: 44, p: 4.6, c: 4, fb: 0 },
  { n: 'ריקוטה', a: ['ricotta'], f: 10, p: 11, c: 3, fb: 0 },
  { n: 'חלב', a: ['חלב 3%', 'milk'], f: 3, p: 3.3, c: 4.7, fb: 0 },
  { n: 'יוגורט', a: ['יוגורט 3%', 'yogurt'], f: 3, p: 3.5, c: 4.7, fb: 0 },
  { n: 'יוגורט יווני', a: ['יוגורט יווני 10%'], f: 10, p: 6, c: 4, fb: 0 },
  // בשר, עוף ודגים (נא)
  { n: 'חזה עוף', a: ['חזה', 'chicken breast'], f: 2.6, p: 22.5, c: 0, fb: 0 },
  { n: 'פרגית', a: ['ירכיים', 'ירכי עוף', 'chicken thighs'], f: 7, p: 18, c: 0, fb: 0 },
  { n: 'כנפיים', a: ['כנפי עוף', 'chicken wings'], f: 13, p: 18, c: 0, fb: 0 },
  { n: 'שוקיים', a: ['שוקי עוף'], f: 9, p: 18, c: 0, fb: 0 },
  { n: 'בשר טחון', a: ['טחון', 'בשר בקר טחון', 'ground beef'], f: 15, p: 19, c: 0, fb: 0 },
  { n: 'אנטריקוט', a: ['סטייק', 'ribeye'], f: 18, p: 19, c: 0, fb: 0 },
  { n: 'כבש טחון', f: 20, p: 17, c: 0, fb: 0 },
  { n: 'בייקון', a: ['bacon'], f: 42, p: 12, c: 1.3, fb: 0 },
  { n: 'נקניק', a: ['סלמי', 'salami'], f: 30, p: 18, c: 2, fb: 0 },
  { n: 'נקניקיות', a: ['נקניקיה'], f: 25, p: 12, c: 3, fb: 0, u: 50 },
  { n: 'סלמון', a: ['פילה סלמון', 'salmon'], f: 13, p: 20, c: 0, fb: 0 },
  { n: 'טונה בשמן', a: ['טונה'], f: 8, p: 29, c: 0, fb: 0 },
  { n: 'טונה במים', f: 1, p: 26, c: 0, fb: 0 },
  { n: 'אנשובי', a: ['anchovies'], f: 9.7, p: 29, c: 0, fb: 0 },
  { n: 'שרימפס', a: ['shrimp', 'prawns'], f: 0.5, p: 20, c: 0, fb: 0 },
  // שמנים, אגוזים וזרעים
  { n: 'שמן זית', a: ['olive oil'], f: 100, p: 0, c: 0, fb: 0 },
  { n: 'שמן קוקוס', a: ['coconut oil'], f: 100, p: 0, c: 0, fb: 0 },
  { n: 'שמן', a: ['שמן קנולה', 'שמן חמניות'], f: 100, p: 0, c: 0, fb: 0 },
  { n: 'מיונז', a: ['mayonnaise'], f: 75, p: 1, c: 1, fb: 0 },
  { n: 'טחינה גולמית', a: ['טחינה', 'tahini'], f: 54, p: 17, c: 21, fb: 9.3 },
  { n: 'שקדים', a: ['almonds'], f: 50, p: 21, c: 22, fb: 12.5 },
  { n: 'אגוזי מלך', a: ['walnuts'], f: 65, p: 15, c: 14, fb: 6.7 },
  { n: 'אגוזי מקדמיה', a: ['מקדמיה', 'macadamia'], f: 76, p: 8, c: 14, fb: 8.6 },
  { n: 'אגוזי פקאן', a: ['פקאן', 'pecans'], f: 72, p: 9, c: 14, fb: 9.6 },
  { n: 'קשיו', a: ['cashews'], f: 44, p: 18, c: 30, fb: 3.3 },
  { n: 'זרעי צ\'יה', a: ['צ\'יה', 'chia'], f: 31, p: 17, c: 42, fb: 34 },
  { n: 'זרעי פשתן', a: ['פשתן'], f: 42, p: 18, c: 29, fb: 27 },
  { n: 'קמח שקדים', a: ['almond flour'], f: 50, p: 21, c: 22, fb: 10 },
  { n: 'זיתים', a: ['זיתים ירוקים', 'זיתים שחורים', 'olives'], f: 13, p: 1, c: 4, fb: 3 },
  { n: 'אבוקדו', a: ['avocado'], f: 15, p: 2, c: 8.5, fb: 6.7, u: 150 },
  // ירקות ופירות
  { n: 'חסה', a: ['lettuce'], f: 0.2, p: 1.4, c: 2.9, fb: 1.3 },
  { n: 'מלפפון', a: ['מלפפונים', 'cucumber'], f: 0.1, p: 0.7, c: 3.6, fb: 0.5, u: 150 },
  { n: 'עגבניה', a: ['עגבנייה', 'עגבניות', 'tomato'], f: 0.2, p: 0.9, c: 3.9, fb: 1.2, u: 120 },
  { n: 'עגבניות שרי', a: ['שרי'], f: 0.2, p: 0.9, c: 3.9, fb: 1.2, u: 15 },
  { n: 'בצל', a: ['onion'], f: 0.1, p: 1.1, c: 9.3, fb: 1.7, u: 110 },
  { n: 'שום', a: ['garlic'], f: 0.5, p: 6.4, c: 33, fb: 2.1, u: 4 },
  { n: 'לימון', a: ['lemon'], f: 0.3, p: 1.1, c: 9.3, fb: 2.8, u: 100 },
  { n: 'גזר', a: ['carrot'], f: 0.2, p: 0.9, c: 9.6, fb: 2.8, u: 70 },
  { n: 'פלפל', a: ['פלפל אדום', 'פלפל צהוב', 'גמבה', 'bell pepper'], f: 0.3, p: 1, c: 6, fb: 2.1, u: 150 },
  { n: 'פלפל חריף', a: ['צ\'ילי', 'chili'], f: 0.4, p: 1.9, c: 8.8, fb: 1.5, u: 15 },
  { n: 'סלרי', a: ['celery'], f: 0.2, p: 0.7, c: 3, fb: 1.6 },
  { n: 'תרד', a: ['spinach'], f: 0.4, p: 2.9, c: 3.6, fb: 2.2 },
  { n: 'ברוקולי', a: ['broccoli'], f: 0.4, p: 2.8, c: 6.6, fb: 2.6 },
  { n: 'כרובית', a: ['cauliflower'], f: 0.3, p: 1.9, c: 5, fb: 2 },
  { n: 'קישוא', a: ['קישואים', 'zucchini'], f: 0.3, p: 1.2, c: 3.1, fb: 1, u: 200 },
  { n: 'חציל', a: ['eggplant'], f: 0.2, p: 1, c: 5.9, fb: 3, u: 300 },
  { n: 'פטריות', a: ['שמפיניון', 'mushrooms'], f: 0.3, p: 3.1, c: 3.3, fb: 1 },
  { n: 'כרוב', a: ['כרוב לבן', 'כרוב סגול', 'cabbage'], f: 0.1, p: 1.3, c: 5.8, fb: 2.5 },
  { n: 'אספרגוס', a: ['asparagus'], f: 0.1, p: 2.2, c: 3.9, fb: 2.1 },
  { n: 'שעועית ירוקה', f: 0.2, p: 1.8, c: 7, fb: 2.7 },
  { n: 'תפוח אדמה', a: ['תפוחי אדמה', 'potato'], f: 0.1, p: 2, c: 17, fb: 2.2, u: 170 },
  { n: 'בטטה', a: ['sweet potato'], f: 0.1, p: 1.6, c: 20, fb: 3, u: 200 },
  { n: 'תפוח', a: ['תפוחים', 'apple'], f: 0.2, p: 0.3, c: 14, fb: 2.4, u: 180 },
  { n: 'בננה', a: ['בננות', 'banana'], f: 0.3, p: 1.1, c: 23, fb: 2.6, u: 120 },
  { n: 'תותים', a: ['תות', 'strawberries'], f: 0.3, p: 0.7, c: 7.7, fb: 2 },
  { n: 'אוכמניות', a: ['blueberries'], f: 0.3, p: 0.7, c: 14.5, fb: 2.4 },
  { n: 'פטל', a: ['raspberries'], f: 0.7, p: 1.2, c: 12, fb: 6.5 },
  // עשבי תיבול
  { n: 'פטרוזיליה', a: ['parsley'], f: 0.8, p: 3, c: 6.3, fb: 3.3 },
  { n: 'כוסברה', a: ['cilantro', 'coriander'], f: 0.5, p: 2.1, c: 3.7, fb: 2.8 },
  { n: 'בזיליקום', a: ['basil'], f: 0.6, p: 3.2, c: 2.7, fb: 1.6 },
  { n: 'נענע', a: ['mint'], f: 0.7, p: 3.8, c: 15, fb: 8 },
  { n: 'שמיר', a: ['dill'], f: 1.1, p: 3.5, c: 7, fb: 2.1 },
  // מוצרי יסוד ואפייה
  { n: 'לחם', a: ['לחם לבן', 'bread'], f: 3, p: 9, c: 49, fb: 3, u: 30 },
  { n: 'פיתה', a: ['פיתות'], f: 1.2, p: 9, c: 56, fb: 2.2, u: 80 },
  { n: 'פסטה', a: ['ספגטי', 'pasta'], f: 1.5, p: 13, c: 75, fb: 3 },
  { n: 'אורז', a: ['rice'], f: 0.7, p: 7, c: 80, fb: 1.3 },
  { n: 'קמח', a: ['קמח לבן', 'flour'], f: 1, p: 10, c: 76, fb: 2.7 },
  { n: 'סוכר', a: ['sugar'], f: 0, p: 0, c: 100, fb: 0 },
  { n: 'סוכר חום', a: ['brown sugar'], f: 0, p: 0.1, c: 98, fb: 0 },
  { n: 'דבש', a: ['honey'], f: 0, p: 0.3, c: 82, fb: 0.2 },
  { n: 'שוקולד מריר', a: ['שוקולד מריר 85%', 'dark chocolate'], f: 46, p: 11, c: 30, fb: 13 },
  { n: 'תירס פחית', a: ['תירס', 'תירס שימורים', 'corn'], f: 1.2, p: 2.6, c: 17, fb: 2 },
  // משקאות
  { n: 'קפה שחור', a: ['קפה', 'אספרסו', 'coffee'], f: 0, p: 0.1, c: 0, fb: 0 },
  { n: 'תה', a: ['ארל גריי', 'תה ירוק', 'tea'], f: 0, p: 0, c: 0.3, fb: 0 },
  { n: 'מים', a: ['סודה', 'מים מינרליים'], f: 0, p: 0, c: 0, fb: 0 },
  { n: 'קולה זירו', a: ['קוקה קולה זירו', 'דיאט קולה'], f: 0, p: 0, c: 0, fb: 0 },
];

/** Diet presets (share of calories from fat / protein / carbs, and the daily net-carb limit). */
const KETO_PRESETS = {
  standard:  { label: 'קטו סטנדרטי', netCarbLimit: 20, fatPct: 70, proteinPct: 25, carbPct: 5 },
  liberal:   { label: 'קטו מתון (Low carb)', netCarbLimit: 50, fatPct: 60, proteinPct: 30, carbPct: 10 },
  highprot:  { label: 'קטו עשיר בחלבון', netCarbLimit: 25, fatPct: 60, proteinPct: 35, carbPct: 5 },
  ratio3:    { label: 'קטו טיפולי 3:1', netCarbLimit: 15, fatPct: 87, proteinPct: 9, carbPct: 4, ratio: 3 },
  ratio4:    { label: 'קטו טיפולי 4:1', netCarbLimit: 10, fatPct: 90, proteinPct: 7, carbPct: 3, ratio: 4 },
};

(() => {
  'use strict';

  /** Same normalization as the server's food keys (spelling variants, plurals, final letters). */
  function normalize(str) {
    return String(str || '').toLowerCase()
      .replace(/[֑-ׇ]/g, '')
      .replace(/["'`׳״.,;:!?()\[\]{}\-_/\\+*]/g, ' ')
      .replace(/יי/g, 'י').replace(/וו/g, 'ו')
      .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
      .split(/\s+/).filter(Boolean)
      .map((w) => {
        if (w.length > 3) w = w.replace(/(ימ|ות)$/, '');
        if (w.length > 3) w = w.replace(/ה$/, '');
        if (/^[a-z]+$/.test(w) && w.length > 3) w = w.replace(/(es|s)$/, '');
        return w;
      }).join(' ').trim();
  }

  // name/alias -> food. One-word names must match the whole item ("חלב" is not "חלב שקדים");
  // longer names may be followed by more words ("שמנת חמוצה בטעם של פעם").
  const exact = new Map();
  const prefixes = [];
  for (const food of KETO_FOODS) {
    const rec = { name: food.n, fat: food.f, protein: food.p, carbs: food.c, fiber: food.fb, unit_g: food.u || null, is_food: true, source: 'builtin' };
    for (const alias of [food.n, ...(food.a || [])]) {
      const k = normalize(alias);
      if (!k) continue;
      if (!exact.has(k)) exact.set(k, rec);
      if (k.includes(' ')) prefixes.push([k, rec]);
    }
  }
  prefixes.sort((a, b) => b[0].length - a[0].length);

  function builtin(name) {
    const k = normalize(name);
    if (exact.has(k)) return exact.get(k);
    for (const [p, rec] of prefixes) if (k === p || k.startsWith(p + ' ')) return rec;
    return null;
  }

  /** Values for a given amount (grams) of a food given per 100 g. */
  function scale(food, grams) {
    const r = grams / 100;
    return { fat: food.fat * r, protein: food.protein * r, carbs: food.carbs * r, fiber: Math.min(food.fiber, food.carbs) * r };
  }

  /** The numbers the capit calculator shows: calories, keto ratio (fat : protein + carbs), net ratio, net carbs, calorie split. */
  function summarize(t) {
    const fat = t.fat || 0, protein = t.protein || 0, carbs = t.carbs || 0, fiber = Math.min(t.fiber || 0, carbs);
    const net = carbs - fiber;
    const kcal = 9 * fat + 4 * protein + 4 * carbs;
    const denom = protein + carbs;
    // NaN when there is nothing to compare (shown as "—"), Infinity for pure fat.
    const ratio = denom ? fat / denom : (fat ? Infinity : NaN);
    const netRatio = denom - fiber > 0 ? fat / (denom - fiber) : (fat ? Infinity : NaN);
    const pct = kcal ? { fat: 900 * fat / kcal, protein: 400 * protein / kcal, carbs: 400 * carbs / kcal } : { fat: 0, protein: 0, carbs: 0 };
    return { fat, protein, carbs, fiber, net, kcal, ratio, netRatio, pct };
  }

  function sum(list) {
    return list.reduce((s, i) => ({ fat: s.fat + (i.fat || 0), protein: s.protein + (i.protein || 0), carbs: s.carbs + (i.carbs || 0), fiber: s.fiber + (i.fiber || 0) }),
      { fat: 0, protein: 0, carbs: 0, fiber: 0 });
  }

  const fmt = (n, d = 1) => (Number.isFinite(n) ? (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('he-IL') : '∞');
  const fmtRatio = (n) => (Number.isFinite(n) ? `${fmt(n, 2)}:1` : n === Infinity ? 'שומן בלבד' : '—');

  /** A pie of the calorie split (fat, protein, carbs) as SVG markup. */
  function pieSvg(t, size = 22, { ring = false, label = '' } = {}) {
    const s = summarize(t);
    const parts = [['fat', s.pct.fat], ['protein', s.pct.protein], ['carbs', s.pct.carbs]].filter(([, v]) => v > 0.05);
    const r = 16;
    const cut = ring ? '<circle cx="16" cy="16" r="8.5" fill="var(--card)"/>' : '';
    let body;
    if (!parts.length) body = `<circle cx="16" cy="16" r="${r - 1}" fill="none" stroke="var(--line-strong)" stroke-width="2" stroke-dasharray="3 3"/>`;
    else if (parts.length === 1) body = `<circle cx="16" cy="16" r="${r}" class="m-${parts[0][0]}"/>`;
    else {
      let a = -Math.PI / 2;
      body = parts.map(([k, v]) => {
        const b = a + (v / 100) * 2 * Math.PI;
        const large = b - a > Math.PI ? 1 : 0;
        const p = `M16 16 L${16 + r * Math.cos(a)} ${16 + r * Math.sin(a)} A${r} ${r} 0 ${large} 1 ${16 + r * Math.cos(b)} ${16 + r * Math.sin(b)} Z`;
        a = b;
        return `<path d="${p}" class="m-${k}"/>`;
      }).join('');
    }
    const title = label || `שומן ${fmt(s.pct.fat, 0)}% · חלבון ${fmt(s.pct.protein, 0)}% · פחמימות ${fmt(s.pct.carbs, 0)}% מהקלוריות`;
    return `<svg class="pie" viewBox="0 0 32 32" width="${size}" height="${size}" role="img" aria-label="${title}"><title>${title}</title>${body}${cut}</svg>`;
  }

  function pie(t, size, opts) {
    const tpl = document.createElement('template');
    tpl.innerHTML = pieSvg(t, size, opts);
    return tpl.content.firstChild;
  }

  window.KetoMath = { normalize, builtin, scale, summarize, sum, fmt, fmtRatio, pie, pieSvg, presets: KETO_PRESETS, foods: KETO_FOODS };
})();
