/* פתקים: dated notes with a title the helper writes, each editable.
   Pasting (the owner, 2026-11-13, in place of the old "שמירה כפתק" popup on marked text): Ctrl+V anywhere on the page outside a
   field opens a new note with the text (or adds it to the open note), and "הדבקה" reads the clipboard where the browser lets
   it, or opens an empty note with the cursor in it for a long-press paste. The explicit "שמירה כפתק" buttons elsewhere stay.
   Editing (vision batch 4, item 5): a note changes only when it is saved ("שמירה", or Ctrl+S), so an existing note is never
   spoiled by accident. Closing with changes asks "לבטל את השינויים?", leaving the page asks too, and until then the draft
   is kept on this device. A new note reaches the server only when it is first saved. A star puts a note first.
   "☁ ל־Drive" saves a note as a Google Doc in the person's own Drive (drive.file: the helper sees only what it made);
   the first time, Google asks them, and they come back to the same note with the save done.
   Without AI (docs/ai/without-ai.md #12): a #word in a note is a tag (the server finds them); the tags are chips above the
   list, and one filters it. The title is the note's first line when no AI writes one. */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('פתקים');
  const root = document.querySelector('main');
  let notes = [], open = null, q = '', onlyStars = false, tag = null;

  const fmtDay = (t) => {
    const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const diff = Math.round((today - day) / 864e5);
    return diff === 0 ? 'היום' : diff === 1 ? 'אתמול' : diff < 7 ? 'השבוע' : d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  };
  const stamp = (t) => new Date(t).toLocaleString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const norm = (s) => String(s || '').toLowerCase();

  /* the draft of the note being edited, on this device only (a crash or a closed tab does not lose it) */
  const DRAFT = 'helper.notes.draft';
  const keepDraft = (d) => { try { d ? localStorage.setItem(DRAFT, JSON.stringify(d)) : localStorage.removeItem(DRAFT); } catch (_) { /* private mode */ } };
  const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (_) { return null; } };

  const search = el('input', { type: 'search', placeholder: 'חיפוש בפתקים', 'aria-label': 'חיפוש בפתקים', dir: 'auto' });
  search.addEventListener('input', () => { q = search.value.trim(); drawList(); });
  const starFilter = el('button', { type: 'button', class: 'btn ghost small nt-starfilter', 'aria-pressed': 'false', title: 'רק הפתקים שסימנתם בכוכב',
    onclick: () => { onlyStars = !onlyStars; starFilter.setAttribute('aria-pressed', String(onlyStars)); starFilter.textContent = onlyStars ? '★ רק מסומנים' : '☆ מסומנים'; drawList(); } }, '☆ מסומנים');
  const listBox = el('div', { class: 'nt-list' });
  // the tags of all the notes, most used first; one picked filters the list
  const tagBox = el('div', { class: 'nt-tags', role: 'group', 'aria-label': 'תגיות' });
  function drawTags() {
    const count = new Map();
    for (const n of notes) for (const t of n.tags || []) count.set(t, (count.get(t) || 0) + 1);
    if (tag && !count.has(tag)) tag = null;
    tagBox.hidden = !count.size;
    tagBox.replaceChildren(...[...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he')).slice(0, 24).map(([t, k]) =>
      el('button', { type: 'button', class: 'chip nt-tag', 'aria-pressed': String(tag === t), title: `${k} פתקים`, onclick: () => { tag = tag === t ? null : t; drawTags(); drawList(); } }, '#' + t)));
  }
  const editor = el('section', { class: 'nt-editor card', hidden: true, 'aria-label': 'הפתק' });

  async function toggleStar(n) {
    const want = !n.starred;
    n.starred = want; drawList(); drawStar?.();
    if (!n.id) return;                                   // a new note: saved with it
    try { await api(`/api/notes/${n.id}`, { method: 'PUT', body: { starred: want } }); }
    catch (_) { n.starred = !want; drawList(); drawStar?.(); toast('הכוכב לא נשמר – בדקו את החיבור'); }
  }
  const starBtn = (n) => el('button', { type: 'button', class: 'btn ghost small nt-star' + (n.starred ? ' on' : ''), 'aria-pressed': String(!!n.starred),
    'aria-label': n.starred ? 'להסיר את הכוכב' : 'לסמן בכוכב', title: n.starred ? 'להסיר את הכוכב' : 'לסמן בכוכב',
    onclick: (e) => { e.stopPropagation(); toggleStar(n); } }, n.starred ? '★' : '☆');

  function drawList() {
    const shown = notes.filter((n) => n.id && (!q || norm(n.title + ' ' + n.body).includes(norm(q))) && (!onlyStars || n.starred) && (!tag || (n.tags || []).includes(tag)));
    if (!notes.some((n) => n.id)) { listBox.replaceChildren(el('div', { class: 'nt-empty' }, el('p', {}, 'עוד אין פתקים.'), el('p', { class: 'muted' }, 'העתיקו טקסט מכל מקום – כתבה, מתכון, שיר – והדביקו כאן (Ctrl+V או "הדבקה"), והוא נפתח כפתק חדש. או כתבו פתק חדש.'))); return; }
    if (!shown.length) { listBox.replaceChildren(el('p', { class: 'muted nt-none' }, onlyStars && !q && !tag ? 'עוד אין פתקים מסומנים בכוכב.' : 'לא נמצא פתק כזה.')); return; }
    const groups = new Map();
    const starred = shown.filter((n) => n.starred);
    if (starred.length && !onlyStars) groups.set('★ מסומנים', starred);
    for (const n of shown) {
      if (n.starred && !onlyStars) continue;
      const g = fmtDay(n.createdAt); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(n);
    }
    listBox.replaceChildren(...[...groups].map(([g, ns]) => el('section', { class: 'nt-group' }, el('h3', {}, g),
      ns.map((n) => el('div', { class: 'nt-row' },
        el('button', { type: 'button', class: 'nt-item' + (open?.note === n ? ' on' : ''), onclick: () => edit(n) },
          el('b', { dir: 'auto' }, n.title || 'פתק'),
          el('span', { class: 'nt-snip', dir: 'auto' }, n.body.replace(/\s+/g, ' ').slice(0, 120)),
          el('small', {}, new Date(n.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }), n.source ? ' · ' + (n.source.title || 'מהאתר') : '', n.tags?.length ? ' · ' + n.tags.map((t) => '#' + t).join(' ') : '')),
        starBtn(n))))));
  }

  /** a note to the person's Drive: the first time, Google's own consent (drive.file), then back here to finish */
  async function toDrive(n, btn) {
    if (open?.note === n && open.changed() && !(await open.save())) return;
    if (btn) { btn.disabled = true; btn.textContent = 'שומר ב־Drive…'; }
    try {
      const r = await api(`/api/notes/${n.id}/drive`, { method: 'POST', body: {} });
      n.drive = { at: Date.now() };
      toast('נשמר ב־Drive שלך', 'לפתוח', () => window.open(r.url, '_blank', 'noopener'));
    } catch (e) {
      if (e.code === 'drive_not_connected') {
        const back = `/tools/notes/?open=${encodeURIComponent(n.id)}&drive=1`;
        H.modal(el('h2', {}, 'שמירה ב־Google Drive'),
          el('p', {}, 'בפעם הראשונה Google ישאל אם לתת לאוהל גישה ל־Drive שלך.'),
          el('p', { class: 'muted' }, 'הגישה היא רק לקבצים שהאוהל עצמו יוצר: הוא לא רואה שום דבר אחר ב־Drive. הפתקים יישמרו בתיקייה "האוהל · פתקים".'),
          el('div', { class: 'nt-modal-acts' },
            el('a', { class: 'btn primary', href: `/api/auth/login?drive=1&next=${encodeURIComponent(back)}` }, 'להמשיך ל־Google'),
            el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'לא עכשיו')));
      } else toast('לא נשמר ב־Drive – נסו שוב בעוד רגע');
    }
    if (btn) { btn.disabled = false; btn.textContent = '☁ ל־Drive'; }
  }

  let drawStar = null;
  /** open a note to edit; `draft` brings back what was typed and not saved (on this device) */
  function edit(n, draft) {
    if (open && open.note !== n) { if (!leave(() => edit(n, draft))) return; }
    const title = el('input', { class: 'nt-title', value: draft?.title ?? n.title, 'aria-label': 'כותרת', dir: 'auto', placeholder: 'כותרת (תיכתב לבד אם תשאירו ריק)' });
    const text = el('textarea', { class: 'nt-body', 'aria-label': 'הפתק', dir: 'auto', placeholder: 'כתבו כאן… (#מילה היא תגית)' });
    text.value = draft?.body ?? n.body;
    const state = el('small', { class: 'nt-state', role: 'status', 'aria-live': 'polite' });
    const saveBtn = el('button', { class: 'btn primary small', type: 'button', onclick: () => save() }, 'שמירה');
    const changed = () => title.value !== n.title || text.value !== n.body;
    const paint = () => {
      const c = changed();
      saveBtn.disabled = !c && !!n.id;
      state.textContent = c ? (n.id ? 'יש שינויים שלא נשמרו' : 'עוד לא נשמר') : 'נשמר';
      state.classList.toggle('warn', c);
      keepDraft(c ? { id: n.id, title: title.value, body: text.value, starred: !!n.starred, at: Date.now() } : null);
    };
    async function save() {
      if (!title.value.trim() && !text.value.trim()) { toast('הפתק ריק'); return false; }
      saveBtn.disabled = true; state.textContent = 'שומר…';
      try {
        const r = n.id
          ? await api(`/api/notes/${n.id}`, { method: 'PUT', body: { title: title.value, body: text.value } })
          : await api('/api/notes', { body: { title: title.value, body: text.value } });
        const starredBefore = n.starred;
        Object.assign(n, r.note);
        if (starredBefore && !r.note.starred) { n.starred = true; api(`/api/notes/${n.id}`, { method: 'PUT', body: { starred: true } }).catch(() => {}); }
        if (!notes.includes(n)) notes.unshift(n);
        title.value = n.title;                                   // a title the helper wrote
        notes.sort((a, b) => b.updatedAt - a.updatedAt);
        paint(); drawTags(); drawList(); drawMeta();
        return true;
      } catch (_) { state.textContent = 'לא נשמר – בדקו את החיבור'; saveBtn.disabled = false; return false; }
    }
    title.addEventListener('input', paint); text.addEventListener('input', paint);
    const keys = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    title.addEventListener('keydown', keys); text.addEventListener('keydown', keys);

    const meta = el('div', { class: 'nt-meta' });
    const drawMeta = () => meta.replaceChildren(...[
      n.id ? el('span', {}, 'נוצר ' + stamp(n.createdAt)) : el('span', {}, 'פתק חדש'),
      n.id && n.updatedAt - n.createdAt > 60e3 ? el('span', {}, ' · נערך ' + stamp(n.updatedAt)) : null,
      n.source ? el('a', { href: n.source.url, class: 'nt-src' }, '↩ ' + (n.source.title || 'המקור')) : null].filter(Boolean));
    const starSlot = el('span');
    drawStar = () => starSlot.replaceChildren(starBtn(n));

    editor.replaceChildren(
      el('div', { class: 'nt-ed-head' },
        el('button', { class: 'btn ghost small nt-back', type: 'button', onclick: () => leave() }, '‹ כל הפתקים'),
        starSlot, el('span', { class: 'spacer' }), state, saveBtn,
        n.id ? el('button', { class: 'btn ghost small nt-drive', type: 'button', title: n.drive ? 'נשמר ב־Drive. שמירה נוספת מעדכנת את אותו קובץ.' : 'שמירה כקובץ ב־Google Drive שלך',
          onclick: (e) => toDrive(n, e.currentTarget) }, '☁ ל־Drive') : null,
        n.id ? el('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
          if (!confirm('למחוק את הפתק?')) return;
          await api(`/api/notes/${n.id}`, { method: 'DELETE' });
          notes = notes.filter((x) => x !== n); keepDraft(null); drawTags(); close(); toast('הפתק נמחק');
        } }, 'מחיקה') : null,
        el('button', { class: 'btn ghost small nt-close', type: 'button', 'aria-label': 'סגירת הפתק', title: 'סגירה', onclick: () => leave() }, '✕')),
      title, meta, text);
    open = { note: n, changed, save };
    drawMeta(); drawStar(); paint();
    editor.hidden = false; document.body.classList.add('nt-editing');
    drawList();
    open.paste = (s) => {                                  // pasted outside the fields: to the end of this note
      text.value = text.value ? text.value.replace(/\s*$/, '') + '\n\n' + s : s;
      paint(); text.focus(); text.setSelectionRange(text.value.length, text.value.length);
    };
    setTimeout(() => {
      const f = text.value ? text : title; f.focus();
      if (f === text && draft && !n.id) { text.setSelectionRange(text.value.length, text.value.length); text.scrollTop = text.scrollHeight; }
    }, 30);
  }

  /** leaving the note being edited: with changes, ask first; `then` runs once it is closed. False while asking. */
  function leave(then) {
    if (!open) { then?.(); return true; }
    if (!open.changed()) { close(); then?.(); return true; }
    const { save, note } = open;
    H.modal(el('h2', {}, 'לבטל את השינויים?'),
      el('p', {}, note.id ? 'שיניתם את הפתק ולא שמרתם. אם תבטלו, הפתק יישאר כמו שהיה.' : 'הפתק החדש עוד לא נשמר. אם תבטלו, הוא לא יישמר.'),
      el('div', { class: 'nt-modal-acts' },
        el('button', { class: 'btn primary', type: 'button', onclick: async () => { if (await save()) { H.closeModal(); close(); then?.(); } } }, 'לשמור ולסגור'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { H.closeModal(); keepDraft(null); close(); then?.(); } }, 'לבטל את השינויים'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'להמשיך לערוך')));
    return false;
  }
  function close() { open = null; drawStar = null; keepDraft(null); editor.hidden = true; document.body.classList.remove('nt-editing'); drawList(); }
  /** a new note; `body` is pasted text it starts with (not yet saved) */
  function newNote(body) {
    const n = { id: null, title: '', body: '', source: null, starred: false, createdAt: Date.now(), updatedAt: Date.now() };
    const draft = body ? { title: '', body } : undefined;
    if (open) { if (!leave(() => edit(n, draft))) return; }
    else edit(n, draft);
  }
  const field = (t) => !!t?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  // Ctrl+V outside a field: the open note gets the text, or a new note starts with it
  addEventListener('paste', (e) => {
    if (field(e.target) || document.querySelector('#modal:not([hidden])')) return;
    const s = (e.clipboardData?.getData('text/plain') || '').trim();
    if (!s) return;
    e.preventDefault();
    if (open?.paste) open.paste(s); else newNote(s);
  });
  /** "הדבקה": the clipboard where the browser allows reading it; otherwise an empty note, ready for a long-press paste */
  async function pasteBtn() {
    let s = '';
    try { s = (await navigator.clipboard?.readText?.() || '').trim(); } catch (_) { /* not allowed here */ }
    if (s) { if (open?.paste && !open.note.id && !open.changed()) open.paste(s); else newNote(s); return; }
    if (!open || open.note.id || open.changed()) newNote();
    setTimeout(() => { if (open && !open.note.id) editor.querySelector('.nt-body')?.focus(); }, 60);   // after edit()'s own focus
    toast(/Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ? 'לחיצה ארוכה בפתק ← "הדבקה"' : 'הדביקו בפתק עם Ctrl+V');
  }
  addEventListener('beforeunload', (e) => { if (open?.changed()) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open && !document.querySelector('#modal:not([hidden])')) leave(); });

  root.append(el('div', { class: 'nt' },
    el('a', { class: 'folder-back', href: '/tools/' }, '‹ כלים'),
    el('div', { class: 'nt-head' }, el('h1', {}, 'פתקים'),
      el('div', { class: 'nt-head-acts' },
        el('button', { class: 'btn ghost', type: 'button', title: 'הדבקה מהלוח לפתק חדש', onclick: pasteBtn }, '📋 הדבקה'),
        el('button', { class: 'btn primary', type: 'button', onclick: () => newNote() }, '+ פתק חדש'))),
    el('div', { class: 'nt-cols' }, el('div', { class: 'nt-side' }, el('div', { class: 'nt-search' }, search, starFilter), tagBox, listBox), editor)));
  try { notes = (await api('/api/notes')).notes; } catch (_) { listBox.replaceChildren(el('p', {}, 'הפתקים לא נטענו.')); return; }
  drawTags(); drawList();
  // a draft left on this device (the tab closed before saving): open it again, as it was
  const draft = readDraft();
  const want = new URLSearchParams(location.search).get('open');
  if (draft && (draft.body || draft.title)) {
    const n = draft.id ? notes.find((x) => x.id === draft.id) : { id: null, title: '', body: '', source: null, starred: !!draft.starred, createdAt: draft.at, updatedAt: draft.at };
    if (n) { edit(n, draft); toast('המשכתי מהטיוטה שלא נשמרה'); return; }
    keepDraft(null);
  }
  if (want) {
    const n = notes.find((x) => x.id === want);
    if (n) {
      edit(n);
      // back from Google's consent: finish the save it was for
      if (new URLSearchParams(location.search).get('drive') === '1') { history.replaceState(null, '', '/tools/notes/'); toDrive(n, editor.querySelector('.nt-drive')); }
    }
  }
})();
