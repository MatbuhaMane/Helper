// פרופיל המשפחה (docs/vision/family-profile.md; the look: /family/profile.css, design's markup contract in
// docs/design/prototype/family-profile.html). The server sends only what this viewer may see (server/family-profile.ts):
// an item they may not see arrives as { gap: true } and shows as an empty spot, with no text.
(() => {
  const { el, api, toast, modal, closeModal } = H;
  const main = document.querySelector('main.fp');
  const q = location.search;                              // ?t=invitation link | ?h=household, passed on as is
  const svg = (d, extra = '') => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = `<path d="${d}"/>${extra}`;
    return s;
  };
  const ICON = {
    eye: () => svg('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', '<circle cx="12" cy="12" r="3"/>'),
    pin: () => svg('M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z', '<circle cx="12" cy="10" r="2.5"/>'),
    tree: () => svg('M12 22v-8M12 14c-4 0-7-2.5-7-6a7 7 0 0 1 14 0c0 3.5-3 6-7 6z'),
    flame: () => svg('M12 3c1.5 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7z'),
    bowl: () => svg('M3 12h18M5 12a7 7 0 0 0 14 0M12 5v2'),
  };
  const COVER_NAMES = { olive: 'זית', hills: 'גבעות', sea: 'ים', desert: 'מדבר', fields: 'שדות' };
  let P = null;                                           // the profile as the server sent it
  const edits = () => P.mine;                             // a head saves, any other member suggests
  const gap = (tag, cls = '') => el(tag, { class: (cls + ' fp-gap').trim(), 'aria-hidden': 'true' });

  function seesLabel() {
    if (!P.mine) return P.reach === 'link' ? 'נפתח לך בקישור הזמנה' : 'פתוח למשפחות המקושרות';
    const o = P.open || {};
    return o.tribe && o.link ? 'בני הבית, המשפחות המקושרות ומי שקיבל קישור' : o.tribe ? 'בני הבית והמשפחות המקושרות' : o.link ? 'בני הבית ומי שקיבל קישור' : 'בני הבית בלבד';
  }
  const coverSrc = () => (P.cover === 'own' && P.coverUrl ? P.coverUrl : `/assets/covers/${P.cover}.svg`);

  /* ---------------- the page ---------------- */

  function render() {
    main.textContent = '';
    main.removeAttribute('aria-busy');
    const name = P.title || 'המשפחה שלנו';
    document.title = name + ' – פרופיל המשפחה';

    const cover = el('header', { class: 'fp-cover' }, el('img', { class: 'fp-cover-img', src: coverSrc(), alt: '' }));
    if (P.head) cover.append(el('button', { class: 'fp-cover-btn', type: 'button', onclick: coverWindow }, 'החלפת תמונה'));
    const seal = el('span', { class: 'fp-seal', 'aria-hidden': 'true' }, (name.replace(/^משפחת\s+/, '')[0] || 'א'));
    const who = el('div', { class: 'fp-who' },
      el('h1', { class: 'fp-name' }, name),
      P.line ? el('p', { class: 'fp-line' }, P.line) : null,
      P.mine ? el('button', { type: 'button', class: 'fp-sees', onclick: P.head ? openWindow : null, disabled: !P.head, 'aria-label': 'מי רואה: ' + seesLabel() }, ICON.eye(), seesLabel())
        : el('span', { class: 'fp-sees' }, ICON.eye(), seesLabel()));
    main.append(cover, el('div', { class: 'fp-id' }, seal, who));
    if (P.mine && !P.head) main.append(el('p', { class: 'fp-suggest' }, 'מה שתשנו כאן יגיע לראש הבית כהצעה, והוא יאשר.'));
    if (P.head && P.suggestions.length) main.append(suggestionsBox());
    if (P.mine) main.append(el('div', { class: 'fp-edit-row', style: 'padding-inline:16px' }, el('button', { class: 'fp-add', type: 'button', onclick: wordsWindow }, P.head ? '✎ עריכת השם והשורה' : '✎ הצעה לשם ולשורה')));

    // the people of the household
    main.append(el('ul', { class: 'fp-people', 'aria-label': 'בני הבית' }, ...P.people.map((p) => (p.gap
      ? gap('li', 'fp-person')
      : el('li', {}, el('span', { class: 'fp-person' }, el('span', { class: 'fp-face', 'aria-hidden': 'true' }, (p.name || '?')[0]), el('span', {}, p.name)))))));

    const grid = el('div', { class: 'fp-grid' });
    grid.append(card('מאיפה באנו', ICON.pin(), P.origins.length
      ? [el('ol', { class: 'fp-road' }, ...P.origins.map((o) => el('li', {}, el('span', { class: 'fp-stop' }, el('b', {}, o.place), o.years ? el('small', {}, o.years) : null))))]
      : empty('עוד לא כתבתם מאיפה באתם.'), originsWindow, 'מקומות'));
    grid.append(P.tree
      ? el('section', { class: 'fp-card' }, el('h2', { class: 'fp-h' }, ICON.tree(), 'העץ שלנו'),
        el('a', { class: 'fp-window', href: '/family/' },
          el('span', { class: 'fp-mini' }, ...['ground', 'trunk', 'boughs', 'crown'].map((x) => el('img', { src: `/assets/tree/olive/${x}.svg`, alt: '' }))),
          el('span', { class: 'fp-go' }, 'לעץ המשפחה')))
      : gap('section', 'fp-card'));
    grid.append(card('מסורות', ICON.flame(), P.traditions ? [el('p', { class: 'fp-said' }, P.traditions)] : empty('מנהגים, חגים וניגונים של המשפחה.'), traditionsWindow, 'מסורות'));
    const dishes = card('המתכונים שלנו', ICON.bowl(), P.dishes.length
      ? [el('ul', { class: 'fp-dishes' }, ...P.dishes.map((d) => el('li', {}, d.gap
        ? gap('span', 'fp-dish')
        : el('a', { class: 'fp-dish', href: '/groceries/#book' }, d.image ? el('img', { src: d.image, alt: '', loading: 'lazy' }) : el('span', { class: 'fp-plate', 'aria-hidden': 'true' }), d.title))))]
      : empty('כמה מתכונים שבחרתם מספר המתכונים.'), dishesWindow, 'מתכונים');
    dishes.classList.add('wide');
    grid.append(dishes);
    main.append(grid);
  }
  function empty(text) { return P.mine ? [el('p', { class: 'fp-empty' }, text)] : [el('p', { class: 'fp-empty' }, 'עוד אין כאן כלום.')]; }
  function card(title, icon, body, edit, what) {
    const s = el('section', { class: 'fp-card' }, el('h2', { class: 'fp-h' }, icon, title), ...body);
    if (edits()) s.append(el('button', { class: 'fp-add', type: 'button', onclick: edit }, (P.head ? '✎ עריכת ' : '✎ הצעה ל') + what));
    return s;
  }

  /* ---------------- saving: a head saves, anyone else suggests ---------------- */

  async function save(patch) {
    try {
      const r = await api('/api/family/profile', { method: 'PUT', body: patch });
      closeModal();
      toast(r.suggested ? 'ההצעה נשלחה לראש הבית' : 'נשמר');
      await load();
    } catch (e) { toast(e.message || 'לא נשמר'); }
  }
  const field = (label, input) => el('label', { class: 'field' }, el('span', {}, label), input);
  const actions = (onSave) => el('div', { class: 'row', style: 'gap:8px;justify-content:flex-end;margin-block-start:12px' },
    el('button', { class: 'btn', type: 'button', 'data-close': true }, 'ביטול'),
    el('button', { class: 'btn primary', type: 'button', onclick: onSave }, P.head ? 'שמירה' : 'שליחת הצעה'));

  function wordsWindow() {
    const title = el('input', { type: 'text', maxlength: '60', value: P.title || '', placeholder: 'משפחת …' });
    const line = el('input', { type: 'text', maxlength: '160', value: P.line || '', placeholder: 'משפט אחד שאתם כותבים על עצמכם' });
    modal(el('h2', {}, 'השם והשורה'), field('שם המשפחה', title), field('השורה', line), actions(() => save({ title: title.value, line: line.value })));
  }
  function traditionsWindow() {
    const t = el('textarea', { rows: '6', maxlength: '2000', placeholder: 'מנהגים, חגים וניגונים' });
    t.value = P.traditions || '';
    modal(el('h2', {}, 'מסורות'), field('מה חשוב לכם לספר', t), actions(() => save({ traditions: t.value })));
  }
  function originsWindow() {
    const list = el('div', { class: 'fp-origins-edit', style: 'display:grid;gap:8px' });
    const row = (o = { place: '', years: '' }) => {
      const r = el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
        el('input', { type: 'text', maxlength: '40', value: o.place, placeholder: 'מקום', 'aria-label': 'מקום', style: 'flex:2 1 140px' }),
        el('input', { type: 'text', maxlength: '30', value: o.years, placeholder: 'שנים', 'aria-label': 'שנים', style: 'flex:1 1 90px' }),
        el('button', { class: 'btn small', type: 'button', 'aria-label': 'הסרת המקום', onclick: () => r.remove() }, '✕'));
      list.append(r);
    };
    (P.origins.length ? P.origins : [undefined]).forEach((o) => row(o));
    modal(el('h2', {}, 'מאיפה באנו'), el('p', { class: 'muted' }, 'מהמקום הראשון עד היום, למשל מרוקו ואחר כך ירושלים.'), list,
      el('button', { class: 'fp-add', type: 'button', onclick: () => list.childElementCount < 8 && row() }, '+ עוד מקום'),
      actions(() => save({ origins: [...list.children].map((r) => { const [a, b] = r.querySelectorAll('input'); return { place: a.value, years: b.value }; }) })));
  }
  async function dishesWindow() {
    let all = [];
    try { all = (await api('/api/recipes')).recipes || []; } catch (e) { return toast(e.message || 'ספר המתכונים לא נפתח'); }
    if (!all.length) return toast('אין עדיין מתכונים בספר המתכונים');
    const chosen = new Set(P.dishes.filter((d) => !d.gap).map((d) => d.id));
    const box = el('div', { style: 'display:grid;gap:6px;max-block-size:50vh;overflow:auto' }, ...all.map((r) => el('label', { class: 'row', style: 'gap:8px' },
      el('input', { type: 'checkbox', value: r.id, checked: chosen.has(r.id) }), el('span', {}, r.title))));
    modal(el('h2', {}, 'המתכונים שלנו'), el('p', { class: 'muted' }, 'עד שמונה מתכונים. הם נראים רק לבני הבית.'), box,
      actions(() => save({ dishes: [...box.querySelectorAll('input:checked')].map((i) => i.value).slice(0, 8) })));
  }

  /* ---------------- heads only: the cover, who sees it, the suggestions ---------------- */

  function coverWindow() {
    const opts = P.covers.map((c) => el('button', { class: 'fp-cover-opt', type: 'button', 'aria-pressed': String(P.cover === c), onclick: () => save({ cover: c }) },
      el('img', { src: `/assets/covers/${c}.svg`, alt: '' }), COVER_NAMES[c] || c));
    const file = el('input', { type: 'file', accept: 'image/*', onchange: () => file.files[0] && upload(file.files[0]) });
    modal(el('h2', {}, 'תמונת הקאבר'), el('div', { class: 'fp-covers' }, ...opts,
      el('label', { class: 'fp-cover-opt' }, el('span', { class: 'fp-own', 'aria-hidden': 'true' }, '+'), 'תמונה שלכם', file)));
  }
  /** the photo is made small here (1600 px wide at most, JPEG) before it goes up */
  async function upload(f) {
    try {
      const img = await createImageBitmap(f);
      const k = Math.min(1, 1600 / img.width), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
      const r = await fetch('/api/family/profile/cover', { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob });
      if (!r.ok) throw new Error(r.status === 413 ? 'התמונה גדולה מדי' : 'התמונה לא עלתה');
      closeModal(); toast('הקאבר הוחלף'); await load();
    } catch (e) { toast(e.message || 'התמונה לא עלתה'); }
  }
  function openWindow() {
    const tribe = el('input', { type: 'checkbox', checked: !!P.open?.tribe });
    const out = el('div', { class: 'fp-link-out', 'aria-live': 'polite' });
    const post = async (b) => {
      try {
        const r = await api('/api/family/profile/open', { method: 'POST', body: b });
        if (r.link) {
          const url = location.origin + r.link;
          out.textContent = '';
          out.append(el('p', { class: 'muted' }, 'הקישור מוצג פעם אחת. מי שמקבל אותו ונכנס לאוהל רואה את הפרופיל, בלי האנשים והמתכונים.'),
            el('input', { type: 'text', readonly: true, value: url, 'aria-label': 'קישור ההזמנה', onfocus: (e) => e.target.select() }),
            el('button', { class: 'btn small', type: 'button', onclick: () => navigator.clipboard?.writeText(url).then(() => toast('הקישור הועתק')) }, 'העתקה'));
        }
        await load(true);
        if (!r.link) toast('נשמר');
      } catch (e) { toast(e.message || 'לא נשמר'); }
    };
    tribe.addEventListener('change', () => post({ tribe: tribe.checked }));
    modal(el('h2', {}, 'מי רואה את הפרופיל'),
      el('p', { class: 'muted' }, 'בני הבית רואים תמיד. אדם או מתכון שמוגדרים פרטיים נשארים פרטיים גם כאן: מי שלא רשאי לראות רואה מקום ריק.'),
      el('label', { class: 'row', style: 'gap:8px' }, tribe, el('span', {}, 'פתוח גם למשפחות המקושרות (השבט)')),
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-block-start:12px' },
        el('button', { class: 'btn', type: 'button', onclick: () => post({ link: 'make' }) }, P.open?.link ? 'קישור הזמנה חדש (הישן יפסיק לעבוד)' : 'יצירת קישור הזמנה'),
        P.open?.link ? el('button', { class: 'btn', type: 'button', onclick: () => post({ link: 'remove' }) }, 'ביטול הקישור') : null),
      out);
  }
  const FIELD = { title: 'השם', line: 'השורה', cover: 'הקאבר', origins: 'מאיפה באנו', traditions: 'המסורות', dishes: 'המתכונים' };
  function suggestionsBox() {
    return el('section', { class: 'fp-card fp-suggest', 'aria-label': 'הצעות מבני הבית' },
      el('h2', { class: 'fp-h' }, 'הצעות מבני הבית'),
      ...P.suggestions.map((s) => el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center' },
        el('span', {}, `${s.by} מציע/ה לשנות את ${Object.keys(s.patch).map((k) => FIELD[k] || k).join(', ')}`),
        s.patch.line !== undefined ? el('q', {}, s.patch.line) : null,
        el('button', { class: 'btn small primary', type: 'button', onclick: () => decide(s.id, true) }, 'אישור'),
        el('button', { class: 'btn small', type: 'button', onclick: () => decide(s.id, false) }, 'לא עכשיו'))));
  }
  async function decide(id, approve) {
    try { await api('/api/family/profile/suggestions/' + encodeURIComponent(id), { method: 'POST', body: { approve } }); toast(approve ? 'אושר' : 'ההצעה הוסרה'); await load(); }
    catch (e) { toast(e.message || 'לא נשמר'); }
  }

  /* ---------------- loading ---------------- */

  async function load(quiet) {
    try { P = await api('/api/family/profile' + q); render(); }
    catch (e) {
      if (quiet) return;
      main.textContent = ''; main.removeAttribute('aria-busy');
      main.append(el('div', { class: 'fp-card' }, el('h1', { class: 'fp-h' }, 'הפרופיל לא נפתח'),
        el('p', { class: 'fp-empty' }, e.status === 404 || /not_found/.test(e.message || '') ? 'הפרופיל הזה לא פתוח בפניך, או שהקישור כבר לא בתוקף.' : (e.message || 'נסו שוב מאוחר יותר.')),
        el('a', { class: 'fp-link', href: '/family/' }, 'לעץ המשפחה')));
    }
  }
  H.header('פרופיל המשפחה');
  H.requireLogin().then(() => load()).catch(() => {});
})();
