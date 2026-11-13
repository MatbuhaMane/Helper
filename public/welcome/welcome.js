/* The first minute (docs/vision/first-minute.md; the owner: the only guide at the start is this setup). Six steps, one
   question each – name, calendar, city, colours, the companion, who else is in the tent – with the chosen figure along.
   First, four slides that only tell (the owner's order, 2026-11-13): the red triangle in the top bar (a young app: this is
   how to report a problem or suggest an improvement, .wz-alert), who העוזר החכם is and how to call him (.wz-helper, the same
   figure the app uses), the family tree in a few words (.wz-tree), and האוהל itself: the portal that holds all the
   family's everyday tools in one place (img.wz-tent). Each is .wz-intro with its lines in .wz-lines; the look is
   design's. Then the questions.
   The look and the behaviour are design's (docs/design/prototype/welcome.html, /welcome/welcome.css).
   Every answer is saved as it is given, in the person's own settings (H.prefs, on the server), so leaving is safe:
     me.name, me.religion + me.calendar, me.city, look.palette, daemon.figure, me.familyPlan; at the end me.welcomed.
   Joining a family is not here: the people chosen in the last step are invited later (the invitations are the master's). */
(async () => {
  const { user } = await H.requireLogin();
  const $ = (id) => document.getElementById(id), stage = $('stage'), go = $('go');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const me = H.prefs('me', H.SETTINGS_DEFAULTS?.me || {}), look = H.prefs('look', H.SETTINGS_DEFAULTS?.look || {}), dp = H.prefs('daemon', H.DAEMON_DEFAULTS || {});
  const keep = (ns) => { H.savePrefs(ns); dispatchEvent(new CustomEvent('helper:prefs', { detail: ns })); };
  const ANIMALS = ['fennec', 'owl', 'hedgehog', 'lamb'];
  const first = (s) => String(s || '').trim().split(/\s+/)[0] || '';
  const CAL_OF = { jewish: 'he', muslim: 'hijri', none: 'greg' };
  const A = {
    name: me.name || first(user.he_name || user.name),
    cal: me.calendar || (me.religion ? CAL_OF[me.religion] || '' : ''),
    city: me.city || '', palette: look.palette || '', paletteSet: !!look.palette,
    figure: ANIMALS.includes(dp.figure) ? dp.figure : ANIMALS[Math.floor(Math.random() * ANIMALS.length)],
    family: Array.isArray(me.familyPlan) ? me.familyPlan : me.familyPlan ? [me.familyPlan] : [],   // (an older single value is read too)
  };
  // each answer, as it is given
  const save = {
    name: () => { me.name = A.name.trim().slice(0, 40); keep('me'); },
    cal: () => { me.calendar = A.cal; if (A.cal !== 'all') me.religion = { he: 'jewish', hijri: 'muslim', greg: 'none' }[A.cal]; keep('me'); },
    city: () => { me.city = A.city.trim().slice(0, 60); keep('me'); },
    palette: () => { look.palette = A.palette; keep('look'); },
    figure: () => { dp.figure = A.figure; keep('daemon'); },
    family: () => { me.familyPlan = A.family; keep('me'); },
  };
  let at = 0, friend = null, typing = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const buzz = () => { if (H.vibrate) H.vibrate(8); else navigator.vibrate?.(8); };
  const tiles = (key, list, multi) => `<div class="wz-tiles" role="${multi ? 'group' : 'radiogroup'}">${list.map(([v, b, s]) =>
    `<button class="wz-tile" type="button" role="${multi ? 'checkbox' : 'radio'}" aria-checked="${multi ? A[key].includes(v) : A[key] === v}" data-k="${key}" data-v="${v}"><b>${b}</b>${s ? `<small>${s}</small>` : ''}</button>`).join('')}</div>`;
  const PALETTES = [['', '#55622f', '#c2b04e', 'זית'], ['sea', '#1f5f7a', '#8fc7d4', 'ים'], ['desert', '#9a4a24', '#e0a85a', 'מדבר'], ['vineyard', '#6b2a4a', '#c9a0c0', 'כרם'], ['dusk', '#3d4a8a', '#e8b26a', 'דמדומים'], ['sage', '#3b6634', '#adc58c', 'מרווה'], ['mist', '#3a4d82', '#b7c2e2', 'ערפל']];
  const STEPS = [
    { id: 'report', q: () => 'שלום! האוהל עוד צעיר', hint: 'ואתם עוזרים לו לגדול', ok: () => true,
      body: () => '<div class="wz-intro"><span class="wz-alert" aria-hidden="true"></span><div class="wz-lines">'
        + '<p>המשולש האדום שליד כפתור ההגדרות, בסרגל העליון, שולח פנייה לצוות האוהל.</p>'
        + '<p>משהו לא עובד? יש רעיון לשיפור? מקישים עליו וכותבים. התשובה מגיעה לתיבה שלך.</p>'
        + (matchMedia('(pointer: coarse)').matches ? '<p>בטלפון אפשר גם פשוט לנער אותו.</p>' : '') + '</div></div>' },
    { id: 'helper', q: () => 'הכירו את העוזר החכם', hint: 'החבר שמסתובב איתך באוהל', ok: () => true,
      body: () => `<div class="wz-intro"><span class="wz-helper" data-f="${A.figure}" aria-hidden="true"></span><div class="wz-lines">`
        + '<p>הוא מפעיל בשבילך את הכלים: מוסיף לרשימת הקניות, מוצא מתכון, מסדר את המייל.</p>'
        + '<p>מקישים עליו, וכותבים או אומרים לו מה צריך.</p><p>עוד רגע תבחרו איך הוא ייראה.</p></div></div>' },
    { id: 'tree', q: () => 'עץ המשפחה', hint: 'כל המשפחה במקום אחד', ok: () => true,
      body: () => '<div class="wz-intro"><span class="wz-tree" aria-hidden="true"></span><div class="wz-lines">'
        + '<p>מוסיפים הורים, ילדים, סבים ונכדים, ורואים מי קשור למי.</p>'
        + '<p>עולים בענפים עד הסבים והסבתות, ומזמינים את המשפחה לאוהל.</p>'
        + '<p>הפרטים שמורים בכספת של המשפחה.</p></div></div>' },
    { id: 'tent', q: () => 'זה האוהל', hint: 'כל הכלים של המשפחה, במקום אחד', ok: () => true,
      body: () => '<div class="wz-intro"><img class="wz-tent" src="/assets/tent-700.webp" alt=""><div class="wz-lines">'
        + '<p>רשימת הקניות, המתכונים, החדשות, השירון, המייל ועוד: כל מה שהמשפחה צריכה ביום־יום נכנס דרכו.</p>'
        + '<p>בטלפון הוא אפליקציה, במחשב תוכנה, והכול שלך מכל מכשיר.</p></div></div>' },
    { id: 'name', q: () => 'ועכשיו אליך: איך קוראים לך?', hint: 'ככה אפנה אליך', body: () => `<input class="wz-name" id="name" autocomplete="given-name" maxlength="40" placeholder="השם שלך" aria-label="השם שלך" value="${esc(A.name)}">`, ok: () => A.name.trim() },
    { q: () => 'מה הלוח שלך?', hint: 'בשביל החגים, השבת והתאריכים', body: () => tiles('cal', [['he', 'עברי ולועזי', 'שבתות וחגים'], ['hijri', 'היג׳רי ולועזי', 'רמדאן והחגים'], ['greg', 'לועזי', 'בלי חגים מיוחדים'], ['all', 'הכול יחד', 'כל החגים']]), ok: () => A.cal },
    { id: 'city', q: () => 'איפה הבית?', hint: 'בשביל מזג האוויר וזמני היום', body: () => `<input class="wz-name" id="city" maxlength="60" placeholder="עיר" aria-label="העיר" value="${esc(A.city)}" style="font-size:1.5rem"><div class="wz-chips">${['ירושלים', 'תל אביב', 'חיפה', 'באר שבע', 'נצרת'].map((c) => `<button class="wz-chip" type="button" aria-pressed="${A.city === c}" data-city="${c}">${c}</button>`).join('')}</div>`, ok: () => A.city.trim() },
    { q: () => 'באיזה צבע האוהל שלך?', hint: 'אפשר להחליף בכל רגע בהגדרות', body: () => `<div class="wz-drops" role="radiogroup" aria-label="ערכת צבעים">${PALETTES.map(([v, d1, d2, n]) =>
      `<button class="wz-drop" type="button" role="radio" aria-checked="${A.paletteSet && A.palette === v}" aria-label="${n}" title="${n}" data-p="${v}" style="--d1:${d1};--d2:${d2}"></button>`).join('')}</div>`, ok: () => A.paletteSet },
    { q: () => 'מי ילווה אותך?', hint: 'החבר שלך באוהל. אפשר להחליף בכל רגע', body: () => `<div class="wz-figs" role="radiogroup" aria-label="הדמות">${ANIMALS.map((f) => `<button class="wz-tile" type="button" role="radio" aria-checked="${A.figure === f}" data-fig="${f}" aria-label="${Figure2D.FIGURES[f]?.name || f}"><span class="wz-mini" data-f="${f}"></span><b>${Figure2D.FIGURES[f]?.name || f}</b></button>`).join('')}</div>`, ok: () => A.figure },
    { q: () => 'מי עוד באוהל שלך?', hint: 'נזמין אותם אחר כך. אפשר גם לדלג', body: () => tiles('family', [['partner', 'בן/בת זוג'], ['kids', 'ילדים'], ['parents', 'הורים'], ['siblings', 'אחים ואחיות'], ['grand', 'סבים וסבתות'], ['friends', 'חברים'], ['none', 'אין קשרים', 'רק אני']], true), ok: () => true },
  ];
  $('trail').innerHTML = STEPS.map(() => '<i></i>').join('');
  const paintTrail = () => [...$('trail').children].forEach((d, i) => { d.className = i < at ? 'done' : i === at ? 'now' : ''; });
  const refresh = () => { go.disabled = !STEPS[at].ok(); };
  const glad = () => { buzz(); friend?.happy?.(); };
  function show() {
    const old = stage.querySelector('.wz-step');
    if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 260); }
    const s = STEPS[at], box = document.createElement('section');
    box.className = 'wz-step in'; box.innerHTML = `<h1 class="wz-q">${s.q()}</h1><p class="wz-hint">${s.hint}</p>${s.body()}`;
    setTimeout(() => { stage.append(box); wire(box); refresh(); box.querySelector('input')?.focus(); }, old ? 200 : 0);
    $('wz').dataset.step = s.id || '';   // (on 'helper' the big figure is in the slide: design may hide #friend there)
    paintTrail(); $('back').style.visibility = at ? 'visible' : 'hidden';
    go.textContent = at === STEPS.length - 1 ? 'לאוהל' : 'הלאה';
    if (friend) { friend.talk?.(true); setTimeout(() => friend?.talk?.(false), 900); }   // (the companion asks the question)
  }
  function wire(box) {
    const typed = (k) => (e) => { A[k] = e.target.value; refresh(); clearTimeout(typing); typing = setTimeout(save[k], 500); };
    box.querySelector('#name')?.addEventListener('input', typed('name'));
    box.querySelector('#city')?.addEventListener('input', (e) => { box.querySelectorAll('.wz-chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); typed('city')(e); });
    box.querySelectorAll('.wz-chip').forEach((c) => c.addEventListener('click', () => {
      A.city = c.dataset.city; box.querySelector('#city').value = A.city; box.querySelectorAll('.wz-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
      save.city(); glad(); refresh();
    }));
    box.querySelectorAll('.wz-tile[data-k]').forEach((t) => t.addEventListener('click', () => {
      const k = t.dataset.k, multi = t.getAttribute('role') === 'checkbox';
      if (multi) {
        t.setAttribute('aria-checked', String(t.getAttribute('aria-checked') !== 'true'));
        // 'none' stands alone: choosing it clears the others, and choosing another clears it
        if (t.getAttribute('aria-checked') === 'true') box.querySelectorAll(`[data-k="${k}"]`).forEach((x) => { if (x !== t && (t.dataset.v === 'none' || x.dataset.v === 'none')) x.setAttribute('aria-checked', 'false'); });
        A[k] = [...box.querySelectorAll('[data-k][aria-checked="true"]')].map((x) => x.dataset.v); }
      else { box.querySelectorAll(`[data-k="${k}"]`).forEach((x) => x.setAttribute('aria-checked', String(x === t))); A[k] = t.dataset.v; }
      save[k](); glad(); refresh();
    }));
    box.querySelectorAll('.wz-drop').forEach((d) => d.addEventListener('click', (e) => {
      box.querySelectorAll('.wz-drop').forEach((x) => x.setAttribute('aria-checked', String(x === d)));
      A.palette = d.dataset.p; A.paletteSet = true;
      if (A.palette) document.documentElement.dataset.palette = A.palette; else delete document.documentElement.dataset.palette;
      if (!still) { const r = document.createElement('i'); r.className = 'wz-ripple'; r.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;--d1:${d.style.getPropertyValue('--d1')}`; $('wz').append(r); setTimeout(() => r.remove(), 800); }
      save.palette(); glad(); refresh();
    }));
    box.querySelectorAll('.wz-mini').forEach((m) => Figure2D.mount(m, m.dataset.f, { size: 78, still: true }).catch(() => {}));
    box.querySelectorAll('.wz-helper').forEach((m) => Figure2D.mount(m, m.dataset.f, { size: 132, still: still }).catch(() => {}));
    box.querySelectorAll('[data-fig]').forEach((t) => t.addEventListener('click', async () => {
      box.querySelectorAll('[data-fig]').forEach((x) => x.setAttribute('aria-checked', String(x === t)));
      A.figure = t.dataset.fig; save.figure(); await meet(A.figure); glad(); refresh();
    }));
    box.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !go.disabled) go.click(); }));
  }
  async function meet(id) {
    friend?.destroy?.(); $('friend').textContent = '';
    try { friend = await Figure2D.mount($('friend'), id, { size: parseInt(getComputedStyle($('wz')).getPropertyValue('--wz-fig')) || 120 }); friend.happy?.(); } catch (_) { friend = null; }
  }
  let ended = false;
  go.addEventListener('click', () => {
    if (ended) return;   // (at the end the button only goes home)
    clearTimeout(typing);
    if (STEPS[at].id === 'name') save.name(); if (STEPS[at].id === 'city') save.city();   // (what was typed, before moving on)
    glad();
    if (at < STEPS.length - 1) { at++; show(); } else finish(false);
  });
  $('back').addEventListener('click', () => { if (at) { at--; show(); } });
  $('skip').addEventListener('click', () => finish(true));
  function finish(skipped) {
    if (ended) return;
    ended = true;
    clearTimeout(typing);
    me.welcomed = Date.now(); keep('me');   // (shown once; settings can run it again)
    // finished (not skipped): the first achievement, "נטית את האוהל"
    if (!skipped) fetch('/api/welcome/done', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    if (!dp.figure) { dp.figure = A.figure; keep('daemon'); }
    stage.querySelector('.wz-step')?.remove(); [...$('trail').children].forEach((d) => (d.className = 'done'));
    if (!skipped && !still) for (let i = 0; i < 26; i++) {
      const s = document.createElement('i'); s.className = 'wz-star'; const a = (i / 26) * 6.283, r = 120 + (i % 5) * 34;
      s.style.cssText = `--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;--c:${['#f2c14e', '#e0702a', 'var(--primary)', '#8fc7d4'][i % 4]};animation-delay:${(i % 6) * 30}ms`;
      document.body.append(s); setTimeout(() => s.remove(), 1400);
    }
    // the one sound: a success (only when the person allows sounds)
    if (!skipped && (H.soundsOn ? H.soundsOn() : true)) try {
      const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.type = 'triangle';
      o.frequency.setValueAtTime(660, c.currentTime); o.frequency.exponentialRampToValueAtTime(990, c.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
      o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.55);
    } catch (_) { /* no sound here */ }
    const box = document.createElement('section'); box.className = 'wz-step wz-done in';
    box.innerHTML = `<img src="/assets/tent-700.webp" alt=""><h1 class="wz-q">ברוכים הבאים לאוהל${A.name ? ', ' + esc(A.name) : ''}!</h1><p class="wz-hint">הכול מוכן. בואו נסתכל מסביב</p>`;
    stage.append(box);
    $('back').style.visibility = 'hidden';
    go.textContent = 'לאוהל'; go.disabled = false; go.onclick = () => { location.href = '/'; };
    if (skipped) location.href = '/';
    friend?.happy?.();
  }
  await meet(A.figure);
  show();
})();
