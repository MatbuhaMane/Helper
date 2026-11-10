/* חדשות: קורא פידים בסגנון Inoreader – מקורות בצד, רשימת כתבות, וקריאה בתוך הממשק (תצוגת קריאה / משובצת). */
(async () => {
  'use strict';
  const { el, api, toast, timeAgo } = H;
  H.header('חדשות', '📰');
  await H.requireLogin();
  const $ = (s) => document.querySelector(s);

  const PREFS_KEY = 'helper.news.prefs';
  let prefs = { unreadOnly: false, cards: false };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch (_) { /* ignore */ }
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) { /* ignore */ } };

  let feeds = [];
  let items = [];
  let errors = [];
  let scope = { type: 'all' }; // {type:'all'} | {type:'folder', folder} | {type:'feed', id} | {type:'starred'}
  let current = null;
  let shown = 60;

  const favicon = (url) => { try { return `https://www.google.com/s2/favicons?sz=32&domain=${new URL(url).hostname}`; } catch (_) { return ''; } };

  /* ---------- sources sidebar ---------- */
  function renderSide() {
    const side = $('#side');
    side.textContent = '';
    const unread = (pred) => items.filter((i) => !i.read && pred(i)).length || '';
    const btn = (label, sc, count, icon) => el('button', {
      class: 'src', 'aria-current': JSON.stringify(sc) === JSON.stringify(scope),
      onclick: () => { scope = sc; shown = 60; load(); side.classList.remove('open'); },
    }, icon || null, el('span', {}, label), el('span', { class: 'n' }, count));
    side.append(btn('כל הכתבות', { type: 'all' }, unread(() => true), '🗞'), btn('שמורים', { type: 'starred' }, '', '⭐'));
    const folders = [...new Set(feeds.map((f) => f.folder))];
    for (const folder of folders) {
      side.append(el('h3', {}, el('button', { class: 'src', style: 'padding:0;font-size:.78rem;color:var(--muted)', onclick: () => { scope = { type: 'folder', folder }; shown = 60; load(); } }, folder)));
      for (const f of feeds.filter((x) => x.folder === folder)) {
        const b = btn(f.title, { type: 'feed', id: f.id }, unread((i) => i.feedId === f.id), el('img', { class: 'fav', src: favicon(f.url), alt: '', loading: 'lazy' }));
        if (errors.includes(f.id)) b.append(el('span', { class: 'err', title: 'המקור לא ענה' }, '⚠'));
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); feedMenu(f); });
        side.append(b);
      }
    }
    side.append(el('button', { class: 'btn ghost small addsrc', onclick: addSource }, '➕ הוספת מקור'),
      el('p', { class: 'muted', style: 'font-size:.75rem;margin:0 10px' }, 'לחיצה ימנית (או לחיצה ארוכה) על מקור – עריכה או הסרה.'));
  }

  async function addSource() {
    const url = prompt('כתובת האתר או ה-RSS (למשל: haaretz.co.il או קישור לפיד):');
    if (!url) return;
    const folder = prompt('לאיזו תיקייה? (למשל: ישראל, עולם, כלכלה, ספורט)', scope.folder || 'שלי') || 'שלי';
    toast('מחפש את הפיד…');
    try {
      const r = await api('/api/news/feeds', { body: { url, folder } });
      toast(`נוסף: ${r.title || r.url}`);
      await loadFeeds();
      load();
    } catch (e) { toast(e.message); }
  }

  async function feedMenu(f) {
    const action = prompt(`"${f.title}"\nהקלד: 1 – שינוי שם, 2 – העברה לתיקייה, 3 – הסרה`);
    if (action === '1') {
      const title = prompt('שם חדש:', f.title);
      if (title) await api('/api/news/feeds/' + f.id, { method: 'PATCH', body: { title } });
    } else if (action === '2') {
      const folder = prompt('תיקייה:', f.folder);
      if (folder) await api('/api/news/feeds/' + f.id, { method: 'PATCH', body: { folder } });
    } else if (action === '3') {
      if (!confirm(`להסיר את "${f.title}"?`)) return;
      await api('/api/news/feeds/' + f.id, { method: 'DELETE' });
    } else return;
    await loadFeeds();
    renderSide();
  }

  /* ---------- item list ---------- */
  function scopeTitle() {
    if (scope.type === 'starred') return '⭐ שמורים';
    if (scope.type === 'folder') return scope.folder;
    if (scope.type === 'feed') return feeds.find((f) => f.id === scope.id)?.title || '';
    return 'כל הכתבות';
  }

  function visible() {
    return prefs.unreadOnly && scope.type !== 'starred' ? items.filter((i) => !i.read || i === current) : items;
  }

  function renderItems() {
    $('#listTitle').textContent = scopeTitle();
    const box = $('#items');
    box.className = 'items' + (prefs.cards ? ' cards' : '');
    box.textContent = '';
    const list = visible();
    if (!list.length) { box.append(el('p', { class: 'more' }, scope.type === 'starred' ? 'עוד לא שמרתם כתבות. לחצו ⭐ בכתבה כדי לשמור.' : 'אין כתבות חדשות 🎉')); return; }
    for (const it of list.slice(0, shown)) {
      box.append(el('button', { class: 'it' + (it.read ? ' read' : ''), 'aria-current': it === current, 'data-id': it.id, onclick: () => open(it) },
        el('div', {},
          el('div', { class: 't', dir: 'auto' }, it.title),
          el('div', { class: 'meta' }, it.starred ? el('span', { class: 'star' }, '★') : null, el('span', {}, it.feed), el('span', {}, '·'), el('span', {}, timeAgo(it.date)))),
        el('div', { class: 'thumb', style: it.image ? `background-image:url("${encodeURI(it.image)}")` : 'display:none' })));
    }
    if (list.length > shown) box.append(el('button', { class: 'btn ghost', style: 'margin:12px auto;display:block', onclick: () => { shown += 60; renderItems(); } }, `עוד ${list.length - shown} כתבות`));
  }

  async function load() {
    renderSide();
    $('#items').textContent = '';
    $('#items').append(el('div', { class: 'loading', style: 'padding:20px' }, el('span', { class: 'spinner' }), 'טוען כתבות…'));
    try {
      if (scope.type === 'starred') {
        items = (await api('/api/news/starred')).items;
      } else {
        const p = new URLSearchParams();
        if (scope.type === 'folder') p.set('folder', scope.folder);
        if (scope.type === 'feed') p.set('feed', scope.id);
        const r = await api('/api/news/items?' + p);
        items = r.items;
        errors = r.errors;
      }
    } catch (e) { items = []; toast(e.message); }
    renderSide();
    renderItems();
  }

  async function loadFeeds() { feeds = (await api('/api/news/feeds')).feeds; }

  async function mark(ids, patch) {
    try { await api('/api/news/state', { body: { ids, ...patch } }); } catch (e) { toast(e.message); }
  }

  /* ---------- reader ---------- */
  async function open(it, mode = 'reader') {
    current = it;
    if (!it.read) { it.read = true; mark([it.id], { read: true }); }
    renderItems();
    renderSide();
    const r = $('#reader');
    r.classList.add('open');
    r.textContent = '';
    const starBtn = el('button', { class: 'btn ghost small', onclick: () => {
      it.starred = !it.starred;
      mark([it.id], { starred: it.starred, snapshot: it.starred ? { title: it.title, link: it.link, feed: it.feed, feedId: it.feedId, date: it.date, image: it.image, summary: it.summary } : undefined });
      starBtn.textContent = it.starred ? '★ שמור' : '☆ שמור';
      renderItems();
    } }, it.starred ? '★ שמור' : '☆ שמור');
    const sumBox = el('div');
    const sumBtn = el('button', { class: 'btn ghost small', onclick: async () => {
      sumBtn.disabled = true;
      sumBox.textContent = '';
      sumBox.append(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'מסכם…'));
      try {
        const s = await api('/api/news/summary', { body: { url: it.link } });
        sumBox.textContent = '';
        sumBox.append(el('div', { class: 'notice summary' }, el('strong', {}, '✨ בקצרה'), el('ul', {}, s.bullets.map((b) => el('li', {}, b)))));
      } catch (e) { sumBox.textContent = ''; toast(e.message); sumBtn.disabled = false; }
    } }, '✨ סכם לי');
    r.append(el('div', { class: 'rbar' },
      el('button', { class: 'btn ghost small back-mobile', onclick: () => r.classList.remove('open') }, '→ חזרה'),
      el('button', { class: 'btn ghost small', 'aria-pressed': mode === 'reader', onclick: () => open(it, 'reader') }, '📄 תצוגת קריאה'),
      el('button', { class: 'btn ghost small', 'aria-pressed': mode === 'embed', onclick: () => open(it, 'embed') }, '🖼 האתר המקורי בתוך הדף'),
      starBtn, sumBtn,
      el('a', { class: 'btn ghost small', href: it.link, target: '_blank', rel: 'noopener' }, '↗ פתח באתר'),
      el('button', { class: 'btn ghost small', onclick: () => share(it) }, '📤 שתף')));
    r.scrollTop = 0;

    if (mode === 'embed') {
      r.append(el('p', { class: 'muted', style: 'font-size:.8rem' }, 'חלק מהאתרים חוסמים הצגה בתוך דף אחר. אם הדף ריק – השתמשו בתצוגת קריאה או פתחו באתר.'),
        el('iframe', { src: it.link, sandbox: 'allow-scripts allow-same-origin allow-popups', referrerpolicy: 'no-referrer', title: it.title }));
      return;
    }
    const body = el('div');
    r.append(el('h2', { dir: 'auto' }, it.title), el('div', { class: 'byline' }, `${it.feed} · ${timeAgo(it.date)}`), sumBox, body);
    body.append(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'טוען כתבה…'));
    try {
      const a = await api('/api/news/article?url=' + encodeURIComponent(it.link));
      if (current !== it) return;
      body.textContent = '';
      body.append(el('div', { class: 'content', dir: a.dir || 'auto', html: a.content }));
    } catch (e) {
      if (current !== it) return;
      body.textContent = '';
      body.append(it.summary ? el('p', { class: 'content', dir: 'auto' }, it.summary) : null,
        el('p', { class: 'notice warn' }, e.message + ' ', el('a', { href: it.link, target: '_blank', rel: 'noopener' }, 'פתח באתר ↗')));
    }
  }

  async function share(it) {
    try {
      if (navigator.share) await navigator.share({ title: it.title, url: it.link });
      else { await navigator.clipboard.writeText(`${it.title}\n${it.link}`); toast('הקישור הועתק'); }
    } catch (_) { /* cancelled */ }
  }

  function step(dir) {
    const list = visible();
    const idx = current ? list.indexOf(current) : -1;
    const next = list[Math.max(0, Math.min(list.length - 1, idx + dir))];
    if (next) { open(next); document.querySelector(`.it[data-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest' }); }
  }

  /* ---------- toolbar & keys ---------- */
  $('#unreadOnly').checked = prefs.unreadOnly;
  $('#unreadOnly').addEventListener('change', (e) => { prefs.unreadOnly = e.target.checked; savePrefs(); renderItems(); });
  $('#viewBtn').addEventListener('click', () => { prefs.cards = !prefs.cards; savePrefs(); renderItems(); });
  $('#refresh').addEventListener('click', load);
  $('#menuBtn').addEventListener('click', () => $('#side').classList.toggle('open'));
  $('#markAll').addEventListener('click', async () => {
    const ids = visible().filter((i) => !i.read).map((i) => i.id);
    if (!ids.length) return;
    visible().forEach((i) => { i.read = true; });
    renderItems();
    renderSide();
    for (let i = 0; i < ids.length; i += 500) await mark(ids.slice(i, i + 500), { read: true });
    toast(`${ids.length} כתבות סומנו כנקראו`);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'j') step(1);
    if (e.key === 'k') step(-1);
    if (e.key === 'o' && current) window.open(current.link, '_blank', 'noopener');
    if (e.key === 's' && current) document.querySelector('.rbar button:nth-of-type(4)')?.click();
  });

  await loadFeeds();
  load();
  setInterval(() => { if (!document.hidden && scope.type !== 'starred') load(); }, 10 * 60 * 1000);
})();
