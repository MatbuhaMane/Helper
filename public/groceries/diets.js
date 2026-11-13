/* Ways of eating beside ketosis (vision batch 2, item 1; the owner's tour, 2026-11-13): Atkins, paleo, low-carb, low
 * sugar (low glycemic load) and intermittent fasting. Each is an app in "תנועה ותזונה" (/groceries/#<id>) with its own
 * switch; the switches are the person's choice and follow them (H.prefs('diets')).
 * - A diet that judges food (all but fasting) puts its own small pie beside each shopping-list item and a stamp on
 *   recipes. The judgment is a rule of thumb from the values per 100 g or per serving, or from the ingredient's name.
 * - Fasting is about time, not food: its tab is an eating-window clock.
 * Pure rules are in Diets.rules (tested in server/test-diets.mjs); the view is Diets.mount(node, id).
 */
(() => {
  'use strict';
  const has = (name, words) => words.some((w) => String(name || '').includes(w));

  const GRAINS = ['קמח', 'לחם', 'פיתה', 'אורז', 'פסטה', 'ספגטי', 'אטריות', 'פתיתים', 'קוסקוס', 'בורגול', 'שיבולת', 'קוואקר', 'תירס', 'סולת', 'גריסים', 'קינואה', 'לחמני', 'עוגה', 'עוגיות', 'קרקר', 'דגני'];
  const LEGUMES = ['עדשים', 'חומוס', 'שעועית', 'אפונה', 'סויה', 'טופו', 'בוטנים', 'פול'];
  const DAIRY = ['חלב', 'גבינ', 'יוגורט', 'שמנת', 'קוטג', 'לבנה', 'מוצרלה', 'פרמזן', 'ריקוטה', 'קשקבל'];
  const SUGARY = ['סוכר', 'ממתק', 'סוכריות', 'ריבה', 'סילאן', 'דבש', 'מיץ', 'משקה', 'שוקולד חלב', 'קורנפלקס', 'גלידה', 'עוגה', 'עוגיות', 'ופל', 'מרגרינה', 'נקניק'];
  const HIGH_GL = ['סוכר', 'ממתק', 'סוכריות', 'ריבה', 'סילאן', 'דבש', 'מיץ', 'משקה', 'קולה', 'שוקולד חלב', 'קורנפלקס', 'לחם לבן', 'אורז לבן', 'קמח לבן', 'תפוח אדמה', 'תפוחי אדמה', 'פירה', 'עוגה', 'עוגיות', 'גלידה', 'בייגלה', 'פריכיות', 'תמרים'];
  const LOW_GL_SWEETENERS = ['אריתריטול', 'סטיביה', 'אלולוז', 'מונק', 'ללא סוכר'];

  // the verdict on a food from its values per 100 g (s = KetoMath.summarize) and its name: [level, short text]
  const byNet = (s, ok, warn, what) => (s.net <= ok ? ['ok', `מתאים ל${what}`] : s.net <= warn ? ['warn', `גבולי ל${what}`] : ['bad', `לא מתאים ל${what}`]);
  const DIETS = [
    {
      id: 'atkins', name: 'אטקינס',
      about: 'הרבה חלבון ושומן, מעט פחמימות. בשלב הראשון עד כ-20 גרם פחמימות נטו ביום, ואחר כך מוסיפים לאט.',
      rules: ['ירקות עליים, ביצים, בשר, דגים ושמנים: חופשי', 'לחם, אורז, פסטה, סוכר ופירות מתוקים: לא בשלב הראשון', 'גבינות ואגוזים: במידה'],
      food: (s) => byNet(s, 5, 10, 'אטקינס'),
      recipe: (s) => byNet(s, 6, 12, 'אטקינס'),
    },
    {
      id: 'paleo', name: 'פליאו',
      about: 'אוכלים כמו פעם: בשר, דגים, ביצים, ירקות, פירות, אגוזים וזרעים. בלי דגנים, קטניות, מוצרי חלב, סוכר ומזון מעובד.',
      rules: ['בשר, דגים, ביצים, ירקות ופירות: כן', 'דגנים, לחם, אורז וקטניות: לא', 'מוצרי חלב, סוכר ומזון מעובד: לא'],
      food: (s, name) => (has(name, GRAINS) ? ['bad', 'דגנים: לא בפליאו'] : has(name, LEGUMES) ? ['bad', 'קטניות: לא בפליאו']
        : has(name, DAIRY) ? ['bad', 'מוצר חלב: לא בפליאו'] : has(name, SUGARY) ? ['bad', 'סוכר או מעובד: לא בפליאו'] : ['ok', 'מתאים לפליאו']),
      recipe: (s, names) => { const bad = names.filter((n) => DIETS[1].food(s, n)[0] === 'bad'); return bad.length ? ['bad', `לא פליאו: ${bad.slice(0, 2).join(', ')}`] : ['ok', 'מתאים לפליאו']; },
      byName: true,
    },
    {
      id: 'lowcarb', name: 'דל פחמימות',
      about: 'פחות פחמימות בלי להגיע לקטוזיס: בערך 50 עד 100 גרם פחמימות נטו ביום, ממקורות מלאים.',
      rules: ['ירקות, חלבון ושומן טוב: הבסיס', 'דגנים מלאים וקטניות: במנות קטנות', 'סוכר, קמח לבן ומשקאות מתוקים: מעט ככל האפשר'],
      food: (s) => byNet(s, 10, 20, 'דל פחמימות'),
      recipe: (s) => byNet(s, 15, 30, 'דל פחמימות'),
    },
    {
      id: 'glycemic', name: 'דל סוכר', sub: 'עומס גליקמי נמוך',
      about: 'מזון שמעלה את הסוכר בדם לאט: מעט סוכר וקמח לבן, הרבה סיבים, חלבון ושומן לצד הפחמימה.',
      rules: ['ירקות, קטניות, אגוזים, חלבון ושומן: כן', 'דגנים מלאים: במנות קטנות, לצד חלבון', 'סוכר, מיצים, לחם ואורז לבנים ותפוחי אדמה: מעט'],
      note: 'אינו ייעוץ רפואי. הערכה גסה לפי סוג המזון וכמות הפחמימות; למי שמטפל בסוכרת, ההנחיות הן של הרופא או הדיאטנית.',
      food: (s, name) => (has(name, LOW_GL_SWEETENERS) ? ['ok', 'עומס גליקמי נמוך'] : has(name, HIGH_GL) ? ['bad', 'עומס גליקמי גבוה']
        : s.net <= 15 ? ['ok', 'עומס גליקמי נמוך'] : s.net <= 30 ? ['warn', 'עומס גליקמי בינוני'] : ['bad', 'עומס גליקמי גבוה']),
      recipe: (s, names) => { const hi = names.filter((n) => has(n, HIGH_GL) && !has(n, LOW_GL_SWEETENERS));
        return hi.length > 1 || s.net > 40 ? ['bad', 'עומס גליקמי גבוה'] : hi.length || s.net > 20 ? ['warn', 'עומס גליקמי בינוני'] : ['ok', 'דל סוכר']; },
    },
    {
      id: 'fasting', name: 'צום לסירוגין', time: true,
      about: 'לא מה אוכלים אלא מתי: כל יום חלון אכילה קבוע, ובשאר השעות רק מים, תה וקפה בלי סוכר.',
      rules: ['16:8 – צום 16 שעות, אכילה ב-8', '14:10 – התחלה עדינה', '18:6 – למתקדמים'],
      note: 'אינו ייעוץ רפואי. בהריון, בהנקה, עם סוכרת או עם תרופות – רק בהתייעצות עם רופא.',
    },
  ];
  const byId = new Map(DIETS.map((d) => [d.id, d]));

  /* ---- the eating window (pure) ---- */
  /** { open, from, to, left (ms to the next change), pct (of the current phase) } for a window of `hours` starting at `start` ("12:00") */
  function windowAt(now, start = '12:00', hours = 8) {
    const [h, m] = String(start).split(':').map(Number);
    const day = new Date(now); day.setHours(h || 0, m || 0, 0, 0);
    let from = day.getTime();
    if (from > now) from -= 864e5;                         // the last window that started before now
    const to = from + hours * 36e5;
    const open = now < to;
    const next = open ? to : from + 864e5;
    const len = open ? hours * 36e5 : (24 - hours) * 36e5;
    return { open, from, to, left: next - now, pct: Math.round(100 * (1 - (next - now) / len)) };
  }

  /* ---- the person's choice ---- */
  const prefs = () => H.prefs('diets', { on: [], fastHours: 16, fastStart: '12:00' });
  const isOn = (id) => (prefs().on || []).includes(id);
  function setOn(id, on) {
    const p = prefs();
    const list = new Set(p.on || []);
    on ? list.add(id) : list.delete(id);
    H.savePrefs('diets', { on: [...list] });
    window.dispatchEvent(new CustomEvent('diets:changed', { detail: id }));
  }
  window.addEventListener('helper:prefs', (e) => { if (e.detail === 'diets') window.dispatchEvent(new CustomEvent('diets:changed', { detail: 'prefs' })); });

  /* ---- the tab of one diet ---- */
  const hhmm = (t) => new Date(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const dur = (ms) => { const m = Math.max(0, Math.round(ms / 6e4)); return m >= 60 ? `${Math.floor(m / 60)} ש׳ ו-${m % 60} ד׳` : `${m} דקות`; };
  let ticking = 0;

  function mount(node, id) {
    const d = byId.get(id);
    const { el } = H;
    clearInterval(ticking);
    const sw = el('input', { type: 'checkbox', role: 'switch', checked: isOn(id), onchange: () => {
      setOn(id, sw.checked);
      H.toast(sw.checked ? `${d.name}: פעיל` : `${d.name}: כבוי`);
    } });
    const parts = [
      el('section', { class: 'card diet-card diet-top' },
        el('h2', {}, d.name, d.sub ? el('small', { class: 'muted' }, ` · ${d.sub}`) : null),
        el('label', { class: 'switch-row' }, sw, el('span', {}, d.time ? 'להפעיל את שעון הצום' : 'להפעיל: פאי קטן ליד כל מצרך בקניות וחותמת על מתכונים')),
        el('p', {}, d.about),
        el('ul', { class: 'diet-rules' }, d.rules.map((r) => el('li', {}, r))),
        d.note ? el('p', { class: 'diet-note muted small' }, d.note) : null),
    ];
    if (d.time) parts.push(fastCard());
    node.replaceChildren(...parts);
  }

  function fastCard() {
    const { el } = H;
    const p = prefs();
    const state = el('p', { class: 'fast-state', 'aria-live': 'polite' });
    const bar = el('progress', { max: '100', value: '0' });
    const box = el('section', { class: 'card diet-card fast-clock' }, el('h3', {}, 'חלון האכילה'), state, bar,
      el('div', { class: 'row' },
        el('label', { class: 'field' }, el('span', {}, 'שיטה'), el('select', { onchange: (e) => { H.savePrefs('diets', { fastHours: +e.target.value }); draw(); } },
          [[16, '16:8'], [14, '14:10'], [18, '18:6']].map(([v, t]) => el('option', { value: String(v), selected: +p.fastHours === v }, t)))),
        el('label', { class: 'field' }, el('span', {}, 'האכילה מתחילה ב-'), el('input', { type: 'time', value: p.fastStart || '12:00', onchange: (e) => { H.savePrefs('diets', { fastStart: e.target.value || '12:00' }); draw(); } }))));
    function draw() {
      const q = prefs();
      const w = windowAt(Date.now(), q.fastStart, 24 - (+q.fastHours || 16));
      state.textContent = w.open ? `🍽 אפשר לאכול עד ${hhmm(w.to)} (עוד ${dur(w.left)})` : `⏳ בצום. האכילה נפתחת ב-${hhmm(w.from + 864e5)} (עוד ${dur(w.left)})`;
      bar.value = w.pct;
      box.dataset.open = String(w.open);
    }
    draw();
    ticking = setInterval(() => { if (box.isConnected) draw(); else clearInterval(ticking); }, 30000);
    return box;
  }

  window.Diets = {
    all: DIETS,
    get: (id) => byId.get(id),
    isOn,
    setOn,
    /** the diets that judge food and are on, in order */
    foodDiets: () => DIETS.filter((d) => d.food && isOn(d.id)),
    mount,
    rules: { windowAt },
  };
})();
