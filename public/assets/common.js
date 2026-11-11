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

  /* ---------- Light or dark: the system's choice until the person picks one (kept per person, like every pref) ---------- */
  const uiPrefs = prefs('ui', { theme: 'auto' });
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (uiPrefs.theme === 'auto' ? systemDark.matches : uiPrefs.theme === 'dark');
  function applyTheme() {
    const root = document.documentElement;
    if (uiPrefs.theme === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = uiPrefs.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = isDark() ? '#1d1a12' : '#efeee6';
    document.querySelectorAll('.theme-switch').forEach((b) => { b.setAttribute('aria-checked', String(isDark())); b.title = isDark() ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'; });
  }
  applyTheme();
  systemDark.addEventListener?.('change', applyTheme);
  window.addEventListener('helper:prefs', (e) => { if (e.detail === 'ui') applyTheme(); });
  function themeSwitch() {
    const b = el('button', { class: 'theme-switch', type: 'button', role: 'switch', 'aria-label': 'מצב כהה',
      html: '<span class="knob"></span><svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg><svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/></svg>' });
    b.addEventListener('click', () => {
      document.documentElement.classList.add('theme-fade');
      uiPrefs.theme = isDark() ? 'light' : 'dark';
      savePrefs('ui');
      applyTheme();
      setTimeout(() => document.documentElement.classList.remove('theme-fade'), 500);
    });
    // a long press (or right click) goes back to following the system
    let t;
    b.addEventListener('pointerdown', () => { t = setTimeout(() => { uiPrefs.theme = 'auto'; savePrefs('ui'); applyTheme(); toast('הצבעים יתאימו עכשיו להגדרה של המכשיר'); t = 'done'; }, 700); });
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
  };
  // SVG needs its namespace, so it's parsed from markup rather than built with createElement.
  const icon = (name, cls = 'icon') => {
    const t = document.createElement('template');
    t.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
    return t.content.firstChild;
  };
  const NAV = [
    { href: '/', label: 'בית', icon: 'home' },
    { href: '/groceries/', label: 'קניות', icon: 'cart' },
    { href: '/news/', label: 'חדשות', icon: 'news' },
    { href: '/songs/', label: 'שירון', icon: 'music' },
    { href: '/mail/', label: 'מייל', icon: 'mail' },
    { href: '/pc/', label: 'מחשב', icon: 'pc' },
  ];
  const BRAND = '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#c2b04e"/><path d="M7 20c3-1.5 5.5-1.5 9 0s6 1.5 9 0" fill="none" stroke="#55622f" stroke-width="2.2" stroke-linecap="round"/><path d="M9 14.5c2.4-1.2 4.4-1.2 7 0s4.6 1.2 7 0" fill="none" stroke="#2e2a1e" stroke-width="1.8" stroke-linecap="round" opacity=".55"/></svg>';

  /** The app shell: a top bar on every page (brand, navigation on PC, the user), and a tab bar at the bottom on phones. */
  function header(title) {
    const here = location.pathname.replace(/index\.html$/, '');
    const current = (href) => (href === '/' ? here === '/' : here.startsWith(href));
    const bar = el('header', { class: 'appbar' },
      el('a', { class: 'brand', href: '/', 'aria-label': 'העוזר המשפחתי, לדף הבית' }, el('span', { html: BRAND }), el('span', { class: 'brand-text' }, 'העוזר המשפחתי')),
      title ? el('h1', { class: 'page-title' }, title) : null,
      el('nav', { class: 'topnav', 'aria-label': 'ניווט ראשי', hidden: true }, NAV.map((n) =>
        el('a', { class: 'ink-nav', href: n.href, 'aria-current': current(n.href) ? 'page' : null, 'data-guide': 'nav-' + n.icon, 'data-guide-label': 'מעבר ל' + n.label }, n.label))),
      el('span', { class: 'spacer' }),
      themeSwitch(),
      el('button', { class: 'userchip', id: 'userchip', onclick: userMenu, hidden: true }, '…'));
    const tabs = el('nav', { class: 'tabbar', 'aria-label': 'ניווט', hidden: true }, NAV.map((n) =>
      el('a', { href: n.href, 'aria-current': current(n.href) ? 'page' : null, 'data-guide': 'tab-' + n.icon, 'data-guide-label': 'מעבר ל' + n.label }, icon(n.icon), el('span', {}, n.label))));
    document.body.prepend(bar);
    document.body.append(tabs);
    me().then((r) => {
      if (!r.user) return;
      bar.querySelector('.topnav').hidden = false;
      tabs.hidden = false;
      const chip = document.getElementById('userchip');
      chip.hidden = false;
      chip.textContent = (r.user.name || r.user.email).split(' ')[0];
      if (!r.offline) loadMusic();
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
  /** The music player lives in the menu of every screen (its script and styles load after the menu is drawn). */
  function loadMusic() {
    if (document.querySelector('script[src^="/assets/music.js"]')) return;
    document.head.append(el('link', { rel: 'stylesheet', href: '/assets/music.css' }));
    document.head.append(el('script', { src: '/assets/music.js' }));
  }
  function autoDaemon() {
    if (document.body.dataset.daemon === 'hero' || document.body.dataset.daemon === 'off') return;
    me().then((r) => {
      if (!r.user || r.offline) return;
      if (prefs('daemon', DAEMON_DEFAULTS, 'helper.daemon.prefs').follow) loadDaemon().then((d) => d.mount());
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoDaemon);
  else setTimeout(autoDaemon);

  window.H = { api, el, toast, me, requireLogin, header, icon, modal, closeModal, timeAgo, loadDaemon, prefs, savePrefs, DAEMON_DEFAULTS };
})();
