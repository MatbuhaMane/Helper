/* Shared frontend helpers for all Helper apps: API calls, DOM builder, toast, header, sign-in gate. */
(() => {
  'use strict';

  const ERRORS = {
    gmail_not_connected: 'הג׳ימייל לא מחובר. צריך לחבר אותו מחדש.',
    ai_not_configured: 'העוזר החכם עוד לא הוגדר (חסר מפתח API).',
    ai_busy: 'העוזר החכם עמוס כרגע. נסה שוב בעוד דקה.',
    ai_refused: 'העוזר החכם לא יכול לעזור בבקשה הזו.',
    no_recipe_found: 'לא מצאתי מתכון בעמוד הזה.',
    no_feed_found: 'לא מצאתי פיד חדשות (RSS) באתר הזה.',
    no_telegram_channel: 'לא מצאתי ערוץ טלגרם ציבורי בשם הזה.',
    facebook_unsupported: 'פייסבוק לא מאפשר לקרוא עמודים מבחוץ. אפשר להוסיף את אתר החדשות עצמו או את ערוץ הטלגרם שלו.',
    not_readable: 'אי אפשר להציג את הכתבה כאן – פתח אותה באתר המקורי.',
    fetch_failed: 'האתר לא ענה. נסה שוב מאוחר יותר.',
    'Not signed in': 'צריך להתחבר מחדש.',
  };

  async function api(path, opts = {}) {
    const init = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: {} };
    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
      init.headers['content-type'] = 'application/json';
    }
    let res;
    try {
      res = await fetch(path, init);
    } catch (e) {
      const err = new Error('אין חיבור לאינטרנט');
      err.offline = true;
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = data.error || `HTTP ${res.status}`;
      const err = new Error(ERRORS[code] || (code.startsWith('fetch_status') ? 'האתר חסם את הבקשה או לא נמצא.' : code));
      err.code = code;
      err.status = res.status;
      if (res.status === 401 && !opts.noRedirect) location.href = '/?next=' + encodeURIComponent(location.pathname);
      throw err;
    }
    return data;
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v; // only for sanitized server HTML
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c);
    return node;
  }

  let toastTimer;
  function toast(msg, actionLabel, action) {
    let t = document.getElementById('toast');
    if (!t) { t = el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
    t.textContent = '';
    t.append(el('span', {}, msg));
    if (actionLabel) t.append(el('button', { class: 'btn small', onclick: () => { action(); t.classList.remove('show'); } }, actionLabel));
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), actionLabel ? 6000 : 3800);
  }

  let mePromise;
  function me() {
    mePromise = mePromise || api('/api/me', { noRedirect: true }).catch((e) => (e.offline ? { user: JSON.parse(localStorage.getItem('helper.me') || 'null'), offline: true } : { user: null }));
    return mePromise.then((r) => {
      try { if (r.user) localStorage.setItem('helper.me', JSON.stringify(r.user)); } catch (_) { /* ignore */ }
      if (r.user && !r.offline) applyServerPrefs(r.user.email, r.prefs || {});
      return r;
    });
  }

  /* ---------- Preferences per person, kept on the server so they follow them to every device ----------
   * const prefs = H.prefs('news', { unreadOnly: false });   // filled from the server at sign-in (cached for offline)
   * prefs.unreadOnly = true; H.savePrefs('news');           // saved locally at once, sent to the server shortly after
   * A page that wants to react when another device's change arrives listens for 'helper:prefs' (detail = the tool). */
  const PREFS_CACHE = 'helper.prefs.v1';
  let prefStore = { email: null, data: {}, at: {}, dirty: {} };
  try { const c = JSON.parse(localStorage.getItem(PREFS_CACHE) || 'null'); if (c && c.data) prefStore = { email: c.email || null, data: c.data, at: c.at || {}, dirty: c.dirty || {} }; } catch (_) { /* ignore */ }
  const livePrefs = {};
  const prefDefaults = {};
  const savePrefCache = () => { try { localStorage.setItem(PREFS_CACHE, JSON.stringify(prefStore)); } catch (_) { /* ignore */ } };

  /** legacy: the localStorage key the tool used before (or its old values), carried over once if the server has nothing yet. */
  function prefs(ns, defaults = {}, legacy) {
    if (livePrefs[ns]) return livePrefs[ns];
    // First time on this device with the new storage: bring along what the tool used to keep only here.
    if (!prefStore.data[ns] && legacy) {
      try {
        const old = typeof legacy === 'string' ? JSON.parse(localStorage.getItem(legacy) || 'null') : legacy;
        if (old && typeof old === 'object') { prefStore.data[ns] = old; prefStore.at[ns] = 1; prefStore.dirty[ns] = true; savePrefCache(); }
      } catch (_) { /* ignore */ }
    }
    prefDefaults[ns] = { ...defaults };
    livePrefs[ns] = Object.assign({}, defaults, prefStore.data[ns] || {});
    if (prefStore.dirty[ns]) schedulePrefFlush();
    return livePrefs[ns];
  }

  function setLocal(ns, data, at, dirty) {
    prefStore.data[ns] = data;
    prefStore.at[ns] = at;
    if (dirty) prefStore.dirty[ns] = true; else delete prefStore.dirty[ns];
    if (livePrefs[ns]) {
      for (const k of Object.keys(livePrefs[ns])) if (!(k in data) && !(k in prefDefaults[ns])) delete livePrefs[ns][k];
      Object.assign(livePrefs[ns], prefDefaults[ns], data);
    }
  }

  let prefsApplied = false;
  function applyServerPrefs(email, server) {
    if (prefsApplied) return;
    prefsApplied = true;
    if (prefStore.email && prefStore.email !== email) prefStore = { email, data: {}, at: {}, dirty: {} }; // someone else signed in here
    prefStore.email = email;
    for (const [ns, v] of Object.entries(server)) {
      // The server wins unless this device has a newer change it hasn't sent yet.
      if (prefStore.dirty[ns] && (prefStore.at[ns] || 0) > v.at) continue;
      setLocal(ns, v.data, v.at, false);
      window.dispatchEvent(new CustomEvent('helper:prefs', { detail: ns }));
    }
    savePrefCache();
    schedulePrefFlush();
  }

  function savePrefs(ns, patch) {
    if (!livePrefs[ns]) return;
    if (patch) Object.assign(livePrefs[ns], patch);
    setLocal(ns, { ...livePrefs[ns] }, Date.now(), true);
    savePrefCache();
    schedulePrefFlush();
  }

  let prefTimer;
  function schedulePrefFlush() { clearTimeout(prefTimer); prefTimer = setTimeout(flushPrefs, 400); }
  async function flushPrefs() {
    if (!prefsApplied) return; // wait until we know who is signed in
    for (const ns of Object.keys(prefStore.dirty)) {
      try {
        const r = await api('/api/prefs/' + ns, { method: 'PUT', body: { data: prefStore.data[ns], at: prefStore.at[ns] }, noRedirect: true });
        if (r.stale) { setLocal(ns, r.data, r.at, false); window.dispatchEvent(new CustomEvent('helper:prefs', { detail: ns })); }
        else delete prefStore.dirty[ns];
        savePrefCache();
      } catch (_) { return; } // offline or signed out: try again later
    }
  }
  window.addEventListener('online', schedulePrefFlush);

  /* ---------- Day and night: the app follows the sun (sunrise → day, sunset → night) ----------
     A press on the switch picks the other one until the next sunrise or sunset, then the sun leads again;
     a long press goes straight back to following the sun. Kept per person, like every pref. */
  const uiPrefs = prefs('ui', { theme: 'auto' });

  /** Where the sun is reckoned for: the family's city from the device's time zone (no location permission needed). */
  const PLACES = { 'Asia/Jerusalem': [31.77, 35.21], 'Asia/Tel_Aviv': [32.08, 34.78], 'Europe/London': [51.5, -0.12], 'Europe/Paris': [48.86, 2.35], 'America/New_York': [40.71, -74.0], 'America/Los_Angeles': [34.05, -118.24] };
  function place() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (PLACES[tz]) return PLACES[tz];
    return [32, Math.max(-180, Math.min(180, -new Date().getTimezoneOffset() / 4))];   // the time zone's own meridian, at a mid latitude
  }
  /** Sunrise, noon and sunset (ms) for the day of `date` – the sunrise equation, a few minutes from the almanac. */
  function sunTimes(date = new Date(), [lat, lon] = place()) {
    const rad = Math.PI / 180;
    const n = Math.ceil(date.getTime() / 864e5 + 2440587.5 - 2451545.0 + 0.0008 - 0.5);
    const jstar = n - lon / 360;
    const M = (357.5291 + 0.98560028 * jstar) % 360;
    const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
    const lam = (M + C + 180 + 102.9372) % 360;
    const transit = 2451545.0 + jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lam * rad);
    const dec = Math.asin(Math.sin(lam * rad) * Math.sin(23.44 * rad));
    const cosw = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
    const w0 = Math.acos(Math.max(-1, Math.min(1, cosw))) / rad;
    const ms = (j) => (j - 2440587.5) * 864e5;
    return { rise: ms(transit - w0 / 360), noon: ms(transit), set: ms(transit + w0 / 360) };
  }
  /** The sun right now: is it day, how far through the day (0 at sunrise, 1 at sunset), and when it next rises or sets. */
  function sunNow(now = Date.now()) {
    const t = sunTimes(new Date(now));
    const day = now >= t.rise && now < t.set;
    const next = now < t.rise ? t.rise : now < t.set ? t.set : sunTimes(new Date(now + 864e5)).rise;
    return { ...t, day, next, progress: (now - t.rise) / (t.set - t.rise) };
  }
  // a choice saved before choices had an end (the old light/dark switch): from now on the sun leads
  if (uiPrefs.theme !== 'auto' && !uiPrefs.until) uiPrefs.theme = 'auto';
  const chosen = () => uiPrefs.theme !== 'auto' && Date.now() < (uiPrefs.until || 0);
  const isDark = () => (chosen() ? uiPrefs.theme === 'dark' : !sunNow().day);
  let themeTimer;
  function applyTheme() {
    const root = document.documentElement;
    const dark = isDark();
    root.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#111a2c' : '#efeee6';
    document.querySelectorAll('.theme-switch').forEach((b) => { b.setAttribute('aria-checked', String(dark)); b.title = (dark ? 'מעבר למצב יום' : 'מעבר למצב לילה') + ' (עד הזריחה או השקיעה הבאה; לחיצה ארוכה: לפי השמש)'; });
    // the next sunrise or sunset changes it by itself (checked every few minutes, so a sleeping laptop catches up)
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => fadeTheme(applyTheme), Math.min(5 * 60e3, Math.max(1000, sunNow().next - Date.now() + 500)));
  }
  function fadeTheme(fn) {
    document.documentElement.classList.add('theme-fade');
    fn();
    setTimeout(() => document.documentElement.classList.remove('theme-fade'), 900);
  }
  applyTheme();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') applyTheme(); });
  window.addEventListener('helper:prefs', (e) => { if (e.detail === 'ui') applyTheme(); });
  /** Day or night by the person's hand (the switch, or the sun or moon dragged below the horizon):
      back to what the sun says, or a choice until the sun next rises or sets. */
  function chooseTheme(dark) {
    fadeTheme(() => {
      if (dark === !sunNow().day) { uiPrefs.theme = 'auto'; delete uiPrefs.until; }
      else { uiPrefs.theme = dark ? 'dark' : 'light'; uiPrefs.until = sunNow().next; }
      savePrefs('ui');
      applyTheme();
    });
  }
  function themeSwitch() {
    const b = el('button', { class: 'theme-switch', type: 'button', role: 'switch', 'aria-label': 'מצב לילה',
      html: '<span class="knob"></span><svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg><svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/></svg>' });
    b.addEventListener('click', () => chooseTheme(!isDark()));
    // a long press (or right click) goes back to following the sun
    let t;
    b.addEventListener('pointerdown', () => { t = setTimeout(() => { uiPrefs.theme = 'auto'; delete uiPrefs.until; savePrefs('ui'); fadeTheme(applyTheme); toast('היום והלילה של העוזר ילכו עכשיו לפי השמש'); t = 'done'; }, 700); });
    b.addEventListener('pointerup', () => clearTimeout(t));
    b.addEventListener('pointerleave', () => clearTimeout(t));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    b.addEventListener('click', (e) => { if (t === 'done') { t = null; e.stopImmediatePropagation(); } }, true);
    queueMicrotask(applyTheme);
    return b;
  }

  /** Call at the top of each app page: redirects to the hub sign-in when signed out. */
  async function requireLogin() {
    const r = await me();
    if (!r.user) { location.href = '/?next=' + encodeURIComponent(location.pathname); throw new Error('redirect'); }
    return r;
  }

  /* Line icons (one stroke weight, like the ShemRivers drawings). */
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    cart: '<path d="M3 4h2l2.2 11h10.6L20 7H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
    news: '<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M7 8.5h10M7 12h10M7 15.5h6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3.5 6 8.5 7 8.5-7"/>',
    pc: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    family: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.4"/><path d="M2.5 20c.6-3.6 2.8-5.5 5.5-5.5s4.9 1.9 5.5 5.5"/><path d="M14 15.3c.9-.5 1.9-.8 3-.8 2.3 0 4 1.6 4.5 5.5"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    food: '<path d="M3.5 12h17a8.5 8.5 0 0 1-17 0z"/><path d="M8 8.5c0-1.5 1.2-2 1.2-3.5M12 8.5c0-1.5 1.2-2 1.2-3.5M16 8.5c0-1.5 1.2-2 1.2-3.5"/>',
    tools: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2z"/><path d="M4 4l5 5M4 4l2.5-.5L4 6z"/>',
    tasks: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 9l1.5 1.5L12 8M8 15l1.5 1.5L12 14M14.5 9.5H17M14.5 15.5H17"/>',
    fun: '<path d="M3 8.5a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a1.5 1.5 0 0 0 0 3v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a1.5 1.5 0 0 0 0-3z"/><path d="M15 6.5v11" stroke-dasharray="1.6 1.8"/><path d="m9.2 9.8.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z"/>',
    tv: '<rect x="3" y="6.5" width="18" height="12.5" rx="2.5"/><path d="M8.5 2.5 12 6.5l3.5-4M8 22h8"/>',
    clapper: '<path d="M4 9.5h16v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="m3.6 9.4-.5-2.4a1.2 1.2 0 0 1 .9-1.4l13.7-2.9a1.2 1.2 0 0 1 1.4.9l.5 2.4z"/><path d="m8 5.2 2 3.3M12.6 4.2l2 3.3"/>',
    mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21.5M8.5 21.5h7"/>',
    gamepad: '<path d="M7.5 7h9a5 5 0 0 1 4.9 6l-.6 3a2.6 2.6 0 0 1-4.5 1.2L14.6 15H9.4l-1.7 2.2a2.6 2.6 0 0 1-4.5-1.2l-.6-3A5 5 0 0 1 7.5 7z"/><path d="M8 9.8v3.4M6.3 11.5h3.4M15.5 10.5h.01M17.5 12.5h.01"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14.2a5 5 0 0 0 8 0M9 9.5h.01M15 9.5h.01"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.2h.01M12 17.2h.01"/>',
    lens: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3 20.5 20.5"/>',
    torah: '<rect x="3.5" y="4" width="3.5" height="16" rx="1.75"/><rect x="17" y="4" width="3.5" height="16" rx="1.75"/><path d="M5.25 1.8v2.2M5.25 20v2.2M18.75 1.8v2.2M18.75 20v2.2"/><path d="M7 6h10v12H7z"/><path d="M9.6 9.5h4.8M9.6 12h4.8M9.6 14.5h3.2"/>',
    note: '<path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 5.5 20V4a.5.5 0 0 1 .5-.5z"/><path d="M15 3.5V8h4M9 12h6M9 15.5h6"/>',
    calc: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><rect x="8" y="5.5" width="8" height="3.5" rx="1"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01" stroke-width="2.4"/>',
    weather: '<circle cx="9" cy="9" r="3.5"/><path d="M9 2.5v1.5M2.5 9H4M4.4 4.4l1 1M13.6 4.4l-1 1"/><path d="M8 20h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.3 1.2A3 3 0 0 0 8 20z"/>',
    fridge: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M6 10h12M9 6v2M9 13v3"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
    diet: '<path d="M12 7.5c-1.6-1.3-5.5-1.6-6.8 1.8-1.3 3.4.4 8.5 3.4 10.3 1.3.8 2.4.4 3.4.1 1 .3 2.1.7 3.4-.1 3-1.8 4.7-6.9 3.4-10.3-1.3-3.4-5.2-3.1-6.8-1.8z"/><path d="M12 7.5c0-2 .8-3.4 2.6-4.2"/><path d="M12.4 5.6c1.6-.3 2.9.2 3.6 1.3-1.6.4-2.9 0-3.6-1.3z"/>',
    keto: '<path d="M12 3c4 3 6.5 6.5 6.5 10a6.5 6.5 0 0 1-13 0C5.5 9.5 8 6 12 3z"/><circle cx="12" cy="14" r="2.6"/>',
  };
  // SVG needs its namespace, so it's parsed from markup rather than built with createElement.
  const icon = (name, cls = 'icon') => {
    const t = document.createElement('template');
    t.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
    return t.content.firstChild;
  };
  const NAV = [
    { href: '/', label: 'בית', icon: 'home' },
    // (also: the pages that live inside a folder light up the folder's entry)
    { href: '/food/', label: 'אוכל', icon: 'food', also: ['/groceries/'] },
    { href: '/news/', label: 'חדשות', icon: 'news' },
    { href: '/fun/', label: 'בידור', icon: 'fun' },
    { href: '/parasha/', label: 'פרשת השבוע', short: 'פרשה', icon: 'torah' },   // short: the phone's tab bar
    { href: '/songs/', label: 'שירון', icon: 'music' },
    { href: '/tools/', label: 'כלים', icon: 'tools', also: ['/mail/', '/pc/'] },
  ];
  const BRAND = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#c2b04e"/><path d="M7 20c3-1.5 5.5-1.5 9 0s6 1.5 9 0" fill="none" stroke="#55622f" stroke-width="2.2" stroke-linecap="round"/><path d="M9 14.5c2.4-1.2 4.4-1.2 7 0s4.6 1.2 7 0" fill="none" stroke="#2e2a1e" stroke-width="1.8" stroke-linecap="round" opacity=".55"/></svg>';

  /** The app shell: a top bar on every page (brand, navigation on PC, the user), and a tab bar at the bottom on phones. */
  /** ?embed=1 inside a frame: the page shows in a window of another page (the songbook on the home page) – no bars of its own. */
  const embedded = window.top !== window && new URLSearchParams(location.search).has('embed');
  if (embedded) document.documentElement.classList.add('embedded');
  function header(title) {
    const here = location.pathname.replace(/index\.html$/, '');
    const current = (href) => (href === '/' ? here === '/' : here.startsWith(href) || !!NAV.find((n) => n.href === href)?.also?.some((a) => here.startsWith(a)));
    const bar = el('header', { class: 'appbar' },
      el('a', { class: 'brand', href: '/', 'aria-label': 'העוזר המשפחתי, לדף הבית' }, el('span', { html: BRAND }), el('span', { class: 'brand-text' }, 'העוזר המשפחתי')),
      title ? el('h1', { class: 'page-title' }, title) : null,
      el('nav', { class: 'topnav', 'aria-label': 'ניווט ראשי', hidden: true }, NAV.map((n) =>
        el('a', { class: 'ink-nav', href: n.href, 'aria-current': current(n.href) ? 'page' : null, 'data-guide': 'nav-' + n.icon, 'data-guide-label': 'מעבר ל' + n.label }, n.label))),
      el('span', { class: 'spacer' }),
      // (day and night: the sun and moon's orbit on the home page is the switch; elsewhere the app follows the sun)
      el('button', { class: 'userchip', id: 'userchip', onclick: userMenu, hidden: true }, '…'));
    const tabs = el('nav', { class: 'tabbar', 'aria-label': 'ניווט', hidden: true }, NAV.map((n) =>
      el('a', { href: n.href, 'aria-current': current(n.href) ? 'page' : null, 'data-guide': 'tab-' + n.icon, 'data-guide-label': 'מעבר ל' + n.label }, icon(n.icon), el('span', {}, n.short || n.label))));
    document.body.prepend(bar);
    document.body.append(tabs);
    me().then((r) => {
      if (!r.user) return;
      bar.querySelector('.topnav').hidden = false;
      tabs.hidden = false;
      const chip = document.getElementById('userchip');
      chip.hidden = false;
      chip.textContent = (r.user.name || r.user.email).split(' ')[0];
      if (!r.offline && !embedded) loadMusic();
      if (!r.offline) loadCapture();
    });
    return bar;
  }

  async function userMenu() {
    if (!confirm('להתנתק מהעוזר?')) return;
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    try { localStorage.removeItem('helper.me'); localStorage.removeItem(PREFS_CACHE); } catch (_) { /* ignore */ }
    location.href = '/';
  }

  /* Glass modal shared by apps */
  function modal(...content) {
    let m = document.getElementById('modal');
    if (!m) {
      m = el('div', { id: 'modal', class: 'modal', hidden: true },
        el('div', { class: 'modal-backdrop', 'data-close': true }),
        el('div', { class: 'modal-glass', role: 'dialog', 'aria-modal': 'true' },
          el('button', { class: 'modal-close', 'data-close': true, 'aria-label': 'סגור' }, '✕'),
          el('div', { id: 'modalBody' })));
      m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) closeModal(); });
      document.body.append(m);
    }
    const b = document.getElementById('modalBody');
    b.textContent = '';
    b.append(...content);
    m.hidden = false;
    document.body.classList.add('modal-open');
    b.scrollTop = 0;
  }
  function closeModal() {
    const m = document.getElementById('modal');
    if (m) m.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'עכשיו';
    if (s < 3600) return `לפני ${Math.round(s / 60)} דק׳`;
    if (s < 86400) return `לפני ${Math.round(s / 3600)} שע׳`;
    return new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

  /** Load the daemon companion. Every page gets the floating one; the home page mounts it large (data-daemon="hero"). */
  let daemonLoad;
  function loadDaemon() {
    daemonLoad = daemonLoad || new Promise((resolve) => {
      document.head.append(el('link', { rel: 'stylesheet', href: '/assets/daemon.css' }));
      const s = el('script', { src: '/assets/daemon.js' });
      s.onload = () => resolve(H.daemon);
      document.head.append(s);
    });
    return daemonLoad;
  }
  /** Ibn Ezra lives in his tent on the home page; he shows up on other screens only after he was asked to come along (follow). */
  const DAEMON_DEFAULTS = { speak: true, follow: false, minimized: false, rate: 1.2 };
  /** Marked text anywhere can be saved as a note (also inside the songbook's window). */
  function loadCapture() { if (!document.querySelector('script[src="/assets/capture.js"]')) document.head.append(el('script', { src: '/assets/capture.js' })); }
  /** The music player lives in the menu of every screen (its script and styles load after the menu is drawn). */
  function loadMusic() {
    if (document.querySelector('script[src^="/assets/music.js"]')) return;
    document.head.append(el('link', { rel: 'stylesheet', href: '/assets/music.css' }));
    document.head.append(el('script', { src: '/assets/music.js' }));
  }
  function autoDaemon() {
    if (embedded || document.body.dataset.daemon === 'hero' || document.body.dataset.daemon === 'off') return;
    me().then((r) => {
      if (!r.user || r.offline) return;
      if (prefs('daemon', DAEMON_DEFAULTS, 'helper.daemon.prefs').follow) loadDaemon().then((d) => d.mount());
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoDaemon);
  else setTimeout(autoDaemon);

  window.H = { api, el, toast, me, requireLogin, header, icon, modal, closeModal, timeAgo, loadDaemon, prefs, savePrefs, DAEMON_DEFAULTS, sunNow, sunTimes, chooseTheme, isDark };
})();
