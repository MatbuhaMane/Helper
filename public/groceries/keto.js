/* קטוזיס
 * - דשבורד: המצב של היום (פאי הקלוריות, פחמימות נטו מול היעד, יחס קטו), המלצה לפי הדיאטה, התקדמות 14 יום ומשקל
 * - יומן ארוחות שאכלנו (ותכנון ארוחות עתידיות) עם הערכים של כל אחת
 * - מחשבון ארוחה כמו באתר כפית: רכיבים בגרמים, שומן/חלבון/פחמימות/סיבים, קלוריות, יחס קטו ויחס נטו
 * - מתג קטוזיס: מוסיף ליד כל מצרך ברשימת הקניות את הערכים שלו ופאי קטן (לחיצה מגדילה)
 */
(() => {
  'use strict';
  const { el, api, toast, modal, closeModal } = H;
  const M = KetoMath;
  const CACHE = 'helper.keto.v1';
  const DRAFT = 'helper.keto.draft.v1';
  const NON_FOOD = new Set(['clean', 'care']);
  const DAY = 24 * 3600 * 1000;

  /* ================= מצב ================= */
  let state = { settings: { enabled: false, preset: 'standard', netCarbLimit: 20, kcalTarget: 1800, fatPct: 70, proteinPct: 25, carbPct: 5 }, meals: [], weights: [] };
  let foods = new Map(); // key -> food (server: estimates and the family's corrections)
  let loaded = false;
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (c) { state = { ...state, ...c.state }; foods = new Map(c.foods || []); }
  } catch (_) { /* ignore */ }
  const saveCache = () => { try { localStorage.setItem(CACHE, JSON.stringify({ state, foods: [...foods] })); } catch (_) { /* ignore */ } };
  const emit = (what) => window.dispatchEvent(new CustomEvent('keto:changed', { detail: what }));

  async function refresh() {
    try {
      const [s, f] = await Promise.all([api('/api/keto'), api('/api/keto/foods')]);
      state = s;
      foods = new Map(f.foods.map((x) => [x.key, x]));
      loaded = true;
      saveCache();
      emit('state');
    } catch (_) { /* offline: keep the cached copy */ }
  }
  const ready = refresh();

  /* ================= ערכי מזון ================= */
  function lookup(name) {
    const k = M.normalize(name);
    // The family's own correction, then the built-in table, then a stored estimate.
    const f = foods.get(k);
    if (f && f.source === 'user') return f;
    return M.builtin(name) || f || null;
  }

  const asking = new Set();
  let askTimer;
  /** Ask the server (once) for the values of foods we don't know yet; the list re-renders when they arrive. */
  function want(name) {
    if (asking.has(name)) return;
    asking.add(name);
    clearTimeout(askTimer);
    askTimer = setTimeout(() => estimate([...asking]).catch(() => {}), 400);
  }
  async function estimate(names) {
    names = names.filter((n) => !lookup(n));
    if (!names.length) return;
    try {
      const r = await api('/api/keto/foods/estimate', { body: { names } });
      for (const f of r.foods) if (f.source !== 'none') foods.set(f.key, f);
      saveCache();
      emit('foods');
    } finally {
      names.forEach((n) => asking.delete(n));
    }
  }

  async function correctFood(name, values) {
    const r = await api('/api/keto/foods', { method: 'PUT', body: { name, ...values } });
    foods.set(r.food.key, r.food);
    saveCache();
    emit('foods');
    return r.food;
  }

  /* ================= עזרים ================= */
  const fmt = M.fmt;
  const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayLabel = (key) => {
    const today = dayKey(Date.now());
    if (key === today) return 'היום';
    if (key === dayKey(Date.now() - DAY)) return 'אתמול';
    if (key === dayKey(Date.now() + DAY)) return 'מחר';
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const timeLabel = (ts) => new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const toLocalInput = (ts) => { const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const MACROS = [['fat', 'שומן'], ['protein', 'חלבון'], ['carbs', 'פחמימות']];

  function eatenOn(key) { return state.meals.filter((m) => m.status === 'eaten' && dayKey(m.at) === key); }

  /** Legend + numbers for a set of totals, beside a big pie. */
  function bigPie(t, size = 150) {
    const s = M.summarize(t);
    return el('div', { class: 'pie-block' },
      el('div', { class: 'pie-wrap', html: M.pieSvg(t, size, { ring: true }) }),
      el('ul', { class: 'legend' }, MACROS.map(([k, label]) =>
        el('li', {}, el('i', { class: 'dot m-' + k }), el('span', {}, label), el('b', {}, `${fmt(s[k])} ג׳`), el('small', {}, `${fmt(s.pct[k], 0)}%`))),
        el('li', { class: 'sub' }, el('i', { class: 'dot m-fiber' }), el('span', {}, 'סיבים'), el('b', {}, `${fmt(s.fiber)} ג׳`), el('small', {}, ''))));
  }

  function stat(label, value, extra) {
    return el('div', { class: 'stat' }, el('small', {}, label), el('b', {}, value), extra ? el('span', { class: 'muted' }, extra) : null);
  }

  /* ================= המלצה ================= */
  const SUGGEST = ['אגוזי מקדמיה', 'אבוקדו', 'זיתים', 'גבינת שמנת', 'בייקון', 'אגוזי פקאן', 'שמנת מתוקה', 'חמאה'];

  function recommendation(totals, planned) {
    const st = state.settings;
    const s = M.summarize(totals);
    const preset = M.presets[st.preset] || {};
    const lines = [];
    let level = 'ok';
    const left = st.netCarbLimit - s.net;
    if (!s.kcal) {
      return { level: 'empty', title: 'עוד לא נרשמו ארוחות היום', lines: [
        `היעד היומי: עד ${st.netCarbLimit} גרם פחמימות נטו, כ-${st.kcalTarget} קלוריות, ${st.fatPct}% מהן משומן.`,
        'אפשר להוסיף ארוחה במחשבון למטה, או לתכנן מראש את הארוחות של היום.',
      ] };
    }
    if (left < 0) {
      level = 'over';
      lines.push(`חרגתם ב-${fmt(-left)} גרם פחמימות נטו מהיעד (${st.netCarbLimit} ג׳). כדי לחזור לקטוזיס: לא עוד פחמימות היום, ארוחה הבאה של שומן וחלבון בלבד, ושתייה מרובה.`);
    } else {
      lines.push(`נשארו ${fmt(left)} גרם פחמימות נטו להיום (מתוך ${st.netCarbLimit}).`);
      if (left < st.netCarbLimit * 0.2) { level = 'warn'; lines.push('קרובים לגבול: עדיף ירקות עליים, ביצים, גבינות ושומנים להמשך היום.'); }
    }
    if (preset.ratio) {
      if (s.netRatio < preset.ratio - 0.3) { level = level === 'over' ? 'over' : 'warn'; lines.push(`היחס הקטוגני היום ${M.fmtRatio(s.netRatio)} – נמוך מהיעד ${preset.ratio}:1. הוסיפו שומן או הפחיתו חלבון ופחמימות.`); }
      else lines.push(`היחס הקטוגני היום ${M.fmtRatio(s.netRatio)} – לפי היעד (${preset.ratio}:1).`);
    } else if (s.kcal > 250) {
      if (s.pct.fat < st.fatPct - 8) {
        level = level === 'over' ? 'over' : 'warn';
        const kcalLeft = Math.max(st.kcalTarget - s.kcal, 200);
        const fatNeed = Math.max(0, (st.fatPct / 100) * (s.kcal + kcalLeft) / 9 - s.fat);
        const ideas = SUGGEST.map((n) => [n, M.builtin(n)]).filter(([, f]) => f && f.carbs - f.fiber < 6).slice(0, 3).map(([n, f]) => {
          const g = Math.max(10, Math.min(80, Math.round((fatNeed / 2) / (f.fat / 100) / 5) * 5));
          return `${g} ג׳ ${n}`;
        });
        lines.push(`השומן נמוך: ${fmt(s.pct.fat, 0)}% מהקלוריות (היעד ${st.fatPct}%). כדאי להוסיף כ-${fmt(fatNeed, 0)} גרם שומן${ideas.length ? `, למשל ${ideas.join(' / ')}` : ''}.`);
      }
      if (s.pct.protein > st.proteinPct + 10) { level = level === 'over' ? 'over' : 'warn'; lines.push(`הרבה חלבון: ${fmt(s.pct.protein, 0)}% מהקלוריות (היעד ${st.proteinPct}%). עודף חלבון עלול להאט כניסה לקטוזיס – העדיפו נתחים שמנים יותר.`); }
    }
    const kcalLeft = st.kcalTarget - s.kcal;
    if (kcalLeft > 150) lines.push(`נשארו כ-${fmt(kcalLeft, 0)} קלוריות: בערך ${fmt((st.fatPct / 100) * kcalLeft / 9, 0)} ג׳ שומן ו-${fmt((st.proteinPct / 100) * kcalLeft / 4, 0)} ג׳ חלבון.`);
    else if (kcalLeft < -200) lines.push(`עברתם את יעד הקלוריות ב-${fmt(-kcalLeft, 0)}.`);
    if (planned) {
      const p = M.summarize(M.sum([totals, planned]));
      lines.push(`עם הארוחות המתוכננות להיום: ${fmt(p.net)} ג׳ פחמימות נטו ו-${fmt(p.kcal, 0)} קלוריות${p.net > st.netCarbLimit ? ' – זה מעל היעד, כדאי לשנות את התכנון' : ''}.`);
    }
    const title = level === 'over' ? 'מחוץ לטווח הקטוזיס היום' : level === 'warn' ? 'במסלול, עם כמה תיקונים' : 'במסלול קטוזיס 👍';
    return { level, title, lines };
  }

  /* ================= התקדמות ================= */
  function progressCard() {
    const st = state.settings;
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const key = dayKey(Date.now() - i * DAY);
      const meals = eatenOn(key);
      days.push({ key, logged: meals.length > 0, s: M.summarize(M.sum(meals)) });
    }
    const logged = days.filter((d) => d.logged);
    const inRange = logged.filter((d) => d.s.net <= st.netCarbLimit);
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      if (i === days.length - 1 && !d.logged) continue; // today may not be logged yet
      if (d.logged && d.s.net <= st.netCarbLimit) streak++; else break;
    }
    const last7 = logged.filter((d) => d.key >= dayKey(Date.now() - 6 * DAY));
    const avg = (arr, f) => (arr.length ? arr.reduce((s, d) => s + f(d), 0) / arr.length : 0);

    // bars: net carbs per day against the limit
    const W = 320, H = 120, pad = 18, bw = (W - pad) / days.length;
    const max = Math.max(st.netCarbLimit * 1.6, ...days.map((d) => d.s.net), 1);
    const y = (v) => H - pad - (v / max) * (H - pad - 6);
    const bars = days.map((d, i) => {
      const x = pad + i * bw + 3;
      if (!d.logged) return `<rect x="${x}" y="${H - pad - 2}" width="${bw - 6}" height="2" class="bar-empty"/>`;
      const cls = d.s.net <= st.netCarbLimit ? 'bar-ok' : 'bar-over';
      return `<rect x="${x}" y="${y(d.s.net)}" width="${bw - 6}" height="${H - pad - y(d.s.net)}" rx="2" class="${cls}"><title>${dayLabel(d.key)}: ${fmt(d.s.net)} ג׳ פחמימות נטו</title></rect>`;
    }).join('');
    const ticks = days.map((d, i) => (i % 2 === days.length % 2 ? `<text x="${pad + i * bw + bw / 2}" y="${H - 4}" class="tick">${Number(d.key.slice(8))}</text>` : '')).join('');
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="פחמימות נטו ב-14 הימים האחרונים">
      ${bars}<line x1="${pad}" x2="${W}" y1="${y(st.netCarbLimit)}" y2="${y(st.netCarbLimit)}" class="limit"/>
      <text x="${pad - 2}" y="${y(st.netCarbLimit) - 3}" class="tick" text-anchor="start">יעד ${st.netCarbLimit}</text>${ticks}</svg>`;

    return el('section', { class: 'card keto-card', id: 'ketoProgress' },
      el('h2', {}, 'ההתקדמות שלנו'),
      el('div', { class: 'stats' },
        stat('ימים ברצף בטווח', String(streak), streak ? '🔥' : ''),
        stat('ימים בטווח (14 יום)', `${inRange.length}/${logged.length || 0}`),
        stat('ממוצע נטו, 7 ימים', last7.length ? `${fmt(avg(last7, (d) => d.s.net))} ג׳` : '—'),
        stat('יחס קטו ממוצע', last7.length ? M.fmtRatio(avg(last7, (d) => (Number.isFinite(d.s.netRatio) ? d.s.netRatio : 0))) : '—')),
      el('div', { class: 'chart-box', html: svg }),
      weightBlock());
  }

  function weightBlock() {
    const ws = [...state.weights].sort((a, b) => a.day.localeCompare(b.day)).slice(-60);
    const input = el('input', { type: 'number', step: '0.1', min: '20', max: '400', inputmode: 'decimal', placeholder: 'ק״ג', 'aria-label': 'המשקל היום' });
    const todayW = ws.find((w) => w.day === dayKey(Date.now()));
    if (todayW) input.value = todayW.kg;
    const save = el('button', { class: 'btn small ghost', onclick: async () => {
      const kg = Number(input.value);
      if (!(kg > 20 && kg < 400)) return toast('הכניסו משקל בק״ג');
      await api('/api/keto/weights', { method: 'PUT', body: { day: dayKey(Date.now()), kg } });
      state.weights = [{ day: dayKey(Date.now()), kg }, ...state.weights.filter((w) => w.day !== dayKey(Date.now()))];
      saveCache();
      render();
      toast('המשקל נשמר');
    } }, 'שמירה');
    let chart = null;
    if (ws.length >= 2) {
      const W = 320, H = 80, min = Math.min(...ws.map((w) => w.kg)) - 0.5, max = Math.max(...ws.map((w) => w.kg)) + 0.5;
      const t0 = new Date(ws[0].day).getTime(), t1 = new Date(ws[ws.length - 1].day).getTime() || t0 + 1;
      const pts = ws.map((w) => `${8 + ((new Date(w.day).getTime() - t0) / (t1 - t0 || 1)) * (W - 16)},${H - 8 - ((w.kg - min) / (max - min)) * (H - 16)}`).join(' ');
      chart = el('div', { class: 'chart-box', html: `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="משקל"><polyline points="${pts}" class="wline"/>${ws.map((w, i) => `<circle cx="${pts.split(' ')[i].split(',')[0]}" cy="${pts.split(' ')[i].split(',')[1]}" r="2.5" class="wdot"><title>${w.day}: ${w.kg} ק״ג</title></circle>`).join('')}</svg>` });
    }
    const change = ws.length >= 2 ? ws[ws.length - 1].kg - ws[0].kg : 0;
    return el('div', { class: 'weight' },
      el('div', { class: 'row' }, el('b', {}, 'משקל'), input, save,
        ws.length >= 2 ? el('span', { class: change <= 0 ? 'good' : 'muted' }, `${change <= 0 ? '▼' : '▲'} ${fmt(Math.abs(change))} ק״ג מאז ${new Date(ws[0].day).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}`) : null),
      chart);
  }

  /* ================= יומן ארוחות ================= */
  function mealRow(m) {
    const s = M.summarize(m);
    return el('li', { class: 'meal' + (m.status === 'planned' ? ' planned' : '') },
      el('button', { class: 'pie-btn', 'aria-label': `פירוט ${m.name}`, onclick: () => showTotals(m.name, m, m.items), html: M.pieSvg(m, 30) }),
      el('div', { class: 'meal-main' },
        el('div', {}, el('b', {}, m.name), el('small', { class: 'muted' }, ` · ${timeLabel(m.at)}`)),
        el('small', { class: 'macros-line' }, `נטו ${fmt(s.net)} · שומן ${fmt(s.fat)} · חלבון ${fmt(s.protein)} · פחמ׳ ${fmt(s.carbs)} · סיבים ${fmt(s.fiber)} · ${fmt(s.kcal, 0)} קק״ל · ${M.fmtRatio(s.netRatio)}`)),
      el('div', { class: 'meal-actions' },
        m.status === 'planned' ? el('button', { class: 'btn small primary', title: 'סמנו שאכלתם', onclick: () => saveMeal({ ...m, status: 'eaten', at: m.at > Date.now() ? Date.now() : m.at }, m.id).then(() => toast(`"${m.name}" נרשם ביומן`)) }, '✓ אכלנו') : null,
        el('button', { class: 'mini', title: 'עריכה במחשבון', 'aria-label': `ערוך ${m.name}`, onclick: () => loadIntoCalc(m) }, '✎'),
        el('button', { class: 'mini', title: 'שוב היום', 'aria-label': `הוסף שוב את ${m.name}`, onclick: () => saveMeal({ ...m, at: Date.now(), status: 'eaten' }).then(() => toast(`"${m.name}" נוסף להיום`)) }, '⟳'),
        el('button', { class: 'mini danger', title: 'מחיקה', 'aria-label': `מחק ${m.name}`, onclick: async () => {
          await api('/api/keto/meals/' + m.id, { method: 'DELETE' });
          state.meals = state.meals.filter((x) => x.id !== m.id);
          saveCache();
          render();
          toast(`"${m.name}" נמחק`, 'בטל', () => saveMeal(m, m.id));
        } }, '✕')));
  }

  function logCard() {
    const planned = state.meals.filter((m) => m.status === 'planned').sort((a, b) => a.at - b.at);
    const eaten = state.meals.filter((m) => m.status === 'eaten').sort((a, b) => b.at - a.at);
    const groups = new Map();
    for (const m of eaten) { const k = dayKey(m.at); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
    const keys = [...groups.keys()];
    let showAll = false;
    const box = el('div');
    const draw = () => {
      box.textContent = '';
      for (const k of keys.slice(0, showAll ? 60 : 4)) {
        const s = M.summarize(M.sum(groups.get(k)));
        box.append(el('h3', { class: 'day-head' }, el('span', {}, dayLabel(k)),
          el('small', { class: s.net <= state.settings.netCarbLimit ? 'good' : 'bad' }, `נטו ${fmt(s.net)} ג׳ · ${fmt(s.kcal, 0)} קק״ל · ${M.fmtRatio(s.netRatio)}`)),
          el('ul', { class: 'meals' }, groups.get(k).map(mealRow)));
      }
      if (keys.length > 4 && !showAll) box.append(el('button', { class: 'btn ghost small', onclick: () => { showAll = true; draw(); } }, `הצג עוד ${keys.length - 4} ימים`));
    };
    draw();
    return el('section', { class: 'card keto-card', id: 'ketoLog' },
      el('h2', {}, 'יומן הארוחות'),
      planned.length ? [el('h3', { class: 'day-head' }, el('span', {}, '🗓 מתוכננות')), el('ul', { class: 'meals' }, planned.map((m) => {
        const li = mealRow(m);
        li.querySelector('.muted').textContent = ` · ${dayLabel(dayKey(m.at))} ${timeLabel(m.at)}`;
        return li;
      }))] : null,
      keys.length ? box : el('p', { class: 'muted' }, 'היומן ריק. ארוחה שתוסיפו במחשבון תופיע כאן עם הערכים שלה.'));
  }

  async function saveMeal(m, id) {
    const payload = { at: m.at, name: m.name, status: m.status, items: m.items.map((i) => ({ name: i.name, grams: i.grams, fat: i.fat, protein: i.protein, carbs: i.carbs, fiber: i.fiber })) };
    const r = await api(id ? '/api/keto/meals/' + id : '/api/keto/meals', { method: id ? 'PUT' : 'POST', body: payload });
    state.meals = [r.meal, ...state.meals.filter((x) => x.id !== r.meal.id)];
    saveCache();
    render();
    return r.meal;
  }

  /** The big pie and the numbers for one meal or one food. */
  function showTotals(title, t, items, extra) {
    const s = M.summarize(t);
    modal(
      el('h3', {}, title),
      bigPie(t, 190),
      el('div', { class: 'stats' },
        stat('קלוריות', fmt(s.kcal, 0)), stat('פחמימות נטו', `${fmt(s.net)} ג׳`),
        stat('יחס קטו', M.fmtRatio(s.ratio)), stat('יחס קטו נטו', M.fmtRatio(s.netRatio))),
      items && items.length ? el('table', { class: 'calc-table' },
        el('thead', {}, el('tr', {}, ['רכיב', 'גרם', 'פחמ׳', 'סיבים', 'חלבון', 'שומן'].map((h) => el('th', {}, h)))),
        el('tbody', {}, items.map((i) => el('tr', {}, el('td', {}, i.name), el('td', {}, fmt(i.grams, 0)), el('td', {}, fmt(i.carbs)), el('td', {}, fmt(i.fiber)), el('td', {}, fmt(i.protein)), el('td', {}, fmt(i.fat)))))) : null,
      extra || null);
  }

  /** A food from the shopping list or the calculator: values per 100 g, and a way to correct them from the label. */
  function showFood(name, food, verdict) {
    // (Open Food Facts is ODbL: its values say where they came from)
    const src = { builtin: 'מטבלת הערכים המובנית', ai: 'הערכה של העוזר החכם', user: 'ערכים שתיקנו אצלנו', off: 'מתוויות המוצרים ב־Open Food Facts' }[food.source] || '';
    showTotals(`${name} · ל-100 גרם`, food, null, el('div', {},
      verdict ? el('p', { class: 'diet-verdict' }, verdict) : null,
      el('p', { class: 'muted' }, [src, food.unit_g ? `יחידה אחת ≈ ${fmt(food.unit_g, 0)} גרם` : ''].filter(Boolean).join(' · ')),
      el('div', { class: 'row' },
        el('button', { class: 'btn ghost small', onclick: () => editFoodValues(name, food) }, '✎ תיקון לפי התווית'),
        el('button', { class: 'btn primary small', onclick: () => { closeModal(); addToCalc(name, food.unit_g ? food.unit_g : 100); H.showTab?.('keto'); setTimeout(() => document.getElementById('ketoCalc')?.scrollIntoView({ behavior: 'smooth' }), 60); } }, '➕ למחשבון'))));
  }

  function editFoodValues(name, food, after) {
    const f = (k, label) => el('label', { class: 'field' }, el('span', {}, label), el('input', { type: 'number', step: '0.1', min: '0', name: k, value: food[k] ?? 0, inputmode: 'decimal' }));
    const form = el('form', { class: 'food-form' },
      el('h3', {}, `ערכים ל-100 גרם: ${name}`),
      el('div', { class: 'grid4' }, f('fat', 'שומן'), f('protein', 'חלבון'), f('carbs', 'פחמימות (כולל סיבים)'), f('fiber', 'סיבים')),
      el('label', { class: 'field' }, el('span', {}, 'משקל יחידה אחת בגרם (לא חובה)'), el('input', { type: 'number', step: '1', min: '0', name: 'unit_g', value: food.unit_g || '' })),
      el('button', { class: 'btn primary', type: 'submit' }, '💾 שמירה'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(['fat', 'protein', 'carbs', 'fiber', 'unit_g'].map((k) => [k, Number(form.elements[k].value) || 0]));
      if (v.fiber > v.carbs) return toast('הסיבים כלולים בפחמימות, ולכן לא יכולים להיות יותר מהן');
      const saved = await correctFood(name, { ...v, unit_g: v.unit_g || null });
      toast('הערכים עודכנו');
      if (after) after(saved); else showFood(name, saved);
    });
    modal(form);
  }

  /* ================= מחשבון ================= */
  let calc = loadDraft();
  function loadDraft() {
    try { const d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); if (d && Array.isArray(d.rows)) return d; } catch (_) { /* ignore */ }
    return { id: null, name: '', at: null, rows: [] };
  }
  const saveDraft = () => { try { localStorage.setItem(DRAFT, JSON.stringify(calc)); } catch (_) { /* ignore */ } };

  function rowValues(r) { return { name: r.name, grams: r.grams, ...M.scale(r.food, r.grams) }; }

  async function addToCalc(name, grams) {
    name = name.trim();
    if (!name) return;
    let food = lookup(name);
    if (!food) {
      toast(`מחפש ערכים ל"${name}"…`);
      try { await estimate([name]); } catch (e) { return toast(e.message); }
      food = lookup(name);
      if (!food) return toast(`לא מצאתי ערכים ל"${name}" – אפשר להזין אותם ידנית`, 'הזנה', () => editFoodValues(name, { fat: 0, protein: 0, carbs: 0, fiber: 0 }, (f) => { calc.rows.push({ name, grams, food: f }); saveDraft(); closeModal(); render(); }));
      if (!food.is_food) return toast(`"${name}" לא נראה כמו מזון`);
    }
    calc.rows.push({ name, grams, food: { fat: food.fat, protein: food.protein, carbs: food.carbs, fiber: food.fiber, unit_g: food.unit_g, source: food.source } });
    saveDraft();
    render();
  }

  function loadIntoCalc(m) {
    calc = {
      id: m.id, name: m.name, at: m.at, status: m.status,
      rows: m.items.map((i) => ({ name: i.name, grams: i.grams, food: i.grams ? { fat: i.fat * 100 / i.grams, protein: i.protein * 100 / i.grams, carbs: i.carbs * 100 / i.grams, fiber: i.fiber * 100 / i.grams } : { fat: 0, protein: 0, carbs: 0, fiber: 0 } })),
    };
    saveDraft();
    render();
    setTimeout(() => document.getElementById('ketoCalc')?.scrollIntoView({ behavior: 'smooth' }), 60);
  }

  function calcCard() {
    const names = [...new Set([...M.foods.map((f) => f.n), ...[...foods.values()].filter((f) => f.is_food).map((f) => f.name)])].sort((a, b) => a.localeCompare(b, 'he'));
    const dl = el('datalist', { id: 'ketoFoodList' }, names.map((n) => el('option', { value: n })));
    const nameIn = el('input', { type: 'text', list: 'ketoFoodList', placeholder: 'רכיב (למשל: ביצה, אבוקדו, חזה עוף)', 'aria-label': 'רכיב', autocomplete: 'off' });
    const amount = el('input', { type: 'number', min: '0', step: '1', value: '100', inputmode: 'decimal', 'aria-label': 'כמות', class: 'amount' });
    const unit = el('select', { 'aria-label': 'יחידה' }, el('option', { value: 'g' }, 'גרם'), el('option', { value: 'u' }, 'יחידות'));
    nameIn.addEventListener('change', () => {
      const f = lookup(nameIn.value);
      unit.querySelector('[value="u"]').disabled = !(f && f.unit_g);
      if (f && f.unit_g && unit.value === 'g' && amount.value === '100') { unit.value = 'u'; amount.value = '1'; }
      if ((!f || !f.unit_g) && unit.value === 'u') { unit.value = 'g'; amount.value = '100'; }
    });
    const add = async (e) => {
      e.preventDefault();
      const n = nameIn.value.trim();
      const a = Number(amount.value);
      if (!n || !(a > 0)) return toast('בחרו רכיב וכמות');
      let grams = a;
      if (unit.value === 'u') {
        const f = lookup(n);
        if (!f?.unit_g) return toast('לרכיב הזה אין משקל יחידה – הזינו גרמים');
        grams = a * f.unit_g;
      }
      nameIn.value = '';
      amount.value = '100';
      unit.value = 'g';
      await addToCalc(n, Math.round(grams * 10) / 10);
      document.querySelector('#ketoCalc input[list]')?.focus();
    };
    const form = el('form', { class: 'calc-add', onsubmit: add }, nameIn, amount, unit, el('button', { class: 'btn primary', type: 'submit' }, 'הוסף רכיב'));

    const rows = calc.rows.map(rowValues);
    const t = M.sum(rows);
    const s = M.summarize(t);
    const table = el('table', { class: 'calc-table' },
      el('thead', {}, el('tr', {}, ['רכיב', 'גרם', 'פחמ׳', 'סיבים', 'חלבון', 'שומן', ''].map((h) => el('th', {}, h)))),
      el('tbody', {}, rows.map((r, i) => {
        const g = el('input', { type: 'number', min: '0', step: '1', value: r.grams, class: 'grams', 'aria-label': `גרמים של ${r.name}`, onchange: () => { calc.rows[i].grams = Math.max(0, Number(g.value) || 0); saveDraft(); render(); } });
        return el('tr', {},
          el('td', {}, el('button', { class: 'link', title: 'הערכים ל-100 גרם', onclick: () => editFoodValues(r.name, calc.rows[i].food, (f) => { calc.rows[i].food = f; saveDraft(); closeModal(); render(); }) }, r.name)),
          el('td', {}, g), el('td', {}, fmt(r.carbs)), el('td', {}, fmt(r.fiber)), el('td', {}, fmt(r.protein)), el('td', {}, fmt(r.fat)),
          el('td', {}, el('button', { class: 'mini danger', 'aria-label': `הסר ${r.name}`, onclick: () => { calc.rows.splice(i, 1); saveDraft(); render(); } }, '✕')));
      })),
      rows.length ? el('tfoot', {}, el('tr', {}, el('th', {}, 'סה״כ'), el('th', {}, fmt(rows.reduce((a, r) => a + r.grams, 0), 0)), el('th', {}, fmt(s.carbs)), el('th', {}, fmt(s.fiber)), el('th', {}, fmt(s.protein)), el('th', {}, fmt(s.fat)), el('th', {}))) : null);

    const mealName = el('input', { type: 'text', value: calc.name || '', placeholder: 'שם הארוחה (למשל: ארוחת בוקר)', 'aria-label': 'שם הארוחה', oninput: () => { calc.name = mealName.value; saveDraft(); } });
    const when = el('input', { type: 'datetime-local', value: toLocalInput(calc.at || Date.now()), 'aria-label': 'מתי', onchange: () => { calc.at = new Date(when.value).getTime(); saveDraft(); } });
    const store = async (status) => {
      if (!calc.rows.length) return toast('הוסיפו לפחות רכיב אחד');
      const at = when.value ? new Date(when.value).getTime() : Date.now();
      const name = mealName.value.trim() || (status === 'planned' ? 'ארוחה מתוכננת' : `ארוחה ${timeLabel(at)}`);
      const meal = await saveMeal({ at, name, status, items: rows }, calc.id || undefined);
      toast(status === 'planned' ? `"${meal.name}" נשמרה בתכנון` : `"${meal.name}" נרשמה ביומן`);
      calc = { id: null, name: '', at: null, rows: [] };
      saveDraft();
      render();
    };

    return el('section', { class: 'card keto-card', id: 'ketoCalc' },
      el('h2', {}, calc.id ? 'עריכת ארוחה' : 'מחשבון ארוחה'),
      el('p', { class: 'muted' }, 'הוסיפו רכיבים בגרמים (או ביחידות), כמו במחשבון של כפית. הערכים מחושבים לכל רכיב ולכל הארוחה. לחיצה על שם רכיב מאפשרת לתקן את הערכים שלו לפי התווית.'),
      dl, form,
      rows.length ? table : el('p', { class: 'empty' }, 'עוד אין רכיבים.'),
      rows.length ? el('div', { class: 'calc-summary' },
        bigPie(t, 130),
        el('div', { class: 'stats' },
          stat('גרם שומן', fmt(s.fat)), stat('גרם חלבון', fmt(s.protein)), stat('גרם פחמימות', fmt(s.carbs)), stat('גרם סיבים', fmt(s.fiber)),
          stat('קלוריות', fmt(s.kcal, 0)), stat('יחס קטו', M.fmtRatio(s.ratio)), stat('יחס קטו נטו', M.fmtRatio(s.netRatio)), stat('פחמימות נטו', fmt(s.net)))) : null,
      el('div', { class: 'row calc-save' }, mealName, when),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', onclick: () => store('eaten') }, calc.id ? '💾 שמירת השינויים' : '🍽 אכלנו – הוסף ליומן'),
        el('button', { class: 'btn ghost', onclick: () => store('planned') }, '🗓 שמור כתכנון'),
        rows.length || calc.id ? el('button', { class: 'btn ghost', onclick: () => { calc = { id: null, name: '', at: null, rows: [] }; saveDraft(); render(); } }, 'ניקוי') : null));
  }

  /* ================= הגדרות ומתג ================= */
  async function putSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    saveCache();
    emit('settings');
    render();
    try { await api('/api/keto/settings', { method: 'PUT', body: state.settings }); } catch (e) { toast(e.message); }
  }

  function toggleCard() {
    const sw = el('input', { type: 'checkbox', role: 'switch', checked: !!state.settings.enabled, 'aria-describedby': 'ketoSwHint', onchange: () => {
      putSettings({ enabled: sw.checked });
      toast(sw.checked ? 'מצב קטוזיס פעיל: ליד כל מצרך ברשימה מופיעים הערכים שלו' : 'מצב קטוזיס כבוי');
    } });
    const preset = el('select', { 'aria-label': 'סוג הדיאטה', onchange: () => {
      const p = M.presets[preset.value];
      putSettings({ preset: preset.value, netCarbLimit: p.netCarbLimit, fatPct: p.fatPct, proteinPct: p.proteinPct, carbPct: p.carbPct });
    } }, Object.entries(M.presets).map(([k, p]) => el('option', { value: k, selected: k === state.settings.preset }, p.label)));
    const num = (key, label, step) => {
      const i = el('input', { type: 'number', min: '0', step, value: state.settings[key], inputmode: 'decimal', onchange: () => putSettings({ [key]: Number(i.value) || 0 }) });
      return el('label', { class: 'field' }, el('span', {}, label), i);
    };
    return el('section', { class: 'card keto-card keto-top' },
      el('label', { class: 'switch' }, sw, el('span', { class: 'slider', 'aria-hidden': 'true' }), el('b', {}, 'מתג קטוזיס')),
      el('p', { class: 'muted', id: 'ketoSwHint' }, 'כשהמתג פעיל, ליד כל מצרך ברשימת הקניות מופיעים שומן, חלבון, פחמימות וסיבים (ל-100 גרם) ופאי קטן. לחיצה על הפאי מגדילה אותו.'),
      el('details', { class: 'settings' }, el('summary', {}, `הדיאטה שלנו: ${(M.presets[state.settings.preset] || {}).label || 'מותאם'} · עד ${state.settings.netCarbLimit} ג׳ נטו · ${state.settings.kcalTarget} קק״ל`),
        el('div', { class: 'grid4' },
          el('label', { class: 'field' }, el('span', {}, 'סוג הדיאטה'), preset),
          num('netCarbLimit', 'פחמימות נטו ליום (ג׳)', '1'), num('kcalTarget', 'קלוריות ליום', '50'), num('fatPct', '% קלוריות משומן', '1'),
          num('proteinPct', '% קלוריות מחלבון', '1'), num('carbPct', '% קלוריות מפחמימות', '1')),
        el('p', { class: 'muted' }, 'היעדים הם הנחיה כללית ולא ייעוץ רפואי. בקטו טיפולי, או עם תרופות לסוכרת או ללחץ דם – רק בליווי רופא או דיאטנית.')));
  }

  /* ================= הדשבורד ================= */
  function todayCard() {
    const today = dayKey(Date.now());
    const meals = eatenOn(today);
    const t = M.sum(meals);
    const s = M.summarize(t);
    const plannedToday = state.meals.filter((m) => m.status === 'planned' && dayKey(m.at) === today);
    const rec = recommendation(t, plannedToday.length ? M.sum(plannedToday) : null);
    const st = state.settings;
    const pctOf = (v, max) => Math.min(100, max ? (v / max) * 100 : 0);
    const bar = (label, v, max, unit, over) => el('div', { class: 'meter' + (over ? ' over' : '') },
      el('div', { class: 'meter-top' }, el('span', {}, label), el('b', {}, `${fmt(v, unit === 'קק״ל' ? 0 : 1)} / ${fmt(max, 0)} ${unit}`)),
      el('div', { class: 'meter-track' }, el('i', { style: `inline-size:${pctOf(v, max)}%` })));
    return el('section', { class: 'card keto-card dash', id: 'ketoToday' },
      el('h2', {}, `היום · ${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}`),
      el('div', { class: 'dash-grid' },
        bigPie(t, 170),
        el('div', {},
          bar('פחמימות נטו', s.net, st.netCarbLimit, 'ג׳', s.net > st.netCarbLimit),
          bar('קלוריות', s.kcal, st.kcalTarget, 'קק״ל', s.kcal > st.kcalTarget * 1.1),
          el('div', { class: 'stats' },
            stat('יחס קטו', M.fmtRatio(s.ratio)), stat('יחס קטו נטו', M.fmtRatio(s.netRatio)),
            stat('ארוחות היום', String(meals.length)), stat('שומן מהקלוריות', `${fmt(s.pct.fat, 0)}%`, `יעד ${st.fatPct}%`)))),
      el('div', { class: 'rec rec-' + rec.level }, el('b', {}, rec.title), el('ul', {}, rec.lines.map((l) => el('li', {}, l)))));
  }

  let root = null;
  function render() {
    if (!root) return;
    const y = window.scrollY;
    root.textContent = '';
    const jump = (id) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const nav = el('nav', { class: 'keto-nav', 'aria-label': 'קפיצה בתוך קטוזיס' },
      el('button', { class: 'chip', onclick: jump('ketoToday') }, 'היום'),
      el('button', { class: 'chip', onclick: jump('ketoProgress') }, 'התקדמות'),
      el('button', { class: 'chip', onclick: jump('ketoLog') }, 'יומן'),
      el('button', { class: 'chip primary', onclick: () => { jump('ketoCalc')(); setTimeout(() => document.querySelector('#ketoCalc input[list]')?.focus({ preventScroll: true }), 350); } }, '+ ארוחה'));
    root.append(nav, toggleCard(), todayCard(), progressCard(), logCard(), calcCard());
    if (!loaded) root.prepend(el('p', { class: 'muted' }, 'טוען…'));
    window.scrollTo(0, y);
  }
  // New data from the server never redraws under someone's fingers: wait until they leave the field.
  let renderLater = false;
  const typing = () => root && root.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  window.addEventListener('keto:changed', (e) => {
    if (e.detail !== 'state' && e.detail !== 'foods') return;
    if (typing()) renderLater = true; else render();
  });
  document.addEventListener('focusout', () => setTimeout(() => { if (renderLater && !typing()) { renderLater = false; render(); } }, 0));

  /* ================= רשימת הקניות ================= */
  /** The values beside a shopping-list item when the switch is on (null when off or not food). */
  function annotate(item) {
    const diets = Diets.foodDiets();
    if ((!state.settings.enabled && !diets.length) || NON_FOOD.has(item.cat)) return null;
    const food = lookup(item.name);
    if (!food) { want(item.name); return el('span', { class: 'macro wait', title: 'מחפש ערכים…' }, el('span', { class: 'spinner tiny' })); }
    if (!food.is_food) return null;
    // One small pie per diet, titled, enlarged on tap (the owner's tour, 2026-11-13: no small numbers in the list).
    // Design's contract: span.macro.diet-pies > button.diet-pie[data-diet][data-fit] > svg.pie + span.diet-pie-name.
    // Each diet's own judgment is in data-fit (ok | warn | bad) and in the label; keto has none (its pie is the ratio).
    const s = M.summarize(food);
    const pie = (id, name, fit) => {
      const b = el('button', { type: 'button', class: 'diet-pie', 'data-diet': id, 'data-fit': fit?.[0] || null,
        'aria-label': `${name}: ${fit ? fit[1] + '. ' : ''}ערכי התזונה של ${item.name}`, title: fit?.[1] || null,
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); showFood(item.name, food, fit && `${name}: ${fit[1]}`); } }, el('span', { class: 'diet-pie-name' }, name));
      b.insertAdjacentHTML('afterbegin', M.pieSvg(food, 24, { ring: true }));
      return b;
    };
    return el('span', { class: 'macro diet-pies' },
      state.settings.enabled ? pie('keto', 'קטו') : null,
      diets.map((d) => pie(d.id, d.name, d.food(s, item.name))));
  }

  /* ================= מתכון: ערכים למנה לפי הדיאטה ================= */
  const recipeValues = new Map(); // ingredients key -> Promise
  function verdict(s) {
    const st = state.settings;
    const preset = M.presets[st.preset] || {};
    const share = st.netCarbLimit ? s.net / st.netCarbLimit : 0;
    if (preset.ratio) {
      if (s.netRatio >= preset.ratio - 0.3 && share <= 0.4) return ['ok', `✓ מתאים ליחס ${preset.ratio}:1`];
      if (s.netRatio >= preset.ratio - 1) return ['warn', `⚠ גבולי ליחס ${preset.ratio}:1`];
      return ['bad', `✗ לא מתאים ליחס ${preset.ratio}:1`];
    }
    if (share <= 0.35 && s.pct.fat >= st.fatPct - 15) return ['ok', '✓ מתאים לדיאטה'];
    if (share <= 0.6) return ['warn', '⚠ גבולי – כדאי מנה קטנה או תחליף לפחמימה'];
    return ['bad', '✗ לא מתאים לקטו כמו שהוא'];
  }

  /** Values per serving for a recipe and the verdict for our diet: { v, s, verdict: [level, text] }. Estimated once per set of ingredients. */
  function valuesFor(recipe) {
    const ingredients = (recipe?.ingredients || []).filter((i) => i.name).map((i) => ({ name: i.name, measure: i.measure || '' }));
    if (!ingredients.length) return Promise.reject(new Error('אין מצרכים'));
    const key = JSON.stringify([recipe.meta?.servings || '', ingredients]);
    if (!recipeValues.has(key)) {
      // the values we already know (the family's, the built-in table's, the stored ones): without AI the server works
      // the recipe out from them
      const known = {};
      for (const i of ingredients) { const f = lookup(i.name); if (f && f.is_food !== false) known[i.name] = { fat: f.fat, protein: f.protein, carbs: f.carbs, fiber: f.fiber, unit_g: f.unit_g || null }; }
      const p = api('/api/keto/recipe', { body: { title: recipe.title, servings: recipe.meta?.servings || '', ingredients, known } });
      p.catch(() => recipeValues.delete(key));
      recipeValues.set(key, p);
    }
    return recipeValues.get(key).then((v) => { const s = M.summarize(v.per_serving); return { v, s, verdict: verdict(s) }; });
  }

  /** The ketosis pie at the top of a recipe (only when the switch is on). Values per serving, estimated once and cached. */
  function recipePanel(recipe) {
    if (!state.settings.enabled || !recipe?.ingredients?.length) return null;
    const box = el('section', { class: 'keto-recipe', 'aria-live': 'polite' }, el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'מחשב ערכי קטו למנה…'));
    valuesFor(recipe).then(({ v, s, verdict: [level, text] }) => {
      const st = state.settings;
      box.replaceChildren(
        el('div', { class: 'kr-head' }, el('h4', {}, v.servingsKnown === false ? 'ערכי קטו למתכון כולו' : `ערכי קטו למנה (מתוך ${v.servings})`), el('span', { class: 'kr-verdict ' + level }, text)),
        el('div', { class: 'kr-body' },
          el('button', { class: 'pie-btn', 'aria-label': 'פירוט הערכים לפי מצרכים', onclick: () => showTotals('ערכים למנה', v.per_serving, v.items.map((i) => ({ ...i, grams: i.grams / v.servings, fat: i.fat / v.servings, protein: i.protein / v.servings, carbs: i.carbs / v.servings, fiber: i.fiber / v.servings }))), html: M.pieSvg(v.per_serving, 96, { ring: true }) }),
          el('div', { class: 'kr-stats' },
            el('div', {}, el('b', {}, `${fmt(s.net)} ג׳`), el('small', {}, `פחמימות נטו · ${fmt(st.netCarbLimit ? (s.net / st.netCarbLimit) * 100 : 0, 0)}% מהיעד היומי (${st.netCarbLimit})`)),
            el('div', {}, el('b', {}, fmt(s.kcal, 0)), el('small', {}, 'קלוריות')),
            el('div', {}, el('b', {}, M.fmtRatio(s.netRatio)), el('small', {}, 'יחס קטו נטו')),
            el('div', { class: 'kr-macros' }, MACROS.map(([k, label]) => el('span', {}, el('i', { class: 'dot m-' + k }), `${label} ${fmt(s[k])} ג׳ (${fmt(s.pct[k], 0)}%)`))))),
        el('div', { class: 'row' },
          el('button', { class: 'btn ghost small', onclick: async () => {
            await saveMeal({ at: Date.now(), name: recipe.title, status: 'eaten', items: v.items.map((i) => ({ name: i.name, grams: i.grams / v.servings, fat: i.fat / v.servings, protein: i.protein / v.servings, carbs: i.carbs / v.servings, fiber: i.fiber / v.servings })) });
            toast(`מנה אחת של "${recipe.title}" נרשמה ביומן`);
          } }, '🍽 אכלנו מנה – הוסף ליומן'),
          el('small', { class: 'muted' }, v.via === 'plain' ? 'חישוב לפי הכמויות במתכון והערכים ל־100 גרם (בלי העוזר החכם)' : 'הערכה לפי המצרכים והכמויות במתכון')),
        // without AI: what it could not tell, so the number is read as "at least"
        ...(v.via === 'plain' && v.unknown?.length ? [el('p', { class: 'small muted' }, `לא חושבו (אין כמות או ערכים): ${v.unknown.join(', ')}. אפשר להוסיף ערכים לפי התווית ברשימת הקניות.`)] : []));
    }).catch((e) => box.replaceChildren(el('p', { class: 'muted' }, 'לא הצלחתי לחשב ערכי קטו למתכון: ' + e.message)));
    return box;
  }

  /** A stamp per diet that is on (vision batch 2, item 1): paleo from the ingredients' names, the others from the values
   *  per serving (the same estimate as keto's, made once per set of ingredients). Markup for design:
   *  div.diet-stamps > span.diet-stamp[data-diet][data-fit] (+ small.diet-note "אינו ייעוץ רפואי" for low sugar). */
  function dietStamps(recipe) {
    const diets = Diets.foodDiets();
    if (!diets.length || !recipe?.ingredients?.length) return null;
    const names = recipe.ingredients.map((i) => i.name).filter(Boolean);
    const mark = { ok: '✓', warn: '⚠', bad: '✗' };
    const stamp = (d, fit) => el('span', { class: 'diet-stamp', 'data-diet': d.id, 'data-fit': fit?.[0] || 'wait' }, fit ? `${mark[fit[0]]} ${fit[1]}` : `${d.name}…`);
    const box = el('div', { class: 'diet-stamps', role: 'status' }, diets.map((d) => stamp(d, d.byName ? d.recipe(null, names) : null)),
      diets.some((d) => d.note) ? el('small', { class: 'diet-note muted' }, 'אינו ייעוץ רפואי') : null);
    if (diets.some((d) => !d.byName)) {
      valuesFor(recipe).then(({ s }) => {
        box.querySelectorAll('.diet-stamp').forEach((x, n) => { if (!diets[n].byName) x.replaceWith(stamp(diets[n], diets[n].recipe(s, names))); });
      }).catch(() => box.querySelectorAll('.diet-stamp[data-fit="wait"]').forEach((x) => x.remove()));
    }
    return box;
  }

  window.Keto = {
    dietStamps,
    ready,
    get enabled() { return !!state.settings.enabled; },
    annotate,
    recipePanel,
    recipeValues: valuesFor,
    mount(node) { root = node; render(); },
    refresh,
  };
})();
