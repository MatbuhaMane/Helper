/* ארגז הכלים (the owner, 2026-11-14): every app of the catalogue (H.APPS in /assets/apps.js), in one folder.
   The person chooses the order, saved with their preferences (H.prefs('toolsView')):
     hand      – their own arrangement (the arrange mode of H.folder: drag, and pin to the fire);
     name      – by name, in Hebrew order;
     category  – under the catalogue's categories (H.CATS) in the owner's order, with what is still to come (H.FUTURE) inside its category.
   A beta or secret app shows only to whom the back door opened it (H.mayOpen); the server refuses its API anyway.
   The folder is drawn once; a change of order moves the same tiles (so the arrange mode keeps working). */
(async () => {
  const { el } = H;
  const me = await H.me();
  const view = H.prefs('toolsView', { sort: 'hand' });
  const SORTS = [['hand', 'הסדר שלי'], ['name', 'לפי שם'], ['category', 'לפי קטגוריה']];
  // a pastel fill for an app with no tint of its own (the flat look fills the icon's shapes)
  const tint = (a) => a.tint || `color-mix(in srgb, ${a.c2 || '#888'} 26%, #fff)`;
  const apps = (H.APPS || []).filter((a) => a.href !== '/tools/' && H.mayOpen(a, me))
    .map((a) => ({ href: a.href, ic: a.ic, name: a.name, tag: a.tag, c1: a.c1 || a.c2, c2: a.c2, tint: tint(a), cat: a.cat }));
  // still to come: drawn only, a tap says what it will be
  // only: 'child' (homework) is shown only to a child (/api/me: child)
  const future = (H.FUTURE || []).filter((f) => !f.only || (f.only === 'child' && me.child)).map((f) => ({ href: '#soon-' + f.id, ic: f.ic, name: f.name, soon: true, c1: '#b9b2a2', c2: '#8a8272', tint: '#ece8de', line: f.line, note: f.note }));

  const choice = el('div', { class: 'tools-sort', role: 'radiogroup', 'aria-label': 'סדר הכלים', style: 'display:flex;flex-wrap:wrap;gap:8px;margin-block:4px 14px' },
    SORTS.map(([k, label]) => el('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(view.sort === k), 'data-sort': k,
      onclick: () => { if (view.sort === k) return; view.sort = k; H.savePrefs('toolsView'); order(); } }, label)));

  await H.folder({ title: 'כלים', sub: 'כל הכלים של האוהל במקום אחד', look: 'flat', arrange: 'tools', under: choice, apps: [...apps, ...future] });

  const folderEl = document.querySelector('.folder');
  const grid = folderEl.querySelector('.apps-grid');
  const tiles = new Map([...grid.querySelectorAll('.app')].map((t) => [t.dataset.href, t]));
  for (const f of future) {
    const t = tiles.get(f.href);
    t.querySelector('.soon')?.replaceChildren(f.note || 'בעתיד');
    t.addEventListener('click', (e) => { e.preventDefault(); H.toast(`${f.name}: ${f.line}`); });
  }
  let hand = [...tiles.keys()];      // the person's own order, as H.folder drew it (and as the arrange mode leaves it)
  let groups = [];                   // the category sections, while they are shown
  let drawn = null;                  // the order on screen now

  function order() {
    for (const b of choice.querySelectorAll('[data-sort]')) b.setAttribute('aria-checked', String(b.dataset.sort === view.sort));
    if (drawn === 'hand') hand = [...grid.querySelectorAll('.app')].map((t) => t.dataset.href);   // keep what the arrange mode changed
    drawn = view.sort;
    for (const g of groups) g.remove();
    groups = [];
    grid.hidden = false;
    const editBtn = folderEl.querySelector('.arrange-open');
    if (editBtn) editBtn.style.display = view.sort === 'hand' ? '' : 'none';   // arranging is the hand order's own
    const put = (hrefs, into) => { hrefs.forEach((h, i) => { const t = tiles.get(h); if (t) { t.style.setProperty('--n', i); into.append(t); } }); };
    const isFuture = (h) => h.startsWith('#soon-');
    for (const [h, t] of tiles) t.hidden = isFuture(h) && view.sort !== 'category';
    if (view.sort === 'name') {
      const coll = new Intl.Collator('he');
      put(apps.slice().sort((x, y) => coll.compare(x.name, y.name)).map((a) => a.href), grid);
    } else if (view.sort === 'category') {
      const seen = new Set();
      const section = (title, hrefs) => {
        hrefs = hrefs.filter((h) => tiles.has(h) && !seen.has(h));
        if (!hrefs.length) return;
        hrefs.forEach((h) => seen.add(h));
        const nav = el('nav', { class: grid.className, 'aria-label': title });
        put(hrefs, nav);
        const s = el('section', { class: 'tools-cat' }, el('h2', { class: 'tools-cat-h' }, title), nav);
        groups.push(s);
        grid.before(s);
      };
      for (const c of H.CATS || []) section(c.name, c.apps.map((h) => (h.startsWith('soon:') ? '#soon-' + h.slice(5) : h)));
      section('עוד', apps.map((a) => a.href));     // anything with no category yet
      grid.hidden = true;          // the sections stand before it, in order
    } else {
      put([...hand.filter((h) => tiles.has(h)), ...[...tiles.keys()].filter((h) => !hand.includes(h))], grid);
    }
  }
  order();
})();
