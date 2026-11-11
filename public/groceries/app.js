/* קניות ומתכונים
 * - רשימה משותפת לכל בני הבית (מסונכרנת לשרת, עובדת גם בלי קליטה ומסתנכרנת כשחוזרים לרשת)
 * - קטגוריות, זיהוי כפילויות ומיזוג
 * - חיפוש מתכונים מכל העולם, בכל השפות, מסודרים לפי רלוונטיות ומתורגמים לעברית; ❤ שומר עותק בספר המתכונים
 * - ספר מתכונים משפחתי בפורמט שלנו (שם, מאיפה הגיע, מצרכים וכמויות, שלבים), עריכה במקום עם שמירה אוטומטית
 * - קטוזיס (keto.js): דשבורד, יומן ארוחות, מחשבון, ומתג שמוסיף ערכי תזונה ליד כל מצרך ברשימה
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
  let { items, pending, since, hideChecked: legacyHide } = loadCache();
  // "Hide checked items" is a per-person preference that follows them to every device.
  const listPrefs = H.prefs('groceries', { hideChecked: false }, legacyHide ? { hideChecked: true } : null);

  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c) return { items: new Map(c.items.map((i) => [i.id, i])), pending: c.pending || [], since: c.since || 0, hideChecked: !!c.hideChecked };
    } catch (_) { /* ignore */ }
    return { items: new Map(), pending: [], since: 0, hideChecked: false };
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ items: [...items.values()], pending, since })); } catch (_) { /* ignore */ }
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
    const [mark, text] = ok ? (pending.length ? ['⟳', 'מסנכרן…'] : ['✓', 'מסונכרן']) : ['⚠', 'אין חיבור – נשמר במכשיר'];
    s.title = text;
    s.textContent = '';
    s.append(el('span', { 'aria-hidden': 'true' }, mark), el('span', { class: 'sync-text' }, ' ' + text));
  }

  window.addEventListener('online', () => { flush(); pull(); });
  window.addEventListener('helper:groceries-changed', () => pull());
  window.addEventListener('helper:recipes-changed', () => { book = null; if (!$('#viewBook').hidden) loadBook(); });
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
    $('#hideChecked').checked = listPrefs.hideChecked;
    const all = [...items.values()];
    for (const cat of CATEGORIES) {
      let catItems = all.filter((i) => (catById[i.cat] ? i.cat : 'other') === cat.id);
      if (!catItems.length) continue;
      const remaining = catItems.filter((i) => !i.checked).length;
      if (listPrefs.hideChecked) catItems = catItems.filter((i) => !i.checked);
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
      el('label', { class: 'main' }, cb, nameEl, it.from ? el('small', { class: 'tag' }, `🍳 ${it.from}`) : null, Keto.annotate(it)),
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

  $('#hideChecked').addEventListener('change', (e) => { H.savePrefs('groceries', { hideChecked: e.target.checked }); render(); });
  window.addEventListener('helper:prefs', (e) => { if (e.detail === 'groceries') render(); });
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

  /* ================= חיפוש מתכונים מכל העולם ================= */
  const normUrl = (u) => { try { const x = new URL(u); x.hash = ''; return x.href.replace(/\/$/, ''); } catch (_) { return u || ''; } };
  const webCache = new Map(); // url -> translated recipe (for this visit)
  let lastSearch = null;

  async function ensureBook() {
    if (!book) { try { book = (await api('/api/recipes')).recipes; } catch (_) { book = book || []; } }
    return book;
  }
  const savedCopy = (url) => (book || []).find((r) => r.source_url && normUrl(r.source_url) === normUrl(url));

  function googleLink(q) {
    return el('a', { href: 'https://www.google.com/search?q=' + encodeURIComponent('מתכון ' + q), target: '_blank', rel: 'noopener' }, `🔎 חפש "${q}" בגוגל`);
  }
  const loading = (t) => el('div', { class: 'loading' }, el('span', { class: 'spinner' }), t);

  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6s-7.6-4.6-9.4-9.3C1.4 8.1 3.4 4.6 6.9 4.6c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.5 0 5.5 3.5 4.3 6.7-1.8 4.7-9.4 9.3-9.4 9.3z"/></svg>';

  /** Instagram-style heart: saves a copy of the web recipe to our book, or takes it out again. */
  function heart(url, hint, cls = '') {
    const b = el('button', { type: 'button', class: 'heart ' + cls, 'data-url': normUrl(url), html: HEART });
    const paint = () => {
      const on = !!savedCopy(url);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'נשמר בספר המתכונים – לחיצה מוציאה' : 'שמירה בספר המתכונים');
      b.title = on ? 'נשמר בספר המתכונים' : 'שמירה בספר המתכונים';
    };
    paint();
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (b.classList.contains('busy')) return;
      b.classList.remove('pop');
      void b.offsetWidth;
      b.classList.add('pop', 'busy');
      try { await toggleSave(url, hint); } catch (err) { toast(err.message); }
      b.classList.remove('busy');
      paintHearts();
    });
    b.paint = paint;
    return b;
  }
  function paintHearts() { document.querySelectorAll('.heart[data-url]').forEach((h) => h.paint && h.paint()); }

  async function toggleSave(url, hint) {
    await ensureBook();
    const existing = savedCopy(url);
    if (existing) {
      await api('/api/recipes/' + existing.id, { method: 'DELETE' });
      book = book.filter((r) => r.id !== existing.id);
      paintHearts();
      toast(`"${existing.title}" הוצא מספר המתכונים`, 'בטל', async () => {
        const { id, created_by, created_at, updated_at, ...copy } = existing;
        const r = await api('/api/recipes', { body: copy });
        book.unshift({ ...copy, id: r.id });
        paintHearts();
        renderBook();
      });
      renderBook();
      return;
    }
    document.querySelectorAll(`.heart[data-url="${CSS.escape(normUrl(url))}"]`).forEach((h) => h.classList.add('on'));
    const recipe = webCache.get(url) || (await api('/api/recipes/world/open', { body: { url, site: hint?.site, country: hint?.country } })).recipe;
    webCache.set(url, recipe);
    const r = await api('/api/recipes', { body: recipe });
    const saved = { ...recipe, id: r.id, updated_at: r.updated_at };
    book.unshift(saved);
    renderBook();
    toast(`❤ "${recipe.title}" נשמר בספר המתכונים שלנו`, 'עריכה', () => openBookRecipe(saved));
  }

  async function runSearch(q, fresh) {
    const steps = ['מחפש בשפות המקור של המנה…', 'קורא אתרי מתכונים מכל העולם…', 'ממיין לפי רלוונטיות…', 'עוד רגע…'];
    const line = el('span', {}, steps[0]);
    modal(el('h3', {}, `🌍 מחפש "${q}"`), el('div', { class: 'loading' }, el('span', { class: 'spinner' }), line),
      el('p', { class: 'muted' }, 'החיפוש עובר על אתרים בכמה שפות, ולכן לוקח עד דקה. כל מתכון שתפתחו יתורגם לעברית.'));
    let i = 0;
    const tick = setInterval(() => { line.textContent = steps[Math.min(++i, steps.length - 1)]; }, 9000);
    let results;
    try {
      results = (await api('/api/recipes/world?q=' + encodeURIComponent(q) + (fresh ? '&fresh=1' : ''))).results;
    } catch (e) {
      clearInterval(tick);
      if (e.code === 'ai_not_configured') return runMealDbSearch(q);
      modal(el('h3', {}, 'החיפוש לא הצליח'), el('p', {}, e.message),
        el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: () => runSearch(q) }, 'לנסות שוב'), googleLink(q)));
      return;
    }
    clearInterval(tick);
    await ensureBook();
    lastSearch = { q, results };
    showResults();
  }

  function resultCard(r) {
    return el('article', { class: 'wcard' },
      el('button', { class: 'wcard-open', onclick: () => showWebRecipe(r) },
        r.image ? el('img', { src: r.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => { e.target.replaceWith(el('div', { class: 'ph' }, '🍲')); } }) : el('div', { class: 'ph' }, '🍲'),
        el('div', { class: 'wcard-body' },
          el('b', {}, r.title_he),
          el('small', { class: 'orig', dir: 'auto' }, r.title),
          el('small', { class: 'where' }, [r.site, r.country].filter(Boolean).join(' · ')),
          r.snippet_he ? el('p', { class: 'snip' }, r.snippet_he) : null,
          el('div', { class: 'wcard-tags' }, r.lang ? el('span', { class: 'tag' }, r.lang) : null, el('span', { class: 'tag match' }, `התאמה ${r.relevance}%`)))),
      heart(r.url, r, 'on-card'));
  }

  function showResults() {
    const { q, results } = lastSearch;
    if (!results.length) {
      modal(el('h3', {}, `לא נמצאו מתכונים ל"${q}"`), el('p', {}, 'נסו לנסח אחרת, למשל שם המנה ומרכיב עיקרי.'), el('p', {}, googleLink(q)));
      return;
    }
    const langs = [...new Set(results.map((r) => r.lang).filter(Boolean))];
    modal(
      el('h3', {}, `🌍 ${results.length} מתכונים מכל העולם ל"${q}"`),
      el('p', { class: 'muted' }, `מסודרים לפי התאמה${langs.length > 1 ? `, מ-${langs.length} שפות (${langs.join(', ')})` : ''}. פתיחת מתכון מתרגמת אותו לעברית; ❤ שומר עותק בספר המתכונים שלנו.`),
      el('div', { class: 'results world' }, results.map(resultCard)),
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', { class: 'btn ghost small', onclick: () => runSearch(q, true) }, '⟳ חיפוש מחדש'), googleLink(q)));
  }

  function metaChips(meta) {
    if (!meta) return null;
    const chips = [meta.servings && `🍽 ${meta.servings}`, meta.time && `⏱ ${meta.time}`, meta.lang && `🌐 תורגם מ${meta.lang}`].filter(Boolean);
    return chips.length ? el('div', { class: 'meta-chips' }, chips.map((c) => el('span', { class: 'tag' }, c))) : null;
  }

  async function showWebRecipe(r) {
    modal(el('h3', {}, r.title_he), loading('פותח את המתכון ומתרגם לעברית…'));
    let recipe = webCache.get(r.url);
    if (!recipe) {
      try { recipe = (await api('/api/recipes/world/open', { body: { url: r.url, site: r.site, country: r.country } })).recipe; } catch (e) {
        modal(el('button', { class: 'btn ghost small back', onclick: showResults }, '→ חזרה לתוצאות'),
          el('h3', {}, 'לא הצלחתי לפתוח את המתכון'), el('p', {}, e.message),
          el('p', {}, el('a', { href: r.url, target: '_blank', rel: 'noopener' }, '🔗 פתיחה באתר המקורי')));
        return;
      }
      webCache.set(r.url, recipe);
    }
    const ingredients = recipe.ingredients.map((i) => ({ he: i.name, measure: i.measure }));
    const picker = ingredientPicker(ingredients);
    modal(
      lastSearch ? el('button', { class: 'btn ghost small back', onclick: showResults }, '→ חזרה לתוצאות') : null,
      el('div', { class: 'r-hero' },
        recipe.image ? el('img', { src: recipe.image, alt: '', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null,
        heart(r.url, r, 'big')),
      el('h3', { class: 'r-title' }, recipe.title),
      el('p', { class: 'r-sub' }, recipe.subtitle),
      metaChips(recipe.meta),
      recipe.notes ? el('p', { class: 'r-notes' }, recipe.notes) : null,
      el('h4', {}, `מצרכים (${ingredients.length})`), picker.tools, picker.list,
      el('div', { class: 'row' }, picker.addButton(recipe.title)),
      el('h4', {}, 'אופן ההכנה'),
      el('ol', { class: 'steps he' }, recipe.steps.map((s) => el('li', {}, s))),
      el('p', {}, el('a', { href: recipe.source_url, target: '_blank', rel: 'noopener' }, '🔗 המתכון המקורי')));
  }

  /* ---- גיבוי כשאין מפתח לעוזר החכם: מאגר TheMealDB באנגלית ---- */
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
  async function runMealDbSearch(q) {
    const en = translateQuery(q);
    if (!en) { modal(el('h3', {}, 'לא הצלחתי לתרגם את החיפוש'), el('p', {}, 'החיפוש העולמי צריך את העוזר החכם (מפתח API). בינתיים: '), el('p', {}, googleLink(q))); return; }
    try {
      let { meals } = await mealdb('search.php?s=' + encodeURIComponent(en));
      if (!meals) meals = ((await mealdb('filter.php?i=' + encodeURIComponent(en.replace(/\s+/g, '_')))).meals || []).slice(0, 12);
      if (!meals.length) { modal(el('h3', {}, `לא נמצאו מתכונים ל"${q}"`), el('p', {}, googleLink(q))); return; }
      modal(el('h3', {}, `🍳 ${meals.length} מתכונים ל"${q}" (${en})`), el('p', { class: 'muted' }, 'החיפוש העולמי לא זמין כרגע, אלה תוצאות ממאגר באנגלית.'),
        el('div', { class: 'results' }, meals.map((m) => el('button', { class: 'result', onclick: () => showMealDb(m.idMeal, q) },
          el('img', { src: m.strMealThumb + '/preview', alt: '', loading: 'lazy' }), el('span', {}, m.strMeal)))));
    } catch (_) {
      modal(el('h3', {}, 'אין חיבור למאגר המתכונים'), el('p', {}, googleLink(q)));
    }
  }
  async function showMealDb(id, backQuery) {
    modal(loading('טוען מתכון…'));
    let r = null;
    try { r = (await mealdb('lookup.php?i=' + encodeURIComponent(id))).meals?.[0]; } catch (_) { /* ignore */ }
    if (!r) { modal(el('h3', {}, 'שגיאה בטעינת המתכון'), el('button', { class: 'btn', onclick: () => runMealDbSearch(backQuery) }, '→ חזרה לתוצאות')); return; }
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
          title: r.strMeal, subtitle: `מקור: TheMealDB${r.strArea ? ` (${r.strArea})` : ''}`, image: r.strMealThumb, source_url: r.strSource || `https://www.themealdb.com/meal/${r.idMeal}`,
          ingredients: ingredients.map((i) => ({ name: i.he, measure: i.measure })), steps, notes: [r.strCategory, r.strArea].filter(Boolean).join(' · '), tags: [],
        } });
        saveBtn.textContent = '✓ נשמר בספר המתכונים';
        book = null;
      } catch (e) { saveBtn.disabled = false; toast(e.message); }
    } }, '❤ שמור לספר המתכונים');
    modal(
      el('button', { class: 'btn ghost small back', onclick: () => runMealDbSearch(backQuery) }, '→ חזרה לתוצאות'),
      el('h3', { class: 'r-title', dir: 'auto' }, r.strMeal),
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
    if (!grid || $('#viewBook').hidden) return;
    grid.textContent = '';
    const q = $('#bookSearch').value.trim().toLowerCase();
    const list = (book || []).filter((r) => !q || [r.title, r.subtitle, r.notes, ...(r.tags || []), ...r.ingredients.map((i) => i.name)].join(' ').toLowerCase().includes(q));
    if (!list.length) {
      grid.append(el('p', { class: 'empty card', style: 'grid-column:1/-1' }, book?.length ? 'לא נמצאו מתכונים' : 'ספר המתכונים ריק. סמנו ❤ על מתכון בחיפוש, הוסיפו מתכון משלכם או ייבאו מקישור 📖'));
      return;
    }
    for (const r of list) {
      grid.append(el('button', { class: 'book-card', onclick: () => openBookRecipe(r) },
        el('div', { class: 'ph', style: r.image ? `background-image:url("${encodeURI(r.image)}")` : '' }, r.image ? '' : '🍲'),
        el('b', {}, r.title), r.subtitle ? el('small', { class: 'sub' }, r.subtitle) : null, el('small', {}, `${r.ingredients.length} מצרכים · ${r.steps.length} שלבים`)));
    }
  }

  const autosize = (ta) => { ta.style.blockSize = 'auto'; ta.style.blockSize = ta.scrollHeight + 2 + 'px'; };

  /** Our recipe format, edited in place: name, where it came from, ingredients with amounts, steps one by one. Saves as you type. */
  function openBookRecipe(r) {
    const draft = structuredClone(r);
    let timer = null, dirty = false, saving = null;
    const status = el('span', { class: 'save-status', role: 'status', 'aria-live': 'polite' }, draft.id ? 'כל שינוי נשמר מעצמו' : 'המתכון יישמר כשתתנו לו שם');

    const collect = () => {
      draft.title = title.value.trim();
      draft.subtitle = subtitle.value.trim() || null;
      draft.ingredients = [...ingList.children].map((li) => ({ measure: li.querySelector('.m').value.trim(), name: li.querySelector('.n').value.trim() })).filter((i) => i.name || i.measure);
      draft.steps = [...stepList.children].map((li) => li.querySelector('textarea').value.trim()).filter(Boolean);
      draft.notes = notes.value.trim() || null;
      draft.image = image.value.trim() || null;
      draft.source_url = source.value.trim() || null;
    };
    const save = async () => {
      clearTimeout(timer);
      if (!dirty) return;
      collect();
      if (!draft.title) { status.textContent = 'חסר שם למתכון'; return; }
      dirty = false;
      status.textContent = 'שומר…';
      const payload = { title: draft.title, subtitle: draft.subtitle, meta: draft.meta || null, image: draft.image, source_url: draft.source_url, notes: draft.notes, tags: draft.tags || [], ingredients: draft.ingredients.filter((i) => i.name), steps: draft.steps };
      saving = (async () => {
        try {
          const res = await api(draft.id ? '/api/recipes/' + draft.id : '/api/recipes', { method: draft.id ? 'PUT' : 'POST', body: payload });
          const isNew = !draft.id;
          draft.id = res.id;
          await ensureBook();
          book = [{ ...draft, ...payload, id: res.id, updated_at: res.updated_at }, ...book.filter((x) => x.id !== res.id)];
          status.textContent = isNew ? '✓ נוסף לספר המתכונים' : '✓ נשמר';
          del.hidden = false;
        } catch (e) { dirty = true; status.textContent = '⚠ לא נשמר: ' + e.message; }
      })();
      await saving;
    };
    const touch = () => { dirty = true; status.textContent = '…'; clearTimeout(timer); timer = setTimeout(save, 700); };

    // One-line fields that wrap and grow, so a long name is never cut off on a phone.
    const line = (cls, value, placeholder, label, onEnter) => {
      const ta = el('textarea', { class: cls, rows: 1, placeholder, 'aria-label': label, oninput: () => { ta.value = ta.value.replace(/\n/g, ' '); autosize(ta); touch(); } }, value || '');
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(e); } });
      requestAnimationFrame(() => autosize(ta));
      return ta;
    };
    const title = line('r-title-input', draft.title, 'שם המתכון', 'שם המתכון', () => subtitle.focus());
    const subtitle = line('r-sub-input', draft.subtitle, 'מאיפה הגיע המתכון (למשל: מסבתא רחל, מאתר…)', 'מאיפה הגיע המתכון', () => ingList.querySelector('.m')?.focus());

    const ingList = el('ul', { class: 'ing-edit' });
    const ingRow = (i = { measure: '', name: '' }) => {
      const m = el('input', { class: 'm', type: 'text', value: i.measure, placeholder: 'כמות', 'aria-label': 'כמות', oninput: touch });
      const n = line('n', i.name, 'מצרך', 'מצרך', () => { const nx = ingRow(); li.after(nx); nx.querySelector('.m').focus(); });
      const li = el('li', {}, m, n, el('button', { class: 'mini danger', type: 'button', 'aria-label': 'הסר מצרך', onclick: () => { li.remove(); touch(); } }, '✕'));
      n.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !n.value && !m.value && ingList.children.length > 1) { e.preventDefault(); const prev = li.previousElementSibling || li.nextElementSibling; li.remove(); touch(); prev?.querySelector('.n').focus(); }
      });
      m.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); n.focus(); } });
      return li;
    };
    (draft.ingredients.length ? draft.ingredients : [{ measure: '', name: '' }]).forEach((i) => ingList.append(ingRow(i)));

    const stepList = el('ol', { class: 'step-edit' });
    const stepRow = (s = '') => {
      const ta = el('textarea', { rows: 1, 'aria-label': 'שלב', placeholder: 'מה עושים בשלב הזה…', oninput: () => { autosize(ta); touch(); } }, s);
      const li = el('li', {}, ta,
        el('div', { class: 'step-tools' },
          el('button', { class: 'mini', type: 'button', title: 'למעלה', 'aria-label': 'הזז שלב למעלה', onclick: () => { if (li.previousElementSibling) { li.previousElementSibling.before(li); touch(); } } }, '↑'),
          el('button', { class: 'mini danger', type: 'button', 'aria-label': 'מחק שלב', onclick: () => { li.remove(); touch(); } }, '✕')));
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const nx = stepRow(); li.after(nx); nx.querySelector('textarea').focus(); }
      });
      requestAnimationFrame(() => autosize(ta));
      return li;
    };
    (draft.steps.length ? draft.steps : ['']).forEach((s) => stepList.append(stepRow(s)));

    const notes = el('textarea', { rows: 2, placeholder: 'טיפים, תחליפים, מה שינינו…', oninput: (e) => { autosize(e.target); touch(); } }, draft.notes || '');
    const image = el('input', { type: 'url', value: draft.image || '', placeholder: 'https://…', dir: 'ltr', oninput: touch });
    const source = el('input', { type: 'url', value: draft.source_url || '', placeholder: 'https://…', dir: 'ltr', oninput: touch });

    const del = el('button', { class: 'btn ghost', hidden: !draft.id, onclick: async () => {
      if (!confirm(`למחוק את "${draft.title}" מספר המתכונים?`)) return;
      clearTimeout(timer);
      dirty = false;
      await api('/api/recipes/' + draft.id, { method: 'DELETE' });
      book = (book || []).filter((x) => x.id !== draft.id);
      closeModal();
      toast('המתכון נמחק');
      renderBook();
    } }, '🗑 מחיקה');

    const shop = el('button', { class: 'btn primary', onclick: async () => {
      await save();
      collect();
      const ingredients = draft.ingredients.filter((i) => i.name).map((i) => ({ he: i.name, measure: i.measure }));
      if (!ingredients.length) return toast('אין עדיין מצרכים');
      const picker = ingredientPicker(ingredients);
      modal(el('button', { class: 'btn ghost small back', onclick: () => openBookRecipe(book.find((x) => x.id === draft.id) || draft) }, '→ חזרה למתכון'),
        el('h3', {}, `🛒 מצרכים מ"${draft.title}"`), picker.tools, picker.list, picker.addButton(draft.title));
    } }, '🛒 מצרכים לרשימת הקניות');

    modal(
      el('div', { class: 'r-hero' }, draft.image ? el('img', { src: draft.image, alt: '', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null),
      title, subtitle,
      metaChips(draft.meta),
      el('div', { class: 'edit-hint' }, status, el('small', { class: 'muted' }, 'Enter מוסיף שורה חדשה')),
      el('h4', {}, 'מצרכים וכמויות'), ingList,
      el('button', { class: 'btn ghost small', onclick: () => { const li = ingRow(); ingList.append(li); li.querySelector('.m').focus(); } }, '+ מצרך'),
      el('h4', {}, 'אופן ההכנה, שלב אחר שלב'), stepList,
      el('button', { class: 'btn ghost small', onclick: () => { const li = stepRow(); stepList.append(li); li.querySelector('textarea').focus(); } }, '+ שלב'),
      el('h4', {}, 'הערות'), notes,
      el('details', { class: 'more' }, el('summary', {}, 'תמונה וקישור למקור'),
        el('label', { class: 'field' }, el('span', {}, 'קישור לתמונה'), image),
        el('label', { class: 'field' }, el('span', {}, 'קישור למתכון המקורי'), source)),
      el('div', { class: 'row', style: 'margin-top:14px' }, shop,
        draft.source_url ? el('a', { class: 'btn ghost', href: draft.source_url, target: '_blank', rel: 'noopener' }, '🔗 המקור') : null, del));
    requestAnimationFrame(() => autosize(notes));
    if (!draft.id) title.focus();

    // Closing the window saves whatever is still waiting.
    const m = document.getElementById('modal');
    const watch = new MutationObserver(() => {
      if (m.hidden || !document.body.contains(title)) { watch.disconnect(); save().then(renderBook); }
    });
    watch.observe(m, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver((_, obs) => { if (!document.body.contains(title)) { obs.disconnect(); save().then(renderBook); } }).observe(document.getElementById('modalBody'), { childList: true });
  }

  function importDialog() {
    const url = el('input', { type: 'url', placeholder: 'הדבק קישור למתכון מכל אתר…', dir: 'ltr', style: 'width:100%' });
    const go = el('button', { class: 'btn primary', onclick: async () => {
      const link = url.value.trim();
      if (!/^https?:\/\//.test(link)) return toast('הדבק קישור שמתחיל ב-https://');
      go.disabled = true;
      go.textContent = 'קורא ומתרגם…';
      try {
        let recipe;
        try { recipe = (await api('/api/recipes/world/open', { body: { url: link } })).recipe; } catch (e) {
          if (e.code !== 'ai_not_configured') throw e;
          recipe = (await api('/api/recipes/import', { body: { url: link } })).recipe;
          recipe.subtitle = `מקור: ${new URL(link).hostname.replace(/^www\./, '')}`;
        }
        const r = await api('/api/recipes', { body: recipe });
        await ensureBook();
        const saved = { ...recipe, id: r.id };
        book.unshift(saved);
        openBookRecipe(saved);
        toast('המתכון נוסף לספר – אפשר לערוך ישר כאן');
      } catch (e) { toast(e.message); go.disabled = false; go.textContent = 'ייבוא'; }
    } }, 'ייבוא');
    modal(el('h3', {}, '🔗 ייבוא מתכון מקישור'),
      el('p', { class: 'muted' }, 'עובד עם אתרי מתכונים בכל שפה. המתכון יתורגם לעברית, יישמר בספר וייפתח לעריכה.'),
      el('div', { class: 'row' }, url, go));
    url.focus();
  }

  $('#bookSearch').addEventListener('input', renderBook);
  $('#bookNew').addEventListener('click', () => openBookRecipe({ title: '', subtitle: '', image: '', source_url: '', ingredients: [], steps: [], notes: '', tags: [] }));
  $('#bookImport').addEventListener('click', importDialog);

  /* ================= לשוניות ================= */
  let ketoMounted = false;
  function showTab(which) {
    for (const [tab, view, name] of [['#tabList', '#viewList', 'list'], ['#tabBook', '#viewBook', 'book'], ['#tabKeto', '#viewKeto', 'keto']]) {
      $(tab).setAttribute('aria-selected', String(which === name));
      $(view).hidden = which !== name;
    }
    if (which === 'book') { if (!book) loadBook(); else renderBook(); }
    if (which === 'keto' && !ketoMounted) { ketoMounted = true; Keto.mount($('#viewKeto')); }
    history.replaceState(null, '', which === 'list' ? '#' : '#' + which);
  }
  H.showTab = showTab;
  $('#tabList').addEventListener('click', () => showTab('list'));
  $('#tabBook').addEventListener('click', () => showTab('book'));
  $('#tabKeto').addEventListener('click', () => showTab('keto'));
  window.addEventListener('keto:changed', (e) => { if (e.detail !== 'state' || Keto.enabled) render(); });

  render();
  showTab(['#book', '#keto'].includes(location.hash) ? location.hash.slice(1) : 'list');
  await flush();
  await pull();

  window.__helper = { normalize, categorize, findDuplicate, duplicateGroups, get items() { return [...items.values()]; }, get pending() { return pending; } };
})();
