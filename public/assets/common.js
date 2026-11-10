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
      return r;
    });
  }

  /** Call at the top of each app page: redirects to the hub sign-in when signed out. */
  async function requireLogin() {
    const r = await me();
    if (!r.user) { location.href = '/?next=' + encodeURIComponent(location.pathname); throw new Error('redirect'); }
    return r;
  }

  function header(title, icon, extra) {
    const bar = el('header', { class: 'topbar' },
      el('h1', {}, el('a', { class: 'home', href: '/', title: 'לדף הבית', 'aria-label': 'לדף הבית' }, '🏠'), `${icon} ${title}`),
      el('div', { class: 'row' }, extra || null, el('button', { class: 'userchip', id: 'userchip', onclick: userMenu }, '…')));
    document.body.prepend(bar);
    me().then((r) => { if (r.user) document.getElementById('userchip').textContent = (r.user.name || r.user.email).split(' ')[0] + ' ▾'; });
    return bar;
  }

  async function userMenu() {
    if (!confirm('להתנתק מהעוזר?')) return;
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    try { localStorage.removeItem('helper.me'); } catch (_) { /* ignore */ }
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
  function autoDaemon() {
    if (document.body.dataset.daemon === 'hero' || document.body.dataset.daemon === 'off') return;
    me().then((r) => { if (r.user && !r.offline) loadDaemon().then((d) => d.mount()); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoDaemon);
  else setTimeout(autoDaemon);

  window.H = { api, el, toast, me, requireLogin, header, modal, closeModal, timeAgo, loadDaemon };
})();
