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
  // lists: the household's named lists (from the server); cur: the list on show on this device (null: the main list)
  let { items, pending, since, hideChecked: legacyHide, lists, cur } = loadCache();
  const inCur = (i) => (i.list || null) === cur;
  const here = () => [...items.values()].filter(inCur);
  let auto = { fridge: null, items: [] };   // the automatic list's suggestions (loadAuto)
  // "Hide checked items" is a per-person preference that follows them to every device.
  const listPrefs = H.prefs('groceries', { hideChecked: false }, legacyHide ? { hideChecked: true } : null);

  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c) return { items: new Map(c.items.map((i) => [i.id, i])), pending: c.pending || [], since: c.since || 0, hideChecked: !!c.hideChecked, lists: c.lists || [], cur: c.cur || null };
    } catch (_) { /* ignore */ }
    return { items: new Map(), pending: [], since: 0, hideChecked: false, lists: [], cur: null };
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ items: [...items.values()], pending, since, lists, cur })); } catch (_) { /* ignore */ }
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function upsert(item) {
    items.set(item.id, item);
    queue({ op: 'upsert', item: { id: item.id, name: item.name, cat: item.cat, checked: !!item.checked, qty: item.qty || 1, from: item.from, list: item.list || null } });
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
        else items.set(it.id, { id: it.id, name: it.name, cat: it.cat, checked: it.checked, qty: it.qty, from: it.from, list: it.list || null });
      }
      if (r.items.length) since = Math.max(since, ...r.items.map((i) => i.updatedAt));
      const listsChanged = r.lists && JSON.stringify(r.lists) !== JSON.stringify(lists);
      if (listsChanged) lists = r.lists;
      saveCache();
      setSync(true);
      if (r.items.length || listsChanged) render();
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
    for (const it of here()) if (it.id !== exceptId && normalize(it.name) === key) return it;
    return null;
  }
  function duplicateGroups() {
    const groups = new Map();
    for (const it of here()) {
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
    const item = { id: uid(), name: name.trim(), cat: cat || categorize(name), checked: false, qty: 1, from, list: cur };
    upsert(item);
    return { item, dup: false };
  }

  /* ================= רינדור הרשימה ================= */
  function categoryOptions(selected) {
    return CATEGORIES.map((c) => el('option', { value: c.id, selected: c.id === selected }, `${c.icon} ${c.name}`));
  }

  function render() {
    renderLists();
    const list = $('#list');
    list.textContent = '';
    $('#hideChecked').checked = listPrefs.hideChecked;
    const all = here();
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
    if (!all.length) list.append(el('p', { class: 'empty card' }, cur ? 'הרשימה הזאת ריקה. הוסיפו לה פריטים 🙂' : 'הרשימה ריקה. הוסף פריטים או חפש מתכון 🙂'));
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
    // only the item's own category until the select is touched: a full list on every row was ~400 options on the page,
    // most of the load's blocking time (the readiness bar, TBT); the rest are filled in before the picker opens
    const own = categoryOptions(it.cat).filter((o) => o.selected);
    const catSel = el('select', { class: 'cat-select', 'aria-label': 'שנה קטגוריה', onchange: () => upsert({ ...it, cat: catSel.value }) }, own.length ? own : categoryOptions(it.cat));
    const fill = () => { if (catSel.options.length < CATEGORIES.length) catSel.replaceChildren(...categoryOptions(it.cat)); };
    for (const ev of ['pointerdown', 'focus', 'keydown', 'touchstart']) catSel.addEventListener(ev, fill, { passive: true });
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

  /* ================= הרשימות ================= */
  // the main list, and beside it named lists anyone in the household can open ("שבת", "מסיבה"). Only the one who opened
  // a list, or a household admin, may delete it (the server decides: canDelete); a delete can be undone for a few seconds.
  const listsBar = el('nav', { class: 'lists-bar', 'aria-label': 'הרשימות' });
  $('#addForm').before(listsBar);
  function renderLists() {
    if (cur && !lists.some((l) => l.id === cur && l.kind === 'list')) cur = null;   // deleted, or finished into the archive
    const show = (id) => { if (cur === id) return; cur = id; saveCache(); render(); $('#addHint').textContent = ''; };
    const chip = (id, name) => el('button', { type: 'button', class: 'chip list-chip', 'aria-pressed': String(cur === id), onclick: () => show(id) }, name);
    const on = lists.find((l) => l.id === cur);
    const autoN = auto.items.filter((i) => !isWaiting(i.name)).length;   // suggestions not on the list yet
    listsBar.replaceChildren(
      chip(null, '🛒 הרשימה'),
      ...lists.filter((l) => l.kind === 'list').map((l) => chip(l.id, l.name)),
      el('button', { type: 'button', class: 'chip list-auto', 'aria-label': autoN ? `אוטומטית: ${nItems(autoN)} מהמקרר` : 'אוטומטית: הצעות מהמקרר', onclick: autoList },
        '🤖 אוטומטית', autoN ? el('span', { class: 'list-auto-n' }, String(autoN)) : ''),
      el('button', { type: 'button', class: 'chip list-new', onclick: newList }, '＋ רשימה חדשה'),
      el('button', { type: 'button', class: 'chip list-saved', onclick: savedLists }, '📚 שמורות'),
      on?.canDelete ? el('button', { type: 'button', class: 'chip list-del', 'aria-label': `מחיקת הרשימה ${on.name}`, onclick: () => deleteList(on) }, '🗑 מחיקת הרשימה') : '');
  }
  function newList() {
    const input = el('input', { type: 'text', maxlength: '40', dir: 'auto', 'aria-label': 'שם הרשימה', placeholder: 'למשל: שבת, מסיבה, טיול' });
    const go = el('button', { class: 'btn primary', type: 'submit' }, 'פתיחה');
    modal(el('form', { class: 'list-form', onsubmit: async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      go.disabled = true;
      try {
        const r = await api('/api/groceries/lists', { body: { name } });
        lists.push(r.list); cur = r.list.id; saveCache(); closeModal(); render();
        toast(`הרשימה "${name}" נפתחה`);
        $('#addInput').focus();
      } catch (_) { go.disabled = false; toast('לא הצלחתי לפתוח רשימה – בדקו את החיבור'); }
    } },
      el('h2', {}, 'רשימה חדשה'),
      el('label', {}, 'השם', input),
      el('div', { class: 'modal-acts' }, go, el('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'ביטול'))));
    setTimeout(() => input.focus(), 60);
  }
  function deleteList(l) {
    const n = [...items.values()].filter((i) => i.list === l.id).length;
    modal(el('h2', {}, `למחוק את הרשימה "${l.name}"?`),
      el('p', {}, (n ? `יש בה ${n} פריטים. ` : '') + 'היא תימחק לכל בני הבית.'),
      el('div', { class: 'modal-acts' },
        el('button', { class: 'btn danger', type: 'button', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { await api(`/api/groceries/lists/${encodeURIComponent(l.id)}`, { method: 'DELETE' }); }
          catch (err) { closeModal(); toast(err?.status === 403 ? 'רק מי שפתח את הרשימה, או מנהל הבית, יכולים למחוק אותה' : 'המחיקה לא הצליחה – בדקו את החיבור'); return; }
          closeModal();
          lists = lists.filter((x) => x.id !== l.id); if (cur === l.id) cur = null; saveCache(); render();
          toast(`הרשימה "${l.name}" נמחקה`, 'בטל', async () => {
            try {
              await api(`/api/groceries/lists/${encodeURIComponent(l.id)}/restore`, { method: 'POST' });
              if (!lists.some((x) => x.id === l.id)) lists = [...lists, l].sort((a, b) => a.createdAt - b.createdAt);
              cur = l.id; saveCache(); render(); toast('הרשימה חזרה');
            } catch (_) { toast('לא הצלחתי להחזיר אותה'); }
          });
        } }, 'מחיקה'),
        el('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'ביטול')));
  }

  /* The automatic list (the owner, 2026-11-14): what the fridge usually has and is missing now (server/grocery-auto.ts).
     It only suggests: an item goes on the list when someone taps it, never by itself. "לא הפעם" puts one off for a week
     (the person's own preference, so it follows them to every device). */
  const AUTO_WHY = { gone: 'בדרך כלל יש, ועכשיו אין', expired: 'פג תוקף', low: 'נשאר אחד' };
  async function loadAuto() {
    try { auto = await api('/api/groceries/auto', { noRedirect: true }); renderLists(); } catch (_) { /* offline: the chip waits */ }
    return auto;
  }
  const isWaiting = (name) => { const d = findDuplicate(name); return !!d && !d.checked; };
  async function autoList() {
    const box = el('div', { class: 'auto-list' });
    const draw = () => {
      const waiting = auto.items.filter((i) => !isWaiting(i.name));
      box.replaceChildren(
        el('h2', {}, '🤖 רשימה אוטומטית'),
        el('p', { class: 'muted' }, `מה ש${auto.fridge ? `במקרר "${auto.fridge}"` : 'במקררים של הבית'} בדרך כלל יש, ועכשיו חסר. שום דבר לא נכנס לרשימה בלי לחיצה.`),
        waiting.length > 1 ? el('div', { class: 'modal-acts' }, el('button', { class: 'btn primary', type: 'button', onclick: () => take(waiting) }, `＋ הכל אל ${listName()} (${waiting.length})`)) : '',
        auto.items.length ? el('ul', { class: 'auto-rows' }, ...auto.items.map((i) => {
          const on = isWaiting(i.name);
          return el('li', { class: 'auto-row ' + i.why + (on ? ' listed' : '') },
            el('span', { class: 'auto-name' }, i.name, el('small', {}, ` · ${AUTO_WHY[i.why]}`)),
            on ? el('small', { class: 'ok' }, '✓ ברשימה')
              : el('span', { class: 'auto-acts' },
                el('button', { type: 'button', class: 'btn small', 'aria-label': `להוסיף "${i.name}" אל ${listName()}`, onclick: () => take([i]) }, '＋ לרשימה'),
                el('button', { type: 'button', class: 'btn small ghost', 'aria-label': `לא הפעם: ${i.name}`, title: 'לא להציע שבוע', onclick: () => putOff(i) }, 'לא הפעם')));
        })) : el('p', { class: 'muted' }, 'אין מה להשלים כרגע. כשמצרכים ייכנסו למקרר וייגמרו כמה פעמים, הם יופיעו כאן.'),
        el('div', { class: 'modal-acts' }, el('a', { class: 'btn ghost', href: '/food/fridge/' }, '🧊 למקרר'), el('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'סגירה')));
    };
    const take = (xs) => {
      xs.forEach((i) => addByName(i.name, categorize(i.name), 'אוטומטית'));
      toast(xs.length === 1 ? `"${xs[0].name}" נוסף אל ${listName()}` : `${nItems(xs.length)} נוספו אל ${listName()}`);
      render(); draw();
    };
    const putOff = (i) => {
      const until = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), today = new Date().toISOString().slice(0, 10);
      const skip = Object.fromEntries(Object.entries(listPrefs.autoSkip || {}).filter(([, d]) => d >= today));
      H.savePrefs('groceries', { autoSkip: { ...skip, [i.key]: until } });
      auto.items = auto.items.filter((x) => x !== i); renderLists(); draw();
      toast(`"${i.name}" לא יוצע שבוע`);
    };
    draw();
    modal(box);
    await loadAuto(); draw();
  }

  /* Saved lists (the owner, 2026-11-14): templates ("קניות שבועיות", "שבת") and the archive of finished lists, on the
     server for the whole household. A saved list comes back as a new list or into the one on show, unchecked; a name
     already waiting there is skipped. */
  const listName = () => lists.find((l) => l.id === cur)?.name || 'הרשימה';
  const listCount = (id) => [...items.values()].filter((i) => i.list === id).length;
  const nItems = (n) => (n === 1 ? 'פריט אחד' : `${n} פריטים`);
  function savedLists() {
    const row = (l) => el('li', { class: 'saved-row' },
      el('span', { class: 'saved-name' }, l.name, el('small', {}, ` · ${nItems(listCount(l.id))}`)),
      el('span', { class: 'saved-acts' },
        el('button', { type: 'button', class: 'btn small', onclick: (e) => useSaved(l, 'new', e.currentTarget) }, 'לרשימה חדשה'),
        el('button', { type: 'button', class: 'btn small ghost', onclick: (e) => useSaved(l, cur || 'main', e.currentTarget) }, `אל ${listName()}`),
        l.canDelete ? el('button', { type: 'button', class: 'btn small ghost', 'aria-label': `מחיקת ${l.name}`, onclick: () => deleteList(l) }, '🗑') : ''));
    const temps = lists.filter((l) => l.kind === 'template');
    const arch = lists.filter((l) => l.kind === 'archive').reverse();
    const checked = here().filter((i) => i.checked).length;
    modal(el('div', { class: 'saved-lists' },
      el('h2', {}, 'רשימות שמורות'),
      el('div', { class: 'modal-acts' },
        el('button', { class: 'btn', type: 'button', onclick: saveTemplate }, `💾 שמירת ${cur ? 'הרשימה' : 'הרשימה הראשית'} כתבנית`),
        el('button', { class: 'btn', type: 'button', disabled: !cur && !checked, onclick: finishList },
          cur ? '✅ סיום הרשימה – לארכיון' : `✅ הקנייה הסתיימה – ${checked === 1 ? 'המסומן' : checked + ' המסומנים'} לארכיון`)),
      el('h3', {}, 'תבניות'),
      temps.length ? el('ul', { class: 'saved-list' }, ...temps.map(row)) : el('p', { class: 'muted' }, 'עוד אין. שמרו רשימה כתבנית, למשל "קניות שבועיות" או "שבת".'),
      el('h3', {}, 'ארכיון'),
      arch.length ? el('ul', { class: 'saved-list' }, ...arch.map(row)) : el('p', { class: 'muted' }, 'רשימות שהסתיימו יופיעו כאן.')));
  }
  function saveTemplate() {
    const input = el('input', { type: 'text', maxlength: '40', dir: 'auto', 'aria-label': 'שם התבנית', value: cur ? listName() : '', placeholder: 'למשל: קניות שבועיות' });
    const go = el('button', { class: 'btn primary', type: 'submit' }, 'שמירה');
    const pick = (name) => el('button', { type: 'button', class: 'chip', onclick: () => { input.value = name; input.focus(); } }, name);
    modal(el('form', { class: 'list-form', onsubmit: async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      go.disabled = true;
      try {
        await flush();
        const r = await api(`/api/groceries/lists/${encodeURIComponent(cur || 'main')}/save`, { body: { kind: 'template', name } });
        lists = [...lists, r.list]; saveCache(); closeModal(); await pull(); render();
        toast(`התבנית "${name}" נשמרה (${nItems(r.moved)})`);
      } catch (err) { go.disabled = false; toast(err?.status === 400 ? 'הרשימה ריקה – אין מה לשמור' : 'השמירה לא הצליחה – בדקו את החיבור'); }
    } },
      el('h2', {}, 'שמירה כתבנית'),
      el('p', { class: 'muted' }, `הפריטים של ${listName()} יישמרו, והרשימה עצמה תישאר כמו שהיא.`),
      el('label', {}, 'השם', input),
      el('div', { class: 'list-suggest' }, pick('קניות שבועיות'), pick('שבת'), pick('מסיבה')),
      el('div', { class: 'modal-acts' }, go, el('button', { class: 'btn ghost', type: 'button', onclick: closeModal }, 'ביטול'))));
    setTimeout(() => input.focus(), 60);
  }
  async function finishList(e) {
    e.currentTarget.disabled = true;
    const name = listName();
    try {
      await flush();
      const r = await api(`/api/groceries/lists/${encodeURIComponent(cur || 'main')}/save`, { body: { kind: 'archive' } });
      if (cur) { lists = lists.map((l) => (l.id === cur ? { ...l, ...r.list } : l)); cur = null; } else lists = [...lists, r.list];
      saveCache(); closeModal(); await pull(); render();
      toast(r.moved ? (r.moved === 1 ? 'פריט אחד עבר לארכיון' : `${r.moved} פריטים עברו לארכיון`) : `"${name}" עברה לארכיון`);
    } catch (err) { closeModal(); toast(err?.status === 400 ? 'אין פריטים מסומנים לשמור' : 'לא הצלחתי – בדקו את החיבור'); }
  }
  async function useSaved(l, into, btn) {
    btn.disabled = true;
    try {
      await flush();
      const r = await api(`/api/groceries/lists/${encodeURIComponent(l.id)}/use`, { body: { into } });
      if (r.list) lists = [...lists, r.list];
      cur = r.into || null; saveCache(); closeModal(); await pull(); render();
      toast(!r.added ? 'הכול כבר ברשימה' : (r.added === 1 ? 'נוסף פריט אחד' : `נוספו ${r.added} פריטים`)
        + (r.added && r.skipped ? (r.skipped === 1 ? ' (אחד כבר היה ברשימה)' : ` (${r.skipped} כבר היו ברשימה)`) : ''));
    } catch (_) { btn.disabled = false; toast('לא הצלחתי – בדקו את החיבור'); }
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
    const done = here().filter((i) => i.checked);
    if (!done.length) return toast('אין פריטים מסומנים');
    done.forEach((i) => remove(i.id));
    toast(`${done.length} פריטים נמחקו`, 'בטל', () => done.forEach(upsert));
  });
  $('#shareList').addEventListener('click', async () => {
    const lines = [];
    for (const cat of CATEGORIES) {
      const ci = here().filter((i) => i.cat === cat.id && !i.checked);
      if (!ci.length) continue;
      lines.push(`${cat.icon} ${cat.name}`, ...ci.map((i) => `• ${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`), '');
    }
    const text = lines.join('\n').trim() || 'הרשימה ריקה';
    try {
      const title = lists.find((l) => l.id === cur)?.name || 'רשימת קניות';
      if (navigator.share) await navigator.share({ title, text });
      else { await navigator.clipboard.writeText(text); toast('הרשימה הועתקה – אפשר להדביק בוואטסאפ'); }
    } catch (_) { /* cancelled */ }
  });

  /* ================= הוספת מצרכים ממתכון ================= */
  function translateIngredient(name) {
    const k = name.trim().toLowerCase();
    return INGREDIENT_EN_HE[k] || INGREDIENT_EN_HE[k.replace(/(es|s)$/, '')] || INGREDIENT_EN_HE[k + 's'] || name.trim();
  }

  /** Servings and units over a recipe's ingredients (the owner's tour, 2026-11-13): "מנות − 4 +" (or "כמות ×1" when the
   *  recipe does not say) and the units, as written / grams / cups and spoons. The units are the person's choice and
   *  follow them (prefs.groceries.units); the servings are for this recipe on screen. Markup: .amounts > .amount-step, select. */
  function amountTools(ingredients, base) {
    let n = base || 1;
    const factor = () => (base ? n / base : n);
    const draw = () => {
      for (const i of ingredients) if (i.mEl) i.mEl.textContent = Measure.show(i.measure, i.he, factor(), listPrefs.units || 'orig');
      count.textContent = base ? String(n) : `×${Measure.fmtQty(n)}`;
    };
    const step = base ? 1 : 0.5;
    const count = el('output', { 'aria-live': 'polite' });
    const btn = (d, label, sym) => el('button', { type: 'button', class: 'btn ghost small', 'aria-label': label,
      onclick: () => { n = Math.max(step, Math.min(base ? 60 : 10, n + d * step)); draw(); } }, sym);
    const units = el('select', { 'aria-label': 'יחידות מידה', onchange: (e) => { H.savePrefs('groceries', { units: e.target.value }); draw(); } },
      [['orig', 'מידות כמו במתכון'], ['grams', 'בגרמים'], ['cups', 'בכוסות וכפות']].map(([v, t]) => el('option', { value: v, selected: (listPrefs.units || 'orig') === v }, t)));
    draw();
    return el('div', { class: 'amounts' },
      el('span', { class: 'amount-step' }, el('span', {}, base ? 'מנות' : 'כמות'), btn(-1, base ? 'פחות מנות' : 'פחות', '−'), count, btn(1, base ? 'יותר מנות' : 'יותר', '+')),
      units);
  }

  /** Ingredient picker used by both web recipes and saved recipes. Returns the <ul> and a getter for chosen ingredients.
   *  An ingredient may carry `issue` (from the kashrut/keto check), `orig` (its name before a substitute) and `kind`;
   *  then its name is struck through in pencil and a line under it offers substitutes (onSub(index, name|null)). */
  function ingredientPicker(ingredients, { onSub, servings } = {}) {
    const rows = ingredients.map((ing, idx) => {
      const existing = findDuplicate(ing.he);
      const basic = /^(water|salt|מים|מלח)$/i.test(ing.en || '') || /^(מים|מלח)$/.test(ing.he);
      const cb = el('input', { type: 'checkbox', checked: !existing && !basic });
      ing.cb = cb;
      const replaced = ing.issue && ing.orig && ing.he !== ing.orig;
      return el('li', { class: ing.issue ? 'has-issue ' + ing.kind : '' }, el('label', {}, cb,
        el('span', { class: 'ing-name' },
          replaced ? el('s', { class: 'pencil' }, ing.orig) : ing.he,
          !replaced && ing.issue && !onSub ? el('small', { class: 'issue-tag ' + ing.kind }, ing.issue.reason_he) : null,
          ing.en && ing.he !== ing.en ? el('small', { class: 'muted' }, ` (${ing.en})`) : null),
        ing.measure ? (ing.mEl = el('small', { class: 'measure' }, ing.measure)) : null,
        existing ? el('small', { class: 'tag ok' }, existing.checked ? 'נקנה' : 'כבר ברשימה') : null),
      ing.issue && onSub ? RecipeFix.subLine(ing.issue, ing.orig || ing.he, replaced ? ing.he : null, (v) => onSub(idx, v), ing.kind) : null);
    });
    return {
      tools: el('div', { class: 'ing-tools' },
        el('button', { class: 'btn ghost small', onclick: () => ingredients.forEach((i) => { i.cb.checked = true; }) }, 'סמן הכל'),
        el('button', { class: 'btn ghost small', onclick: () => ingredients.forEach((i) => { i.cb.checked = false; }) }, 'נקה'),
        ingredients.some((i) => i.measure) ? amountTools(ingredients, servings) : null),
      list: el('ul', { class: 'ingredients' }, rows),
      addButton: (title) => el('button', { class: 'btn primary', onclick: () => {
        const chosen = ingredients.filter((i) => i.cb.checked);
        if (!chosen.length) return toast('לא נבחרו מצרכים');
        let added = 0, bumped = 0;
        for (const ing of chosen) {
          const r = addByName(ing.he, categorize(ing.he + ' ' + (ing.en || '')), title);
          r.dup ? bumped++ : added++;
        }
        closeSheet();
        closeModal();
        showTab('list');
        toast(`נוספו ${added} מצרכים מ"${title}"` + (bumped ? ` (${bumped} כבר היו ברשימה)` : ''));
      } }, '➕ הוסף מצרכים מסומנים לרשימה'),
    };
  }

  /* ================= חיפוש מתכונים מכל העולם ================= */
  const normUrl = (u) => { try { const x = new URL(u); x.hash = ''; return x.href.replace(/\/$/, ''); } catch (_) { return u || ''; } };
  const webCache = new Map(); // url -> translated recipe (for this visit)
  let lastSearch = null;      // { q, cards: Map(url -> card), done }

  async function ensureBook() {
    if (!book) { try { book = (await api('/api/recipes')).recipes; } catch (_) { book = book || []; } }
    return book;
  }
  const savedCopy = (url) => (book || []).find((r) => r.source_url && normUrl(r.source_url) === normUrl(url));

  function googleLink(q) {
    return el('a', { href: 'https://www.google.com/search?q=' + encodeURIComponent('מתכון ' + q), target: '_blank', rel: 'noopener' }, `🔎 חפש "${q}" בגוגל`);
  }
  const loading = (t) => el('div', { class: 'loading' }, el('span', { class: 'spinner' }), t);

  /* ---- the sheet: a card flips over and grows to fill the page (shared: /assets/sheet.js) ---- */
  const sheet = H.sheet;
  const closeSheet = () => sheet.close();

  /* ---- translating recipes in the background, a few at a time ---- */
  const translating = new Map(); // url -> Promise<recipe>
  const tQueue = [];
  let running = 0;
  function translate(url, hint, urgent) {
    if (webCache.has(url)) return Promise.resolve(webCache.get(url));
    if (translating.has(url)) { if (urgent) bump(url); return translating.get(url); }
    let start;
    const p = new Promise((resolve, reject) => { start = () => api('/api/recipes/world/open', { body: { url, site: hint?.site, country: hint?.country } }).then((r) => { webCache.set(url, r.recipe); resolve(r.recipe); }, reject); });
    p.catch(() => {});
    translating.set(url, p);
    const job = { url, start };
    if (urgent) tQueue.unshift(job); else tQueue.push(job);
    setCardState(url, 'queued');
    pump();
    return p;
  }
  function bump(url) { const i = tQueue.findIndex((j) => j.url === url); if (i > 0) tQueue.unshift(...tQueue.splice(i, 1)); }
  function pump() {
    while (running < 3 && tQueue.length) {
      const job = tQueue.shift();
      running++;
      setCardState(job.url, 'working');
      job.start();
      translating.get(job.url).then((recipe) => { setCardState(job.url, 'ready', recipe); RecipeFix.check(recipe).catch(() => {}); }, (e) => setCardState(job.url, 'failed', null, e))
        .finally(() => { running--; pump(); });
    }
  }

  /* ---- the results: cards appear as the search finds them ---- */
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6s-7.6-4.6-9.4-9.3C1.4 8.1 3.4 4.6 6.9 4.6c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.5 0 5.5 3.5 4.3 6.7-1.8 4.7-9.4 9.3-9.4 9.3z"/></svg>';

  /** Instagram-style heart: saves a copy of the web recipe to our book, or takes it out again. */
  function heart(url, hint, cls = '') {
    const b = el('button', { type: 'button', class: 'heart ' + cls, 'data-url': normUrl(url), html: HEART });
    const paint = () => {
      const on = !!savedCopy(url);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'נשמר בספר המתכונים – לחיצה מוציאה' : 'שמירה בספר המתכונים');
      b.title = on ? 'נשמר בספר המתכונים' : 'שמירה בספר המתכונים (או לחיצה כפולה על הכרטיס)';
    };
    paint();
    b.addEventListener('click', (e) => { e.stopPropagation(); like(url, hint, b); });
    b.addEventListener('dblclick', (e) => e.stopPropagation());
    b.paint = paint;
    return b;
  }
  function paintHearts() { document.querySelectorAll('.heart[data-url]').forEach((h) => h.paint && h.paint()); }
  async function like(url, hint, btn, { onlyAdd } = {}) {
    if (btn?.classList.contains('busy')) return;
    if (onlyAdd && savedCopy(url)) return; // a double tap never takes a recipe out
    if (btn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop', 'busy'); }
    try { await toggleSave(url, hint); } catch (err) { toast(err.message); }
    btn?.classList.remove('busy');
    paintHearts();
  }

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
    const translated = await translate(url, hint, true);
    // The copy in our book is the version on screen: with the substitutes chosen, and a note on what was replaced.
    const subs = chosenSubs.get(url);
    const swaps = subs ? [...subs].filter(([, v]) => v).map(([n, v]) => `${translated.ingredients[n]?.name} ← ${v}`) : [];
    const recipe = swaps.length
      ? { ...effective(translated, subs), notes: [translated.notes, `תחליפים שבחרנו: ${swaps.join(' · ')}`].filter(Boolean).join('\n\n') }
      : translated;
    const r = await api('/api/recipes', { body: recipe });
    const saved = { ...recipe, id: r.id, updated_at: r.updated_at };
    book.unshift(saved);
    renderBook();
    toast(`❤ "${recipe.title}" נשמר בספר המתכונים שלנו`, 'עריכה', () => openBookRecipe(saved));
  }

  const STATE_LABEL = { queued: 'מחכה לתרגום', working: 'מתרגם לעברית…', ready: '✓ מוכן לקריאה', failed: 'אין כאן מתכון' };
  function setCardState(url, state, recipe, err) {
    const c = lastSearch?.cards.get(url);
    if (!c) return;
    c.state = state;
    if (recipe) {
      c.data.title_he = c.data.title_he || recipe.title;
      c.data.country = c.data.country || recipe.meta?.country;
      c.data.lang = c.data.lang || recipe.meta?.lang;
    }
    if (state === 'failed') {
      // A page that turned out not to be a recipe leaves quietly (unless Claude chose it).
      if (!c.ranked && err?.code === 'no_recipe_found') { c.el.classList.add('leaving'); setTimeout(() => { c.el.remove(); lastSearch?.cards.delete(url); updateHeader(); }, 400); return; }
    }
    drawCard(c);
  }

  function drawCard(c) {
    const d = c.data;
    const wait = !d.title_he;
    const img = d.image
      ? el('img', { src: d.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => { e.target.replaceWith(el('div', { class: 'ph' }, '🍲')); } })
      : el('div', { class: 'ph' }, lastSearch?.done ? '🍲' : el('span', { class: 'spinner' }));
    const state = c.state && c.state !== 'ready' ? el('span', { class: 'tstate ' + c.state }, c.state === 'working' ? el('span', { class: 'spinner tiny' }) : null, ' ' + STATE_LABEL[c.state])
      : c.state === 'ready' ? el('span', { class: 'tstate ready' }, STATE_LABEL.ready) : null;
    c.el.classList.toggle('waiting', wait);
    c.el.replaceChildren(
      el('div', { class: 'wcard-open', role: 'button', tabindex: '0', 'aria-label': `פתיחת ${d.title_he || d.title}` },
        el('div', { class: 'wcard-img' }, img, state, el('span', { class: 'burst', html: HEART })),
        el('div', { class: 'wcard-body' },
          el('b', { dir: 'auto' }, d.title_he || d.title),
          d.title_he && d.title !== d.title_he ? el('small', { class: 'orig', dir: 'auto' }, d.title) : null,
          el('small', { class: 'where' }, [d.site, d.country].filter(Boolean).join(' · ')),
          d.snippet_he ? el('p', { class: 'snip' }, d.snippet_he) : null,
          el('div', { class: 'wcard-tags' }, d.lang ? el('span', { class: 'tag' }, d.lang) : null, c.ranked ? el('span', { class: 'tag match' }, `התאמה ${d.relevance}%`) : null))),
      heart(d.url, d, 'on-card'));
  }

  function makeCard(data, ranked) {
    const c = { data, ranked, state: null, el: el('article', { class: 'wcard', 'data-url': data.url }) };
    // One tap opens (the card flips and fills the page); a quick second tap is a heart, as on Instagram.
    let tapTimer = null;
    const tap = (e) => {
      if (e.target.closest('.heart')) return;
      if (tapTimer) {
        clearTimeout(tapTimer); tapTimer = null;
        c.el.classList.remove('liked'); void c.el.offsetWidth; c.el.classList.add('liked');
        like(c.data.url, c.data, c.el.querySelector('.heart'), { onlyAdd: true });
        return;
      }
      tapTimer = setTimeout(() => { tapTimer = null; showWebRecipe(c.data, c.el); }, 260);
    };
    c.el.addEventListener('click', tap);
    c.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('wcard-open')) showWebRecipe(c.data, c.el); });
    drawCard(c);
    return c;
  }

  let seenObs = null;
  function watchVisible(c) {
    // Translate what the family can see (and a little beyond), not every page the search touched.
    seenObs = seenObs || new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { seenObs.unobserve(e.target); const url = e.target.dataset.url; const card = lastSearch?.cards.get(url); if (card) translate(url, card.data); }
    }, { root: document.getElementById('modalBody'), rootMargin: '300px' });
    seenObs.observe(c.el);
  }

  function order() {
    const s = lastSearch;
    if (!s) return;
    const list = [...s.cards.values()].sort((a, b) => (b.ranked - a.ranked) || ((b.data.relevance || 0) - (a.data.relevance || 0)) || (a.n - b.n));
    for (const c of list) s.grid.insertBefore(c.el, s.more); // moving keeps each card's state
  }

  function updateHeader() {
    const s = lastSearch;
    if (!s) return;
    const n = s.cards.size;
    s.title.textContent = n ? `🌍 ${n} מתכונים מכל העולם ל"${s.q}"` : `🌍 מחפש "${s.q}"`;
    const langs = [...new Set([...s.cards.values()].map((c) => c.data.lang).filter(Boolean))];
    s.sub.textContent = s.done
      ? `מסודרים לפי התאמה${langs.length > 1 ? `, מ-${langs.length} שפות (${langs.join(', ')})` : ''}. לחיצה פותחת, לחיצה כפולה או ❤ שומרת בספר המתכונים.`
      : 'המתכונים מופיעים ברגע שהם נמצאים, ומתורגמים לעברית ברקע.';
  }

  async function runSearch(q, fresh) {
    const title = el('h3', {}, `🌍 מחפש "${q}"`);
    const sub = el('p', { class: 'muted' }, 'המתכונים מופיעים ברגע שהם נמצאים, ומתורגמים לעברית ברקע.');
    const status = el('span', {}, 'מתחיל לחפש…');
    const more = el('div', { class: 'wcard more', 'aria-live': 'polite' }, el('span', { class: 'spinner big' }), status);
    const grid = el('div', { class: 'results world' }, more);
    const s = lastSearch = { q, cards: new Map(), done: false, grid, more, title, sub, n: 0 };
    seenObs?.disconnect(); seenObs = null;
    modal(title, sub, grid, el('div', { class: 'row', style: 'margin-top:12px' },
      el('button', { class: 'btn ghost small', onclick: () => runSearch(q, true) }, '⟳ חיפוש מחדש'), googleLink(q)));
    await ensureBook();

    const add = (data, ranked) => {
      const existing = s.cards.get(data.url);
      if (existing) {
        if (ranked) { existing.ranked = true; Object.assign(existing.data, data, { image: existing.data.image || data.image }); drawCard(existing); translate(data.url, existing.data); }
        return existing;
      }
      const c = makeCard(data, ranked);
      c.n = s.n++;
      s.cards.set(data.url, c);
      grid.insertBefore(c.el, more);
      if (ranked && [...s.cards.values()].filter((x) => x.ranked).length <= 4) translate(data.url, data); else watchVisible(c);
      return c;
    };

    let res;
    try {
      res = await fetch('/api/recipes/world/stream?q=' + encodeURIComponent(q) + (fresh ? '&fresh=1' : ''));
    } catch (_) { res = null; }
    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      if (data.error === 'ai_not_configured') return runMealDbSearch(q);
      more.replaceChildren(el('div', {}, el('p', {}, res ? 'החיפוש לא הצליח.' : 'אין חיבור לאינטרנט.'), el('button', { class: 'btn primary small', onclick: () => runSearch(q) }, 'לנסות שוב')));
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let failed = null;
    for (;;) {
      let chunk;
      try { chunk = await reader.read(); } catch (_) { failed = 'נקטע החיבור באמצע החיפוש.'; break; }
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim() || lastSearch !== s) continue;
        let ev;
        try { ev = JSON.parse(line); } catch (_) { continue; }
        if (ev.type === 'searching') status.textContent = `מחפש: ${ev.query}`;
        else if (ev.type === 'hit') add({ url: ev.hit.url, title: ev.hit.title, site: ev.hit.site }, false);
        else if (ev.type === 'result') { add(ev.result, true); order(); }
        else if (ev.type === 'image') { const c = s.cards.get(ev.url); if (c && !c.data.image) { c.data.image = ev.image; drawCard(c); } }
        else if (ev.type === 'error') failed = ev.error === 'ai_busy' ? 'העוזר החכם עמוס כרגע. נסו שוב בעוד דקה.' : 'החיפוש לא הצליח.';
        if (ev.type !== 'image') updateHeader();
      }
    }
    if (lastSearch !== s) return;
    s.done = true;
    // Pages Claude chose come first; the other hits stay below while they are checked and translated.
    order();
    more.remove();
    for (const c of s.cards.values()) if (!c.data.image) drawCard(c);
    updateHeader();
    // the search failed with nothing found (no AI credit, the AI busy or down): the open recipe database instead
    if (!s.cards.size && failed) { grid.remove(); return runMealDbSearch(q); }
    if (!s.cards.size) {
      grid.replaceWith(el('div', {}, el('p', {}, failed || `לא נמצאו מתכונים ל"${q}". נסו לנסח אחרת, למשל שם המנה ומרכיב עיקרי.`), el('p', {}, googleLink(q))));
    } else if (failed) toast(failed);
  }

  function metaChips(meta) {
    if (!meta) return null;
    const chips = [meta.servings && `🍽 ${meta.servings}`, meta.time && `⏱ ${meta.time}`, meta.lang && meta.lang !== 'עברית' && `🌐 תורגם מ${meta.lang}`].filter(Boolean);
    return chips.length ? el('div', { class: 'meta-chips' }, chips.map((c) => el('span', { class: 'tag' }, c))) : null;
  }

  /* ---- kashrut and keto in a recipe: the substitutes chosen for each recipe (for this visit) ---- */
  const chosenSubs = new Map(); // url -> Map(index -> substitute name | null to keep the original)
  const effective = (recipe, subs) => ({ ...recipe, ingredients: recipe.ingredients.map((i, n) => (subs.get(n) ? { ...i, name: subs.get(n) } : i)) });

  /** The ingredients, the chips at the top and the keto panel of a web recipe; redrawn when a substitute changes. */
  function recipeParts(url, recipe) {
    const subs = chosenSubs.get(url) || new Map();
    chosenSubs.set(url, subs);
    const status = el('div', {}, RecipeFix.statusRows({ kosherOrig: 'checking' }));
    const ketoSlot = el('div');
    const ingSlot = el('div');
    let result = null;
    const openFix = (focus) => result && RecipeFix.openFix({ focus, recipe, result, subs, apply: (next) => { subs.clear(); next.forEach((v, k) => subs.set(k, v)); draw(); },
      onResult: (res) => { result = res; for (const x of res.kosher) if (!subs.has(x.index)) subs.set(x.index, x.subs[0]); draw(); } });
    const draw = () => {
      const eff = effective(recipe, subs);
      // The chips: a warning about the original recipe, and stamps for the version on screen.
      const orig = result ? RecipeFix.kosherStatus(result, new Map()) : 'checking';
      const now = result ? RecipeFix.kosherStatus(result, subs) : 'checking';
      const ketoSubbed = (result?.keto || []).some((x) => subs.get(x.index));
      status.replaceChildren(RecipeFix.statusRows({
        kosherOrig: orig, kosherNow: result ? now : null, keto: eff,
        subbed: { kosher: orig !== 'ok' && now === 'ok', keto: ketoSubbed },
        onFix: (focus) => result && openFix(focus),
      }));
      ketoSlot.replaceChildren(...[Keto.dietStamps(eff), Keto.recipePanel(eff)].filter(Boolean));
      const kosherAt = new Map((result?.kosher || []).map((x) => [x.index, x]));
      const ketoAt = new Map(Keto.enabled ? (result?.keto || []).map((x) => [x.index, x]) : []);
      const ingredients = recipe.ingredients.map((i, n) => {
        const issue = kosherAt.get(n) || ketoAt.get(n);
        return { he: subs.get(n) || i.name, measure: i.measure, orig: i.name, issue, kind: kosherAt.has(n) ? 'kosher' : 'keto' };
      });
      const picker = ingredientPicker(ingredients, { onSub: (n, v) => { subs.set(n, v); draw(); }, servings: Measure.servings(recipe.meta) });
      ingSlot.replaceChildren(el('h4', {}, `מצרכים (${ingredients.length})`), picker.tools, picker.list, el('div', { class: 'row' }, picker.addButton(recipe.title)));
    };
    draw();
    RecipeFix.check(recipe).then((res) => {
      result = res;
      // Every non-kosher ingredient starts out replaced by its first kosher substitute (the family can choose another, or keep it).
      for (const x of res.kosher) if (!subs.has(x.index)) subs.set(x.index, x.subs[0]);
      draw();
    }).catch(() => { status.replaceChildren(RecipeFix.statusRows({ kosherOrig: 'error', keto: effective(recipe, subs), onFix: () => {} })); });
    return { status, ketoSlot, ingSlot };
  }

  /** A web recipe, translated, on the full-page sheet. */
  async function showWebRecipe(r, origin) {
    const ready = webCache.get(r.url);
    if (!ready) sheet.open(origin, [el('h3', { class: 'r-title', dir: 'auto' }, r.title_he || r.title), loading('פותח את המתכון ומתרגם לעברית…')]);
    let recipe = ready;
    if (!recipe) {
      try { recipe = await translate(r.url, r, true); } catch (e) {
        if (!sheet.isOpen) return;
        sheet.open(null, [el('h3', {}, 'לא הצלחתי לפתוח את המתכון'), el('p', {}, e.message),
          el('p', {}, el('a', { href: r.url, target: '_blank', rel: 'noopener' }, '🔗 פתיחה באתר המקורי'))]);
        return;
      }
      if (!sheet.isOpen) return; // closed while it was translating
    }
    const parts = recipeParts(r.url, recipe);
    sheet.open(ready ? origin : null, [
      el('div', { class: 'r-hero' },
        recipe.image ? el('img', { src: recipe.image, alt: '', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null,
        heart(r.url, r, 'big')),
      el('h3', { class: 'r-title' }, recipe.title),
      el('p', { class: 'r-sub' }, recipe.subtitle),
      parts.status,
      metaChips(recipe.meta),
      parts.ketoSlot,
      recipe.notes ? el('p', { class: 'r-notes' }, recipe.notes) : null,
      parts.ingSlot,
      el('h4', {}, 'אופן ההכנה'),
      el('ol', { class: 'steps he' }, recipe.steps.map((s) => el('li', { dir: 'auto' }, s))),
      el('p', {}, el('a', { href: recipe.source_url, target: '_blank', rel: 'noopener' }, '🔗 המתכון המקורי'),
        // opened without AI, in its own language: Google's translation of the page
        recipe.meta?.untranslated && recipe.meta.translate ? [' · ', el('a', { href: recipe.meta.translate, target: '_blank', rel: 'noopener' }, '🌐 הדף בעברית ב־Google Translate')] : null),
    ]);
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
    if (!book.length && !listPrefs.starters && await (seeding ||= seedBook())) {
      try { book = (await api('/api/recipes')).recipes; } catch { /* the empty book stays */ }
    }
    renderBook();
  }

  // An empty book opens with a few good home recipes (the owner's tour, 2026-11-13), once per person: a book
  // emptied on purpose stays empty. They are ordinary recipes in the household's book, to edit or delete.
  let seeding = null;
  async function seedBook() {
    try {
      const starters = await (await fetch('/groceries/starter.json')).json();
      for (const r of starters.reverse()) await api('/api/recipes', { body: r });   // newest first: the first one on top
      H.savePrefs('groceries', { starters: true });
      return true;
    } catch { seeding = null; return false; }   // offline: the empty message, and another try next time
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
      grid.append(el('button', { class: 'book-card', onclick: (e) => openBookRecipe(r, e.currentTarget) },
        el('div', { class: 'ph', style: r.image ? `background-image:url("${encodeURI(r.image)}")` : '' }, r.image ? '' : '🍲'),
        el('b', {}, r.title), r.subtitle ? el('small', { class: 'sub' }, r.subtitle) : null, el('small', {}, `${r.ingredients.length} מצרכים · ${r.steps.length} שלבים`)));
    }
  }

  const autosize = (ta) => { ta.style.blockSize = 'auto'; ta.style.blockSize = ta.scrollHeight + 2 + 'px'; };

  /** Our recipe format, edited in place: name, where it came from, ingredients with amounts, steps one by one. Saves as you type. */
  function openBookRecipe(r, origin, opts = {}) {
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
    const touch = () => { dirty = true; status.textContent = '…'; clearTimeout(timer); timer = setTimeout(save, 700); scheduleCheck(); };

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
      closeSheet();
      toast('המתכון נמחק');
      renderBook();
    } }, '🗑 מחיקה');

    // Kashrut and keto: a problem ingredient is struck in pencil with substitutes to choose under it; the chips sit under the title.
    const bstatus = el('div');
    const ketoSlot = el('div');
    let checkTimer = null, lastResult = null, lastNames = null;
    const rowsNow = () => [...ingList.children];
    const currentRecipe = () => ({ title: title.value.trim(), meta: draft.meta, ingredients: rowsNow().map((li) => ({ name: li.querySelector('.n').value.trim(), measure: li.querySelector('.m').value.trim() })) });
    const clearMarks = (li) => { li.querySelector('.sub-line')?.remove(); li.querySelector('.n').classList.remove('pencil-text', 'kosher', 'keto'); };
    async function runCheck() {
      const rec = currentRecipe();
      const names = JSON.stringify(rec.ingredients.map((i) => i.name));
      if (names === lastNames) return;
      lastNames = names;
      if (!rec.ingredients.some((i) => i.name)) { bstatus.replaceChildren(); ketoSlot.replaceChildren(); return; }
      bstatus.replaceChildren(RecipeFix.statusRows({ kosherOrig: 'checking' }));
      let res;
      try { res = await RecipeFix.check(rec); } catch (_) { bstatus.replaceChildren(); return; }
      if (lastNames !== names) return; // changed again meanwhile
      lastResult = res;
      const rows = rowsNow();
      rows.forEach(clearMarks);
      const mark = (x, kind) => {
        const li = rows[x.index];
        if (!li || li.querySelector('.sub-line')) return;
        const n = li.querySelector('.n');
        n.classList.add('pencil-text', kind);
        li.append(RecipeFix.subLine(x, n.value, null, (v) => { if (!v) return; n.value = v; autosize(n); clearMarks(li); touch(); }, kind));
      };
      res.kosher.forEach((x) => mark(x, 'kosher'));
      if (Keto.enabled) res.keto.forEach((x) => mark(x, 'keto'));
      const st = RecipeFix.kosherStatus(res, new Map());
      bstatus.replaceChildren(RecipeFix.statusRows({ kosherOrig: st, kosherNow: st, keto: rec, onFix: openBookFix }));
      ketoSlot.replaceChildren(...[Keto.dietStamps(rec), Keto.recipePanel(rec)].filter(Boolean));
    }
    const openBookFix = (focus) => lastResult && RecipeFix.openFix({
      focus, recipe: currentRecipe(), result: lastResult, subs: new Map(),
      onResult: () => { lastNames = null; runCheck(); },   // (the AI's answer is now the cached one for these ingredients)
      apply: (next) => {
        const rows = rowsNow();
        next.forEach((v, i) => { if (v && rows[i]) { const n = rows[i].querySelector('.n'); n.value = v; autosize(n); clearMarks(rows[i]); } });
        touch();
      },
    });
    function scheduleCheck() { clearTimeout(checkTimer); checkTimer = setTimeout(runCheck, 1800); }

    const shop = el('button', { class: 'btn primary', onclick: async () => {
      await save();
      collect();
      const ingredients = draft.ingredients.filter((i) => i.name).map((i) => ({ he: i.name, measure: i.measure }));
      if (!ingredients.length) return toast('אין עדיין מצרכים');
      const picker = ingredientPicker(ingredients, { servings: Measure.servings(draft.meta) });
      sheet.open(null, [el('button', { class: 'btn ghost small back', onclick: () => openBookRecipe(book.find((x) => x.id === draft.id) || draft) }, '→ חזרה למתכון'),
        el('h3', {}, `🛒 מצרכים מ"${draft.title}"`), picker.tools, picker.list, picker.addButton(draft.title)]);
    } }, '🛒 מצרכים לרשימת הקניות');

    sheet.open(origin, [
      el('div', { class: 'r-hero' }, draft.image ? el('img', { src: draft.image, alt: '', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null),
      title, subtitle,
      // a recipe the AI read: marked, with a way back (design's .ai-note)
      opts.ai ? el('p', { class: 'ai-note' }, '✨ הוצע בעזרת העוזר החכם · ', el('button', { type: 'button', onclick: async () => {
        clearTimeout(timer); dirty = false;
        try { await api('/api/recipes/' + draft.id, { method: 'DELETE' }); } catch (e) { toast(e.message); return; }
        book = (book || []).filter((x) => x.id !== draft.id);
        closeSheet(); renderBook(); toast('הייבוא בוטל');
      } }, 'ביטול')) : null,
      bstatus,
      metaChips(draft.meta),
      ketoSlot,
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
        el('button', { class: 'btn ghost', onclick: () => shop.click() }, '⚖ כמויות ומידות'),   // the same sheet: servings and units on top
        draft.source_url ? el('a', { class: 'btn ghost', href: draft.source_url, target: '_blank', rel: 'noopener' }, '🔗 המקור') : null, del),
    ], { onLeave: () => save().then(renderBook) }); // closing (or moving on) saves whatever is still waiting
    requestAnimationFrame(() => autosize(notes));
    if (!draft.id) setTimeout(() => title.focus(), 450);
    runCheck();
  }

  /* import from a link (docs/ai/without-ai.md #1): "ייבוא" reads the page without AI – its structured recipe, or the lists
     under its headings, in the page's own language; nothing found: a draft with its title and picture. "✨ ייבוא ותרגום"
     reads and translates with the AI. With no AI left, ✨ invites to connect one (design's .ai-pair / .ai-up.offer). */
  async function importDialog() {
    const url = el('input', { type: 'url', placeholder: 'הדבק קישור למתכון מכל אתר…', dir: 'ltr', style: 'width:100%', 'aria-label': 'קישור למתכון' });
    let noAi = false;   // a limited account whose credit ran out, with no AI of its own
    try { const me = await api('/api/me/ai'); noAi = !!me.out && !Object.keys(me.keys || {}).length; } catch (_) { /* as if there is AI: the server decides anyway */ }
    const invite = () => (H.aiInvite ? Promise.resolve() : new Promise((ok, no) => document.head.append(el('script', { src: '/assets/ai-invite.js', onload: ok, onerror: no }))))
      .then(() => H.aiInvite?.()).catch(() => toast('אפשר לחבר AI בהגדרות ← חיבור לשירותים'));
    const link = () => { const v = url.value.trim(); if (!/^https?:\/\//.test(v)) { toast('הדבק קישור שמתחיל ב-https://'); return null; } return v; };
    const busy = (b, on, label) => { plain.disabled = smart.disabled = on; b.textContent = on ? 'קורא…' : label; };
    const keep = async (recipe, how, ai = false) => {
      const r = await api('/api/recipes', { body: recipe });
      await ensureBook();
      const saved = { ...recipe, id: r.id };
      book.unshift(saved);
      closeModal();
      renderBook();
      openBookRecipe(saved, undefined, { ai });
      toast(how);
    };
    const plain = el('button', { class: 'btn primary', type: 'button', onclick: async () => {
      const v = link(); if (!v) return;
      busy(plain, true);
      try {
        const res = await api('/api/recipes/import', { body: { url: v } });
        const recipe = { ...res.recipe, subtitle: `מקור: ${new URL(v).hostname.replace(/^www\./, '')}` };
        await keep(recipe, res.method === 'draft'
          ? 'לא מצאתי מתכון בדף – שמרתי את השם והתמונה. אפשר להשלים, או לנסות ✨ ייבוא ותרגום.'
          : 'המתכון נוסף לספר – אפשר לערוך ישר כאן');
      } catch (e) { toast(e.message); busy(plain, false, 'ייבוא'); }
    } }, 'ייבוא');
    const smart = el('button', { class: 'btn ai-up' + (noAi ? ' offer' : ''), type: 'button', onclick: async () => {
      if (noAi) return invite();
      const v = link(); if (!v) return;
      busy(smart, true);
      try {
        let recipe;
        try { recipe = (await api('/api/recipes/world/open', { body: { url: v } })).recipe; } catch (e) {
          if (e.code !== 'ai_not_configured') throw e;
          recipe = (await api('/api/recipes/import', { body: { url: v, ai: true } })).recipe;
          recipe.subtitle = `מקור: ${new URL(v).hostname.replace(/^www\./, '')}`;
        }
        await keep(recipe, '✨ המתכון תורגם ונוסף לספר', true);
      } catch (e) { if (e.code !== 'ai_credit_needed') toast(e.message); busy(smart, false, '✨ ייבוא ותרגום'); }
    } }, '✨ ייבוא ותרגום');
    modal(el('h3', {}, '🔗 ייבוא מתכון מקישור'),
      el('p', { class: 'muted' }, 'ייבוא קורא את המתכון מהדף כמו שהוא. ✨ גם מתרגם לעברית ומסדר. המתכון נשמר בספר ונפתח לעריכה.'),
      url,
      el('div', { class: 'ai-pair', style: 'margin-top:10px' }, plain, smart));
    url.focus();
  }

  $('#bookSearch').addEventListener('input', renderBook);
  $('#bookWebForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#bookWebInput').value.trim();
    if (q) runSearch(q);
  });

  // The + button: a small menu to write a recipe or import one from a link.
  const fab = $('#bookFab');
  const fabMenu = $('#bookFabMenu');
  const setFab = (open) => { fabMenu.hidden = !open; fab.setAttribute('aria-expanded', String(open)); fab.classList.toggle('open', open); };
  fab.addEventListener('click', (e) => { e.stopPropagation(); setFab(fabMenu.hidden); if (!fabMenu.hidden) fabMenu.querySelector('button').focus(); });
  document.addEventListener('click', (e) => { if (!fabMenu.hidden && !e.target.closest('#bookFabMenu')) setFab(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !fabMenu.hidden) { setFab(false); fab.focus(); } });
  $('#bookNew').addEventListener('click', () => { setFab(false); openBookRecipe({ title: '', subtitle: '', image: '', source_url: '', ingredients: [], steps: [], notes: '', tags: [] }, fab); });
  $('#bookImport').addEventListener('click', () => { setFab(false); importDialog(); });

  /* ================= לשוניות ================= */
  let ketoMounted = false, tabNow = 'list';
  // The tabs: the list, the book, ketosis and each other way of eating (diets.js). A diet's tab shows once it is on, or
  // while it is open: it is reached from its app in תנועה ותזונה (/groceries/#atkins…), where its switch is. Ketosis too
  // is the person's choice (the owner, 2026-11-13).
  const bar = $('.tabs[role=tablist]');
  for (const d of Diets.all) {
    bar.insertBefore(el('button', { role: 'tab', id: 'tab-' + d.id, 'aria-selected': 'false', hidden: true, onclick: () => showTab(d.id) }, d.name), bar.querySelector('.spacer'));
    $('main').append(el('section', { id: 'view-' + d.id, class: 'diet-view', hidden: true, 'aria-label': d.name }));
  }
  const TABS = [['list', '#tabList', '#viewList'], ['book', '#tabBook', '#viewBook'], ['keto', '#tabKeto', '#viewKeto'],
    ...Diets.all.map((d) => [d.id, '#tab-' + d.id, '#view-' + d.id])];
  const tabFromHash = () => (TABS.some(([n]) => n !== 'list' && location.hash === '#' + n) ? location.hash.slice(1) : 'list');
  const mounted = new Set();
  const ketoTab = () => {
    $('#tabKeto').hidden = !(Keto.enabled || tabNow === 'keto');
    for (const d of Diets.all) $('#tab-' + d.id).hidden = !(Diets.isOn(d.id) || tabNow === d.id);
  };
  // Each tab is a step in the history (the owner's tour, 2026-11-13): the back gesture or key returns to the previous tab,
  // not out of the page (H.back in common.js). how: 'push' (a tap), 'replace' (the first draw), 'pop' (back: the history moved already).
  function showTab(which, how = 'push') {
    const was = tabNow;
    tabNow = which; ketoTab();
    for (const [name, tab, view] of TABS) {
      $(tab).setAttribute('aria-selected', String(which === name));
      $(view).hidden = which !== name;
    }
    if (which === 'book') { if (!book) loadBook(); else renderBook(); }
    if (which === 'keto' && !ketoMounted) { ketoMounted = true; Keto.mount($('#viewKeto')); }
    if (Diets.get(which) && !mounted.has(which)) { mounted.add(which); Diets.mount($('#view-' + which), which); }
    const url = which === 'list' ? location.pathname : '#' + which;
    if (how === 'push' && which !== was && was && H.back) H.back.push(() => showTab(was, 'pop'), url);
    else if (how !== 'pop') history.replaceState(history.state, '', url);
  }
  H.showTab = showTab;
  // A sideways swipe moves to the next tab: in Hebrew the next one is on the left, so a swipe to the right brings it.
  // Not from the screen's edges (the phone's own back gesture), not in a field, a sheet, a dialog or a sideways scroller.
  let swipe = null;
  document.querySelector('main').addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    swipe = e.touches.length === 1 && t.clientX > 24 && t.clientX < innerWidth - 24 && !e.target.closest('input, textarea, select, [contenteditable], dialog, .sheet, .modal-glass')
      && !scrollsSideways(e.target) ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
  }, { passive: true });
  document.querySelector('main').addEventListener('touchend', (e) => {
    if (!swipe) return;
    const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
    const ok = Math.abs(dx) > 70 && Math.abs(dy) < Math.abs(dx) * 0.5 && Date.now() - swipe.at < 700;
    swipe = null;
    if (!ok || document.querySelector('dialog[open], .modal-glass')) return;
    const tabs = TABS.filter(([, tab]) => !$(tab).hidden).map(([n]) => n);
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    const next = tabs[tabs.indexOf(tabNow) + ((dx > 0) === rtl ? 1 : -1)];
    if (next) showTab(next);
  }, { passive: true });
  function scrollsSideways(node) {
    for (let n = node; n && n !== document.body; n = n.parentElement) if (n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true;
    return false;
  }
  $('#tabList').addEventListener('click', () => showTab('list'));
  $('#tabBook').addEventListener('click', () => showTab('book'));
  $('#tabKeto').addEventListener('click', () => showTab('keto'));
  window.addEventListener('keto:changed', (e) => { ketoTab(); if (e.detail !== 'state' || Keto.enabled) render(); });
  window.addEventListener('diets:changed', () => { ketoTab(); render(); });

  render();
  loadAuto();
  showTab(tabFromHash(), 'replace');
  await flush();
  await pull();

  window.__helper = { normalize, categorize, findDuplicate, duplicateGroups, get items() { return [...items.values()]; }, get pending() { return pending; } };
})();
