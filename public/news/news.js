/* חדשות: מקורות בצד (סינון לפי שפה, ארץ וסוג), רשימת כתבות שנגללת בלי סוף אל ההיסטוריה, סינון לפי זמן, סוג, שפה
 * ואמינות, תרגום כותרות בלבד, תפריט לכל כתבה (במעבר עכבר או בלחיצה ארוכה), אמינות לכל כתבה לפי הצלבה עם מקורות
 * בלתי תלויים ובדיקה ברשת, חיפוש (גם בעבר ובאינטרנט), כתבה שנפתחת בהיפוך כרטיס, תרגום וסיכום.
 * ההעדפות והסינונים נשמרים לכל אדם ועוברים איתו בין המכשירים. */
(async () => {
  'use strict';
  const { el, api, toast, modal, closeModal, timeAgo } = H;
  H.header('חדשות', '📰');
  await H.requireLogin();
  const $ = (s) => document.querySelector(s);

  // Per person, synced through the server (the old per-device copy is carried over once).
  const prefs = H.prefs('news', {
    unreadOnly: false, cards: false, sideLang: [], sideCountry: [], sideKind: [],
    range: 'all', kinds: [], langs: [], minQ: 0, sort: 'date', trTitles: false,
    customFeeds: [],   // [{id, name, feedIds, filters}] – the person's own feeds: chosen sources and a filter
    savedFolders: [],  // [{id, name}] in the person's order – folders for saved articles
  }, 'helper.news.prefs');
  const savePrefs = () => H.savePrefs('news');

  const LANG = { he: 'עברית', ar: 'ערבית', en: 'אנגלית', fr: 'צרפתית', de: 'גרמנית', ru: 'רוסית', es: 'ספרדית' };
  const KIND = { web: 'אתרים', telegram: 'טלגרם', facebook: 'פייסבוק', websearch: 'מהאינטרנט' };
  const CATEGORY = { editorial: 'מערכת חדשות', official: 'גוף רשמי', journalist: 'ערוץ של עיתונאי', aggregator: 'ערוץ מבזקים לא רשמי', activist: 'רשת עם אג׳נדה' };
  const QUALITY = { 5: 'מצוין – מערכת עם סטנדרטים מחמירים ותיקונים', 4: 'טוב מאוד – מערכת חדשות מבוססת', 3: 'סביר – גוף רשמי או מערכת מעורבת', 2: 'לא מאומת – מהיר, כדאי לבדוק לפני שסומכים', 1: 'חלש – ידוע בפרסומים לא נכונים' };
  const VERDICT = { confirmed: '✓ אומת ברשת', partly: '◐ אומת חלקית', unconfirmed: '… עוד לא אומת', disputed: '⚠ שנוי במחלוקת', false: '✗ הופרך' };
  const RANGES = { today: ['היום', null], day: ['24 שעות', 1], week: ['שבוע', 7], all: ['הכל', null] };
  const STEP = 40;

  let feeds = [];
  let items = [];
  let saved = [];          // saved articles (each with its folder)
  let errors = [];
  // {type:'all'} | {type:'folder', folder} | {type:'feed', id} | {type:'starred', folder?: id | ''} | {type:'custom', id}
  let scope = { type: 'all' };
  const FILTER_KEYS = ['range', 'kinds', 'langs', 'minQ', 'sort', 'unreadOnly'];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const customOf = (id) => prefs.customFeeds.find((c) => c.id === id);
  let query = '';
  let history = null;      // results from the past, when the "בעבר" switch is on
  let current = null;
  let shown = 0;           // how many of visible() are drawn
  let endOfHistory = false;
  let loadingOlder = false;
  const corro = {};        // article id -> { others, outlets } (the same story in independent outlets)
  const titleHe = {};      // article id -> translated headline

  const favicon = (url) => { try { return `https://www.google.com/s2/favicons?sz=32&domain=${new URL(url).hostname}`; } catch (_) { return ''; } };
  const feedOf = (it) => feeds.find((f) => f.id === it.feedId);
  const stars = (q) => '★'.repeat(q || 0) + '☆'.repeat(5 - (q || 0));
  const TG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 3.6 2.9 10.8c-1.3.5-1.3 1.2-.2 1.6l4.7 1.5 1.8 5.6c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.4-1.5ZM8.6 13.5l9.8-6.2c.5-.3.9-.1.5.2l-8.4 7.6-.3 3.6-1.6-5.2Z"/></svg>';
  const srcIcon = (f, link) => (f?.kind === 'telegram' ? el('span', { class: 'fav tg', html: TG }) : el('img', { class: 'fav', src: favicon(f?.url || link || ''), alt: '', loading: 'lazy' }));
  const tidy = (list) => { for (const i of list) { i.title = (i.title || '').replace(/&(rlm|lrm);/g, ''); i.summary = (i.summary || '').replace(/&(rlm|lrm);/g, ''); if (i.body) i.body = i.body.replace(/&(rlm|lrm);/g, ''); } return list; };

  /** How reliable an article is, and why: the family's own rating, a check on the web, or the same story in independent outlets. */
  function rating(it) {
    const base = it.quality ?? feedOf(it)?.quality ?? 3;
    if (it.rating) return { q: it.rating, why: 'הדירוג שלכם', tag: 'mine' };
    if (it.verified) return { q: it.verified.rating, why: VERDICT[it.verified.status] || 'נבדק ברשת', tag: it.verified.status };
    const c = corro[it.id];
    if (c?.others >= 2) return { q: Math.min(5, base + 1), why: `✓ מופיע גם ב-${c.others} מקורות בלתי תלויים: ${c.outlets.join(', ')}`, tag: 'corroborated', short: `✓ ${c.others} מקורות` };
    if (c?.others === 1) return { q: base, why: `מופיע גם ב: ${c.outlets[0]}`, tag: 'one', short: '+1 מקור' };
    if (base <= 2) return { q: base, why: 'מקור לא מאומת, ועוד לא נמצא במקורות אחרים', tag: 'lone', short: 'לא אומת' };
    return { q: base, why: QUALITY[base], tag: 'source' };
  }

  /* ================= side: filters and sources ================= */
  const sideMatch = (f) => (!prefs.sideLang.length || prefs.sideLang.includes(f.lang)) && (!prefs.sideCountry.length || prefs.sideCountry.includes(f.country || '')) && (!prefs.sideKind.length || prefs.sideKind.includes(f.kind));
  const activeFeeds = () => feeds.filter(sideMatch);
  const toggleIn = (list, v) => { const i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v); };

  function chipGroup(label, values, chosen, nameOf, onToggle) {
    if (values.length < 2) return null;
    return el('div', { class: 'fgroup' }, el('span', { class: 'flabel' }, label),
      el('div', { class: 'fchips' }, values.map((v) => el('button', { class: 'fchip', 'aria-pressed': String(chosen.includes(v)), onclick: () => onToggle(v) }, nameOf(v)))));
  }

  function renderSide() {
    const side = $('#side');
    side.textContent = '';
    const uniq = (k) => [...new Set(feeds.map((f) => f[k]).filter(Boolean))];
    const sideFiltered = prefs.sideLang.length + prefs.sideCountry.length + prefs.sideKind.length;
    const changeSide = (fn) => { fn(); savePrefs(); renderSide(); renderFilters(); resetList(); };
    side.append(
      el('div', { class: 'side-head' }, el('h2', {}, 'המקורות'), sideFiltered ? el('button', { class: 'link', onclick: () => changeSide(() => { prefs.sideLang = []; prefs.sideCountry = []; prefs.sideKind = []; }) }, 'נקה סינון') : null),
      el('div', { class: 'side-filters' },
        chipGroup('שפה', uniq('lang'), prefs.sideLang, (v) => LANG[v] || v, (v) => changeSide(() => toggleIn(prefs.sideLang, v))),
        chipGroup('ארץ', uniq('country'), prefs.sideCountry, (v) => v, (v) => changeSide(() => toggleIn(prefs.sideCountry, v))),
        chipGroup('סוג', uniq('kind'), prefs.sideKind, (v) => KIND[v] || v, (v) => changeSide(() => toggleIn(prefs.sideKind, v)))));

    const active = new Set(activeFeeds().map((f) => f.id));
    const unread = (pred) => items.filter((i) => !i.read && !i.hidden && active.has(i.feedId) && pred(i)).length || '';
    const go = (sc) => () => {
      // A custom feed brings its own filter with it.
      if (sc.type === 'custom') { const c = customOf(sc.id); if (c?.filters) { FILTER_KEYS.forEach((k) => { if (k in c.filters) prefs[k] = structuredClone(c.filters[k]); }); savePrefs(); renderFilters(); } }
      scope = sc; closeSide(); renderSide(); resetList();
    };
    const btn = (label, sc, count, icon) => el('button', { class: 'src', 'aria-current': String(JSON.stringify(sc) === JSON.stringify(scope)), onclick: go(sc) },
      icon || null, el('span', { class: 'src-name' }, label), el('span', { class: 'n' }, count));
    const rowWith = (b, onMore, label) => el('div', { class: 'src-row' }, b, el('button', { class: 'mini src-more', 'aria-label': label, title: label, onclick: (e) => { e.stopPropagation(); onMore(); } }, '⋯'));

    // Saved articles, with the person's own folders under them.
    const inFolder = (id) => saved.filter((s) => (s.folder || '') === id).length || '';
    side.append(el('nav', { class: 'side-nav' },
      btn('כל הכתבות', { type: 'all' }, unread(() => true), el('span', { class: 'ico' }, '🗞')),
      btn('שמורים', { type: 'starred' }, saved.length || '', el('span', { class: 'ico' }, '⭐')),
      el('div', { class: 'subfolders' },
        prefs.savedFolders.map((fo) => rowWith(btn(fo.name, { type: 'starred', folder: fo.id }, inFolder(fo.id), el('span', { class: 'ico' }, '📁')), () => editSavedFolder(fo), `עריכת התיקייה ${fo.name}`)),
        saved.some((s) => !s.folder) && prefs.savedFolders.length ? btn('בלי תיקייה', { type: 'starred', folder: '' }, inFolder(''), el('span', { class: 'ico' }, '·')) : null,
        el('button', { class: 'link add-sub', onclick: () => newSavedFolder() }, '＋ תיקייה לשמורים'))));

    // The person's own feeds: chosen sources with a filter.
    side.append(el('h3', { class: 'side-sec' }, el('span', {}, 'הפידים שלי')),
      el('div', { class: 'side-nav' },
        prefs.customFeeds.map((c) => rowWith(btn(c.name, { type: 'custom', id: c.id }, unread((i) => c.feedIds.includes(i.feedId)), el('span', { class: 'ico' }, '✦')), () => editCustomFeed(c), `עריכת הפיד ${c.name}`)),
        el('button', { class: 'link add-sub', onclick: () => editCustomFeed(null) }, '＋ פיד משלי מהסינון הנוכחי')));

    const list = activeFeeds();
    for (const folder of [...new Set(list.map((f) => f.folder))]) {
      side.append(el('h3', {}, el('button', { class: 'folder', 'aria-current': String(scope.type === 'folder' && scope.folder === folder), onclick: go({ type: 'folder', folder }) }, folder)));
      for (const f of list.filter((x) => x.folder === folder)) {
        const b = btn(f.title, { type: 'feed', id: f.id }, unread((i) => i.feedId === f.id), srcIcon(f));
        b.insertBefore(el('span', { class: 'q', title: `איכות ומהימנות: ${QUALITY[f.quality] || ''}` }, '●'.repeat(f.quality || 0)), b.querySelector('.n'));
        if (errors.includes(f.id)) b.append(el('span', { class: 'err', title: 'המקור לא ענה' }, '⚠'));
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); editSource(f); });
        side.append(el('div', { class: 'src-row' }, b, el('button', { class: 'mini src-more', 'aria-label': `הגדרות ${f.title}`, title: 'עריכה', onclick: (e) => { e.stopPropagation(); editSource(f); } }, '⋯')));
      }
    }
    if (!list.length) side.append(el('p', { class: 'muted side-note' }, 'אין מקורות שמתאימים לסינון.'));
    side.append(el('button', { class: 'btn ghost small addsrc', onclick: addSource }, '➕ הוספת מקור'),
      el('p', { class: 'muted side-note' }, 'הנקודות (●) הן איכות המקור לפי סטנדרטים עריכתיים, באותו סולם לכל צד. כל כתבה מקבלת גם אמינות משלה לפי מקורות בלתי תלויים.'));
  }

  function closeSide() { $('#side').classList.remove('open'); $('#sideShade').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); }

  /* ---- adding a source: a smart search with filters, or a known address ---- */
  function addSource() {
    const folders = [...new Set(feeds.map((f) => f.folder))];
    const countries = [...new Set(feeds.map((f) => f.country).filter(Boolean))];
    const q = el('input', { type: 'search', placeholder: 'מה לחפש? למשל: כלכלה ישראלית, חדשות לבנון, ערוצי טלגרם של עיתונאים', style: 'flex:1 1 220px' });
    const lang = el('select', { 'aria-label': 'שפה' }, el('option', { value: '' }, 'כל השפות'), Object.entries(LANG).map(([k, v]) => el('option', { value: k }, v)));
    const country = el('select', { 'aria-label': 'ארץ' }, el('option', { value: '' }, 'כל הארצות'), [...new Set([...countries, 'ישראל', 'פלסטין', 'לבנון', 'מצרים', 'ירדן', 'ארצות הברית', 'בריטניה'])].map((c) => el('option', { value: c }, c)));
    const kind = el('select', { 'aria-label': 'סוג' }, el('option', { value: '' }, 'אתרים וטלגרם'), el('option', { value: 'web' }, 'אתרים'), el('option', { value: 'telegram' }, 'טלגרם'));
    const folder = el('input', { type: 'text', list: 'folderList', value: scope.folder || 'שלי', 'aria-label': 'תיקייה' });
    const results = el('div', { class: 'src-results' });
    const add = async (url, btn) => {
      btn.disabled = true; btn.textContent = 'מוסיף…';
      try {
        const r = await api('/api/news/feeds', { body: { url, folder: folder.value.trim() || 'שלי' } });
        btn.textContent = '✓ נוסף';
        toast(`נוסף: ${r.title || r.url}`);
        await loadFeeds(); renderSide();
      } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'הוספה'; }
    };
    const search = async () => {
      results.replaceChildren(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), q.value.trim() ? 'מחפש מקורות ברשת…' : 'טוען מקורות מומלצים…'));
      try {
        const r = await api('/api/news/find-sources', { body: { q: q.value.trim(), lang: lang.value, country: country.value, kind: kind.value } });
        if (!r.sources.length) { results.replaceChildren(el('p', { class: 'muted' }, q.value.trim() ? 'לא נמצאו מקורות. נסו לנסח אחרת או להסיר סינון.' : 'כל המקורות המומלצים כבר אצלכם. חפשו נושא כדי למצוא עוד.')); return; }
        results.replaceChildren(...r.sources.map((s) => {
          const b = el('button', { class: 'btn small primary' }, 'הוספה');
          b.addEventListener('click', () => add(s.url, b));
          return el('div', { class: 'src-hit' },
            el('div', { class: 'src-hit-main' },
              el('b', {}, s.kind === 'telegram' ? el('span', { class: 'fav tg', html: TG }) : el('img', { class: 'fav', src: favicon(s.url), alt: '' }), ' ', s.name),
              el('small', { class: 'muted' }, [KIND[s.kind], LANG[s.lang] || s.lang, s.country, s.recommended ? 'מומלץ' : null].filter(Boolean).join(' · ')),
              s.description_he ? el('small', {}, s.description_he) : null,
              el('small', { class: 'q', title: QUALITY[s.quality] }, `${'●'.repeat(s.quality || 0)} ${CATEGORY[s.category] || ''}`)),
            b);
        }));
      } catch (e) { results.replaceChildren(el('p', { class: 'muted' }, e.message)); }
    };
    const url = el('input', { type: 'text', dir: 'ltr', placeholder: 'haaretz.co.il · קישור ל-RSS · @channel', style: 'flex:1 1 220px' });
    const addUrl = el('button', { class: 'btn ghost' }, 'הוספה');
    addUrl.addEventListener('click', () => { if (url.value.trim()) add(url.value.trim(), addUrl); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
    [lang, country, kind].forEach((s) => s.addEventListener('change', search));
    modal(el('h3', {}, 'הוספת מקור'),
      el('div', { class: 'row' }, q, el('button', { class: 'btn primary', onclick: search }, '🔎 חיפוש חכם')),
      el('div', { class: 'row src-filters' }, lang, country, kind),
      results,
      el('details', { class: 'more' }, el('summary', {}, 'יש לי כתובת או שם ערוץ'),
        el('div', { class: 'row' }, url, addUrl),
        el('p', { class: 'muted', style: 'font-size:.82rem' }, 'טלגרם: @שם_הערוץ או קישור t.me. פייסבוק לא מאפשר לקרוא עמודים מבחוץ.')),
      el('label', { class: 'field' }, el('span', {}, 'להוסיף לתיקייה'), folder, el('datalist', { id: 'folderList' }, folders.map((f) => el('option', { value: f })))));
    search();
    q.focus();
  }

  function editSource(f) {
    const title = el('input', { type: 'text', value: f.title });
    const folder = el('input', { type: 'text', value: f.folder, list: 'folderList2' });
    const lang = el('select', {}, Object.entries(LANG).map(([k, v]) => el('option', { value: k, selected: k === f.lang }, v)));
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
        el('label', { class: 'field' }, el('span', {}, 'ארץ'), country, el('datalist', { id: 'countryList' }, [...new Set(feeds.map((x) => x.country).filter(Boolean))].map((v) => el('option', { value: v }))))),
      el('div', { class: 'field' }, el('span', {}, 'איכות ומהימנות של המקור'), starsBox, why),
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

  /* ---- folders for saved articles (kept in the person's prefs, so they follow them to every device) ---- */
  function nameDialog(title, value, onSave, extra = []) {
    const input = el('input', { type: 'text', value: value || '', placeholder: 'שם', maxlength: 40 });
    const save = () => { const v = input.value.trim(); if (!v) return toast('צריך שם'); closeModal(); onSave(v); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    modal(el('h3', {}, title), el('label', { class: 'field' }, el('span', {}, 'שם'), input), ...extra,
      el('div', { class: 'row dialog-actions' }, el('button', { class: 'btn primary', onclick: save }, 'שמירה'), el('button', { class: 'btn ghost', onclick: closeModal }, 'ביטול')));
    input.focus();
    input.select();
  }
  function newSavedFolder(then) {
    nameDialog('תיקייה חדשה לשמורים', '', (name) => {
      const fo = { id: uid(), name };
      prefs.savedFolders.push(fo); savePrefs(); renderSide();
      toast(`נוצרה התיקייה "${name}"`);
      then?.(fo);
    });
  }
  function editSavedFolder(fo) {
    const at = () => prefs.savedFolders.findIndex((x) => x.id === fo.id);
    const move = (d) => { const i = at(), j = i + d; if (j < 0 || j >= prefs.savedFolders.length) return; const [x] = prefs.savedFolders.splice(i, 1); prefs.savedFolders.splice(j, 0, x); savePrefs(); renderSide(); };
    nameDialog('עריכת תיקייה', fo.name, (name) => { fo.name = name; savePrefs(); renderSide(); }, [
      el('div', { class: 'row' },
        el('button', { class: 'btn ghost small', onclick: () => move(-1) }, '↑ למעלה'),
        el('button', { class: 'btn ghost small', onclick: () => move(1) }, '↓ למטה'),
        el('span', { class: 'spacer' }),
        el('button', { class: 'btn ghost small danger-text', onclick: async () => {
          const inside = saved.filter((s) => s.folder === fo.id);
          if (!confirm(`למחוק את התיקייה "${fo.name}"?${inside.length ? ` ${inside.length} הכתבות שבה יישארו בשמורים, בלי תיקייה.` : ''}`)) return;
          prefs.savedFolders.splice(at(), 1); savePrefs();
          inside.forEach((s) => { s.folder = null; });
          if (inside.length) await mark(inside.map((s) => s.id), { folder: '' });
          if (scope.type === 'starred' && scope.folder === fo.id) scope = { type: 'starred' };
          closeModal(); renderSide(); resetList();
        } }, '🗑 מחיקת התיקייה')),
    ]);
  }
  /** Save an article (or move a saved one) into a folder of the person's choice. */
  function chooseFolder(it) {
    const pick = async (folderId) => {
      closeModal();
      const was = it.starred;
      it.starred = true;
      it.folder = folderId || null;
      await mark([it.id], { starred: true, folder: folderId || '', snapshot: snapshot(it) });
      const copy = saved.find((s) => s.id === it.id);
      if (copy) copy.folder = it.folder; else saved.unshift({ ...it, starred: true, read: true });
      toast(was ? 'הכתבה הועברה' : `נשמר${folderId ? ` ב"${prefs.savedFolders.find((f) => f.id === folderId)?.name}"` : ''}`);
      redraw(it); renderSide();
    };
    modal(el('h3', {}, it.starred ? 'להעביר לתיקייה' : 'לשמור בתיקייה'),
      el('div', { class: 'folder-pick' },
        el('button', { class: 'src', 'aria-current': String(it.starred && !it.folder), onclick: () => pick('') }, el('span', { class: 'ico' }, '⭐'), el('span', {}, 'שמורים (בלי תיקייה)')),
        prefs.savedFolders.map((fo) => el('button', { class: 'src', 'aria-current': String(it.folder === fo.id), onclick: () => pick(fo.id) }, el('span', { class: 'ico' }, '📁'), el('span', {}, fo.name)))),
      el('div', { class: 'row dialog-actions' },
        el('button', { class: 'btn ghost small', onclick: () => { closeModal(); newSavedFolder((fo) => pick(fo.id)); } }, '＋ תיקייה חדשה'),
        it.starred ? el('button', { class: 'btn ghost small', onclick: () => { closeModal(); unsave(it); } }, 'הסרה מהשמורים') : null));
  }
  async function unsave(it) {
    it.starred = false; it.folder = null;
    saved = saved.filter((s) => s.id !== it.id);
    await mark([it.id], { starred: false, folder: '' });
    toast('הוסר מהשמורים');
    redraw(it); renderSide();
    if (scope.type === 'starred') resetList();
  }
  const snapshot = (it) => ({ title: it.title, link: it.link, feed: it.feed, feedId: it.feedId, date: it.date, image: it.image, summary: it.summary, body: it.body, lang: it.lang, kind: it.kind, quality: it.quality });

  /* ---- the person's own feeds: chosen sources and a filter, under a name ---- */
  function editCustomFeed(c) {
    const chosen = new Set(c ? c.feedIds : activeFeeds().map((f) => f.id));
    const name = el('input', { type: 'text', value: c?.name || '', placeholder: 'למשל: הבוקר שלי, ביטחון, כלכלה', maxlength: 40 });
    const keepFilter = el('input', { type: 'checkbox', checked: true });
    const list = el('div', { class: 'feed-pick' });
    const draw = () => list.replaceChildren(...[...new Set(feeds.map((f) => f.folder))].map((folder) => el('fieldset', {},
      el('legend', {}, folder),
      feeds.filter((f) => f.folder === folder).map((f) => el('label', { class: 'pick' },
        el('input', { type: 'checkbox', checked: chosen.has(f.id), onchange: (e) => { if (e.target.checked) chosen.add(f.id); else chosen.delete(f.id); } }),
        srcIcon(f), el('span', {}, f.title))))));
    draw();
    const save = () => {
      const n = name.value.trim();
      if (!n) return toast('תנו לפיד שם');
      if (!chosen.size) return toast('בחרו לפחות מקור אחד');
      const filters = keepFilter.checked ? Object.fromEntries(FILTER_KEYS.map((k) => [k, structuredClone(prefs[k])])) : null;
      if (c) Object.assign(c, { name: n, feedIds: [...chosen], filters: filters || c.filters || null });
      else { c = { id: uid(), name: n, feedIds: [...chosen], filters }; prefs.customFeeds.push(c); }
      savePrefs(); closeModal();
      scope = { type: 'custom', id: c.id };
      renderSide(); resetList();
      toast(`הפיד "${n}" נשמר`);
    };
    modal(el('h3', {}, c ? 'עריכת פיד' : 'פיד משלי'),
      el('label', { class: 'field' }, el('span', {}, 'שם הפיד'), name),
      el('div', { class: 'row' }, el('b', {}, 'מקורות'), el('span', { class: 'spacer' }),
        el('button', { class: 'link', onclick: () => { feeds.forEach((f) => chosen.add(f.id)); draw(); } }, 'הכל'),
        el('button', { class: 'link', onclick: () => { chosen.clear(); draw(); } }, 'כלום')),
      list,
      el('label', { class: 'toggle', style: 'margin-top:10px' }, keepFilter, 'לשמור גם את הסינון והמיון הנוכחיים'),
      el('div', { class: 'row dialog-actions' },
        el('button', { class: 'btn primary', onclick: save }, 'שמירה'),
        c ? el('button', { class: 'btn ghost', onclick: () => {
          if (!confirm(`למחוק את הפיד "${c.name}"?`)) return;
          prefs.customFeeds = prefs.customFeeds.filter((x) => x.id !== c.id); savePrefs(); closeModal();
          if (scope.type === 'custom' && scope.id === c.id) scope = { type: 'all' };
          renderSide(); resetList();
        } }, 'מחיקת הפיד') : null));
    name.focus();
  }

  /* ================= the filter row ================= */
  function renderFilters() {
    const box = $('#filters');
    box.textContent = '';
    const change = (fn) => () => { fn(); savePrefs(); renderFilters(); resetList(); };
    const one = (label, opts, value, set) => el('div', { class: 'fgroup' }, el('span', { class: 'flabel' }, label),
      el('div', { class: 'fchips' }, opts.map(([v, name]) => el('button', { class: 'fchip', 'aria-pressed': String(value === v), onclick: change(() => set(v)) }, name))));
    const many = (label, opts, list) => el('div', { class: 'fgroup' }, el('span', { class: 'flabel' }, label),
      el('div', { class: 'fchips' }, opts.map(([v, name]) => el('button', { class: 'fchip', 'aria-pressed': String(list.includes(v)), onclick: change(() => toggleIn(list, v)) }, name))));
    const langs = [...new Set(activeFeeds().map((f) => f.lang).filter(Boolean))];
    const kinds = [...new Set(activeFeeds().map((f) => f.kind).filter(Boolean))];
    const active = (prefs.range !== 'all') + !!prefs.kinds.length + !!prefs.langs.length + !!prefs.minQ + (prefs.sort !== 'date') + prefs.unreadOnly + prefs.trTitles;
    box.append(el('details', { class: 'fbox', open: matchMedia('(min-width: 900px)').matches || undefined },
      el('summary', {}, el('span', {}, 'סינון ומיון'), active ? el('span', { class: 'fcount' }, String(active)) : null),
      el('div', { class: 'fbody' },
        one('זמן', Object.entries(RANGES).map(([k, [n]]) => [k, n]), prefs.range, (v) => { prefs.range = v; }),
        kinds.length > 1 ? many('סוג', kinds.map((k) => [k, KIND[k] || k]), prefs.kinds) : null,
        langs.length > 1 ? many('שפה', langs.map((k) => [k, LANG[k] || k]), prefs.langs) : null,
        one('אמינות', [[0, 'הכל'], [3, '★★★ ומעלה'], [4, '★★★★ ומעלה']], prefs.minQ, (v) => { prefs.minQ = v; }),
        one('סדר', [['date', 'החדשות קודם'], ['quality', 'האמינות קודם']], prefs.sort, (v) => { prefs.sort = v; }),
        el('div', { class: 'fgroup' }, el('span', { class: 'flabel' }, 'תרגום'),
          el('div', { class: 'fchips' }, el('button', { class: 'fchip', 'aria-pressed': String(prefs.trTitles), title: 'מתרגם לעברית רק את הכותרות שעל המסך, בלי לתרגם את הכתבות', onclick: change(() => { prefs.trTitles = !prefs.trTitles; }) }, '🌐 תרגום כותרות'))),
        el('label', { class: 'toggle' }, el('input', { type: 'checkbox', checked: prefs.unreadOnly, onchange: (e) => change(() => { prefs.unreadOnly = e.target.checked; })() }), 'רק שלא נקראו'))));
  }

  /* ================= which articles ================= */
  function visible() {
    const active = new Set(activeFeeds().map((f) => f.id));
    let list = (history || (scope.type === 'starred' ? saved : items)).filter((i) => !i.hidden);
    if (scope.type === 'starred' && scope.folder != null) list = list.filter((i) => (i.folder || '') === scope.folder);
    // A custom feed has its own sources (the side filters don't apply to it).
    if (scope.type === 'custom') { const c = customOf(scope.id); const keep = new Set(c?.feedIds || []); list = list.filter((i) => keep.has(i.feedId)); }
    else if (scope.type !== 'starred') list = list.filter((i) => active.has(i.feedId) || !feedOf(i));
    if (scope.type === 'folder') list = list.filter((i) => feedOf(i)?.folder === scope.folder);
    if (scope.type === 'feed') list = list.filter((i) => i.feedId === scope.id);
    if (prefs.unreadOnly && scope.type !== 'starred') list = list.filter((i) => !i.read || i === current);
    const now = Date.now();
    if (prefs.range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); list = list.filter((i) => i.date >= d.getTime()); }
    else if (RANGES[prefs.range]?.[1]) list = list.filter((i) => i.date >= now - RANGES[prefs.range][1] * 86400e3);
    if (prefs.kinds.length) list = list.filter((i) => prefs.kinds.includes(i.kind || feedOf(i)?.kind));
    if (prefs.langs.length) list = list.filter((i) => prefs.langs.includes(i.lang || feedOf(i)?.lang));
    if (prefs.minQ) list = list.filter((i) => rating(i).q >= prefs.minQ);
    if (query && !history) {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((i) => { const t = `${i.title} ${titleHe[i.id] || ''} ${i.summary} ${i.feed}`.toLowerCase(); return words.every((w) => t.includes(w)); });
    }
    list = [...list];
    if (prefs.sort === 'quality') list.sort((a, b) => (rating(b).q - rating(a).q) || (b.date - a.date));
    else list.sort((a, b) => b.date - a.date);
    return list;
  }

  /* ================= the list: endless scroll into the history ================= */
  function metaLine(it) {
    const f = feedOf(it);
    const r = rating(it);
    const lang = it.lang || f?.lang;
    return el('div', { class: 'meta' },
      srcIcon(f, it.link), el('span', { class: 'k-src' }, it.feed), el('span', {}, '·'), el('span', {}, timeAgo(it.date)),
      lang && lang !== 'he' ? el('span', { class: 'k-lang' }, LANG[lang] || lang) : null,
      el('span', { class: 'k-q ' + r.tag, title: `אמינות: ${r.why}` }, stars(r.q)),
      r.short || (r.tag !== 'source' && r.tag !== 'mine' && VERDICT[r.tag]) ? el('span', { class: 'k-why ' + r.tag, title: r.why }, r.short || VERDICT[r.tag]) : null,
      r.tag === 'mine' ? el('span', { class: 'k-why mine', title: 'הדירוג שלכם לכתבה הזו' }, 'שלכם') : null);
  }

  function row(it) {
    const he = prefs.trTitles && titleHe[it.id];
    const node = el('article', { class: 'it' + (it.read ? ' read' : ''), 'data-id': it.id, tabindex: '0', 'aria-label': he || it.title },
      el('div', { class: 'it-main' },
        el('div', { class: 't', dir: 'auto' }, it.starred ? el('span', { class: 'star', 'aria-label': 'שמור' }, '★ ') : null, he || it.title),
        he ? el('div', { class: 't-orig', dir: 'auto' }, it.title) : null,
        metaLine(it)),
      it.image ? el('div', { class: 'thumb' }, el('img', { src: it.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.parentElement.remove() })) : null,
      menu(it));
    // A tap opens the article (the card flips to the full page); a long press opens the menu instead.
    let press = null, longPressed = false;
    node.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      longPressed = false;
      press = setTimeout(() => { longPressed = true; openMenu(node); if (navigator.vibrate) navigator.vibrate(12); }, 450);
    });
    const cancel = () => clearTimeout(press);
    node.addEventListener('pointerup', cancel); node.addEventListener('pointercancel', cancel); node.addEventListener('pointermove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancel(); });
    node.addEventListener('contextmenu', (e) => { if (longPressed || e.pointerType === 'touch') e.preventDefault(); });
    node.addEventListener('click', (e) => {
      if (e.target.closest('.it-menu')) return;
      if (longPressed) { longPressed = false; return; }
      if (node.classList.contains('menu-open')) { closeMenus(); return; }
      openArticle(it, node);
    });
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === node) openArticle(it, node); if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); openMenu(node); } });
    watchTitle(node, it);
    return node;
  }

  function redraw(it) {
    document.querySelectorAll(`.it[data-id="${CSS.escape(it.id)}"]`).forEach((n) => n.replaceWith(row(it)));
  }

  function resetList() {
    shown = 0;
    endOfHistory = !!history || scope.type === 'starred';
    $('#items').textContent = '';
    $('#items').className = 'items' + (prefs.cards ? ' cards' : '');
    $('#more').textContent = '';
    drawMore();
    updateMast();
  }

  /** Draw the next batch; when the loaded articles run out, bring older ones from the history. */
  async function drawMore() {
    const list = visible();
    const box = $('#items');
    if (shown === 0 && !list.length && endOfHistory) {
      box.append(el('p', { class: 'empty-list' }, history ? 'לא נמצאו כתבות בהיסטוריה של המקורות שלכם.' : query ? 'לא נמצאו כתבות שמתאימות לחיפוש.' : scope.type === 'starred' ? 'עוד לא שמרתם כתבות. ☆ בתפריט של כתבה שומר אותה.' : 'אין כאן כתבות כרגע 🎉'));
      return;
    }
    const next = list.slice(shown, shown + STEP);
    next.forEach((it) => box.append(row(it)));
    shown += next.length;
    if (shown < list.length) { setSentinel('more'); return; }
    if (endOfHistory) { setSentinel(shown ? 'end' : 'none'); return; }
    setSentinel('loading');
    await loadOlder();
  }

  async function loadOlder() {
    if (loadingOlder || endOfHistory) return;
    loadingOlder = true;
    try {
      const pool = items.filter((i) => i.date);
      const before = pool.length ? Math.min(...pool.map((i) => i.date)) : Date.now();
      const p = new URLSearchParams({ before, limit: 40 });
      const ids = activeFeeds().map((f) => f.id);
      if (scope.type === 'feed') p.set('feeds', scope.id);
      else if (scope.type === 'folder') p.set('feeds', activeFeeds().filter((f) => f.folder === scope.folder).map((f) => f.id).join(','));
      else if (scope.type === 'custom') p.set('feeds', (customOf(scope.id)?.feedIds || []).join(','));
      else if (ids.length < feeds.length) p.set('feeds', ids.join(','));
      const r = await api('/api/news/older?' + p);
      const have = new Set(items.map((i) => i.id));
      const fresh = tidy(r.items).filter((i) => !have.has(i.id));
      items.push(...fresh);
      if (!r.more) endOfHistory = true;
      loadingOlder = false;
      if (!fresh.length && !endOfHistory) return loadOlder(); // only duplicates: go further back
    } catch (e) { endOfHistory = true; loadingOlder = false; toast(e.message); }
    updateMast();
    drawMore();
  }

  let sentinelObs = null;
  function setSentinel(state) {
    const more = $('#more');
    more.replaceChildren(
      state === 'loading' ? el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'טוען כתבות קודמות מההיסטוריה…')
        : state === 'end' ? el('p', { class: 'muted end' }, '— זהו, אין עוד כתבות בהיסטוריה —')
          : state === 'more' ? el('div', { class: 'sentinel', 'aria-hidden': 'true' }) : '');
    if (state !== 'more') return;
    sentinelObs?.disconnect();
    sentinelObs = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { sentinelObs.disconnect(); drawMore(); } }, { rootMargin: '600px' });
    sentinelObs.observe(more.firstChild);
  }

  function updateMast() {
    const n = visible().length;
    $('#mastTitle').textContent = history ? `🔎 "${query}" בעבר` : scopeTitle();
    $('#mastSub').textContent = history ? `${n} כתבות מההיסטוריה של המקורות` : query ? `${n} כתבות מתאימות לחיפוש` : `${n} כתבות${endOfHistory ? '' : ' · גללו למטה לכתבות קודמות'}`;
  }

  function scopeTitle() {
    if (scope.type === 'starred') return scope.folder ? prefs.savedFolders.find((f) => f.id === scope.folder)?.name || 'שמורים' : scope.folder === '' ? 'שמורים בלי תיקייה' : 'שמורים';
    if (scope.type === 'custom') return customOf(scope.id)?.name || 'הפיד שלי';
    if (scope.type === 'folder') return scope.folder;
    if (scope.type === 'feed') return feeds.find((f) => f.id === scope.id)?.title || '';
    return 'כל הכתבות';
  }

  /* ================= the menu on each article (hover, long press, or the menu key) ================= */
  function menu(it) {
    const box = el('div', { class: 'it-menu', role: 'menu', 'aria-label': 'פעולות על הכתבה' });
    const act = (label, title, fn) => el('button', { role: 'menuitem', title, onclick: (e) => { e.stopPropagation(); fn(); } }, label);
    const draw = () => box.replaceChildren(
      act('🙈', 'הסתרת הכתבה', () => {
        it.hidden = true; mark([it.id], { hidden: true });
        document.querySelectorAll(`.it[data-id="${CSS.escape(it.id)}"]`).forEach((n) => { n.classList.add('leaving'); setTimeout(() => n.remove(), 300); });
        toast('הכתבה הוסתרה', 'בטל', () => { it.hidden = false; mark([it.id], { hidden: false }); resetList(); });
        renderSide();
      }),
      act(it.read ? '◯' : '✓', it.read ? 'סימון כלא נקראה' : 'סימון כנקראה', () => { it.read = !it.read; mark([it.id], { read: it.read }); redraw(it); renderSide(); }),
      act(it.starred ? '★' : '☆', it.starred ? 'שמור – להעביר או להסיר' : 'שמירה (בתיקייה)', () => (prefs.savedFolders.length || it.starred ? chooseFolder(it) : toggleStar(it))),
      act('⚖', 'דרגת האמינות של הכתבה', () => box.replaceChildren(
        ...[1, 2, 3, 4, 5].map((n) => act('★'.repeat(n), `${n} מתוך 5`, () => { it.rating = n; mark([it.id], { rating: n }); redraw(it); })),
        act('↺', 'חזרה לאמינות האוטומטית', () => { it.rating = null; mark([it.id], { rating: 0 }); redraw(it); }))));
    draw();
    return box;
  }
  function openMenu(node) { closeMenus(); node.classList.add('menu-open'); }
  function closeMenus() { document.querySelectorAll('.it.menu-open').forEach((n) => n.classList.remove('menu-open')); }
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.it.menu-open')) closeMenus(); });

  /** Save (or unsave) without a folder – the quick way when there are no folders yet. */
  function toggleStar(it) {
    if (it.starred) return unsave(it);
    it.starred = true;
    mark([it.id], { starred: true, snapshot: snapshot(it) });
    if (!saved.some((s) => s.id === it.id)) saved.unshift({ ...it, starred: true, read: true });
    toast('נשמר בשמורים');
    redraw(it); renderSide();
  }

  /* ================= translating headlines only ================= */
  let titleObs = null, titleQueue = new Map(), titleTimer = null;
  function watchTitle(node, it) {
    if (!prefs.trTitles || titleHe[it.id] || (it.lang || feedOf(it)?.lang || 'he') === 'he') return;
    titleObs = titleObs || new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { titleObs.unobserve(e.target); const one = [...(history || items)].find((x) => x.id === e.target.dataset.id); if (one) titleQueue.set(one.id, one); }
      clearTimeout(titleTimer); titleTimer = setTimeout(flushTitles, 250);
    }, { rootMargin: '200px' });
    titleObs.observe(node);
  }
  async function flushTitles() {
    const batch = [...titleQueue.values()].slice(0, 30);
    batch.forEach((i) => titleQueue.delete(i.id));
    if (!batch.length) return;
    try {
      const r = await api('/api/news/titles', { body: { items: batch.map((i) => ({ id: i.id, title: i.title })) } });
      Object.assign(titleHe, r.titles);
      batch.forEach((i) => { if (r.titles[i.id]) redraw(i); });
    } catch (e) { toast(e.message); }
    if (titleQueue.size) flushTitles();
  }

  /* ================= the same story in independent outlets ================= */
  async function corroborateAll() {
    const sample = items.filter((i) => !i.hidden && !(i.id in corro)).sort((a, b) => b.date - a.date).slice(0, 160);
    if (sample.length < 2) return;
    try {
      const r = await api('/api/news/corroborate', { body: { items: sample.map((i) => ({ id: i.id, title: i.title, feedId: i.feedId })) } });
      sample.forEach((i) => { corro[i.id] = r.byId[i.id] || { others: 0, outlets: [] }; });
      // Redraw only the rows whose rating line changed.
      sample.forEach((i) => { if (corro[i.id].others) redraw(i); else if (rating(i).tag === 'lone') redraw(i); });
    } catch (_) { /* corroboration is a bonus: the list works without it */ }
  }

  /* ================= loading ================= */
  async function load() {
    renderSide();
    if (!items.length) { $('#items').replaceChildren(el('div', { class: 'loading', style: 'padding:30px' }, el('span', { class: 'spinner' }), 'טוען כתבות…')); }
    try {
      const [r, s] = await Promise.all([api('/api/news/items'), api('/api/news/starred').catch(() => ({ items: saved }))]);
      items = tidy(r.items);
      errors = r.errors;
      saved = tidy(s.items);
      // An article that is both loaded and saved shares its folder.
      const folderOf = new Map(saved.map((x) => [x.id, x.folder]));
      items.forEach((i) => { if (folderOf.has(i.id)) i.folder = folderOf.get(i.id); });
    } catch (e) { toast(e.message); }
    renderSide();
    renderFilters();
    resetList();
    corroborateAll();
  }
  async function loadFeeds() { feeds = (await api('/api/news/feeds')).feeds; }
  async function mark(ids, patch) { try { await api('/api/news/state', { body: { ids, ...patch } }); } catch (e) { toast(e.message); } }

  /* ================= search (and the past: the history plus the web) ================= */
  let searchTimer, searchNo = 0;
  async function runSearch() {
    query = $('#q').value.trim();
    const no = ++searchNo;
    const web = $('#webResults');
    if ($('#histSw').checked && query.length >= 2) {
      $('#mastSub').textContent = 'מחפש בעבר…';
      const p = new URLSearchParams({ q: query });
      if (RANGES[prefs.range]?.[1]) p.set('days', RANGES[prefs.range][1]);
      const ids = activeFeeds().map((f) => f.id);
      if (ids.length && ids.length < feeds.length) p.set('feeds', ids.join(','));
      // The family's own history comes at once; the web search (Gemini) follows above it.
      web.hidden = false;
      web.replaceChildren(el('h3', {}, '🌐 מהאינטרנט'), el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'מחפש באינטרנט עם Gemini… (עד חצי דקה)'));
      api('/api/news/websearch?' + new URLSearchParams({ q: query, days: RANGES[prefs.range]?.[1] || 120 })).then((r) => {
        if (no !== searchNo) return;
        const list = tidy(r.articles);
        web.replaceChildren(el('h3', {}, `🌐 מהאינטרנט (${list.length})`),
          list.length ? el('div', { class: 'items' + (prefs.cards ? ' cards' : '') }, list.map(row)) : el('p', { class: 'muted' }, 'לא נמצאו כתבות ברשת.'));
      }).catch((e) => { if (no === searchNo) web.replaceChildren(el('h3', {}, '🌐 מהאינטרנט'), el('p', { class: 'muted' }, e.message)); });
      try { history = tidy((await api('/api/news/search?' + p)).items); } catch (e) { history = []; toast(e.message); }
      if (no !== searchNo) return;
    } else { history = null; web.hidden = true; web.replaceChildren(); }
    resetList();
  }
  $('#q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, $('#histSw').checked ? 600 : 200); });
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#q').value = ''; runSearch(); } if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(); } });
  $('#histSw').addEventListener('change', runSearch);

  /* ================= the article: the card flips into a panel with the gist; the full article on request ================= */
  /* without AI (docs/ai/without-ai.md #6): the article's opening, Google's translation of the page, who else reports it */
  const googleTranslate = (url) => `https://translate.google.com/translate?sl=auto&tl=iw&u=${encodeURIComponent(url)}`;
  const googleNews = (title) => `https://news.google.com/search?q=${encodeURIComponent(title)}&hl=iw&gl=IL&ceid=IL:he`;
  const aiInvite = () => H.loadOnce('/assets/ai-invite.js').then(() => H.aiInvite?.()).catch(() => toast('אפשר לחבר AI בהגדרות ← חיבור לשירותים'));
  const upgrade = (text) => el('button', { type: 'button', class: 'linklike small ai-up offer', onclick: aiInvite }, text);
  const ICON = {
    amlek: '✨', ivrut: '🌐', tachles: '🔍', full: '📖', back: '↩', out: '↗', more: '⋯', prev: '→', next: '←',
  };

  /** One tidy row of tools: the main action, three helpers (אמלק / עברת / תכלס) and "more" for the rest. */
  function toolbar(it, ctx) {
    const lang = it.lang || feedOf(it)?.lang || 'he';
    const tool = (icon, label, title, fn, extra = {}) => el('button', { class: 'tool', title, onclick: fn, ...extra }, el('span', { class: 'tool-i', 'aria-hidden': 'true' }, icon), el('span', { class: 'tool-l' }, label));
    const moreMenu = el('div', { class: 'tool-menu', role: 'menu', hidden: true });
    H.back?.watch?.(moreMenu, () => { moreMenu.hidden = true; });
    const moreBtn = tool(ICON.more, 'עוד', 'עוד פעולות', (e) => { e.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; }, { 'aria-haspopup': 'menu' });
    const item = (label, fn) => el('button', { role: 'menuitem', onclick: () => { moreMenu.hidden = true; fn(); } }, label);
    moreMenu.append(
      it.kind !== 'websearch' ? item(it.starred ? '★ שמור – להעביר או להסיר' : '☆ שמירה', () => chooseFolder(it)) : null,
      item('📤 שיתוף', () => share(it)),
      item(it.kind === 'telegram' ? '↗ פתיחה בטלגרם' : '↗ פתיחה באתר המקורי', () => window.open(it.link, '_blank', 'noopener')),
      lang !== 'he' && it.kind !== 'telegram' ? item('🌐 תרגום הדף ב־Google', () => window.open(googleTranslate(it.link), '_blank', 'noopener')) : null,
      ctx.full && it.kind !== 'telegram' ? item(ctx.embed ? '📄 חזרה לתצוגת קריאה' : '🖼 האתר המקורי בתוך החלונית', () => ctx.toggleEmbed()) : null);
    return el('div', { class: 'tools' },
      ctx.main,
      el('div', { class: 'tool-row' },
        tool(ICON.amlek, 'אַמְלֵק לִי', 'סיכום קצר של הכתבה', ctx.amlek),
        lang !== 'he' ? tool(ICON.ivrut, 'עַבְרֵת לי', 'תרגום הכתבה לעברית', ctx.ivrut) : null,
        tool(ICON.tachles, 'בדוק אם תכלס', 'בדיקה מול מקורות בלתי תלויים ברשת', ctx.tachles),
        el('div', { class: 'tool-more' }, moreBtn, moreMenu)));
  }

  // One listener closes any open "more" menu when tapping elsewhere.
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.tool-more')) document.querySelectorAll('.tool-menu').forEach((m) => { m.hidden = true; }); }, { capture: true });

  async function openArticle(it, origin) {
    closeMenus();
    current = it;
    if (!it.read) { it.read = true; mark([it.id], { read: true }); origin?.classList.add('read'); renderSide(); }
    const f = feedOf(it);
    const lang = it.lang || f?.lang || 'he';
    const list = it.kind === 'websearch' ? [it] : visible();
    const idx = list.indexOf(it);
    const r0 = rating(it);
    const boxes = { amlek: el('div'), tachles: el('div'), ivrut: el('div') };
    const textOf = () => it.body || it.summary || '';
    const isPost = it.kind === 'telegram' || (it.body && it.body.length > 40);

    // The helpers, shared by the panel and the full article.
    const amlek = async (e) => {
      const b = e?.currentTarget; if (b) b.disabled = true;
      boxes.amlek.replaceChildren(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'מאמלק…'));
      try {
        const s = await api('/api/news/summary', { body: { url: it.link, text: textOf() } });
        boxes.amlek.replaceChildren(s.via === 'lead'
          ? el('div', { class: 'note-box amlek plain' }, el('b', {}, '📰 הפתיחה של הכתבה'), el('ul', {}, s.bullets.map((x) => el('li', { dir: 'auto' }, x))),
            el('small', { class: 'muted' }, 'המשפטים הראשונים, כפי שנכתבו. '), upgrade('✨ לסיכום של העוזר החכם'))
          : el('div', { class: 'note-box amlek' }, el('b', {}, '✨ אמלק'), el('ul', {}, s.bullets.map((x) => el('li', {}, x)))));
      } catch (err) { boxes.amlek.replaceChildren(); toast(err.message); if (b) b.disabled = false; }
    };
    const tachles = async (e) => {
      const b = e?.currentTarget; if (b) b.disabled = true;
      boxes.tachles.replaceChildren(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'בודק מול מקורות בלתי תלויים… (עד חצי דקה)'));
      try {
        const v = await api('/api/news/verify', { body: { id: it.id, title: it.title, summary: it.summary, link: it.link, feed: it.feed, date: it.date } });
        it.verified = { status: v.status, rating: v.rating };
        boxes.tachles.replaceChildren(el('div', { class: 'note-box verdict v-' + v.status },
          el('div', { class: 'v-head' }, el('b', {}, VERDICT[v.status] || 'נבדק'), el('span', { class: 'k-q' }, stars(v.rating))),
          v.explanation_he ? el('p', {}, v.explanation_he) : null,
          v.sources?.length ? el('div', { class: 'v-sources' }, el('small', { class: 'muted' }, 'מקורות בלתי תלויים:'), v.sources.map((s) => el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title || new URL(s.url).hostname))) : null));
        redraw(it);
      } catch (err) {
        // without AI: who else among the sources reports the same story (by its words), the source's rating, and a search
        const c = corro[it.id], f = feedOf(it);
        boxes.tachles.replaceChildren(el('div', { class: 'note-box verdict plain' },
          el('b', {}, '🔍 בדיקה בלי העוזר החכם'),
          el('p', {}, c?.others ? `גם ${c.outlets.join(', ')} ${c.others > 1 ? 'מדווחים' : 'מדווח'} על זה.` : 'לא מצאתי את הסיפור אצל מקורות אחרים שלכם (עדיין).'),
          f?.quality ? el('p', { class: 'muted' }, `דירוג המקור: ${stars(f.quality)}`) : null,
          el('div', { class: 'row' }, el('a', { class: 'btn ghost small', href: googleNews(it.title), target: '_blank', rel: 'noopener' }, '↗ מי עוד מדווח (Google News)'), upgrade('✨ בדיקה מול מקורות ברשת'))));
        if (err.status !== 402 && err.status !== 503) toast(err.message);
      }
      if (b) b.disabled = false;
    };
    let translated = null;
    const ivrut = async (e, into) => {
      const b = e?.currentTarget;
      if (translated) { boxes.ivrut.replaceChildren(); translated = null; return; }
      if (b) b.disabled = true;
      boxes.ivrut.replaceChildren(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'מעברת…'));
      try {
        const t = await api('/api/news/translate', { body: { url: it.link, title: it.title, text: it.body || '' } });
        translated = t;
        boxes.ivrut.replaceChildren(el('div', { class: 'note-box translated' }, el('p', { class: 'tr-note' }, `🌐 עוברת מ${t.from || LANG[lang] || 'השפה המקורית'}`),
          el('h3', { class: 'tr-title' }, t.title_he), ...(into === 'full' ? t.paragraphs : t.paragraphs.slice(0, 3)).map((p) => el('p', {}, p)),
          into === 'full' || t.paragraphs.length <= 3 ? null : el('button', { class: 'link', onclick: () => showFull(true) }, 'לכל הכתבה בעברית ←')));
      } catch (err) {
        // without AI: Google's translation of the page (only its address goes there)
        boxes.ivrut.replaceChildren(it.kind === 'telegram' ? '' : el('div', { class: 'note-box plain' },
          el('b', {}, '🌐 תרגום בלי העוזר החכם'),
          el('div', { class: 'row' }, el('a', { class: 'btn ghost small', href: googleTranslate(it.link), target: '_blank', rel: 'noopener' }, '↗ הכתבה בעברית ב־Google Translate'), upgrade('✨ תרגום של העוזר החכם'))));
        if (err.status !== 402 && err.status !== 503) toast(err.message);
      }
      if (b) b.disabled = false;
    };

    const head = () => [
      el('div', { class: 'a-nav' },
        el('button', { class: 'mini', disabled: idx <= 0, onclick: () => nav(-1), title: 'הכתבה הקודמת (k)', 'aria-label': 'הכתבה הקודמת' }, ICON.prev),
        el('button', { class: 'mini', disabled: idx < 0 || idx >= list.length - 1, onclick: () => nav(1), title: 'הכתבה הבאה (j)', 'aria-label': 'הכתבה הבאה' }, ICON.next)),
      el('div', { class: 'a-kicker' }, srcIcon(f, it.link), el('span', { class: 'k-src' }, it.feed), el('span', { class: 'k-q', title: `אמינות: ${r0.why}` }, stars(r0.q)),
        r0.short || r0.tag === 'mine' ? el('span', { class: 'k-why ' + r0.tag, title: r0.why }, r0.short || 'שלכם') : null),
      el('h2', { class: 'a-title', dir: 'auto' }, it.title),
      titleHe[it.id] ? el('p', { class: 'a-title-he' }, titleHe[it.id]) : null,
      el('div', { class: 'a-byline' }, [new Date(it.date).toLocaleString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), f?.country, LANG[lang], f?.category ? CATEGORY[f.category] : null].filter(Boolean).join(' · ')),
    ];
    const nav = (d) => { const next = list[idx + d]; if (next) openArticle(next, null); };

    // 1. The panel: the picture, the headline and the gist. The full article only when asked for.
    const panel = () => {
      const main = isPost
        ? el('a', { class: 'btn primary tool-main', href: it.link, target: '_blank', rel: 'noopener' }, it.kind === 'telegram' ? '↗ לפוסט בטלגרם' : '↗ לכתבה באתר')
        : el('button', { class: 'btn primary tool-main', onclick: () => showFull(false) }, `${ICON.full} לכתבה המלאה`);
      const gist = isPost ? textOf() : (it.summary && it.summary !== it.title ? it.summary : '');
      return [
        it.image ? el('div', { class: 'a-hero' }, el('img', { src: it.image, alt: '', referrerpolicy: 'no-referrer', onerror: (e) => e.target.parentElement.remove() })) : null,
        ...head(),
        gist ? el('div', { class: 'a-gist', dir: 'auto' }, gist.split(/\n+/).map((p) => el('p', {}, p))) : el('p', { class: 'muted' }, 'אין תקציר לכתבה הזו. אפשר לפתוח את הכתבה המלאה, או לבקש אמלק.'),
        boxes.tachles, boxes.amlek, boxes.ivrut,
        toolbar(it, { main, amlek, ivrut: (e) => ivrut(e, 'panel'), tachles, full: false }),
      ];
    };

    // 2. The full article in a larger panel (the original site is one click away).
    let embed = false;
    const showFull = async (inHebrew) => {
      const body = el('div', { class: 'a-body' });
      const main = el('div', { class: 'tool-main-pair' },
        el('button', { class: 'btn ghost tool-main', onclick: () => H.sheet.open(null, panel(), { className: 'news-sheet', size: 'panel' }) }, `${ICON.back} לתקציר`),
        el('a', { class: 'btn primary tool-main', href: it.link, target: '_blank', rel: 'noopener' }, `${ICON.out} לכתבה במקור`));
      const render = () => H.sheet.open(null, [
        ...head(), boxes.tachles, boxes.amlek, boxes.ivrut,
        toolbar(it, { main, amlek, ivrut: (e) => ivrut(e, 'full'), tachles, full: true, embed, toggleEmbed: () => { embed = !embed; showFull(false); } }),
        body,
      ], { className: 'news-sheet full-article', size: 'large' });
      render();
      if (inHebrew && translated) { boxes.ivrut.replaceChildren(); translated = null; ivrut(null, 'full'); }
      if (embed) {
        body.append(el('p', { class: 'muted', style: 'font-size:.82rem' }, 'חלק מהאתרים חוסמים הצגה בתוך חלונית. אם היא ריקה – חזרו לתצוגת קריאה או פתחו במקור.'),
          el('iframe', { src: it.link, sandbox: 'allow-scripts allow-same-origin allow-popups', referrerpolicy: 'no-referrer', title: it.title }));
        return;
      }
      body.append(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'טוען את הכתבה…'));
      try {
        const a = await api('/api/news/article?url=' + encodeURIComponent(it.link));
        if (current !== it) return;
        body.replaceChildren(el('div', { class: 'content', dir: a.dir || 'auto', html: a.content }));
      } catch (err) {
        if (current !== it) return;
        body.replaceChildren(it.summary ? el('p', { class: 'content', dir: 'auto' }, it.summary) : '',
          el('p', { class: 'notice warn' }, err.message + ' ', el('a', { href: it.link, target: '_blank', rel: 'noopener' }, 'לכתבה במקור ↗')));
      }
    };

    H.sheet.open(origin, panel(), { className: 'news-sheet', size: 'panel' });
  }

  async function share(it) {
    try {
      if (navigator.share) await navigator.share({ title: it.title, url: it.link });
      else { await navigator.clipboard.writeText(`${it.title}\n${it.link}`); toast('הקישור הועתק'); }
    } catch (_) { /* cancelled */ }
  }

  /* ================= controls & keys ================= */
  $('#mastDate').textContent = (() => {
    const d = new Date();
    const g = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    let heb = '';
    try { heb = d.toLocaleDateString('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (_) { /* older browsers */ }
    return heb ? `${g} · ${heb}` : g;
  })();
  $('#viewBtn').addEventListener('click', () => { prefs.cards = !prefs.cards; savePrefs(); resetList(); });
  $('#refresh').addEventListener('click', () => { history = null; $('#histSw').checked = false; $('#webResults').hidden = true; load(); });
  $('#menuBtn').addEventListener('click', () => { const open = !$('#side').classList.contains('open'); $('#side').classList.toggle('open', open); $('#sideShade').hidden = !open; $('#menuBtn').setAttribute('aria-expanded', String(open)); });
  $('#sideShade').addEventListener('click', closeSide);
  H.back?.watch?.($('#side'), closeSide, () => $('#side').classList.contains('open'));   // the back gesture closes the side menu
  $('#markAll').addEventListener('click', async () => {
    const list = visible().filter((i) => !i.read);
    if (!list.length) return toast('הכל כבר נקרא');
    list.forEach((i) => { i.read = true; });
    resetList(); renderSide();
    const ids = list.map((i) => i.id);
    for (let i = 0; i < ids.length; i += 500) await mark(ids.slice(i, i + 500), { read: true });
    toast(`${ids.length} כתבות סומנו כנקראו`);
  });
  window.addEventListener('helper:prefs', (e) => { if (e.detail === 'news') { renderSide(); renderFilters(); resetList(); } });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (H.sheet.isOpen && current) {
      const list = visible(); const i = list.indexOf(current);
      if (e.key === 'j' && list[i + 1]) openArticle(list[i + 1], null);
      if (e.key === 'k' && list[i - 1]) openArticle(list[i - 1], null);
      if (e.key === 'o') window.open(current.link, '_blank', 'noopener');
      return;
    }
    if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
  });

  await loadFeeds();
  load();
  setInterval(() => { if (!document.hidden && scope.type !== 'starred' && !history && !H.sheet.isOpen) load(); }, 10 * 60 * 1000);
})();
