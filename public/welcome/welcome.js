/* The first minute (docs/vision/first-minute.md; the owner: the only guide at the start is this setup). Six steps, one
   question each – name, calendar, city, colours, the companion, who else is in the tent – with the chosen figure along.
   First, four slides that only tell (the owner's order, 2026-11-13): האוהל first, then the helper, the tree, and the red triangle in the top bar (the owner swapped the first and last, 2026-11-13) (a young app: this is
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
  // the owner's family has רַאבַּ"ע (/api/daemon ibnEzra), and for them an empty choice means him (daemon.js, settings.js):
  // he is their default here and the first tile, and an empty choice is never replaced by a random animal
  const family = await H.api('/api/daemon', { noRedirect: true }).then((d) => !!d?.ibnEzra).catch(() => false);
  const FIGS = family ? ['ibn_ezra', ...ANIMALS] : ANIMALS;
  const figName = (f) => (f === 'ibn_ezra' ? 'רַאבַּ"ע' : Figure2D.FIGURES[f]?.name || f);
  // (רַאבַּ"ע is the 3D figure of daemon.js, not a Figure2D one: here he is his picture, as in the settings)
  const mountFig = (box, f, o) => {
    if (f !== 'ibn_ezra') return Figure2D.mount(box, f, o);
    box.replaceChildren(H.el('img', { src: '/assets/ibn-ezra-face.webp', alt: '', width: o.size, height: o.size, style: 'inline-size:100%;block-size:auto;border-radius:50%' }));
    return Promise.resolve({ happy() {}, destroy() {} });
  };
  const first = (s) => String(s || '').trim().split(/\s+/)[0] || '';
  const CAL_OF = { jewish: 'he', muslim: 'hijri', none: 'greg' };
  const A = {
    name: me.name || first(user.he_name || user.name),
    cal: me.calendar || (me.religion ? CAL_OF[me.religion] || '' : ''),
    city: me.city || '', place: me.place && me.place.name === me.city ? me.place : null, palette: look.palette || '', paletteSet: !!look.palette,
    figure: FIGS.includes(dp.figure) ? dp.figure : family ? 'ibn_ezra' : ANIMALS[Math.floor(Math.random() * ANIMALS.length)],
    family: Array.isArray(me.familyPlan) ? me.familyPlan : me.familyPlan ? [me.familyPlan] : [],   // (an older single value is read too)
  };
  // each answer, as it is given
  const save = {
    name: () => { me.name = A.name.trim().slice(0, 40); keep('me'); },
    cal: () => { me.calendar = A.cal; if (A.cal !== 'all') me.religion = { he: 'jewish', hijri: 'muslim', greg: 'none' }[A.cal]; keep('me'); },
    city: () => {
      me.city = A.city.trim().slice(0, 60);
      if (A.place && A.place.name === me.city) me.place = A.place; else delete me.place;   // (the point only with the name it belongs to)
      keep('me');
    },
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
    { id: 'tent', q: () => 'שלום!<br>זה האוהל', hint: 'כל הכלים של המשפחה, במקום אחד', ok: () => true,
      body: () => '<div class="wz-intro"><img class="wz-tent" src="/assets/tent-700.webp" alt=""><div class="wz-lines">'
        + '<p>רשימת הקניות, המתכונים, החדשות, השירון, המייל ועוד: כל מה שהמשפחה צריכה ביום־יום נכנס דרכו.</p>'
        + '<p>בטלפון הוא אפליקציה, במחשב תוכנה, והכל אתך מכל מכשיר.</p></div></div>' },
    { id: 'helper', q: () => 'הכירו את העוזר החכם', hint: 'החבר שמסתובב איתך באוהל', ok: () => true,
      body: () => `<div class="wz-intro"><span class="wz-helper" data-f="${A.figure}" aria-hidden="true"></span><div class="wz-lines">`
        + '<p>הוא מפעיל בשבילך את הכלים: מוסיף לרשימת הקניות, מוצא מתכון, מסדר את המייל.</p>'
        + '<p>מקישים עליו, וכותבים או אומרים לו מה צריך.</p><p>עוד רגע תבחרו איך הוא ייראה.</p></div></div>' },
    { id: 'tree', q: () => 'עץ המשפחה', hint: 'כל המשפחה במקום אחד', ok: () => true,
      body: () => '<div class="wz-intro"><span class="wz-tree" aria-hidden="true"></span><div class="wz-lines">'
        + '<p>מוסיפים הורים, ילדים, סבים ונכדים, ורואים מי קשור למי.</p>'
        + '<p>עולים בענפים עד הסבים והסבתות, ומזמינים את המשפחה לאוהל.</p>'
        + '<p>הפרטים שמורים בכספת של המשפחה.</p>'
        + '<p>ניתן גם לקשר את אמצעי הגיבוי שלכם.</p></div></div>' },
    { id: 'report', q: () => 'האוהל עוד צעיר', hint: 'ואתם עוזרים לו לגדול', ok: () => true,
      body: () => '<div class="wz-intro"><span class="wz-alert" aria-hidden="true"></span><div class="wz-lines">'
        + '<p>המשולש האדום שליד כפתור ההגדרות, בסרגל העליון, שולח פנייה לצוות האוהל.</p>'
        + '<p>משהו לא עובד? יש רעיון לשיפור? מקישים עליו וכותבים. התשובה מגיעה לתיבה שלך.</p>'
        + (matchMedia('(pointer: coarse)').matches ? '<p>בטלפון אפשר גם פשוט לנער אותו.</p>' : '') + '</div></div>' },
    { id: 'name', q: () => 'ועכשיו אליך: איך קוראים לך?', hint: 'ככה אפנה אליך', body: () => `<input class="wz-name" id="name" autocomplete="given-name" maxlength="40" placeholder="השם שלך" aria-label="השם שלך" value="${esc(A.name)}">`, ok: () => A.name.trim() },
    { q: () => 'איך סופרים אצלך?', hint: 'בשביל החגים, השבת והתאריכים', body: () => tiles('cal', [['he', 'עברי ולועזי', 'שבתות וחגים'], ['hijri', 'היג׳רי ולועזי', 'רמדאן והחגים'], ['greg', 'לועזי', 'בלי חגים מיוחדים'], ['all', 'הכול יחד', 'כל החגים']]), ok: () => A.cal },
    { id: 'city', q: () => 'איפה הבית?', hint: 'בשביל מזג האוויר וזמני היום', body: () => `<div class="wz-place"><input class="wz-name" id="city" maxlength="60" placeholder="עיר או יישוב" aria-label="העיר או היישוב" value="${esc(A.city)}" style="font-size:1.5rem" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="city-sugg"><ul class="wz-sugg" id="city-sugg" role="listbox" aria-label="מקומות שנמצאו" hidden></ul></div><p class="wz-home" id="city-home" aria-live="polite"></p><div class="wz-chips">${['ירושלים', 'תל אביב', 'חיפה', 'באר שבע', 'נצרת'].map((c) => `<button class="wz-chip" type="button" aria-pressed="${A.city === c}" data-city="${c}">${c}</button>`).join('')}</div>`, ok: () => A.city.trim() },
    { q: () => 'באיזה צבע האוהל שלך?', hint: 'אפשר להחליף בכל רגע בהגדרות', body: () => `<div class="wz-drops" role="radiogroup" aria-label="ערכת צבעים">${PALETTES.map(([v, d1, d2, n]) =>
      `<button class="wz-drop" type="button" role="radio" aria-checked="${A.paletteSet && A.palette === v}" aria-label="${n}" title="${n}" data-p="${v}" style="--d1:${d1};--d2:${d2}"></button>`).join('')}</div>`, ok: () => A.paletteSet },
    { q: () => 'מי ילווה אותך?', hint: 'החבר שלך באוהל. אפשר להחליף בכל רגע', body: () => `<div class="wz-figs" role="radiogroup" aria-label="הדמות">${FIGS.map((f) => `<button class="wz-tile" type="button" role="radio" aria-checked="${A.figure === f}" data-fig="${f}" aria-label="${esc(figName(f))}"><span class="wz-mini" data-f="${f}"></span><b>${esc(figName(f))}</b></button>`).join('')}</div>`, ok: () => A.figure },
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
    box.querySelector('#city')?.addEventListener('input', (e) => { box.querySelectorAll('.wz-chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); A.place = null; typed('city')(e); });
    if (box.querySelector('#city')) placeSearch(box);
    box.querySelectorAll('.wz-chip').forEach((c) => c.addEventListener('click', () => {
      A.city = c.dataset.city; A.place = null; box.querySelector('#city').value = A.city; placeSearch.home?.(); box.querySelectorAll('.wz-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
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
    box.querySelectorAll('.wz-mini').forEach((m) => mountFig(m, m.dataset.f, { size: 78, still: true }).catch(() => {}));
    box.querySelectorAll('.wz-helper').forEach((m) => mountFig(m, m.dataset.f, { size: 132, still: still }).catch(() => {}));
    box.querySelectorAll('[data-fig]').forEach((t) => t.addEventListener('click', async () => {
      box.querySelectorAll('[data-fig]').forEach((x) => x.setAttribute('aria-checked', String(x === t)));
      A.figure = t.dataset.fig; save.figure(); await meet(A.figure); glad(); refresh();
    }));
    box.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !go.disabled) go.click(); }));
  }
  /* "איפה הבית?": a real place in Israel from Google (server/places.ts, the key stays there). While typing, up to five
     towns or neighbourhoods show under the box (a combobox: arrows, Enter, Escape); picking one marks it as home:
     me.city gets its name and me.place {id, name, lat, lng, at} its point, which the weather uses (up to 30 days, Google's
     terms). Anything typed and not picked stays free text, as before; with no key, a quota or no network, the box is
     simply free text. The look is design's (.wz-place, .wz-sugg, .wz-home); until it is drawn, a few plain rules. */
  let placesOn = true;
  function placeSearch(box) {
    const q = box.querySelector('#city'), list = box.querySelector('#city-sugg'), home = box.querySelector('#city-home');
    const newToken = () => crypto.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 36);
    let token = newToken(), hits = [], active = -1, timer = 0, seq = 0, plain = false;
    const showHome = () => home.replaceChildren(...(A.place && A.place.name === A.city.trim() ? [H.el('b', {}, A.place.name), ' סומן כבית'] : []));
    placeSearch.home = showHome;
    const close = () => { list.hidden = true; active = -1; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); };
    const mark = (i) => {
      active = i;
      [...list.children].forEach((li, j) => { li.setAttribute('aria-selected', String(j === i)); if (plain) li.style.background = j === i ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : ''; });
      if (i < 0) q.removeAttribute('aria-activedescendant'); else q.setAttribute('aria-activedescendant', `city-sugg-${i}`);
    };
    async function pick(p) {
      close(); clearTimeout(timer); clearTimeout(typing);
      A.city = p.name; q.value = p.name; A.place = null;
      try {
        const r = await H.api('/api/places/home/pick', { body: { id: p.id, session: token }, noRedirect: true });
        A.place = { id: r.id, name: p.name, lat: r.lat, lng: r.lng, at: Date.now() };
      } catch (_) { /* the name is kept as free text */ }
      token = newToken();
      save.city(); showHome(); glad(); refresh();
    }
    async function suggest() {
      const text = q.value.trim();
      if (!placesOn || text.length < 2 || A.place) { close(); return; }
      const my = ++seq;
      let r;
      try { r = await H.api('/api/places/home/suggest', { body: { q: text, session: token }, noRedirect: true }); }
      catch (e) { if (e.status === 429 || e.status === 503) placesOn = false; close(); return; }
      if (my !== seq || q.value.trim() !== text) return;
      if (!r.configured) { placesOn = false; close(); return; }
      hits = r.places || [];
      if (!hits.length) { close(); return; }
      list.replaceChildren(...hits.map((p, i) => H.el('li', { id: `city-sugg-${i}`, role: 'option', 'aria-selected': 'false',
        onpointerdown: (e) => e.preventDefault(), onclick: () => pick(p),
        style: plain ? 'display:flex;gap:8px;align-items:baseline;padding:10px 12px;border-radius:8px;cursor:pointer' : null },
        H.el('b', {}, p.name), p.sub ? H.el('small', { class: 'muted' }, p.sub) : null)));
      list.hidden = false; q.setAttribute('aria-expanded', 'true'); mark(-1);
    }
    q.addEventListener('input', () => { showHome(); clearTimeout(timer); timer = setTimeout(suggest, 300); });
    q.addEventListener('keydown', (e) => {
      const open = !list.hidden && hits.length;
      if (e.key === 'ArrowDown' && open) { e.preventDefault(); mark(Math.min(active + 1, hits.length - 1)); }
      else if (e.key === 'ArrowUp' && open) { e.preventDefault(); mark(Math.max(active - 1, -1)); }
      else if (e.key === 'Enter' && open && active >= 0) { e.preventDefault(); e.stopImmediatePropagation(); pick(hits[active]); }
      else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    q.addEventListener('blur', () => setTimeout(close, 150));
    // until welcome.css draws the list, it floats under the box with a few plain rules
    queueMicrotask(() => {
      const wrap = box.querySelector('.wz-place');
      if (getComputedStyle(list).position === 'absolute') return;
      plain = true;
      Object.assign(wrap.style, { position: 'relative', inlineSize: 'min(100%, 380px)', marginInline: 'auto' });
      Object.assign(list.style, { position: 'absolute', insetInline: '0', insetBlockStart: 'calc(100% + 4px)', zIndex: '5', margin: '0', padding: '4px', listStyle: 'none',
        background: 'var(--card)', border: '1px solid var(--line-strong, var(--line))', borderRadius: 'var(--radius-sm, 10px)', boxShadow: 'var(--shadow)', textAlign: 'start' });
      list.addEventListener('pointerover', (e) => { const li = e.target.closest('li'); if (li) mark([...list.children].indexOf(li)); });
    });
    showHome();
  }
  async function meet(id) {
    friend?.destroy?.(); $('friend').textContent = '';
    try { friend = await mountFig($('friend'), id, { size: parseInt(getComputedStyle($('wz')).getPropertyValue('--wz-fig')) || 120 }); friend.happy?.(); } catch (_) { friend = null; }
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
    // "האוהל התעדכן" (/assets/whatsnew.js): whatever is new now is not news to someone who just came in
    const seenNow = fetch('/whats-new.json', { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const v = typeof j?.v === 'string' ? j.v.trim().slice(0, 100) : '';
      if (v) { H.prefs('whatsnew', { seen: '' }).seen = v; H.savePrefs('whatsnew'); }
    }).catch(() => {});
    // finished (not skipped): the first achievement, "נטית את האוהל"
    if (!skipped) fetch('/api/welcome/done', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    if (!dp.figure && !(family && A.figure === 'ibn_ezra')) { dp.figure = A.figure; keep('daemon'); }   // (empty is רַאבַּ"ע for the owner's family)
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
    // only for someone on a limited allowance (came from an invitation): the gift, and that a free helper can come later
    if (!skipped) fetch('/api/me/ai', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((ai) => {
      if (!ai?.limited || ai.out || !box.isConnected) return;
      const p = document.createElement('p'); p.className = 'wz-hint wz-gift';
      p.textContent = 'יש לך מתנת פתיחה, ואפשר לחבר עוזר חינמי בהמשך';
      box.append(p);
    }).catch(() => {});
    $('back').style.visibility = 'hidden';
    go.textContent = 'לאוהל'; go.disabled = false; go.onclick = () => { location.href = '/'; };
    if (skipped) Promise.race([seenNow, new Promise((ok) => setTimeout(ok, 1500))]).finally(() => { location.href = '/'; });
    friend?.happy?.();
  }
  await meet(A.figure);
  show();
})();
