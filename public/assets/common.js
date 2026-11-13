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
      // the AI credit ran out (server/credits.ts): an invitation to connect one's own AI, not a broken button
      if (res.status === 402 && code === 'ai_credit_needed') loadOnce('/assets/ai-invite.js').then(() => window.H.aiInvite?.()).catch(() => {});
      // the app or the tree is locked (server/lock.ts): the lock screen, then the page again (once, however many calls failed)
      if (res.status === 423 && (code === 'app_locked' || code === 'tree_locked')) showLock(code === 'tree_locked' ? 'tree' : 'app');
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
      grants = r.grants || [];
      ancientUi();
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
  /** Leaving the page (or hiding it, as a phone does when switching apps) before the 400 ms flush: what changed goes out now,
      with keepalive so the browser finishes the request after the page is gone. It stays marked unsent until a later page
      confirms it, and the server keeps the newer of two copies (by their time), so sending twice is harmless. */
  function flushPrefsNow() {
    if (!prefsApplied) return;
    clearTimeout(prefTimer);
    for (const ns of Object.keys(prefStore.dirty)) {
      try {
        fetch('/api/prefs/' + ns, { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ data: prefStore.data[ns], at: prefStore.at[ns] }) }).catch(() => { /* the next page sends it */ });
      } catch (_) { /* the next page sends it */ }
    }
  }
  window.addEventListener('pagehide', flushPrefsNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPrefsNow(); });

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
    if (meta) meta.content = dark ? '#070b14' : '#efeee6';
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
    b.addEventListener('pointerdown', () => { t = setTimeout(() => { uiPrefs.theme = 'auto'; delete uiPrefs.until; savePrefs('ui'); fadeTheme(applyTheme); toast('היום והלילה באוהל ילכו עכשיו לפי השמש'); t = 'done'; }, 700); });
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
    unlocked: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/><circle cx="12" cy="16" r="1.2"/>',
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
    parnasa: '<path d="M4 8h15a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 20H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M4 8V7a2 2 0 0 1 1.6-2L15 3.2a1 1 0 0 1 1.2 1V8"/><path d="M20.5 12H17a2 2 0 0 0 0 4h3.5"/><circle cx="17.2" cy="14" r=".9" fill="currentColor"/>',
    lens: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3 20.5 20.5"/>',
    torah: '<rect x="3.5" y="4" width="3.5" height="16" rx="1.75"/><rect x="17" y="4" width="3.5" height="16" rx="1.75"/><path d="M5.25 1.8v2.2M5.25 20v2.2M18.75 1.8v2.2M18.75 20v2.2"/><path d="M7 6h10v12H7z"/><path d="M9.6 9.5h4.8M9.6 12h4.8M9.6 14.5h3.2"/>',
    note: '<path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 5.5 20V4a.5.5 0 0 1 .5-.5z"/><path d="M15 3.5V8h4M9 12h6M9 15.5h6"/>',
    calc: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><rect x="8" y="5.5" width="8" height="3.5" rx="1"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01" stroke-width="2.4"/>',
    weather: '<circle cx="9" cy="9" r="3.5"/><path d="M9 2.5v1.5M2.5 9H4M4.4 4.4l1 1M13.6 4.4l-1 1"/><path d="M8 20h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.3 1.2A3 3 0 0 0 8 20z"/>',
    fridge: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M6 10h12M9 6v2M9 13v3"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
    diet: '<path d="M12 7.5c-1.6-1.3-5.5-1.6-6.8 1.8-1.3 3.4.4 8.5 3.4 10.3 1.3.8 2.4.4 3.4.1 1 .3 2.1.7 3.4-.1 3-1.8 4.7-6.9 3.4-10.3-1.3-3.4-5.2-3.1-6.8-1.8z"/><path d="M12 7.5c0-2 .8-3.4 2.6-4.2"/><path d="M12.4 5.6c1.6-.3 2.9.2 3.6 1.3-1.6.4-2.9 0-3.6-1.3z"/>',
    keto: '<path d="M12 3c4 3 6.5 6.5 6.5 10a6.5 6.5 0 0 1-13 0C5.5 9.5 8 6 12 3z"/><circle cx="12" cy="14" r="2.6"/>',
    // a plate with a leaf, in a ring that comes round again: הרגלי אכילה (design's drawing)
    habits: '<path d="M12 3a9 9 0 1 1-8.2 5.3"/><path d="M4.7 6.3 2 7.6 5.5 9.1z" fill="currentColor"/><circle cx="12" cy="12" r="5.2"/><path d="M10.2 13.8c.2-2.6 1.6-4 4.2-4.2-.2 2.6-1.6 4-4.2 4.2zM9.2 14.8l3-3"/>',
    // a gear for הגדרות, and a compass for ניווט (after Feather, MIT)
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    compass: '<circle cx="12" cy="12" r="9.5"/><path d="M15.8 8.2l-2 5.6-5.6 2 2-5.6z"/>',
    // a fork and a knife, for the restaurants (design's drawing)
    restaurant: '<path d="M7 3v6.5a2 2 0 0 0 4 0V3M9 3v5.5M9 11.5V21"/><path d="M17 21V3c-1.9 1-3 3.3-3 6.5V14h3"/>',
  };
  // SVG needs its namespace, so it's parsed from markup rather than built with createElement.
  const icon = (name, cls = 'icon') => {
    const t = document.createElement('template');
    t.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
    return t.content.firstChild;
  };
  /* The top bar and the phone's tab bar: five items (the owner's decision) – בית, עץ המשפחה, ניווט (a menu of the tent's
     parts), כלים (a menu of every tool) and הגדרות. The menus are read from the catalogue in /assets/apps.js (design's),
     loaded when a menu first opens. `also`: the pages that light up an entry. */
  const PARTS = ['/food/', '/news/', '/fun/', '/songs/', '/parasha/'];
  const NAV = [
    { href: '/', label: 'בית', icon: 'home' },
    { href: '/family/', label: 'עץ המשפחה', lines: ['עץ', 'המשפחה'], short: 'משפחה', icon: 'family' },   // lines: two lines on PC (the owner's choice)
    { menu: 'parts', label: 'ניווט', icon: 'compass', also: [...PARTS, '/groceries/'] },
    { menu: 'tools', href: '/tools/', label: 'כלים', icon: 'tools', also: ['/tools/', '/mail/', '/pc/', '/gather/'] },
    { href: '/settings/', label: 'הגדרות', icon: 'settings', tab: true },   // on PC: the gear with the person's name
  ];
  /** a menu of the tent's parts or of its tools, under its button (PC) or above the tab bar (phone) */
  let openMenuEl = null;
  // closes the open menu; resolves once its history step is gone too (fromBack: back already took it)
  function closeMenu(fromBack) {
    if (!openMenuEl) return Promise.resolve();
    const { btn, box, step } = openMenuEl;
    btn.setAttribute('aria-expanded', 'false');
    box.remove();
    openMenuEl = null;
    return fromBack || !step ? Promise.resolve() : back.done(step);
  }
  async function toggleMenu(btn, kind, phone) {
    if (openMenuEl?.btn === btn) return closeMenu();
    await closeMenu();
    try { await loadOnce('/assets/apps.js'); } catch (_) { location.href = kind === 'tools' ? '/tools/' : '/'; return; }
    const here = location.pathname;
    const items = (window.H.APPS || []).filter((a) => (kind === 'parts' ? PARTS.includes(a.href) : !a.fixed && !PARTS.includes(a.href)));
    // a link leaves through the menu's own step, so back on the next page comes to this page, not to its open menu
    const go = (e) => { if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); const to = e.currentTarget.href; closeMenu().then(() => location.assign(to)); };
    const link = (a) => el('li', {}, el('a', { href: a.href, onclick: go, 'aria-current': here.startsWith(a.href.split('#')[0]) && a.href !== '/' ? 'page' : null }, icon(a.ic), el('span', {}, a.name)));
    const box = el('div', { class: 'navmenu' + (phone ? ' navmenu-phone' : ''), id: 'navmenu-' + kind },
      el('ul', {}, items.map(link)),
      kind === 'tools' ? el('a', { class: 'navmenu-all', href: '/tools/', onclick: go }, 'כל הכלים, וסידור ›') : null);
    if (!phone) {
      const r = btn.getBoundingClientRect();
      box.style.top = Math.round(r.bottom + 6) + 'px';
      box.style.insetInlineStart = Math.round(document.documentElement.dir === 'rtl' || getComputedStyle(document.documentElement).direction === 'rtl' ? innerWidth - r.right : r.left) + 'px';
    }
    document.body.append(box);
    btn.setAttribute('aria-expanded', 'true');
    openMenuEl = { btn, box };
    openMenuEl.step = back.push(() => { if (openMenuEl) openMenuEl.step = 0; closeMenu(true); });
    box.querySelector('a')?.focus({ preventScroll: true });
  }
  addEventListener('click', (e) => { if (openMenuEl && !openMenuEl.box.contains(e.target) && !openMenuEl.btn.contains(e.target)) closeMenu(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenuEl) { const b = openMenuEl.btn; closeMenu(); b.focus(); } });
  addEventListener('resize', closeMenu);
  // the app logo (the owner's own: אהל in the Phoenician script, cut by design), drawn in the ink of the theme
  const BRAND = '<svg class="brand-mark" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 405.4 159.4"><path fill="currentColor" stroke="currentColor" stroke-width="5.71" d="M20.2 152.4Q17.4 152.4 14.1 151.5Q10.8 150.6 8.4 148.5Q6.0 146.4 6.0 142.8Q6.0 139.8 7.6 135.2Q9.2 130.6 10.6 125.6Q12.4 119.2 17.5 106.9Q22.6 94.6 29.8 78.9Q37.0 63.2 45.3 46.2Q53.6 29.2 62.0 13.6L78.0 21.2Q75.6 25.4 71.1 34.3Q66.6 43.2 61.0 54.8Q55.4 66.4 49.5 78.7Q43.6 91.0 38.5 102.5Q33.4 114.0 29.9 122.7Q26.4 131.4 25.6 135.6Q40.2 134.6 55.7 132.0Q71.2 129.4 88.6 124.2L92.0 140.4Q79.8 144.4 66.7 147.1Q53.6 149.8 41.6 151.1Q29.6 152.4 20.2 152.4ZM217.4 153.4Q214.8 141.6 211.7 129.7Q208.6 117.8 205.2 106.2Q182.8 124.4 152.8 141.4L145.2 127.4Q162.0 118.2 175.9 108.5Q189.8 98.8 200.2 89.8Q198.2 83.2 196.2 76.9Q194.2 70.6 192.0 65.0Q179.8 73.8 166.2 82.5Q152.6 91.2 137.8 99.8L130.2 85.8Q145.6 77.0 159.6 67.9Q173.6 58.8 186.4 49.6Q183.6 42.0 180.8 36.1Q178.0 30.2 175.6 26.0Q161.0 34.8 147.8 43.8Q134.6 52.8 122.2 62.0L113.8 48.8Q121.0 43.4 126.6 39.1Q132.2 34.8 137.7 30.9Q143.2 27.0 149.5 22.6Q155.8 18.2 164.4 12.2Q171.6 7.2 178.0 7.2Q182.6 7.2 184.9 9.1Q187.2 11.0 188.6 13.8Q199.6 36.6 207.4 58.1Q215.2 79.6 221.4 101.6Q227.6 123.6 233.4 148.0L217.4 153.4ZM335.4 153.4Q333.2 141.4 330.8 130.3Q328.4 119.2 325.6 108.8Q306.8 109.4 292.4 109.6Q278.0 109.8 270.8 109.8Q253.0 109.8 253.0 97.6Q253.0 91.6 256.8 87.1Q260.6 82.6 267.4 77.8Q277.0 71.2 286.9 64.4Q296.8 57.6 307.2 50.8Q303.8 41.4 300.0 32.2Q296.2 23.0 292.2 13.6L308.2 6.0Q312.0 14.6 315.7 23.2Q319.4 31.8 322.6 40.6Q332.8 34.0 343.4 27.4Q354.0 20.8 365.0 14.4L372.2 29.0Q360.6 35.6 349.6 42.2Q338.6 48.8 328.0 55.4Q331.4 64.6 334.4 74.0Q337.4 83.4 340.0 92.8Q354.4 92.2 368.8 91.4Q383.2 90.6 397.2 89.8L399.4 105.6Q385.2 106.4 371.2 107.1Q357.2 107.8 344.2 108.2Q346.8 118.0 348.8 128.0Q350.8 138.0 352.6 148.2L335.4 153.4ZM272.0 94.8Q284.4 94.6 296.8 94.2Q309.2 93.8 321.4 93.6Q319.4 86.4 317.1 79.4Q314.8 72.4 312.4 65.6Q291.4 79.4 271.6 93.8L272.0 94.8Z"/></svg>';

  /** The app shell: a top bar on every page (brand, navigation on PC, the user), and a tab bar at the bottom on phones. */
  /** ?embed=1 inside a frame: the page shows in a window of another page (the songbook on the home page) – no bars of its own. */
  const embedded = window.top !== window && new URLSearchParams(location.search).has('embed');
  if (embedded) document.documentElement.classList.add('embedded');
  function header(title) {
    const here = location.pathname.replace(/index\.html$/, '');
    const current = (n) => (n.href === '/' ? here === '/' : (n.href && here.startsWith(n.href)) || !!n.also?.some((a) => here.startsWith(a)));
    // a menu entry is a button that opens its list; the others are links
    const entry = (n, phone) => n.menu
      ? el('button', { type: 'button', class: phone ? 'tab-menu' : 'ink-nav nav-menu', 'aria-expanded': 'false', 'aria-controls': 'navmenu-' + n.menu, 'aria-current': current(n) ? 'page' : null,
        'data-guide': (phone ? 'tab-' : 'nav-') + n.icon, 'data-guide-label': 'פתיחת ' + n.label, onclick: (e) => { e.stopPropagation(); toggleMenu(e.currentTarget, n.menu, phone); } },
        phone ? icon(n.icon) : null, el('span', {}, n.short || n.label), phone ? null : el('span', { class: 'nav-caret', 'aria-hidden': 'true' }, '▾'))
      : el('a', { class: phone ? null : 'ink-nav', href: n.href, 'aria-current': current(n) ? 'page' : null, 'data-guide': (phone ? 'tab-' : 'nav-') + n.icon, 'data-guide-label': 'מעבר ל' + n.label },
        phone ? icon(n.icon) : null, phone ? el('span', {}, n.short || n.label) : n.lines ? el('span', { class: 'nav-two' }, el('span', {}, n.lines[0]), ' ', el('span', {}, n.lines[1])) : n.label);
    const bar = el('header', { class: 'appbar' },
      el('a', { class: 'brand', href: '/', 'aria-label': 'הָאֹ֔הֶל, לדף הבית' }, el('span', { html: BRAND }), el('span', { class: 'brand-text' }, 'הָאֹ֔הֶל')),
      title ? el('h1', { class: 'page-title' }, title) : null,
      el('nav', { class: 'topnav', 'aria-label': 'ניווט ראשי', hidden: true }, NAV.filter((n) => !n.tab).map((n) => entry(n, false))),
      el('span', { class: 'spacer' }),
      // הגדרות on PC: the gear with the person's name (day and night: the sun and moon's orbit on the home page is the switch)
      el('button', { class: 'userchip', id: 'userchip', onclick: userMenu, title: 'הגדרות', 'aria-label': 'הגדרות', 'aria-current': here.startsWith('/settings/') ? 'page' : null, hidden: true }, icon('settings'), el('span', { class: 'userchip-name' }, '…')));
    const tabs = el('nav', { class: 'tabbar', 'aria-label': 'ניווט', hidden: true }, NAV.map((n) => entry(n, true)));
    document.body.prepend(bar);
    document.body.append(tabs);
    // signed in on the last page: the navigation shows at once, so it stands still while the page turns (base.css, @view-transition)
    // instead of blinking out until /api/me answers; it hides again below if the session is gone
    const chip = document.getElementById('userchip');
    const showNav = (u, on) => {
      bar.querySelector('.topnav').hidden = !on; tabs.hidden = !on; chip.hidden = !on;
      if (on) chip.querySelector('.userchip-name').textContent = u.he_name || (u.name || u.email).split(' ')[0];
    };
    let known = null; try { known = JSON.parse(localStorage.getItem('helper.me') || 'null'); } catch (_) { /* ignore */ }
    if (known?.email) showNav(known, true);
    me().then((r) => {
      if (!r.user) { if (known) showNav(null, false); return; }
      showNav(r.user, true);
      // the app lock (server/lock.ts): locked already – the lock screen; a lock set – the open padlock in the bar, to lock now
      if (r.locked) showLock('app');
      if (r.appLock && r.appLock !== 'off' && !embedded) {
        const lockBtn = el('button', { type: 'button', class: 'navlock pl-btn', title: 'לנעול את האוהל', 'aria-label': 'לנעול את האוהל', onclick: async () => {
          const pl = lockBtn.querySelector('.pl');
          if (pl && window.Lock?.close) await window.Lock.close(pl);   // design's move: the shackle drops (~300ms; none with reduced motion)
          try { await api('/api/lock/lock', { method: 'POST' }); } catch (_) { /* the screen locks anyway */ }
          showLock('app', true);
        } }, icon('unlocked'));
        chip.before(lockBtn);
        // design's padlock in place of the icon, once its lock.js is in (the icon stays if it doesn't load)
        loadOnce('/assets/lock.js').then(() => { if (window.Lock?.padlock) lockBtn.replaceChildren(window.Lock.padlock('open')); }).catch(() => {});
      }
      // the family vault (data-vault): no player, no capture – nothing from outside runs next to the documents
      const vault = document.body.dataset.vault === '1';
      if (!r.offline && !embedded && !vault) loadMusic();
      if (!r.offline && !vault) loadCapture();
      if (!r.offline && !vault && !embedded) loadOnce('/assets/messages.js').catch(() => {});   // the owner's messages to everyone
      if (!r.offline && !vault && !embedded) loadOnce('/assets/reports.js').catch(() => {});    // reports: shake, the menu entries, the answer dot (ai-features)
      if (!r.offline && !vault && !embedded) loadOnce('/assets/dm.js').catch(() => {});         // messages between members: the dot and the menu entry (server/dm.ts)
      // the back door, opened on this device (ai-features' /assets/admin-tab.js): a tab back to it while the room is still open
      let room = null; try { room = localStorage.getItem('helper.adminRoom'); } catch (_) { /* no storage */ }
      if (room && !r.offline && !vault && !embedded && !location.pathname.startsWith('/admin/')) loadOnce('/assets/admin-tab.js').catch(() => {});
    });
    return bar;
  }

  /** the lock screen (ai-features' /assets/lock-screen.js), once however many calls were refused; opened, the page again */
  let lockShown = false;
  function showLock(scope, animate = false) {
    if (lockShown) return;
    lockShown = true;
    loadOnce('/assets/lock-screen.js').then(() => window.H.lockScreen?.({ scope, animate })).then(() => location.reload()).catch(() => { lockShown = false; });
  }

  /** the name in the bar opens the person's settings (the account, signing out, חיבור לשירותים) */
  function userMenu() { location.href = '/settings/'; }
  /** signing out, for the settings page: the session ends here and the device forgets the person */
  async function logout() {
    if (!confirm('להתנתק מהאוהל?')) return;
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    try { localStorage.removeItem('helper.me'); localStorage.removeItem(PREFS_CACHE); } catch (_) { /* ignore */ }
    location.href = '/';
  }
  /** a script of our own, once per page */
  function loadOnce(src) {
    const had = document.querySelector(`script[src="${src}"]`);
    if (had) {
      if (had.dataset.loaded) return Promise.resolve();
      // a page's own <script> tag (not added here): it has run by the time the document is parsed (a "load" already passed)
      if (!had.dataset.dyn) return document.readyState === 'loading' ? new Promise((ok) => document.addEventListener('DOMContentLoaded', () => ok(), { once: true })) : Promise.resolve();
      return new Promise((ok, no) => { had.addEventListener('load', ok); had.addEventListener('error', no); });
    }
    return new Promise((ok, no) => { const s = el('script', { src, 'data-dyn': '1' }); s.addEventListener('load', () => { s.dataset.loaded = '1'; ok(); }); s.addEventListener('error', no); document.head.append(s); });
  }

  /* Back closes what is open, one step at a time (the phone's back gesture, the back key, Alt+←), instead of leaving the page.
   *   const step = H.back.push(() => closeIt(), url?)   when a tab, modal, sheet or panel opens (url: optional, e.g. '#recipes')
   *   await H.back.done(step)                            when it is closed by its own button (removes the history entry; closeIt is not
   *                                                      called). Resolves once the history is back, so a URL change after it lands right.
   * On back, the newest step's callback runs; anything opened on top of it closes first. A step left over from before a reload is skipped. */
  const back = (() => {
    const page = Math.random().toString(36).slice(2), stack = [];
    const waiting = [];   // done() calls whose history.go() has not landed yet
    let seq = 0, closedNow = false;   // closedNow: the last back closed something (it was not a step out of the page)
    const here = () => (history.state && history.state.hpage === page ? history.state.hback || 0 : 0);
    const run = (s) => { try { s.close(); } catch (err) { console.error(err); } };
    function push(close, url) {
      const id = ++seq;
      history.pushState({ ...(history.state || {}), hpage: page, hback: id }, '', url);
      stack.push({ id, close });
      return id;
    }
    function done(id) {
      const k = stack.findIndex((s) => s.id === id);
      if (k < 0) return Promise.resolve();
      const gone = stack.splice(k), steps = gone.filter((s) => s.id <= here()).length;
      gone.slice(1).reverse().forEach(run);   // what was opened on top of it
      return steps ? new Promise((ok) => { waiting.push(ok); history.go(-steps); }) : Promise.resolve();
    }
    addEventListener('popstate', (e) => {
      closedNow = false;
      if (waiting.length) { e.stopImmediatePropagation(); waiting.shift()(); return; }
      const st = history.state || {};
      if (st.hback && st.hpage !== page) { e.stopImmediatePropagation(); history.back(); return; }   // from before a reload: nothing to close there
      // what back passed over closes; a step one of them opens while closing (a question) stays
      const to = here(), gone = [];
      while (stack.length && stack[stack.length - 1].id > to) gone.push(stack.pop());
      gone.forEach(run);
      closedNow = gone.length > 0;
    });
    /* A panel that stays in the page and is shown and hidden (a side menu, a chat panel, a pop-up menu):
     *   H.back.watch(panelEl, () => closeIt(), isOpen?)   isOpen defaults to !panelEl.hidden; also watches its class.
     * Opening it adds the step, closing it by its own button takes the step away, and back calls closeIt. */
    function watch(t, close, isOpen = () => !t.hidden) {
      let step = 0;
      const sync = () => {
        const open = t.isConnected && isOpen();
        if (open && !step) step = push(() => { step = 0; close(); });
        else if (!open && step) { const s = step; step = 0; done(s); }
      };
      new MutationObserver(sync).observe(t, { attributes: true, attributeFilter: ['hidden', 'class', 'open'] });
      sync();
      return sync;
    }
    return { push, done, watch, get depth() { return stack.length; }, get closedNow() { return closedNow; } };
  })();

  /* The first page of the tent in this tab (opened from the home screen, from a link outside, or typed): back would leave
     the app. Instead, from any other page it goes to the home page, and on the home page it asks for a second press.
     The guard step is added at the first touch or key (Chrome skips history steps added with no user action). */
  if (!embedded) (() => {
    let entry = false;
    try { entry = !document.referrer || new URL(document.referrer).origin !== location.origin; } catch (_) { entry = true; }
    try { if (sessionStorage.getItem('hroot') === location.pathname) { entry = true; sessionStorage.removeItem('hroot'); } } catch (_) { /* private mode */ }
    const st = history.state || {};
    if (!entry && !st.hroot) return;
    if (!st.hroot) history.replaceState({ ...st, hroot: 1 }, '');
    // the bottom step: the page itself, nothing open on it (a window opened as the page loads has its own step above it)
    const bottom = (s) => s.hroot && !s.hguard && !s.hback;
    const arm = () => { const s = history.state || {}; if (bottom(s)) history.pushState({ ...s, hguard: 1 }, ''); return !!(history.state || {}).hguard; };
    const first = () => { if (arm()) ['pointerup', 'keydown'].forEach((t) => removeEventListener(t, first, true)); };
    ['pointerup', 'keydown'].forEach((t) => addEventListener(t, first, true));
    let warned = 0;
    addEventListener('popstate', () => {
      const s = history.state || {};
      if (!bottom(s)) return;
      if (back.closedNow) { arm(); return; }   // back closed a window that was open on the page: that was its step
      if (location.pathname !== '/') { try { sessionStorage.setItem('hroot', '/'); } catch (_) { /* private mode */ } location.replace('/'); return; }
      if (Date.now() - warned < 3000) { history.back(); return; }
      warned = Date.now();
      toast('לחצו שוב "חזרה" כדי לצאת');
      arm();
    });
  })();

  /* "‹ אוכל" and the like: when that is the page we came from, it goes back to it (as the phone's back does) instead of
     adding a step, so back from there does not return here. */
  addEventListener('click', (e) => {
    const a = e.target.closest?.('a.folder-back[href]');
    if (!a || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || back.depth) return;
    try {
      const from = new URL(document.referrer), to = new URL(a.href, location.href);
      if (from.origin === location.origin && from.pathname === to.pathname && !(history.state || {}).hroot) { e.preventDefault(); history.back(); }
    } catch (_) { /* no referrer */ }
  });

  /* Glass modal shared by apps */
  let modalStep = 0;
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
    m.querySelector('.modal-glass').getAnimations().forEach((a) => a.cancel());   // a window still shrinking away opens again at once
    m.classList.remove('grow', 'shrinking'); modalOrigin = null;
    const b = document.getElementById('modalBody');
    b.textContent = '';
    b.append(...content);
    if (m.hidden && !modalStep) modalStep = back.push(() => { modalStep = 0; closeModal(); });
    m.hidden = false;
    document.body.classList.add('modal-open');
    b.scrollTop = 0;
  }
  /** The modal, grown out of the thing it was opened from (a pie, a card) and shrunk back into it when it closes. */
  let modalOrigin = null;
  function modalFrom(origin, ...content) {
    modal(...content);
    const m = document.getElementById('modal');
    if (zoom(m, origin, false)) { m.classList.add('grow'); modalOrigin = origin; }
  }
  /** FLIP between the origin's box and the glass: one uniform scale, so the window's content never stretches. */
  function zoom(m, origin, back) {
    const g = m?.querySelector('.modal-glass');
    if (!g?.animate || !origin?.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce') return null;
    const a = origin.getBoundingClientRect(), b = g.getBoundingClientRect();
    if (!a.width || !b.width) return null;
    const k = Math.max(a.width / b.width, a.height / b.height, 0.04);
    const from = { transform: `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${k})`, opacity: 0.2, borderRadius: `${Math.round(Math.min(b.width, b.height) / 2)}px` };
    const to = { transform: 'none', opacity: 1, borderRadius: getComputedStyle(g).borderRadius };
    return g.animate(back ? [to, { ...from, opacity: 0 }] : [from, to], back
      ? { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)' }
      : { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }
  function closeModal() {
    const m = document.getElementById('modal');
    const shrink = m && !m.hidden && modalOrigin ? zoom(m, modalOrigin, true) : null;
    modalOrigin = null;
    if (shrink) {   // hidden when the shrink ends, or after 400 ms whatever happens (a tab in the background never runs its frames)
      m.classList.add('shrinking');
      const gone = () => { if (!m.classList.contains('shrinking')) return; shrink.cancel(); m.hidden = true; m.classList.remove('grow', 'shrinking'); };
      shrink.onfinish = gone; setTimeout(gone, 400);
    }
    else if (m) { m.hidden = true; m.classList.remove('grow', 'shrinking'); }
    document.body.classList.remove('modal-open');
    if (modalStep) { const s = modalStep; modalStep = 0; back.done(s); }
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

  /* ---------- The ancient script (docs/vision/profile.md): Hebrew letters as Noto Sans Phoenician ----------
   * H.ancient(text) → the same text in the ancient letters (finals become the plain letter, the vowel points drop).
   * H.hasGrant(key) → a secret option the owner granted this person ('frames', 'bio_ancient', 'name_ancient'); the server
   *   sends a person only their own grants, and checks them again on every save.
   * The owner's switch, H.prefs('me').ancientUi (only with the 'ancient_ui' grant, the owner's alone): the interface itself –
   *   the bar, menus, buttons, headings and labels – turns ancient; content (inputs, [data-content], .content) stays Hebrew,
   *   and anything in .keep-he (the switch and the way out) stays plain Hebrew always. A tap on ancient text shows the Hebrew. */
  let grants = [];
  const hasGrant = (k) => grants.includes(k);
  const PHN = 'אבגדהוזחטיכלמנסעפצקרשת', FIN = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  function ancient(text) {
    return String(text).replace(/[֑-ׇ]/g, '').replace(/[א-ת]/g, (c) => {
      const i = PHN.indexOf(FIN[c] || c);
      return i < 0 ? c : String.fromCodePoint(0x10900 + i);
    });
  }
  const UI_SEL = 'header, nav, button, label, h1, h2, h3, h4, legend, summary, th, .btn, .tab, [role=tab], [role=menuitem], .ui, .sr-tool, .wheel-item';
  const SKIP_SEL = 'input, textarea, select, [contenteditable], [data-content], .content, .keep-he, script, style';
  const orig = new WeakMap();
  let ancientOn = false, ancientObs = null;
  function ancientNode(t) {
    const p = t.parentElement;
    if (!p || !/[א-ת]/.test(t.data) || p.closest(SKIP_SEL) || !p.closest(UI_SEL)) return;
    orig.set(t, t.data);
    t.data = ancient(t.data);
    p.classList.add('phn');
  }
  function ancientWalk(root) {
    if (root.nodeType === 3) return ancientNode(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const all = []; while (w.nextNode()) all.push(w.currentNode);
    all.forEach(ancientNode);
  }
  function ancientUi() {
    const want = hasGrant('ancient_ui') && !!prefs('me').ancientUi;
    if (want === ancientOn) return;
    ancientOn = want;
    if (want) {
      document.documentElement.classList.add('ancient-ui'); if (!document.getElementById('phn-css')) document.head.append(el('style', { id: 'phn-css' }, ".ancient-ui .phn { font-family: 'Ohel Ivri', var(--font, Rubik), sans-serif; }"));
      ancientWalk(document.body);
      ancientObs = new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') { if (!orig.has(m.target)) ancientNode(m.target); } else m.addedNodes.forEach(ancientWalk); } });
      ancientObs.observe(document.body, { childList: true, subtree: true, characterData: true });
    } else {
      ancientObs?.disconnect(); ancientObs = null;
      document.documentElement.classList.remove('ancient-ui');
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const t = w.currentNode; if (orig.has(t)) { t.data = orig.get(t); orig.delete(t); } }
    }
  }
  /** the way back: ancient letters to Hebrew (the finals return at a word's end) */
  const PHN_RE = /[𐤀-𐤕]/u;
  function unancient(text) {
    const he = String(text).replace(/[𐤀-𐤕]/gu, (c) => PHN[c.codePointAt(0) - 0x10900]);
    return he.replace(/[כמנפצ](?=$|[^א-ת])/g, (c) => ({ 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' })[c]);
  }
  /** what the owner writes while the ancient switch is on goes out in the ancient letters, for everyone to see that way:
   *  every composer (messages, comments, global messages) sends H.outgoing(text) instead of text */
  const outgoing = (text) => (hasGrant('ancient_ui') && prefs('me').ancientUi ? ancient(text) : text);
  // a tap on ancient text, the interface's or a message's, shows the Hebrew it stands for, for a moment
  document.addEventListener('click', (e) => {
    const p = e.target.closest?.('.phn') || (e.target.nodeType === 1 && PHN_RE.test(e.target.textContent || '') && e.target.childElementCount === 0 ? e.target : null);
    if (!p || p.closest('a, button, [role=button], [role=tab], input, textarea')) return;
    const t = [...p.childNodes].find((n) => orig.has(n));
    toast(t ? orig.get(t) : unancient(p.textContent));
  }, true);
  addEventListener('helper:prefs', (e) => { if (!e.detail || e.detail === 'me') ancientUi(); });

  /* ---------- Notifications on this device (Web Push, server/push.ts) ----------
   * await H.push.state()  → 'unsupported' | 'denied' | 'off' | 'on' | 'not-installed' (an iPhone outside the home screen)
   * await H.push.enable() → asks the browser, subscribes this device; true when on.  H.push.disable(), H.push.test() */
  const push = {
    supported: () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    async state() {
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      if (ios && !standalone) return 'not-installed';
      if (!push.supported()) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      const reg = await navigator.serviceWorker.getRegistration();
      return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
    },
    async enable() {
      if (!push.supported()) return false;
      const { key } = await api('/api/push/key');
      if (!key) return false;
      if ((await Notification.requestPermission()) !== 'granted') return false;
      const reg = await navigator.serviceWorker.ready;
      const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4)), (c) => c.charCodeAt(0));
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw }));
      await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
      return true;
    },
    async disable() {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      if (!sub) return;
      await api('/api/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe();
    },
    test: () => api('/api/push/test', { method: 'POST' }),
  };

  window.H = { api, el, toast, me, push, ancient, unancient, outgoing, hasGrant, ancientUi, requireLogin, header, icon, modal, modalFrom, closeModal, back, timeAgo, loadDaemon, prefs, savePrefs, DAEMON_DEFAULTS, sunNow, sunTimes, chooseTheme, isDark, logout, loadOnce };

  /* A person's settings on every page (vision batch 4, item 6; the rules are ai-features' /settings/apply.js). Before the
     page is drawn, the text size and the marks are put on from this device's copy of the prefs, so nothing jumps; then
     apply.js loads and owns them from there (H.applySettings, H.reducedMotion, H.vibrate, H.soundsOn), re-applying when
     the prefs change on another device. Keep this early copy in step with apply.js. */
  (function earlySettings() {
    const d = prefStore.data || {}, a = d.access || {}, l = d.look || {}, m = d.me || {}, root = document.documentElement;
    const text = Math.min(1.6, Math.max(0.85, Number(a.text) || 1));
    if (text !== 1) root.style.fontSize = `${Math.round(text * 100)}%`;
    if (a.spacing === 'wide') root.dataset.spacing = 'wide';
    if (a.font === 'readable') root.dataset.font = 'readable';
    else if (['heebo', 'round', 'serif', 'alef'].includes(l.font)) root.dataset.font = l.font;   // the font chosen, before paint
    if (a.contrast === 'high') root.dataset.contrast = 'high';
    if (a.motion === 'reduce') root.dataset.motion = 'reduce';
    if (/^[a-z0-9-]{1,24}$/.test(l.palette || '')) root.dataset.palette = l.palette;
    if (/^[a-z]{1,16}$/.test(m.religion || '')) root.dataset.religion = m.religion;
    if (l.style === 'serious') root.dataset.style = 'serious';   // מצב רציניים (vision batch 11), before paint
    if (l.pillows === 'keep') root.dataset.pillows = 'keep';
  })();
  if (!embedded) loadOnce('/settings/apply.js').catch(() => { /* the early marks stay */ });
})();
