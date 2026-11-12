/* עוזר מחקר – the core (vision's spec v1, docs/vision/research.md, step 1): my researches; every open thread of all of
   them on one screen; the inbox of what was captured from anywhere (/capture/); and a research's notes (the hub's own
   notes – one note in several researches, with [[links]] and backlinks), questions, sources (by DOI or a search of
   OpenAlex, with an open copy and a retraction warning) and export (Markdown, BibTeX). No AI in this step.
   Step 3, shared research: invitations on the home screen, members and roles, comments and the history (with restore);
   what a role may not do is not offered (the server checks it again).
   The server: /api/research/* (server/researches.ts). The look is design's (research.css); inline rules remain only where it has no rule yet (step 3's panels, a few section grids). */
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
  const badge = (text, title) => el('small', { class: 'rx-role', title: title || '', style: 'border:1px solid var(--line-strong);border-radius:999px;padding:0 8px;white-space:nowrap' }, text);
  const when = (t) => new Date(t).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  /** one of my notes into a research; in a shared research a private note asks first whether the others may see it */
  async function addExisting(researchId, noteId) {
    try { await api(`/api/research/r/${researchId}/notes`, { body: { noteId } }); return true; }
    catch (e) {
      if (e.code !== 'ask_share') throw e;
      const share = await new Promise((done) => H.modal(el('h2', {}, 'לשתף את הפתק?'),
        el('p', {}, 'המחקר משותף. אם הפתק ישותף, כל מי שבמחקר יראה אותו. אם לא, הם יראו רק שיש כאן פתק פרטי שלך.'),
        el('div', { style: ROW },
          el('button', { class: 'btn primary', type: 'button', onclick: () => { H.closeModal(); done(true); } }, 'לשתף'),
          el('button', { class: 'btn ghost', type: 'button', onclick: () => { H.closeModal(); done(false); } }, 'להשאיר פרטי'))));
      await api(`/api/research/r/${researchId}/notes`, { body: { noteId, share } });
      return true;
    }
  }

  async function route() {
    openId = new URLSearchParams(location.search).get('r') || openId;
    const draftId = new URLSearchParams(location.search).get('d');
    if (openId) {
      try { R = await api(`/api/research/r/${openId}`); return draftId ? drawDraft(draftId) : drawResearch(); }
      catch (_) { openId = null; history.replaceState(null, '', location.pathname); }
    }
    L = await api('/api/research/list');
    drawHome();
  }
  const go = (id) => { openId = id; history.pushState(null, '', id ? `?r=${id}` : location.pathname); route(); scrollTo(0, 0); };
  addEventListener('popstate', () => { openId = new URLSearchParams(location.search).get('r'); route(); });

  /* ---------- home: my researches, the open threads, the inbox ---------- */
  function drawHome() {
    root.replaceChildren(el('div', { class: 'rx' },
      el('a', { class: 'folder-back', href: '/tools/' }, '‹ כלים'),
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap' },
        el('h1', {}, 'עוזר מחקר'), el('button', { class: 'btn primary', type: 'button', onclick: () => newResearch() }, '+ מחקר חדש')),
      L.invitations.length ? invitationsCard() : null,
      L.inbox.length ? inboxCard() : null,
      el('h2', {}, 'המחקרים שלי'),
      L.researches.length ? el('div', { class: 'rx-list', style: GRID }, L.researches.map((r) => el('button', { type: 'button', class: 'card rx-item', onclick: () => go(r.id) },
        el('b', { dir: 'auto', style: 'font-size:1.05rem' }, r.title), el('small', { class: 'muted' }, PURPOSE[r.purpose] || ''),
        r.role !== 'owner' ? el('small', { class: 'rx-shared' }, `👥 של ${r.owner} · `, badge(ROLE[r.role] || r.role)) : r.members ? el('small', { class: 'rx-shared muted' }, `👥 משותף עם ${r.members}`) : null,
        r.aim ? el('small', { dir: 'auto' }, snip(r.aim, 110)) : null,
        el('small', { class: 'muted' }, `${r.notes} פתקים · ${r.sources} מקורות · ${r.open} שאלות פתוחות`))))
        : el('div', { class: 'card rx-empty', style: 'text-align:center' }, el('p', { style: 'margin:0' }, 'עוד אין מחקרים.'),
          el('p', { class: 'muted', style: 'margin:0' }, 'מחקר מחזיק פתקים, שאלות פתוחות ומקורות, ונבנה ממנו טקסט עם ציטוטים וביבליוגרפיה.'),
          el('div', {}, el('button', { class: 'btn primary', type: 'button', onclick: () => newResearch() }, '+ המחקר הראשון'))),
      el('h2', {}, `🧵 כל החוטים הפתוחים (${L.threads.length})`),
      L.threads.length ? el('ul', { class: 'rx-threads', style: 'list-style:none;margin:0;padding:0;display:grid;gap:8px' }, L.threads.map((t) => threadRow(t, true)))
        : el('p', { class: 'muted', style: 'margin:0' }, 'אין שאלות פתוחות. שאלה נפתחת בתוך מחקר, ומופיעה כאן עד שנענית.'),
      el('p', { class: 'small muted' }, '📥 אפשר לשמור לכאן מכל מקום: בטלפון "שיתוף" אל האוהל, או מהפתקים.')));
  }
  const ROLE = { owner: 'בעלים', editor: 'עורך', contributor: 'תורם', reader: 'קורא' };
  const ROLE_HELP = { editor: 'עורך: מוסיף ומתקן הכול, משחזר מההיסטוריה, מזמין קוראים', contributor: 'תורם: מוסיף פתקים, שאלות, מקורות וטיוטות, ומתקן רק את שלו', reader: 'קורא: רואה ומגיב' };
  function invitationsCard() {
    return el('section', { class: 'card rx-invites', style: CARD },
      el('b', {}, `✉ הזמנות למחקרים (${L.invitations.length})`),
      el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:8px' }, L.invitations.map((i) => el('li', { style: 'display:grid;gap:4px' },
        el('span', {}, `${i.from} מזמין אותך ל"`, el('b', { dir: 'auto' }, i.title), `" בתור ${i.roleName}`),
        el('small', { class: 'muted' }, ROLE_HELP[i.role] || ''),
        i.outside ? el('small', { class: 'muted' }, 'המזמין לא מבני הבית שלך: מצטרפים רק אם רוצים.') : null,
        el('div', { style: ROW },
          el('button', { class: 'btn small primary', type: 'button', onclick: async () => { await api(`/api/research/r/${i.id}/join`, { body: { accept: true } }); toast('הצטרפת למחקר'); go(i.id); } }, 'להצטרף'),
          el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { await api(`/api/research/r/${i.id}/join`, { body: { accept: false } }); route(); } }, 'לא תודה'))))));
  }
  function inboxCard() {
    return el('section', { class: 'card rx-inbox' },
      el('b', {}, `📥 תיבת נכנסים (${L.inbox.length})`),
      el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:8px' }, L.inbox.map((n) => {
        const pick = el('select', { 'aria-label': 'לאיזה מחקר', style: INPUT }, el('option', { value: '' }, 'למחקר…'), L.researches.filter((r) => r.role !== 'reader').map((r) => el('option', { value: r.id }, r.title)));
        pick.onchange = async () => { if (!pick.value) return; await addExisting(pick.value, n.id); toast('נוסף למחקר'); route(); };
        return el('li', { class: 'rx-inbox-item' },
          el('b', { dir: 'auto' }, n.title), n.body ? el('small', { dir: 'auto', class: 'muted' }, snip(n.body)) : null,
          n.source ? el('a', { href: n.source.url, target: '_blank', rel: 'noopener', class: 'small', dir: 'auto' }, '↗ ' + (n.source.title || n.source.url)) : null,
          el('div', { style: ROW }, L.researches.length ? pick : el('small', { class: 'muted' }, 'פתחו מחקר כדי למיין אליו.'),
            el('a', { class: 'btn ghost small', href: `/tools/notes/?open=${n.id}` }, 'לפתקים')));
      })));
  }

  /* ---------- a research ---------- */
  function drawResearch() {
    const r = R.research, owner = R.role === 'owner';
    const style = el('select', { 'aria-label': 'סגנון הציטוט', style: INPUT, onchange: async () => { await api(`/api/research/r/${r.id}`, { method: 'PUT', body: { style: style.value } }); route(); } },
      R.styles.map(([v, n]) => el('option', { value: v, selected: v === r.style }, n)));
    root.replaceChildren(el('div', { class: 'rx rx-one' },
      el('button', { class: 'folder-back', type: 'button', onclick: () => go(null) }, '‹ כל המחקרים'),
      el('div', { style: 'display:grid;gap:4px' },
        el('h1', { dir: 'auto', style: 'margin:0' }, r.title),
        el('small', { class: 'muted' }, PURPOSE[r.purpose] || '', R.role !== 'owner' ? ' · ' : '', R.role !== 'owner' ? badge('אני ' + R.roleName, ROLE_HELP[R.role]) : null),
        r.aim ? el('p', { dir: 'auto', style: 'margin:0' }, r.aim) : null,
        el('div', { style: ROW },
          owner ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => newResearch(r) }, '✎ עריכה') : null,
          owner ? el('label', { style: ROW }, el('span', { class: 'small muted' }, 'ציטוט:'), style) : null,
          el('a', { class: 'btn ghost small', href: `/api/research/r/${r.id}/export?format=md`, download: '' }, '⬇ Markdown'),
          el('a', { class: 'btn ghost small', href: `/api/research/r/${r.id}/export?format=bib`, download: '' }, '⬇ BibTeX'),
          owner ? el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (!confirm(`למחוק את המחקר "${r.title}"? הפתקים עצמם יישארו בפתקים.`)) return; await api(`/api/research/r/${r.id}`, { method: 'DELETE' }); go(null); } }, 'מחיקה') : null)),
      sharingSection(),
      owner ? el('div', { class: 'rx-persist' },
        r.goalId ? el('a', { class: 'btn small', href: '/tools/tasks/' }, '🎯 המחקר במטרות שלי')
          : el('button', { class: 'btn small', type: 'button', title: 'צעדים יומיים, "היום", סיכום שבועי ו־badges – כמו כל מטרה', onclick: async () => { await api(`/api/research/r/${r.id}/goal`, { body: {} }); toast('המחקר הפך למטרה: הצעדים שלו יופיעו ב"היום"'); route(); } }, '🎯 להפוך למטרה'),
        r.doneAt ? el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { await api(`/api/research/r/${r.id}/done`, { body: { done: false } }); route(); } }, '✓ הסתיים · לפתוח שוב')
          : el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (!confirm('לסמן שהמחקר הסתיים?')) return; await api(`/api/research/r/${r.id}/done`, { body: { done: true } }); toast('🏅 גשש: סיימת מחקר'); route(); } }, '🏁 סיימתי את המחקר')) : null,
      directionsSection(), notesSection(), threadsSection(), sourcesSection(), draftsSection(), commentsSection(), journalSection(), historySection()));
  }

  /* ---------- sharing: the members and their roles ---------- */
  function sharingSection() {
    const r = R.research, owner = R.role === 'owner';
    if (!R.shared && !owner && !R.can.invite) return null;
    const email = el('input', { type: 'email', dir: 'ltr', placeholder: 'כתובת המייל שלו באוהל', 'aria-label': 'את מי להזמין', style: INPUT + ';flex:1;min-inline-size:12rem' });
    const roles = owner ? ['editor', 'contributor', 'reader'] : ['reader'];
    const role = el('select', { 'aria-label': 'בתור', style: INPUT }, roles.map((x) => el('option', { value: x, selected: x === (owner ? 'contributor' : 'reader') }, ROLE[x])));
    const help = el('small', { class: 'muted' }, ROLE_HELP[role.value]);
    role.onchange = () => { help.textContent = ROLE_HELP[role.value]; };
    const WHY = { not_same_household: 'בינתיים משתפים רק עם בני הבית שלך שכבר נכנסו לאוהל.', already_in: 'הוא כבר במחקר, או שכבר הוזמן.' };
    const send = async () => {
      if (!email.value.trim()) return email.focus();
      try { const x = await api(`/api/research/r/${r.id}/members`, { body: { email: email.value.trim(), role: role.value } }); toast(x.outside ? 'ההזמנה נשלחה. הוא לא מבני הבית, אז יצטרף רק אם יאשר.' : 'ההזמנה נשלחה: הוא יראה אותה בעוזר המחקר'); route(); }
      catch (e) { toast(WHY[e.code] || 'ההזמנה לא נשלחה'); }
    };
    const memberRow = (m) => {
      const me = m.me;
      const pick = owner && m.role !== 'owner' ? el('select', { 'aria-label': `התפקיד של ${m.name}`, style: INPUT + ';padding-block:4px', onchange: async (e) => { await api(`/api/research/r/${r.id}/members/${encodeURIComponent(m.email)}`, { method: 'PUT', body: { role: e.target.value } }); toast('התפקיד עודכן'); route(); } },
        ['editor', 'contributor', 'reader'].map((x) => el('option', { value: x, selected: x === m.role }, ROLE[x]))) : badge(m.roleName, ROLE_HELP[m.role]);
      return el('li', { style: ROW },
        el('span', { style: 'flex:1;min-inline-size:8rem' }, m.name + (me ? ' (אני)' : '')),
        m.status === 'invited' ? el('small', { class: 'muted' }, 'הוזמן, עוד לא הצטרף') : null,
        m.outside ? el('small', { class: 'muted', title: 'לא מבני הבית' }, 'שותף מבחוץ') : null,
        pick,
        m.role !== 'owner' && (owner || me) ? el('button', { class: 'btn ghost small', type: 'button', 'aria-label': me ? 'לעזוב את המחקר' : `להסיר את ${m.name}`, onclick: async () => {
          if (!confirm(me ? 'לעזוב את המחקר? אפשר לחזור רק בהזמנה חדשה.' : `להסיר את ${m.name} מהמחקר?`)) return;
          await api(`/api/research/r/${r.id}/members/${me ? 'me' : encodeURIComponent(m.email)}`, { method: 'DELETE' });
          if (me) go(null); else route();
        } }, me ? 'לעזוב' : '✕') : null);
    };
    return el('details', { class: 'card rx-sharing', style: CARD },
      el('summary', { style: 'cursor:pointer;font-weight:600' }, R.shared ? `👥 משותף · ${R.members.length} אנשים` : '👥 שיתוף המחקר'),
      el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:6px' }, R.members.map(memberRow)),
      R.can.invite ? el('div', { style: 'display:grid;gap:6px' },
        el('div', { style: ROW }, email, role, el('button', { class: 'btn small primary', type: 'button', onclick: send }, 'להזמין')), help,
        el('small', { class: 'muted' }, 'בינתיים משתפים רק עם בני הבית. המוזמן מצטרף רק כשהוא מאשר.')) : null,
      owner ? el('small', { class: 'muted' }, 'פתק פרטי שלך שמצטרף למחקר משותף: תישאל בכל פעם אם לשתף אותו.') : null);
  }

  /* ---------- comments: everyone in the research ---------- */
  function commentsSection() {
    const r = R.research;
    if (!R.shared && !R.comments.length) return null;
    const text = el('textarea', { rows: 2, dir: 'auto', placeholder: 'תגובה למחקר…', 'aria-label': 'תגובה', style: INPUT + ';inline-size:100%' });
    const post = async () => { if (!text.value.trim()) return text.focus(); await api(`/api/research/r/${r.id}/comments`, { body: { on: 'research', text: text.value } }); route(); };
    const what = (c) => c.on === 'note' ? R.notes.find((n) => n.id === c.onId)?.title : c.on === 'thread' ? R.threads.find((t) => t.id === c.onId)?.text : c.on === 'source' ? R.sources.find((s) => s.id === c.onId)?.csl?.title : null;
    return el('section', { class: 'rx-comments', style: 'display:grid;gap:8px' },
      el('h2', {}, `💬 תגובות (${R.comments.length})`),
      R.comments.length ? el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:8px' }, R.comments.map((c) => el('li', { class: 'card rx-comment', style: CARD },
        el('div', { style: ROW }, el('b', {}, c.by), el('small', { class: 'muted' }, when(c.at)), what(c) ? el('small', { class: 'muted', dir: 'auto' }, '· על ' + snip(what(c), 50)) : null,
          c.mine || R.can.editAny ? el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'מחיקת התגובה', onclick: async () => { if (confirm('למחוק את התגובה?')) { await api(`/api/research/comments/${c.id}`, { method: 'DELETE' }); route(); } } }, '✕') : null),
        el('p', { dir: 'auto', style: 'margin:0;white-space:pre-line' }, c.text)))) : null,
      text, el('div', {}, el('button', { class: 'btn small primary', type: 'button', onclick: post }, 'שליחה')));
  }
  /** a comment on one thing in the research (a note, a question, a source) */
  const commentOn = (on, onId) => el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'תגובה', onclick: async () => {
    const t = prompt('תגובה:'); if (!t || !t.trim()) return;
    await api(`/api/research/r/${R.research.id}/comments`, { body: { on, onId, text: t } }); toast('התגובה נוספה'); route();
  } }, '💬');

  /* ---------- the history: what changed, by whom; an editor restores ---------- */
  const KIND = { note: 'פתק', thread: 'שאלה', source: 'מקור', draft: 'טיוטה', member: 'שותף' };
  const ACTION = { add: 'הוסיף', edit: 'שינה', remove: 'הסיר', restore: 'שחזר' };
  function historySection() {
    if (!R.history.length) return null;
    const restorable = (h) => R.can.restore && (h.action === 'remove' || h.action === 'edit') && h.kind !== 'member';
    return el('details', { class: 'card rx-history', style: CARD },
      el('summary', { style: 'cursor:pointer;font-weight:600' }, `🕓 היסטוריה (${R.history.length})`),
      el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:6px' }, R.history.map((h) => el('li', { style: ROW },
        el('small', { class: 'muted', style: 'min-inline-size:7.5em' }, when(h.at)),
        el('span', { style: 'flex:1' }, `${h.by} ${ACTION[h.action] || h.action} ${KIND[h.kind] || h.kind}`),
        restorable(h) ? el('button', { class: 'btn ghost small', type: 'button', title: 'להחזיר למה שהיה לפני השינוי הזה', onclick: async () => {
          if (!confirm('להחזיר למה שהיה לפני השינוי הזה?')) return;
          try { await api(`/api/research/history/${h.id}/restore`, { body: {} }); toast('שוחזר'); route(); }
          catch (e) { toast(e.code === 'not_allowed' ? 'את השיתוף של פתק מחליט רק מי שכתב אותו' : 'לא הצלחתי לשחזר'); }
        } }, '↶ שחזור') : null))),
      R.can.restore ? null : el('small', { class: 'muted' }, 'עורך או בעלים יכולים לשחזר מכאן.'));
  }

  /* ---------- the AI: ✨, or an invitation when none is left ---------- */
  let aiP = null;
  const noAi = () => (aiP ||= api('/api/me/ai').then((me) => !!me.out && !Object.keys(me.keys || {}).length).catch(() => false));
  const invite = () => H.loadOnce('/assets/ai-invite.js').then(() => H.aiInvite?.()).catch(() => toast('אפשר לחבר AI בהגדרות ← חיבור לשירותים'));
  const sparkle = (label, run) => {
    const b = el('button', { class: 'btn ai-up', type: 'button', onclick: async () => {
      if (await noAi()) return invite();
      b.disabled = true; const t = b.textContent; b.textContent = 'רגע…';
      try { await run(); } catch (e) { if (e?.code === 'no_notes') toast('צריך קודם כמה פתקים'); else if (e?.code !== 'ai_credit_needed') toast('זה לא הצליח כרגע'); }
      b.disabled = false; b.textContent = t;
    } }, label);
    noAi().then((out) => b.classList.toggle('offer', out));
    return b;
  };
  const aiNote = () => el('p', { class: 'ai-note' }, '✨ הוצע בעזרת העוזר החכם');

  /* ---------- directions: guided questions (no AI), or ✨ from the notes ---------- */
  const GUIDED = ['מה הטענה שלי, במשפט אחד?', 'מה עוד לא ידוע לי?', 'איזה מקור הכי חשוב, ולמה?', 'מי חושב אחרת, ומה הוא אומר?', 'מה הצעד הבא הכי קטן?'];
  function directionsSection() {
    const r = R.research;
    const out = el('div', { class: 'rx-dir-out', style: 'display:grid;gap:6px' });
    const addThread = async (text) => { await api(`/api/research/r/${r.id}/threads`, { body: { text } }); toast('נוסף לשאלות'); route(); };
    const addStep = async (text) => {
      const d = await api('/api/goals');
      const g = d.goals.find((x) => x.id === r.goalId);
      const p = g && (g.processes.find((x) => x.steps.some((s) => !s.done)) || g.processes[g.processes.length - 1]);
      if (!p) return toast('אין למטרה תהליך');
      await api(`/api/goals/processes/${p.id}/steps`, { body: { text } }); toast('נוסף כצעד במטרה');
    };
    return el('details', { class: 'card rx-directions' },
      el('summary', {}, '🧭 לאן עכשיו?'),
      el('p', { class: 'small muted', style: 'margin:0' }, 'שאלות שמזיזות מחקר. לחיצה מוסיפה לשאלות הפתוחות.'),
      el('div', { style: ROW }, GUIDED.map((q) => el('button', { class: 'chip', type: 'button', onclick: () => addThread(q) }, q))),
      el('div', { class: 'ai-pair' }, sparkle('✨ כיוונים מתוך הפתקים', async () => {
        const d = await api(`/api/research/r/${r.id}/ai/directions`, { body: {} });
        out.replaceChildren(
          d.questions.length ? el('b', {}, 'שאלות') : null,
          ...d.questions.map((q) => el('div', { style: ROW }, el('span', { dir: 'auto', style: 'flex:1' }, q), el('button', { class: 'btn ghost small', type: 'button', onclick: () => addThread(q) }, '+ לשאלות'))),
          d.steps.length ? el('b', {}, 'צעדים') : null,
          ...d.steps.map((s) => el('div', { style: ROW }, el('span', { dir: 'auto', style: 'flex:1' }, s),
            r.goalId ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => addStep(s) }, '+ למטרה') : null)),
          aiNote());
      })), out);
  }

  /* ---------- drafts: an outline from the notes, an empty one, or ✨ a draft ---------- */
  function draftsSection() {
    const r = R.research, box = el('div', { style: 'display:grid;gap:8px' }, el('p', { class: 'muted', style: 'margin:0' }, 'טוען…'));
    api(`/api/research/r/${r.id}/drafts`).then((d) => box.replaceChildren(...(d.drafts.length ? d.drafts.map((x) => el('button', { type: 'button', class: 'card rx-draft-item', onclick: () => openDraft(x.id) },
      el('b', { dir: 'auto' }, x.title), el('small', { class: 'muted' }, `${new Date(x.updatedAt).toLocaleDateString('he-IL')} · ${(x.size || 0).toLocaleString('he-IL')} תווים`)))
      : [el('p', { class: 'muted', style: 'margin:0' }, 'עוד אין טיוטות. שלד מהפתקים בונה כותרת לכל פתק, והציטוטים והביבליוגרפיה נכנסים לבד.')])));
    const create = async (body) => { const d = await api(`/api/research/r/${r.id}/drafts`, body); openDraft(d.id); };
    return el('section', { class: 'rx-drafts', style: 'display:grid;gap:10px' },
      el('h2', {}, '✍ כתיבה'),
      !R.can.add ? null : el('div', { class: 'ai-pair' },
        el('button', { class: 'btn primary small', type: 'button', onclick: () => create({ body: { title: r.title, outline: true } }) }, 'שלד מהפתקים'),
        // the academic pack's templates: IMRaD, a seminar paper, an essay, a talk, a post (their sections, a length to aim for)
        (() => { const s = el('select', { 'aria-label': 'טיוטה מתבנית', style: INPUT, onchange: () => { if (s.value) create({ body: { title: r.title, template: s.value } }); } },
          el('option', { value: '' }, 'מתבנית…'), [['imrad', 'מאמר מחקר (IMRaD)'], ['seminar', 'עבודה סמינריונית'], ['essay', 'מאמר עיון'], ['talk', 'הרצאה'], ['post', 'פוסט']].map(([v, n]) => el('option', { value: v }, n))); return s; })(),
        el('button', { class: 'btn ghost small', type: 'button', onclick: () => create({ body: { title: r.title } }) }, 'טיוטה ריקה'),
        sparkle('✨ טיוטה מהפתקים', async () => { const a = await api(`/api/research/r/${r.id}/ai/draft`, { body: {} }); await create({ body: { title: r.title + ' · טיוטה', body: a.body } }); toast('✨ טיוטה ראשונה מוכנה. כדאי לבדוק כל משפט מול הפתקים'); })),
      box);
  }

  function openDraft(id) { history.pushState(null, '', `?r=${R.research.id}&d=${id}`); drawDraft(id); scrollTo(0, 0); }
  async function drawDraft(id) {
    const D = await api(`/api/research/drafts/${id}`);
    const d = D.draft;
    const title = el('input', { type: 'text', value: d.title, dir: 'auto', 'aria-label': 'כותרת הטיוטה', style: INPUT + ';font-size:1.2rem;font-weight:600' });
    const text = el('textarea', { rows: 24, dir: 'auto', 'aria-label': 'הטיוטה', style: INPUT + ';inline-size:100%;line-height:1.7;font-size:1rem' });
    text.value = d.body;
    if (!d.mayEdit) { text.readOnly = true; title.readOnly = true; }
    const state = el('small', { class: 'muted', role: 'status' }, d.mayEdit ? 'נשמר' : 'לקריאה בלבד');
    // the academic pack: a length to aim for, numbered headings, and a checklist before handing in
    const countWords = (s) => s.replace(/\[@[^\]]*\]|\^\[[^\]]*\]|\{#[^}]*\}|\[ref:[^\]]*\]|[#*>\-[\]()]/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    const words = el('small', { class: 'rx-words muted' });
    const target = el('input', { type: 'number', min: '0', step: '100', value: d.target || '', 'aria-label': 'יעד מילים', style: INPUT + ';inline-size:7em' });
    const numbered = el('input', { type: 'checkbox', checked: d.numbered });
    const paintWords = () => { const n = countWords(text.value), goal = Number(target.value) || 0; words.textContent = goal ? `${n.toLocaleString('he-IL')} / ${goal.toLocaleString('he-IL')} מילים` : `${n.toLocaleString('he-IL')} מילים`; words.style.color = goal && n > goal * 1.1 ? 'var(--danger)' : ''; };
    const checks = el('details', { class: 'rx-checks card' }, el('summary', {}, '✓ לפני הגשה'));
    const drawChecks = (list) => { checks.replaceChildren(el('summary', {}, `✓ לפני הגשה · ${list.filter((c) => c.ok).length}/${list.length}`),
      el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:4px' }, list.map((c) => el('li', { class: c.ok ? 'ok' : 'todo' }, (c.ok ? '✓ ' : '○ ') + c.text)))); };
    let t = 0;
    const save = async () => {
      if (!d.mayEdit) return;
      clearTimeout(t); state.textContent = 'שומר…';
      try {
        await api(`/api/research/drafts/${id}`, { method: 'PUT', body: { title: title.value.trim() || d.title, body: text.value, target: Number(target.value) || null, numbered: numbered.checked } });
        state.textContent = 'נשמר';
        api(`/api/research/drafts/${id}`).then((x) => drawChecks(x.checklist)).catch(() => {});
      } catch (_) { state.textContent = 'לא נשמר – בדקו את החיבור'; }
    };
    target.oninput = () => { paintWords(); clearTimeout(t); t = setTimeout(save, 900); };
    numbered.onchange = save;
    const refTo = () => {
      const labels = [...text.value.matchAll(/\{#([^}]+)\}/g)].map((m) => m[1]);
      const label = prompt(labels.length ? `לאיזה סעיף? (${labels.join(', ')})` : 'אין עדיין תוויות. מוסיפים לכותרת {#שם}, למשל: ## רקע {#רקע}. לאיזו תווית להפנות?', labels[0] || '');
      if (label && label.trim()) insert(`[ref:${label.trim()}]`);
    };
    /** ✨ language editing: the edited text is shown first, and replaces the draft only when the person agrees */
    const editLanguage = async () => {
      await save();
      const sel = text.selectionEnd > text.selectionStart ? text.value.slice(text.selectionStart, text.selectionEnd) : null;
      const x = await api(`/api/research/drafts/${id}/ai/edit`, { body: sel ? { text: sel } : {} });
      const view = el('textarea', { rows: 14, dir: 'auto', readonly: true, style: INPUT + ';inline-size:100%' }); view.value = x.text;
      H.modal(el('h2', {}, '✨ עריכה לשונית'), x.notes.length ? el('ul', {}, x.notes.map((n) => el('li', {}, n))) : null, view, aiNote(),
        el('div', { style: ROW },
          el('button', { class: 'btn primary', type: 'button', onclick: () => {
            if (sel) { const a = text.selectionStart; text.value = text.value.slice(0, a) + x.text + text.value.slice(text.selectionEnd); } else text.value = x.text;
            H.closeModal(); later(); toast('הטקסט הוחלף. אפשר לבטל ב־Ctrl+Z בתוך התיבה');
          } }, sel ? 'להחליף את הקטע' : 'להחליף את הטיוטה'),
          el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'ביטול')));
    };
    const later = () => { state.textContent = '…'; paintWords(); clearTimeout(t); t = setTimeout(save, 900); };
    title.oninput = later; text.oninput = later;
    const insert = (s) => { const a = text.selectionStart ?? text.value.length; text.value = text.value.slice(0, a) + s + text.value.slice(text.selectionEnd ?? a); text.focus(); text.setSelectionRange(a + s.length, a + s.length); later(); };
    // (no display in its inline style: an inline display would beat [hidden] and leave an empty box)
    const preview = el('div', { class: 'rx-preview card', hidden: true });
    // the preview is the page itself as it exports (headings, lists, the citations written out, the bibliography)
    const showPreview = async () => {
      await save();
      preview.replaceChildren(el('iframe', { title: 'תצוגה מקדימה', src: `/api/research/drafts/${id}/export?format=html&t=${Date.now()}`, style: 'inline-size:100%;block-size:70vh;border:0;background:#fff;border-radius:10px' }));
      preview.hidden = false; text.hidden = true;
    };
    const pickCite = () => H.modal(el('h2', {}, 'ציטוט'), el('p', { class: 'muted' }, 'בטקסט יופיע ציטוט קצר בסגנון של המחקר, והמקור ייכנס לביבליוגרפיה.'),
      D.sources.length ? el('div', { style: 'display:grid;gap:6px' }, D.sources.map((s) => el('button', { class: 'btn ghost', type: 'button', style: 'text-align:start;justify-content:start', onclick: () => {
        const page = prompt('עמוד (לא חובה):', '');
        H.closeModal(); insert(`[@${s.id}${page && page.trim() ? ', p. ' + page.trim() : ''}]`);
      } }, `${s.inText} · ${s.title}`))) : el('p', {}, 'אין עדיין מקורות במחקר.'));
    const pickNote = () => H.modal(el('h2', {}, 'פתק לטיוטה'), el('div', { style: 'display:grid;gap:6px' }, D.notes.map((n) => el('button', { class: 'btn ghost', type: 'button', style: 'text-align:start;justify-content:start',
      onclick: () => { H.closeModal(); insert(`\n\n${n.body}\n\n`); } }, n.title))));
    // the print view and the slides open in a tab; the rest download
    const ex = (fmt, label) => { const view = fmt === 'html' || fmt === 'slides'; return el('a', { class: 'btn ghost small', href: `/api/research/drafts/${id}/export?format=${fmt}`, target: view ? '_blank' : null, download: view ? null : '', onclick: () => save() }, label); };
    const toDrive = el('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
      await save(); toDrive.disabled = true;
      try { const x = await api(`/api/research/drafts/${id}/drive`, { body: {} }); toast('נשמר ב־Google Docs', 'לפתוח', () => window.open(x.url, '_blank', 'noopener')); }
      catch (e) {
        if (e.code === 'drive_not_connected') H.modal(el('h2', {}, 'Google Docs'), el('p', {}, 'בפעם הראשונה Google ישאל אם לתת לאוהל גישה ל־Drive: רק לקבצים שהאוהל עצמו יוצר.'),
          el('a', { class: 'btn primary', href: `/api/auth/login?drive=1&next=${encodeURIComponent(location.pathname + location.search)}` }, 'להמשיך ל־Google'));
        else toast('לא נשמר ב־Drive');
      }
      toDrive.disabled = false;
    } }, '☁ Google Docs');
    root.replaceChildren(el('div', { class: 'rx rx-draft' },
      el('button', { class: 'folder-back', type: 'button', onclick: async () => { await save(); history.pushState(null, '', `?r=${d.research}`); route(); } }, '‹ ' + d.researchTitle),
      title,
      el('div', { class: 'rx-toolbar' },
        el('button', { class: 'btn ghost small', type: 'button', onclick: pickCite }, '+ ציטוט'),
        el('button', { class: 'btn ghost small', type: 'button', onclick: pickNote }, '+ פתק'),
        el('button', { class: 'btn ghost small', type: 'button', title: 'הערת שוליים: ^[הטקסט]', onclick: () => { const n = prompt('הערת השוליים:'); if (n && n.trim()) insert(`^[${n.trim()}]`); } }, '+ הערת שוליים'),
        el('button', { class: 'btn ghost small', type: 'button', title: 'מוסיפים לכותרת {#שם}, ומפנים אליה [ref:שם]', onclick: refTo }, '+ הפניה לסעיף'),
        el('button', { class: 'btn ghost small', type: 'button', onclick: () => (preview.hidden ? showPreview() : (preview.hidden = true, text.hidden = false)) }, '👁 תצוגה'),
        el('span', { style: 'flex:1' }), words, state),
      el('div', { class: 'rx-format' },
        el('label', { style: ROW }, numbered, 'כותרות ממוספרות'),
        el('label', { style: ROW }, el('span', { class: 'small muted' }, 'יעד:'), target, el('span', { class: 'small muted' }, 'מילים')),
        d.template ? el('small', { class: 'muted' }, 'תבנית: ' + d.template.name) : null,
        el('span', { class: 'ai-pair' }, sparkle('✨ עריכה לשונית', editLanguage))),
      text, preview,
      checks,
      el('div', { class: 'rx-export' }, el('small', { class: 'muted' }, 'ייצוא:'), ex('md', 'Markdown'), ex('html', 'להדפסה / PDF'), ex('docx', 'Word (docx)'), ex('slides', 'שקפים'), ex('tex', 'LaTeX'), ex('bib', 'BibTeX'), toDrive,
        d.mayEdit ? el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (!confirm('למחוק את הטיוטה?')) return; await api(`/api/research/drafts/${id}`, { method: 'DELETE' }); history.pushState(null, '', `?r=${d.research}`); route(); } }, 'מחיקה') : null),
      el('p', { class: 'small muted', style: 'margin:0' }, 'כותבים ב־Markdown: # כותרת, **מודגש**, - רשימה. ציטוט [@…], הערת שוליים ^[…], תווית לכותרת {#שם} והפניה אליה [ref:שם]. "להדפסה / PDF" ו"שקפים" נפתחים בדפדפן (שומרים משם כ־PDF).')));
    drawChecks(D.checklist);
    paintWords();
    addEventListener('beforeunload', save, { once: true });
  }

  /* ---------- the research journal ---------- */
  function journalSection() {
    const r = R.research, today = el('textarea', { rows: 3, dir: 'auto', placeholder: 'מה עשיתי היום במחקר? מה גיליתי? מה מחר?', 'aria-label': 'יומן המחקר של היום', style: INPUT + ';inline-size:100%' });
    const list = el('div', { style: 'display:grid;gap:6px' });
    api(`/api/research/r/${r.id}/journal`).then((j) => {
      const mine = j.entries.find((e) => e.day === j.today);
      if (mine) today.value = mine.text;
      list.replaceChildren(...j.entries.filter((e) => e.day !== j.today).slice(0, 10).map((e) => el('div', { class: 'rx-journal-entry' },
        el('small', { class: 'muted' }, new Date(e.day).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' })), el('p', { dir: 'auto', style: 'margin:0;white-space:pre-line' }, e.text))));
    }).catch(() => {});
    let t = 0;
    today.oninput = () => { clearTimeout(t); t = setTimeout(() => api(`/api/research/r/${r.id}/journal`, { method: 'PUT', body: { text: today.value } }).catch(() => {}), 900); };
    return el('section', { class: 'rx-journal', style: 'display:grid;gap:8px' }, el('h2', {}, '📓 יומן מחקר'), today, list);
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
    const existing = R.can.add ? el('button', { class: 'btn ghost small', type: 'button', onclick: pickExisting }, '+ פתק קיים') : null;
    return el('section', { class: 'rx-notes', style: 'display:grid;gap:10px' },
      el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, el('h2', { style: 'flex:1' }, `📝 פתקים (${R.notes.length})`), existing),
      R.can.add ? add : null,
      R.notes.length ? el('div', { style: GRID }, R.notes.map((n) => n.hidden ? el('article', { class: 'card rx-note rx-private' },
        el('b', { class: 'muted' }, '🔒 ' + n.title), el('small', { class: 'muted' }, 'הכותב לא שיתף את התוכן שלו.'))
        : el('article', { class: 'card rx-note' },
        el('b', { dir: 'auto' }, (n.starred ? '★ ' : '') + n.title),
        R.shared && !n.mine ? el('small', { class: 'muted' }, 'מאת ' + n.authorName) : null,
        n.body ? el('p', { dir: 'auto', style: 'margin:0;white-space:pre-line' }, snip(n.body, 400)) : null,
        n.source ? el('a', { class: 'small', href: n.source.url, target: '_blank', rel: 'noopener' }, '↗ ' + (n.source.title || 'המקור')) : null,
        n.links.length ? el('small', { class: 'rx-links' }, '→ ', n.links.map((x) => x.title).join(' · ')) : null,
        n.backlinks.length ? el('small', { class: 'rx-backlinks muted' }, '← מצביעים לכאן: ', n.backlinks.map((x) => x.title).join(' · ')) : null,
        el('div', { style: ROW },
          n.mine ? el('a', { class: 'btn ghost small', href: `/tools/notes/?open=${n.id}` }, 'פתיחה ועריכה') : n.mayEdit ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => editNote(n) }, '✎ עריכה') : null,
          n.mine && (R.shared || R.role !== 'owner') ? el('button', { class: 'btn ghost small', type: 'button', title: n.shared ? 'כולם במחקר רואים את הפתק' : 'האחרים רואים רק שיש כאן פתק פרטי שלך', onclick: async () => {
            await api(`/api/research/r/${r.id}/notes/${n.id}/share`, { method: 'PUT', body: { shared: !n.shared } }); toast(n.shared ? 'הפתק פרטי עכשיו' : 'הפתק משותף עכשיו'); route();
          } }, n.shared ? '🔓 משותף' : '🔒 פרטי') : null,
          R.shared ? commentOn('note', n.id) : null,
          n.mayEdit ? el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { await api(`/api/research/r/${r.id}/notes/${n.id}`, { method: 'DELETE' }); route(); } }, 'הסרה מהמחקר') : null))))
        : el('p', { class: 'muted', style: 'margin:0' }, 'עוד אין פתקים במחקר. פתק יכול להיות גם בכמה מחקרים: זה אותו פתק, ותיקון בו מתעדכן בכולם.'));
  }
  async function pickExisting() {
    const all = (await api('/api/notes')).notes.filter((n) => !R.notes.some((x) => x.id === n.id));
    const q = el('input', { type: 'search', placeholder: 'חיפוש בפתקים', dir: 'auto', style: INPUT + ';inline-size:100%' });
    const list = el('div', { style: 'display:grid;gap:6px;max-block-size:50vh;overflow:auto' });
    const draw = () => list.replaceChildren(...all.filter((n) => !q.value || (n.title + ' ' + n.body).includes(q.value)).slice(0, 50).map((n) => el('button', { type: 'button', class: 'btn ghost', style: 'text-align:start;justify-content:start',
      onclick: async () => { H.closeModal(); await addExisting(R.research.id, n.id); route(); } }, n.title)));
    q.oninput = draw; draw();
    H.modal(el('h2', {}, 'פתק קיים למחקר'), el('p', { class: 'muted' }, 'אותו פתק, לא עותק: תיקון בו מתעדכן בכל מקום.'), q, list);
  }

  /** an editor fixes someone else's note in the research (it is the same note, in its writer's פתקים) */
  function editNote(n) {
    const title = el('input', { type: 'text', value: n.title, dir: 'auto', 'aria-label': 'כותרת', style: INPUT + ';inline-size:100%' });
    const body = el('textarea', { rows: 10, dir: 'auto', 'aria-label': 'הפתק', style: INPUT + ';inline-size:100%' }); body.value = n.body;
    H.modal(el('h2', {}, 'עריכת פתק'), el('p', { class: 'small muted' }, `הפתק של ${n.authorName}: התיקון יופיע גם אצלו, וההיסטוריה שומרת איך היה.`), title, body,
      el('div', { style: ROW }, el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        await api(`/api/research/r/${R.research.id}/notes/${n.id}`, { method: 'PUT', body: { title: title.value.trim() || n.title, body: body.value } }); H.closeModal(); route();
      } }, 'שמירה')));
  }

  function threadsSection() {
    const r = R.research;
    const q = el('input', { type: 'text', dir: 'auto', placeholder: 'שאלה פתוחה, או חוט שכדאי לחזור אליו…', 'aria-label': 'שאלה חדשה', style: INPUT + ';flex:1;min-inline-size:12rem' });
    const addQ = async () => { if (!q.value.trim()) return q.focus(); await api(`/api/research/r/${r.id}/threads`, { body: { text: q.value } }); route(); };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') addQ(); });
    return el('section', { class: 'rx-threads-sec', style: 'display:grid;gap:10px' },
      el('h2', {}, `🧵 שאלות וחוטים (${R.threads.filter((t) => t.status === 'open').length} פתוחות)`),
      R.can.add ? el('div', { style: ROW }, q, el('button', { class: 'btn small', type: 'button', onclick: addQ }, 'הוספה')) : null,
      R.threads.length ? el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:8px' }, R.threads.map((t) => threadRow(t))) : null);
  }
  function threadRow(t, withResearch = false) {
    const setStatus = async (status, answer) => { await api(`/api/research/threads/${t.id}`, { method: 'PUT', body: { status, ...(answer !== undefined ? { answer } : {}) } }); route(); };
    return el('li', { class: 'card rx-thread ' + t.status },
      el('div', { style: 'display:flex;gap:8px;align-items:start' },
        el('span', { dir: 'auto', style: 'flex:1' + (t.status === 'answered' ? ';opacity:.7' : '') }, t.text),
        el('small', { class: 'rx-status' }, STATUS[t.status])),
      withResearch ? el('button', { type: 'button', class: 'linklike small', style: 'background:none;border:0;padding:0;color:var(--primary);cursor:pointer;font:inherit;text-align:start', onclick: () => go(t.research) }, '↩ ' + (t.researchTitle || '')) : null,
      t.answer ? el('small', { dir: 'auto' }, 'תשובה: ' + t.answer) : null,
      !withResearch && t.by && !t.mine && R?.shared ? el('small', { class: 'muted' }, 'מאת ' + t.by) : null,
      t.mayEdit === false ? (withResearch ? null : el('div', { style: ROW }, R.shared ? commentOn('thread', t.id) : null)) : el('div', { style: ROW },
        t.status !== 'answered' ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => { const a = prompt('התשובה (קצרה):', t.answer || ''); if (a !== null) setStatus('answered', a); } }, '✓ נענתה') : el('button', { class: 'btn ghost small', type: 'button', onclick: () => setStatus('open') }, 'לפתוח שוב'),
        t.status === 'open' ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => setStatus('parked') }, '⏸ להשהות') : t.status === 'parked' ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => setStatus('open') }, '▶ להמשיך') : null,
        !withResearch && R.shared ? commentOn('thread', t.id) : null,
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
      return el('div', { class: 'card rx-found-item' },
        el('b', { dir: 'auto' }, csl.title), el('small', { class: 'muted', dir: 'auto' }, [a, year, csl['container-title']].filter(Boolean).join(' · ')),
        el('div', { style: ROW },
          x.retracted ? el('small', { class: 'rx-retracted' }, '⚠ המאמר נמשך') : null,
          x.cited ? el('small', { class: 'muted' }, `צוטט ${x.cited.toLocaleString('he-IL')} פעמים`) : null,
          x.oa ? el('a', { class: 'small', href: x.oa, target: '_blank', rel: 'noopener' }, '📄 גרסה פתוחה') : null,
          has ? el('small', { class: 'muted' }, '✓ כבר במחקר') : el('button', { class: 'btn small', type: 'button', onclick: async (e) => {
            e.currentTarget.disabled = true;
            await api(`/api/research/r/${r.id}/sources`, { body: x.doi ? { doi: x.doi } : { csl: { ...csl, title: csl.title || '(ללא כותרת)' } } });
            toast('המקור נוסף'); route();
          } }, '+ למחקר')));
    };
    return el('section', { class: 'rx-sources', style: 'display:grid;gap:10px' },
      el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, el('h2', { style: 'flex:1' }, `📚 מקורות (${R.sources.length})`),
        R.can.add ? el('button', { class: 'btn ghost small', type: 'button', onclick: manualSource }, '+ מקור ידני') : null),
      !R.can.add ? null : el('div', { style: ROW }, q, el('span', { class: 'ai-pair' }, el('button', { class: 'btn small primary', type: 'button', onclick: search }, 'חיפוש'),
        // ✨ focused search: the AI writes the searches from the research (or the words typed as a question)
        sparkle('✨ חיפוש ממוקד', async () => {
          out.replaceChildren(el('p', { class: 'muted' }, 'מנסח חיפושים ומחפש…'));
          const d = await api(`/api/research/r/${r.id}/ai/search`, { body: q.value.trim() ? { question: q.value.trim() } : {} });
          out.replaceChildren(el('small', { class: 'muted' }, 'חיפשתי: ' + d.queries.join(' · ')), ...(d.results.length ? d.results.map(foundRow) : [el('p', { class: 'muted' }, 'לא נמצאו מקורות.')]),
            aiNote(), el('small', { class: 'muted' }, 'מקורות: OpenAlex (CC0).'));
        }))),
      R.sources.length > 1 ? el('div', { class: 'ai-pair' }, sparkle('✨ השוואה בין מקורות', compareSources)) : null,
      out,
      R.sources.length ? el('ol', { class: 'rx-bib', style: 'margin:0;padding-inline-start:1.4em;display:grid;gap:10px' }, R.sources.map((s) => el('li', { class: 'rx-source' + (s.retracted ? ' retracted' : '') },
        cite(s.cite),
        el('div', { style: ROW + ';margin-top:4px' },
          el('small', { class: 'muted', dir: 'ltr' }, s.inText),
          s.retracted ? el('small', { style: 'color:var(--danger)' }, '⚠ נמשך') : null,
          s.oa ? el('a', { class: 'small', href: s.oa, target: '_blank', rel: 'noopener' }, '📄 גרסה פתוחה') : null,
          s.doi ? sparkle('✨ סיכום', () => summarize(s)) : null,
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => { navigator.clipboard?.writeText(s.cite.replace(/\*/g, '')); toast('הועתק'); } }, 'העתקה'),
          R.shared && s.by && !s.mine ? el('small', { class: 'muted' }, 'הוסיף: ' + s.by) : null,
          R.shared ? commentOn('source', s.id) : null,
          s.mayEdit ? el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'הסרת המקור', onclick: async () => { if (confirm('להסיר את המקור מהמחקר?')) { await api(`/api/research/sources/${s.id}`, { method: 'DELETE' }); route(); } } }, '✕') : null))))
        : el('p', { class: 'muted', style: 'margin:0' }, 'עוד אין מקורות. הדביקו DOI או חפשו מאמר; הביבליוגרפיה נבנית לבד, בסגנון שבחרתם.'));
  }
  /** ✨ a source in a few points, from its abstract (read live from OpenAlex, kept nowhere unless saved as a note) */
  async function summarize(s) {
    let x;
    try { x = await api(`/api/research/sources/${s.id}/ai/summary`, { body: {} }); }
    catch (e) { if (e.code === 'no_abstract') return toast('אין למקור הזה תקציר פתוח לסכם'); throw e; }
    const text = x.points.map((p) => '- ' + p).join('\n') + '\n\n' + x.relevance;
    H.modal(el('h2', {}, '✨ סיכום · ' + x.cite), el('ul', {}, x.points.map((p) => el('li', { dir: 'auto' }, p))), el('p', { dir: 'auto' }, x.relevance), aiNote(),
      el('div', { style: ROW }, el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        await api(`/api/research/r/${R.research.id}/notes`, { body: { title: 'סיכום: ' + (s.csl.title || x.cite).slice(0, 80), body: text + `\n\n[@${s.id}]` } });
        H.closeModal(); toast('נשמר כפתק במחקר'); route();
      } }, 'שמירה כפתק'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'סגירה')));
  }
  /** ✨ two to five sources side by side: agree, differ, what each adds */
  function compareSources() {
    const picks = R.sources.filter((s) => s.doi).map((s) => ({ s, box: el('input', { type: 'checkbox' }) }));
    if (picks.length < 2) { toast('להשוואה צריך לפחות שני מקורות עם DOI'); return; }
    H.modal(el('h2', {}, '✨ השוואה'), el('p', { class: 'muted' }, 'בחרו שניים עד חמישה מקורות. ההשוואה נעשית מהתקצירים שלהם.'),
      el('div', { style: 'display:grid;gap:6px' }, picks.map((p) => el('label', { style: ROW }, p.box, el('span', { dir: 'ltr' }, p.s.inText + ' ' + (p.s.csl.title || ''))))),
      el('div', {}, el('button', { class: 'btn primary', type: 'button', onclick: async (e) => {
        const ids = picks.filter((p) => p.box.checked).map((p) => p.s.id);
        if (ids.length < 2 || ids.length > 5) return toast('שניים עד חמישה');
        e.currentTarget.disabled = true; e.currentTarget.textContent = 'משווה…';
        try {
          const x = await api(`/api/research/r/${R.research.id}/ai/compare`, { body: { sources: ids } });
          const view = el('textarea', { rows: 16, dir: 'auto', readonly: true, style: INPUT + ';inline-size:100%' }); view.value = x.body;
          H.modal(el('h2', {}, '✨ השוואה'), x.missing.length ? el('p', { class: 'small muted' }, 'בלי תקציר, ולכן בחוץ: ' + x.missing.join(', ')) : null, view, aiNote(),
            el('div', { style: ROW }, el('button', { class: 'btn primary', type: 'button', onclick: async () => {
              await api(`/api/research/r/${R.research.id}/notes`, { body: { title: 'השוואה בין מקורות', body: x.body } }); H.closeModal(); toast('נשמר כפתק'); route();
            } }, 'שמירה כפתק'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'סגירה')));
        } catch (err) { if (err.code === 'no_abstract') toast('לפחות לשניים מהם צריך תקציר פתוח'); else if (err.code !== 'ai_credit_needed') toast('ההשוואה לא הצליחה כרגע'); e.currentTarget.disabled = false; e.currentTarget.textContent = 'השוואה'; }
      } }, 'השוואה')));
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
