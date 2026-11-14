/* The tent's touch gestures (batch 30, the Telegram test; numbers agreed with design, docs/design/motion.md):
   Pointer Events only, passive listeners, the axis locks after 8 px. The CSS gives the look (.swipe, .lp-menu, .vid-speed in
   base.css); this sets the variables and the states, and lets go of them so the CSS settles the rest.
     Gestures.swipe(el, { reply, acts, full })   el: .swipe > (.swipe-acts | span.swipe-reply) + .swipe-body
         reply(): a swipe toward the end past 64 px (.armed, a short buzz), the drag is capped at 88 px
         acts: true when .swipe-acts holds 76 px buttons: opening snaps at half a button; past 60% of the row: full() or the first button
     Gestures.longPress(el, () => [{ label, run, danger }, '-'])   450 ms within 8 px: the item lifts, the page dims, a menu grows from the finger
     Gestures.vidSpeed(box, video)   hold 300 ms for 2×; slide in 40 px steps to 2.5× and 3×; back to 1× on release
   Nothing here moves anything but transform and opacity (through the CSS). */
(() => {
  'use strict';
  const AXIS = 8, ARM = 64, CAP = 88, BTN = 76, HOLD = 450, SPEED_HOLD = 300, STEP = 40;
  const rtl = () => getComputedStyle(document.documentElement).direction === 'rtl';
  const buzz = (ms) => { try { (window.H?.vibrate || ((n) => navigator.vibrate?.(n)))(ms); } catch (_) { /* no vibration */ } };
  const interactive = (t) => !!t.closest('input, textarea, select, a[href], video, [contenteditable]');

  function swipe(root, o = {}) {
    const body = root.querySelector('.swipe-body');
    if (!body) return () => {};
    let id = null, x0 = 0, y0 = 0, lock = '', armed = false, open = false, width = 0;
    const set = (dx, p) => { root.style.setProperty('--dx', dx + 'px'); if (p !== undefined) root.style.setProperty('--p', String(p)); };
    // the reply arrow is on the start side, the buttons on the end side: they open toward opposite ways
    const actsSign = () => (rtl() ? 1 : -1);
    const close = () => { open = false; root.classList.remove('open'); set(0, 0); };
    root.addEventListener('pointerdown', (e) => {
      if (e.button || (e.pointerType === 'mouse' && !o.mouse) || interactive(e.target)) return;
      if (open && !e.target.closest('.swipe-body')) return;   // a tap on a button of the opened row is its own
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; lock = ''; armed = false;
      width = (root.querySelectorAll('.swipe-acts > button').length || 1) * BTN;
    }, { passive: true });
    root.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!lock) {
        if (Math.abs(dx) < AXIS && Math.abs(dy) < AXIS) return;
        lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (lock === 'y') { id = null; return; }
        try { root.setPointerCapture(id); } catch (_) { /* gone */ }
        root.classList.add('dragging');
      }
      const toActs = dx * actsSign() > 0;
      const base = open ? actsSign() * width : 0;
      if (o.acts && (toActs || open)) {
        const d = Math.max(0, Math.min(root.clientWidth, (dx + base) * actsSign()));
        set(actsSign() * d);
      } else if (o.reply && !toActs) {
        const d = Math.min(CAP, Math.abs(dx));
        set(-actsSign() * d, Math.min(1, d / ARM));
        const now = d >= ARM;
        if (now !== armed) { armed = now; root.classList.toggle('armed', now); if (now) buzz(8); }
      } else set(0, 0);
    }, { passive: true });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      root.classList.remove('dragging');   // the CSS springs it back, or to where we set it
      if (lock !== 'x') return;
      const dx = e.clientX - x0 + (open ? actsSign() * width : 0);
      const d = dx * actsSign();
      if (e.type === 'pointercancel') { root.classList.remove('armed'); return close(); }
      if (o.reply && armed) { root.classList.remove('armed'); set(0, 0); o.reply(); return; }
      if (o.acts && d > 0) {
        if (d > root.clientWidth * 0.6) { close(); (o.full || (() => root.querySelector('.swipe-acts > button')?.click()))(); return; }
        if (d >= BTN / 2) { open = true; root.classList.add('open'); set(actsSign() * width); return; }
      }
      close();
    };
    root.addEventListener('pointerup', end, { passive: true });
    root.addEventListener('pointercancel', end, { passive: true });
    // a drag is never also a tap
    root.addEventListener('click', (e) => { if (lock === 'x') { e.stopPropagation(); e.preventDefault(); lock = ''; } }, true);
    document.addEventListener('pointerdown', (e) => { if (open && !root.contains(e.target)) close(); }, { passive: true });
    return close;
  }

  function longPress(el, items) {
    let timer = 0, x0 = 0, y0 = 0, fired = false;
    const cancel = () => { clearTimeout(timer); timer = 0; };
    el.addEventListener('pointerdown', (e) => {
      if (e.button || interactive(e.target)) return;
      fired = false; x0 = e.clientX; y0 = e.clientY;
      cancel();
      timer = setTimeout(() => { fired = true; show(x0, y0); }, HOLD);
    }, { passive: true });
    el.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > AXIS) cancel(); }, { passive: true });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, cancel, { passive: true });
    el.addEventListener('contextmenu', (e) => { if (fired || timer) e.preventDefault(); });   // (the phone's own menu would open over ours)
    el.addEventListener('click', (e) => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
    function show(x, y) {
      const list = (typeof items === 'function' ? items() : items) || [];
      if (!list.length) return;
      buzz(10);
      el.classList.add('lp-lift');
      const dim = document.createElement('div'); dim.className = 'lp-dim';
      const menu = document.createElement('div'); menu.className = 'lp-menu'; menu.setAttribute('role', 'menu');
      const done = () => { document.removeEventListener('keydown', onKey, true); dim.remove(); menu.remove(); el.classList.remove('lp-lift'); };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(); } };
      for (const it of list) {
        if (it === '-') { menu.append(document.createElement('hr')); continue; }
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = it.label;
        if (it.danger) b.className = 'danger';
        b.addEventListener('click', () => { done(); it.run?.(); });
        menu.append(b);
      }
      document.body.append(dim, menu);
      const w = menu.offsetWidth, h = menu.offsetHeight;
      const left = Math.max(16, Math.min(innerWidth - w - 16, x - w / 2)), top = Math.max(16, Math.min(innerHeight - h - 16, y + 12));
      menu.style.left = left + 'px'; menu.style.top = top + 'px';
      menu.style.setProperty('--ox', (x - left) + 'px'); menu.style.setProperty('--oy', (y - top) + 'px');
      dim.addEventListener('pointerdown', done, { passive: true });
      document.addEventListener('keydown', onKey, true);
      menu.querySelector('button')?.focus({ preventScroll: true });
    }
  }

  function vidSpeed(box, video) {
    const RATES = [2, 2.5, 3];
    let pill = box.querySelector('.vid-speed');
    if (!pill) { pill = document.createElement('span'); pill.className = 'vid-speed'; pill.setAttribute('aria-live', 'off'); box.append(pill); }
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    let timer = 0, on = false, x0 = 0, base = 1, id = null;
    const stop = () => {
      clearTimeout(timer); timer = 0;
      if (on) { on = false; video.playbackRate = base; pill.classList.remove('on'); }
      id = null;
    };
    video.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      const r = video.getBoundingClientRect();
      if (e.clientY > r.bottom - 56) return;   // the native controls are down there
      id = e.pointerId; x0 = e.clientX;
      timer = setTimeout(() => {
        if (video.paused) return;
        on = true; base = video.playbackRate || 1; video.playbackRate = RATES[0]; pill.textContent = RATES[0] + '×'; pill.classList.add('on'); buzz(10);
      }, SPEED_HOLD);
    }, { passive: true });
    video.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      if (!on) { if (Math.abs(e.clientX - x0) > AXIS) { clearTimeout(timer); timer = 0; } return; }
      const k = Math.max(0, Math.min(RATES.length - 1, Math.floor(Math.abs(e.clientX - x0) / STEP)));
      if (video.playbackRate !== RATES[k]) { video.playbackRate = RATES[k]; pill.textContent = RATES[k] + '×'; buzz(5); }
    }, { passive: true });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) video.addEventListener(t, stop, { passive: true });
    video.addEventListener('click', (e) => { if (video.dataset.held) { e.preventDefault(); e.stopPropagation(); } }, true);
    video.addEventListener('pointerup', () => { if (on) { video.dataset.held = '1'; setTimeout(() => delete video.dataset.held, 60); } }, true);
    video.addEventListener('contextmenu', (e) => { if (on || timer) e.preventDefault(); });
  }

  window.Gestures = { swipe, longPress, vidSpeed };
})();
