/* מסעדות שלנו – the family's own restaurants (the owner's choice A, docs/ai/restaurants.md): where we go and where we
   want to go, with where it is, what kind, kosher or not, a note, a ❤, and "we went today". Shared by the household,
   no outside source and no AI. The look is design's (.rs-*); the inline rules only hold the layout until then. */
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

  const chips = el('div', { class: 'rs-filters', role: 'radiogroup', 'aria-label': 'סינון', style: 'display:flex;flex-wrap:wrap;gap:6px' });
  const search = el('input', { type: 'search', placeholder: 'חיפוש לפי שם, מקום או סוג', 'aria-label': 'חיפוש מסעדה', dir: 'auto',
    style: 'inline-size:100%;padding:10px 14px;font:inherit;border-radius:999px;border:1px solid var(--line-strong);background:var(--card);color:var(--text)',
    oninput: (e) => { q = e.target.value.trim(); drawList(); } });
  const listBox = el('div', { class: 'rs-list', role: 'list', style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))' });

  function draw() {
    chips.replaceChildren(...FILTERS.map(([id, name]) => el('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(filter === id),
      style: filter === id ? 'background:var(--vine);border-color:var(--vine);color:var(--chalk-raised,#f7f6f0)' : null,
      onclick: () => { filter = id; draw(); } }, name)));
    drawList();
  }
  function drawList() {
    const rs = shown();
    if (!list.length) {
      listBox.replaceChildren(el('div', { class: 'card rs-empty', style: 'padding:22px;text-align:center' },
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
    const node = el('article', { class: 'card rs-card' + (r.id === want ? ' rs-wanted' : ''), id: 'r-' + r.id, role: 'listitem',
      style: 'display:grid;gap:8px;padding:16px;align-content:start' + (r.id === want ? ';outline:3px solid var(--vine);outline-offset:2px' : '') },
      el('div', { style: 'display:flex;align-items:start;gap:8px' },
        el('div', { style: 'flex:1;min-inline-size:0' },
          el('h3', { dir: 'auto', style: 'margin:0;font-size:1.1rem' }, r.name),
          el('small', { class: 'muted' }, [r.place, r.cuisine].filter(Boolean).join(' · ') || ' ')),
        heart),
      el('div', { class: 'rs-tags', style: 'display:flex;flex-wrap:wrap;gap:6px;font-size:.85rem' },
        r.kosher ? el('span', { class: 'rs-kosher ' + r.kosher, style: 'padding:2px 10px;border-radius:999px;border:1px solid var(--line-strong)' }, KOSHER[r.kosher]) : null,
        el('span', { class: 'muted' }, r.visitedAt ? `היינו ${ago(r.visitedAt)}` : 'עוד לא היינו')),
      r.note ? el('p', { dir: 'auto', style: 'margin:0;white-space:pre-line' }, r.note) : null,
      el('div', { class: 'rs-acts', style: 'display:flex;flex-wrap:wrap;gap:6px' },
        went,
        el('a', { class: 'btn small ghost', href: mapsLink(r), target: '_blank', rel: 'noopener' }, r.link ? '🔗 קישור' : '🗺 במפה'),
        r.phone ? el('a', { class: 'btn small ghost', href: 'tel:' + r.phone.replace(/[^\d+]/g, '') }, '📞 ' + r.phone) : null,
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => edit(r) }, '✎ עריכה')));
    return node;
  }

  /** a new restaurant, or one to change (and to delete) */
  function edit(r = null) {
    const f = (label, input) => el('label', { style: 'display:grid;gap:4px' }, el('span', { class: 'small muted' }, label), input);
    const inp = (v, o = {}) => el('input', { type: 'text', value: v || '', dir: 'auto', style: 'font:inherit;padding:8px 12px;border-radius:12px;border:1px solid var(--line-strong);background:var(--bg);color:var(--text)', ...o });
    const name = inp(r?.name, { required: true, maxlength: 120, placeholder: 'למשל: חומוס אבו שוקרי' });
    const place = inp(r?.place, { maxlength: 160, placeholder: 'עיר, שכונה או כתובת' });
    const cuisine = inp(r?.cuisine, { maxlength: 60, list: 'rs-cuisines', placeholder: 'למשל: חומוסיה' });
    const kosher = el('select', { style: 'font:inherit;padding:8px 12px;border-radius:12px;border:1px solid var(--line-strong);background:var(--bg);color:var(--text)' },
      Object.entries(KOSHER).map(([v, t]) => el('option', { value: v, selected: (r?.kosher || '') === v }, t)));
    const link = inp(r?.link, { type: 'url', dir: 'ltr', maxlength: 500, placeholder: 'https://… (אתר, תפריט או מפה)' });
    const phone = inp(r?.phone, { type: 'tel', dir: 'ltr', maxlength: 30, placeholder: '02-1234567' });
    const note = el('textarea', { rows: 3, dir: 'auto', maxlength: 1000, placeholder: 'מה הזמנו, מה כדאי, למי זה מתאים…',
      style: 'font:inherit;padding:8px 12px;border-radius:12px;border:1px solid var(--line-strong);background:var(--bg);color:var(--text)' }, r?.note || '');
    const fav = el('input', { type: 'checkbox', checked: !!r?.fav });
    H.modal(el('h2', {}, r ? 'עריכת מסעדה' : 'מסעדה חדשה'),
      el('datalist', { id: 'rs-cuisines' }, CUISINES.map((c) => el('option', { value: c }))),
      el('form', { style: 'display:grid;gap:10px', onsubmit: async (e) => {
        e.preventDefault();
        const b = e.target.querySelector('button[type=submit]'); b.disabled = true;
        try {
          await api(r ? `/api/restaurants/${r.id}` : '/api/restaurants', { method: r ? 'PUT' : 'POST',
            body: { name: name.value, place: place.value, cuisine: cuisine.value, kosher: kosher.value, link: link.value, phone: phone.value, note: note.value, fav: fav.checked } });
          H.closeModal(); toast(r ? 'נשמר' : 'נוסף לרשימה'); await load();
        } catch (err) { toast(err.message || 'לא נשמר'); b.disabled = false; }
      } },
        f('שם', name), f('איפה', place), f('איזה אוכל', cuisine), f('כשרות', kosher), f('קישור (לא חובה)', link), f('טלפון (לא חובה)', phone), f('הערה', note),
        el('label', { style: 'display:flex;align-items:center;gap:8px' }, fav, '❤ מהאהובות שלנו'),
        el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' },
          el('button', { class: 'btn primary', type: 'submit' }, 'שמירה'),
          r ? el('button', { class: 'btn ghost', type: 'button', onclick: async () => {
            if (!confirm(`למחוק את "${r.name}" מהרשימה?`)) return;
            try { await api(`/api/restaurants/${r.id}`, { method: 'DELETE' }); H.closeModal(); toast('נמחק'); await load(); } catch (err) { toast(err.message); }
          } }, 'מחיקה') : null)));
    setTimeout(() => name.focus(), 50);
  }

  root.append(el('div', { class: 'rs', style: 'max-inline-size:1100px;margin:0 auto;padding-block:14px 40px;display:grid;gap:12px' },
    el('a', { class: 'folder-back', href: '/food/' }, '‹ אוכל'),
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px' },
      el('h1', { style: 'margin:0' }, 'מסעדות שלנו'),
      el('button', { class: 'btn primary', type: 'button', onclick: () => edit() }, '+ מסעדה')),
    search, chips, listBox));
  try { await load(); } catch (_) { listBox.replaceChildren(el('p', {}, 'הרשימה לא נטענה. נסו שוב בעוד רגע.')); return; }
  if (want) document.getElementById('r-' + want)?.scrollIntoView({ block: 'center' });
})();
