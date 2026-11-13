/* Reports, תיבת פניות (server/reports.ts): from any page a member tells צוות האוהל that something is wrong – by shaking
   the phone, or from the menu ("דווח על בעיה"); the answer comes back to the person's own small inbox (התיבה שלי), with
   a dot on the user chip. Only the reporter ever sees it. The look is design's /assets/reports.css (loaded from here).
   Loaded by the shell once someone is signed in (common.js), and by the settings and the back door themselves.
     H.report()            the report sheet          H.myInbox()        the person's inbox (and a thread in it)
     H.reportEntries()     the two menu buttons      H.reportThread()   a thread's messages (the back door uses it too)
     H.shakeOn(), H.setShake(on)   the "נענוע לדיווח" switch (a per-user pref; iOS asks for motion on a tap)
   The ways in: shaking the phone, the warning triangle next to the settings button in the top bar, the menu's entry. */
(() => {
  if (!window.H || window.H.report) return;
  const H = window.H, { el, api, toast } = H;
  document.head.append(el('link', { rel: 'stylesheet', href: '/assets/reports.css' }));

  const TEXT_MAX = 1000, SHOT_MAX = 900000;
  const prefs = H.prefs('reports', { shake: 'auto' });
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

  /* ---------------- the report sheet ---------------- */
  function report(opts = {}) {
    const via = opts.via === 'shake' ? 'shake' : 'menu';
    const page = { path: location.pathname + location.search, title: pageName(), theme: theme(), width: innerWidth };
    let shot = null;
    const count = el('small', { class: 'rp-count', 'aria-live': 'polite' }, `0 / ${TEXT_MAX}`);
    const text = el('textarea', { class: 'rp-text', rows: 3, maxlength: TEXT_MAX, dir: 'auto', required: true,
      placeholder: 'למשל: לחצתי על הוספה לרשימה ושום דבר לא קרה',
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
    const form = el('form', { class: 'rp', 'aria-labelledby': 'rp-h', onsubmit: async (e) => {
      e.preventDefault();
      const t = text.value.trim();
      if (!t) return text.focus();
      send.disabled = true;
      try {
        await api('/api/reports', { body: { text: t, ...page, shot: box.checked ? shot : null, via }, noRedirect: true });
        H.modal(el('div', { class: 'rp-sent', role: 'status' }, el('span', { class: 'rp-sent-ic', 'aria-hidden': 'true' }), el('h2', {}, 'נשלח לצוות האוהל'),
          el('p', {}, 'התשובה תגיע לתיבה שלך באוהל.'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'סגירה')));
      } catch (err) {
        send.disabled = false;
        toast(err.status === 429 ? 'נשלחו היום הרבה דיווחים. אפשר לשלוח שוב מחר.' : err.offline ? 'אין חיבור כרגע. הטקסט נשאר כאן, נסו שוב.' : 'לא הצלחתי לשלוח. נסו שוב בעוד רגע.');
      }
    } },
      el('header', { class: 'rp-head' }, el('span', { class: 'rp-ic', 'aria-hidden': 'true' }),
        el('div', {}, el('h2', { id: 'rp-h' }, 'דיווח על בעיה'), el('p', { class: 'rp-to' }, 'הולך ל', el('b', {}, 'צוות האוהל'), ', שקוראים כל דיווח'))),
      el('label', { class: 'rp-field' }, el('span', {}, 'מה קרה?'), text, count),
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
        m.first ? el('p', { class: 'rm-meta' }, el('span', { class: 'rm-chip' }, r.title || r.path), r.has_shot && !shotUrl ? el('span', { class: 'rm-chip' }, 'צילום מסך') : null,
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
      el('span', { class: 'mi-what' }, el('b', {}, r.unread ? 'תשובה חדשה: ' + (r.title || 'הדיווח') : 'הדיווח על ' + (r.title || r.path)), el('small', { dir: 'auto' }, `"${r.text.length > 90 ? r.text.slice(0, 88) + '…' : r.text}"`)),
      el('time', { class: 'mi-when', datetime: iso(r.last_team_at || r.created_at) }, when(r.last_team_at || r.created_at))))));
    H.modal(el('section', { class: 'mi', 'aria-labelledby': 'mi-h' },
      el('header', { class: 'mi-head' }, el('span', { class: 'mi-ic', 'aria-hidden': 'true' }), el('h2', { id: 'mi-h' }, 'התיבה שלי')),
      list, el('p', { class: 'mi-empty' }, 'עוד אין כאן כלום. מה שתכתבו לצוות האוהל, והתשובות, יגיעו לכאן.'),
      el('div', { class: 'rp-actions' }, el('button', { class: 'btn ghost', type: 'button', onclick: () => report() }, 'דיווח חדש'))));
  }
  async function openMine(id) {
    let d;
    try { d = await api('/api/reports/' + encodeURIComponent(id), { noRedirect: true }); } catch (_) { return toast('הדיווח הזה לא נמצא'); }
    H.modal(el('section', { class: 'mi', 'aria-labelledby': 'mi-h' },
      el('header', { class: 'mi-head' }, el('span', { class: 'mi-ic', 'aria-hidden': 'true' }), el('h2', { id: 'mi-h' }, 'הדיווח על ' + (d.report.title || d.report.path))),
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
        el('span', {}, el('b', {}, 'דווח על בעיה'), el('small', {}, 'משהו לא עובד? זה מגיע לצוות האוהל'))),
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
     Next to the settings button, on every page that loads this file: a tap opens the same report sheet. The look is
     design's (.rp-alert in reports.css: pastel red, 44×44); the triangle is drawn here so it shows before the CSS. */
  function alertButton() {
    const chip = document.getElementById('userchip');
    if (!chip || document.querySelector('.rp-alert')) return;
    const svg = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">'
      + '<path d="M12 3.5 2.6 19.8a1 1 0 0 0 .87 1.5h17.06a1 1 0 0 0 .87-1.5L12 3.5Z" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
      + '<path d="M12 9.5v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.2" fill="currentColor"/></svg>', 'image/svg+xml').documentElement;
    chip.before(el('button', { class: 'rp-alert', type: 'button', title: 'דיווח על תקלה', 'aria-label': 'דיווח על תקלה', onclick: () => report() }, document.importNode(svg, true)));
  }
  alertButton();

  Object.assign(H, { report, myInbox, reportEntries, reportThread, shakeOn, setShake, canShake: () => canShake });
  refreshUnread();
})();
