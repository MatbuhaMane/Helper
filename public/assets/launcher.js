/* Folders of apps (Food, Tools) and the page of an app that is still to come.
   H.folder({ title, sub, back?: { href, label }, look?: 'flat', arrange?: 'tools', hero?: { src, small?, alt }, under?: node, apps: [{ href, ic, name, c1, c2, soon?, owner?, art?, tint?, line? }] })
   (under: something placed between the head and the apps, e.g. an H.strip)
   (arrange: the person may reorder the tiles and pin them to the home page's ring – kept under H.prefs(arrange))
   (art: a silhouette picture used as the icon, filled with tint and outlined with line;
    look 'flat': the line icon itself, large, filled with the app's pastel tint, with no tile behind it)
   H.soonPage({ title, ic, c1, c2, back: { href, label }, text })
   H.strip({ title, items, more? }) → a sideways slider of cards (see below) */
(() => {
  const { el } = H;
  async function folder({ title, sub, apps, back, look, arrange, hero, under }) {
    const r = await H.requireLogin();
    H.header(title);
    const root = document.querySelector('main');
    let list = apps.filter((a) => !a.owner || r.user.role === 'owner');
    // the person's own order (an arrangeable folder): the apps they placed, then any new ones in their usual place
    const P = arrange ? H.prefs(arrange, { order: [], locked: false }) : null;
    if (P?.order?.length) {
      const at = (a) => { const k = P.order.indexOf(a.href); return k < 0 ? 1e3 + list.indexOf(a) : k; };
      list = list.slice().sort((a, b) => at(a) - at(b));
    }
    // drawn tools get one even ink outline (an SVG filter: dilate the shape, fill the ring in the text colour) – flat, like the line icons
    if (list.some((a) => a.art) && !document.getElementById('tool-ink')) {
      document.body.insertAdjacentHTML('beforeend', '<svg class="ink-defs" aria-hidden="true" focusable="false"><filter id="tool-ink" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">'
        + '<feMorphology in="SourceAlpha" operator="dilate" radius="1.8" result="d"/><feFlood class="ink"/><feComposite in2="d" operator="in" result="o"/>'
        + '<feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></svg>');
    }
    const icon = (n) => (H.appIcon ? H.appIcon(n) : H.icon(n));
    const grid = el('nav', { class: 'apps-grid' + (look ? ' ' + look : ''), 'aria-label': title }, list.map((a, i) =>
      el('a', { class: 'app' + (a.soon ? ' later' : ''), href: a.href, 'data-href': a.href, style: `--c1:${a.c1};--c2:${a.c2};--n:${i}${a.tint ? ';--tint:' + a.tint : ''}`, 'data-guide': 'app-' + a.ic, 'data-guide-label': a.name },
        a.art
          // a drawn tool (a silhouette): pastel fill, a soft rounded outline
          ? el('span', { class: 'ic art', style: `--tint:${a.tint};--line:${a.line}` }, el('span', { class: 'shape', style: `-webkit-mask-image:url(${a.art});mask-image:url(${a.art})` }))
          : el('span', { class: 'ic' }, icon(a.ic)),
        el('span', { class: 'name' }, a.name), a.soon ? el('span', { class: 'soon' }, 'בקרוב') : null)));
    // the head: the title and its line – or, with a hero picture, a window in the tent's style with the title on it
    const head = hero
      ? el('div', { class: 'folder-hero' },
        el('img', { src: hero.src, srcset: hero.small ? `${hero.small} 800w, ${hero.src} 1376w` : null, sizes: hero.small ? '(max-width: 700px) 100vw, 860px' : null,
          alt: hero.alt || '', decoding: 'async', fetchpriority: 'high', width: 1376, height: 768 }),
        el('div', { class: 'folder-head folder-hero-cap' }, el('h1', {}, title), sub ? el('p', {}, sub) : null))
      : el('div', { class: 'folder-head' }, el('h1', {}, title), sub ? el('p', {}, sub) : null);
    const folderEl = el('div', { class: 'folder' + (hero ? ' with-hero' : '') },
      back ? el('a', { class: 'folder-back', href: back.href }, '‹ ', back.label) : null,
      head,
      under || null,
      grid);
    root.append(folderEl);
    if (arrange) arrangeable(folderEl, grid, P, arrange);
  }

  /* The arrange mode (an arrangeable folder, e.g. כלים): a long press on a phone, or a right click on a computer (or the
     "סידור" button), and the tiles can be dragged into a new order – the order is the person's, kept on the server so it
     follows them (H.prefs). In the same mode each tile has a pin: pinned ones sit on the home page's ring round the fire
     (H.togglePin, apps.js). "נעילת סידור התפריט" in הגדרות (P.locked) turns the long press and the right click off. */
  function arrangeable(folderEl, grid, P, ns) {
    const reduce = () => (window.H?.reducedMotion ? H.reducedMotion() : matchMedia('(prefers-reduced-motion: reduce)').matches);
    const tiles = () => [...grid.querySelectorAll('.app')];
    const pinnable = (href) => !!H.APPS?.some((a) => a.href === href && !a.fixed);
    let on = false, drag = null, press = null;
    const bar = el('div', { class: 'arrange-bar', role: 'status', hidden: true },
      el('span', {}, el('b', {}, 'סידור התפריט'), ' · גררו אריח כדי לשנות את הסדר', H.APPS ? ' · 📌 מצמיד אותו למדורה בדף הבית' : ''),
      el('button', { class: 'btn small primary', type: 'button', onclick: () => leave() }, 'סיום'));
    const editBtn = el('button', { class: 'btn small ghost arrange-open', type: 'button', onclick: () => enter() }, 'סידור');
    folderEl.querySelector('.folder-head').append(editBtn);
    grid.before(bar);
    const syncLock = () => { editBtn.hidden = !!P.locked || on; };
    syncLock();
    addEventListener('helper:prefs', (e) => { if (e.detail === ns) syncLock(); });

    function pins() {
      for (const t of tiles()) {
        t.querySelector('.app-pin')?.remove();
        if (!on || !pinnable(t.dataset.href)) continue;
        const pinned = H.isPinned(t.dataset.href), name = t.querySelector('.name')?.textContent || '';
        const b = el('button', { class: 'app-pin', type: 'button', 'aria-pressed': String(pinned), 'aria-label': (pinned ? 'הסרה מהמדורה: ' : 'הצמדה למדורה: ') + name, title: pinned ? 'מוצמד למדורה' : 'להצמיד למדורה' }, '📌');
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        b.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const now = H.togglePin(t.dataset.href);
          H.toast?.(now ? `${name} הוצמד למדורה בדף הבית` : `${name} הוסר מהמדורה`);
          pins();
        });
        t.append(b);
      }
    }
    function enter() {
      if (on || P.locked) return;
      on = true; grid.classList.add('arranging'); bar.hidden = false; syncLock();
      tiles().forEach((t) => { t.setAttribute('aria-roledescription', 'אריח שאפשר להזיז'); t.setAttribute('draggable', 'false'); });
      pins();
      navigator.vibrate?.(12);
      bar.querySelector('.btn').focus({ preventScroll: true });
    }
    function leave() {
      if (!on) return;
      on = false; grid.classList.remove('arranging'); bar.hidden = true; syncLock();
      tiles().forEach((t) => t.removeAttribute('aria-roledescription'));
      pins();
    }
    const save = () => { P.order = tiles().map((t) => t.dataset.href); H.savePrefs(ns); };
    /** move a tile to another place in the grid, the others gliding to theirs (FLIP: transform only) */
    function moveTo(tile, index) {
      const all = tiles(), from = all.indexOf(tile);
      if (index === from || index < 0 || index >= all.length) return false;
      const before = new Map(all.map((t) => [t, t.getBoundingClientRect()]));
      const ref = all[index > from ? index + 1 : index] || null;
      grid.insertBefore(tile, ref);
      if (!reduce()) for (const t of tiles()) {
        if (t === tile && drag) continue;
        const a = before.get(t), b = t.getBoundingClientRect();
        const dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) t.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      }
      return true;
    }

    // a long press (a finger, or a held mouse button) opens the mode; a right click on a computer too
    grid.addEventListener('pointerdown', (e) => {
      if (on || P.locked || e.button > 0) return;
      const t = e.target.closest('.app'); if (!t) return;
      press = { x: e.clientX, y: e.clientY, timer: setTimeout(() => { press = null; grid.dataset.justEntered = '1'; enter(); }, 520) };
    });
    const cancelPress = (e) => { if (press && (!e || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8)) { clearTimeout(press.timer); press = null; } };
    grid.addEventListener('pointermove', cancelPress);
    grid.addEventListener('pointerup', () => cancelPress()); grid.addEventListener('pointercancel', () => cancelPress());
    folderEl.addEventListener('contextmenu', (e) => { if (P.locked) return; e.preventDefault(); if (on) leave(); else enter(); });
    // while arranging, a tile is not a link; the tap that ends a long press does not open it either
    grid.addEventListener('click', (e) => {
      if (!on && !grid.dataset.justEntered) return;
      if (e.target.closest('.app') && !e.target.closest('.app-pin')) e.preventDefault();
      delete grid.dataset.justEntered;
    }, true);

    // dragging a tile
    grid.addEventListener('pointerdown', (e) => {
      if (!on || e.button > 0 || e.target.closest('.app-pin')) return;
      const t = e.target.closest('.app'); if (!t) return;
      e.preventDefault();
      const r0 = t.getBoundingClientRect();
      drag = { t, id: e.pointerId, sx: e.clientX, sy: e.clientY, gx: e.clientX - r0.left, gy: e.clientY - r0.top, moved: false };
      try { t.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    });
    const follow = (t, e) => { t.style.transform = 'none'; const b = t.getBoundingClientRect(); t.style.transform = `translate(${(e.clientX - drag.gx - b.left).toFixed(1)}px, ${(e.clientY - drag.gy - b.top).toFixed(1)}px) scale(1.06)`; };
    grid.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { t } = drag;
      if (!drag.moved) { if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return; drag.moved = true; t.classList.add('dragging'); }
      follow(t, e);
      // the tile under the finger's point gives up its place
      let best = -1, bd = Infinity;
      tiles().forEach((o, i) => { if (o === t) return; const b = o.getBoundingClientRect(); const d = Math.hypot(b.left + b.width / 2 - e.clientX, b.top + b.height / 2 - e.clientY); if (d < bd) { bd = d; best = i; } });
      if (best >= 0 && bd < 56 && moveTo(t, best)) follow(t, e);
    });
    const drop = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const { t, moved } = drag; drag = null;
      t.classList.remove('dragging');
      if (!moved) return;
      const cur = t.style.transform;
      t.style.transform = '';
      if (!reduce() && cur && cur !== 'none') t.animate([{ transform: cur }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      save();
    };
    grid.addEventListener('pointerup', drop); grid.addEventListener('pointercancel', drop);

    // the keyboard: in the mode, the arrows move the focused tile (in Hebrew, right is earlier); Escape ends the mode
    grid.addEventListener('keydown', (e) => {
      if (!on) return;
      const t = e.target.closest('.app'); if (!t) return;
      const rtl = getComputedStyle(grid).direction === 'rtl';
      const k = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowUp: -1, ArrowDown: 1 }[e.key];
      if (k) { e.preventDefault(); if (moveTo(t, tiles().indexOf(t) + k)) { t.focus(); save(); } }
      else if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
    });
    document.addEventListener('keydown', (e) => { if (on && e.key === 'Escape') leave(); });
  }
  async function soonPage({ title, ic, c1, c2, back, text }) {
    await H.requireLogin();
    H.header(title);
    document.querySelector('main').append(el('div', { class: 'card soon-page', style: `--c1:${c1};--c2:${c2}` },
      el('span', { class: 'ic' }, H.icon(ic)), el('h1', {}, title),
      el('p', {}, text || 'האפליקציה הזו עוד בבנייה. נאפיין ונבנה אותה בקרוב.'),
      back ? el('a', { class: 'btn', href: back.href }, back.label) : null));
  }
  /* A slider of cards under a folder's head (the food window: recommended recipes, restaurants, notes from the fridge).
     The look is design's; what goes in it is the page's:
       H.strip({ title: 'מה מבשלים היום', more?: { href, label },
                 items: [...] | Promise<[...]>,        // while a promise waits, three quiet placeholder cards
                 [{ href?, onclick?, kind?: 'recipe' | 'place' | 'fridge', tone?: 'soon' | 'gone', kicker?, title, sub?, img?, emoji? }] })
     kind colours the kicker (and a fridge note is a paper note, not a picture card); tone marks what is urgent ("פג מחר",
     "פג אתמול"); img is a picture (4:3) – if it fails, emoji (or the title's first letter) stands in for it. An empty list
     hides the strip. Arrows on a computer; a finger or a trackpad on a phone. */
  function strip({ title, items, more }) {
    const reduce = () => (window.H?.reducedMotion ? H.reducedMotion() : matchMedia('(prefers-reduced-motion: reduce)').matches);
    const track = el('div', { class: 'strip-track', role: 'list', tabindex: '-1' });
    const step = (dir) => track.scrollBy({ left: dir * -Math.max(220, track.clientWidth * 0.8), behavior: reduce() ? 'auto' : 'smooth' });   // RTL: onward is to the left
    const prev = el('button', { class: 'strip-arrow', type: 'button', 'aria-label': 'הקודמים', onclick: () => step(-1) }, '›');
    const next = el('button', { class: 'strip-arrow', type: 'button', 'aria-label': 'הבאים', onclick: () => step(1) }, '‹');
    const ends = () => {
      const max = track.scrollWidth - track.clientWidth, at = Math.abs(track.scrollLeft);
      prev.disabled = at < 4; next.disabled = at > max - 4;
      box.classList.toggle('at-start', at < 4); box.classList.toggle('at-end', at > max - 4);
    };
    const box = el('section', { class: 'strip at-start', 'aria-label': title },
      el('div', { class: 'strip-head' }, el('h2', {}, title), el('span', { class: 'spacer' }),
        more ? el('a', { class: 'strip-more', href: more.href }, more.label || 'הכול') : null,
        el('span', { class: 'strip-arrows' }, prev, next)),
      track);
    const card = (it) => {
      const kind = (it.kind ? ' kind-' + it.kind : '') + (it.tone ? ' tone-' + it.tone : '');
      const stand = () => it.emoji || (String(it.title || '').replace(/[^א-תa-z]/gi, '')[0] || '🍽️');
      const emojiPic = () => el('span', { class: 'strip-pic emoji', 'aria-hidden': 'true' }, stand());
      const pic = it.kind === 'fridge' ? null
        : it.img ? el('span', { class: 'strip-pic' }, el('img', { src: it.img, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
          onerror: (e) => e.target.parentElement?.replaceWith(emojiPic()) }))
          : emojiPic();
      const body = [pic, el('span', { class: 'strip-body' },
        it.kicker ? el('span', { class: 'strip-kicker' }, it.kind === 'fridge' && it.emoji ? it.emoji + ' ' : '', it.kicker) : null,
        el('b', { class: 'strip-title' }, it.title), it.sub ? el('span', { class: 'strip-sub' }, it.sub) : null)];
      return it.href
        ? el('a', { class: 'strip-card' + kind, href: it.href, role: 'listitem' }, ...body)
        : el('button', { class: 'strip-card' + kind, type: 'button', role: 'listitem', onclick: it.onclick }, ...body);
    };
    const fill = (list) => {
      if (!list?.length) { box.hidden = true; return; }
      track.replaceChildren(...list.map(card));
      requestAnimationFrame(ends);
    };
    track.addEventListener('scroll', ends, { passive: true });
    addEventListener('resize', ends, { passive: true });
    if (Array.isArray(items)) fill(items);
    else {
      track.replaceChildren(...[0, 1, 2].map(() => el('span', { class: 'strip-card waiting', 'aria-hidden': 'true' }, el('span', { class: 'strip-pic' }), el('span', { class: 'strip-body' }, el('i'), el('i')))));
      box.setAttribute('aria-busy', 'true');
      Promise.resolve(items).then((l) => { box.removeAttribute('aria-busy'); fill(l); }, () => { box.hidden = true; });
    }
    return box;
  }
  Object.assign(H, { folder, soonPage, strip });
})();
