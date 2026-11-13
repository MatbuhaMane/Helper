/* הודעות: messages between members, one on one, text only (server/dm.ts).
   A list of conversations, one conversation, and writing. "שיחה חדשה" offers only who one may write to: the household,
   and the users of the joined trees (when the tree is open on this device). Only the two sides read a conversation.
   Polls while the page is in front: the open conversation every 5 s, the list every 20 s (no sockets).
   Phone: the list or the conversation (#t=<id>); wide: both side by side.
   The look is design's to make (.dm-*, docs/decisions.md); the inline rules below only hold the layout until then. */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('הודעות');
  const root = document.querySelector('main');
  const MAX = 2000;

  document.head.append(el('style', {}, `
    .dm { display: grid; gap: 14px; }
    @media (min-width: 900px) { .dm { grid-template-columns: minmax(260px, 340px) 1fr; align-items: start; } .dm-back { display: none; } }
    @media (max-width: 899px) { .dm[data-open] .dm-list { display: none; } .dm:not([data-open]) .dm-thread { display: none; } }
    .dm-list, .dm-thread { margin: 0; padding: 12px; min-inline-size: 0; }
    .dm-list-head, .dm-thread-head { display: flex; align-items: center; gap: 8px; justify-content: space-between; margin-block-end: 8px; }
    .dm-list-head h2, .dm-thread-head h2 { margin: 0; font-size: 1.1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dm-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    .dm-row { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; inline-size: 100%; text-align: start; padding: 10px; border-radius: var(--radius-sm);
      background: transparent; border: 1px solid transparent; color: var(--text); font: inherit; cursor: pointer; }
    .dm-row:hover, .dm-row[aria-current="true"] { background: var(--tint); border-color: var(--line); }
    .dm-row b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dm-row small { grid-column: 1 / -1; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dm-row time { color: var(--muted); font-size: .8rem; }
    .dm-row.unread b::after { content: ''; display: inline-block; inline-size: 8px; block-size: 8px; border-radius: 50%; background: #c2412d; margin-inline-start: 6px; vertical-align: middle; }
    .dm-msgs { display: flex; flex-direction: column; gap: 6px; max-block-size: min(62vh, 640px); min-block-size: 200px; overflow-y: auto; padding: 4px; }
    .dm-msg { max-inline-size: 82%; padding: 8px 12px; border-radius: 14px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; }
    .dm-msg.mine { align-self: flex-start; background: var(--primary); color: var(--primary-ink); border-end-start-radius: 4px; }
    .dm-msg.theirs { align-self: flex-end; background: var(--tint); color: var(--text); border: 1px solid var(--line); border-end-end-radius: 4px; }
    .dm-msg time { display: block; font-size: .72rem; opacity: .75; margin-block-start: 2px; }
    .dm-day { align-self: center; color: var(--muted); font-size: .8rem; margin: 6px 0; }
    .dm-compose { display: flex; gap: 8px; align-items: flex-end; margin-block-start: 10px; }
    .dm-compose textarea { flex: 1; min-block-size: 44px; max-block-size: 160px; resize: none; }
    .dm-note, .dm-empty { color: var(--muted); font-size: .9rem; margin: 8px 0; }
    .dm-pick { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 4px; max-block-size: 50vh; overflow-y: auto; }
    .dm-pick h3 { font-size: .85rem; color: var(--muted); margin: 10px 0 2px; }
  `));

  /* ---------- times ---------- */
  const hm = (t) => new Date(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const dayName = (t) => {
    const d = new Date(t), now = new Date();
    if (d.toDateString() === now.toDateString()) return 'היום';
    if (d.toDateString() === new Date(now - 864e5).toDateString()) return 'אתמול';
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  };
  const when = (t) => (new Date(t).toDateString() === new Date().toDateString() ? hm(t) : H.timeAgo(t));

  /* ---------- the frame ---------- */
  const rows = el('ul', { class: 'dm-rows' });
  const listEmpty = el('p', { class: 'dm-empty', hidden: true }, 'עוד אין שיחות. אפשר לפתוח שיחה עם מישהו מהבית או מהעצים המחוברים.');
  const list = el('section', { class: 'card dm-list', 'aria-label': 'השיחות' },
    el('div', { class: 'dm-list-head' }, el('h2', {}, 'השיחות'), el('button', { class: 'btn primary small', type: 'button', onclick: pickPerson }, 'שיחה חדשה')),
    listEmpty, rows);
  const thread = el('section', { class: 'card dm-thread', 'aria-label': 'שיחה' });
  const frame = el('div', { class: 'dm' }, list, thread);
  root.append(frame);

  let threads = [], open = null;            // open: { id, name, blocked, canSend, messages, seenByOther }
  const idFromHash = () => (location.hash.match(/^#t=([\w-]{1,40})$/) || [])[1] || null;

  /* ---------- the list ---------- */
  async function loadList() {
    try {
      const d = await api('/api/dm');
      threads = d.threads;
      H.dmUnread?.(d.unread);
      drawList();
    } catch (e) { if (!threads.length) { listEmpty.hidden = false; listEmpty.textContent = e.message || 'לא הצלחנו לטעון את השיחות'; } }
  }
  function drawList() {
    listEmpty.hidden = threads.length > 0;
    rows.replaceChildren(...threads.map((t) => el('li', {}, el('button', {
      class: 'dm-row' + (t.unread ? ' unread' : ''), type: 'button', 'aria-current': open?.id === t.id ? 'true' : 'false',
      onclick: () => go(t.id),
    }, el('b', { dir: 'auto' }, t.name), el('time', {}, when(t.at)),
      el('small', { dir: 'auto' }, t.blocked ? 'חסום' : t.last ? (t.last.mine ? 'את/ה: ' : '') + t.last.text : '')))));
  }

  /* ---------- one conversation ---------- */
  function go(id) { if (location.hash !== '#t=' + id) location.hash = 't=' + id; else show(id); }
  addEventListener('hashchange', () => show(idFromHash()));

  async function show(id) {
    if (!id) { open = null; frame.removeAttribute('data-open'); drawEmptyThread(); drawList(); return; }
    frame.setAttribute('data-open', '');
    if (open?.id !== id) { open = { id, name: threads.find((t) => t.id === id)?.name || '', messages: [], canSend: false }; drawThread(true); }
    try {
      const d = await api('/api/dm/' + encodeURIComponent(id));
      open = { ...d };
      drawThread(true);
      const t = threads.find((x) => x.id === id);
      if (t?.unread) { t.unread = false; H.dmUnread?.(threads.filter((x) => x.unread).length); }
      drawList();
    } catch (e) {
      open = null;
      thread.replaceChildren(el('p', { class: 'dm-empty' }, e.status === 404 ? 'השיחה הזו לא נמצאה.' : e.message || 'לא הצלחנו לפתוח'), backBtn());
    }
  }
  const backBtn = () => el('button', { class: 'btn ghost small dm-back', type: 'button', onclick: () => { location.hash = ''; } }, '‹ לשיחות');

  function drawEmptyThread() {
    thread.replaceChildren(el('p', { class: 'dm-empty' }, threads.length ? 'בחרו שיחה מהרשימה.' : 'כאן תופיע השיחה.'));
  }

  let msgsBox = null, input = null;
  function drawThread(scroll) {
    const o = open;
    const menu = el('button', { class: 'btn ghost small', type: 'button', onclick: () => toggleBlock() }, o.blocked ? 'בטל חסימה' : 'חסום');
    msgsBox = el('div', { class: 'dm-msgs', role: 'log', 'aria-live': 'polite', 'aria-label': 'ההודעות' });
    drawMessages();
    input = el('textarea', { rows: 1, maxlength: MAX, dir: 'auto', placeholder: 'כתבו הודעה…', 'aria-label': 'הודעה ל' + o.name,
      oninput: grow, onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); sendNow(); } } });
    const sendBtn = el('button', { class: 'btn primary', type: 'button', onclick: sendNow }, 'שלח');
    const compose = o.canSend
      ? el('div', { class: 'dm-compose' }, input, sendBtn)
      : el('p', { class: 'dm-note' }, o.blocked ? 'חסמת את השיחה הזו. אפשר לבטל את החסימה למעלה.' : o.messages ? 'אי אפשר לכתוב כאן כרגע.' : '');
    thread.replaceChildren(
      el('div', { class: 'dm-thread-head' }, backBtn(), el('h2', { dir: 'auto' }, o.name || '…'), o.messages ? menu : null),
      msgsBox, compose,
      el('p', { class: 'dm-note' }, 'רק שניכם רואים את השיחה הזו.'));
    if (scroll) msgsBox.scrollTop = msgsBox.scrollHeight;
  }
  function drawMessages() {
    const kids = [];
    let day = '';
    for (const m of open.messages || []) {
      const d = dayName(m.at);
      if (d !== day) { day = d; kids.push(el('div', { class: 'dm-day' }, d)); }
      kids.push(el('div', { class: 'dm-msg ' + (m.mine ? 'mine' : 'theirs'), dir: 'auto' }, m.text, el('time', {}, hm(m.at))));
    }
    const lastMine = [...(open.messages || [])].reverse().find((m) => m.mine);
    if (lastMine && open.seenByOther && open.seenByOther >= lastMine.at) kids.push(el('div', { class: 'dm-day' }, 'נקרא'));
    if (!kids.length && open.messages) kids.push(el('p', { class: 'dm-empty' }, 'עוד לא נכתב כאן דבר. כתבו את ההודעה הראשונה.'));
    msgsBox.replaceChildren(...kids);
  }
  function grow() { input.style.blockSize = 'auto'; input.style.blockSize = Math.min(input.scrollHeight + 2, 160) + 'px'; }

  let sending = false;
  async function sendNow() {
    const text = input.value.trim();
    if (!text || sending || !open) return;
    sending = true;
    try {
      const d = await api('/api/dm/' + encodeURIComponent(open.id), { body: { text } });
      open.messages.push(d.message);
      input.value = ''; grow();
      drawMessages(); msgsBox.scrollTop = msgsBox.scrollHeight;
      loadList();
    } catch (e) {
      toast(e.status === 429 ? 'רגע, יותר מדי הודעות. נסו שוב עוד מעט.' : e.status === 403 ? 'אי אפשר לשלוח לאדם הזה כרגע.' : e.message || 'ההודעה לא נשלחה');
    } finally { sending = false; input?.focus(); }
  }

  async function toggleBlock() {
    const o = open;
    if (!o.blocked && !confirm(`לחסום את ${o.name}? אף אחד מכם לא יוכל לכתוב בשיחה עד שתבטלו את החסימה.`)) return;
    try {
      await api(`/api/dm/${encodeURIComponent(o.id)}/block`, { method: o.blocked ? 'DELETE' : 'POST' });
      toast(o.blocked ? 'החסימה בוטלה' : 'נחסם');
      await show(o.id); loadList();
    } catch (e) { toast(e.message || 'לא הצלחנו'); }
  }

  /* ---------- polling while in front ---------- */
  async function pollThread() {
    if (!open?.messages || document.visibilityState !== 'visible') return;
    const last = open.messages.at(-1)?.at || 0, id = open.id;
    try {
      const d = await api(`/api/dm/${encodeURIComponent(id)}?after=${last}`, { noRedirect: true });
      if (open?.id !== id) return;
      const fresh = d.messages.filter((m) => !open.messages.some((x) => x.id === m.id));
      const changed = fresh.length || d.seenByOther !== open.seenByOther || d.canSend !== open.canSend;
      open.seenByOther = d.seenByOther;
      if (d.canSend !== open.canSend || d.blocked !== open.blocked) { Object.assign(open, { canSend: d.canSend, blocked: d.blocked }); drawThread(false); }
      if (changed) {
        const atEnd = msgsBox.scrollHeight - msgsBox.scrollTop - msgsBox.clientHeight < 40;
        open.messages.push(...fresh);
        drawMessages();
        if (atEnd) msgsBox.scrollTop = msgsBox.scrollHeight;
      }
    } catch (_) { /* offline: the next round */ }
  }
  setInterval(pollThread, 5000);
  setInterval(() => { if (document.visibilityState === 'visible') loadList(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { loadList(); pollThread(); } });

  /* ---------- a new conversation: only who one may write to ---------- */
  async function pickPerson() {
    const box = el('div', {}, el('p', { class: 'dm-note' }, 'טוען…'));
    H.modal(el('h2', {}, 'שיחה חדשה'), box);
    let d;
    try { d = await api('/api/dm/people'); } catch (e) { box.replaceChildren(el('p', { class: 'dm-note' }, e.message || 'לא הצלחנו לטעון')); return; }
    const q = el('input', { type: 'search', placeholder: 'חיפוש לפי שם', 'aria-label': 'חיפוש לפי שם', dir: 'auto' });
    const ul = el('ul', { class: 'dm-pick' });
    const draw = () => {
      const s = q.value.trim();
      const pick = d.people.filter((p) => !s || p.name.includes(s));
      const part = (where, title) => {
        const ps = pick.filter((p) => p.where === where);
        return ps.length ? [el('li', {}, el('h3', {}, title)), ...ps.map((p) => el('li', {}, el('button', { class: 'dm-row', type: 'button', onclick: () => startWith(p) },
          el('b', { dir: 'auto' }, p.name), el('small', {}, [p.relation, p.where === 'tribe' ? p.title : null].filter(Boolean).join(' · ')))))] : [];
      };
      const items = [...part('home', 'מהבית'), ...part('tribe', 'מהעצים המחוברים')];
      ul.replaceChildren(...(items.length ? items : [el('li', { class: 'dm-empty' }, s ? 'אין מישהו בשם הזה.' : 'עוד אין למי לכתוב: אף אחד נוסף מהבית לא משתמש באוהל.')]));
    };
    q.addEventListener('input', draw);
    draw();
    box.replaceChildren(q, ul,
      d.forest === 'locked' ? el('p', { class: 'dm-note' }, 'כדי לכתוב גם לבני משפחה מהעצים המחוברים, פתחו את העץ במכשיר הזה (עץ המשפחה).') : null,
      el('p', { class: 'dm-note' }, 'אפשר לכתוב רק לבני הבית ולמי שמשתמש באוהל בעצים שחוברו לעץ שלכם.'));
    q.focus();
  }
  async function startWith(p) {
    try {
      const d = await api('/api/dm/start', { body: { to: p.id } });
      H.closeModal();
      if (!threads.some((t) => t.id === d.id)) threads.unshift({ id: d.id, name: d.name, unread: false, blocked: false, last: null, at: Date.now() });
      go(d.id);
    } catch (e) { toast(e.status === 403 ? 'אי אפשר לכתוב לאדם הזה כרגע.' : e.message || 'לא הצלחנו לפתוח שיחה'); }
  }

  await loadList();
  const first = idFromHash();
  if (first) show(first); else { drawEmptyThread(); if (new URLSearchParams(location.search).has('new')) pickPerson(); }
})();
