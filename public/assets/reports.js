/* Reports, תיבת פניות (server/reports.ts): from any page a member tells צוות האוהל that something is wrong – by shaking
   the phone, or from the menu ("דווח על בעיה"); the answer comes back to the person's own small inbox (התיבה שלי), with
   a dot on the user chip. Only the reporter ever sees it. The look is design's /assets/reports.css (loaded from here).
   Loaded by the shell once someone is signed in (common.js), and by the settings and the back door themselves.
     H.report({kind})      the report sheet          H.myInbox()        the person's inbox (and a thread in it)
     H.reportEntries()     the two menu buttons      H.reportThread()   a thread's messages (the back door uses it too)
     H.shakeOn(), H.setShake(on)   the "נענוע לדיווח" switch (a per-user pref; iOS asks for motion on a tap)
   The ways in: shaking the phone, the warning triangle next to the settings button in the top bar, the menu's entry. */
(() => {
  if (!window.H || window.H.report) return;
  const H = window.H, { el, api, toast } = H;
  const css = el('link', { rel: 'stylesheet', href: '/assets/reports.css' });
  document.head.append(css);

  const TEXT_MAX = 1000, SHOT_MAX = 900000;
  const prefs = H.prefs('reports', { shake: 'auto', coached: 0 });
  const needsAsk = typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';   // iOS
  const touch = matchMedia('(pointer: coarse)').matches;
  const canShake = typeof DeviceMotionEvent !== 'undefined' && touch;

  /* ---------------- times ---------------- */
  const dayKey = (t) => new Date(t).toDateString();
  const dayName = (t) => {
    const d = new Date(t), now = new Date(), y = new Date(now - 864e5);
    if (d.toDateString() === now.toDateString()) return 'היום';
    if (d.toDateString() === y.toDateString()) return 'אתמול';
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  };
  const clock = (t) => new Date(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const when = (t) => (dayKey(t) === dayKey(Date.now()) ? clock(t) : dayName(t));
  const iso = (t) => new Date(t).toISOString();
  const pageName = () => (document.querySelector('main h1')?.textContent || document.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const theme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const DEVICE = { phone: 'טלפון', tablet: 'טאבלט', pc: 'מחשב' };

  /* ---------------- the screenshot, only when the person ticks it ---------------- */
  /** a picture into a JPEG data URL of a sane size (the longer side at most 1400 px) */
  function toJpeg(src) {
    const w0 = src.videoWidth || src.naturalWidth || src.width, h0 = src.videoHeight || src.naturalHeight || src.height;
    const k = Math.min(1, 1400 / Math.max(w0, h0));
    const c = el('canvas', { width: Math.round(w0 * k), height: Math.round(h0 * k) });
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    for (const q of [0.72, 0.55, 0.4]) { const d = c.toDataURL('image/jpeg', q); if (d.length <= SHOT_MAX) return d; }
    return null;
  }
  /** on a computer: a picture of this tab (the browser asks which; the sheet steps aside for the moment of the picture) */
  async function grabTab() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' });
    const m = document.getElementById('modal');
    try {
      if (m) m.style.visibility = 'hidden';
      const v = el('video', { muted: true, playsinline: true });
      v.srcObject = stream; await v.play();
      await new Promise((ok) => setTimeout(ok, 350));               // the sheet is gone from the picture
      return toJpeg(v);
    } finally { stream.getTracks().forEach((t) => t.stop()); if (m) m.style.visibility = ''; }
  }
  /** on a phone: a picture the person took (a screenshot from the gallery) */
  function pickImage() {
    return new Promise((ok) => {
      const inp = el('input', { type: 'file', accept: 'image/*', hidden: true });
      inp.addEventListener('change', () => {
        const f = inp.files?.[0]; inp.remove();
        if (!f) return ok(null);
        const img = new Image(), url = URL.createObjectURL(f);
        img.onload = () => { const d = toJpeg(img); URL.revokeObjectURL(url); ok(d); };
        img.onerror = () => { URL.revokeObjectURL(url); ok(null); };
        img.src = url;
      });
      addEventListener('focus', () => setTimeout(() => { if (inp.isConnected && !inp.files?.length) { inp.remove(); ok(null); } }, 800), { once: true });
      document.body.append(inp); inp.click();
    });
  }

  /* ---------------- the report sheet: a problem (תקלה) or an idea for doing better (הצעה לשיפור) ----------------
     The owner (2026-11-13): it is a young app, so the same sheet takes both. The kind is a choice at the top of the
     sheet (.rp-kind, two radios); the sheet's words follow it, and the form carries data-kind for design. */
  const KIND = {
    bug: { h: 'דיווח על תקלה', ask: 'מה קרה?', eg: 'למשל: לחצתי על הוספה לרשימה ושום דבר לא קרה', sent: 'נשלח לצוות האוהל' },
    idea: { h: 'הצעה לשיפור', ask: 'מה אפשר לעשות טוב יותר?', eg: 'למשל: היה נוח לסמן כמה פריטים ברשימה בבת אחת', sent: 'תודה! ההצעה הגיעה לצוות האוהל' },
  };
  function report(opts = {}) {
    const via = opts.via === 'shake' ? 'shake' : 'menu';
    let kind = opts.kind === 'idea' ? 'idea' : 'bug';
    const page = { path: location.pathname + location.search, title: pageName(), theme: theme(), width: innerWidth };
    let shot = null;
    const count = el('small', { class: 'rp-count', 'aria-live': 'polite' }, `0 / ${TEXT_MAX}`);
    const text = el('textarea', { class: 'rp-text', rows: 3, maxlength: TEXT_MAX, dir: 'auto', required: true,
      placeholder: KIND[kind].eg,
      oninput: () => { count.textContent = `${text.value.length} / ${TEXT_MAX}`; } });
    const img = el('img', { alt: 'צילום המסך שיצורף' });
    const thumb = el('figure', { class: 'rp-thumb' }, img);
    const box = el('input', { type: 'checkbox' });
    const shotWrap = el('div', { class: 'rp-shot' },
      el('label', { class: 'rp-shot-toggle' }, box, el('span', {}, touch ? 'לצרף צילום מסך (מהגלריה)' : 'לצרף צילום מסך של הדף')), thumb);
    box.addEventListener('change', async () => {
      if (!box.checked) { shot = null; shotWrap.classList.remove('has'); img.removeAttribute('src'); return; }
      try { shot = !touch && navigator.mediaDevices?.getDisplayMedia ? await grabTab() : await pickImage(); } catch (_) { shot = null; }
      if (!shot) { box.checked = false; shotWrap.classList.remove('has'); return; }
      img.src = shot; shotWrap.classList.add('has');
    });
    const send = el('button', { class: 'btn primary', type: 'submit' }, 'שליחה');
    const head = el('h2', { id: 'rp-h' }, KIND[kind].h), ask = el('span', {}, KIND[kind].ask);
    const kinds = el('fieldset', { class: 'rp-kind' }, el('legend', {}, 'מה תרצו לשלוח?'),
      ...[['bug', 'תקלה'], ['idea', 'הצעה לשיפור']].map(([k, name]) => el('label', {},
        el('input', { type: 'radio', name: 'rp-kind', value: k, checked: k === kind, onchange: () => setKind(k) }), el('span', {}, name))));
    const setKind = (k) => { kind = k; form.dataset.kind = k; head.textContent = KIND[k].h; ask.textContent = KIND[k].ask; text.placeholder = KIND[k].eg; };
    const form = el('form', { class: 'rp', 'aria-labelledby': 'rp-h', 'data-kind': kind, onsubmit: async (e) => {
      e.preventDefault();
      const t = text.value.trim();
      if (!t) return text.focus();
      send.disabled = true;
      try {
        await api('/api/reports', { body: { kind, text: t, ...page, shot: box.checked ? shot : null, via }, noRedirect: true });
        H.modal(el('div', { class: 'rp-sent', role: 'status' }, el('span', { class: 'rp-sent-ic', 'aria-hidden': 'true' }), el('h2', {}, KIND[kind].sent),
          el('p', {}, 'התשובה תגיע לתיבה שלך באוהל.'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'סגירה')));
      } catch (err) {
        send.disabled = false;
        toast(err.status === 429 ? 'נשלחו היום הרבה דיווחים. אפשר לשלוח שוב מחר.' : err.offline ? 'אין חיבור כרגע. הטקסט נשאר כאן, נסו שוב.' : 'לא הצלחתי לשלוח. נסו שוב בעוד רגע.');
      }
    } },
      el('header', { class: 'rp-head' }, el('span', { class: 'rp-ic', 'aria-hidden': 'true' }),
        el('div', {}, head, el('p', { class: 'rp-to' }, 'הולך ל', el('b', {}, 'צוות האוהל'), ', שקוראים כל פנייה'))),
      kinds,
      el('label', { class: 'rp-field' }, ask, text, count),
      shotWrap,
      el('p', { class: 'rp-meta' }, 'מהדף: ', el('b', {}, page.title || page.path)),
      el('div', { class: 'rp-actions' }, send, el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'ביטול')),
      el('p', { class: 'rp-hint' }, canShake ? 'אפשר גם לנער את הטלפון, מכל דף (בהגדרות: נענוע לדיווח).' : 'נשלחים גם הדף, השעה, סוג המכשיר, המצב (יום / לילה) ורוחב המסך.'));
    H.modal(form);
    setTimeout(() => text.focus(), 40);
  }

  /* ---------------- a thread (the person's inbox, and the back door) ---------------- */
  /** messages as design's .rm-thread: the report first, then the answers; `side`: 'member' or 'team' (whose words are .mine) */
  function reportThread(r, messages, { side = 'member', name = 'אני', shotUrl = null } = {}) {
    const items = [{ team: false, text: r.text, at: r.created_at, first: true }, ...messages];
    const out = el('div', { class: 'rm-thread' });
    let lastDay = '';
    for (const m of items) {
      if (dayKey(m.at) !== lastDay) { lastDay = dayKey(m.at); out.append(el('p', { class: 'rm-day' }, dayName(m.at))); }
      const mine = side === 'team' ? m.team : !m.team;
      out.append(el('article', { class: 'rm' + (mine ? ' mine' : '') },
        el('header', { class: 'rm-who' }, el('b', {}, m.team ? 'צוות האוהל' : name), el('time', { datetime: iso(m.at) }, clock(m.at))),
        el('p', { class: 'rm-text', dir: 'auto' }, m.text),
        m.first && r.has_shot && shotUrl ? el('a', { class: 'rm-shot', href: shotUrl, target: '_blank', rel: 'noopener' }, el('img', { src: shotUrl, alt: 'צילום המסך מהדיווח', loading: 'lazy' })) : null,
        m.first ? el('p', { class: 'rm-meta' }, r.kind === 'idea' ? el('span', { class: 'rm-chip idea' }, 'הצעה לשיפור') : null, el('span', { class: 'rm-chip' }, r.title || r.path), r.has_shot && !shotUrl ? el('span', { class: 'rm-chip' }, 'צילום מסך') : null,
          side === 'team' && r.device ? el('span', { class: 'rm-chip' }, [DEVICE[r.device] || r.device, r.width ? r.width + 'px' : '', r.theme === 'dark' ? 'לילה' : r.theme === 'light' ? 'יום' : ''].filter(Boolean).join(' · ')) : null) : null));
    }
    return out;
  }

  /* ---------------- the person's own inbox ---------------- */
  let unread = 0;
  async function myInbox() {
    let d;
    try { d = await api('/api/reports/mine', { noRedirect: true }); } catch (_) { return toast('לא הצלחתי לפתוח את התיבה'); }
    setUnread(d.unread);
    const list = el('ul', { class: 'mi-list' }, d.reports.map((r) => el('li', {}, el('button', { class: 'mi-row' + (r.unread ? ' unread' : ''), type: 'button', onclick: () => openMine(r.id) },
      el('span', { class: 'mi-what' }, el('b', {}, r.unread ? 'תשובה חדשה: ' + (r.title || 'הפנייה') : (r.kind === 'idea' ? 'הצעה לשיפור: ' : 'הדיווח על ') + (r.title || r.path)), el('small', { dir: 'auto' }, `"${r.text.length > 90 ? r.text.slice(0, 88) + '…' : r.text}"`)),
      el('time', { class: 'mi-when', datetime: iso(r.last_team_at || r.created_at) }, when(r.last_team_at || r.created_at))))));
    H.modal(el('section', { class: 'mi', 'aria-labelledby': 'mi-h' },
      el('header', { class: 'mi-head' }, el('span', { class: 'mi-ic', 'aria-hidden': 'true' }), el('h2', { id: 'mi-h' }, 'התיבה שלי')),
      list, el('p', { class: 'mi-empty' }, 'עוד אין כאן כלום. מה שתכתבו לצוות האוהל, והתשובות, יגיעו לכאן.'),
      el('div', { class: 'rp-actions' }, el('button', { class: 'btn ghost', type: 'button', onclick: () => report() }, 'פנייה חדשה'))));
  }
  async function openMine(id) {
    let d;
    try { d = await api('/api/reports/' + encodeURIComponent(id), { noRedirect: true }); } catch (_) { return toast('הדיווח הזה לא נמצא'); }
    H.modal(el('section', { class: 'mi', 'aria-labelledby': 'mi-h' },
      el('header', { class: 'mi-head' }, el('span', { class: 'mi-ic', 'aria-hidden': 'true' }), el('h2', { id: 'mi-h' }, (d.report.kind === 'idea' ? 'הצעה לשיפור: ' : 'הדיווח על ') + (d.report.title || d.report.path))),
      reportThread(d.report, d.messages, { side: 'member', shotUrl: d.report.has_shot ? `/api/reports/${encodeURIComponent(id)}/shot` : null }),
      d.messages.length ? null : el('p', { class: 'mi-empty', style: 'display:block' }, 'צוות האוהל עוד לא ענה. התשובה תגיע לכאן.'),
      el('div', { class: 'rp-actions' }, el('button', { class: 'btn ghost', type: 'button', onclick: myInbox }, '‹ התיבה שלי'))));
    refreshUnread();
  }

  /* ---------------- the dot on the user chip, and the count on the menu entry ---------------- */
  function setUnread(n) {
    unread = n || 0;
    const chip = document.getElementById('userchip');
    if (chip) {
      let dot = chip.querySelector('.mi-dot');
      if (unread && !dot) chip.append(dot = el('span', { class: 'mi-dot', 'aria-hidden': 'true' }));
      if (!unread && dot) dot.remove();
      chip.setAttribute('aria-label', unread ? 'הגדרות, תשובה חדשה בתיבה' : 'הגדרות');
    }
    for (const c of document.querySelectorAll('.rp-entry.inbox .mi-count')) { c.textContent = unread || ''; c.hidden = !unread; }
  }
  async function refreshUnread() {
    try { const d = await api('/api/reports/mine', { noRedirect: true }); setUnread(d.unread); } catch (_) { /* offline: the dot waits */ }
  }

  /** the two menu entries; `before`: run first (the tools menu closes itself before the sheet opens) */
  function reportEntries(before) {
    const count = el('span', { class: 'mi-count', hidden: !unread }, unread || '');
    const go = (fn) => async () => { if (before) await before(); fn(); };
    return [
      el('button', { class: 'rp-entry', type: 'button', onclick: go(() => report()) }, el('span', { class: 'rp-entry-ic', 'aria-hidden': 'true' }),
        el('span', {}, el('b', {}, 'תקלה או הצעה'), el('small', {}, 'משהו לא עובד, או רעיון לשיפור? זה מגיע לצוות האוהל'))),
      el('button', { class: 'rp-entry inbox', type: 'button', onclick: go(() => myInbox()) }, el('span', { class: 'rp-entry-ic', 'aria-hidden': 'true' }),
        el('span', {}, el('b', {}, 'התיבה שלי'), el('small', {}, 'מה שכתבתם, והתשובות')), count),
    ];
  }
  // the tools menu (common.js draws it when it opens): the two entries at its foot, the fallback where there is no shake
  const closeMenu = () => new Promise((ok) => { dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); setTimeout(ok, 80); });
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.id === 'navmenu-tools' && !n.querySelector('.rp-entry')) n.append(el('div', { class: 'navmenu-reports' }, reportEntries(closeMenu)));
    }
  }).observe(document.body, { childList: true });

  /* ---------------- shaking the phone ----------------
     The motion permission: iOS asks the person, and only from a tap; newer Chrome (Android too) has the same call and
     answers "granted" at once. So on load it is asked quietly (Chrome: on at once), and otherwise on the first tap anywhere
     (iOS: the browser's question appears then, once). A clear "no" turns the automatic choice off, so it is not asked on
     every page; the switch in the settings can still turn it on. A failure that is not a "no" (a tap that was a scroll)
     waits for the next tap.
     The shake itself (as Square's seismic detector): over the last half second, at least three quarters of the samples are
     strong (the whole acceleration, gravity included, above 13 m/s²), across at least a quarter second. A walk, a tap on the
     screen or putting the phone down does not do that; two or three firm shakes do. */
  const wantShake = () => canShake && (prefs.shake === 'auto' || prefs.shake === true);
  let granted = !needsAsk;
  const shakeOn = () => wantShake() && granted;
  const STRONG = 13, WINDOW = 500, SPAN = 250;
  let samples = [], lastOpen = 0;
  function onMotion(e) {
    const g = e.accelerationIncludingGravity, a = e.acceleration;
    let x, y, z;
    if (g && g.x != null) { x = g.x; y = g.y; z = g.z; }
    else if (a && a.x != null) { x = a.x; y = a.y; z = a.z + 9.81; }       // no gravity in it: a rough one
    else return;
    const now = Date.now();
    samples.push({ t: now, strong: x * x + y * y + z * z > STRONG * STRONG });
    while (samples.length && now - samples[0].t > WINDOW) samples.shift();
    if (samples.length < 4 || now - samples[0].t < SPAN) return;
    const strong = samples.filter((s) => s.strong).length;
    if (strong < samples.length * 0.75) return;
    samples = [];
    const m = document.getElementById('modal');
    const busy = document.body.classList.contains('modal-open') || (m && !m.hidden);   // a sheet is open already
    if (now - lastOpen < 4000 || busy || document.visibilityState !== 'visible') return;
    lastOpen = now;
    navigator.vibrate?.(40);
    report({ via: 'shake' });
  }
  let listening = false;
  function listen(on) {
    if (on === listening) return;
    listening = on; samples = [];
    if (on) addEventListener('devicemotion', onMotion); else removeEventListener('devicemotion', onMotion);
  }
  /** the motion permission: 'granted', 'denied', or null when it could not be asked now (not from a tap) */
  async function askMotion() {
    try { return await DeviceMotionEvent.requestPermission(); } catch (_) { return null; }
  }
  // asked quietly on load, then on the first tap (capture: before the page's own handlers, and a tap on anything counts)
  function askOnTap() {
    if (granted || !wantShake()) return;
    const ask = async () => {
      off();
      const r = await askMotion();
      if (r === 'granted') { granted = true; listen(shakeOn()); }
      else if (r === 'denied') { if (prefs.shake === 'auto') { prefs.shake = false; H.savePrefs('reports'); } }
      else askOnTap();                                             // not taken as a tap: the next one
    };
    const off = () => { removeEventListener('touchend', ask, true); removeEventListener('click', ask, true); };
    addEventListener('touchend', ask, true); addEventListener('click', ask, true);
  }
  if (needsAsk && wantShake()) askMotion().then((r) => { if (r === 'granted') { granted = true; listen(shakeOn()); } else askOnTap(); });
  /** the switch in the settings; on iOS the browser asks for motion now, on this tap. Resolves to whether shaking is on. */
  async function setShake(on) {
    if (on && !canShake) { toast('במכשיר הזה אין חיישן תנועה. אפשר לדווח מהתפריט או מהמשולש שבסרגל העליון.'); return false; }
    if (on && needsAsk && !granted) {
      const r = await askMotion();
      if (r !== 'granted') { toast('הטלפון לא אישר גישה לתנועה. אפשר לאשר בהגדרות הדפדפן, או לדווח מהמשולש שבסרגל העליון.'); return false; }
      granted = true;
    }
    prefs.shake = !!on; H.savePrefs('reports');
    listen(shakeOn());
    return shakeOn();
  }
  listen(shakeOn());
  addEventListener('helper:prefs', (e) => { if (e.detail === 'reports') { listen(shakeOn()); askOnTap(); } });

  /* ---------------- the warning triangle in the top bar (the owner, 2026-11-13) ----------------
     Next to the settings button (before #userchip, and before the messages inbox of dm.js when it is there: triangle, inbox,
     chip, whichever loads first), on every page that loads this file: a tap
     opens the same sheet. Design's markup and look (.rp-alert in reports.css: pastel red, 44×44, the triangle drawn in
     CSS, no children); added once reports.css is in, so there is no moment of a bare button. */
  function alertButton() {
    const chip = document.getElementById('userchip');
    if (!chip || document.querySelector('.rp-alert')) return;
    (document.querySelector('.dm-inbox, .mu-menu') || chip).before(el('button', { class: 'rp-alert', type: 'button', title: 'תקלה או הצעה לשיפור', 'aria-label': 'דיווח על תקלה או הצעה לשיפור', onclick: () => report() }));
  }
  /* The triangle's first showing (the owner approved design's "a gentle arrow along the screen, with a short note"):
     once per person (prefs reports.coached, on the server, so not again on another device), after the welcome wizard,
     only while the triangle is on screen and nothing else is open. The look is design's (.rp-coach in reports.css; --x/--y
     are the triangle's centre). "הבנתי", Escape, a tap on the veil, a resize or a scroll close it; a tap on the
     triangle itself (26 px around its centre) closes it and opens the sheet. The bar may still change under it (the
     messages inbox comes in from dm.js and moves the triangle 44 px): it measures again on the next frame and whenever
     the bar's buttons change, while it is open. */
  function coach() {
    const b = document.querySelector('.rp-alert');
    if (!b || prefs.coached || !H.prefs('me').welcomed || location.pathname.startsWith('/welcome')) return;
    const r = b.getBoundingClientRect();
    const busy = document.body.classList.contains('modal-open') || document.getElementById('modal')?.hidden === false;
    if (!r.width || r.bottom < 0 || r.top > innerHeight || busy || document.visibilityState !== 'visible' || document.querySelector('.rp-coach')) return;
    prefs.coached = Date.now(); H.savePrefs('reports');
    let x = 0, y = 0;
    const place = () => {
      const q = b.getBoundingClientRect();
      x = Math.round(q.left + q.width / 2); y = Math.round(q.top + q.height / 2);
      c.style.setProperty('--x', x + 'px'); c.style.setProperty('--y', y + 'px');
    };
    const bar = new MutationObserver(() => place());                       // (measured at once: the layout is read on demand)
    const ok = el('button', { class: 'btn primary small', type: 'button' }, 'הבנתי');
    const c = el('div', { class: 'rp-coach' }, el('span', { class: 'rp-coach-line', 'aria-hidden': 'true' }),
      el('div', { class: 'rp-coach-card', role: 'dialog', 'aria-label': 'המשולש האדום' },
        el('p', {}, el('b', {}, 'המשולש האדום'), ' מחכה כאן, ליד ההגדרות. משהו לא עובד, או שיש לך רעיון? מקישים עליו.'), ok));
    place(); requestAnimationFrame(place);
    bar.observe(b.parentElement, { childList: true });
    const close = () => {
      c.remove(); bar.disconnect();
      removeEventListener('resize', close); removeEventListener('scroll', close, true); removeEventListener('keydown', esc, true);
    };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); b.focus({ preventScroll: true }); } };
    ok.onclick = (e) => { e.stopPropagation(); close(); b.focus({ preventScroll: true }); };
    c.onclick = (e) => {
      if (e.target.closest('.rp-coach-card')) return;                       // the note itself: only "הבנתי" closes it
      close();
      if (Math.hypot(e.clientX - x, e.clientY - y) <= 26) report();         // the tap was on the triangle
    };
    document.body.append(c);
    ok.focus({ preventScroll: true });
    addEventListener('keydown', esc, true);
    setTimeout(() => { if (c.isConnected) { addEventListener('resize', close); addEventListener('scroll', close, true); } }, 300);
  }
  const ready = () => { alertButton(); setTimeout(coach, 1200); };
  if (css.sheet) ready(); else { css.addEventListener('load', ready, { once: true }); css.addEventListener('error', alertButton, { once: true }); }

  Object.assign(H, { report, myInbox, reportEntries, reportThread, shakeOn, setShake, canShake: () => canShake });
  refreshUnread();
})();
