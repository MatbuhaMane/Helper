/* עוזר אישי – רשימת קניות חכמה
 * - סימון / הוספה / מחיקה / עריכה / כמויות
 * - מיון לפי קטגוריות (אוטומטי + שינוי ידני)
 * - זיהוי כפילויות (בהוספה ובסריקת הרשימה) ומיזוג
 * - חיפוש מתכונים (TheMealDB), הצגה בחלון שקוף והוספת מצרכים לרשימה
 * הנתונים נשמרים מקומית בדפדפן (localStorage).
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'helper.shopping.v1';
  const API = 'https://www.themealdb.com/api/json/v1/1/';
  const $ = (sel) => document.querySelector(sel);
  const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

  /* ---------- מצב ושמירה ---------- */
  let state = load();

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function makeItem(name, cat, extra = {}) {
    return { id: uid(), name: name.trim(), cat: cat || categorize(name), checked: false, qty: 1, ...extra };
  }

  function initialState() {
    return { items: INITIAL_ITEMS.map(([n, c]) => makeItem(n, c)), hideChecked: false };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.items)) return s;
      }
    } catch (_) { /* אחסון חסום — ממשיכים בזיכרון */ }
    return initialState();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
  }

  function commit() { save(); render(); }

  /* ---------- נרמול וזיהוי כפילויות ---------- */
  function normalize(str) {
    return str
      .toLowerCase()
      .replace(/[֑-ׇ]/g, '')           // ניקוד וטעמים
      .replace(/["'`׳״.,;:!?()\[\]{}\-_/\\+*]/g, ' ')
      .replace(/יי/g, 'י').replace(/וו/g, 'ו')    // כתיב מלא/חסר
      .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => {
        if (w.length > 3) w = w.replace(/(ימ|ות)$/, '');  // רבים
        if (w.length > 3) w = w.replace(/ה$/, '');         // עגבניה/עגבנייה/עגבניות
        if (/^[a-z]+$/.test(w) && w.length > 3) w = w.replace(/(es|s)$/, '');
        return w;
      })
      .join(' ')
      .trim();
  }

  function findDuplicate(name, exceptId) {
    const key = normalize(name);
    if (!key) return null;
    return state.items.find((it) => it.id !== exceptId && normalize(it.name) === key) || null;
  }

  function duplicateGroups() {
    const groups = new Map();
    for (const it of state.items) {
      const k = normalize(it.name);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    return [...groups.values()].filter((g) => g.length > 1);
  }

  function mergeGroup(group) {
    const [keep, ...rest] = group;
    keep.qty = group.reduce((sum, it) => sum + (it.qty || 1), 0);
    keep.checked = group.every((it) => it.checked);
    const ids = new Set(rest.map((r) => r.id));
    state.items = state.items.filter((it) => !ids.has(it.id));
  }

  /* ---------- סיווג אוטומטי לקטגוריה (ההתאמה הארוכה ביותר מנצחת) ---------- */
  function categorize(name) {
    const text = ' ' + name.toLowerCase() + ' ';
    let best = { cat: 'other', len: 0 };
    for (const cat of Object.keys(CATEGORY_KEYWORDS)) {
      for (const kw of CATEGORY_KEYWORDS[cat]) {
        if (kw.length > best.len && text.includes(kw.toLowerCase())) best = { cat, len: kw.length };
      }
    }
    return best.cat;
  }

  /* ---------- פעולות על פריטים ---------- */
  function addItem(name, cat, extra) {
    const item = makeItem(name, cat, extra);
    state.items.push(item);
    return item;
  }

  function removeItem(id) {
    const idx = state.items.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const [removed] = state.items.splice(idx, 1);
    commit();
    toast(`"${removed.name}" נמחק`, 'בטל', () => { state.items.splice(idx, 0, removed); commit(); });
  }

  /* ---------- רינדור ---------- */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) node.append(c);
    return node;
  }

  function categoryOptions(selected) {
    return CATEGORIES.map((c) => el('option', { value: c.id, selected: c.id === selected }, `${c.icon} ${c.name}`));
  }

  function render() {
    const list = $('#list');
    list.textContent = '';
    $('#hideChecked').checked = !!state.hideChecked;

    const total = state.items.length;
    const done = state.items.filter((i) => i.checked).length;
    $('#stats').textContent = total ? `${done}/${total} נקנו` : 'הרשימה ריקה';

    for (const cat of CATEGORIES) {
      let items = state.items.filter((i) => i.cat === cat.id);
      if (!items.length) continue;
      const remaining = items.filter((i) => !i.checked).length;
      if (state.hideChecked) items = items.filter((i) => !i.checked);
      // פריטים שלא סומנו קודם, ואז לפי א"ב
      items.sort((a, b) => (a.checked - b.checked) || a.name.localeCompare(b.name, 'he'));

      const section = el('div', { class: 'card category' },
        el('h2', {}, el('span', {}, `${cat.icon} ${cat.name}`), el('span', { class: 'count' }, remaining ? `${remaining} נותרו` : '✓ הכל נקנה')),
        el('ul', {}, items.map(renderItem)),
      );
      list.append(section);
    }
    if (!total) list.append(el('p', { class: 'empty card' }, 'הרשימה ריקה. הוסף פריטים או חפש מתכון 🙂'));
    renderDupBanner();
  }

  function renderItem(it) {
    const li = el('li', { class: 'item' + (it.checked ? ' checked' : ''), 'data-id': it.id });

    const cb = el('input', { type: 'checkbox', checked: it.checked, 'aria-label': `סמן ${it.name}`,
      onchange: () => { it.checked = cb.checked; commit(); } });

    const nameEl = el('span', { class: 'name', title: 'לחיצה כפולה לעריכה', ondblclick: () => startEdit(li, it) }, it.name);
    const meta = [];
    if (it.from) meta.push(el('small', { class: 'tag' }, `🍳 ${it.from}`));

    const qty = el('span', { class: 'qty' },
      el('button', { class: 'mini', 'aria-label': 'הפחת', onclick: () => { if (it.qty > 1) { it.qty--; commit(); } } }, '−'),
      el('b', {}, String(it.qty || 1)),
      el('button', { class: 'mini', 'aria-label': 'הוסף', onclick: () => { it.qty = (it.qty || 1) + 1; commit(); } }, '+'),
    );

    const catSel = el('select', { class: 'cat-select', 'aria-label': 'שנה קטגוריה',
      onchange: () => { it.cat = catSel.value; commit(); } }, categoryOptions(it.cat));

    li.append(
      el('label', { class: 'main' }, cb, nameEl, ...meta),
      qty,
      catSel,
      el('button', { class: 'mini', title: 'עריכה', 'aria-label': 'ערוך', onclick: () => startEdit(li, it) }, '✎'),
      el('button', { class: 'mini danger', title: 'מחיקה', 'aria-label': `מחק ${it.name}`, onclick: () => removeItem(it.id) }, '✕'),
    );
    return li;
  }

  function startEdit(li, it) {
    const input = el('input', { type: 'text', class: 'edit', value: it.name });
    const nameEl = li.querySelector('.name');
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (saveIt) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (saveIt && v && v !== it.name) {
        const dup = findDuplicate(v, it.id);
        it.name = v;
        if (dup) toast(`שים לב: "${v}" כבר קיים ברשימה`);
      }
      commit();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  function renderDupBanner() {
    const banner = $('#dupBanner');
    const groups = duplicateGroups();
    banner.textContent = '';
    if (!groups.length) { banner.hidden = true; return; }
    banner.hidden = false;
    banner.append(
      el('strong', {}, `⚠️ נמצאו ${groups.length} כפילויות: `),
      ...groups.map((g) => el('button', { class: 'chip', title: 'מזג לפריט אחד',
        onclick: () => { mergeGroup(g); commit(); toast(`"${g[0].name}" מוזג`); } }, `${g[0].name} ×${g.length} ⤵`)),
      groups.length > 1
        ? el('button', { class: 'btn small', onclick: () => { groups.forEach(mergeGroup); commit(); toast('כל הכפילויות מוזגו'); } }, 'מזג הכל')
        : '',
    );
  }

  function flash(id) {
    requestAnimationFrame(() => {
      const node = document.querySelector(`[data-id="${id}"]`);
      if (!node) return;
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      node.classList.add('flash');
      setTimeout(() => node.classList.remove('flash'), 1600);
    });
  }

  /* ---------- טופס הוספה ---------- */
  function setupAddForm() {
    const sel = $('#addCategory');
    sel.append(...categoryOptions(null));
    sel.value = '';
    const hint = $('#addHint');
    const input = $('#addInput');

    input.addEventListener('input', () => {
      const v = input.value.trim();
      const dup = v && !v.includes(',') && findDuplicate(v);
      hint.textContent = dup ? `⚠️ "${dup.name}" כבר ברשימה` : (v && !v.includes(',') ? `יסווג ל: ${catById[sel.value || categorize(v)].name}` : '');
    });

    $('#addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const names = input.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      if (!names.length) return;
      const added = [];
      const dups = [];
      for (const n of names) {
        const dup = findDuplicate(n);
        if (dup) {
          dups.push(dup);
          if (dup.checked) dup.checked = false;   // היה מסומן — מחזירים לרשימה
          else dup.qty = (dup.qty || 1) + 1;      // כבר ברשימה — מגדילים כמות
        } else {
          added.push(addItem(n, sel.value || null));
        }
      }
      input.value = '';
      hint.textContent = '';
      commit();
      if (dups.length) {
        toast(`כפילות זוהתה: ${dups.map((d) => d.name).join(', ')} — עודכנה כמות במקום להוסיף שוב`);
        flash(dups[0].id);
      } else if (added.length) {
        toast(added.length === 1 ? `"${added[0].name}" נוסף ל${catById[added[0].cat].name}` : `${added.length} פריטים נוספו`);
        flash(added[0].id);
      }
      input.focus();
    });
  }

  /* ---------- סרגל כלים ---------- */
  function setupToolbar() {
    $('#hideChecked').addEventListener('change', (e) => { state.hideChecked = e.target.checked; commit(); });

    $('#clearChecked').addEventListener('click', () => {
      const removed = state.items.filter((i) => i.checked);
      if (!removed.length) return toast('אין פריטים מסומנים');
      const before = state.items.slice();
      state.items = state.items.filter((i) => !i.checked);
      commit();
      toast(`${removed.length} פריטים נמחקו`, 'בטל', () => { state.items = before; commit(); });
    });

    $('#resetList').addEventListener('click', () => {
      if (!confirm('לאפס לרשימה המקורית? כל השינויים יימחקו.')) return;
      state = initialState();
      commit();
    });

    $('#shareList').addEventListener('click', async () => {
      const lines = [];
      for (const cat of CATEGORIES) {
        const items = state.items.filter((i) => i.cat === cat.id && !i.checked);
        if (!items.length) continue;
        lines.push(`${cat.icon} ${cat.name}`);
        items.forEach((i) => lines.push(`• ${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`));
        lines.push('');
      }
      const text = lines.join('\n').trim() || 'הרשימה ריקה';
      try {
        if (navigator.share) await navigator.share({ title: 'רשימת קניות', text });
        else { await navigator.clipboard.writeText(text); toast('הרשימה הועתקה – אפשר להדביק בוואטסאפ'); }
      } catch (_) { /* המשתמש ביטל */ }
    });
  }

  /* ---------- מתכונים ---------- */
  function translateQuery(q) {
    const t = q.trim();
    if (!/[֐-׿]/.test(t)) return t;
    if (SEARCH_HE_EN[t]) return SEARCH_HE_EN[t];
    const words = t.split(/\s+/).map((w) => SEARCH_HE_EN[w] || SEARCH_HE_EN[w.replace(/^ה/, '')]).filter(Boolean);
    return words.length ? words.join(' ') : null;
  }

  function translateIngredient(name) {
    const k = name.trim().toLowerCase();
    return INGREDIENT_EN_HE[k] || INGREDIENT_EN_HE[k.replace(/(es|s)$/, '')] || INGREDIENT_EN_HE[k + 's'] || name.trim();
  }

  async function api(path) {
    const res = await fetch(API + path);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function searchRecipes(q) {
    let { meals } = await api('search.php?s=' + encodeURIComponent(q));
    if (!meals) {
      // אין תוצאה לפי שם — ננסה לפי מצרך עיקרי
      const r = await api('filter.php?i=' + encodeURIComponent(q.replace(/\s+/g, '_')));
      meals = r.meals ? r.meals.slice(0, 12) : null;
    }
    return meals || [];
  }

  async function getRecipe(id) {
    const { meals } = await api('lookup.php?i=' + encodeURIComponent(id));
    return meals && meals[0];
  }

  function googleLink(q) {
    return el('a', { href: 'https://www.google.com/search?q=' + encodeURIComponent('מתכון ' + q), target: '_blank', rel: 'noopener' }, `🔎 חפש "${q}" בגוגל (מתכונים בעברית)`);
  }

  function openModal(...content) {
    const body = $('#modalBody');
    body.textContent = '';
    body.append(...content);
    $('#modal').hidden = false;
    document.body.classList.add('modal-open');
    body.scrollTop = 0;
  }

  function closeModal() {
    $('#modal').hidden = true;
    document.body.classList.remove('modal-open');
  }

  async function runSearch(q) {
    openModal(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), `מחפש מתכונים ל"${q}"…`));
    const en = translateQuery(q);
    if (!en) {
      openModal(
        el('h3', {}, 'לא הצלחתי לתרגם את החיפוש'),
        el('p', {}, 'מאגר המתכונים באנגלית. נסה מילה כמו "עוף", "פסטה", "מרק" או כתוב באנגלית (למשל chicken curry).'),
        el('p', {}, googleLink(q)),
      );
      return;
    }
    try {
      const meals = await searchRecipes(en);
      if (!meals.length) {
        openModal(el('h3', {}, `לא נמצאו מתכונים ל"${q}"`), el('p', {}, googleLink(q)));
        return;
      }
      openModal(
        el('h3', { id: 'modalTitle' }, `🍳 ${meals.length} מתכונים ל"${q}"` + (en !== q ? ` (${en})` : '')),
        el('div', { class: 'results' }, meals.map((m) =>
          el('button', { class: 'result', onclick: () => showRecipe(m.idMeal, q) },
            el('img', { src: m.strMealThumb + '/preview', alt: '', loading: 'lazy' }),
            el('span', {}, m.strMeal)))),
        el('p', { class: 'muted' }, googleLink(q)),
      );
    } catch (err) {
      openModal(
        el('h3', {}, 'אין חיבור למאגר המתכונים'),
        el('p', {}, 'בדוק את החיבור לאינטרנט ונסה שוב.'),
        el('p', {}, googleLink(q)),
      );
    }
  }

  async function showRecipe(id, backQuery) {
    openModal(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'טוען מתכון…'));
    let r;
    try { r = await getRecipe(id); } catch (_) { r = null; }
    if (!r) { openModal(el('h3', {}, 'שגיאה בטעינת המתכון'), el('button', { class: 'btn', onclick: () => runSearch(backQuery) }, '→ חזרה לתוצאות')); return; }

    const ingredients = [];
    for (let i = 1; i <= 20; i++) {
      const name = (r['strIngredient' + i] || '').trim();
      if (!name) continue;
      const he = translateIngredient(name);
      const existing = findDuplicate(he);
      const basic = /^(water|salt|מים|מלח)$/i.test(name) || /^(מים|מלח)$/.test(he);
      ingredients.push({ en: name, he, measure: (r['strMeasure' + i] || '').trim(), existing, preselect: !existing && !basic });
    }

    const rows = ingredients.map((ing) => {
      const cb = el('input', { type: 'checkbox', checked: ing.preselect });
      ing.cb = cb;
      return el('li', {},
        el('label', {}, cb,
          el('span', { class: 'ing-name' }, ing.he, ing.he !== ing.en ? el('small', { class: 'muted' }, ` (${ing.en})`) : null),
          ing.measure ? el('small', { class: 'measure' }, ing.measure) : null,
          ing.existing ? el('small', { class: 'tag ok' }, ing.existing.checked ? 'נקנה' : 'כבר ברשימה') : null));
    });

    const addBtn = el('button', { class: 'btn primary', onclick: () => {
      const chosen = ingredients.filter((i) => i.cb.checked);
      if (!chosen.length) return toast('לא נבחרו מצרכים');
      let added = 0;
      let bumped = 0;
      for (const ing of chosen) {
        const dup = findDuplicate(ing.he);
        if (dup) { if (dup.checked) dup.checked = false; bumped++; }
        else { addItem(ing.he, categorize(ing.he + ' ' + ing.en), { from: r.strMeal }); added++; }
      }
      commit();
      closeModal();
      toast(`נוספו ${added} מצרכים מ"${r.strMeal}"` + (bumped ? ` (${bumped} כבר היו ברשימה)` : ''));
    } }, '➕ הוסף מצרכים מסומנים לרשימה');

    const steps = (r.strInstructions || '').split(/\r?\n+/).map((s) => s.trim()).filter((s) => s && !/^step\s*\d+$/i.test(s));

    openModal(
      el('button', { class: 'btn ghost small back', onclick: () => runSearch(backQuery) }, '→ חזרה לתוצאות'),
      el('div', { class: 'recipe-head' },
        el('img', { src: r.strMealThumb, alt: r.strMeal }),
        el('div', {},
          el('h3', { id: 'modalTitle' }, r.strMeal),
          el('p', { class: 'muted' }, [r.strCategory, r.strArea].filter(Boolean).join(' · ')),
          el('div', { class: 'links' },
            r.strYoutube ? el('a', { href: r.strYoutube, target: '_blank', rel: 'noopener' }, '▶ וידאו') : null,
            r.strSource ? el('a', { href: r.strSource, target: '_blank', rel: 'noopener' }, '🔗 מקור') : null,
            el('a', { href: 'https://translate.google.com/?sl=en&tl=iw&text=' + encodeURIComponent(r.strInstructions || ''), target: '_blank', rel: 'noopener' }, '🌐 תרגם הוראות')))),
      el('h4', {}, `מצרכים (${ingredients.length})`),
      el('div', { class: 'ing-tools' },
        el('button', { class: 'btn ghost small', onclick: () => ingredients.forEach((i) => { i.cb.checked = true; }) }, 'סמן הכל'),
        el('button', { class: 'btn ghost small', onclick: () => ingredients.forEach((i) => { i.cb.checked = false; }) }, 'נקה'),
      ),
      el('ul', { class: 'ingredients' }, rows),
      addBtn,
      el('h4', {}, 'אופן הכנה'),
      el('ol', { class: 'steps', dir: 'ltr' }, steps.map((s) => el('li', {}, s))),
    );
  }

  function setupRecipes() {
    $('#recipeForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#recipeInput').value.trim();
      if (q) runSearch(q);
    });
    $('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
  }

  /* ---------- הודעות ---------- */
  let toastTimer;
  function toast(msg, actionLabel, action) {
    const t = $('#toast');
    t.textContent = '';
    t.append(el('span', {}, msg));
    if (actionLabel) t.append(el('button', { class: 'btn small', onclick: () => { action(); t.classList.remove('show'); } }, actionLabel));
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), actionLabel ? 6000 : 3500);
  }

  /* ---------- אתחול ---------- */
  setupAddForm();
  setupToolbar();
  setupRecipes();
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // חשיפה לבדיקות
  window.__helper = { normalize, categorize, findDuplicate, duplicateGroups, get state() { return state; } };
})();
