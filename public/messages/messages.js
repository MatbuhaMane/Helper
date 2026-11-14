/* הודעות: messages between members, one on one, text only (server/dm.ts).
   A list of conversations, one conversation, and writing. "שיחה חדשה" offers only who one may write to: the household,
   and the users of the joined trees (when the tree is open on this device). Only the two sides read a conversation.
   Polls while the page is in front: the open conversation every 5 s, the list every 20 s (no sockets).
   Phone: the list or the conversation (#t=<id>); wide: both side by side.
   The look is design's to make (.dm-*, docs/decisions.md); the inline rules below only hold the layout until then.
   Two tabs (the owner, 2026-11-14): the conversations first, then "מהאוהל": האוהל's own messages to this member, read only
   (/api/inbox, server/inbox.ts, who sees what tested in test-inbox.mjs) and the "האוהל התעדכן" notices (/whats-new.json),
   newest first, with an unread count. Opened at #haohel. */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('הודעות');
  const root = document.querySelector('main');
  const MAX = 2000;

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
  /* ---------- the tabs: the conversations, and מהאוהל ---------- */
  const inboxBox = el('section', { class: 'card', id: 'tab-haohel', role: 'tabpanel', 'aria-labelledby': 'tb-haohel', hidden: true, style: 'padding:14px 16px;margin-top:14px' });
  const tabBtn = (id, label, panel) => el('button', { type: 'button', role: 'tab', id: 'tb-' + id, 'aria-controls': panel, 'aria-selected': 'false', onclick: () => tab(id) }, label);
  const tbDm = tabBtn('dm', 'שיחות', 'tab-dm'), tbIn = tabBtn('haohel', 'מהאוהל', 'tab-haohel');
  frame.id = 'tab-dm'; frame.setAttribute('role', 'tabpanel'); frame.setAttribute('aria-labelledby', 'tb-dm');
  const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'תיבת ההודעות' }, tbDm, tbIn);
  root.append(tabs, frame, inboxBox);
  let inbox = null;   // { items: [{ id, text, link, level, at, kind: 'system' | 'owner' | 'all' | 'news', read }], unread }

  function tab(id, fromHash = false) {
    const on = id === 'haohel';
    tbDm.setAttribute('aria-selected', String(!on)); tbIn.setAttribute('aria-selected', String(on));
    frame.hidden = on; inboxBox.hidden = !on;
    frame.style.display = on ? 'none' : ''; // .dm sets display:grid, which beats [hidden]
    if (!fromHash) { if (on && location.hash !== '#haohel') history.replaceState(null, '', '#haohel'); if (!on && location.hash === '#haohel') history.replaceState(null, '', location.pathname); }
    if (on) openInbox();
  }

  /** האוהל's messages and the notices, together, newest first */
  async function loadInbox() {
    const [d, wn] = await Promise.all([
      api('/api/inbox'),
      fetch('/whats-new.json', { cache: 'no-store', credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const seen = H.prefs('whatsnew', { seen: '' }).seen;
    const notes = [];
    if (wn && typeof wn === 'object') {
      for (const [i, n] of [wn, ...(Array.isArray(wn.past) ? wn.past : [])].entries()) {
        const v = typeof n?.v === 'string' ? n.v.trim().slice(0, 100) : '', text = typeof n?.text === 'string' ? n.text.trim().slice(0, 400) : '';
        if (!v || !text || notes.some((x) => x.v === v)) continue;
        // only the current notice can be new; the history counts as read
        notes.push({ id: 'wn:' + v, v, text, link: null, level: 'info', at: Date.parse(n.date) || 0, kind: 'news', read: i > 0 || d.wn_read.includes(v) || seen === v });
      }
    }
    const items = [...d.messages.map((m) => ({ ...m, at: m.created_at, kind: m.from === 'system' ? 'system' : m.to_me ? 'owner' : 'all' })), ...notes]
      .sort((a, b) => b.at - a.at);
    inbox = { items, unread: items.filter((x) => !x.read).length };
    tbIn.replaceChildren('מהאוהל', inbox.unread ? el('b', { 'aria-label': `, ${inbox.unread} שלא נקראו` }, ` (${inbox.unread})`) : '');
  }

  const FROM = { system: 'האוהל', owner: 'הודעה אישית', all: 'לכל בני האוהל', news: 'האוהל התעדכן' };
  const ICON = { party: '🎉 ', warn: '⚠️ ' };
  async function openInbox() {
    if (!inbox) { inboxBox.replaceChildren(el('div', { 'aria-hidden': 'true' }, el('div', { class: 'skel line', style: '--w:70%' }), el('div', { class: 'skel line', style: '--w:50%' }))); try { await loadInbox(); } catch (e) { inboxBox.replaceChildren(el('p', { class: 'notice' }, e.message || 'לא הצלחנו לטעון')); return; } }
    const items = inbox.items;
    inboxBox.replaceChildren(
      el('h2', { style: 'margin:0 0 4px' }, 'מהאוהל'),
      el('p', { class: 'muted', style: 'margin:0 0 10px;font-size:.9rem' }, 'הודעות מהאוהל עצמו: עדכונים, ומה שנשלח אליכם. אין צורך לענות.'),
      items.length ? el('ul', { style: 'list-style:none;padding:0;margin:0' }, items.map((m) => el('li', { style: 'padding:10px 0;border-block-start:1px solid var(--line)' },
        el('div', { class: 'muted', style: 'display:flex;gap:8px;flex-wrap:wrap;font-size:.85rem' },
          el('span', {}, FROM[m.kind]), m.at ? el('time', {}, dayName(m.at)) : null, m.read ? null : el('b', {}, 'חדש')),
        el('p', { dir: 'auto', style: 'margin:4px 0 0' + (m.read ? '' : ';font-weight:600') }, (ICON[m.level] || '') + m.text),
        m.link ? el('a', { href: m.link, ...(/^https:/.test(m.link) ? { target: '_blank', rel: 'noopener' } : {}), style: 'font-size:.9rem' }, 'לפרטים') : null)))
        : el('p', { class: 'dm-empty' }, 'עוד אין כאן הודעות.'));
    // seen here: read (the "חדש" marks stay until the next visit)
    const ids = items.filter((x) => !x.read).map((x) => x.id);
    if (ids.length) {
      try { await api('/api/inbox/read', { body: { ids } }); items.forEach((x) => { x.read = true; }); inbox.unread = 0; tbIn.replaceChildren('מהאוהל'); } catch { /* next time */ }
    }
  }

  // threads: one-to-one ({ id, name, … }) and groups ({ id, name, group: true, faces, more, count, … }), newest first
  let threads = [], open = null;            // open: { id, name, blocked, canSend, messages, seenByOther, group, count }
  // a conversation's hash: #t=<id> one to one, #g=<id> a group (batch 27)
  const keyFromHash = () => { const m = location.hash.match(/^#([tg])=([\w-]{1,40})$/); return m ? { group: m[1] === 'g', id: m[2] } : null; };
  const idFromHash = () => keyFromHash()?.id || null;
  const urlOf = (o) => (o.group ? '/api/groups/' : '/api/dm/') + encodeURIComponent(o.id);

  /* ---------- the list ---------- */
  let firstDraw = true;
  const skelRows = () => [74, 58, 66].map((w) => el('li', { 'aria-hidden': 'true' }, el('div', { class: 'dm-row' }, el('div', { class: 'skel line', style: `--w:${w}%` }), el('div', { class: 'skel line', style: '--w:40%' }))));
  async function loadList() {
    if (firstDraw && !threads.length) rows.replaceChildren(...skelRows());   // its shape, so nothing jumps when the rows come
    try {
      const [d, g] = await Promise.all([api('/api/dm'), api('/api/groups').catch(() => ({ groups: [] }))]);
      threads = [...d.threads, ...g.groups.map((x) => ({ ...x, group: true }))].sort((a, b) => b.at - a.at);
      H.dmUnread?.(threads.filter((t) => t.unread).length);
      drawList();
    } catch (e) { if (!threads.length) { listEmpty.hidden = false; listEmpty.textContent = e.message || 'לא הצלחנו לטעון את השיחות'; } }
  }
  const av = (f, sm) => el('span', { class: 'fr-av' + (sm ? ' sm' : ''), style: `--c:${f.c}`, 'aria-hidden': 'true' }, f.ini);
  function drawList() {
    listEmpty.hidden = threads.length > 0;
    const arrive = firstDraw && threads.length;   // the rows arrive once, not on every refresh
    firstDraw = false;
    rows.replaceChildren(...threads.map((t, n) => el('li', arrive ? { style: `--i:${n}` } : {}, el('button', {
      class: 'dm-row' + (t.group ? ' group' : '') + (t.unread ? ' unread' : ''), type: 'button', 'aria-current': open?.id === t.id ? 'true' : 'false',
      onclick: () => go(t.id, t.group),
    }, t.group ? el('span', { class: 'fr-av-stack', 'aria-hidden': 'true' }, ...t.faces.map((f) => av(f, true)), t.more ? el('span', { class: 'fr-more' }, '+' + t.more) : null) : null,
      el('b', { dir: 'auto' }, t.name), el('time', {}, when(t.at)),
      el('small', { dir: 'auto' }, t.blocked ? 'חסום' : t.last ? (t.last.mine ? 'את/ה: ' : '') + t.last.text : t.group ? `קבוצה · ${t.count} משתתפים` : '')))));
    if (arrive) { rows.classList.add('arrive'); setTimeout(() => rows.classList.remove('arrive'), 700); }
  }

  /* ---------- one conversation ---------- */
  function go(id, group = false) { const h = (group ? 'g=' : 't=') + id; if (location.hash !== '#' + h) location.hash = h; else show(id, group); }
  addEventListener('hashchange', () => { if (location.hash === '#haohel') return tab('haohel', true); if (inboxBox && !inboxBox.hidden) tab('dm', true); const k = keyFromHash(); show(k?.id || null, !!k?.group); });

  async function show(id, group = false) {
    if (!id) { open = null; frame.removeAttribute('data-open'); drawEmptyThread(); drawList(); return; }
    frame.setAttribute('data-open', '');
    if (open?.id !== id) { open = { id, group, name: threads.find((t) => t.id === id)?.name || '', messages: [], canSend: false }; drawThread(true); }
    try {
      const d = await api(urlOf({ id, group }));
      open = { ...d, group };
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
    const menu = o.group
      ? el('button', { class: 'btn ghost small', type: 'button', onclick: () => leaveGroup() }, 'יציאה מהקבוצה')
      : el('button', { class: 'btn ghost small', type: 'button', onclick: () => toggleBlock() }, o.blocked ? 'בטל חסימה' : 'חסום');
    msgsBox = el('div', { class: 'dm-msgs', role: 'log', 'aria-live': 'polite', 'aria-label': 'ההודעות' });
    drawMessages();
    input = el('textarea', { rows: 1, maxlength: MAX, dir: 'auto', placeholder: 'כתבו הודעה…', 'aria-label': 'הודעה ל' + o.name,
      oninput: grow, onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); sendNow(); } } });
    const sendBtn = el('button', { class: 'btn primary', type: 'button', onclick: sendNow }, 'שלח');
    const compose = o.canSend
      ? el('div', { class: 'dm-compose' }, input, sendBtn)
      : el('p', { class: 'dm-note' }, o.blocked ? 'חסמת את השיחה הזו. אפשר לבטל את החסימה למעלה.' : o.messages ? 'אי אפשר לכתוב כאן כרגע.' : '');
    thread.replaceChildren(
      el('div', { class: 'dm-thread-head' }, backBtn(), el('h2', { dir: 'auto' }, o.name || '…'),
        o.group && o.count ? el('span', { class: 'dm-members', title: (o.members || []).join(', ') }, `${o.count} משתתפים`) : null, o.messages ? menu : null),
      msgsBox, compose,
      el('p', { class: 'dm-note' }, o.group ? 'רק מי שבקבוצה רואה את השיחה הזו.' : 'רק שניכם רואים את השיחה הזו.'));
    if (scroll) msgsBox.scrollTop = msgsBox.scrollHeight;
  }
  function drawMessages() {
    const kids = [];
    let day = '', prev = null;
    for (const m of open.messages || []) {
      const d = dayName(m.at);
      if (d !== day) { day = d; prev = null; kids.push(el('div', { class: 'dm-day' }, d)); }
      // in a group: the sender's name over the first message of each run
      const who = open.group && !m.mine && prev !== m.who ? el('b', { class: 'dm-who' }, m.who) : null;
      prev = m.mine ? null : m.who;
      kids.push(el('div', { class: 'dm-msg ' + (m.mine ? 'mine' : 'theirs'), dir: 'auto', ...(m.c ? { style: `--c:${m.c}` } : {}) }, who, m.text, el('time', {}, hm(m.at))));
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
      const d = await api(urlOf(open), { body: { text } });
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
  async function leaveGroup() {
    const o = open;
    if (!confirm(`לצאת מהקבוצה "${o.name}"? ההודעות שלה לא יופיעו אצלך יותר.`)) return;
    try {
      await api(urlOf(o), { method: 'DELETE' });
      threads = threads.filter((t) => t.id !== o.id);
      toast('יצאת מהקבוצה');
      location.hash = '';
    } catch (e) { toast(e.message || 'לא הצלחנו'); }
  }

  /* ---------- polling while in front ---------- */
  async function pollThread() {
    if (!open?.messages || document.visibilityState !== 'visible') return;
    const last = open.messages.at(-1)?.at || 0, id = open.id;
    try {
      const d = await api(`${urlOf(open)}?after=${last}`, { noRedirect: true });
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
      const items = [...part('home', 'מהבית'), ...part('tribe', 'מהעצים המחוברים'), ...part('friend', 'חברים')];
      ul.replaceChildren(...(items.length ? items : [el('li', { class: 'dm-empty' }, s ? 'אין מישהו בשם הזה.' : 'עוד אין למי לכתוב: אף אחד נוסף מהבית לא משתמש באוהל.')]));
    };
    q.addEventListener('input', draw);
    draw();
    box.replaceChildren(q,
      d.people.length > 1 ? el('button', { class: 'btn small', type: 'button', onclick: () => newGroup(d.people) }, 'קבוצה חדשה') : null,
      ul,
      d.forest === 'locked' ? el('p', { class: 'dm-note' }, 'כדי לכתוב גם לבני משפחה מהעצים המחוברים, פתחו את העץ במכשיר הזה (עץ המשפחה).') : null,
      el('p', { class: 'dm-note' }, 'אפשר לכתוב לבני הבית, למי שמשתמש באוהל בעצים שחוברו לעץ שלכם, ולחברים.'),
      el('a', { href: '/family/friends/', class: 'dm-note' }, 'החברים שלי'));
    q.focus();
  }

  /* ---------- a new group: a name and two or more people one may write to ---------- */
  function newGroup(people) {
    const name = el('input', { class: 'dm-grp-name', 'aria-label': 'שם הקבוצה', placeholder: 'שם הקבוצה', maxlength: 40, dir: 'auto' });
    const note = el('p', { class: 'dm-kid-note', hidden: true }, 'ילדים מתחת לגיל 12 מקבלים הודעות רק מהמשפחה.');
    const boxes = people.map((p) => ({ p, input: el('input', { type: 'checkbox', value: p.id, onchange: rule }) }));
    // the children's rule, as the page can see it: a child and a friend (not family) are never in one group. The server checks it too
    function rule() {
      const friend = boxes.some((b) => b.input.checked && b.p.where === 'friend'), kid = boxes.some((b) => b.input.checked && b.p.kid);
      for (const b of boxes) b.input.disabled = !b.input.checked && ((b.p.kid && friend) || (b.p.where === 'friend' && kid));
      note.hidden = !boxes.some((b) => b.input.disabled);
      make.disabled = boxes.filter((b) => b.input.checked).length < 2;
    }
    const make = el('button', { class: 'btn primary', type: 'button', disabled: true, onclick: async () => {
      if (!name.value.trim()) { toast('תנו לקבוצה שם'); name.focus(); return; }
      make.disabled = true;
      try {
        const d = await api('/api/groups', { body: { name: name.value, people: boxes.filter((b) => b.input.checked).map((b) => b.p.id) } });
        H.closeModal();
        await loadList();
        go(d.id, true);
      } catch (e) { toast(e.status === 403 ? 'ילדים מתחת לגיל 12 מקבלים הודעות רק מהמשפחה.' : e.message || 'לא הצלחנו ליצור את הקבוצה'); rule(); }
    } }, 'יצירת הקבוצה');
    const ini = (n) => { const w = n.trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : n.slice(0, 2)) || '?'; };
    H.closeModal();
    H.modal(el('h2', {}, 'קבוצה חדשה'), name,
      el('ul', { class: 'dm-grp-pick' }, boxes.map((b) => el('li', {}, el('label', {}, b.input, el('span', { class: 'fr-av sm', 'aria-hidden': 'true' }, ini(b.p.name)), el('span', { dir: 'auto' }, b.p.name))))),
      note, make);
    name.focus();
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
  if (location.hash === '#haohel') { tab('haohel', true); drawEmptyThread(); return; }
  loadInbox().catch(() => {});   // for the count on the tab
  tab('dm', true);
  const first = keyFromHash(), to = new URLSearchParams(location.search).get('to');
  if (first) show(first.id, first.group);
  else if (to && /^f[\w-]{4,40}$/.test(to)) { drawEmptyThread(); history.replaceState(null, '', location.pathname); startWith({ id: to }); }   // from the friends page
  else { drawEmptyThread(); if (new URLSearchParams(location.search).has('new')) pickPerson(); }
})();
