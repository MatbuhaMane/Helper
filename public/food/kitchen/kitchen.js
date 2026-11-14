/* עוזר מטבח (docs/vision/later.md, "עוזר מטבח"; H.FUTURE 'kitchen'): cooking beside the recipe book.
   Three tabs:
   - מבשלים: a recipe from the household's book (/api/recipes), one step at a time in big letters, the quantities
     scaled by the number of diners (Measure, as in the book), the screen kept on while cooking, and a timer button
     for every time a step names ("10 דקות").
   - טיימרים: several named timers at once. They live on this device (localStorage: a timer belongs to the stove it
     is next to), survive a reload, ring with a sound, a buzz and a notification when the page is open or in the back.
   - המרות: cups, spoons and grams by the ingredient (Measure.convert), and °F ↔ °C.
   Later (the spec): "הבא" by voice with the companion reading the step, AI tips while cooking, a timer that rings
   when the app is closed (push). The units, the usual diners and the screen kept on are the person's (H.prefs 'kitchen');
   the screen kept on and the timers' ringing are vision's suggestions (ש1), so each is a small piece that can be switched off.
   A recipe opens straight from the book with /food/kitchen/?recipe=<id> (the book's "לבשל" button). The look is design's: the
   page uses the shared classes only, and the few sizes held inline here wait for kitchen.css (docs/decisions.md). */
(async () => {
  const { el, api } = H;
  const K = window.Kitchen, M = window.Measure;
  await H.requireLogin();
  H.header('עוזר מטבח');
  const root = document.querySelector('main');
  // the person's: the units, the usual number of diners (0: as the recipe says), and the screen kept on while cooking
  const P = H.prefs('kitchen', { units: 'orig', diners: 0, awake: true });
  const TKEY = 'helper.kitchen.timers';

  /* ---------- timers (on this device) ---------- */
  let timers = (() => { try { const t = JSON.parse(localStorage.getItem(TKEY) || '[]'); return Array.isArray(t) ? t : []; } catch (_) { return []; } })();
  const saveTimers = () => { try { localStorage.setItem(TKEY, JSON.stringify(timers)); } catch (_) { /* private mode */ } };
  const ringing = new Set();   // ids that reached zero and were not yet silenced
  let audio = null, beepAt = 0;

  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.0001, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.45);
      o.start(); o.stop(audio.currentTime + 0.5);
    } catch (_) { /* no sound on this device */ }
  }
  async function notify(t) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const body = `הטיימר "${t.name}" הסתיים`;
    try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) return reg.showNotification('עוזר מטבח', { body, tag: 'kitchen-' + t.id, renotify: true }); } catch (_) { /* fall through */ }
    try { new Notification('עוזר מטבח', { body }); } catch (_) { /* not allowed here */ }
  }
  function ring(t) {
    ringing.add(t.id);
    navigator.vibrate?.([300, 150, 300, 150, 300]);
    notify(t);
    H.toast(`⏰ ${t.name}: הזמן נגמר`);
  }
  function addTimer(name, sec) {
    timers.push(K.start(name, sec));
    saveTimers();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch (_) { /* later */ }   // unlocked by this tap
    drawTimers();
    H.toast(`טיימר ${K.label(sec)} התחיל`);
  }
  const removeTimer = (id) => { timers = timers.filter((t) => t.id !== id); ringing.delete(id); saveTimers(); drawTimers(); };
  const changeTimer = (id, f) => { timers = timers.map((t) => (t.id === id ? f(t) : t)); ringing.delete(id); saveTimers(); drawTimers(); };

  // one tick a second: the clocks, and a timer that reaches zero rings (every 2 seconds until silenced, at most 2 minutes)
  setInterval(() => {
    const now = Date.now();
    for (const t of timers) {
      if (t.rest != null) continue;
      if (t.end <= now && !t.rang) { t.rang = true; saveTimers(); ring(t); }
      if (t.rang && ringing.has(t.id) && now - t.end > 120000) ringing.delete(t.id);
    }
    if (ringing.size && now - beepAt > 1800) { beepAt = now; beep(); }
    for (const c of document.querySelectorAll('[data-clock]')) {
      const t = timers.find((x) => x.id === c.dataset.clock);
      if (t) c.textContent = K.left(t, now) > 0 ? K.clock(K.left(t, now)) : 'נגמר';
    }
    for (const b of document.querySelectorAll('[data-hush]')) b.hidden = !ringing.has(b.dataset.hush);
  }, 1000);

  /** one timer's row: the name, the clock, pause or go on, a minute more, silence / remove */
  function timerRow(t) {
    const now = Date.now(), rest = K.left(t, now), paused = t.rest != null;
    return el('li', { class: 'card', style: 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 14px;margin:8px 0' },
      el('b', { style: 'flex:1 1 8em' }, t.name),
      el('span', { 'data-clock': t.id, role: 'timer', 'aria-label': `הזמן שנשאר בטיימר ${t.name}`, style: 'font-size:1.6rem;font-variant-numeric:tabular-nums;min-inline-size:4.5ch;text-align:center' },
        rest > 0 ? K.clock(rest) : 'נגמר'),
      el('span', { class: 'row', style: 'gap:6px;display:flex;flex-wrap:wrap' },
        el('button', { class: 'btn primary small', type: 'button', 'data-hush': t.id, hidden: !ringing.has(t.id), onclick: () => removeTimer(t.id) }, 'השתק'),
        rest > 0 ? el('button', { class: 'btn small', type: 'button', onclick: () => changeTimer(t.id, (x) => (paused ? K.resume(x) : K.pause(x))) }, paused ? 'המשך' : 'השהה') : null,
        el('button', { class: 'btn small', type: 'button', 'aria-label': `עוד דקה לטיימר ${t.name}`, onclick: () => changeTimer(t.id, (x) => ({ ...K.addTime(x, 60), rang: false })) }, '+1 דק׳'),
        el('button', { class: 'btn ghost small', type: 'button', 'aria-label': `הסרת הטיימר ${t.name}`, onclick: () => removeTimer(t.id) }, 'הסר')));
  }

  /** the running timers, shown on every tab (the stove does not wait for the tab) */
  const strip = el('section', { 'aria-label': 'טיימרים פעילים', 'aria-live': 'polite' });
  function drawTimers() {
    strip.textContent = '';
    if (timers.length) strip.append(el('ul', { style: 'list-style:none;padding:0;margin:0' }, timers.map(timerRow)));
    if (tab === 'timers') drawTab();
  }

  /* ---------- the tabs ---------- */
  const TABS = [['cook', 'מבשלים'], ['timers', 'טיימרים'], ['convert', 'המרות']];
  let tab = (location.hash.match(/^#(cook|timers|convert)/) || [])[1] || 'cook';
  const body = el('div');
  const tabBar = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'עוזר מטבח' }, TABS.map(([id, name]) =>
    el('button', { type: 'button', role: 'tab', id: 'tab-' + id, 'aria-controls': 'kpanel', 'aria-selected': String(id === tab),
      onclick: () => { tab = id; history.replaceState(null, '', '#' + id); drawTab(); } }, name)));
  root.append(tabBar, strip, el('div', { id: 'kpanel', role: 'tabpanel' }, body));

  function drawTab() {
    for (const b of tabBar.children) b.setAttribute('aria-selected', String(b.id === 'tab-' + tab));
    body.setAttribute('aria-labelledby', 'tab-' + tab);
    body.textContent = '';
    if (tab !== 'cook') wake(false);
    body.append(tab === 'timers' ? timersTab() : tab === 'convert' ? convertTab() : cookTab());
  }

  /* ---------- טיימרים ---------- */
  function timersTab() {
    const name = el('input', { type: 'text', maxlength: 40, dir: 'auto', placeholder: 'למשל: אורז', 'aria-label': 'שם הטיימר' });
    const mins = el('input', { type: 'number', min: 1, max: 1440, inputmode: 'numeric', placeholder: 'דקות', 'aria-label': 'כמה דקות' });
    const go = () => { const m = +mins.value; if (!(m > 0 && m <= 1440)) { mins.focus(); return H.toast('כמה דקות?'); } addTimer(name.value.trim(), Math.round(m * 60)); mins.value = ''; name.value = ''; };
    mins.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    return el('div', {},
      el('section', { class: 'card', style: 'padding:14px' },
        el('h2', { style: 'margin-top:0' }, 'טיימר חדש'),
        el('label', { class: 'field' }, el('span', {}, 'שם (לא חובה)'), name),
        el('div', { role: 'group', 'aria-label': 'זמנים מהירים', style: 'display:flex;flex-wrap:wrap;gap:6px;margin:8px 0' },
          [1, 3, 5, 10, 15, 20, 30, 45, 60].map((m) => el('button', { class: 'chip', type: 'button', onclick: () => { addTimer(name.value.trim(), m * 60); name.value = ''; } }, K.label(m * 60)))),
        el('div', { style: 'display:flex;gap:8px;align-items:end' }, el('label', { class: 'field', style: 'flex:1' }, el('span', {}, 'או זמן אחר'), mins),
          el('button', { class: 'btn primary', type: 'button', style: 'margin-block-end:10px', onclick: go }, 'התחל'))),
      timers.length ? null : el('p', { class: 'muted' }, 'אין טיימרים פעילים. הטיימרים נשמרים במכשיר הזה, ומצלצלים כשהדף פתוח או ברקע.'),
      'Notification' in window && Notification.permission === 'denied'
        ? el('p', { class: 'muted' }, 'ההתראות חסומות בדפדפן, אז הטיימר יצלצל רק כשהדף פתוח.') : null);
  }

  /* ---------- המרות ---------- */
  function convertTab() {
    const UNITS = [['כוס', 'כוסות'], ['כף', 'כפות'], ['כפית', 'כפיות'], ['גרם', 'גרם'], ['ק"ג', 'ק"ג'], ['מ"ל', 'מ"ל'], ['ליטר', 'ליטר']];
    const qty = el('input', { type: 'text', inputmode: 'decimal', value: '1', 'aria-label': 'כמות', dir: 'ltr', style: 'text-align:center' });
    const unit = el('select', { 'aria-label': 'יחידה' }, UNITS.map(([one]) => el('option', { value: one }, one)));
    const what = el('input', { type: 'text', dir: 'auto', maxlength: 40, placeholder: 'קמח, סוכר, חמאה, שמן…', 'aria-label': 'מה מודדים' });
    const out = el('output', { 'aria-live': 'polite', style: 'display:block;font-size:1.25rem;margin-top:8px' });
    const sum = () => {
      const q = qty.value.trim().replace(',', '.');
      out.textContent = '';
      if (!q) return;
      const m = `${q} ${unit.value}`;
      const res = ['grams', 'cups'].map((to) => M.convert(m, what.value.trim(), to)).filter(Boolean);
      if (res.length) out.append(...res.map((r, i) => el('div', {}, (i ? 'או ' : '= ') + r)));
      else out.append(el('span', { class: 'muted' }, ['גרם', 'ק"ג'].includes(unit.value) && !what.value.trim()
        ? 'כדי להמיר משקל לכוסות, כתבו מה מודדים.' : what.value.trim() ? 'אין לי משקל לכוס של זה. נסו שם אחר (למשל "קמח").' : 'כתבו מה מודדים, למשל קמח.'));
    };
    for (const x of [qty, what]) x.addEventListener('input', sum);
    unit.addEventListener('change', sum);

    const deg = el('input', { type: 'number', inputmode: 'numeric', value: '180', 'aria-label': 'מעלות', dir: 'ltr', style: 'text-align:center' });
    const from = el('select', { 'aria-label': 'מאיזו סקאלה' }, el('option', { value: 'c' }, '°C צלזיוס'), el('option', { value: 'f' }, '°F פרנהייט'));
    const dOut = el('output', { 'aria-live': 'polite', style: 'display:block;font-size:1.25rem;margin-top:8px' });
    const dSum = () => { const n = +deg.value; if (!deg.value || !isFinite(n)) { dOut.textContent = ''; return; } const t = M.temp(n, from.value); dOut.textContent = from.value === 'c' ? `= ${t.f}°F` : `= ${t.c}°C`; };
    deg.addEventListener('input', dSum); from.addEventListener('change', dSum);
    setTimeout(() => { sum(); dSum(); });

    const grid = 'display:grid;grid-template-columns:5em 1fr;gap:8px;align-items:center';
    return el('div', {},
      el('section', { class: 'card', style: 'padding:14px' },
        el('h2', { style: 'margin-top:0' }, 'כוסות, כפות וגרמים'),
        el('div', { style: grid }, qty, unit), el('label', { class: 'field' }, el('span', {}, 'מה מודדים'), what), out),
      el('section', { class: 'card', style: 'padding:14px' },
        el('h2', { style: 'margin-top:0' }, 'חום התנור'),
        el('div', { style: grid }, deg, from), dOut),
      el('section', { class: 'card', style: 'padding:14px' },
        el('h2', { style: 'margin-top:0' }, 'לזכור'),
        el('ul', { style: 'margin:0;padding-inline-start:1.2em;line-height:1.8' },
          el('li', {}, 'כוס = 240 מ"ל = 16 כפות'), el('li', {}, 'כף = 3 כפיות = 15 מ"ל'), el('li', {}, 'כפית = 5 מ"ל'),
          el('li', {}, 'כוס קמח ≈ 140 גרם · כוס סוכר ≈ 200 גרם'), el('li', {}, 'חבילת חמאה = 200 גרם'))));
  }

  /* ---------- מבשלים ---------- */
  let recipes = null, lock = null;
  async function wake(on) {
    try {
      if (on && !P.awake) on = false;
      if (on && !lock && 'wakeLock' in navigator) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      if (!on && lock) { await lock.release(); lock = null; }
    } catch (_) { /* not allowed (battery saver); the page still works */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && cooking) wake(true); });

  let cooking = null;   // { recipe, step, n }   n = diners
  const cookFromHash = () => { const m = location.hash.match(/^#cook=([^&]+)(?:&s=(\d+))?/); return m ? { id: decodeURIComponent(m[1]), step: +(m[2] || 0) } : null; };

  function cookTab() {
    const box = el('div', {}, el('p', { class: 'muted' }, 'טוען את ספר המתכונים…'));
    (async () => {
      if (!recipes) {
        try { recipes = (await api('/api/recipes')).recipes || []; } catch (e) { box.textContent = ''; box.append(el('p', { class: 'notice' }, e.message || 'לא הצלחתי לטעון את המתכונים.')); return; }
      }
      const want = cookFromHash();
      const r = want && recipes.find((x) => x.id === want.id);
      box.textContent = '';
      box.append(r ? cookView(r, want.step) : pickView());
    })();
    return box;
  }

  function pickView() {
    cooking = null; wake(false);
    if (!recipes.length) return el('div', { class: 'card', style: 'padding:14px' },
      el('p', {}, 'עוד אין מתכונים בספר של הבית.'), el('a', { class: 'btn primary', href: '/groceries/#book' }, 'לספר המתכונים'));
    const q = el('input', { type: 'search', dir: 'auto', placeholder: 'חיפוש מתכון', 'aria-label': 'חיפוש מתכון' });
    const list = el('ul', { style: 'list-style:none;padding:0;margin:0' });
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      list.textContent = '';
      const found = recipes.filter((r) => !s || r.title.toLowerCase().includes(s) || (r.tags || []).some((t) => String(t).toLowerCase().includes(s)));
      list.append(...found.slice(0, 60).map((r) => el('li', {},
        el('button', { type: 'button', class: 'card', style: 'display:flex;gap:12px;align-items:center;inline-size:100%;padding:10px;text-align:start;font:inherit;color:inherit;cursor:pointer;margin:6px 0',
          onclick: () => { location.hash = 'cook=' + encodeURIComponent(r.id); } },
          r.image ? el('img', { src: r.image, alt: '', loading: 'lazy', style: 'inline-size:56px;block-size:56px;object-fit:cover;border-radius:10px;flex:none' }) : null,
          el('span', {}, el('b', {}, r.title), el('br'), el('small', { class: 'muted' }, `${(r.steps || []).length} צעדים · ${(r.ingredients || []).length} מצרכים`))))));
      if (!found.length) list.append(el('li', { class: 'muted' }, 'לא נמצא מתכון כזה.'));
    };
    q.addEventListener('input', draw);
    draw();
    return el('div', {}, el('p', { class: 'muted' }, 'בוחרים מתכון מהספר של הבית, ומבשלים צעד אחרי צעד. המסך נשאר דלוק.'),
      el('label', { class: 'field' }, el('span', {}, 'איזה מתכון?'), q), list);
  }

  function cookView(r, step0) {
    const steps = (r.steps || []).map(String).filter((s) => s.trim());
    const base = M.servings(r.meta);
    cooking = cooking?.recipe?.id === r.id ? cooking : { recipe: r, step: 0, n: (base && P.diners) || base || 1 };
    cooking.step = Math.min(Math.max(0, step0 || 0), Math.max(0, steps.length - 1));
    wake(true);
    const factor = () => (base ? cooking.n / base : cooking.n);
    const view = el('div');

    function ingredientsCard() {
      const count = el('b', { 'aria-live': 'polite', style: 'min-inline-size:3ch;text-align:center' });
      const list = el('ul', { class: 'ingredients' });
      const fill = () => {
        count.textContent = base ? String(cooking.n) : '×' + M.fmtQty(cooking.n);
        list.textContent = '';
        list.append(...(r.ingredients || []).map((i) => el('li', {}, el('label', {}, el('input', { type: 'checkbox' }),
          el('span', {}, i.name), el('span', { class: 'muted' }, M.show(i.measure, i.name, factor(), P.units || 'orig'))))));
      };
      const by = (d) => () => { const step = base ? 1 : 0.5; cooking.n = Math.max(step, Math.min(base ? 100 : 8, cooking.n + d * step)); if (base) { P.diners = cooking.n; H.savePrefs('kitchen'); } fill(); };
      const units = el('select', { 'aria-label': 'יחידות מידה' }, [['orig', 'כמו במתכון'], ['grams', 'בגרמים'], ['cups', 'בכוסות וכפות']].map(([v, t]) => el('option', { value: v, selected: (P.units || 'orig') === v }, t)));
      units.addEventListener('change', () => { P.units = units.value; H.savePrefs('kitchen'); fill(); });
      fill();
      return el('details', { class: 'card', style: 'padding:10px 14px', open: innerWidth >= 900 },
        el('summary', { style: 'cursor:pointer;font-weight:500' }, `מצרכים (${(r.ingredients || []).length})`),
        el('div', { style: 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0' },
          el('span', { class: 'muted' }, base ? 'סועדים' : 'כמות'),
          el('button', { class: 'btn small', type: 'button', 'aria-label': base ? 'פחות סועדים' : 'פחות', onclick: by(-1) }, '−'), count,
          el('button', { class: 'btn small', type: 'button', 'aria-label': base ? 'יותר סועדים' : 'יותר', onclick: by(1) }, '+'),
          units),
        list);
    }

    const stepBox = el('section', { class: 'card', 'aria-live': 'polite', style: 'padding:18px' });
    function drawStep() {
      const i = cooking.step, s = steps[i] || '';
      history.replaceState(null, '', '#cook=' + encodeURIComponent(r.id) + '&s=' + i);
      stepBox.textContent = '';
      if (!steps.length) { stepBox.append(el('p', {}, 'במתכון הזה אין צעדים כתובים.')); return; }
      const t = K.times(s);
      stepBox.append(
        el('p', { class: 'muted', style: 'margin:0 0 8px' }, `צעד ${i + 1} מתוך ${steps.length}`),
        el('p', { dir: 'auto', style: 'font-size:clamp(1.25rem, 4.5vw, 1.7rem);line-height:1.5;margin:0 0 14px' }, s),
        t.length ? el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-block-end:14px' }, t.map((x) => el('button', { class: 'chip', type: 'button',
          onclick: () => addTimer(`${r.title.slice(0, 24)}, צעד ${i + 1}`, x.sec) }, `⏱ טיימר ${x.label}`))) : null,
        el('div', { style: 'display:flex;gap:10px' },
          el('button', { class: 'btn', type: 'button', disabled: i === 0, onclick: () => go(-1) }, 'הקודם'),
          i < steps.length - 1
            ? el('button', { class: 'btn primary', type: 'button', style: 'flex:1', onclick: () => go(1) }, 'הצעד הבא')
            : el('button', { class: 'btn primary', type: 'button', style: 'flex:1', onclick: () => { H.toast('בתיאבון!'); location.hash = 'cook'; } }, 'סיימנו')));
    }
    const go = (d) => { cooking.step = Math.min(Math.max(0, cooking.step + d), steps.length - 1); drawStep(); stepBox.scrollIntoView({ block: 'nearest' }); };
    const keys = (e) => {
      if (!view.isConnected) return document.removeEventListener('keydown', keys);
      if (e.target.closest('input, select, textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft' || e.key === ' ') { e.preventDefault(); go(1); }   // RTL: left is forward
      if (e.key === 'ArrowRight') { e.preventDefault(); go(-1); }
    };
    document.addEventListener('keydown', keys);
    // a swipe across the step: to the left is the next step (RTL reading goes leftwards)
    let x0 = null;
    stepBox.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') x0 = e.clientX; });
    stepBox.addEventListener('pointerup', (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); });

    function awakeToggle() {
      const box = el('input', { type: 'checkbox', checked: P.awake !== false });
      box.addEventListener('change', () => { P.awake = box.checked; H.savePrefs('kitchen'); wake(box.checked); });
      return el('label', { class: 'toggle', style: 'margin:6px 0' }, box, 'המסך נשאר דלוק כל עוד המתכון פתוח');
    }

    drawStep();
    view.append(
      el('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:12px 0' },
        el('button', { class: 'btn ghost small', type: 'button', onclick: () => { location.hash = 'cook'; } }, 'מתכון אחר'),
        el('h2', { style: 'margin:0;flex:1' }, r.title)),
      ingredientsCard(), stepBox,
      'wakeLock' in navigator ? awakeToggle() : null);
    return view;
  }

  addEventListener('hashchange', () => {
    const m = location.hash.match(/^#(cook|timers|convert)/);
    if (m) { tab = m[1]; drawTab(); }
  });

  // from the book: /food/kitchen/?recipe=<id> becomes #cook=<id>
  const fromBook = new URLSearchParams(location.search).get('recipe');
  if (fromBook) { history.replaceState(null, '', location.pathname + '#cook=' + encodeURIComponent(fromBook)); tab = 'cook'; }

  drawTimers();
  drawTab();
})();
