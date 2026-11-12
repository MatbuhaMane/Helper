/* הקפדה – a personal plan: how much to eat (from the BMR, the day's activity and the goal), a dashboard that tracks it,
   and bodyweight (calisthenics) workouts with demo videos.
   - First run: sex, age, height, weight, activity and the goal → the BMR analysis and a recommended calorie balance.
   - After that: the dashboard on top (today's calories from the ketosis log, weight, the goal, the week's workouts),
     the workouts below.
   - One with the rest of the kitchen: the weight log and the meals are ketosis's own (same data); the daily target can be
     handed to ketosis; foods that fit the plan go to the shopping list in one tap.
   The person's choices (profile, plan, workouts done) are prefs, so they follow them to every device. */
(async () => {
  const { el, api, toast } = H;
  const r = await H.requireLogin();
  H.header('הקפדה');
  const P = H.prefs('hakpada', { profile: null, plan: null, done: [], level: 'beginner' });
  const save = () => H.savePrefs('hakpada');
  const root = document.querySelector('main');

  /* ===================== the numbers ===================== */
  const ACTIVITY = [
    [1.2, 'ישיבה רוב היום', 'עבודה מול מחשב, כמעט בלי פעילות'],
    [1.375, 'פעילות קלה', 'הליכות, או אימון 1–3 פעמים בשבוע'],
    [1.55, 'פעילות בינונית', 'אימון 3–5 פעמים בשבוע'],
    [1.725, 'פעילות גבוהה', 'אימון 6–7 פעמים בשבוע'],
    [1.9, 'פעילות גבוהה מאוד', 'עבודה פיזית ואימונים'],
  ];
  const PACE = { lose: [[0.25, 'בנחת'], [0.5, 'רגיל'], [0.75, 'מהר']], gain: [[0.15, 'בנחת'], [0.25, 'רגיל'], [0.4, 'מהר']] };
  /** Mifflin–St Jeor: resting burn (kcal/day). */
  const bmrOf = (p) => 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const bmiOf = (w, h) => w / (h / 100) ** 2;
  function plan(p) {
    const bmr = bmrOf(p), tdee = bmr * p.activity, bmi = bmiOf(p.weight, p.height);
    const h2 = (p.height / 100) ** 2;
    const healthy = [18.5 * h2, 24.9 * h2];
    let delta = 0, notes = [];
    if (p.goal === 'lose') {
      delta = -Math.round((p.pace * 7700) / 7);
      const cap = -Math.round(tdee * 0.25);
      if (delta < cap) { delta = cap; notes.push('הגבלתי את הגירעון ל־25% מההוצאה היומית, כדי לשמור על שריר ועל אנרגיה.'); }
    } else if (p.goal === 'gain') {
      delta = Math.round((p.pace * 7700) / 7);
      const cap = Math.round(tdee * 0.15);
      if (delta > cap) { delta = cap; notes.push('עלייה מהירה מדי מוסיפה בעיקר שומן; הגבלתי את העודף ל־15% מההוצאה היומית.'); }
    }
    let kcal = Math.round((tdee + delta) / 10) * 10;
    const floor = Math.max(Math.round(bmr), p.sex === 'm' ? 1500 : 1200);
    if (kcal < floor) { kcal = floor; notes.push('לא כדאי לאכול פחות מקצב השריפה במנוחה (BMR); קבעתי את היעד עליו – ההתקדמות תהיה מעט איטית יותר.'); }
    // protein: 1.6 g/kg (1.8 while losing or gaining); with a high BMI, by the weight at a BMI of 25
    const refW = bmi >= 30 ? 25 * h2 : p.weight;
    const protein = Math.round(refW * (p.goal === 'maintain' ? 1.6 : 1.8));
    const rate = (tdee - kcal) * 7 / 7700;   // kg a week (+ = losing)
    const weeks = p.target && Math.abs(rate) > 0.02 ? Math.abs(p.target - p.weight) / Math.abs(rate) : null;
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), bmi, healthy, kcal, delta: kcal - Math.round(tdee), protein, rate, weeks, notes };
  }
  const bmiWord = (b) => (b < 18.5 ? 'תת־משקל' : b < 25 ? 'משקל תקין' : b < 30 ? 'עודף משקל' : 'השמנה');
  /** What the numbers say, in a few sentences, before the person decides. */
  function advice(p, q) {
    const out = [];
    const range = `${Math.round(q.healthy[0])}–${Math.round(q.healthy[1])} ק״ג`;
    out.push(`ה־BMI שלך ${q.bmi.toFixed(1)} (${bmiWord(q.bmi)}). הטווח התקין לגובה שלך: ${range}.`);
    if (p.goal === 'lose' && q.bmi < 20) out.push('המשקל שלך כבר בצד הנמוך של התקין. כדאי לשקול שמירה על המשקל ובניית שריר במקום ירידה, ולהתייעץ עם רופא לפני גירעון.');
    if (p.goal === 'gain' && q.bmi >= 27) out.push('כדאי לשקול "עלייה בשריר" בלי עודף קלורי – אכילה בגובה ההוצאה, חלבון גבוה ואימוני כוח בונים שריר גם כך.');
    if (p.goal === 'maintain' && q.bmi >= 30) out.push('גם גירעון קטן (כ־300 קלוריות ביום) ישפר את המדדים בלי מאמץ גדול – אפשר לבחור "לרדת במשקל" בקצב "בנחת".');
    if (p.goal === 'maintain' && q.bmi < 18.5) out.push('המשקל שלך מתחת לטווח התקין. כדאי לשקול עודף קטן ובניית שריר, ולהתייעץ עם רופא.');
    return out.concat(q.notes);
  }

  /* ===================== the data: ketosis's meals and weight ===================== */
  let keto = { settings: null, meals: [], weights: [] };
  async function loadKeto() { try { keto = await api('/api/keto', { noRedirect: true }); } catch (_) { /* offline: the plan still shows */ } }
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const kcalOf = (m) => 9 * m.fat + 4 * m.protein + 4 * m.carbs;
  function today() {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const eaten = keto.meals.filter((m) => m.status === 'eaten' && m.at >= from.getTime());
    return { kcal: Math.round(eaten.reduce((s, m) => s + kcalOf(m), 0)), protein: Math.round(eaten.reduce((s, m) => s + m.protein, 0)), meals: eaten.length };
  }
  const weights = () => [...(keto.weights || [])].sort((a, b) => a.day.localeCompare(b.day));
  const currentWeight = () => weights().at(-1)?.kg || P.profile?.weight;

  /* ===================== first run: who, and what for ===================== */
  function wizard(edit) {
    const p = { sex: 'f', age: 35, height: 168, weight: 70, activity: 1.375, goal: 'lose', pace: 0.5, target: null, ...(P.profile || {}) };
    const field = (label, input, hint) => el('label', { class: 'hk-field' }, el('span', {}, label), input, hint ? el('small', {}, hint) : null);
    const numIn = (key, min, max, step = 1) => { const i = el('input', { type: 'number', inputmode: 'decimal', min, max, step, value: p[key] ?? '', required: true }); i.addEventListener('input', () => { p[key] = i.value === '' ? null : +i.value; draw(); }); return i; };
    const choice = (key, opts, cls = '') => el('div', { class: 'hk-choice ' + cls, role: 'radiogroup' }, opts.map(([v, label, sub]) => {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(p[key] === v), onclick: () => { p[key] = v; if (key === 'goal') p.pace = (PACE[v] || [[0]])[1]?.[0] ?? 0; paint(); draw(); } }, el('b', {}, label), sub ? el('small', {}, sub) : null);
      b.dataset.v = v; return b;
    }));
    const sexC = choice('sex', [['f', 'אישה'], ['m', 'גבר']], 'two');
    const actC = choice('activity', ACTIVITY.map(([v, l, s]) => [v, l, s]), 'list');
    const goalC = choice('goal', [['lose', 'לרדת במשקל'], ['maintain', 'לשמור על המשקל'], ['gain', 'לעלות במסת שריר']], 'three');
    const paceBox = el('div', {});
    const target = numIn('target', 30, 300, 0.5); target.required = false; target.placeholder = 'לא חובה';
    const result = el('div', { class: 'hk-result' });
    function paint() {
      for (const c of [sexC, actC, goalC]) c.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(String(p[c === sexC ? 'sex' : c === actC ? 'activity' : 'goal']) === b.dataset.v)));
      paceBox.replaceChildren(...(PACE[p.goal] ? [el('span', { class: 'hk-label' }, 'בקצב'), choice('pace', PACE[p.goal].map(([v, l]) => [v, l, `${p.goal === 'lose' ? '−' : '+'}${v} ק״ג בשבוע`]), 'three')] : []));
    }
    function draw() {
      if (!(p.age > 12 && p.height > 120 && p.weight > 30)) { result.replaceChildren(el('p', { class: 'muted' }, 'מלאו גובה, משקל וגיל כדי לראות את הניתוח.')); return; }
      const q = plan(p);
      result.replaceChildren(
        el('div', { class: 'hk-figs' },
          fig('BMR', q.bmr, 'קלוריות שהגוף שורף במנוחה'),
          fig('הוצאה יומית', q.tdee, 'עם הפעילות שלך (TDEE)'),
          fig('היעד שלך', q.kcal, q.delta === 0 ? 'שמירה' : q.delta < 0 ? `גירעון ${-q.delta}` : `עודף ${q.delta}`, true),
          fig('חלבון', q.protein + ' ג׳', 'ביום, לשמירה ובניית שריר')),
        el('ul', { class: 'hk-advice' }, advice(p, q).map((t) => el('li', {}, t))),
        q.weeks ? el('p', { class: 'hk-eta' }, `ביעד הזה מגיעים ל־${p.target} ק״ג בעוד כ־${Math.ceil(q.weeks)} שבועות (${q.rate > 0 ? '−' : '+'}${Math.abs(q.rate).toFixed(2)} ק״ג בשבוע).`) : null);
    }
    const fig = (k, v, sub, main) => el('div', { class: 'hk-fig' + (main ? ' main' : '') }, el('small', {}, k), el('b', {}, String(v)), el('span', {}, sub));
    paint();
    const form = el('form', { class: 'card hk-wizard' },
      el('h2', {}, edit ? 'עדכון הפרטים' : 'בואו נכיר'),
      el('p', { class: 'muted' }, 'כדי לחשב כמה לאכול צריך כמה פרטים. הם נשמרים בחשבון שלך בלבד.'),
      el('div', { class: 'hk-row' }, field('מין', sexC), field('גיל', numIn('age', 13, 100))),
      el('div', { class: 'hk-row' }, field('גובה (ס״מ)', numIn('height', 120, 230)), field('משקל (ק״ג)', numIn('weight', 30, 300, 0.1))),
      field('כמה פעילות יש ביום־יום', actC),
      field('המטרה', goalC), paceBox,
      el('div', { class: 'hk-row' }, field('משקל יעד (ק״ג)', target, 'אפשר להשאיר ריק')),
      el('h3', {}, 'הניתוח'), result,
      el('p', { class: 'hk-fine' }, 'החישוב לפי נוסחת Mifflin–St Jeor (סטייה טיפוסית של כ־10%). זו הערכה, לא ייעוץ רפואי – במחלה, בהריון או בתרופות, כדאי להתייעץ עם רופא או דיאטנית.'),
      el('div', { class: 'hk-acts' },
        edit ? el('button', { class: 'btn ghost', type: 'button', onclick: () => render() }, 'ביטול') : null,
        el('button', { class: 'btn primary', type: 'submit' }, edit ? 'לשמור' : 'להתחיל')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!(p.age > 12 && p.height > 120 && p.weight > 30)) return toast('חסרים גובה, משקל או גיל');
      P.profile = { ...p }; P.plan = plan(p); P.startedAt ||= Date.now(); save();
      // the first weight goes into the shared weight log (ketosis shows it too)
      if (!weights().some((w) => w.day === dayKey())) await api('/api/keto/weights', { method: 'PUT', body: { day: dayKey(), kg: p.weight } }).catch(() => {});
      await loadKeto();
      render();
      toast(edit ? 'הפרטים עודכנו' : 'התוכנית מוכנה');
    });
    draw();
    root.replaceChildren(el('div', { class: 'hk' }, form));
  }

  /* ===================== the dashboard ===================== */
  function ring(value, goal, label, sub) {
    const k = goal ? Math.min(1.25, value / goal) : 0, R = 44, C = 2 * Math.PI * R;
    const over = k > 1.02;
    const s = el('span', { class: 'hk-ring' + (over ? ' over' : ''), html: `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R}" class="bg"/><circle cx="50" cy="50" r="${R}" class="fg" stroke-dasharray="${(Math.min(1, k) * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/></svg>` });
    s.append(el('span', { class: 'in' }, el('b', {}, String(value)), el('small', {}, label)));
    return el('div', { class: 'hk-ringbox' }, s, el('p', {}, sub));
  }
  function chart(list, target) {
    if (list.length < 2) return el('p', { class: 'muted hk-nochart' }, list.length ? 'עוד כמה שקילות, והגרף יופיע כאן.' : 'עוד אין שקילות.');
    const pts = list.slice(-60), W = 320, Hh = 110, pad = 10;
    const ks = pts.map((w) => w.kg).concat(target ? [target] : []);
    const lo = Math.min(...ks) - 0.5, hi = Math.max(...ks) + 0.5;
    const t0 = new Date(pts[0].day).getTime(), t1 = new Date(pts.at(-1).day).getTime() || t0 + 1;
    const x = (d) => pad + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * pad);
    const y = (kg) => pad + (1 - (kg - lo) / (hi - lo)) * (Hh - 2 * pad);
    const line = pts.map((w, i) => `${i ? 'L' : 'M'}${x(w.day).toFixed(1)},${y(w.kg).toFixed(1)}`).join('');
    const area = `${line}L${x(pts.at(-1).day).toFixed(1)},${Hh}L${x(pts[0].day).toFixed(1)},${Hh}Z`;
    return el('span', { class: 'hk-chart', dir: 'ltr', html: `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-label="המשקל לאורך זמן">
      ${target ? `<line x1="0" x2="${W}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}" class="goal"/>` : ''}
      <path d="${area}" class="area"/><path d="${line}" class="line"/>
      <circle cx="${x(pts.at(-1).day).toFixed(1)}" cy="${y(pts.at(-1).kg).toFixed(1)}" r="4" class="dot"/></svg>` });
  }
  const weekDone = () => { const from = Date.now() - 7 * 864e5; return (P.done || []).filter((t) => t >= from).length; };

  function dashboard() {
    const p = P.profile, q = P.plan || plan(p);
    const t = today();
    const w = currentWeight(), start = p.weight, list = weights();
    const sessions = weekDone(), goalSessions = p.goal === 'gain' ? 3 : p.goal === 'lose' ? 3 : 2;
    // weight: today's entry
    const wIn = el('input', { type: 'number', step: 0.1, inputmode: 'decimal', placeholder: String(w || ''), 'aria-label': 'המשקל היום (ק״ג)' });
    const logW = async () => {
      const kg = +wIn.value; if (!(kg > 20 && kg < 400)) return toast('משקל לא תקין');
      await api('/api/keto/weights', { method: 'PUT', body: { day: dayKey(), kg } });
      await loadKeto(); render(); toast('נשמר – גם בקטוזיס');
    };
    wIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') logW(); });
    const toGoal = p.target ? Math.round((p.target - w) * 10) / 10 : null;
    const progress = p.target && start !== p.target ? Math.max(0, Math.min(1, (start - w) / (start - p.target))) : null;
    const ketoOn = keto.settings?.enabled;
    const ketoSynced = keto.settings && Math.abs(keto.settings.kcalTarget - q.kcal) < 15;

    return el('section', { class: 'hk-dash', 'aria-label': 'המעקב' },
      el('div', { class: 'hk-cards' },
        el('div', { class: 'card hk-card' },
          el('h3', {}, 'היום'),
          el('div', { class: 'hk-rings' },
            ring(t.kcal, q.kcal, 'קלוריות', t.kcal ? (t.kcal <= q.kcal ? `נשארו ${q.kcal - t.kcal}` : `${t.kcal - q.kcal} מעל היעד`) : `היעד: ${q.kcal}`),
            ring(t.protein, q.protein, 'ג׳ חלבון', `היעד: ${q.protein} ג׳`)),
          el('p', { class: 'hk-src' }, t.meals ? `לפי ${t.meals} ארוחות ביומן הקטוזיס.` : 'הארוחות נרשמות ביומן הקטוזיס.', ' ', el('a', { href: '/groceries/#keto' }, 'לרשום ארוחה ←'))),
        el('div', { class: 'card hk-card' },
          el('h3', {}, 'המשקל'),
          el('div', { class: 'hk-weight' }, el('b', {}, w ? `${w} ק״ג` : '—'),
            el('small', {}, start && w ? `${w - start <= 0 ? '' : '+'}${(Math.round((w - start) * 10) / 10)} ק״ג מההתחלה` : ''),
            toGoal != null ? el('small', {}, Math.abs(toGoal) < 0.2 ? 'הגעת ליעד! 🎉' : `עוד ${Math.abs(toGoal)} ק״ג ליעד`) : null),
          chart(list, p.target),
          progress != null ? el('div', { class: 'hk-bar', title: 'ההתקדמות ליעד' }, el('i', { style: `inline-size:${(progress * 100).toFixed(0)}%` })) : null,
          el('div', { class: 'hk-log' }, wIn, el('button', { class: 'btn small primary', type: 'button', onclick: logW }, 'לשקול היום'))),
        el('div', { class: 'card hk-card' },
          el('h3', {}, 'השבוע'),
          el('div', { class: 'hk-dots', 'aria-label': `${sessions} אימונים מתוך ${goalSessions}` }, Array.from({ length: Math.max(goalSessions, sessions) }, (_, i) => el('i', { class: i < sessions ? 'on' : '' }))),
          el('p', {}, sessions >= goalSessions ? 'עמדת ביעד האימונים של השבוע 💪' : `${sessions} מתוך ${goalSessions} אימוני כוח. ועוד 150 דקות הליכה מהירה בשבוע.`),
          el('h3', { class: 'hk-sub' }, 'התוכנית'),
          el('p', {}, `${q.kcal} קלוריות ביום (${q.delta === 0 ? 'שמירה' : q.delta < 0 ? 'גירעון ' + -q.delta : 'עודף ' + q.delta}), ${q.protein} ג׳ חלבון.`),
          el('div', { class: 'hk-acts' },
            keto.settings ? el('button', { class: 'btn small' + (ketoSynced ? ' ghost' : ''), type: 'button', disabled: ketoSynced, onclick: () => syncKeto(q) }, ketoSynced ? '✓ היעד מוגדר גם בקטוזיס' : 'להגדיר את היעד בקטוזיס') : null,
            el('button', { class: 'btn small ghost', type: 'button', onclick: () => shopping(p, ketoOn) }, 'מזונות לרשימת הקניות'),
            el('button', { class: 'btn small ghost', type: 'button', onclick: () => wizard(true) }, 'עדכון פרטים')))));
  }
  async function syncKeto(q) {
    try {
      await api('/api/keto/settings', { method: 'PUT', body: { ...keto.settings, kcalTarget: q.kcal } });
      await loadKeto(); render(); toast('היעד היומי בקטוזיס עודכן ל־' + q.kcal);
    } catch (_) { toast('לא הצלחתי לעדכן את הקטוזיס, נסו שוב'); }
  }

  /* ===================== foods that fit the plan → the shopping list ===================== */
  const FOODS = {
    protein: [['ביצים', 'dairy'], ['חזה עוף', 'meat'], ['יוגורט יווני', 'dairy'], ['קוטג׳', 'dairy'], ['טונה במים', 'pantry'], ['סלמון', 'meat']],
    plant: [['עדשים', 'dry'], ['חומוס יבש', 'dry'], ['טופו', 'other'], ['שיבולת שועל', 'dry']],
    keto: [['אבוקדו', 'veg'], ['שקדים', 'dry'], ['גבינה צהובה', 'dairy'], ['שמן זית', 'pantry'], ['ברוקולי', 'veg'], ['תרד', 'veg']],
    greens: [['ירקות לסלט', 'veg'], ['ברוקולי', 'veg'], ['תפוחים', 'veg'], ['גזר', 'veg']],
  };
  async function shopping(p, ketoOn) {
    const groups = [['חלבון', FOODS.protein], ...(ketoOn ? [['מתאים לקטו', FOODS.keto]] : [['חלבון מהצומח', FOODS.plant], ['ירקות ופירות', FOODS.greens]])];
    const picked = new Set();
    let have = new Set();
    try { const g = await api('/api/groceries', { noRedirect: true }); have = new Set((g.items || []).filter((i) => !i.deleted && !i.checked).map((i) => i.name)); } catch (_) { /* add anyway */ }
    const list = el('div', { class: 'hk-foods' }, groups.map(([title, foods]) => el('div', {}, el('h3', {}, title), el('div', { class: 'hk-chips' }, foods.map(([name, cat]) => {
      const on = !have.has(name);
      if (on) picked.add(name + '|' + cat);
      const b = el('button', { type: 'button', class: 'hk-chip', 'aria-pressed': String(on), disabled: !on, title: on ? '' : 'כבר ברשימה', onclick: () => {
        const k = name + '|' + cat; const now = !picked.has(k);
        now ? picked.add(k) : picked.delete(k); b.setAttribute('aria-pressed', String(now));
      } }, name, on ? null : ' ✓');
      return b;
    })))));
    H.modal(el('h2', {}, 'מזונות שמתאימים לתוכנית'), el('p', { class: 'muted' }, p.goal === 'gain' ? 'חלבון בכל ארוחה עוזר לבנות שריר.' : 'חלבון ומזונות משביעים עוזרים לעמוד ביעד בלי רעב.'), list,
      el('div', { class: 'hk-acts' }, el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        const ops = [...picked].map((k) => { const [name, cat] = k.split('|'); return { op: 'upsert', item: { id: 'hk' + Math.random().toString(36).slice(2, 10), name, cat, checked: false, qty: 1, from: 'הקפדה' } }; });
        if (!ops.length) return H.closeModal();
        await api('/api/groceries/ops', { body: { ops } });
        H.closeModal(); toast(`${ops.length} מזונות נוספו לרשימת הקניות`, 'לרשימה', () => { location.href = '/groceries/'; });
      } }, 'להוסיף לרשימת הקניות')));
  }

  /* ===================== the workouts: calisthenics, three times a week ===================== */
  // Each move: how to do it (in our words), what to watch, an easier and a harder step, and a demo video.
  const MOVES = {
    squat: { name: 'סקוואט', yt: 'P-yaD24bUE8', how: 'רגליים ברוחב הכתפיים, כפות מעט החוצה. יורדים כאילו מתיישבים על כיסא – הירכיים אחורה, החזה גבוה – עד שהירכיים מקבילות לרצפה, ועולים בדחיפה מכל כף הרגל.', watch: 'הברכיים בכיוון האצבעות, העקבים על הרצפה.', easier: 'סקוואט לכיסא', harder: 'סקוואט בולגרי (רגל אחורית על ספה)' },
    pushup: { name: 'שכיבות סמיכה', yt: 'I9fsqKE5XHo', how: 'ידיים מעט רחבות מהכתפיים, הגוף קרש ישר מהראש ועד העקבים. יורדים עד שהחזה כמעט נוגע ברצפה, המרפקים בזווית של כ־45° מהגוף, ודוחפים חזרה.', watch: 'לא לתת לאגן לצנוח; הבטן אסופה.', easier: 'שכיבות סמיכה על שולחן או קיר', harder: 'רגליים מוגבהות על כיסא' },
    incline: { name: 'שכיבות סמיכה בשיפוע', yt: '49jfZ_z7-us', how: 'אותה תנועה של שכיבת סמיכה, עם הידיים על שולחן, ספה או מדרגה. ככל שהמשטח נמוך יותר – התרגיל קשה יותר.', watch: 'גוף ישר כמו קרש לאורך כל התנועה.', easier: 'ידיים על קיר', harder: 'משטח נמוך יותר, ובסוף על הרצפה' },
    row: { name: 'חתירה הפוכה', yt: 'hXTc1mDnZCw', how: 'שוכבים מתחת לשולחן יציב (או מוט נמוך), אוחזים בקצה ומושכים את החזה אליו, הגוף ישר. יורדים לאט.', watch: 'למשוך את השכמות זו לזו; לא להרים את הכתפיים לאוזניים.', easier: 'ברכיים כפופות, או גוף זקוף יותר', harder: 'רגליים ישרות על כיסא' },
    bridge: { name: 'גשר ישבן', yt: 'wPM8icPu6H8', how: 'שוכבים על הגב, ברכיים כפופות וכפות הרגליים על הרצפה. מרימים את האגן עד קו ישר מהכתפיים לברכיים, מכווצים את הישבן לשנייה ויורדים.', watch: 'הדחיפה מהעקבים, לא מקשתים את הגב התחתון.', easier: 'טווח קטן יותר', harder: 'על רגל אחת' },
    lunge: { name: 'מכרעים לאחור', yt: 'b_2qgdXT_QQ', how: 'צעד גדול לאחור, יורדים עד ששתי הברכיים בכ־90°, ודוחפים מהרגל הקדמית חזרה לעמידה. מחליפים רגליים.', watch: 'הברך הקדמית מעל הקרסול, הגו זקוף.', easier: 'אחיזה בקיר או בכיסא', harder: 'מכרע בולגרי' },
    plank: { name: 'פלאנק', yt: 'xe2MXatLTUw', how: 'על האמות ועל קצות האצבעות, הגוף קו ישר. מכווצים בטן וישבן ונושמים רגיל.', watch: 'לא להרים את האגן גבוה ולא לתת לו לצנוח.', easier: 'על הברכיים', harder: 'פלאנק צד, או הרמת רגל' },
    deadbug: { name: 'חרק מת', yt: 'GbSC02oU3To', how: 'שוכבים על הגב, ידיים למעלה ורגליים ב־90°. מורידים לאט יד ורגל נגדיות לכיוון הרצפה, הגב התחתון צמוד לרצפה, וחוזרים. מחליפים צד.', watch: 'הגב התחתון לא מתרומם – זה כל התרגיל.', easier: 'רק רגליים', harder: 'לאט יותר, עם עצירה למטה' },
    dips: { name: 'מקבילים על כיסא', yt: 'O5esIqFBoRU', how: 'ידיים על שפת כיסא יציב מאחוריך, אצבעות קדימה. יורדים עד שהמרפקים בכ־90° ודוחפים למעלה.', watch: 'הכתפיים למטה והרחק מהאוזניים; לא לרדת עמוק מדי.', easier: 'ברכיים כפופות', harder: 'רגליים ישרות, או על מקבילים' },
    negative: { name: 'מתח שלילי', yt: 'IMvvF2PsIzM', how: 'קופצים או עולים על כיסא לנקודה העליונה של המתח (סנטר מעל המוט), ויורדים לאט ככל האפשר – 3 עד 5 שניות.', watch: 'ירידה מבוקרת עד יד ישרה; מנוחה בין חזרות.', easier: 'תלייה במוט 20–30 שניות', harder: 'מתח מלא' },
    hollow: { name: 'החזקת סירה (Hollow)', yt: 'uZqTUwq96iU', how: 'שוכבים על הגב, מרימים כתפיים ורגליים מעט מהרצפה, הגב התחתון צמוד לרצפה, ומחזיקים.', watch: 'אם הגב מתקשת – לכופף ברכיים.', easier: 'ברכיים כפופות, ידיים ליד הגוף', harder: 'ידיים מעל הראש, רגליים ישרות' },
  };
  const ROUTINES = {
    beginner: ['squat', 'incline', 'row', 'bridge', 'plank', 'deadbug'],
    intermediate: ['squat', 'pushup', 'row', 'lunge', 'dips', 'negative', 'hollow'],
  };
  function dose(p) {
    if (p.goal === 'lose') return { scheme: 'מעגל: 3 סבבים. 40 שניות עבודה, 20 שניות מנוחה בין תרגילים, 2 דקות בין סבבים.', reps: '40 שניות', why: 'מעגל שומר על הדופק גבוה, שורף יותר באותו זמן ושומר על השריר בזמן גירעון.' };
    if (p.goal === 'gain') return { scheme: '3 סטים של 8–12 חזרות לכל תרגיל, 90 שניות מנוחה. כשמגיעים ל־12 בכל הסטים – עוברים לגרסה הקשה יותר.', reps: '3×8–12', why: 'שריר נבנה מעומס שעולה בהדרגה: גרסה קשה יותר של אותו תרגיל היא ה"משקולת" של אימון גוף.' };
    return { scheme: '2–3 סטים של 10–15 חזרות לכל תרגיל, 60 שניות מנוחה.', reps: '2–3×10–15', why: 'שני אימוני כוח בשבוע שומרים על השריר ועל העצמות – זו ההמלצה של ארגון הבריאות העולמי.' };
  }
  function workouts() {
    const p = P.profile, d = dose(p);
    const level = P.level || 'beginner';
    const ids = ROUTINES[level];
    const lvl = el('div', { class: 'hk-choice two', role: 'radiogroup', 'aria-label': 'רמה' }, [['beginner', 'מתחילים'], ['intermediate', 'מתקדמים']].map(([v, l]) =>
      el('button', { type: 'button', role: 'radio', 'aria-checked': String(level === v), onclick: () => { P.level = v; save(); render(); } }, el('b', {}, l))));
    const doneToday = (P.done || []).some((t) => dayKey(new Date(t)) === dayKey());
    return el('section', { class: 'hk-train', 'aria-label': 'האימונים' },
      el('div', { class: 'hk-train-head' }, el('div', {}, el('h2', {}, 'האימון'), el('p', { class: 'muted' }, 'קליסטניקס – אימון במשקל הגוף, בבית, 3 פעמים בשבוע (יום כן, יום לא).')), lvl),
      el('div', { class: 'card hk-scheme' }, el('b', {}, d.scheme), el('p', {}, d.why), el('p', {}, 'לפני: 5 דקות חימום (הליכה במקום, סיבובי ידיים וכתפיים). אחרי: מתיחות קלות.')),
      el('div', { class: 'hk-moves' }, ids.map((id, i) => move(id, i + 1, d))),
      el('div', { class: 'hk-finish' },
        el('button', { class: 'btn primary', type: 'button', disabled: doneToday, onclick: () => { P.done = [...(P.done || []), Date.now()].slice(-200); save(); render(); toast('כל הכבוד! האימון נרשם 💪'); } }, doneToday ? '✓ האימון של היום נרשם' : 'סיימתי את האימון'),
        el('p', { class: 'hk-fine' }, 'על מה זה נשען: אימון במשקל הגוף עם התקדמות הדרגתית בונה כוח ושריר בדומה למשקולות קלות; ארגון הבריאות העולמי ממליץ על 150–300 דקות פעילות אירובית מתונה ועל אימוני כוח לפחות פעמיים בשבוע. כאב חד – עוצרים.')));
  }
  function move(id, n, d) {
    const m = MOVES[id];
    // the video loads only when asked (no ten players at once): a picture with a play button until then
    const video = el('button', { class: 'hk-video', type: 'button', 'aria-label': 'להפעיל סרטון הדגמה: ' + m.name, style: `background-image:url(https://i.ytimg.com/vi/${m.yt}/hqdefault.jpg)` }, el('span', { class: 'play', 'aria-hidden': 'true' }, '▶'));
    video.addEventListener('click', () => {
      video.replaceWith(el('iframe', { class: 'hk-video', src: `https://www.youtube-nocookie.com/embed/${m.yt}?autoplay=1&rel=0&playsinline=1`, title: 'הדגמה: ' + m.name, allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: '' }));
    });
    return el('article', { class: 'card hk-move' },
      video,
      el('div', { class: 'hk-move-text' },
        el('h3', {}, el('span', { class: 'n' }, n), m.name, el('small', {}, d.reps)),
        el('p', {}, m.how),
        el('p', { class: 'watch' }, '👀 ', m.watch),
        el('p', { class: 'steps' }, el('span', {}, 'קל יותר: ', m.easier), el('span', {}, 'קשה יותר: ', m.harder))));
  }

  /* ===================== go ===================== */
  function render() {
    if (!P.profile) return wizard(false);
    P.plan = plan({ ...P.profile, weight: currentWeight() || P.profile.weight });   // the plan follows the weight
    root.replaceChildren(el('div', { class: 'hk' },
      el('a', { class: 'folder-back', href: '/food/diet/' }, '‹ תנועה ותזונה'),
      el('h1', { class: 'hk-title' }, 'הקפדה'),
      dashboard(), workouts()));
  }
  await loadKeto();
  render();
  window.addEventListener('helper:prefs', (e) => { if (e.detail === 'hakpada') render(); });
})();
