/* The fridge: an interactive list of what's in each of the family's fridges. Every fridge is shared – everyone sees and
   edits all of them, and changes from others arrive within moments.
   With the other food apps:
   - "נגמר" takes an item out and puts it on the shopping list;
   - "מהקניות" brings in what was bought (the ticked items on the shopping list) and clears them off the list;
   - "מה לבשל?" looks through the recipe book for what can be cooked from what's inside.
   Each person can call one fridge theirs ("המקרר שלי"): its tab follows what's in it, says what to use first by its
   expiry date, and what to restock (what is usually there and ran out, or is about to). */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('מקרר');
  const P = H.prefs('fridge', { current: null, mine: null, view: 'mine' });
  const root = document.querySelector('main');

  // the fridge's shelves; a new item finds its shelf by the shopping list's own keywords (data.js)
  const SHELVES = [
    ['dairy', 'חלב וביצים', '🥛'], ['meat', 'בשר, עוף ודגים', '🍗'], ['veg', 'ירקות ופירות', '🥬'], ['ready', 'מוכן ושאריות', '🍲'],
    ['sauce', 'רטבים וממרחים', '🫙'], ['drinks', 'משקאות', '🧃'], ['other', 'אחר', '📦'],
  ];
  const FROM_GROCERY = { dairy: 'dairy', meat: 'meat', veg: 'veg', herbs: 'veg', pantry: 'sauce', drinks: 'drinks', frozen: 'other' };
  const READY = ['שאריות', 'מוכן', 'קציצות', 'מרק', 'תבשיל', 'פשטידה', 'אורז מבושל', 'פסטה מבושלת', 'עוגה', 'סלט מוכן', 'חומוס', 'טחינה מוכנה'];
  const SAUCES = ['רוטב', 'קטשופ', 'מיונז', 'חרדל', 'ממרח', 'ריבה', 'טחינה', 'סילאן', 'פסטו', 'חמוצים', 'זיתים'];
  function shelfOf(name) {
    const n = name.toLowerCase();
    if (READY.some((k) => n.includes(k))) return 'ready';
    if (SAUCES.some((k) => n.includes(k))) return 'sauce';
    if (['מיץ', 'משקה', 'סודה', 'בירה', 'יין', 'שוקו', 'לימונדה', 'מים מינרלים'].some((k) => n.includes(k))) return 'drinks';
    let best = { cat: 'other', len: 0 };
    // (data.js declares its keywords as a script-wide const, not on window)
    const KW = typeof CATEGORY_KEYWORDS !== 'undefined' ? CATEGORY_KEYWORDS : {};
    for (const cat of Object.keys(KW)) for (const kw of KW[cat]) if (kw.length > best.len && (' ' + n + ' ').includes(kw.toLowerCase())) best = { cat, len: kw.length };
    return FROM_GROCERY[best.cat] || 'other';
  }
  const groceryCat = (shelf) => ({ dairy: 'dairy', meat: 'meat', veg: 'veg', sauce: 'pantry', drinks: 'drinks', ready: 'other', other: 'other' })[shelf] || 'other';
  const norm = (s) => String(s || '').replace(/[֑-ׇ]/g, '').replace(/["'`׳״.,()-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => new Date().toISOString().slice(0, 10);
  const daysTo = (d) => Math.round((new Date(d + 'T12:00').getTime() - new Date(today() + 'T12:00').getTime()) / 864e5);

  let fridges = [], items = new Map(), since = 0, current = null, pollT = 0;

  async function loadFridges() {
    fridges = (await api('/api/fridges')).fridges;
    current = fridges.find((f) => f.id === P.current)?.id || fridges[0]?.id || null;
  }
  async function loadItems(full) {
    if (!current) return;
    const r = await api(`/api/fridges/${current}/items${full ? '' : `?since=${since}`}`, { noRedirect: true });
    if (full) items = new Map();
    for (const i of r.items) i.deleted ? items.delete(i.id) : items.set(i.id, i);
    since = r.now;
  }
  async function ops(list) {
    // shown at once; the server keeps the order (and everyone else gets it on their next refresh)
    for (const o of list) o.op === 'delete' ? items.delete(o.id) : items.set(o.item.id, o.item);
    draw();
    if (P.view === 'mine' && current === P.mine) drawMine();
    try { await api(`/api/fridges/${current}/ops`, { body: { ops: list } }); }
    catch (_) { toast('לא נשמר – בדקו את החיבור'); await loadItems(true); draw(); }
  }
  function poll() {
    clearTimeout(pollT);
    pollT = setTimeout(async () => {
      if (document.visibilityState === 'visible') { try { await loadItems(false); draw(); } catch (_) { /* offline */ } }
      poll();
    }, 15000);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadItems(false).then(draw).catch(() => {}); });

  /* ---------- drawing ---------- */
  const bar = el('div', { class: 'fr-fridges', role: 'tablist', 'aria-label': 'המקררים' });
  const list = el('div', { class: 'fr-list' });
  const nameIn = el('input', { type: 'text', placeholder: 'מה הכנסנו למקרר?', 'aria-label': 'פריט חדש', dir: 'auto', autocomplete: 'off' });
  const qtyIn = el('input', { type: 'number', min: 1, max: 99, value: 1, 'aria-label': 'כמות', class: 'fr-qty-in' });
  const expIn = el('input', { type: 'date', 'aria-label': 'תוקף (לא חובה)', class: 'fr-exp-in' });
  const add = el('form', { class: 'fr-add card' }, nameIn, qtyIn, el('label', { class: 'fr-exp-lab', title: 'תאריך תפוגה (לא חובה)' }, el('span', {}, 'תוקף'), expIn),
    el('button', { class: 'btn primary', type: 'submit' }, 'להכניס'));
  add.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameIn.value.trim(); if (!name) return;
    // the same item already inside: one more of it (and the nearer expiry)
    const same = [...items.values()].find((i) => norm(i.name) === norm(name));
    if (same) ops([{ op: 'upsert', item: { ...same, qty: (same.qty || 1) + (+qtyIn.value || 1), expires: expIn.value && (!same.expires || expIn.value < same.expires) ? expIn.value : same.expires } }]);
    else ops([{ op: 'upsert', item: { id: newId(), name, cat: shelfOf(name), qty: +qtyIn.value || 1, unit: null, expires: expIn.value || null, note: null } }]);
    nameIn.value = ''; qtyIn.value = 1; expIn.value = ''; nameIn.focus();
  });
  const acts = el('div', { class: 'fr-acts' },
    el('button', { class: 'btn small', type: 'button', onclick: () => cook() }, '🍳 מה לבשל?'),
    el('button', { class: 'btn small', type: 'button', onclick: () => fromShopping() }, '🛒 מהקניות'),
    el('button', { class: 'btn small ghost', type: 'button', onclick: () => fridgeMenu() }, '⋯ המקרר'));

  function drawFridges() {
    bar.replaceChildren(...fridges.map((f) => el('button', { type: 'button', role: 'tab', class: 'fr-chip', 'aria-selected': String(f.id === current), onclick: () => switchTo(f.id) },
      el('span', { class: 'ic', 'aria-hidden': 'true' }, f.id === P.mine ? '🏠' : '🧊'), el('b', {}, f.name), f.id === P.mine ? el('em', {}, 'שלי') : null, f.id === current ? el('small', {}, String(items.size)) : f.count ? el('small', {}, String(f.count)) : null,
      f.soon && f.id !== current ? el('i', { class: 'warn', title: 'יש בו משהו שעומד לפוג' }) : null)),
      el('button', { type: 'button', class: 'fr-chip add', onclick: newFridge, 'aria-label': 'מקרר חדש' }, '+ מקרר'));
  }
  function draw() {
    drawFridges();
    const all = [...items.values()];
    if (!all.length) { list.replaceChildren(el('div', { class: 'fr-empty' }, el('p', {}, 'המקרר ריק.'), el('p', { class: 'muted' }, 'הוסיפו מה שיש בו, או הביאו את מה שנקנה מרשימת הקניות.'))); return; }
    const soon = all.filter((i) => i.expires && daysTo(i.expires) <= 2).sort((a, b) => a.expires.localeCompare(b.expires));
    list.replaceChildren(...[
      soon.length ? el('div', { class: 'fr-soon' }, el('b', {}, '⏳ כדאי לאכול קודם: '), soon.map((i) => i.name).join(', ')) : null,
      ...SHELVES.map(([id, title, icon]) => {
        const shelf = all.filter((i) => (i.cat || 'other') === id).sort((a, b) => (a.expires || '9').localeCompare(b.expires || '9') || a.name.localeCompare(b.name, 'he'));
        if (!shelf.length) return null;
        return el('section', { class: 'fr-shelf' }, el('h3', {}, el('span', { 'aria-hidden': 'true' }, icon), title, el('small', {}, String(shelf.length))), el('ul', {}, shelf.map(row)));
      })].filter(Boolean));
  }
  function row(i) {
    const d = i.expires ? daysTo(i.expires) : null;
    const exp = d == null ? null : el('span', { class: 'fr-exp' + (d < 0 ? ' gone' : d <= 2 ? ' soon' : '') }, d < 0 ? 'פג תוקף' : d === 0 ? 'היום' : d === 1 ? 'מחר' : `עוד ${d} ימים`);
    const set = (patch) => ops([{ op: 'upsert', item: { ...i, ...patch } }]);
    return el('li', { class: 'fr-item' },
      el('div', { class: 'fr-name' }, el('b', { dir: 'auto' }, i.name), exp),
      el('div', { class: 'fr-step', dir: 'ltr' },
        el('button', { type: 'button', 'aria-label': 'פחות', onclick: () => (i.qty > 1 ? set({ qty: i.qty - 1 }) : finished(i)) }, '−'),
        el('span', {}, String(i.qty)),
        el('button', { type: 'button', 'aria-label': 'עוד', onclick: () => set({ qty: i.qty + 1 }) }, '+')),
      el('button', { class: 'fr-date', type: 'button', title: i.expires ? 'לשנות את תאריך התפוגה' : 'להוסיף תאריך תפוגה', 'aria-label': 'תאריך תפוגה', onclick: () => setExpiry(i) }, '📅'),
      el('button', { class: 'btn small fr-out', type: 'button', title: 'נגמר – להוציא ולהוסיף לרשימת הקניות', onclick: () => finished(i) }, 'נגמר'),
      el('button', { class: 'fr-x', type: 'button', 'aria-label': 'להוציא בלי להוסיף לקניות', title: 'להוציא', onclick: () => ops([{ op: 'delete', id: i.id }]) }, '✕'));
  }

  function setExpiry(i) {
    const d = el('input', { type: 'date', value: i.expires || '', 'aria-label': 'תאריך תפוגה' });
    H.modal(el('h2', {}, i.name), el('p', { class: 'muted' }, 'עד מתי טוב לאכול את זה?'), d,
      el('div', { class: 'fr-modal-acts' },
        i.expires ? el('button', { class: 'btn ghost', type: 'button', onclick: () => { ops([{ op: 'upsert', item: { ...i, expires: null } }]); H.closeModal(); } }, 'בלי תאריך') : null,
        el('button', { class: 'btn primary', type: 'button', onclick: () => { if (d.value) ops([{ op: 'upsert', item: { ...i, expires: d.value } }]); H.closeModal(); } }, 'לשמור')));
    setTimeout(() => d.focus(), 50);
  }

  /* ---------- with the other food apps ---------- */
  /** Ran out: out of the fridge, onto the shopping list (unless it is already on it). */
  async function finished(i) {
    ops([{ op: 'delete', id: i.id }]);
    try {
      const g = await api('/api/groceries', { noRedirect: true });
      const there = (g.items || []).find((x) => !x.deleted && norm(x.name) === norm(i.name));
      if (there && !there.checked) { toast(`"${i.name}" יצא מהמקרר (כבר ברשימת הקניות)`); return; }
      const item = there ? { ...there, checked: false } : { id: 'fr' + newId(), name: i.name, cat: groceryCat(i.cat), checked: false, qty: 1, from: 'המקרר' };
      await api('/api/groceries/ops', { body: { ops: [{ op: 'upsert', item: { id: item.id, name: item.name, cat: item.cat, checked: false, qty: item.qty || 1, from: item.from || 'המקרר' } }] } });
      toast(`"${i.name}" נגמר – נוסף לרשימת הקניות`, 'לרשימה', () => { location.href = '/groceries/'; });
    } catch (_) { toast(`"${i.name}" יצא מהמקרר; לא הצלחתי להוסיף לרשימת הקניות`); }
  }
  /** What was bought (ticked on the shopping list) comes into this fridge, and leaves the list. */
  async function fromShopping() {
    let g;
    try { g = await api('/api/groceries', { noRedirect: true }); } catch (_) { return toast('רשימת הקניות לא נטענה'); }
    const bought = (g.items || []).filter((x) => !x.deleted && x.checked && !['clean', 'care', 'dry', 'bakery'].includes(x.cat));
    if (!bought.length) return toast('אין ברשימת הקניות פריטים שסומנו כנקנו');
    const picked = new Set(bought.map((b) => b.id));
    const chips = el('div', { class: 'fr-chips' }, bought.map((b) => {
      const c = el('button', { type: 'button', class: 'fr-pick', 'aria-pressed': 'true', onclick: () => { const on = !picked.has(b.id); on ? picked.add(b.id) : picked.delete(b.id); c.setAttribute('aria-pressed', String(on)); } }, b.name + (b.qty > 1 ? ` ×${b.qty}` : ''));
      return c;
    }));
    const name = fridges.find((f) => f.id === current)?.name || '';
    H.modal(el('h2', {}, `מהקניות אל ${name}`), el('p', { class: 'muted' }, 'מה שסומן ברשימת הקניות כנקנה. מה שנבחר ייכנס למקרר וירד מהרשימה.'), chips,
      el('div', { class: 'fr-modal-acts' }, el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        const chosen = bought.filter((b) => picked.has(b.id));
        if (!chosen.length) return H.closeModal();
        const mine = [...items.values()];
        ops(chosen.map((b) => {
          const same = mine.find((i) => norm(i.name) === norm(b.name));
          return same ? { op: 'upsert', item: { ...same, qty: same.qty + (b.qty || 1) } } : { op: 'upsert', item: { id: newId(), name: b.name, cat: FROM_GROCERY[b.cat] || shelfOf(b.name), qty: b.qty || 1, unit: null, expires: null, note: null } };
        }));
        await api('/api/groceries/ops', { body: { ops: chosen.map((b) => ({ op: 'delete', id: b.id })) } }).catch(() => {});
        H.closeModal(); toast(`${chosen.length} פריטים נכנסו למקרר`);
      } }, 'להכניס למקרר')));
  }
  /** What can be cooked: recipes whose ingredients are mostly in the fridge (the pantry basics don't count). */
  async function cook(withThese) {
    let recipes;
    try { recipes = (await api('/api/recipes', { noRedirect: true })).recipes || []; } catch (_) { return toast('ספר המתכונים לא נטען'); }
    const BASIC = ['מלח', 'פלפל', 'שמן', 'מים', 'סוכר', 'קמח', 'תבלינים', 'פפריקה', 'כמון', 'כורכום'];
    const have = [...items.values()].map((i) => norm(i.name));
    const has = (ing) => { const n = norm(ing); return have.some((h) => h && (n.includes(h) || h.includes(n))); };
    const scored = recipes.map((r) => {
      const ings = (r.ingredients || []).map((x) => x.name).filter((n) => n && !BASIC.some((b) => norm(n).includes(b)));
      const got = ings.filter(has);
      return { r, got, missing: ings.filter((n) => !has(n)), k: ings.length ? got.length / ings.length : 0 };
    }).filter((s) => s.got.length && (!withThese || s.got.some((g) => withThese.some((w) => norm(g).includes(norm(w)) || norm(w).includes(norm(g))))))
      .sort((a, b) => b.k - a.k || b.got.length - a.got.length).slice(0, 8);
    const out = scored.length ? el('div', { class: 'fr-cook' }, scored.map((s) => el('div', { class: 'fr-recipe' },
      s.r.image ? el('span', { class: 'img', style: `background-image:url("${s.r.image}")` }) : el('span', { class: 'img none' }, '🍲'),
      el('div', {}, el('b', {}, s.r.title), el('small', {}, `יש ${s.got.length} מתוך ${s.got.length + s.missing.length} מצרכים`),
        s.missing.length ? el('small', { class: 'miss' }, 'חסר: ' + s.missing.slice(0, 5).join(', ')) : el('small', { class: 'ok' }, 'יש הכל!'),
        s.missing.length ? el('button', { class: 'btn small ghost', type: 'button', onclick: (e) => addMissing(s.missing, e.currentTarget) }, 'החסר לרשימת הקניות') : null))))
      : el('p', {}, 'לא מצאתי בספר המתכונים מתכון עם מה שיש במקרר. אפשר לחפש מתכונים חדשים בספר המתכונים.');
    H.modal(el('h2', {}, withThese ? 'מה לבשל עם מה שצריך לגמור' : 'מה אפשר לבשל'), el('p', { class: 'muted' }, withThese ? 'מתכונים מהספר שמשתמשים ב: ' + withThese.join(', ') : 'מספר המתכונים, לפי מה שיש במקרר.'), out,
      el('div', { class: 'fr-modal-acts' }, el('a', { class: 'btn ghost', href: '/groceries/#book' }, 'לספר המתכונים')));
  }
  async function addMissing(names, btn) {
    const ops2 = names.map((n) => ({ op: 'upsert', item: { id: 'fr' + newId(), name: n, cat: groceryCat(shelfOf(n)), checked: false, qty: 1, from: 'המקרר' } }));
    await api('/api/groceries/ops', { body: { ops: ops2 } }).catch(() => {});
    btn.disabled = true; btn.textContent = '✓ נוסף לרשימה';
  }

  /* ---------- my fridge ---------- */
  const mineBox = el('div', { class: 'fr-mine' });
  let hist = [], groceryNames = new Set();
  async function loadMine() {
    const [h, g] = await Promise.all([
      api(`/api/fridges/${current}/history`, { noRedirect: true }).catch(() => ({ names: [] })),
      api('/api/groceries', { noRedirect: true }).catch(() => ({ items: [] })),
    ]);
    hist = h.names || [];
    groceryNames = new Set((g.items || []).filter((x) => !x.deleted && !x.checked).map((x) => norm(x.name)));
  }
  function drawMine() {
    const all = [...items.values()];
    const expired = all.filter((i) => i.expires && daysTo(i.expires) < 0);
    const soon = all.filter((i) => i.expires && daysTo(i.expires) >= 0 && daysTo(i.expires) <= 3).sort((a, b) => a.expires.localeCompare(b.expires));
    const noDate = all.filter((i) => !i.expires).length;
    // what this fridge usually has (came in at least twice): gone now → restock; one left → about to run out
    const here = new Map(all.map((i) => [norm(i.name), i]));
    const usual = hist.filter((h) => h.times >= 2);
    const restock = usual.filter((h) => !here.has(norm(h.name))).slice(0, 12);
    const low = usual.filter((h) => here.get(norm(h.name))?.qty <= 1).slice(0, 8);
    const onList = (n) => groceryNames.has(norm(n));
    const toList = async (names, btn) => {
      const fresh = names.filter((n) => !onList(n));
      if (!fresh.length) return;
      await api('/api/groceries/ops', { body: { ops: fresh.map((n) => ({ op: 'upsert', item: { id: 'fr' + newId(), name: n, cat: groceryCat(shelfOf(n)), checked: false, qty: 1, from: 'המקרר שלי' } })) } });
      fresh.forEach((n) => groceryNames.add(norm(n)));
      toast(fresh.length === 1 ? `"${fresh[0]}" נוסף לרשימת הקניות` : `${fresh.length} מצרכים נוספו לרשימת הקניות`, 'לרשימה', () => { location.href = '/groceries/'; });
      drawMine();
    };
    const chip = (n, extra) => el('span', { class: 'fr-rec' + (onList(n) ? ' listed' : '') }, el('b', {}, n), extra ? el('small', {}, extra) : null,
      onList(n) ? el('small', { class: 'ok' }, '✓ ברשימה') : el('button', { type: 'button', 'aria-label': `להוסיף "${n}" לרשימת הקניות`, onclick: (e) => toList([n], e.currentTarget) }, '+ לקניות'));
    const when = (d) => (d < 0 ? 'פג' : d === 0 ? 'היום' : d === 1 ? 'מחר' : `עוד ${d} ימים`);
    mineBox.replaceChildren(
      el('div', { class: 'fr-mine-grid' },
        el('section', { class: 'card fr-panel' },
          el('h3', {}, '⏳ לפי תוקף'),
          !expired.length && !soon.length ? el('p', { class: 'muted' }, noDate === all.length && all.length ? 'אין עדיין תאריכי תפוגה. לחצו 📅 ליד פריט כדי להוסיף.' : 'אין כרגע מה שעומד לפוג. 👌') : null,
          expired.length ? el('div', { class: 'fr-group' }, el('small', { class: 'gone' }, 'פג תוקף – לבדוק, ואם צריך לזרוק'), el('div', { class: 'fr-recs' }, expired.map((i) => el('span', { class: 'fr-rec gone' }, el('b', {}, i.name), el('small', {}, when(daysTo(i.expires))))))) : null,
          soon.length ? el('div', { class: 'fr-group' }, el('small', {}, 'להשתמש בימים הקרובים'), el('div', { class: 'fr-recs' }, soon.map((i) => el('span', { class: 'fr-rec soon' }, el('b', {}, i.name), el('small', {}, when(daysTo(i.expires)))))),
            el('button', { class: 'btn small', type: 'button', onclick: () => cook(soon.map((i) => i.name)) }, '🍳 מה לבשל מזה?')) : null,
          noDate && noDate < all.length ? el('p', { class: 'fr-tip' }, `${noDate === 1 ? 'לפריט אחד' : `ל־${noDate} פריטים`} אין תאריך תפוגה – 📅 ליד פריט מוסיף תזכורת.`) : null),
        el('section', { class: 'card fr-panel' },
          el('h3', {}, '🛒 להשלים'),
          !restock.length && !low.length ? el('p', { class: 'muted' }, hist.length ? 'יש את כל מה שבדרך כלל יש במקרר הזה.' : 'כשמצרכים ייכנסו וייגמרו כמה פעמים, אדע מה בדרך כלל יש כאן ואמליץ מה להשלים.') : null,
          low.length ? el('div', { class: 'fr-group' }, el('small', {}, 'כמעט נגמר'), el('div', { class: 'fr-recs' }, low.map((h) => chip(h.name, 'נשאר אחד')))) : null,
          restock.length ? el('div', { class: 'fr-group' }, el('small', {}, 'בדרך כלל יש, ועכשיו אין'), el('div', { class: 'fr-recs' }, restock.map((h) => chip(h.name, `${h.times} פעמים`)))) : null,
          [...low, ...restock].some((h) => !onList(h.name)) ? el('button', { class: 'btn small primary', type: 'button', onclick: (e) => toList([...low, ...restock].map((h) => h.name), e.currentTarget) }, 'הכל לרשימת הקניות') : null)));
  }

  /* ---------- the two views: my fridge, and all the family's fridges ---------- */
  const views = el('div', { class: 'fr-views', role: 'tablist', 'aria-label': 'תצוגה' });
  const title = el('h1', {}, 'מקרר');
  async function layout() {
    const mine = fridges.find((f) => f.id === P.mine);
    document.querySelector('.fr')?.classList.toggle('mine-view', P.view === 'mine' && !!mine);
    if (P.view === 'mine' && !mine) P.view = P.mine ? 'all' : P.view;
    views.replaceChildren(...[['mine', '🏠 המקרר שלי'], ['all', 'כל המקררים']].map(([v, l]) =>
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(P.view === v), onclick: () => { P.view = v; H.savePrefs('fridge'); layout(); } }, l)));
    if (P.view === 'mine') {
      bar.hidden = true;
      if (!mine) {
        title.textContent = 'המקרר שלי';
        mineBox.replaceChildren(el('div', { class: 'card fr-choose' }, el('h3', {}, 'איזה מקרר הוא שלך?'),
          el('p', { class: 'muted' }, 'המקרר שבו את/ה משתמש/ת. כאן יופיע מה צריך לגמור לפי התוקף ומה להשלים.'),
          el('div', { class: 'fr-recs' }, fridges.map((f) => el('button', { class: 'btn', type: 'button', onclick: () => { P.mine = f.id; H.savePrefs('fridge'); layout(); toast(`"${f.name}" הוא עכשיו המקרר שלך`); } }, '🏠 ' + f.name)))));
        add.hidden = true; list.hidden = true;
        return;
      }
      add.hidden = false; list.hidden = false;
      title.textContent = mine.name;
      title.append(el('small', { class: 'fr-mine-tag' }, 'המקרר שלי'));
      if (current !== mine.id) await switchTo(mine.id);
      await loadMine(); drawMine();
    } else {
      bar.hidden = false; add.hidden = false; list.hidden = false; mineBox.replaceChildren();
      title.textContent = 'מקרר';
      draw();
    }
  }

  /* ---------- fridges ---------- */
  async function switchTo(id) {
    if (id === current) return;
    const f = fridges.find((x) => x.id === current); if (f) f.count = items.size;
    current = id; P.current = id; H.savePrefs('fridge'); since = 0;
    list.replaceChildren(el('p', { class: 'muted' }, 'טוען…')); drawFridges();
    await loadItems(true); draw();
    if (P.view === 'mine' && current === P.mine) { await loadMine(); drawMine(); }
  }
  async function newFridge() {
    const name = prompt('איך לקרוא למקרר החדש?'); if (!name?.trim()) return;
    const r = await api('/api/fridges', { body: { name: name.trim() } });
    fridges.push(r.fridge); switchTo(r.fridge.id);
  }
  function fridgeMenu() {
    const f = fridges.find((x) => x.id === current); if (!f) return;
    H.modal(el('h2', {}, f.name), el('p', { class: 'muted' }, 'כל בני המשפחה רואים את המקרר הזה ויכולים לערוך אותו.'),
      el('div', { class: 'fr-modal-acts' },
        el('button', { class: 'btn' + (P.mine === f.id ? ' ghost' : ' primary'), type: 'button', onclick: () => { P.mine = P.mine === f.id ? null : f.id; H.savePrefs('fridge'); H.closeModal(); layout(); toast(P.mine ? `"${f.name}" הוא עכשיו המקרר שלך` : 'המקרר כבר לא משויך אליך'); } }, P.mine === f.id ? 'להפסיק לשייך אליי' : '🏠 זה המקרר שלי'),
        el('button', { class: 'btn', type: 'button', onclick: async () => { const n = prompt('שם חדש למקרר', f.name); if (!n?.trim()) return; await api(`/api/fridges/${f.id}`, { method: 'PUT', body: { name: n.trim() } }); f.name = n.trim(); H.closeModal(); draw(); } }, 'שינוי שם'),
        el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
          if (!confirm(`למחוק את "${f.name}" ואת כל מה שרשום בו? זה ישפיע על כל המשפחה.`)) return;
          await api(`/api/fridges/${f.id}`, { method: 'DELETE' }); fridges = fridges.filter((x) => x.id !== f.id); H.closeModal(); current = null; if (fridges[0]) switchTo(fridges[0].id); else draw();
        } }, 'מחיקת המקרר')));
  }

  /* ---------- go ---------- */
  root.append(el('div', { class: 'fr' },
    el('a', { class: 'folder-back', href: '/food/' }, '‹ אוכל'),
    views,
    el('div', { class: 'fr-head' }, title, acts),
    bar, mineBox, add, list));
  try {
    await loadFridges();
    if (P.view === 'mine' && P.mine && fridges.some((f) => f.id === P.mine)) current = P.mine;
    await loadItems(true);
  } catch (e) { list.replaceChildren(el('p', {}, 'לא הצלחתי לטעון את המקררים: ' + e.message)); return; }
  draw(); await layout(); poll();
})();
