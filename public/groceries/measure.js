/**
 * Recipe measures (the owner's tour, 2026-11-13): scaling by servings and converting between grams and cups/spoons.
 * Pure logic on a Hebrew measure string ("1/2 כוס (120 גרם)", "כף וחצי", "2-3 שיני"), the ingredient's name helping
 * with grams ↔ cups. Anything it cannot read is shown as it was. Tested in server/test-measure.mjs.
 *   Measure.scale(measure, factor)            → the measure for factor × the recipe
 *   Measure.convert(measure, name, to)        → to: 'grams' | 'cups' ('orig' leaves it); null when there is nothing to convert
 *   Measure.show(measure, name, factor, to)   → both, for the screen
 *   Measure.servings(meta)                    → the recipe's number of servings, or null
 *   Measure.temp(n, from)                     → { c, f } from 'c' or 'f' (the oven)
 */
(function () {
  const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
  const WORDS = { 'חצי': 0.5, 'רבע': 0.25, 'שליש': 1 / 3, 'שלושת רבעי': 0.75, 'שני שליש': 2 / 3, 'אחד': 1, 'אחת': 1, 'שתי': 2, 'שני': 2, 'שתיים': 2, 'שניים': 2, 'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4 };
  const ML = { cup: 240, tbsp: 15, tsp: 5 };   // the Israeli cup

  // units: singular, plural, kind (vol: ml each; w: grams each; n: a count, scaled only)
  const UNITS = [
    { id: 'cup', one: 'כוס', many: 'כוסות', ml: ML.cup },
    { id: 'tbsp', one: 'כף', many: 'כפות', ml: ML.tbsp },
    { id: 'tsp', one: 'כפית', many: 'כפיות', ml: ML.tsp },
    { id: 'l', one: 'ליטר', many: 'ליטר', ml: 1000 },
    { id: 'ml', one: 'מ"ל', many: 'מ"ל', ml: 1, alt: ['מל', 'מ״ל', 'מיליליטר'] },
    { id: 'kg', one: 'ק"ג', many: 'ק"ג', g: 1000, alt: ['קג', 'ק״ג', 'קילו', 'קילוגרם'] },
    { id: 'g', one: 'גרם', many: 'גרם', g: 1, alt: ['ג׳', "ג'", 'גר׳', "גר'", 'גר'] },
    { id: 'unit', one: 'יחידה', many: 'יחידות' },
    { id: 'clove', one: 'שן', many: 'שיני' },
    { id: 'pack', one: 'חבילה', many: 'חבילות' },
    { id: 'can', one: 'קופסה', many: 'קופסאות', alt: ['קופסת', 'קופסאת'] },
    { id: 'bunch', one: 'צרור', many: 'צרורות' },
    { id: 'slice', one: 'פרוסה', many: 'פרוסות' },
    { id: 'pinch', one: 'קורט', many: 'קורט' },
  ];
  const unitWords = UNITS.flatMap((u) => [u.one, u.many, ...(u.alt || [])].map((w) => [w, u])).sort((a, b) => b[0].length - a[0].length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');
  const UNIT_RE = new RegExp('^(' + unitWords.map(([w]) => esc(w)).join('|') + ')(?=$|[\\s(,.־-])');

  // grams in one cup, by a word in the ingredient's name (the first match wins; liquids are shown in מ"ל)
  const DENSITY = [
    ['אבקת סוכר', 120], ['סוכר חום', 220], ['סוכר', 200], ['קמח שקדים', 100], ['קמח תירס', 128], ['קורנפלור', 128], ['קמח', 140],
    ['קוואקר', 90], ['שיבולת שועל', 90], ['פירורי לחם', 110], ['פנקו', 60], ['קקאו', 85], ['סולת', 165], ['קוסקוס', 180],
    ['בורגול', 170], ['קינואה', 170], ['אורז', 200], ['עדשים', 190], ['גריסים', 200], ['חומוס', 200], ['שעועית', 190], ['אפונה', 150],
    ['פתיתים', 170], ['שקדים', 140], ['אגוז', 120], ['בוטנים', 145], ['צימוקים', 150], ['קוקוס', 80], ['שומשום', 145],
    ['גבינה מגורדת', 100], ['פרמזן', 100], ['גבינת שמנת', 230], ['קוטג', 225], ['ריקוטה', 245], ['חמאת בוטנים', 260], ['חמאה', 227],
    ['טחינה', 250], ['דבש', 340], ['סילאן', 340], ['מייפל', 315], ['ריבה', 320], ['מלח', 290], ['אבקת אפייה', 230], ['סודה לשתייה', 230],
    ['שוקולד צ', 170], ['פטרוזיליה', 60], ['כוסברה', 60], ['שמיר', 60], ['נענע', 50],
  ];
  const LIQUID = [['שמן', 218], ['חלב', 245], ['שמנת', 240], ['יוגורט', 245], ['מים', 240], ['ציר', 240], ['מיץ', 245], ['חומץ', 240], ['יין', 240], ['רוטב', 245], ['רסק', 260]];
  const densityOf = (name) => {
    const n = String(name || '');
    for (const [w, g] of LIQUID) if (n.includes(w)) return { g, liquid: true };
    for (const [w, g] of DENSITY) if (n.includes(w)) return { g, liquid: false };
    return null;
  };

  /* ---- reading ---- */
  function num(s) {
    s = s.trim();
    let m = s.match(/^(\d+)\s+(\d+)\/(\d+)/);                         // 1 1/2
    if (m) return [+m[1] + m[2] / m[3], m[0].length];
    m = s.match(/^(\d+)\/(\d+)/);                                     // 1/2
    if (m) return [m[1] / m[2], m[0].length];
    m = s.match(/^(\d+(?:[.,]\d+)?)\s*([½¼¾⅓⅔⅛])?/);                  // 1.5, 1½
    if (m) return [parseFloat(m[1].replace(',', '.')) + (m[2] ? FRAC[m[2]] : 0), m[0].length];
    m = s.match(/^[½¼¾⅓⅔⅛]/);
    if (m) return [FRAC[m[0]], 1];
    for (const w of Object.keys(WORDS).sort((a, b) => b.length - a.length)) if (s.startsWith(w) && /^($|\s)/.test(s.slice(w.length))) return [WORDS[w], w.length];
    return null;
  }

  /** { qty, qty2 (a range's top), unit, rest } or null when it does not start with a quantity or a unit */
  function parse(measure) {
    let s = String(measure || '').trim().replace(/\s+/g, ' ');
    if (!s) return null;
    let qty = null, qty2 = null;
    const a = num(s);
    if (a) {
      qty = a[0]; s = s.slice(a[1]).trim();
      const r = s.match(/^[-–־]\s*/) && num(s.replace(/^[-–־]\s*/, ''));
      if (r) { qty2 = r[0]; s = s.replace(/^[-–־]\s*/, '').slice(r[1]).trim(); }
    }
    const um = s.match(UNIT_RE);
    const unit = um ? unitWords.find(([w]) => w === um[1])[1] : null;
    if (um) s = s.slice(um[1].length).trim();
    // "כף וחצי", "כוס ורבע": a unit with no number, then a fraction
    const tail = s.match(/^ו(חצי|רבע|שליש)(?=$|\s)/);
    if (unit && tail) { qty = (qty ?? 1) + WORDS[tail[1]]; s = s.slice(tail[0].length).trim(); }
    if (unit && qty == null) qty = unit.id === 'pinch' ? null : 1;
    if (qty == null && !unit) return null;
    return { qty, qty2, unit, rest: s };
  }

  /* ---- writing ---- */
  // the fractions people measure with: cups have thirds, spoons quarters, a teaspoon an eighth (a pinch)
  const NICE = [[0, ''], [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
  const SPOON = new Set(['', '¼', '½', '¾']);
  const fractionsFor = (unit) => NICE.filter(([, sym]) => (unit?.id === 'tsp' ? SPOON.has(sym) || sym === '⅛' : unit?.id === 'tbsp' ? SPOON.has(sym) : sym !== '⅛'));
  /** a quantity as people write it: whole numbers and kitchen fractions (½ ⅓ ¼ ¾ ⅔ ⅛), big amounts rounded */
  function fmtQty(q, unit) {
    if (unit && (unit.g || unit.id === 'ml')) {                        // grams and ml: round numbers
      const step = q >= 100 ? 10 : q >= 20 ? 5 : 1;
      return String(Math.max(step === 1 ? 1 : step, Math.round(q / step) * step));
    }
    if (unit?.id === 'l' || q >= 10) return String(Math.round(q * (q >= 10 ? 1 : 4)) / (q >= 10 ? 1 : 4)).replace(/\.25$/, '¼').replace(/\.5$/, '½').replace(/\.75$/, '¾');
    let whole = Math.floor(q), f = q - whole;
    const [v, sym] = fractionsFor(unit).filter(([, x]) => !whole || x !== '⅛').reduce((best, x) => (Math.abs(x[0] - f) < Math.abs(best[0] - f) ? x : best));
    if (v === 1) { whole += 1; }
    if (!whole && !sym) return unit?.id === 'tsp' ? '⅛' : '¼';
    return (whole ? String(whole) : '') + (v === 1 ? '' : sym);
  }
  const unitName = (unit, q) => (unit ? (q > 1 || q === 0 ? unit.many : unit.one) : '');
  // "יחידה בינונית" / "יחידות בינוניות": the size agrees with the number
  const SIZES = [['בינונית', 'בינוניות'], ['גדולה', 'גדולות'], ['קטנה', 'קטנות']];
  const agree = (rest, many) => rest.replace(/^(\S+)/, (w) => { const x = SIZES.find((z) => z.includes(w)); return x ? x[many ? 1 : 0] : w; });
  function write(p) {
    const q = p.qty == null ? '' : fmtQty(p.qty, p.unit) + (p.qty2 != null ? '-' + fmtQty(p.qty2, p.unit) : '');
    const top = p.qty2 ?? p.qty ?? 1;
    // "כוס" after ½ or 1, "כוסות" after more; a pinch has no number
    return [q, unitName(p.unit, top > 1 ? 2 : 1), p.unit?.id === 'unit' ? agree(p.rest, top > 1) : p.rest].filter(Boolean).join(' ');
  }

  /** the numbers of a weight or volume in parentheses ("(120 גרם)", "(כ-600 גרם)") scale with the rest */
  const scaleParens = (s, f) => s.replace(/(\d+(?:\.\d+)?)(\s*)(גרם|ג׳|ק"ג|מ"ל|ליטר)/g, (_, n, sp, u) => fmtQty(n * f, UNITS.find((x) => x.one === u || (x.alt || []).includes(u)) || { g: 1 }) + sp + u);

  function scale(measure, f) {
    if (!measure || !f || f === 1) return measure || '';
    const p = parse(measure);
    if (!p || p.qty == null) return measure;
    return write({ ...p, qty: p.qty * f, qty2: p.qty2 != null ? p.qty2 * f : null, rest: scaleParens(p.rest, f) });
  }

  /** a volume in ml as cups or spoons: a quarter of a cup and up in cups, a tablespoon and up in tablespoons */
  function asSpoons(ml) {
    if (ml >= ML.cup / 4 - 1) return { qty: ml / ML.cup, unit: UNITS[0] };
    if (ml >= ML.tbsp - 0.5) return { qty: ml / ML.tbsp, unit: UNITS[1] };
    return { qty: ml / ML.tsp, unit: UNITS[2] };
  }

  function convert(measure, name, to) {
    if (!to || to === 'orig') return null;
    const p = parse(measure);
    if (!p || p.qty == null || !p.unit || !(p.unit.ml || p.unit.g)) return null;
    const d = densityOf(name);
    // a weight already written beside a volume wins: "1/2 כוס (120 גרם)"
    const given = p.unit.ml && p.rest.match(/\(\s*(?:כ-?)?(\d+(?:\.\d+)?)\s*(גרם|ג׳)\s*\)/);
    const rest = p.rest.replace(/\s*\([^)]*\d[^)]*\)\s*/g, ' ').trim();
    const ratio = p.qty2 != null ? p.qty2 / p.qty : null;
    if (to === 'grams') {
      if (p.unit.g) return null;                                      // already a weight
      const ml = p.qty * p.unit.ml;
      if (d?.liquid) return p.unit.id === 'ml' ? null : write({ qty: ml, qty2: ratio ? ml * ratio : null, unit: UNITS[4], rest });
      const g = given ? +given[1] : d ? (ml / ML.cup) * d.g : null;
      return g == null ? null : write({ qty: g, qty2: ratio ? g * ratio : null, unit: UNITS[6], rest });
    }
    if (to === 'cups') {
      if (p.unit.id === 'cup' || p.unit.id === 'tbsp' || p.unit.id === 'tsp') return null;
      const ml = p.unit.ml ? p.qty * p.unit.ml : d ? (p.qty * p.unit.g / d.g) * ML.cup : null;
      if (ml == null || ml > ML.cup * 24) return null;                // a few kilos are not measured in cups
      const s = asSpoons(ml);
      return write({ ...s, qty2: ratio ? s.qty * ratio : null, rest });
    }
    return null;
  }

  function show(measure, name, f = 1, to = 'orig') {
    const scaled = scale(measure, f);
    return (to !== 'orig' && convert(scaled, name, to)) || scaled;
  }

  function servings(meta) {
    const m = String(meta?.servings ?? '').match(/\d+/);
    const n = m ? +m[0] : 0;
    return n > 0 && n <= 100 ? n : null;
  }

  /** the oven's heat both ways, rounded to a degree */
  const temp = (n, from) => (from === 'f' ? { c: Math.round(((n - 32) * 5) / 9), f: n } : { c: n, f: Math.round((n * 9) / 5 + 32) });

  const api = { parse, scale, convert, show, servings, fmtQty, temp };
  if (typeof window !== 'undefined') window.Measure = api;
  if (typeof globalThis !== 'undefined') globalThis.Measure = api;
})();
