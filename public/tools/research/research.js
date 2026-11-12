/* עוזר מחקר – the core (vision's spec v1, docs/vision/research.md, step 1): my researches; every open thread of all of
   them on one screen; the inbox of what was captured from anywhere (/capture/); and a research's notes (the hub's own
   notes – one note in several researches, with [[links]] and backlinks), questions, sources (by DOI or a search of
   OpenAlex, with an open copy and a retraction warning) and export (Markdown, BibTeX). No AI in this step.
   The server: /api/research/* (server/researches.ts). The look is design's (.rx-*); inline rules hold the layout until then. */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('עוזר מחקר');
  const root = document.querySelector('main');
  const PURPOSE = { paper: 'מאמר', book: 'ספר', talk: 'הרצאה', post: 'פוסט', work: 'עבודה', personal: 'ידע אישי', family: 'תולדות המשפחה' };
  const STATUS = { open: 'פתוחה', answered: 'נענתה', parked: 'מושהית' };
  const CARD = 'padding:14px 16px;display:grid;gap:8px;align-content:start';
  const ROW = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px';
  const GRID = 'display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))';
  const INPUT = 'font:inherit;padding:8px 12px;border-radius:12px;border:1px solid var(--line-strong);background:var(--bg);color:var(--text)';
  let L = null, R = null, openId = new URLSearchParams(location.search).get('r');
  const field = (label, input) => el('label', { class: 'field' }, el('span', {}, label), input);
  const snip = (s, n = 140) => String(s || '').replace(/\s+/g, ' ').slice(0, n);
  // a citation's *italics* as <i> (the text itself is never HTML)
  const cite = (s) => el('span', { dir: 'ltr', class: 'rx-cite' }, ...String(s).split(/\*([^*]+)\*/).map((p, i) => (i % 2 ? el('i', {}, p) : p)));

  async function route() {
    if (openId) { try { R = await api(`/api/research/r/${openId}`); return drawResearch(); } catch (_) { openId = null; history.replaceState(null, '', location.pathname); } }
    L = await api('/api/research/list');
    drawHome();
  }
  const go = (id) => { openId = id; history.pushState(null, '', id ? `?r=${id}` : location.pathname); route(); scrollTo(0, 0); };
  addEventListener('popstate', () => { openId = new URLSearchParams(location.search).get('r'); route(); });

  /* ---------- home: my researches, the open threads, the inbox ---------- */
  function drawHome() {
    root.replaceChildren(el('div', { class: 'rx', style: 'max-inline-size:1100px;margin:0 auto;padding-block:14px 40px;display:grid;gap:14px' },
      el('a', { class: 'folder-back', href: '/tools/' }, '‹ כלים'),
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap' },
        el('h1', { style: 'margin:0' }, 'עוזר מחקר'), el('button', { class: 'btn primary', type: 'button', onclick: () => newResearch() }, '+ מחקר חדש')),
      L.inbox.length ? inboxCard() : null,
      el('h2', { style: 'margin:4px 0 0' }, 'המחקרים שלי'),
      L.researches.length ? el('div', { class: 'rx-list', style: GRID }, L.researches.map((r) => el('button', { type: 'button', class: 'card rx-item', style: CARD + ';text-align:start;font:inherit;color:inherit;cursor:pointer', onclick: () => go(r.id) },
        el('b', { dir: 'auto', style: 'font-size:1.05rem' }, r.title), el('small', { class: 'muted' }, PURPOSE[r.purpose] || ''),
        r.aim ? el('small', { dir: 'auto' }, snip(r.aim, 110)) : null,
        el('small', { class: 'muted' }, `${r.notes} פתקים · ${r.sources} מקורות · ${r.open} שאלות פתוחות`))))
        : el('div', { class: 'card rx-empty', style: CARD + ';text-align:center' }, el('p', { style: 'margin:0' }, 'עוד אין מחקרים.'),
          el('p', { class: 'muted', style: 'margin:0' }, 'מחקר מחזיק פתקים, שאלות פתוחות ומקורות, ונבנה ממנו טקסט עם ציטוטים וביבליוגרפיה.'),
          el('div', {}, el('button', { class: 'btn primary', type: 'button', onclick: () => newResearch() }, '+ המחקר הראשון'))),
      el('h2', { style: 'margin:4px 0 0' }, `🧵 כל החוטים הפתוחים (${L.threads.length})`),
      L.threads.length ? el('ul', { class: 'rx-threads', style: 'list-style:none;margin:0;padding:0;display:grid;gap:8px' }, L.threads.map((t) => threadRow(t, true)))
        : el('p', { class: 'muted', style: 'margin:0' }, 'אין שאלות פתוחות. שאלה נפתחת בתוך מחקר, ומופיעה כאן עד שנענית.'),
      el('p', { class: 'small muted' }, '📥 אפשר לשמור לכאן מכל מקום: בטלפון "שיתוף" אל האוהל, או מהפתקים.')));
  }
  function inboxCard() {
    return el('section', { class: 'card rx-inbox', style: CARD },
      el('b', {}, `📥 תיבת נכנסים (${L.inbox.length})`),
      el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:8px' }, L.inbox.map((n) => {
        const pick = el('select', { 'aria-label': 'לאיזה מחקר', style: INPUT }, el('option', { value: '' }, 'למחקר…'), L.researches.map((r) => el('option', { value: r.id }, r.title)));
        pick.onchange = async () => { if (!pick.value) return; await api(`/api/research/r/${pick.value}/notes`, { body: { noteId: n.id } }); toast('נוסף למחקר'); route(); };
        return el('li', { class: 'rx-inbox-item', style: 'display:grid;gap:4px;padding-block-end:8px;border-block-end:1px solid var(--line)' },
          el('b', { dir: 'auto' }, n.title), n.body ? el('small', { dir: 'auto', class: 'muted' }, snip(n.body)) : null,
          n.source ? el('a', { href: n.source.url, target: '_blank', rel: 'noopener', class: 'small', dir: 'auto' }, '↗ ' + (n.source.title || n.source.url)) : null,
          el('div', { style: ROW }, L.researches.length ? pick : el('small', { class: 'muted' }, 'פתחו מחקר כדי למיין אליו.'),
            el('a', { class: 'btn ghost small', href: `/tools/notes/?open=${n.id}` }, 'לפתקים')));
      })));
  }

  /* ---------- a research ---------- */
  function drawResearch() {
    const r = R.research;
    const style = el('select', { 'aria-label': 'סגנון הציטוט', style: INPUT, onchange: async () => { await api(`/api/research/r/${r.id}`, { method: 'PUT', body: { style: style.value } }); route(); } },
      R.styles.map(([v, n]) => el('option', { value: v, selected: v === r.style }, n)));
    root.replaceChildren(el('div', { class: 'rx rx-one', style: 'max-inline-size:1000px;margin:0 auto;padding-block:14px 40px;display:grid;gap:14px' },
      el('button', { class: 'folder-back', type: 'button', style: 'background:none;border:0;cursor:pointer;font:inherit;text-align:start', onclick: () => go(null) }, '‹ כל המחקרים'),
      el('div', { style: 'display:grid;gap:4px' },
        el('h1', { dir: 'auto', style: 'margin:0' }, r.title),
        el('small', { class: 'muted' }, PURPOSE[r.purpose] || ''),
        r.aim ? el('p', { dir: 'auto', style: 'margin:0' }, r.aim) : null,
        el('div', { style: ROW },
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => newResearch(r) }, '✎ עריכה'),
          el('label', { style: ROW }, el('span', { class: 'small muted' }, 'ציטוט:'), style),
          el('a', { class: 'btn ghost small', href: `/api/research/r/${r.id}/export?format=md`, download: '' }, '⬇ Markdown'),
          el('a', { class: 'btn ghost small', href: `/api/research/r/${r.id}/export?format=bib`, download: '' }, '⬇ BibTeX'),
          el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (!confirm(`למחוק את המחקר "${r.title}"? הפתקים עצמם יישארו בפתקים.`)) return; await api(`/api/research/r/${r.id}`, { method: 'DELETE' }); go(null); } }, 'מחיקה'))),
      notesSection(), threadsSection(), sourcesSection()));
  }

  function notesSection() {
    const r = R.research;
    const title = el('input', { type: 'text', dir: 'auto', placeholder: 'כותרת', 'aria-label': 'כותרת הפתק', style: INPUT });
    const body = el('textarea', { rows: 3, dir: 'auto', placeholder: 'הפתק. קישור לפתק אחר: [[שם הפתק]]', 'aria-label': 'הפתק', style: INPUT });
    const add = el('details', { class: 'rx-add' }, el('summary', {}, '+ פתק חדש'),
      el('div', { style: 'display:grid;gap:8px;margin-top:8px' }, title, body, el('div', {}, el('button', { class: 'btn small primary', type: 'button', onclick: async () => {
        if (!title.value.trim() && !body.value.trim()) return title.focus();
        await api(`/api/research/r/${r.id}/notes`, { body: { title: title.value, body: body.value } }); route();
      } }, 'הוספה'))));
    const existing = el('button', { class: 'btn ghost small', type: 'button', onclick: pickExisting }, '+ פתק קיים');
    return el('section', { class: 'rx-notes', style: 'display:grid;gap:10px' },
      el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, el('h2', { style: 'margin:0;flex:1' }, `📝 פתקים (${R.notes.length})`), existing),
      add,
      R.notes.length ? el('div', { style: GRID }, R.notes.map((n) => el('article', { class: 'card rx-note', style: CARD },
        el('b', { dir: 'auto' }, (n.starred ? '★ ' : '') + n.title),
        n.body ? el('p', { dir: 'auto', style: 'margin:0;white-space:pre-line' }, snip(n.body, 400)) : null,
        n.source ? el('a', { class: 'small', href: n.source.url, target: '_blank', rel: 'noopener' }, '↗ ' + (n.source.title || 'המקור')) : null,
        n.links.length ? el('small', { class: 'rx-links' }, '→ ', n.links.map((x) => x.title).join(' · ')) : null,
        n.backlinks.length ? el('small', { class: 'rx-backlinks muted' }, '← מצביעים לכאן: ', n.backlinks.map((x) => x.title).join(' · ')) : null,
        el('div', { style: ROW },
          el('a', { class: 'btn ghost small', href: `/tools/notes/?open=${n.id}` }, 'פתיחה ועריכה'),
          el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { await api(`/api/research/r/${r.id}/notes/${n.id}`, { method: 'DELETE' }); route(); } }, 'הסרה מהמחקר')))))
        : el('p', { class: 'muted', style: 'margin:0' }, 'עוד אין פתקים במחקר. פתק יכול להיות גם בכמה מחקרים: זה אותו פתק, ותיקון בו מתעדכן בכולם.'));
  }
  async function pickExisting() {
    const all = (await api('/api/notes')).notes.filter((n) => !R.notes.some((x) => x.id === n.id));
    const q = el('input', { type: 'search', placeholder: 'חיפוש בפתקים', dir: 'auto', style: INPUT + ';inline-size:100%' });
    const list = el('div', { style: 'display:grid;gap:6px;max-block-size:50vh;overflow:auto' });
    const draw = () => list.replaceChildren(...all.filter((n) => !q.value || (n.title + ' ' + n.body).includes(q.value)).slice(0, 50).map((n) => el('button', { type: 'button', class: 'btn ghost', style: 'text-align:start;justify-content:start',
      onclick: async () => { await api(`/api/research/r/${R.research.id}/notes`, { body: { noteId: n.id } }); H.closeModal(); route(); } }, n.title)));
    q.oninput = draw; draw();
    H.modal(el('h2', {}, 'פתק קיים למחקר'), el('p', { class: 'muted' }, 'אותו פתק, לא עותק: תיקון בו מתעדכן בכל מקום.'), q, list);
  }

  function threadsSection() {
    const r = R.research;
    const q = el('input', { type: 'text', dir: 'auto', placeholder: 'שאלה פתוחה, או חוט שכדאי לחזור אליו…', 'aria-label': 'שאלה חדשה', style: INPUT + ';flex:1;min-inline-size:12rem' });
    const addQ = async () => { if (!q.value.trim()) return q.focus(); await api(`/api/research/r/${r.id}/threads`, { body: { text: q.value } }); route(); };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') addQ(); });
    return el('section', { class: 'rx-threads-sec', style: 'display:grid;gap:10px' },
      el('h2', { style: 'margin:0' }, `🧵 שאלות וחוטים (${R.threads.filter((t) => t.status === 'open').length} פתוחות)`),
      el('div', { style: ROW }, q, el('button', { class: 'btn small', type: 'button', onclick: addQ }, 'הוספה')),
      R.threads.length ? el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:8px' }, R.threads.map((t) => threadRow(t))) : null);
  }
  function threadRow(t, withResearch = false) {
    const setStatus = async (status, answer) => { await api(`/api/research/threads/${t.id}`, { method: 'PUT', body: { status, ...(answer !== undefined ? { answer } : {}) } }); route(); };
    return el('li', { class: 'card rx-thread ' + t.status, style: CARD },
      el('div', { style: 'display:flex;gap:8px;align-items:start' },
        el('span', { dir: 'auto', style: 'flex:1' + (t.status === 'answered' ? ';opacity:.7' : '') }, t.text),
        el('small', { class: 'rx-status', style: 'border:1px solid var(--line-strong);border-radius:999px;padding:0 8px;white-space:nowrap' }, STATUS[t.status])),
      withResearch ? el('button', { type: 'button', class: 'linklike small', style: 'background:none;border:0;padding:0;color:var(--primary);cursor:pointer;font:inherit;text-align:start', onclick: () => go(t.research) }, '↩ ' + (t.researchTitle || '')) : null,
      t.answer ? el('small', { dir: 'auto' }, 'תשובה: ' + t.answer) : null,
      el('div', { style: ROW },
        t.status !== 'answered' ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => { const a = prompt('התשובה (קצרה):', t.answer || ''); if (a !== null) setStatus('answered', a); } }, '✓ נענתה') : el('button', { class: 'btn ghost small', type: 'button', onclick: () => setStatus('open') }, 'לפתוח שוב'),
        t.status === 'open' ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => setStatus('parked') }, '⏸ להשהות') : t.status === 'parked' ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => setStatus('open') }, '▶ להמשיך') : null,
        withResearch ? null : el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'מחיקת השאלה', onclick: async () => { if (confirm('למחוק את השאלה?')) { await api(`/api/research/threads/${t.id}`, { method: 'DELETE' }); route(); } } }, '✕')));
  }

  function sourcesSection() {
    const r = R.research;
    const q = el('input', { type: 'search', dir: 'auto', placeholder: 'DOI, או מילים לחיפוש מאמרים', 'aria-label': 'חיפוש מקור', style: INPUT + ';flex:1;min-inline-size:12rem' });
    const out = el('div', { class: 'rx-found', style: 'display:grid;gap:8px' });
    const search = async () => {
      if (q.value.trim().length < 2) return q.focus();
      out.replaceChildren(el('p', { class: 'muted' }, 'מחפש…'));
      try {
        const d = await api(`/api/research/find?q=${encodeURIComponent(q.value.trim())}`);
        out.replaceChildren(...(d.results.length ? d.results.map(foundRow) : [el('p', { class: 'muted' }, 'לא נמצאו מקורות.')]),
          el('small', { class: 'muted' }, 'מקורות: OpenAlex (CC0) ו־Crossref.'));
      } catch (e) { out.replaceChildren(el('p', {}, e.code === 'source_not_found' ? 'לא מצאתי את ה־DOI הזה.' : 'החיפוש לא הצליח כרגע.')); }
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
    const foundRow = (x) => {
      const csl = x.csl, a = (csl.author || []).slice(0, 3).map((n) => n.family || n.literal).join(', ') + ((csl.author || []).length > 3 ? ' ועוד' : '');
      const year = csl.issued?.['date-parts']?.[0]?.[0];
      const has = R.sources.some((s) => s.doi && s.doi === x.doi);
      return el('div', { class: 'card rx-found-item', style: CARD },
        el('b', { dir: 'auto' }, csl.title), el('small', { class: 'muted', dir: 'auto' }, [a, year, csl['container-title']].filter(Boolean).join(' · ')),
        el('div', { style: ROW },
          x.retracted ? el('small', { class: 'rx-retracted', style: 'color:var(--danger)' }, '⚠ המאמר נמשך') : null,
          x.cited ? el('small', { class: 'muted' }, `צוטט ${x.cited.toLocaleString('he-IL')} פעמים`) : null,
          x.oa ? el('a', { class: 'small', href: x.oa, target: '_blank', rel: 'noopener' }, '📄 גרסה פתוחה') : null,
          has ? el('small', { class: 'muted' }, '✓ כבר במחקר') : el('button', { class: 'btn small', type: 'button', onclick: async (e) => {
            e.currentTarget.disabled = true;
            await api(`/api/research/r/${r.id}/sources`, { body: x.doi ? { doi: x.doi } : { csl: { ...csl, title: csl.title || '(ללא כותרת)' } } });
            toast('המקור נוסף'); route();
          } }, '+ למחקר')));
    };
    return el('section', { class: 'rx-sources', style: 'display:grid;gap:10px' },
      el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, el('h2', { style: 'margin:0;flex:1' }, `📚 מקורות (${R.sources.length})`),
        el('button', { class: 'btn ghost small', type: 'button', onclick: manualSource }, '+ מקור ידני')),
      el('div', { style: ROW }, q, el('button', { class: 'btn small', type: 'button', onclick: search }, 'חיפוש')),
      out,
      R.sources.length ? el('ol', { class: 'rx-bib', style: 'margin:0;padding-inline-start:1.4em;display:grid;gap:10px' }, R.sources.map((s) => el('li', { class: 'rx-source' + (s.retracted ? ' retracted' : '') },
        cite(s.cite),
        el('div', { style: ROW + ';margin-top:4px' },
          el('small', { class: 'muted', dir: 'ltr' }, s.inText),
          s.retracted ? el('small', { style: 'color:var(--danger)' }, '⚠ נמשך') : null,
          s.oa ? el('a', { class: 'small', href: s.oa, target: '_blank', rel: 'noopener' }, '📄 גרסה פתוחה') : null,
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => { navigator.clipboard?.writeText(s.cite.replace(/\*/g, '')); toast('הועתק'); } }, 'העתקה'),
          el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'הסרת המקור', onclick: async () => { if (confirm('להסיר את המקור מהמחקר?')) { await api(`/api/research/sources/${s.id}`, { method: 'DELETE' }); route(); } } }, '✕')))))
        : el('p', { class: 'muted', style: 'margin:0' }, 'עוד אין מקורות. הדביקו DOI או חפשו מאמר; הביבליוגרפיה נבנית לבד, בסגנון שבחרתם.'));
  }
  function manualSource() {
    const t = el('input', { type: 'text', dir: 'auto', style: INPUT }), a = el('input', { type: 'text', dir: 'auto', placeholder: 'כהן, שרה; לוי, דוד', style: INPUT });
    const y = el('input', { type: 'text', inputmode: 'numeric', style: INPUT }), c = el('input', { type: 'text', dir: 'auto', placeholder: 'כתב העת, או ההוצאה של ספר', style: INPUT });
    const u = el('input', { type: 'url', dir: 'ltr', placeholder: 'https://…', style: INPUT });
    const book = el('input', { type: 'checkbox' });
    H.modal(el('h2', {}, 'מקור ידני'),
      field('כותרת', t), field('כותבים (משפחה, פרטי; …)', a), field('שנה', y), field('כתב העת / ההוצאה', c), field('קישור (לא חובה)', u),
      el('label', { style: ROW }, book, 'זה ספר'),
      el('div', {}, el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (!t.value.trim()) return t.focus();
        const author = a.value.split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const [family, given] = x.split(',').map((p) => p.trim()); return given ? { family, given } : { literal: family }; });
        const yr = parseInt(y.value, 10);
        const csl = { title: t.value.trim(), author, ...(yr ? { issued: { 'date-parts': [[yr]] } } : {}), ...(book.checked ? { type: 'book', publisher: c.value.trim() || undefined } : { 'container-title': c.value.trim() || undefined }), ...(u.value.trim() ? { URL: u.value.trim() } : {}) };
        await api(`/api/research/r/${R.research.id}/sources`, { body: { csl } }); H.closeModal(); route();
      } }, 'הוספה')));
  }

  /* ---------- a new research, or its details ---------- */
  function newResearch(r = null) {
    const t = el('input', { type: 'text', dir: 'auto', value: r?.title || '', placeholder: 'למשל: הסולם בחלום יעקב', style: INPUT });
    const p = el('select', { style: INPUT }, Object.entries(PURPOSE).map(([v, n]) => el('option', { value: v, selected: v === (r?.purpose || 'personal') }, n)));
    const aim = el('textarea', { rows: 3, dir: 'auto', placeholder: 'מה אני רוצה להבין, או לכתוב?', style: INPUT }, r?.aim || '');
    const s = el('select', { style: INPUT }, [['apa', 'APA'], ['mla', 'MLA'], ['chicago', 'Chicago']].map(([v, n]) => el('option', { value: v, selected: v === (r?.style || 'apa') }, n)));
    H.modal(el('h2', {}, r ? 'פרטי המחקר' : 'מחקר חדש'), field('נושא', t), field('בשביל מה', p), field('המטרה', aim), field('סגנון הציטוט', s),
      el('div', {}, el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (!t.value.trim()) return t.focus();
        const b = { title: t.value.trim(), purpose: p.value, aim: aim.value.trim(), style: s.value };
        if (r) { await api(`/api/research/r/${r.id}`, { method: 'PUT', body: b }); H.closeModal(); route(); }
        else { const res = await api('/api/research/new', { body: b }); H.closeModal(); go(res.id); }
      } }, r ? 'שמירה' : 'יוצאים לדרך')));
    setTimeout(() => t.focus(), 30);
  }

  try { await route(); } catch (_) { root.replaceChildren(el('p', {}, 'עוזר המחקר לא נטען. נסו שוב בעוד רגע.')); }
})();
