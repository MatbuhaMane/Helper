/* פתקים: dated notes with a title the helper writes, each editable (it saves itself as you type).
   Text marked anywhere on the site comes here with "שמירה כפתק" (assets/capture.js), with a link back to where it was. */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('פתקים');
  const root = document.querySelector('main');
  let notes = [], open = null, q = '';

  const fmtDay = (t) => {
    const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const diff = Math.round((today - day) / 864e5);
    return diff === 0 ? 'היום' : diff === 1 ? 'אתמול' : diff < 7 ? 'השבוע' : d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  };
  const stamp = (t) => new Date(t).toLocaleString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const norm = (s) => String(s || '').toLowerCase();

  const search = el('input', { type: 'search', placeholder: 'חיפוש בפתקים', 'aria-label': 'חיפוש בפתקים', dir: 'auto' });
  search.addEventListener('input', () => { q = search.value.trim(); drawList(); });
  const listBox = el('div', { class: 'nt-list' });
  const editor = el('section', { class: 'nt-editor card', hidden: true, 'aria-label': 'הפתק' });

  function drawList() {
    const shown = notes.filter((n) => !q || norm(n.title + ' ' + n.body).includes(norm(q)));
    if (!notes.length) { listBox.replaceChildren(el('div', { class: 'nt-empty' }, el('p', {}, 'עוד אין פתקים.'), el('p', { class: 'muted' }, 'סמנו טקסט בכל מקום באתר – כתבה, מתכון, שיר – ולחצו "שמירה כפתק". או כתבו פתק חדש.'))); return; }
    if (!shown.length) { listBox.replaceChildren(el('p', { class: 'muted nt-none' }, 'לא נמצא פתק כזה.')); return; }
    const groups = new Map();
    for (const n of shown) { const g = fmtDay(n.createdAt); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(n); }
    listBox.replaceChildren(...[...groups].map(([g, ns]) => el('section', { class: 'nt-group' }, el('h3', {}, g),
      ns.map((n) => el('button', { type: 'button', class: 'nt-item' + (open?.id === n.id ? ' on' : ''), onclick: () => edit(n) },
        el('b', { dir: 'auto' }, n.title || 'פתק'),
        el('span', { class: 'nt-snip', dir: 'auto' }, n.body.replace(/\s+/g, ' ').slice(0, 120)),
        el('small', {}, new Date(n.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }), n.source ? ' · ' + (n.source.title || 'מהאתר') : ''))))));
  }

  let saveT = 0;
  function edit(n) {
    open = n;
    const title = el('input', { class: 'nt-title', value: n.title, 'aria-label': 'כותרת', dir: 'auto', placeholder: 'כותרת (תיכתב לבד אם תשאירו ריק)' });
    const text = el('textarea', { class: 'nt-body', 'aria-label': 'הפתק', dir: 'auto', placeholder: 'כתבו כאן…' });
    text.value = n.body;
    const state = el('small', { class: 'nt-state' }, 'נשמר');
    const save = () => {
      clearTimeout(saveT); state.textContent = 'שומר…';
      saveT = setTimeout(async () => {
        try {
          const r = await api(`/api/notes/${n.id}`, { method: 'PUT', body: { title: title.value, body: text.value } });
          Object.assign(n, r.note);
          if (document.activeElement !== title && title.value !== n.title) title.value = n.title;   // a title the helper wrote
          state.textContent = 'נשמר'; notes.sort((a, b) => b.updatedAt - a.updatedAt); drawList();
        } catch (_) { state.textContent = 'לא נשמר – בדקו את החיבור'; }
      }, 700);
    };
    title.addEventListener('input', save); text.addEventListener('input', save);
    editor.replaceChildren(
      el('div', { class: 'nt-ed-head' }, el('button', { class: 'btn ghost small nt-back', type: 'button', onclick: close }, '‹ כל הפתקים'), el('span', { class: 'spacer' }), state,
        el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (!confirm('למחוק את הפתק?')) return; await api(`/api/notes/${n.id}`, { method: 'DELETE' }); notes = notes.filter((x) => x.id !== n.id); close(); toast('הפתק נמחק'); } }, 'מחיקה')),
      title,
      el('div', { class: 'nt-meta' }, el('span', {}, 'נוצר ' + stamp(n.createdAt)), n.updatedAt - n.createdAt > 60e3 ? el('span', {}, ' · נערך ' + stamp(n.updatedAt)) : null,
        n.source ? el('a', { href: n.source.url, class: 'nt-src' }, '↩ ' + (n.source.title || 'המקור')) : null),
      text);
    editor.hidden = false; document.body.classList.add('nt-editing');
    drawList();
    setTimeout(() => (n.body ? text : title).focus(), 30);
  }
  function close() { open = null; editor.hidden = true; document.body.classList.remove('nt-editing'); drawList(); }
  async function newNote() {
    const r = await api('/api/notes', { body: { title: '', body: '' } });
    notes.unshift(r.note); edit(r.note);
  }

  root.append(el('div', { class: 'nt' },
    el('a', { class: 'folder-back', href: '/tools/' }, '‹ כלים'),
    el('div', { class: 'nt-head' }, el('h1', {}, 'פתקים'), el('button', { class: 'btn primary', type: 'button', onclick: newNote }, '+ פתק חדש')),
    el('div', { class: 'nt-cols' }, el('div', { class: 'nt-side' }, el('div', { class: 'nt-search' }, search), listBox), editor)));
  try { notes = (await api('/api/notes')).notes; } catch (_) { listBox.replaceChildren(el('p', {}, 'הפתקים לא נטענו.')); return; }
  drawList();
  const want = new URLSearchParams(location.search).get('open');
  if (want) { const n = notes.find((x) => x.id === want); if (n) edit(n); }
})();
