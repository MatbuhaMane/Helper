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
    lens: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3 20.5 20.5"/>',
    torah: '<rect x="3.5" y="4" width="3.5" height="16" rx="1.75"/><rect x="17" y="4" width="3.5" height="16" rx="1.75"/><path d="M5.25 1.8v2.2M5.25 20v2.2M18.75 1.8v2.2M18.75 20v2.2"/><path d="M7 6h10v12H7z"/><path d="M9.6 9.5h4.8M9.6 12h4.8M9.6 14.5h3.2"/>',
    note: '<path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 5.5 20V4a.5.5 0 0 1 .5-.5z"/><path d="M15 3.5V8h4M9 12h6M9 15.5h6"/>',
    calc: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><rect x="8" y="5.5" width="8" height="3.5" rx="1"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01" stroke-width="2.4"/>',
    weather: '<circle cx="9" cy="9" r="3.5"/><path d="M9 2.5v1.5M2.5 9H4M4.4 4.4l1 1M13.6 4.4l-1 1"/><path d="M8 20h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.3 1.2A3 3 0 0 0 8 20z"/>',
    fridge: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M6 10h12M9 6v2M9 13v3"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
    diet: '<path d="M12 7.5c-1.6-1.3-5.5-1.6-6.8 1.8-1.3 3.4.4 8.5 3.4 10.3 1.3.8 2.4.4 3.4.1 1 .3 2.1.7 3.4-.1 3-1.8 4.7-6.9 3.4-10.3-1.3-3.4-5.2-3.1-6.8-1.8z"/><path d="M12 7.5c0-2 .8-3.4 2.6-4.2"/><path d="M12.4 5.6c1.6-.3 2.9.2 3.6 1.3-1.6.4-2.9 0-3.6-1.3z"/>',
    keto: '<path d="M12 3c4 3 6.5 6.5 6.5 10a6.5 6.5 0 0 1-13 0C5.5 9.5 8 6 12 3z"/><circle cx="12" cy="14" r="2.6"/>',
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
  function closeMenu() {
    if (!openMenuEl) return;
    openMenuEl.btn.setAttribute('aria-expanded', 'false');
    openMenuEl.box.remove();
    openMenuEl = null;
  }
  async function toggleMenu(btn, kind, phone) {
    if (openMenuEl?.btn === btn) return closeMenu();
    closeMenu();
    try { await loadOnce('/assets/apps.js'); } catch (_) { location.href = kind === 'tools' ? '/tools/' : '/'; return; }
    const here = location.pathname;
    const items = (window.H.APPS || []).filter((a) => (kind === 'parts' ? PARTS.includes(a.href) : !a.fixed && !PARTS.includes(a.href)));
    const link = (a) => el('li', {}, el('a', { href: a.href, 'aria-current': here.startsWith(a.href.split('#')[0]) && a.href !== '/' ? 'page' : null }, icon(a.ic), el('span', {}, a.name)));
    const box = el('div', { class: 'navmenu' + (phone ? ' navmenu-phone' : ''), id: 'navmenu-' + kind },
      el('ul', {}, items.map(link)),
      kind === 'tools' ? el('a', { class: 'navmenu-all', href: '/tools/' }, 'כל הכלים, וסידור ›') : null);
    if (!phone) {
      const r = btn.getBoundingClientRect();
      box.style.top = Math.round(r.bottom + 6) + 'px';
      box.style.insetInlineStart = Math.round(document.documentElement.dir === 'rtl' || getComputedStyle(document.documentElement).direction === 'rtl' ? innerWidth - r.right : r.left) + 'px';
    }
    document.body.append(box);
    btn.setAttribute('aria-expanded', 'true');
    openMenuEl = { btn, box };
    box.querySelector('a')?.focus({ preventScroll: true });
  }
  addEventListener('click', (e) => { if (openMenuEl && !openMenuEl.box.contains(e.target) && !openMenuEl.btn.contains(e.target)) closeMenu(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenuEl) { const b = openMenuEl.btn; closeMenu(); b.focus(); } });
  addEventListener('resize', closeMenu);
  // the family's logo (in the old Hebrew script), drawn in the ink of the theme
  const BRAND = '<svg class="brand-mark" viewBox="0 0 1082 340" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M1017.0 331.2Q1012.0 334.1 1010.4 334.1Q1008.9 334.0 1007.9 331.5Q1006.9 329.0 1006.7 324.5Q1006.4 320.0 1007.2 314.0Q1007.9 308.0 1013.6 295.0Q1019.2 282.0 1023.9 266.0Q1028.5 250.0 1035.7 215.0Q1042.9 180.0 1044.2 169.0Q1045.4 158.0 1045.3 147.5Q1045.2 137.0 1041.5 108.5Q1037.9 80.0 1037.8 72.5Q1037.7 65.0 1038.6 61.5Q1039.5 58.0 1037.3 57.8Q1035.0 57.5 1030.5 59.6Q1026.0 61.6 998.2 78.8Q970.4 96.0 966.9 97.5Q963.3 99.0 958.7 99.6Q954.0 100.3 951.0 99.6Q948.0 98.9 945.3 96.4Q942.6 94.0 934.4 76.5Q926.2 59.0 923.6 55.9Q921.0 52.9 919.5 52.5Q918.0 52.2 908.2 58.6Q898.4 65.0 879.7 81.7Q861.0 98.4 854.0 103.5Q847.0 108.5 843.0 104.3Q839.0 100.0 833.2 91.5Q827.3 83.0 818.1 66.0Q808.9 49.0 805.9 39.5Q802.9 30.0 802.0 23.5Q801.1 17.0 801.6 13.0Q802.2 9.0 803.6 7.4Q805.0 5.8 807.0 5.7Q809.0 5.6 813.0 8.8Q816.9 12.0 824.6 21.5Q832.2 31.0 839.9 43.0Q847.6 55.0 850.3 56.7Q853.0 58.5 856.0 57.8Q859.0 57.1 864.0 54.1Q869.0 51.1 894.5 32.5Q920.0 13.9 928.5 9.4Q937.1 5.0 942.0 4.9Q947.0 4.8 949.0 6.5Q951.0 8.2 952.0 11.6Q953.1 15.0 954.1 35.0Q955.1 55.0 956.6 57.7Q958.0 60.4 960.0 61.3Q962.0 62.3 969.5 59.8Q977.0 57.2 988.5 51.3Q1000.0 45.3 1016.5 35.1Q1033.0 25.0 1047.1 15.0Q1061.2 5.0 1064.1 4.7Q1067.0 4.5 1068.6 5.7Q1070.2 7.0 1071.8 11.0Q1073.4 15.0 1074.9 28.5Q1076.3 42.0 1076.3 111.5Q1076.2 181.0 1074.5 194.5Q1072.8 208.0 1068.7 224.5Q1064.6 241.0 1053.7 271.0Q1042.8 301.0 1039.9 306.5Q1037.1 312.0 1033.5 316.7Q1030.0 321.3 1026.0 324.8Q1022.0 328.2 1017.0 331.2ZM195.7 293.1Q162.0 331.2 138.0 331.5Q114.0 331.8 112.0 330.9Q110.0 330.0 74.2 248.0Q38.4 166.0 27.3 138.5Q16.1 111.0 10.6 93.0Q5.0 75.0 5.0 59.2Q5.0 43.4 7.5 45.7Q10.0 48.0 58.7 121.0Q107.4 194.0 121.4 213.5Q135.3 233.0 142.7 241.8Q150.0 250.6 158.5 242.3Q167.0 234.0 195.5 203.0Q224.0 171.9 233.0 163.2Q242.0 154.5 250.0 148.6Q258.0 142.7 259.5 142.4Q261.0 142.1 263.0 142.7Q265.0 143.4 274.0 150.5Q283.0 157.6 295.9 171.8Q308.9 186.0 311.6 190.5Q314.3 195.0 314.9 197.5Q315.4 200.0 317.1 200.0Q318.9 200.0 329.0 190.5Q339.1 181.0 377.1 138.0Q415.1 95.0 438.6 70.9Q462.0 46.8 471.0 39.5Q480.0 32.2 489.0 26.9Q498.0 21.7 507.5 19.1Q517.0 16.6 521.1 17.8Q525.2 19.0 525.6 21.0Q526.0 23.0 524.0 26.5Q522.1 30.0 493.0 70.5Q464.0 111.0 418.1 172.0Q372.3 233.0 359.9 248.5Q347.5 264.0 339.4 272.5Q331.4 281.0 327.2 283.9Q323.0 286.9 319.0 287.6Q315.0 288.3 307.5 287.8Q300.0 287.2 298.0 285.8Q296.0 284.4 293.3 280.7Q290.6 277.0 280.3 252.1Q270.0 227.1 268.5 224.5Q267.0 221.9 265.5 221.5Q264.0 221.2 246.7 238.1Q229.5 255.0 195.7 293.1ZM844.5 324.4Q836.0 328.2 831.0 328.1Q826.0 328.1 820.5 326.0Q815.0 324.0 808.5 318.8Q802.0 313.6 791.7 297.8Q781.3 282.0 768.3 257.0Q755.3 232.0 751.6 227.7Q748.0 223.4 743.5 220.1Q739.0 216.8 732.5 215.3Q726.0 213.7 718.0 214.0Q710.0 214.3 666.0 222.9Q622.0 231.5 622.8 229.2Q623.7 227.0 632.8 220.3Q642.0 213.6 675.5 195.2Q709.0 176.8 713.0 173.2Q717.0 169.6 718.1 167.3Q719.2 165.0 719.6 162.5Q720.0 160.0 718.6 152.5Q717.3 145.0 713.8 134.0Q710.3 123.0 703.3 107.5Q696.2 92.0 691.1 83.7Q686.0 75.3 683.5 72.5Q681.0 69.8 679.5 69.2Q678.0 68.7 675.0 69.2Q672.0 69.8 662.0 73.6Q652.0 77.4 584.6 106.2Q517.3 135.0 508.6 137.7Q500.0 140.4 499.9 138.7Q499.8 137.0 510.9 125.8Q522.0 114.5 530.0 108.0Q538.0 101.5 549.0 94.3Q560.0 87.2 578.5 76.9Q597.0 66.6 612.0 59.3Q627.0 52.0 648.0 43.6Q669.0 35.3 685.5 31.5Q702.0 27.7 706.5 27.5Q711.0 27.4 712.3 29.2Q713.7 31.0 731.7 82.0Q749.7 133.0 763.7 167.5Q777.6 202.0 790.1 228.5Q802.6 255.0 808.0 264.5Q813.5 274.0 818.7 281.3Q824.0 288.6 826.5 290.5Q829.0 292.3 830.5 292.5Q832.0 292.7 841.0 290.7Q850.0 288.8 862.5 283.9Q875.0 279.0 906.5 263.8Q938.0 248.5 942.0 246.9Q946.0 245.3 947.1 245.7Q948.3 246.0 947.6 248.3Q947.0 250.7 938.5 259.2Q930.0 267.8 916.4 278.4Q902.7 289.0 887.4 299.4Q872.0 309.7 862.5 315.2Q853.0 320.7 844.5 324.4Z"/></svg>';

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
    me().then((r) => {
      if (!r.user) return;
      bar.querySelector('.topnav').hidden = false;
      tabs.hidden = false;
      const chip = document.getElementById('userchip');
      chip.hidden = false;
      chip.querySelector('.userchip-name').textContent = r.user.he_name || (r.user.name || r.user.email).split(' ')[0];
      // the app lock (server/lock.ts): locked already – the lock screen; a lock set – the open padlock in the bar, to lock now
      if (r.locked) showLock('app');
      if (r.appLock && r.appLock !== 'off' && !embedded) {
        chip.before(el('button', { type: 'button', class: 'navlock', title: 'לנעול את האוהל', 'aria-label': 'לנעול את האוהל', onclick: async () => {
          try { await api('/api/lock/lock', { method: 'POST' }); } catch (_) { /* the screen locks anyway */ }
          showLock('app', true);
        } }, icon('unlocked')));
      }
      // the family vault (data-vault): no player, no capture – nothing from outside runs next to the documents
      const vault = document.body.dataset.vault === '1';
      if (!r.offline && !embedded && !vault) loadMusic();
      if (!r.offline && !vault) loadCapture();
      if (!r.offline && !vault && !embedded) loadOnce('/assets/messages.js').catch(() => {});   // the owner's messages to everyone
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

  window.H = { api, el, toast, me, requireLogin, header, icon, modal, closeModal, timeAgo, loadDaemon, prefs, savePrefs, DAEMON_DEFAULTS, sunNow, sunTimes, chooseTheme, isDark, logout, loadOnce };

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
    else if (['heebo', 'round', 'serif'].includes(l.font)) root.dataset.font = l.font;   // the font chosen, before paint
    if (a.contrast === 'high') root.dataset.contrast = 'high';
    if (a.motion === 'reduce') root.dataset.motion = 'reduce';
    if (/^[a-z0-9-]{1,24}$/.test(l.palette || '')) root.dataset.palette = l.palette;
    if (/^[a-z]{1,16}$/.test(m.religion || '')) root.dataset.religion = m.religion;
  })();
  if (!embedded) loadOnce('/settings/apply.js').catch(() => { /* the early marks stay */ });
})();
