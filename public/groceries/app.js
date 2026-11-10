/* קניות ומתכונים
 * - רשימה משותפת לכל בני הבית (מסונכרנת לשרת, עובדת גם בלי קליטה ומסתנכרנת כשחוזרים לרשת)
 * - קטגוריות, זיהוי כפילויות ומיזוג
 * - חיפוש מתכונים ברשת (TheMealDB), חלון שקוף, הוספת מצרכים ושמירה לספר המתכונים
 * - ספר מתכונים משפחתי: שמירה, עריכה, ייבוא מכל אתר מתכונים, הוספת מצרכים לרשימה
 */
(async () => {
  'use strict';
  const { el, api, toast, modal, closeModal } = H;
  H.header('קניות ומתכונים', '🛒');
  await H.requireLogin();

  const CACHE_KEY = 'helper.groceries.v2';
  const MEALDB = 'https://www.themealdb.com/api/json/v1/1/';
  const $ = (s) => document.querySelector(s);
  const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

  /* ================= מצב וסנכרון ================= */
  // items: Map id -> item. pending: ops not yet confirmed by the server (kept across reloads for offline use).
  let { items, pending, since, hideChecked } = loadCache();

  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c) return { items: new Map(c.items.map((i) => [i.id, i])), pending: c.pending || [], since: c.since || 0, hideChecked: !!c.hideChecked };
    } catch (_) { /* ignore */ }
    return { items: new Map(), pending: [], since: 0, hideChecked: false };
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ items: [...items.values()], pending, since, hideChecked })); } catch (_) { /* ignore */ }
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function upsert(item) {
    items.set(item.id, item);
    queue({ op: 'upsert', item: { id: item.id, name: item.name, cat: item.cat, checked: !!item.checked, qty: item.qty || 1, from: item.from } });
  }
  function remove(id) {
    items.delete(id);
    queue({ op: 'delete', id });
  }
  function queue(op) {
    pending = pending.filter((p) => (p.op === 'delete' ? p.id : p.item.id) !== (op.op === 'delete' ? op.id : op.item.id));
    pending.push(op);
    saveCache();
    render();
    scheduleFlush();
  }

  let flushTimer;
  function scheduleFlush() { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 300); }

  let syncing = false;
  async function flush() {
    if (syncing || !pending.length) return;
    syncing = true;
    const sending = pending.slice();
    try {
      await api('/api/groceries/ops', { body: { ops: sending } });
      pending = pending.filter((p) => !sending.includes(p));
      saveCache();
      setSync(true);
    } catch (e) {
      setSync(false);
    } finally {
      syncing = false;
    }
    if (pending.length && navigator.onLine) scheduleFlush();
  }

  async function pull() {
    try {
      const r = await api('/api/groceries?since=' + since);
      const pendingIds = new Set(pending.map((p) => (p.op === 'delete' ? p.id : p.item.id)));
      for (const it of r.items) {
        if (pendingIds.has(it.id)) continue; // local edit wins until it reaches the server
        if (it.deleted) items.delete(it.id);
        else items.set(it.id, { id: it.id, name: it.name, cat: it.cat, checked: it.checked, qty: it.qty, from: it.from });
      }
      if (r.items.length) since = Math.max(since, ...r.items.map((i) => i.updatedAt));
      saveCache();
      setSync(true);
      if (r.items.length) render();
    } catch (e) {
      setSync(false);
    }
  }

  function setSync(ok) {
    const s = $('#sync');
    s.className = 'sync' + (ok ? '' : ' off');
    s.textContent = ok ? (pending.length ? '⟳ מסנכרן…' : '✓ מסונכרן') : '⚠ אין חיבור – נשמר במכשיר';
  }

  window.addEventListener('online', () => { flush(); pull(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { flush(); pull(); } });
  setInterval(() => { if (!document.hidden) { flush(); pull(); } }, 10000);

  /* ================= נרמול, כפילויות, קטגוריות ================= */
  function normalize(str) {
    return str.toLowerCase()
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
  function findDuplicate(name, exceptId) {
    const key = normalize(name);
    if (!key) return null;
    for (const it of items.values()) if (it.id !== exceptId && normalize(it.name) === key) return it;
    return null;
  }
  function duplicateGroups() {
    const groups = new Map();
    for (const it of items.values()) {
      const k = normalize(it.name);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    return [...groups.values()].filter((g) => g.length > 1);
  }
  function mergeGroup(group) {
    const [keep, ...rest] = group;
    upsert({ ...keep, qty: group.reduce((s, it) => s + (it.qty || 1), 0), checked: group.every((it) => it.checked) });
    rest.forEach((r) => remove(r.id));
  }
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

  /** Add an item by name, or bump the existing one; returns { item, dup } */
  function addByName(name, cat, from) {
    const dup = findDuplicate(name);
    if (dup) {
      if (dup.checked) upsert({ ...dup, checked: false });
      else upsert({ ...dup, qty: (dup.qty || 1) + 1 });
      return { item: dup, dup: true };
    }
    const item = { id: uid(), name: name.trim(), cat: cat || categorize(name), checked: false, qty: 1, from };
    upsert(item);
    return { item, dup: false };
  }

  /* ================= רינדור הרשימה ================= */
  function categoryOptions(selected) {
    return CATEGORIES.map((c) => el('option', { value: c.id, selected: c.id === selected }, `${c.icon} ${c.name}`));
  }

  function render() {
    const list = $('#list');
    list.textContent = '';
    $('#hideChecked').checked = hideChecked;
    const all = [...items.values()];
    for (const cat of CATEGORIES) {
      let catItems = all.filter((i) => (catById[i.cat] ? i.cat : 'other') === cat.id);
      if (!catItems.length) continue;
      const remaining = catItems.filter((i) => !i.checked).length;
      if (hideChecked) catItems = catItems.filter((i) => !i.checked);
      catItems.sort((a, b) => (a.checked - b.checked) || a.name.localeCompare(b.name, 'he'));
      list.append(el('div', { class: 'card category' },
        el('h2', {}, el('span', {}, `${cat.icon} ${cat.name}`), el('span', { class: 'count' }, remaining ? `${remaining} נותרו` : '✓ הכל נקנה')),
        el('ul', {}, catItems.map(renderItem))));
    }
    if (!all.length) list.append(el('p', { class: 'empty card' }, 'הרשימה ריקה. הוסף פריטים או חפש מתכון 🙂'));
    renderDupBanner();
  }

  function renderItem(it) {
    const li = el('li', { class: 'item' + (it.checked ? ' checked' : ''), 'data-id': it.id });
    const cb = el('input', { type: 'checkbox', checked: !!it.checked, 'aria-label': `סמן ${it.name}`, onchange: () => upsert({ ...it, checked: cb.checked }) });
    const nameEl = el('span', { class: 'name', title: 'לחיצה כפולה לעריכה', ondblclick: () => startEdit(li, it) }, it.name);
    const qty = el('span', { class: 'qty' },
      el('button', { class: 'mini', 'aria-label': 'הפחת', onclick: () => { if (it.qty > 1) upsert({ ...it, qty: it.qty - 1 }); } }, '−'),
      el('b', {}, String(it.qty || 1)),
      el('button', { class: 'mini', 'aria-label': 'הוסף', onclick: () => upsert({ ...it, qty: (it.qty || 1) + 1 }) }, '+'));
    const catSel = el('select', { class: 'cat-select', 'aria-label': 'שנה קטגוריה', onchange: () => upsert({ ...it, cat: catSel.value }) }, categoryOptions(it.cat));
    li.append(
      el('label', { class: 'main' }, cb, nameEl, it.from ? el('small', { class: 'tag' }, `🍳 ${it.from}`) : null),
      qty, catSel,
      el('button', { class: 'mini', title: 'עריכה', 'aria-label': 'ערוך', onclick: () => startEdit(li, it) }, '✎'),
      el('button', { class: 'mini danger', title: 'מחיקה', 'aria-label': `מחק ${it.name}`, onclick: () => {
        remove(it.id);
        toast(`"${it.name}" נמחק`, 'בטל', () => upsert(it));
      } }, '✕'));
    return li;
  }

  function startEdit(li, it) {
    const input = el('input', { type: 'text', class: 'edit', value: it.name });
    li.querySelector('.name').replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (save && v && v !== it.name) {
        if (findDuplicate(v, it.id)) toast(`שים לב: "${v}" כבר קיים ברשימה`);
        upsert({ ...it, name: v });
      } else render();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
  }

  function renderDupBanner() {
    const banner = $('#dupBanner');
    const groups = duplicateGroups();
    banner.textContent = '';
    banner.hidden = !groups.length;
    if (!groups.length) return;
    banner.append(
      el('strong', {}, `⚠️ נמצאו ${groups.length} כפילויות: `),
      ...groups.map((g) => el('button', { class: 'chip', title: 'מזג לפריט אחד', onclick: () => { mergeGroup(g); toast(`"${g[0].name}" מוזג`); } }, `${g[0].name} ×${g.length} ⤵`)),
      groups.length > 1 ? el('button', { class: 'btn small', onclick: () => { groups.forEach(mergeGroup); toast('כל הכפילויות מוזגו'); } }, 'מזג הכל') : '');
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

  /* ================= טופס הוספה וסרגל ================= */
  const sel = $('#addCategory');
  sel.append(...categoryOptions(null));
  sel.value = '';
  $('#addInput').addEventListener('input', () => {
    const v = $('#addInput').value.trim();
    const single = v && !v.includes(',');
    const dup = single && findDuplicate(v);
    $('#addHint').textContent = dup ? `⚠️ "${dup.name}" כבר ברשימה` : single ? `יסווג ל: ${catById[sel.value || categorize(v)].name}` : '';
  });
  $('#addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const names = $('#addInput').value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const results = names.map((n) => addByName(n, sel.value || null));
    $('#addInput').value = '';
    $('#addHint').textContent = '';
    const dups = results.filter((r) => r.dup);
    const added = results.filter((r) => !r.dup);
    if (dups.length) { toast(`כפילות זוהתה: ${dups.map((d) => d.item.name).join(', ')} — עודכנה כמות במקום להוסיף שוב`); flash(dups[0].item.id); }
    else if (added.length) { toast(added.length === 1 ? `"${added[0].item.name}" נוסף ל${catById[added[0].item.cat].name}` : `${added.length} פריטים נוספו`); flash(added[0].item.id); }
    $('#addInput').focus();
  });

  $('#hideChecked').addEventListener('change', (e) => { hideChecked = e.target.checked; saveCache(); render(); });
  $('#clearChecked').addEventListener('click', () => {
    const done = [...items.values()].filter((i) => i.checked);
    if (!done.length) return toast('אין פריטים מסומנים');
    done.forEach((i) => remove(i.id));
    toast(`${done.length} פריטים נמחקו`, 'בטל', () => done.forEach(upsert));
  });
  $('#shareList').addEventListener('click', async () => {
    const lines = [];
    for (const cat of CATEGORIES) {
      const ci = [...items.values()].filter((i) => i.cat === cat.id && !i.checked);
      if (!ci.length) continue;
      lines.push(`${cat.icon} ${cat.name}`, ...ci.map((i) => `• ${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`), '');
    }
    const text = lines.join('\n').trim() || 'הרשימה ריקה';
    try {
      if (navigator.share) await navigator.share({ title: 'רשימת קניות', text });
      else { await navigator.clipboard.writeText(text); toast('הרשימה הועתקה – אפשר להדביק בוואטסאפ'); }
    } catch (_) { /* cancelled */ }
  });

  /* ================= הוספת מצרכים ממתכון ================= */
  function translateIngredient(name) {
    const k = name.trim().toLowerCase();
    return INGREDIENT_EN_HE[k] || INGREDIENT_EN_HE[k.replace(/(es|s)$/, '')] || INGREDIENT_EN_HE[k + 's'] || name.trim();
  }

  /** Ingredient picker used by both web recipes and saved recipes. Returns the <ul> and a getter for chosen ingredients. */
  function ingredientPicker(ingredients) {
    const rows = ingredients.map((ing) => {
      const existing = findDuplicate(ing.he);
      const basic = /^(water|salt|מים|מלח)$/i.test(ing.en || '') || /^(מים|מלח)$/.test(ing.he);
      const cb = el('input', { type: 'checkbox', checked: !existing && !basic });
      ing.cb = cb;
      return el('li', {}, el('label', {}, cb,
        el('span', { class: 'ing-name' }, ing.he, ing.en && ing.he !== ing.en ? el('small', { class: 'muted' }, ` (${ing.en})`) : null),
        ing.measure ? el('small', { class: 'measure' }, ing.measure) : null,
        existing ? el('small', { class: 'tag ok' }, existing.checked ? 'נקנה' : 'כבר ברשימה') : null));
    });
    return {
      tools: el('div', { class: 'ing-tools' },
        el('button', { class: 'btn ghost small', onclick: () => ingredients.forEach((i) => { i.cb.checked = true; }) }, 'סמן הכל'),
        el('button', { class: 'btn ghost small', onclick: () => ingredients.forEach((i) => { i.cb.checked = false; }) }, 'נקה')),
      list: el('ul', { class: 'ingredients' }, rows),
      addButton: (title) => el('button', { class: 'btn primary', onclick: () => {
        const chosen = ingredients.filter((i) => i.cb.checked);
        if (!chosen.length) return toast('לא נבחרו מצרכים');
        let added = 0, bumped = 0;
        for (const ing of chosen) {
          const r = addByName(ing.he, categorize(ing.he + ' ' + (ing.en || '')), title);
          r.dup ? bumped++ : added++;
        }
        closeModal();
        showTab('list');
        toast(`נוספו ${added} מצרכים מ"${title}"` + (bumped ? ` (${bumped} כבר היו ברשימה)` : ''));
      } }, '➕ הוסף מצרכים מסומנים לרשימה'),
    };
  }

  /* ================= חיפוש מתכונים ברשת ================= */
  function translateQuery(q) {
    const t = q.trim();
    if (!/[֐-׿]/.test(t)) return t;
    if (SEARCH_HE_EN[t]) return SEARCH_HE_EN[t];
    const words = t.split(/\s+/).map((w) => SEARCH_HE_EN[w] || SEARCH_HE_EN[w.replace(/^ה/, '')]).filter(Boolean);
    return words.length ? words.join(' ') : null;
  }
  async function mealdb(path) {
    const res = await fetch(MEALDB + path);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  function googleLink(q) {
    return el('a', { href: 'https://www.google.com/search?q=' + encodeURIComponent('מתכון ' + q), target: '_blank', rel: 'noopener' }, `🔎 חפש "${q}" בגוגל (מתכונים בעברית)`);
  }
  const loading = (t) => el('div', { class: 'loading' }, el('span', { class: 'spinner' }), t);

  async function runSearch(q) {
    modal(loading(`מחפש מתכונים ל"${q}"…`));
    const en = translateQuery(q);
    if (!en) {
      modal(el('h3', {}, 'לא הצלחתי לתרגם את החיפוש'),
        el('p', {}, 'מאגר המתכונים באנגלית. נסה מילה כמו "עוף", "פסטה", "מרק" או כתוב באנגלית.'),
        el('p', {}, googleLink(q)), el('p', { class: 'muted' }, 'מצאת מתכון באתר עברי? העתק את הקישור ולחץ "ייבוא מקישור" בספר המתכונים.'));
      return;
    }
    try {
      let { meals } = await mealdb('search.php?s=' + encodeURIComponent(en));
      if (!meals) meals = ((await mealdb('filter.php?i=' + encodeURIComponent(en.replace(/\s+/g, '_')))).meals || []).slice(0, 12);
      if (!meals.length) { modal(el('h3', {}, `לא נמצאו מתכונים ל"${q}"`), el('p', {}, googleLink(q))); return; }
      modal(el('h3', {}, `🍳 ${meals.length} מתכונים ל"${q}"` + (en !== q ? ` (${en})` : '')),
        el('div', { class: 'results' }, meals.map((m) => el('button', { class: 'result', onclick: () => showWebRecipe(m.idMeal, q) },
          el('img', { src: m.strMealThumb + '/preview', alt: '', loading: 'lazy' }), el('span', {}, m.strMeal)))),
        el('p', { class: 'muted' }, googleLink(q)));
    } catch (_) {
      modal(el('h3', {}, 'אין חיבור למאגר המתכונים'), el('p', {}, googleLink(q)));
    }
  }

  async function showWebRecipe(id, backQuery) {
    modal(loading('טוען מתכון…'));
    let r = null;
    try { r = (await mealdb('lookup.php?i=' + encodeURIComponent(id))).meals?.[0]; } catch (_) { /* ignore */ }
    if (!r) { modal(el('h3', {}, 'שגיאה בטעינת המתכון'), el('button', { class: 'btn', onclick: () => runSearch(backQuery) }, '→ חזרה לתוצאות')); return; }
    const ingredients = [];
    for (let i = 1; i <= 20; i++) {
      const name = (r['strIngredient' + i] || '').trim();
      if (name) ingredients.push({ en: name, he: translateIngredient(name), measure: (r['strMeasure' + i] || '').trim() });
    }
    const steps = (r.strInstructions || '').split(/\r?\n+/).map((s) => s.trim()).filter((s) => s && !/^step\s*\d+$/i.test(s));
    const picker = ingredientPicker(ingredients);
    const saveBtn = el('button', { class: 'btn ghost', onclick: async () => {
      saveBtn.disabled = true;
      try {
        await api('/api/recipes', { body: {
          title: r.strMeal, image: r.strMealThumb, source_url: r.strSource || r.strYoutube || `https://www.themealdb.com/meal/${r.idMeal}`,
          ingredients: ingredients.map((i) => ({ name: i.he, measure: i.measure })), steps, notes: [r.strCategory, r.strArea].filter(Boolean).join(' · '), tags: [],
        } });
        saveBtn.textContent = '✓ נשמר בספר המתכונים';
        book = null;
      } catch (e) { saveBtn.disabled = false; toast(e.message); }
    } }, '💾 שמור לספר המתכונים');
    modal(
      el('button', { class: 'btn ghost small back', onclick: () => runSearch(backQuery) }, '→ חזרה לתוצאות'),
      el('div', { class: 'recipe-head' }, el('img', { src: r.strMealThumb, alt: r.strMeal }),
        el('div', {}, el('h3', {}, r.strMeal), el('p', { class: 'muted' }, [r.strCategory, r.strArea].filter(Boolean).join(' · ')),
          el('div', { class: 'links' },
            r.strYoutube ? el('a', { href: r.strYoutube, target: '_blank', rel: 'noopener' }, '▶ וידאו') : null,
            r.strSource ? el('a', { href: r.strSource, target: '_blank', rel: 'noopener' }, '🔗 מקור') : null,
            el('a', { href: 'https://translate.google.com/?sl=en&tl=iw&text=' + encodeURIComponent(r.strInstructions || ''), target: '_blank', rel: 'noopener' }, '🌐 תרגם הוראות')))),
      el('h4', {}, `מצרכים (${ingredients.length})`), picker.tools, picker.list,
      el('div', { class: 'row' }, picker.addButton(r.strMeal), saveBtn),
      el('h4', {}, 'אופן הכנה'), el('ol', { class: 'steps', dir: 'ltr' }, steps.map((s) => el('li', {}, s))));
  }

  $('#recipeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#recipeInput').value.trim();
    if (q) runSearch(q);
  });

  /* ================= ספר מתכונים ================= */
  let book = null;

  async function loadBook() {
    $('#bookGrid').textContent = '';
    $('#bookGrid').append(loading('טוען את ספר המתכונים…'));
    try { book = (await api('/api/recipes')).recipes; } catch (e) { book = []; toast(e.message); }
    renderBook();
  }

  function renderBook() {
    const grid = $('#bookGrid');
    grid.textContent = '';
    const q = $('#bookSearch').value.trim().toLowerCase();
    const list = (book || []).filter((r) => !q || [r.title, r.notes, ...(r.tags || []), ...r.ingredients.map((i) => i.name)].join(' ').toLowerCase().includes(q));
    if (!list.length) {
      grid.append(el('p', { class: 'empty card', style: 'grid-column:1/-1' }, book?.length ? 'לא נמצאו מתכונים' : 'ספר המתכונים ריק. שמרו מתכון מהחיפוש, הוסיפו מתכון משלכם או ייבאו מקישור 📖'));
      return;
    }
    for (const r of list) {
      grid.append(el('button', { class: 'book-card', onclick: () => showSaved(r) },
        el('div', { class: 'ph', style: r.image ? `background-image:url("${encodeURI(r.image)}")` : '' }, r.image ? '' : '🍲'),
        el('b', {}, r.title), el('small', {}, `${r.ingredients.length} מצרכים`)));
    }
  }

  function showSaved(r) {
    const ingredients = r.ingredients.map((i) => ({ he: i.name, measure: i.measure }));
    const picker = ingredientPicker(ingredients);
    modal(
      el('div', { class: 'recipe-head' }, r.image ? el('img', { src: r.image, alt: '' }) : null,
        el('div', {}, el('h3', {}, r.title), r.notes ? el('p', { class: 'muted' }, r.notes) : null,
          el('div', { class: 'links' }, r.source_url ? el('a', { href: r.source_url, target: '_blank', rel: 'noopener' }, '🔗 מקור') : null))),
      el('h4', {}, `מצרכים (${ingredients.length})`), picker.tools, picker.list, picker.addButton(r.title),
      r.steps.length ? el('h4', {}, 'אופן הכנה') : null,
      el('ol', { class: 'steps', dir: 'auto' }, r.steps.map((s) => el('li', { dir: 'auto' }, s))),
      el('div', { class: 'row', style: 'margin-top:14px' },
        el('button', { class: 'btn ghost', onclick: () => editRecipe(r) }, '✎ עריכה'),
        el('button', { class: 'btn ghost', onclick: async () => {
          if (!confirm(`למחוק את "${r.title}" מספר המתכונים?`)) return;
          await api('/api/recipes/' + r.id, { method: 'DELETE' });
          closeModal();
          toast('המתכון נמחק');
          loadBook();
        } }, '🗑 מחיקה')));
  }

  function editRecipe(r) {
    const draft = r ? structuredClone(r) : { title: '', image: '', source_url: '', ingredients: [{ name: '', measure: '' }], steps: [''], notes: '', tags: [] };
    const title = el('input', { type: 'text', value: draft.title, placeholder: 'למשל: עוגת השוקולד של סבתא' });
    const image = el('input', { type: 'url', value: draft.image || '', placeholder: 'https://…', dir: 'ltr' });
    const source = el('input', { type: 'url', value: draft.source_url || '', placeholder: 'https://…', dir: 'ltr' });
    const notes = el('textarea', { rows: 2 }, draft.notes || '');
    const ingList = el('ul', { class: 'edit-list', style: 'list-style:none;padding:0' });
    const stepList = el('ol', { class: 'edit-list', style: 'padding-inline-start:20px' });
    const ingRow = (i) => el('li', {}, el('input', { class: 'm', type: 'text', value: i.measure, placeholder: 'כמות' }), el('input', { type: 'text', value: i.name, placeholder: 'מצרך' }),
      el('button', { class: 'mini danger', type: 'button', onclick: (e) => e.target.closest('li').remove() }, '✕'));
    const stepRow = (s) => el('li', {}, el('textarea', { rows: 2 }, s), el('button', { class: 'mini danger', type: 'button', onclick: (e) => e.target.closest('li').remove() }, '✕'));
    draft.ingredients.forEach((i) => ingList.append(ingRow(i)));
    draft.steps.forEach((s) => stepList.append(stepRow(s)));
    modal(
      el('h3', {}, r?.id ? 'עריכת מתכון' : 'מתכון חדש'),
      el('label', { class: 'field' }, el('span', {}, 'שם המתכון'), title),
      el('h4', {}, 'מצרכים'), ingList, el('button', { class: 'btn ghost small', onclick: () => ingList.append(ingRow({ name: '', measure: '' })) }, '+ מצרך'),
      el('h4', {}, 'אופן הכנה'), stepList, el('button', { class: 'btn ghost small', onclick: () => stepList.append(stepRow('')) }, '+ שלב'),
      el('label', { class: 'field' }, el('span', {}, 'הערות'), notes),
      el('label', { class: 'field' }, el('span', {}, 'קישור לתמונה (לא חובה)'), image),
      el('label', { class: 'field' }, el('span', {}, 'קישור למקור (לא חובה)'), source),
      el('button', { class: 'btn primary', onclick: async () => {
        const payload = {
          title: title.value.trim(), image: image.value.trim() || null, source_url: source.value.trim() || null, notes: notes.value.trim() || null, tags: draft.tags || [],
          ingredients: [...ingList.children].map((li) => ({ measure: li.children[0].value.trim(), name: li.children[1].value.trim() })).filter((i) => i.name),
          steps: [...stepList.children].map((li) => li.querySelector('textarea').value.trim()).filter(Boolean),
        };
        if (!payload.title) return toast('חסר שם למתכון');
        try {
          await api(r?.id ? '/api/recipes/' + r.id : '/api/recipes', { method: r?.id ? 'PUT' : 'POST', body: payload });
          closeModal();
          toast('המתכון נשמר 📖');
          loadBook();
        } catch (e) { toast(e.message); }
      } }, '💾 שמירה'));
    title.focus();
  }

  function importDialog() {
    const url = el('input', { type: 'url', placeholder: 'הדבק קישור למתכון מכל אתר…', dir: 'ltr', style: 'width:100%' });
    const go = el('button', { class: 'btn primary', onclick: async () => {
      if (!/^https?:\/\//.test(url.value.trim())) return toast('הדבק קישור שמתחיל ב-https://');
      go.disabled = true;
      go.textContent = 'קורא את המתכון…';
      try {
        const { recipe } = await api('/api/recipes/import', { body: { url: url.value.trim() } });
        editRecipe(recipe); // review before saving
        toast('בדקו שהכל נכון ולחצו שמירה');
      } catch (e) { toast(e.message); go.disabled = false; go.textContent = 'ייבוא'; }
    } }, 'ייבוא');
    modal(el('h3', {}, '🔗 ייבוא מתכון מקישור'),
      el('p', { class: 'muted' }, 'עובד עם רוב אתרי המתכונים בעברית ובאנגלית. המתכון ייפתח לעריכה לפני שמירה.'),
      el('div', { class: 'row' }, url, go));
    url.focus();
  }

  $('#bookSearch').addEventListener('input', renderBook);
  $('#bookNew').addEventListener('click', () => editRecipe(null));
  $('#bookImport').addEventListener('click', importDialog);

  /* ================= לשוניות ================= */
  function showTab(which) {
    $('#tabList').setAttribute('aria-selected', which === 'list');
    $('#tabBook').setAttribute('aria-selected', which === 'book');
    $('#viewList').hidden = which !== 'list';
    $('#viewBook').hidden = which !== 'book';
    if (which === 'book' && !book) loadBook();
    history.replaceState(null, '', which === 'book' ? '#book' : '#');
  }
  $('#tabList').addEventListener('click', () => showTab('list'));
  $('#tabBook').addEventListener('click', () => showTab('book'));

  render();
  showTab(location.hash === '#book' ? 'book' : 'list');
  await flush();
  await pull();

  window.__helper = { normalize, categorize, findDuplicate, duplicateGroups, get items() { return [...items.values()]; }, get pending() { return pending; } };
})();
