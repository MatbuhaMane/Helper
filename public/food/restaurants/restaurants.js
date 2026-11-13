/* מסעדות שלנו – the family's own restaurants (the owner's choice A, docs/ai/restaurants.md): where we go and where we
   want to go, with where it is, what kind, kosher or not, a note, a ❤, and "we went today". Shared by the household,
   no outside source and no AI. The look is design's (.rs-*); the inline rules only hold the layout until then.
   "מה יש בסביבה" (the owner's choice C) asks Google Places, on request only: around the city in the settings, or
   where the device is now (with its permission, not kept). Google's answer is shown, marked "Google Maps", and
   never stored; adding one to our list keeps only Google's place ID with the family's own words (Google's terms: its
   names and addresses may not be stored, so they are shown in the form for reference and the person types their own). */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('מסעדות שלנו');
  const root = document.querySelector('main');
  const KOSHER = { '': 'כשרות לא ידועה', kosher: 'כשר', mehadrin: 'כשר למהדרין', no: 'לא כשר' };
  const CUISINES = ['חומוסיה', 'בשרים', 'דגים', 'חלבי', 'איטלקי', 'פיצה', 'בורגר', 'שווארמה', 'אסייתי', 'סושי', 'מזרחי', 'קפה', 'גלידה', 'טבעוני'];
  let list = [], filter = 'all', q = '';
  const want = new URLSearchParams(location.search).get('open');

  const ago = (t) => {
    const d = Math.floor((Date.now() - t) / 864e5);
    return d <= 0 ? 'היום' : d === 1 ? 'אתמול' : d < 30 ? `לפני ${d} ימים` : d < 60 ? 'לפני חודש' : `לפני ${Math.floor(d / 30)} חודשים`;
  };
  const mapsLink = (r) => r.link || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([r.name, r.place].filter(Boolean).join(' '))}`;
  const norm = (s) => String(s || '').toLowerCase();

  async function load() { list = (await api('/api/restaurants')).restaurants || []; draw(); }

  const FILTERS = [['all', 'הכל'], ['fav', '❤ אהובות'], ['kosher', 'כשרות'], ['missed', 'מזמן לא היינו'], ['never', 'עוד לא היינו']];
  const shown = () => list.filter((r) => (!q || norm([r.name, r.place, r.cuisine, r.note].join(' ')).includes(norm(q))) && (
    filter === 'all' || (filter === 'fav' && r.fav) || (filter === 'kosher' && (r.kosher === 'kosher' || r.kosher === 'mehadrin'))
    || (filter === 'missed' && r.visitedAt && Date.now() - r.visitedAt >= 30 * 864e5) || (filter === 'never' && !r.visitedAt)));

  const chips = el('div', { class: 'rs-filters', role: 'radiogroup', 'aria-label': 'סינון' });
  const search = el('input', { type: 'search', placeholder: 'חיפוש לפי שם, מקום או סוג', 'aria-label': 'חיפוש מסעדה', dir: 'auto',
    oninput: (e) => { q = e.target.value.trim(); drawList(); } });
  const listBox = el('div', { class: 'rs-list', role: 'list' });

  function draw() {
    chips.replaceChildren(...FILTERS.map(([id, name]) => el('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(filter === id),
      onclick: () => { filter = id; draw(); } }, name)));
    drawList();
  }
  function drawList() {
    const rs = shown();
    if (!list.length) {
      listBox.replaceChildren(el('div', { class: 'card rs-empty' },
        el('p', {}, 'עוד אין כאן מסעדות.'),
        el('p', { class: 'muted' }, 'הוסיפו את המקומות שאתם אוהבים, ואת אלה שרוצים לנסות. כל המשפחה רואה את אותה רשימה.'),
        el('button', { class: 'btn primary', type: 'button', onclick: () => edit() }, '+ מסעדה')));
      return;
    }
    listBox.replaceChildren(...(rs.length ? rs.map(card) : [el('p', { class: 'muted' }, 'אין מסעדה כזאת ברשימה.')]));
  }

  function card(r) {
    const heart = el('button', { type: 'button', class: 'btn ghost small rs-fav', 'aria-pressed': String(r.fav), 'aria-label': r.fav ? 'להסיר מהאהובות' : 'לאהובות',
      title: r.fav ? 'להסיר מהאהובות' : 'לאהובות', onclick: async () => {
        const on = !r.fav; r.fav = on; drawList();
        try { await api(`/api/restaurants/${r.id}/fav`, { body: { fav: on } }); } catch (_) { r.fav = !on; drawList(); toast('לא נשמר – בדקו את החיבור'); }
      } }, r.fav ? '❤' : '♡');
    const went = el('button', { type: 'button', class: 'btn small', onclick: async () => {
      r.visitedAt = Date.now(); drawList();
      try {
        await api(`/api/restaurants/${r.id}/visit`, { body: {} });
        toast(`רשמתי: הייתם היום ב${r.name}`, 'ביטול', async () => {
          await api(`/api/restaurants/${r.id}/visit`, { body: { undo: true } });
          await load();
        });
      } catch (_) { toast('לא נשמר – בדקו את החיבור'); await load(); }
    } }, 'היינו היום');
    const node = el('article', { class: 'card rs-card' + (r.id === want ? ' rs-wanted' : ''), id: 'r-' + r.id, role: 'listitem' },
      el('div', {},
        el('div', {},
          el('h3', { dir: 'auto' }, r.name),
          el('small', { class: 'muted' }, [r.place, r.cuisine].filter(Boolean).join(' · ') || ' ')),
        heart),
      el('div', { class: 'rs-tags' },
        r.kosher ? el('span', { class: 'rs-kosher ' + r.kosher }, KOSHER[r.kosher]) : null,
        el('span', { class: 'muted' }, r.visitedAt ? `היינו ${ago(r.visitedAt)}` : 'עוד לא היינו')),
      r.note ? el('p', { dir: 'auto' }, r.note) : null,
      el('div', { class: 'rs-acts' },
        went,
        el('a', { class: 'btn small ghost', href: mapsLink(r), target: '_blank', rel: 'noopener' }, r.link ? '🔗 קישור' : '🗺 במפה'),
        r.phone ? el('a', { class: 'btn small ghost', href: 'tel:' + r.phone.replace(/[^\d+]/g, '') }, '📞 ' + r.phone) : null,
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => edit(r) }, '✎ עריכה')));
    return node;
  }

  /** a new restaurant, or one to change (and to delete) */
  function edit(r = null, from = null, onSaved = null) {
    const f = (label, input) => el('label', { class: 'field' }, el('span', {}, label), input);
    const inp = (v, o = {}) => el('input', { type: 'text', value: v || '', dir: 'auto', ...o });
    const name = inp(r?.name, { required: true, maxlength: 120, placeholder: 'למשל: חומוס אבו שוקרי' });
    const place = inp(r?.place, { maxlength: 160, placeholder: 'עיר, שכונה או כתובת' });
    const cuisine = inp(r?.cuisine, { maxlength: 60, list: 'rs-cuisines', placeholder: 'למשל: חומוסיה' });
    const kosher = el('select', {},
      Object.entries(KOSHER).map(([v, t]) => el('option', { value: v, selected: (r?.kosher || '') === v }, t)));
    // from a search: a link to the place by its ID (a plain URL, nothing of Google's content)
    const link = inp(r?.link ?? (from ? `https://www.google.com/maps/place/?q=place_id:${from.id}` : ''), { type: 'url', dir: 'ltr', maxlength: 500, placeholder: 'https://… (אתר, תפריט או מפה)' });
    const phone = inp(r?.phone, { inputmode: 'tel', autocomplete: 'tel', dir: 'ltr', maxlength: 30, placeholder: '02-1234567' });
    const note = el('textarea', { rows: 3, dir: 'auto', maxlength: 1000, placeholder: 'מה הזמנו, מה כדאי, למי זה מתאים…' }, r?.note || '');
    const fav = el('input', { type: 'checkbox', checked: !!r?.fav });
    H.modal(...[el('h2', {}, r ? 'עריכת מסעדה' : from ? 'להוסיף לרשימה שלנו' : 'מסעדה חדשה'),
      el('datalist', { id: 'rs-cuisines' }, CUISINES.map((c) => el('option', { value: c }))),
      from ? el('div', { class: 'rs-from card' },
        el('small', { class: 'muted' }, 'ב־Google Maps:'), el('b', { dir: 'auto' }, from.name), el('small', { class: 'muted', dir: 'auto' }, [from.kind, from.address].filter(Boolean).join(' · ')),
        el('small', { class: 'muted' }, 'כתבו את השם במילים שלכם. מ־Google נשמר רק הקישור למקום.')) : null,
      el('form', { onsubmit: async (e) => {
        e.preventDefault();
        const b = e.target.querySelector('button[type=submit]'); b.disabled = true;
        try {
          await api(r ? `/api/restaurants/${r.id}` : '/api/restaurants', { method: r ? 'PUT' : 'POST',
            body: { name: name.value, place: place.value, cuisine: cuisine.value, kosher: kosher.value, link: link.value, phone: phone.value, note: note.value, fav: fav.checked,
              ...(from?.id ? { placeId: from.id } : {}) } });
          H.closeModal(); toast(r ? 'נשמר' : 'נוסף לרשימה'); await load(); onSaved?.();
        } catch (err) { toast(err.message || 'לא נשמר'); b.disabled = false; }
      } },
        f('שם', name), f('איפה', place), f('איזה אוכל', cuisine), f('כשרות', kosher), f('קישור (לא חובה)', link), f('טלפון (לא חובה)', phone), f('הערה', note),
        el('label', {}, fav, '❤ מהאהובות שלנו'),
        el('div', {},
          el('button', { class: 'btn primary', type: 'submit' }, 'שמירה'),
          r ? el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
            if (!confirm(`למחוק את "${r.name}" מהרשימה?`)) return;
            try { await api(`/api/restaurants/${r.id}`, { method: 'DELETE' }); H.closeModal(); toast('נמחק'); await load(); } catch (err) { toast(err.message); }
          } }, 'מחיקה') : null))].filter(Boolean));
    setTimeout(() => name.focus(), 50);
  }

  /* ---------- מה יש בסביבה: Google Places, on request ---------- */
  const near = el('details', { class: 'card rs-near' }, el('summary', {}, '🔎 מה יש בסביבה'));
  const nearOut = el('div', { class: 'rs-near-out' });
  const ERR = { places_quota: 'נגמרו החיפושים שלך לחודש הזה. הם יתחדשו בתחילת החודש הבא.', places_month_full: 'החיפוש ב־Google נח עד תחילת החודש הבא.',
    places_not_configured: 'החיפוש ב־Google עוד לא הוגדר באוהל.', no_city: 'בחרו עיר בהגדרות, או חפשו לידכם.', places_error: 'Google לא ענה כרגע. נסו שוב בעוד רגע.' };
  async function drawNear() {
    let st = null;
    try { st = await api('/api/restaurants/search'); } catch (_) { /* offline */ }
    const city = (H.prefs('me', { city: '' }).city || '').trim();
    const kosherOnly = el('input', { type: 'checkbox' });
    const left = el('small', { class: 'muted' }, st?.left === null || st?.left === undefined ? '' : `נשארו לך ${st.left} חיפושים החודש`);
    const go = async (q, btn) => {
      btn.disabled = true;
      nearOut.replaceChildren(el('p', { class: 'muted' }, 'מחפש…'));
      try {
        const r = await api('/api/restaurants/search', { body: q });
        if (r.left !== null && r.left !== undefined) left.textContent = `נשארו לך ${r.left} חיפושים החודש`;
        nearOut.replaceChildren(...(r.places.length ? r.places.map(placeCard) : [el('p', { class: 'muted' }, 'לא נמצאו מסעדות.')]),
          // Google's terms: its content is marked as Google Maps', apart from ours
          el('p', { class: 'rs-attrib small muted', dir: 'ltr' }, 'Google Maps'));
      } catch (e) { nearOut.replaceChildren(el('p', {}, ERR[e.code] || e.message || 'החיפוש לא הצליח')); }
      btn.disabled = false;
    };
    const cityBtn = el('button', { class: 'btn small', type: 'button', disabled: !city, onclick: (e) => go({ city, kosher: kosherOnly.checked }, e.currentTarget) }, city ? `ב${city}` : 'בעיר שלי');
    const hereBtn = el('button', { class: 'btn small', type: 'button', onclick: (e) => {
      const b = e.currentTarget;
      if (!navigator.geolocation) { toast('המכשיר הזה לא יודע איפה הוא'); return; }
      b.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => { b.disabled = false; go({ lat: Math.round(pos.coords.latitude * 1e4) / 1e4, lng: Math.round(pos.coords.longitude * 1e4) / 1e4 }, b); },
        () => { b.disabled = false; toast('צריך לאשר לדפדפן לדעת איפה אתם'); }, { timeout: 15000, maximumAge: 300000 });
    } }, '📍 לידי עכשיו');
    near.replaceChildren(
      el('summary', {}, '🔎 מה יש בסביבה'),
      !st?.configured ? el('p', { class: 'muted' }, ERR.places_not_configured) : el('div', {},
        el('div', {}, cityBtn, hereBtn,
          el('label', {}, kosherOnly, 'רק כשרות (בחיפוש לפי עיר)')),
        !city ? el('p', { class: 'small muted' }, 'כדי לחפש לפי עיר, ', el('a', { href: '/settings/#place' }, 'בחרו עיר בהגדרות'), '.') : null,
        left, nearOut));
  }
  const placeCard = (p) => el('div', { class: 'rs-place' },
    el('div', {}, el('b', { dir: 'auto' }, p.name), el('br'), el('small', { class: 'muted', dir: 'auto' }, [p.kind, p.address].filter(Boolean).join(' · '))),
    p.maps ? el('a', { class: 'btn small ghost', href: p.maps, target: '_blank', rel: 'noopener' }, '🗺 ב־Google Maps') : null,
    list.some((r) => r.placeId === p.id) ? el('small', { class: 'muted' }, '✓ ברשימה שלנו')
      : el('button', { class: 'btn small', type: 'button', onclick: (e) => { const b = e.currentTarget; edit(null, p, () => b.replaceWith(el('small', { class: 'muted' }, '✓ ברשימה שלנו'))); } }, '+ לרשימה שלנו'));
  near.addEventListener('toggle', () => { if (near.open && !near.dataset.drawn) { near.dataset.drawn = '1'; drawNear(); } });

  root.append(el('div', { class: 'rs' },
    el('a', { class: 'folder-back', href: '/food/' }, '‹ אוכל'),
    el('div', {},
      el('h1', {}, 'מסעדות שלנו'),
      el('button', { class: 'btn primary', type: 'button', onclick: () => edit() }, '+ מסעדה')),
    near, search, chips, listBox));
  try { await load(); } catch (_) { listBox.replaceChildren(el('p', {}, 'הרשימה לא נטענה. נסו שוב בעוד רגע.')); return; }
  if (want) document.getElementById('r-' + want)?.scrollIntoView({ block: 'center' });
})();
