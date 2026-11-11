/* חדשות – עיתון: מקורות בצד (סינון לפי שפה, ארץ וסוג), עמוד כתבות בעימוד של עיתון עם דפדוף,
 * סינון לפי זמן, סוג, שפה ואיכות, דירוג איכות ומהימנות לכל מקור, חיפוש (גם בעבר), כתבה שנפתחת בהיפוך כרטיס,
 * תרגום לעברית וסיכום. ההעדפות והסינונים נשמרים לכל אדם ועוברים איתו בין המכשירים. */
(async () => {
  'use strict';
  const { el, api, toast, modal, closeModal, timeAgo } = H;
  H.header('חדשות', '📰');
  await H.requireLogin();
  const $ = (s) => document.querySelector(s);
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Per person, synced through the server (the old per-device copy is carried over once).
  const prefs = H.prefs('news', {
    unreadOnly: false, sideLang: [], sideCountry: [], sideKind: [],
    range: 'all', kinds: [], langs: [], minQ: 0, sort: 'date',
  }, 'helper.news.prefs');
  const savePrefs = () => H.savePrefs('news');

  const LANG = { he: 'עברית', ar: 'ערבית', en: 'אנגלית', fr: 'צרפתית', de: 'גרמנית', ru: 'רוסית', es: 'ספרדית' };
  const KIND = { web: 'אתרים', telegram: 'טלגרם', facebook: 'פייסבוק' };
  const CATEGORY = { editorial: 'מערכת חדשות', official: 'גוף רשמי', journalist: 'ערוץ של עיתונאי', aggregator: 'ערוץ מבזקים לא רשמי', activist: 'רשת עם אג׳נדה' };
  const QUALITY = { 5: 'מצוין – מערכת עם סטנדרטים מחמירים ותיקונים', 4: 'טוב מאוד – מערכת חדשות מבוססת', 3: 'סביר – גוף רשמי או מערכת מעורבת', 2: 'לא מאומת – מהיר, כדאי לבדוק לפני שסומכים', 1: 'חלש – ידוע בפרסומים לא נכונים' };
  const RANGES = { today: ['היום', null], day: ['24 שעות', 1], week: ['שבוע', 7], all: ['הכל', null] };

  let feeds = [];
  let items = [];
  let errors = [];
  let scope = { type: 'all' }; // {type:'all'} | {type:'folder', folder} | {type:'feed', id} | {type:'starred'}
  let page = 0;
  let query = '';
  let history = null; // results from the past, when the "בעבר" switch is on
  let current = null;

  const favicon = (url) => { try { return `https://www.google.com/s2/favicons?sz=32&domain=${new URL(url).hostname}`; } catch (_) { return ''; } };
  const feedOf = (it) => feeds.find((f) => f.id === it.feedId);
  const stars = (q) => '★'.repeat(q || 0) + '☆'.repeat(5 - (q || 0));
  const TG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 3.6 2.9 10.8c-1.3.5-1.3 1.2-.2 1.6l4.7 1.5 1.8 5.6c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.4-1.5ZM8.6 13.5l9.8-6.2c.5-.3.9-.1.5.2l-8.4 7.6-.3 3.6-1.6-5.2Z"/></svg>';
  const srcIcon = (f) => (f?.kind === 'telegram' ? el('span', { class: 'fav tg', html: TG }) : el('img', { class: 'fav', src: favicon(f?.url || ''), alt: '', loading: 'lazy' }));

  /* ================= side: filters and sources ================= */
  const sideMatch = (f) => (!prefs.sideLang.length || prefs.sideLang.includes(f.lang)) && (!prefs.sideCountry.length || prefs.sideCountry.includes(f.country || '')) && (!prefs.sideKind.length || prefs.sideKind.includes(f.kind));
  const activeFeeds = () => feeds.filter(sideMatch);

  function chipGroup(label, values, chosen, nameOf, onToggle) {
    if (values.length < 2) return null;
    return el('div', { class: 'fgroup' }, el('span', { class: 'flabel' }, label),
      el('div', { class: 'fchips' }, values.map((v) => el('button', { class: 'fchip', 'aria-pressed': String(chosen.includes(v)), onclick: () => onToggle(v) }, nameOf(v)))));
  }
  const toggleIn = (list, v) => { const i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v); };

  function renderSide() {
    const side = $('#side');
    side.textContent = '';
    const uniq = (k) => [...new Set(feeds.map((f) => f[k]).filter(Boolean))];
    const sideFiltered = prefs.sideLang.length + prefs.sideCountry.length + prefs.sideKind.length;
    const changeSide = (fn) => () => { fn(); savePrefs(); page = 0; renderSide(); render(); };
    side.append(
      el('div', { class: 'side-head' }, el('h2', {}, 'המקורות'), sideFiltered ? el('button', { class: 'link', onclick: changeSide(() => { prefs.sideLang = []; prefs.sideCountry = []; prefs.sideKind = []; }) }, 'נקה סינון') : null),
      el('div', { class: 'side-filters' },
        chipGroup('שפה', uniq('lang'), prefs.sideLang, (v) => LANG[v] || v, (v) => changeSide(() => toggleIn(prefs.sideLang, v))()),
        chipGroup('ארץ', uniq('country'), prefs.sideCountry, (v) => v, (v) => changeSide(() => toggleIn(prefs.sideCountry, v))()),
        chipGroup('סוג', uniq('kind'), prefs.sideKind, (v) => KIND[v] || v, (v) => changeSide(() => toggleIn(prefs.sideKind, v))())));

    const active = new Set(activeFeeds().map((f) => f.id));
    const unread = (pred) => items.filter((i) => !i.read && active.has(i.feedId) && pred(i)).length || '';
    // Saved articles come from their own list; everything else is filtered from what is loaded.
    const go = (sc) => () => { const reload = sc.type === 'starred' || scope.type === 'starred'; scope = sc; page = 0; closeSide(); if (reload) load(); else { render(); renderSide(); } };
    const btn = (label, sc, count, icon) => el('button', { class: 'src', 'aria-current': String(JSON.stringify(sc) === JSON.stringify(scope)), onclick: go(sc) },
      icon || null, el('span', { class: 'src-name' }, label), el('span', { class: 'n' }, count));
    side.append(el('nav', { class: 'side-nav' }, btn('כל הכתבות', { type: 'all' }, unread(() => true), el('span', { class: 'ico' }, '🗞')), btn('שמורים', { type: 'starred' }, '', el('span', { class: 'ico' }, '⭐'))));

    const shown = activeFeeds();
    const folders = [...new Set(shown.map((f) => f.folder))];
    for (const folder of folders) {
      side.append(el('h3', {}, el('button', { class: 'folder', 'aria-current': String(scope.type === 'folder' && scope.folder === folder), onclick: go({ type: 'folder', folder }) }, folder)));
      for (const f of shown.filter((x) => x.folder === folder)) {
        const b = btn(f.title, { type: 'feed', id: f.id }, unread((i) => i.feedId === f.id), srcIcon(f));
        b.insertBefore(el('span', { class: 'q', title: `איכות ומהימנות: ${QUALITY[f.quality] || ''}` }, '●'.repeat(f.quality || 0)), b.querySelector('.n'));
        if (errors.includes(f.id)) b.append(el('span', { class: 'err', title: 'המקור לא ענה' }, '⚠'));
        const more = el('button', { class: 'mini src-more', 'aria-label': `הגדרות ${f.title}`, title: 'עריכה', onclick: (e) => { e.stopPropagation(); editSource(f); } }, '⋯');
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); editSource(f); });
        side.append(el('div', { class: 'src-row' }, b, more));
      }
    }
    if (!shown.length) side.append(el('p', { class: 'muted side-note' }, 'אין מקורות שמתאימים לסינון.'));
    side.append(el('button', { class: 'btn ghost small addsrc', onclick: addSource }, '➕ הוספת מקור'),
      el('p', { class: 'muted side-note' }, 'הדירוג (●) הוא הערכה שלנו לאיכות ולמהימנות לפי סטנדרטים עריכתיים, אחיד לכל צד. אפשר לשנות אותו במקור (⋯).'));
  }

  function closeSide() { $('#side').classList.remove('open'); $('#sideShade').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); }

  async function addSource() {
    const url = el('input', { type: 'text', dir: 'ltr', placeholder: 'haaretz.co.il · קישור ל-RSS · @channel בטלגרם', style: 'width:100%' });
    const folders = [...new Set(feeds.map((f) => f.folder))];
    const folder = el('input', { type: 'text', list: 'folderList', value: scope.folder || 'שלי' });
    const go = el('button', { class: 'btn primary', onclick: async () => {
      if (!url.value.trim()) return toast('כתבו כתובת אתר או שם ערוץ');
      go.disabled = true; go.textContent = 'מחפש…';
      try {
        const r = await api('/api/news/feeds', { body: { url: url.value.trim(), folder: folder.value.trim() || 'שלי' } });
        closeModal();
        toast(`נוסף: ${r.title || r.url}`);
        await loadFeeds();
        load();
      } catch (e) { toast(e.message); go.disabled = false; go.textContent = 'הוספה'; }
    } }, 'הוספה');
    modal(el('h3', {}, 'הוספת מקור'),
      el('label', { class: 'field' }, el('span', {}, 'אתר, פיד RSS או ערוץ טלגרם ציבורי'), url),
      el('label', { class: 'field' }, el('span', {}, 'תיקייה'), folder, el('datalist', { id: 'folderList' }, folders.map((f) => el('option', { value: f })))),
      el('p', { class: 'muted', style: 'font-size:.85rem' }, 'טלגרם: כתבו @שם_הערוץ או קישור t.me. פייסבוק לא מאפשר לקרוא עמודים מבחוץ, אז עדיף את האתר או ערוץ הטלגרם של אותו גוף.'),
      el('div', { class: 'row' }, go));
    url.focus();
  }

  function editSource(f) {
    const title = el('input', { type: 'text', value: f.title });
    const folder = el('input', { type: 'text', value: f.folder, list: 'folderList2' });
    const lang = el('select', {}, Object.entries(LANG).map(([k, v]) => el('option', { value: k, selected: k === f.lang }, v)));
    const countries = [...new Set(feeds.map((x) => x.country).filter(Boolean))];
    const country = el('input', { type: 'text', value: f.country || '', list: 'countryList', placeholder: 'למשל: ישראל' });
    let quality = f.quality || 3;
    const starsBox = el('div', { class: 'star-pick', role: 'radiogroup', 'aria-label': 'איכות ומהימנות' });
    const why = el('p', { class: 'muted', style: 'font-size:.82rem;margin:4px 0 0' });
    const drawStars = () => {
      starsBox.replaceChildren(...[1, 2, 3, 4, 5].map((n) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(n === quality), 'aria-label': `${n} מתוך 5`, class: n <= quality ? 'on' : '', onclick: () => { quality = n; drawStars(); } }, '★')));
      why.textContent = QUALITY[quality];
    };
    drawStars();
    modal(el('h3', {}, f.title),
      el('p', { class: 'muted', style: 'margin-top:0' }, [KIND[f.kind] || f.kind, f.category ? CATEGORY[f.category] : null].filter(Boolean).join(' · ')),
      el('label', { class: 'field' }, el('span', {}, 'שם'), title),
      el('label', { class: 'field' }, el('span', {}, 'תיקייה'), folder, el('datalist', { id: 'folderList2' }, [...new Set(feeds.map((x) => x.folder))].map((v) => el('option', { value: v })))),
      el('div', { class: 'grid2' },
        el('label', { class: 'field' }, el('span', {}, 'שפה'), lang),
        el('label', { class: 'field' }, el('span', {}, 'ארץ'), country, el('datalist', { id: 'countryList' }, countries.map((v) => el('option', { value: v }))))),
      el('div', { class: 'field' }, el('span', {}, 'איכות ומהימנות'), starsBox, why),
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', { class: 'btn primary', onclick: async () => {
          await api('/api/news/feeds/' + f.id, { method: 'PATCH', body: { title: title.value.trim() || f.title, folder: folder.value.trim() || f.folder, lang: lang.value, country: country.value.trim(), quality } });
          closeModal(); await loadFeeds(); load();
        } }, 'שמירה'),
        el('button', { class: 'btn ghost', onclick: async () => {
          if (!confirm(`להסיר את "${f.title}" מהמקורות?`)) return;
          await api('/api/news/feeds/' + f.id, { method: 'DELETE' });
          closeModal(); await loadFeeds(); load();
        } }, 'הסרת המקור')));
  }

  /* ================= filters above the page ================= */
  function renderFilters() {
    const box = $('#filters');
    box.textContent = '';
    const change = (fn) => () => { fn(); savePrefs(); page = 0; renderFilters(); render(); };
    const one = (label, opts, value, set) => el('div', { class: 'fgroup' }, el('span', { class: 'flabel' }, label),
      el('div', { class: 'fchips' }, opts.map(([v, name]) => el('button', { class: 'fchip', 'aria-pressed': String(value === v), onclick: change(() => set(v)) }, name))));
    const many = (label, opts, list) => el('div', { class: 'fgroup' }, el('span', { class: 'flabel' }, label),
      el('div', { class: 'fchips' }, opts.map(([v, name]) => el('button', { class: 'fchip', 'aria-pressed': String(list.includes(v)), onclick: change(() => toggleIn(list, v)) }, name))));
    const langs = [...new Set(activeFeeds().map((f) => f.lang).filter(Boolean))];
    const kinds = [...new Set(activeFeeds().map((f) => f.kind).filter(Boolean))];
    const active = (prefs.range !== 'all') + !!prefs.kinds.length + !!prefs.langs.length + !!prefs.minQ + (prefs.sort !== 'date') + prefs.unreadOnly;
    const details = el('details', { class: 'fbox', open: matchMedia('(min-width: 900px)').matches || undefined },
      el('summary', {}, el('span', {}, 'סינון ומיון'), active ? el('span', { class: 'fcount' }, String(active)) : null),
      el('div', { class: 'fbody' },
        one('זמן', Object.entries(RANGES).map(([k, [n]]) => [k, n]), prefs.range, (v) => { prefs.range = v; }),
        kinds.length > 1 ? many('סוג', kinds.map((k) => [k, KIND[k] || k]), prefs.kinds) : null,
        langs.length > 1 ? many('שפה', langs.map((k) => [k, LANG[k] || k]), prefs.langs) : null,
        one('איכות', [[0, 'הכל'], [3, '★★★ ומעלה'], [4, '★★★★ ומעלה']], prefs.minQ, (v) => { prefs.minQ = v; }),
        one('סדר', [['date', 'החדשות קודם'], ['quality', 'האמינות קודם']], prefs.sort, (v) => { prefs.sort = v; }),
        el('label', { class: 'toggle' }, el('input', { type: 'checkbox', checked: prefs.unreadOnly, onchange: (e) => change(() => { prefs.unreadOnly = e.target.checked; })() }), 'רק שלא נקראו')));
    box.append(details);
  }

  /* ================= which articles ================= */
  function visible() {
    const active = new Set(activeFeeds().map((f) => f.id));
    let list = history || items;
    if (scope.type !== 'starred') list = list.filter((i) => active.has(i.feedId) || !feedOf(i));
    if (scope.type === 'folder') list = list.filter((i) => feedOf(i)?.folder === scope.folder);
    if (scope.type === 'feed') list = list.filter((i) => i.feedId === scope.id);
    if (prefs.unreadOnly && scope.type !== 'starred') list = list.filter((i) => !i.read || i === current);
    const now = Date.now();
    if (prefs.range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); list = list.filter((i) => i.date >= d.getTime()); }
    else if (RANGES[prefs.range]?.[1]) list = list.filter((i) => i.date >= now - RANGES[prefs.range][1] * 86400e3);
    if (prefs.kinds.length) list = list.filter((i) => prefs.kinds.includes(i.kind || feedOf(i)?.kind));
    if (prefs.langs.length) list = list.filter((i) => prefs.langs.includes(i.lang || feedOf(i)?.lang));
    if (prefs.minQ) list = list.filter((i) => (i.quality ?? feedOf(i)?.quality ?? 3) >= prefs.minQ);
    if (query && !history) {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((i) => { const t = `${i.title} ${i.summary} ${i.feed}`.toLowerCase(); return words.every((w) => t.includes(w)); });
    }
    list = [...list];
    if (prefs.sort === 'quality') list.sort((a, b) => ((b.quality ?? 3) - (a.quality ?? 3)) || (b.date - a.date));
    else list.sort((a, b) => b.date - a.date);
    return list;
  }

  const perPage = () => (innerWidth >= 1100 ? 11 : innerWidth >= 700 ? 8 : 6);

  /* ================= the newspaper page ================= */
  function story(it, kind) {
    const f = feedOf(it);
    const q = it.quality ?? f?.quality ?? 3;
    const lang = it.lang || f?.lang;
    const card = el('article', { class: `story ${kind}${it.read ? ' read' : ''}`, 'data-id': it.id, tabindex: '0', role: 'button', 'aria-label': it.title },
      it.image && kind !== 'brief' ? el('div', { class: 'story-img' }, el('img', { src: it.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.parentElement.remove() })) : null,
      el('div', { class: 'kicker' }, srcIcon(f), el('span', { class: 'k-src' }, it.feed), el('span', { class: 'k-q', title: `איכות ומהימנות: ${QUALITY[q]}` }, stars(q)),
        lang && lang !== 'he' ? el('span', { class: 'k-lang' }, LANG[lang] || lang) : null, el('span', { class: 'k-time' }, timeAgo(it.date))),
      el('h3', { class: 'headline', dir: 'auto' }, it.starred ? el('span', { class: 'star', 'aria-label': 'שמור' }, '★ ') : null, it.title),
      kind !== 'brief' && it.summary && it.summary !== it.title ? el('p', { class: 'dek', dir: 'auto' }, it.summary) : null);
    const go = () => openArticle(it, card);
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return card;
  }

  function buildPage(list, n) {
    const size = perPage();
    const slice = list.slice(n * size, (n + 1) * size);
    const pg = el('div', { class: 'page' });
    if (!slice.length) {
      pg.append(el('p', { class: 'empty-page' }, history ? 'לא נמצאו כתבות מהעבר בנושא הזה.' : query ? 'לא נמצאו כתבות שמתאימות לחיפוש.' : scope.type === 'starred' ? 'עוד לא שמרתם כתבות. לחצו ☆ שמור בכתבה.' : 'אין כאן כתבות כרגע 🎉'));
      return pg;
    }
    const lead = slice.find((i) => i.image) || slice[0];
    const rest = slice.filter((i) => i !== lead);
    const second = rest.slice(0, 2);
    const briefs = rest.slice(2);
    pg.append(
      el('div', { class: 'front' }, story(lead, 'lead'), el('div', { class: 'seconds' }, second.map((i) => story(i, 'second')))),
      briefs.length ? el('div', { class: 'briefs' }, briefs.map((i) => story(i, 'brief'))) : null,
      el('div', { class: 'folio' }, `— ${n + 1} —`));
    return pg;
  }

  /** Draw the current page; dir ±1 turns the page like a book (the spine is on the right, as in a Hebrew book). */
  function render(dir = 0) {
    const list = visible();
    const pages = Math.max(1, Math.ceil(list.length / perPage()));
    page = Math.max(0, Math.min(page, pages - 1));
    $('#mastTitle').textContent = history ? `🔎 "${query}" בעבר` : scopeTitle();
    $('#mastSub').textContent = history ? `${list.length} כתבות מ-120 הימים האחרונים` : query ? `${list.length} כתבות מתאימות לחיפוש` : `${list.length} כתבות`;
    $('#pageNo').textContent = `עמוד ${page + 1} מתוך ${pages}`;
    $('#prevPage').disabled = page <= 0;
    $('#nextPage').disabled = page >= pages - 1;
    const book = $('#book');
    const old = book.querySelector('.page:not(.leaving)');
    const fresh = buildPage(list, page);
    if (!dir || !old || reduceMotion()) {
      book.querySelectorAll('.page').forEach((p) => p.remove());
      book.append(fresh);
      return;
    }
    book.style.minBlockSize = Math.max(old.offsetHeight, 200) + 'px';
    book.classList.add('turning');
    const finish = () => { book.querySelectorAll('.page.leaving').forEach((p) => p.remove()); fresh.classList.remove('arriving', 'under'); book.classList.remove('turning'); book.style.minBlockSize = ''; };
    if (dir > 0) {
      // Next: the new page waits underneath and the old one lifts away over the spine.
      fresh.classList.add('under');
      book.insertBefore(fresh, old);
      old.classList.add('leaving', 'turn-away');
      old.addEventListener('animationend', finish, { once: true });
    } else {
      // Back: the previous page comes back over the spine and lies down on top.
      fresh.classList.add('arriving', 'turn-back');
      old.classList.add('leaving');
      book.append(fresh);
      fresh.addEventListener('animationend', () => { fresh.classList.remove('turn-back'); finish(); }, { once: true });
    }
    setTimeout(finish, 1300);
    book.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  function scopeTitle() {
    if (scope.type === 'starred') return 'שמורים';
    if (scope.type === 'folder') return scope.folder;
    if (scope.type === 'feed') return feeds.find((f) => f.id === scope.id)?.title || '';
    return 'כל הכתבות';
  }

  function turn(d) {
    const pages = Math.max(1, Math.ceil(visible().length / perPage()));
    const to = page + d;
    if (to < 0 || to >= pages) return;
    page = to;
    render(d);
  }

  /* ================= loading ================= */
  async function load() {
    renderSide();
    if (!items.length) { $('#book').replaceChildren(el('div', { class: 'page' }, el('div', { class: 'loading', style: 'padding:30px' }, el('span', { class: 'spinner' }), 'טוען את העיתון…'))); }
    try {
      if (scope.type === 'starred') items = tidy((await api('/api/news/starred')).items);
      else {
        const r = await api('/api/news/items');
        items = tidy(r.items);
        errors = r.errors;
      }
    } catch (e) { toast(e.message); }
    renderSide();
    renderFilters();
    render();
  }
  async function loadFeeds() { feeds = (await api('/api/news/feeds')).feeds; }
  // Articles kept in the history before direction marks were decoded on the server.
  const tidy = (list) => { for (const i of list) { i.title = (i.title || '').replace(/&(rlm|lrm);/g, ''); i.summary = (i.summary || '').replace(/&(rlm|lrm);/g, ''); if (i.body) i.body = i.body.replace(/&(rlm|lrm);/g, ''); } return list; };

  async function mark(ids, patch) {
    try { await api('/api/news/state', { body: { ids, ...patch } }); } catch (e) { toast(e.message); }
  }

  /* ================= search ================= */
  let searchTimer;
  async function runSearch() {
    query = $('#q').value.trim();
    page = 0;
    if ($('#histSw').checked && query.length >= 2) {
      $('#mastSub').textContent = 'מחפש בעבר…';
      try {
        const p = new URLSearchParams({ q: query });
        if (RANGES[prefs.range]?.[1]) p.set('days', RANGES[prefs.range][1]);
        const ids = activeFeeds().map((f) => f.id);
        if (ids.length && ids.length < feeds.length) p.set('feeds', ids.join(','));
        history = tidy((await api('/api/news/search?' + p)).items);
      } catch (e) { history = null; toast(e.message); }
    } else history = null;
    render();
  }
  $('#q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, $('#histSw').checked ? 450 : 200); });
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#q').value = ''; runSearch(); } });
  $('#histSw').addEventListener('change', runSearch);

  /* ================= the article (the card flips open to the full page) ================= */
  async function openArticle(it, origin, mode = 'reader') {
    current = it;
    if (!it.read) { it.read = true; mark([it.id], { read: true }); origin?.classList.add('read'); renderSide(); }
    const f = feedOf(it);
    const q = it.quality ?? f?.quality ?? 3;
    const lang = it.lang || f?.lang || 'he';
    const list = visible();
    const idx = list.indexOf(it);
    const body = el('div', { class: 'a-body' });
    const sumBox = el('div');
    const starBtn = el('button', { class: 'btn ghost small', onclick: () => {
      it.starred = !it.starred;
      mark([it.id], { starred: it.starred, snapshot: it.starred ? { title: it.title, link: it.link, feed: it.feed, feedId: it.feedId, date: it.date, image: it.image, summary: it.summary, body: it.body, lang: it.lang, kind: it.kind, quality: it.quality } : undefined });
      starBtn.textContent = it.starred ? '★ שמור' : '☆ שמור';
    } }, it.starred ? '★ שמור' : '☆ שמור');
    let original = null;
    const trBtn = lang !== 'he' ? el('button', { class: 'btn ghost small', onclick: async () => {
      if (original) { body.replaceChildren(...original); original = null; trBtn.textContent = '🌐 תרגום לעברית'; return; }
      trBtn.disabled = true; trBtn.textContent = 'מתרגם…';
      try {
        const t = await api('/api/news/translate', { body: { url: it.link, title: it.title, text: it.body || '' } });
        original = [...body.childNodes];
        body.replaceChildren(el('div', { class: 'translated' },
          el('p', { class: 'tr-note' }, `🌐 תורגם מ${t.from || LANG[lang] || 'השפה המקורית'} לעברית`),
          el('h3', { class: 'tr-title' }, t.title_he), ...t.paragraphs.map((p) => el('p', {}, p))));
        trBtn.textContent = '↺ הצג את המקור';
      } catch (e) { toast(e.message); trBtn.textContent = '🌐 תרגום לעברית'; }
      trBtn.disabled = false;
    } }, '🌐 תרגום לעברית') : null;
    const sumBtn = el('button', { class: 'btn ghost small', onclick: async () => {
      sumBtn.disabled = true;
      sumBox.replaceChildren(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'מסכם…'));
      try {
        const s = await api('/api/news/summary', { body: { url: it.link, text: it.body || '' } });
        sumBox.replaceChildren(el('div', { class: 'notice summary' }, el('strong', {}, '✨ בקצרה'), el('ul', {}, s.bullets.map((b) => el('li', {}, b)))));
      } catch (e) { sumBox.replaceChildren(); toast(e.message); sumBtn.disabled = false; }
    } }, '✨ סכם לי');
    const nav = (d) => { const next = list[idx + d]; if (next) openArticle(next, null); };
    const content = [
      el('div', { class: 'a-bar' },
        el('button', { class: 'btn ghost small', disabled: idx <= 0, onclick: () => nav(-1), title: 'הכתבה הקודמת (k)' }, '→ הקודמת'),
        el('button', { class: 'btn ghost small', disabled: idx < 0 || idx >= list.length - 1, onclick: () => nav(1), title: 'הכתבה הבאה (j)' }, 'הבאה ←'),
        el('span', { class: 'spacer' }),
        it.kind !== 'telegram' ? el('button', { class: 'btn ghost small', 'aria-pressed': String(mode === 'embed'), onclick: () => openArticle(it, null, mode === 'embed' ? 'reader' : 'embed') }, mode === 'embed' ? '📄 תצוגת קריאה' : '🖼 האתר המקורי') : null,
        trBtn, sumBtn, starBtn,
        el('a', { class: 'btn ghost small', href: it.link, target: '_blank', rel: 'noopener' }, it.kind === 'telegram' ? '↗ בטלגרם' : '↗ באתר'),
        el('button', { class: 'btn ghost small', onclick: () => share(it) }, '📤 שתף')),
      el('article', { class: 'a-paper' },
        el('div', { class: 'a-kicker' }, srcIcon(f), el('span', {}, it.feed), el('span', { class: 'k-q', title: QUALITY[q] }, stars(q)),
          f?.category ? el('span', { class: 'a-cat' }, CATEGORY[f.category]) : null, el('span', {}, timeAgo(it.date))),
        el('h2', { class: 'a-title', dir: 'auto' }, it.title),
        el('div', { class: 'a-byline' }, [new Date(it.date).toLocaleString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), f?.country, LANG[lang]].filter(Boolean).join(' · ')),
        sumBox, body),
    ];
    H.sheet.open(origin, content, { className: 'news-sheet' });

    if (mode === 'embed') {
      body.append(el('p', { class: 'muted', style: 'font-size:.82rem' }, 'חלק מהאתרים חוסמים הצגה בתוך דף אחר. אם הדף ריק – חזרו לתצוגת קריאה או פתחו באתר.'),
        el('iframe', { src: it.link, sandbox: 'allow-scripts allow-same-origin allow-popups', referrerpolicy: 'no-referrer', title: it.title }));
      return;
    }
    if (it.kind === 'telegram' || (it.body && it.body.length > 40)) {
      body.append(it.image ? el('img', { class: 'a-lead', src: it.image, alt: '', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null,
        el('div', { class: 'content tg-post', dir: 'auto' }, (it.body || it.summary || '').split(/\n+/).map((p) => el('p', {}, p))));
      return;
    }
    body.append(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'טוען את הכתבה…'));
    try {
      const a = await api('/api/news/article?url=' + encodeURIComponent(it.link));
      if (current !== it) return;
      body.replaceChildren(el('div', { class: 'content', dir: a.dir || 'auto', html: a.content }));
    } catch (e) {
      if (current !== it) return;
      body.replaceChildren(it.summary ? el('p', { class: 'content', dir: 'auto' }, it.summary) : '',
        el('p', { class: 'notice warn' }, e.message + ' ', el('a', { href: it.link, target: '_blank', rel: 'noopener' }, 'פתח באתר ↗')));
    }
  }

  async function share(it) {
    try {
      if (navigator.share) await navigator.share({ title: it.title, url: it.link });
      else { await navigator.clipboard.writeText(`${it.title}\n${it.link}`); toast('הקישור הועתק'); }
    } catch (_) { /* cancelled */ }
  }

  /* ================= controls, keys, swipes ================= */
  $('#mastDate').textContent = (() => {
    const d = new Date();
    const g = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    let heb = '';
    try { heb = d.toLocaleDateString('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (_) { /* older browsers */ }
    return heb ? `${g} · ${heb}` : g;
  })();
  $('#prevPage').addEventListener('click', () => turn(-1));
  $('#nextPage').addEventListener('click', () => turn(1));
  $('#refresh').addEventListener('click', () => { history = null; $('#histSw').checked = false; load(); });
  $('#menuBtn').addEventListener('click', () => { const open = !$('#side').classList.contains('open'); $('#side').classList.toggle('open', open); $('#sideShade').hidden = !open; $('#menuBtn').setAttribute('aria-expanded', String(open)); });
  $('#sideShade').addEventListener('click', closeSide);
  $('#markAll').addEventListener('click', async () => {
    const list = visible().filter((i) => !i.read);
    if (!list.length) return toast('הכל כבר נקרא');
    list.forEach((i) => { i.read = true; });
    render(); renderSide();
    const ids = list.map((i) => i.id);
    for (let i = 0; i < ids.length; i += 500) await mark(ids.slice(i, i + 500), { read: true });
    toast(`${ids.length} כתבות סומנו כנקראו`);
  });
  window.addEventListener('helper:prefs', (e) => { if (e.detail === 'news') { renderSide(); renderFilters(); render(); } });
  let lastW = innerWidth;
  window.addEventListener('resize', () => { if (Math.abs(innerWidth - lastW) > 80) { lastW = innerWidth; page = 0; render(); } });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (H.sheet.isOpen && current) {
      const list = visible(); const i = list.indexOf(current);
      if (e.key === 'j' && list[i + 1]) openArticle(list[i + 1], null);
      if (e.key === 'k' && list[i - 1]) openArticle(list[i - 1], null);
      if (e.key === 'o') window.open(current.link, '_blank', 'noopener');
      return;
    }
    // In a Hebrew book the next page is to the left.
    if (e.key === 'ArrowLeft' || e.key === 'PageDown') turn(1);
    if (e.key === 'ArrowRight' || e.key === 'PageUp') turn(-1);
    if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
  });
  // Swipe on a phone: pull the page to the right for the next one (like turning a page in a Hebrew book), to the left to go back.
  let touch = null;
  $('#book').addEventListener('touchstart', (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY, at: Date.now() }; }, { passive: true });
  $('#book').addEventListener('touchend', (e) => {
    if (!touch) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - touch.at < 700) turn(dx > 0 ? 1 : -1);
    touch = null;
  });

  await loadFeeds();
  load();
  setInterval(() => { if (!document.hidden && scope.type !== 'starred' && !history) load(); }, 10 * 60 * 1000);
})();
