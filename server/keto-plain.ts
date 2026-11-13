// Ketosis without AI (docs/ai/without-ai.md, #3): a food's values from Open Food Facts (an open database of packaged
// products, Israeli ones in Hebrew too; ODbL, so where they came from is shown), and a recipe's values worked out from
// its amounts and the values per 100 g we have. The AI's estimate (keto.ts) stays on top where an AI is connected.
// No database or network here.   Tests: node server/test-keto-plain.mjs

export interface Per100 { fat: number; protein: number; carbs: number; fiber: number }
const r1 = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** one product's values per 100 g, with carbs as the total including fiber (our convention, as on an Israeli label).
    European labels give carbs without the fiber: when the fiber is more than the carbs, they surely did, so the fiber is
    added; for a product sold outside Israel it is added too (keto counts carbs safely: more rather than less). */
export function offProduct(p: { nutriments?: Record<string, unknown>; countries_tags?: string[] }): Per100 | null {
  const n = p.nutriments || {};
  const v = (k: string) => { const x = Number(n[`${k}_100g`]); return Number.isFinite(x) && x >= 0 && x <= 100 ? x : null; };
  const fat = v('fat'), protein = v('proteins'), carbs = v('carbohydrates'), fiber = v('fiber') ?? 0;
  if (fat === null || protein === null || carbs === null) return null;
  const israeli = (p.countries_tags || []).some((c) => /israel|ישראל/i.test(c));
  const total = fiber > carbs || !israeli ? carbs + fiber : carbs;
  if (fat + protein + total > 101) return null;
  return { fat: r1(fat), protein: r1(protein), carbs: r1(Math.min(100, total)), fiber: r1(fiber) };
}
/** a name's words for matching: letters only, without the geresh and quotes ("קוטג׳ 5%" → ["קוטג"]) */
const wordsOf = (s: string) => String(s || '').toLowerCase().replace(/[׳״'"`’]/g, '').match(/\p{L}{2,}/gu) || [];
/** a food's values from the matches whose name has every word that was asked (a search for "קוטג׳ 5%" also finds beer
    at 5%: those are not it): the median of each value, so that one odd product (a salad named "טחינה") does not decide
    it; null when nothing fits – no value is better than a wrong one */
export function offValues(hits: Array<Parameters<typeof offProduct>[0] & { product_name?: string | null }>, query = '', take = 5): Per100 | null {
  const want = wordsOf(query);
  const fits = (h: { product_name?: string | null }) => { if (!want.length) return true; const have = wordsOf(h.product_name || '').join(' '); return want.every((w) => have.includes(w)); };
  const good = hits.filter(fits).map(offProduct).filter((x): x is Per100 => !!x).slice(0, take);
  if (!good.length) return null;
  const m = (k: keyof Per100) => r1(median(good.map((g) => g[k])));
  const fiber = m('fiber'), carbs = Math.max(m('carbs'), fiber);
  return { fat: m('fat'), protein: m('protein'), carbs, fiber };
}

/* ---------------- a recipe's amounts in grams ---------------- */

// a cup of what: the common exceptions to 240 g (a cup of water); in grams
const CUP: Array<[RegExp, number]> = [
  // (the specific ones before the general: almond flour is not flour)
  [/שקדים טחונים|קמח שקדים|almond flour/i, 100], [/קוקוס|coconut/i, 90], [/קמח|flour/i, 130], [/סוכר|sugar/i, 200], [/אורז|rice/i, 190],
  [/שיבולת|קוואקר|oats/i, 90], [/אגוזים|שקדים|nuts|almonds/i, 140], [/גבינה מגורדת|צהובה מגורדת|parmesan|grated/i, 100], [/חמאה|butter/i, 225],
  [/שמן|oil/i, 220], [/דבש|honey|סילאן/i, 340], [/קקאו|cocoa/i, 85], [/פירורי לחם|breadcrumbs/i, 110],
];
const SPOON: Array<[RegExp, number]> = [[/שמן|oil/i, 13], [/קמח|flour/i, 8], [/סוכר|sugar/i, 12], [/דבש|honey|סילאן/i, 21], [/חמאה|butter/i, 14]];
// one unit of what is counted, in grams (when the food's own row has no unit weight)
const UNIT: Array<[RegExp, number]> = [
  [/ביצ|egg/i, 55], [/עגבני(?!ות שרי|ית שרי)|tomato/i, 120], [/שרי|cherry/i, 15], [/בצל ירוק|green onion/i, 15], [/בצל|onion/i, 110], [/מלפפון|cucumber/i, 100],
  [/אבוקדו|avocado/i, 150], [/לימון|lemon/i, 100], [/תפוח|apple/i, 150], [/גזר|carrot/i, 70], [/פלפל|pepper/i, 150], [/חציל|eggplant/i, 300],
  [/קישוא|zucchini/i, 200], [/תפוח אדמה|potato/i, 170], [/בננה|banana/i, 120], [/פרוס|slice/i, 30], [/פיתה|pita/i, 90],
];
/** one unit's weight for a food counted by units, from the table above, or null */
export const unitWeight = (name: string) => (UNIT.find(([re]) => re.test(name)) || [, null])[1] as number | null;
const pick = (table: Array<[RegExp, number]>, name: string, dflt: number) => (table.find(([re]) => re.test(name)) || [, dflt])[1] as number;
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, 'חצי': 0.5, 'רבע': 0.25, 'שליש': 1 / 3 };
/** the number at the start of an amount: 2, 1.5, 1/2, 1 1/2, ½, "חצי", "2-3" (the middle) */
function amount(s: string): number | null {
  const t = s.trim();
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)/); if (m) return +m[1] + +m[2] / +m[3];
  m = t.match(/^(\d+)\/(\d+)/); if (m) return +m[1] / +m[2];
  m = t.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/); if (m) return (+m[1] + +m[2]) / 2;
  m = t.match(/^(\d+(?:\.\d+)?)\s*([½¼¾⅓⅔])?/); if (m) return +m[1] + (m[2] ? FRACTIONS[m[2]] : 0);
  for (const [w, v] of Object.entries(FRACTIONS)) if (t.startsWith(w)) return v;
  if (/^(?:כוס|כף|כפית|יחידה|ביצה|שן|קופסה|חבילה|a |an |one )/i.test(t)) return 1;
  return null;
}
/** how many grams an ingredient's amount is: by its unit, or by the food's own unit weight; 0 for "to taste"; null when
    it cannot be told */
export function gramsOf(measure: string, name: string, unitG?: number | null): number | null {
  const s = `${measure || ''}`.trim().replace(/״/g, '"').replace(/׳/g, "'");
  unitG = unitG || unitWeight(name);
  if (/לפי הטעם|קורט|מעט|to taste|pinch|קצת/i.test(s) || /לפי הטעם|קורט/.test(name)) return 0;
  if (/^(?:מים|water)(?:\s|$)/i.test(name.trim())) return 0;
  const n = amount(s);
  const unit = s.replace(/^(?:חצי|רבע|שליש)\s*/, '').replace(/^[\d\s./½¼¾⅓⅔–-]+/, '').trim();
  if (n === null) return unitG && !s ? unitG : null;
  if (/^(?:ק"ג|קילו|kg)/i.test(unit)) return n * 1000;
  if (/^(?:גרם|גר'?|ג'|g\b|gr)/i.test(unit)) return n;
  if (/^(?:ליטר|ל'|l\b|liter)/i.test(unit)) return n * 1000;
  if (/^(?:מ"ל|מל|ml)/i.test(unit)) return n;
  if (/^(?:כוס|כוסות|cup)/i.test(unit)) return n * pick(CUP, name, 240);
  if (/^(?:כפית|כפיות|tsp|teaspoon)/i.test(unit)) return n * 5;
  if (/^(?:כף|כפות|tbsp|tablespoon)/i.test(unit)) return n * pick(SPOON, name, 15);
  if (/^(?:שן|שיני)/.test(unit)) return n * 4;
  // a count: "3", "3 ביצים", "2 יחידות" – the food's own unit weight
  if (!unit || /^(?:יח|יחידה|יחידות|ביצ|unit|pcs?)/i.test(unit) || name.includes(unit)) return unitG ? n * unitG : null;
  return null;
}

/** a recipe's values without AI: each ingredient's grams times its values per 100 g; what could not be told is listed */
export function recipeFromFoods(items: Array<{ name: string; measure: string }>, valuesOf: (name: string) => (Per100 & { unit_g?: number | null }) | null, servingsText: string) {
  const out: Array<{ name: string; grams: number } & Per100> = [], unknown: string[] = [];
  for (const it of items) {
    const v = valuesOf(it.name);
    const g = gramsOf(it.measure, it.name, v?.unit_g ?? null);
    if (g === 0) { out.push({ name: it.name, grams: 0, fat: 0, protein: 0, carbs: 0, fiber: 0 }); continue; }
    if (g === null || !v) { unknown.push(it.name); continue; }
    const k = g / 100;
    out.push({ name: it.name, grams: r1(g), fat: r1(v.fat * k), protein: r1(v.protein * k), carbs: r1(v.carbs * k), fiber: r1(Math.min(v.fiber, v.carbs) * k) });
  }
  const sv = Number((String(servingsText || '').match(/\d+/) || [])[0]);
  const servings = sv >= 1 && sv <= 50 ? sv : 1;
  const sum = (k: keyof Per100) => r1(out.reduce((s, x) => s + x[k], 0));
  const total = { fat: sum('fat'), protein: sum('protein'), carbs: sum('carbs'), fiber: sum('fiber') };
  const per = (v: number) => r1(v / servings);
  return { servings, servingsKnown: sv >= 1 && sv <= 50, items: out, unknown, total,
    per_serving: { fat: per(total.fat), protein: per(total.protein), carbs: per(total.carbs), fiber: per(total.fiber) } };
}
