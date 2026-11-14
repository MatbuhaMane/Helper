/* הדלת האחורית – the owner's back door (until 2026-11-13 "החדר של האוהל") (server/admin.ts). Entered with the owner's own biometric (a passkey), from any device.
   From the owner's own account: the dashboard, money, settings, members, messages, features, הרשאת־על, the AI's cost and
   the room's log. From someone else's account: a visit – that person's special features, a message to everyone, and how
   the app is doing. Everything is checked on the server; this page shows what it agreed to give. */
(async () => {
  const { el, api, toast } = H;
  H.header('הדלת האחורית');
  await H.requireLogin();
  const root = document.querySelector('main');
  const ERR = {
    no_passkey: 'עוד אין מפתח גישה (טביעת אצבע / פנים / Windows Hello) לבעל האוהל. הוסיפו אחד מהחשבון שלכם בעץ המשפחה ← מפתחות גישה.',
    passkey_unknown: 'המפתח הזה לא של בעל האוהל.', admin_locked: 'הדלת ננעלה. היכנסו שוב.', own_account_only: 'זה נפתח רק מהחשבון שלך.',
    too_many_tries: 'יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.', challenge_expired: 'עבר יותר מדי זמן. נסו שוב.', passkey_bad_signature: 'הזיהוי לא אושר.',
    title_required: 'צריך שם.', bad_amount: 'הסכום לא תקין.', bad_date: 'צריך תאריך.', bad_value: 'הערך לא מתאים.', not_member: 'אין חבר בכתובת הזו.',
    already_owner: 'הוא כבר בעל האוהל.', owner_only: 'רק בעל האוהל ממנה הרשאת־על.', text_required: 'כתבו הודעה.',
    bad_page: 'בחרו עמוד.', no_text: 'כתבו מה יופיע כשמוצאים.', bad_link: 'הקישור לא תקין: כתובת באוהל (/songs/) או https.', ends_first: 'תאריך הסיום לפני תאריך ההתחלה.',
    already_over: 'תאריך הסיום כבר עבר.', bad_layout: 'המבנה לא נקרא. רעננו ונסו שוב.', too_big: 'המבנה גדול מדי.',
  };
  const say = (e) => toast(ERR[e?.code] || e?.message || 'משהו השתבש');
  const call = (path, opts = {}) => api(path, { ...opts, noRedirect: true });
  const ils = (n) => '₪' + (Math.abs(n) < 100 ? Math.round(n * 100) / 100 : Math.round(n)).toLocaleString('he-IL');   // small amounts (gifts) to the agora
  const usd = (n) => (n >= 1 ? '$' + n.toFixed(2) : n >= 0.01 ? '$' + n.toFixed(3) : n > 0 ? '$' + n.toFixed(4) : '$0');
  const day = (t) => new Date(t).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  const section = (id, title, ...body) => el('section', { class: 'card', id }, el('h2', {}, title), ...body);
  const btn = (label, fn, cls = 'btn small', sure) => el('button', { class: cls, type: 'button', onclick: async () => { if (sure && !confirm(sure)) return; try { await fn(); } catch (e) { say(e); } } }, label);

  /* ---------- the door: the owner's biometric ---------- */
  const toBuf = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)).buffer;
  const toB64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function enter() {
    const o = await call('/api/admin/enter/options', { method: 'POST' });
    const pk = o.publicKey;
    const cred = await navigator.credentials.get({ publicKey: { ...pk, challenge: toBuf(pk.challenge), allowCredentials: pk.allowCredentials.map((c) => ({ ...c, id: toBuf(c.id) })) } });
    const r = cred.response;
    await call('/api/admin/enter', { body: { challengeId: o.challengeId, id: cred.id, response: { clientDataJSON: toB64(r.clientDataJSON), authenticatorData: toB64(r.authenticatorData), signature: toB64(r.signature) } } });
    open();
  }
  /* the back door's tab on the other pages (/assets/admin-tab.js): this device opened the room from the owner's own account.
     A local mark only; the tab asks the server whether the room is still open, and nobody else's device gets one. */
  const ROOM_MARK = 'helper.adminRoom';
  const roomMark = (on) => { try { if (on) localStorage.setItem(ROOM_MARK, JSON.stringify({ ends: on })); else localStorage.removeItem(ROOM_MARK); } catch (_) { /* no tab, then */ } };
  function gate() {
    roomMark(false);
    if (st) st.open = false;
    document.querySelector('.ad-warn')?.setAttribute('hidden', '');
    const can = !!window.PublicKeyCredential && !!navigator.credentials;
    root.replaceChildren(el('section', { class: 'ad' }, el('div', { class: 'card ad-gate' },
      el('div', { class: 'big', 'aria-hidden': 'true' }, '🌒'),
      el('h1', {}, 'הדלת האחורית'),
      el('p', {}, 'כאן נכנס רק בעל האוהל, בזיהוי ביומטרי: טביעת אצבע, פנים או Windows Hello.'),
      el('p', { class: 'muted small' }, 'במכשיר של מישהו אחר הדפדפן יציע לאשר מהטלפון שלך (קוד QR).'),
      can ? el('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await enter(); } catch (err) { if (err?.name !== 'NotAllowedError') say(err); e.target.disabled = false; } } }, 'זיהוי ביומטרי')
        : el('p', {}, 'הדפדפן הזה לא תומך בזיהוי ביומטרי.'))));
  }

  /* ---------- the room ---------- */
  /* ---------- the lock (the owner's rule): 3 idle minutes close the room, a warning after 30 idle seconds, a lock that
     closes it at once, and "stay unlocked" for a working session (own account only; 2 hours at most) ---------- */
  let st, tick = 0, last = Date.now(), pinged = 0;
  const warnBox = el('div', { class: 'ad-warn', role: 'alert', hidden: true });
  document.body.append(warnBox);
  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  async function lockNow() {
    clearInterval(tick); warnBox.hidden = true;
    await call('/api/admin/leave', { method: 'POST' }).catch(() => {});
    gate();
  }
  /** any action keeps the room open: here at once, and on the server at most every 20 seconds */
  function active() {
    if (!st?.open) return;
    last = Date.now();
    warnBox.hidden = true;
    if (Date.now() - pinged > 20e3) { pinged = Date.now(); call('/api/admin/ping', { method: 'POST' }).catch((e) => { if (e?.code === 'admin_locked') { clearInterval(tick); gate(); } }); }
  }
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) addEventListener(ev, active, { capture: true, passive: true });
  function watch() {
    clearInterval(tick);
    last = Date.now(); pinged = Date.now();
    tick = setInterval(() => {
      if (!st?.open) return clearInterval(tick);
      if (Date.now() >= st.ends) { lockNow(); return; }                     // the two hours (half an hour on a visit) are up
      if (st.stay) { warnBox.hidden = true; return; }
      const idleFor = Date.now() - last, left = st.idle - idleFor;
      if (left <= 0) { lockNow(); return; }
      if (idleFor >= st.warn) {
        warnBox.replaceChildren(el('b', {}, '🔒 הדלת תיסגר בעוד ' + mmss(left)), el('span', {}, ' · כל פעולה משאירה אותו פתוח'),
          el('button', { class: 'btn small', type: 'button', onclick: active }, 'אני כאן'));
        warnBox.hidden = false;
      } else warnBox.hidden = true;
    }, 500);
  }
  async function open() {
    try { st = await call('/api/admin/status'); } catch (e) { return say(e); }
    if (!st.open) return gate();
    roomMark(st.own ? st.ends : false);
    watch();
    const lock = el('button', { class: 'btn small ad-lock', type: 'button', 'aria-label': 'הדלת פתוחה – לחיצה נועלת אותה', title: 'נעילה מיד', onclick: lockNow }, '🔓 פתוח · נעילה');
    const stay = st.own ? el('label', { class: 'ad-stay small' },
      el('input', { type: 'checkbox', checked: !!st.stay, 'aria-label': 'להשאיר פתוח לעבודה', onchange: async (e) => {
        try { const r = await call('/api/admin/stay', { method: 'POST', body: { on: e.target.checked } }); st.stay = r.stay; active(); toast(r.stay ? 'נשאר פתוח לעבודה (עד שעתיים)' : 'נסגר שוב אחרי 3 דקות בלי פעולה'); } catch (err) { say(err); e.target.checked = !!st.stay; }
      } }), ' להשאיר פתוח לעבודה') : null;
    const bar = el('div', { class: 'card ad-bar' },
      el('div', {}, el('b', {}, st.own ? `שלום, ${st.as.name}` : `ביקור אצל ${st.as.name}`), el('div', { class: 'muted small' }, st.own ? (st.level === 'owner' ? 'בעל האוהל · כל ההרשאות' : 'הרשאת־על') : 'נכנסת בזיהוי שלך מחשבון של מישהו אחר: רק התכונות שלו ומצב האוהל.')),
      el('span', { class: 'spacer' }), stay, lock);
    /* on top, the board: how the tent is doing, who uses what, and the family's feedback (own account only) */
    const top = { dash: el('div', { class: 'bd-part', id: 'dash', style: 'grid-column:1/-1' }) };   // the state spans the width
    let dashP;
    if (st.own) { top.usage = el('div', { class: 'bd-part', 'data-part': 'usage' }); top.inbox = el('div', { class: 'bd-part', 'data-part': 'inbox' }); }
    const board = el('div', { class: 'bd-dash', role: 'region', 'aria-label': 'לוח' }, ...Object.values(top));
    /* below it, every other part as an app tile (design's class contract, like the tools rack); a tap opens it */
    const APPS = st.own
      ? [['messages', 'הודעות', messages], ['reports', 'תיבת פניות', reportsPart], ['credits', 'כסף', async (box) => { const d = await dashP; if (d?.money) money(box, d.money); }], ...(st.level === 'owner' ? [['gifts', 'מתנות קרדיט', gifts], ['invites', 'הזמנות', invites], ['treetrash', 'שחזור מהעץ', treeTrash], ['structure', 'עץ מבנה', structure]] : []), ['settings', 'הגדרות האפליקציה', settings],
         ['members', 'חברים', members], ['features', 'תכונות מיוחדות', features], ['permissions', 'הרשאת־על', supers], ['ai', 'עלויות AI', aiCost], ['log', 'יומן', log]]
      : [['features', `התכונות של ${st.as.name}`, features]];
    const panels = {}, bodies = {}, loaded = new Set();
    const tiles = APPS.map(([id, name], i) => {
      bodies[id] = el('div');
      panels[id] = el('div', { class: 'bd-panel', id, hidden: true, role: 'region', 'aria-label': name },
        el('a', { class: 'bd-back', href: '#', onclick: (e) => { e.preventDefault(); history.replaceState(null, '', location.pathname); show(''); board.nextElementSibling.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, '‹ כל החלקים'),
        bodies[id]);
      // the colours and the icon come from data-bd (design's admin.css and /assets/bd-icons/), so .ic stays empty
      return el('a', { class: 'app', href: '#' + id, 'data-bd': id, style: `--n:${i}`, 'aria-controls': id }, el('span', { class: 'ic' }), el('span', { class: 'name' }, name));
    });
    const loaders = Object.fromEntries(APPS.map(([id, , load]) => [id, load]));
    /** one part open at a time, loaded the first time it opens; the address keeps it (#members) for a reload or the back button */
    const show = (id, scroll) => {
      for (const [k, p] of Object.entries(panels)) p.hidden = k !== id;
      for (const t of tiles) t.dataset.bd === id ? t.setAttribute('aria-current', 'true') : t.removeAttribute('aria-current');
      if (!panels[id]) return;
      if (!loaded.has(id)) { loaded.add(id); loaders[id](bodies[id]); }
      if (scroll) panels[id].scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    for (const t of tiles) t.addEventListener('click', (e) => {
      e.preventDefault();
      const id = t.dataset.bd, again = location.hash === '#' + id && !panels[id].hidden;   // a second tap closes it
      history.replaceState(null, '', again ? location.pathname : '#' + id);
      show(again ? '' : id, !again);
    });
    root.replaceChildren(el('section', { class: 'ad bd' },
      el('header', { class: 'bd-head' }, el('h1', {}, 'הדלת האחורית')), bar,
      board,
      el('nav', { class: 'apps-grid bd-apps', 'aria-label': 'חלקי הדלת' }, tiles),
      ...Object.values(panels)));
    dashP = dash(top.dash);
    if (st.own) { usage(top.usage); inbox(top.inbox); }
    show(location.hash.slice(1), !!location.hash);
  }

  /* ---------- the board: how many reports wait (the inbox itself is the תיבת פניות tile) ---------- */
  const reportsCount = (n) => {
    const tile = document.querySelector('.bd-apps [data-bd="reports"]');
    tile?.querySelector('.bd-count')?.remove();
    if (tile && n) tile.append(el('span', { class: 'bd-count', 'aria-label': n + ' חדשות' }, String(n)));
  };
  async function inbox(box) {
    let d;
    try { d = await call('/api/admin/reports'); } catch (e) { return box.replaceChildren(el('p', { class: 'card' }, ERR[e.code] || e.message)); }
    reportsCount(d.count.new);
    box.replaceChildren(section('inbox-s', d.count.new ? `פניות · ${d.count.new} חדשות` : 'פניות',
      el('p', { class: 'muted small' }, d.count.all ? `${d.count.new} חדשות · ${d.count.working} בטיפול · ${d.count.done} טופלו` : 'עוד אין פניות. מנערים את הטלפון, או "דווח על בעיה" בתפריט הכלים ובהגדרות.'),
      d.count.all ? el('a', { class: 'btn small', href: '#reports', onclick: (e) => { e.preventDefault(); document.querySelector('.bd-apps [data-bd="reports"]')?.click(); } }, 'לתיבת הפניות') : null));
  }

  /* ---------- תיבת פניות: every report as a thread, its state, and a private answer (server/reports.ts) ---------- */
  async function reportsPart(box) {
    try { await H.loadOnce('/assets/reports.js'); } catch (_) { return box.replaceChildren(el('p', { class: 'card' }, 'לא הצלחתי לטעון את תיבת הפניות.')); }
    const STATES = [['new', 'חדשה'], ['working', 'בטיפול'], ['done', 'טופלה']];
    const FILTERS = [['all', 'הכל'], ['new', 'חדשות'], ['working', 'בטיפול'], ['done', 'טופלו'], ['idea', 'הצעות']];   // הצעות: the kind, the rest: the state
    const shows = (r) => filter === 'all' || (filter === 'idea' ? r.kind === 'idea' : r.state === filter);
    const DEV = { phone: 'טלפון', tablet: 'טאבלט', pc: 'מחשב' };
    const VIA = { shake: 'בניעור', companion: 'דרך העוזר', button: 'מההגדרות' };
    const when = (t) => (new Date(t).toDateString() === new Date().toDateString() ? new Date(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
      : new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }));
    const pick = () => el('p', { class: 'rx-pick' }, 'בחרו פנייה מהרשימה.');
    let filter = 'all', current = null, d = { reports: [], count: {} };
    const filters = el('div', { class: 'rx-filters', role: 'group', 'aria-label': 'סינון' });
    const list = el('ul', { class: 'rx-list' });
    const empty = el('p', { class: 'rx-empty' }, 'אין פניות כאן.');
    const thread = el('section', { class: 'rx-thread card', 'aria-label': 'הפנייה' }, pick());
    const rx = el('div', { class: 'rx' }, el('div', { class: 'rx-side' }, filters, list, empty), thread);
    box.replaceChildren(rx);
    const recount = () => {
      d.count = { all: d.reports.length, new: 0, working: 0, done: 0 };
      for (const r of d.reports) d.count[r.state]++;
      reportsCount(d.count.new);
    };
    const drawFilters = () => filters.replaceChildren(...FILTERS.map(([k, name]) => el('button', { type: 'button', 'aria-pressed': String(filter === k), onclick: () => { filter = k; drawFilters(); drawList(); } },
      name, k === 'new' && d.count.new ? el('span', {}, String(d.count.new)) : null)));
    function drawList() {
      const rows = d.reports.filter(shows);
      list.replaceChildren(...rows.map((r) => el('li', {}, el('button', {
        class: 'rx-row' + (r.unread ? ' unread' : '') + (r.state === 'done' ? ' done' : ''), type: 'button', 'aria-current': current === r.id ? 'true' : null, onclick: () => openOne(r.id) },
        el('span', { class: 'rx-face', 'aria-hidden': 'true' }, r.face), el('span', { class: 'rx-name' }, r.name), el('time', { class: 'rx-when', datetime: new Date(r.created_at).toISOString() }, when(r.created_at)),
        el('span', { class: 'rx-snip', dir: 'auto' }, r.text),
        el('span', { class: 'rx-tags' }, r.kind === 'idea' ? el('span', { class: 'rx-tag idea' }, 'הצעה') : null, el('span', { class: 'rx-tag' }, r.title || r.path), r.has_shot ? el('span', { class: 'rx-tag shot' }, 'צילום') : null,
          VIA[r.via] ? el('span', { class: 'rx-tag' }, VIA[r.via]) : null, r.replies ? el('span', { class: 'rx-tag' }, r.replies === 1 ? 'נענתה' : `${r.replies} תשובות`) : null)))));
      empty.hidden = rows.length > 0;
    }
    async function openOne(id) {
      let t;
      try { t = await call('/api/admin/reports/' + encodeURIComponent(id)); } catch (e) { return say(e); }
      current = id; rx.dataset.view = 'thread';
      const r = t.report, first = r.name.split(' ')[0], to = (/^[א-ת]/.test(first) ? 'ל' : 'ל־') + first, row = d.reports.find((x) => x.id === id);
      if (row) row.unread = false;
      const stateBtns = el('div', { class: 'rx-state', role: 'group', 'aria-label': 'מצב' });
      const setState = (k) => { r.state = k; if (row) row.state = k; drawState(); recount(); drawFilters(); drawList(); };
      const drawState = () => stateBtns.replaceChildren(...STATES.map(([k, name]) => el('button', { type: 'button', 'aria-pressed': String(r.state === k), onclick: async () => {
        try { await call('/api/admin/reports/' + encodeURIComponent(id), { method: 'PUT', body: { state: k } }); setState(k); } catch (e) { say(e); }
      } }, name)));
      const shotUrl = r.has_shot ? `/api/admin/reports/${encodeURIComponent(id)}/shot` : null;
      const msgs = el('div', {}, H.reportThread(r, t.messages, { side: 'team', name: r.name, shotUrl }));
      const ta = el('textarea', { rows: 2, dir: 'auto', 'aria-label': 'התשובה', placeholder: 'תשובה ' + to, maxlength: 2000 });
      const sendB = el('button', { class: 'rm-send', 'aria-label': 'שליחת התשובה' });
      const form = el('form', { class: 'rm-reply', onsubmit: async (e) => {
        e.preventDefault();
        const text = ta.value.trim();
        if (!text) return ta.focus();
        sendB.disabled = true;
        try {
          const res = await call('/api/admin/reports/' + encodeURIComponent(id) + '/reply', { body: { text } });
          t.messages.push({ id: res.id, team: true, text, at: res.at }); ta.value = '';
          if (row) row.replies = (row.replies || 0) + 1;
          msgs.replaceChildren(H.reportThread(r, t.messages, { side: 'team', name: r.name, shotUrl }));
          setState(res.state);
          toast('נשלח, רק ' + to + '.');
        } catch (err) { say(err); }
        sendB.disabled = false;
      } }, ta, sendB, el('p', { class: 'rm-private' }, `התשובה תגיע רק ${to}, לתיבה האישית באוהל.`));
      drawState();
      thread.replaceChildren(
        el('header', { class: 'rx-thead' },
          el('button', { class: 'rx-back', type: 'button', onclick: () => { delete rx.dataset.view; current = null; thread.replaceChildren(pick()); drawList(); } }, '‹ כל הפניות'),
          el('div', { class: 'rx-who' }, el('b', {}, r.name), el('small', {}, [r.kind === 'idea' ? 'הצעה לשיפור' : 'תקלה', DEV[r.device], r.title || r.path, when(r.created_at)].filter(Boolean).join(' · '))),
          stateBtns),
        msgs, form);
      drawList();
      if (matchMedia('(max-width: 899px)').matches) thread.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    try { d = await call('/api/admin/reports'); } catch (e) { return box.replaceChildren(el('p', { class: 'card' }, ERR[e.code] || e.message)); }
    recount(); drawFilters(); drawList();
  }

  /* ---------- usage: who comes in, and which tools (never what is in them) ---------- */
  async function usage(box) {
    let d;
    try { d = await call('/api/admin/usage'); } catch (e) { return box.replaceChildren(el('p', { class: 'card' }, ERR[e.code] || e.message)); }
    const ago = (t) => (!t ? 'עוד לא' : H.timeAgo ? H.timeAgo(t) : new Date(t).toLocaleDateString('he-IL'));
    const most = Math.max(1, ...d.tools.map((t) => t.people));
    /* folded to one line by default; a tap opens it, and the choice is kept per user (H.prefs 'admin', every device) */
    const P = H.prefs('admin', { usageOpen: false });
    const week = d.people.filter((p) => p.week > 0).length;
    const line = `${week} מתוך ${d.people.length} נכנסו השבוע` + (d.tools[0] ? ` · הכי בשימוש: ${d.tools[0].name}` : '');
    const fold = el('details', { class: 'ad-fold', open: !!P.usageOpen,
      ontoggle: () => { if (!!P.usageOpen !== fold.open) H.savePrefs('admin', { usageOpen: fold.open }); } },
      // the look: admin.css .ad-fold (the summary a row with a chevron)
      el('summary', {}, el('h2', {}, 'שימוש'), ' ',
        el('span', { class: 'muted small' }, line)),
      el('p', { class: 'muted small' }, 'מי נכנס ולאילו כלים. רק איזה כלי ומתי, אף פעם לא מה שבתוכו.'),
      el('h3', {}, 'אנשים'),
      el('div', { style: 'overflow-x:auto' }, el('table', { class: 'ad-table' },
        el('thead', {}, el('tr', {}, ['מי', 'פעם אחרונה', 'כלים', 'השבוע', 'ביקורים'].map((h) => el('th', {}, h)))),
        el('tbody', {}, d.people.map((p) => el('tr', {}, el('td', {}, p.name || p.email), el('td', {}, ago(p.last)), el('td', {}, `${p.tools} / ${d.total}`), el('td', {}, String(p.week || 0)), el('td', {}, String(p.visits))))))),
      el('h3', {}, 'כלים'),
      d.tools.length ? el('ul', { style: 'list-style:none;margin:0;padding:0;display:grid;gap:6px' }, d.tools.map((t) => el('li', { style: 'display:grid;grid-template-columns:8em minmax(0,1fr) auto;gap:10px;align-items:center' },
        el('span', {}, t.name),
        el('span', { 'aria-hidden': 'true', style: 'block-size:8px;border-radius:4px;background:var(--line)' }, el('i', { style: `display:block;block-size:100%;inline-size:${Math.round((t.people / most) * 100)}%;border-radius:4px;background:var(--primary)` })),
        el('small', { class: 'muted' }, `${t.people} אנשים · ${t.visits} ביקורים`))))
        : el('p', { class: 'muted' }, 'עוד אין ביקורים בכלים.'));
    box.replaceChildren(el('section', { class: 'card', id: 'usage-s' }, fold));
  }

  /* ---------- the dashboard, and the money ---------- */
  async function dash(box) {
    let d;
    try { d = await call('/api/admin/overview'); } catch (e) { return box.replaceChildren(el('p', { class: 'card' }, ERR[e.code] || e.message)); }
    const s = d.stats, m = d.money;
    const tile = (label, value, cls = '') => el('div', { class: 'ad-tile ' + cls }, el('small', {}, label), el('b', {}, value));
    const mb = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : (n / 1e6).toFixed(1) + ' MB');
    box.replaceChildren(el('section', { class: 'card bd-state' },
      el('h2', {}, 'מצב האוהל'),
      ...d.alerts.map((a) => el('p', { class: 'notice ad-alert' }, a)),
      m ? el('div', { class: 'ad-tiles' },
        tile('הכנסות עד היום', ils(m.total.income), 'good'),
        tile('הוצאות עד היום (כולל AI)', ils(m.total.expense + m.total.ai)),
        tile('נטו', ils(m.total.net), m.total.net >= 0 ? 'good' : 'bad'),
        tile('חודש עכשיו: הוצאות', ils(m.perMonth.expense + m.perMonth.ai))) : null,
      el('div', { class: 'ad-tiles', style: 'margin-top:10px' },
        tile('AI החודש', usd(d.ai.month)), tile('AI היום', usd(d.ai.today)), tile('AI מאז ההתחלה', usd(d.ai.total)),
        tile('חברים', s.members), tile('משקי בית', s.households), tile('נכנסו השבוע', s.active),
        tile('אנשים בעצים', s.people), tile('קבצים בכספת', `${s.files} · ${mb(s.bytes)}`), tile('מפגשים', `${s.gatherings} · ${s.answers} תשובות`), tile('קישורים ליומן', s.feeds))));
    return d;
  }
  function money(box, m) {
    const kind = el('select', { 'aria-label': 'סוג' }, [['expense', 'הוצאה'], ['income', 'הכנסה']].map(([v, t]) => el('option', { value: v }, t)));
    const title = el('input', { type: 'text', maxlength: 80, required: true, 'aria-label': 'מה', placeholder: 'למשל: Cloudflare, דומיין' });
    const amount = el('input', { type: 'number', min: '0.01', step: '0.01', required: true, 'aria-label': 'סכום' });
    const currency = el('select', { 'aria-label': 'מטבע' }, [['ILS', '₪'], ['USD', '$']].map(([v, t]) => el('option', { value: v }, t)));
    const date = el('input', { type: 'date', required: true, value: new Date().toISOString().slice(0, 10), 'aria-label': 'תאריך' });
    const monthly = el('input', { type: 'checkbox', 'aria-label': 'כל חודש' });
    const until = el('input', { type: 'date', 'aria-label': 'עד (לא חובה)' });
    const add = el('form', { class: 'ad-form', onsubmit: async (e) => {
      e.preventDefault();
      try { await call('/api/admin/ledger', { body: { kind: kind.value, title: title.value, amount: amount.value, currency: currency.value, date: date.value, monthly: monthly.checked, until: until.value || null } }); toast('נרשם'); open(); } catch (err) { say(err); }
    } },
      el('label', {}, 'סוג', kind), el('label', {}, 'מה', title), el('label', {}, 'סכום', amount), el('label', {}, 'מטבע', currency),
      el('label', {}, 'תאריך', date), el('label', {}, el('span', {}, monthly, ' כל חודש'), until), el('button', { class: 'btn primary' }, 'הוספה'));
    box.replaceChildren(section('money-s', 'כסף',
      el('p', { class: 'muted small' }, `הכנסות והוצאות שרשמתם, ועלות ה־AI כפי שהמונה מדד אותה (בדולרים, לפי שער ${m.rate} ₪ – אפשר לשנות בהגדרות). הוצאה חודשית נספרת כל חודש ביום שלה.`),
      el('div', { class: 'ad-scroll' }, el('table', {}, el('thead', {}, el('tr', {}, ['חודש', 'הכנסות', 'הוצאות', 'AI', 'נטו'].map((h, i) => el('th', { class: i ? 'num' : '' }, h)))),
        el('tbody', {}, m.months.slice().reverse().map((x) => el('tr', {}, el('td', {}, x.month), ...[x.income, x.expense, x.ai, x.net].map((v) => el('td', { class: 'num' }, ils(v)))))))),
      el('h3', {}, 'הרישומים'),
      m.entries.length ? el('div', { class: 'ad-scroll' }, el('table', {}, el('tbody', {}, m.entries.map((e) => el('tr', {},
        el('td', {}, e.kind === 'income' ? 'הכנסה' : 'הוצאה'), el('td', {}, e.title),
        el('td', { class: 'num' }, (e.currency === 'USD' ? '$' : '₪') + e.amount), el('td', {}, e.monthly ? `כל חודש מ־${e.date}${e.until ? ' עד ' + e.until : ''}` : e.date),
        el('td', {}, btn('✕', async () => { await call('/api/admin/ledger/' + e.id, { method: 'DELETE' }); open(); }, 'btn small ghost', `למחוק את "${e.title}"?`))))))) : el('p', { class: 'muted small' }, 'עוד אין רישומים. הוסיפו למשל את Cloudflare (Workers בתשלום) כהוצאה חודשית.'),
      add));
  }

  /* ---------- settings ---------- */
  async function settings(box) {
    const { settings: list } = await call('/api/admin/settings');
    const groups = [...new Set(list.map((s) => s.group))];
    const control = (s) => {
      const save = async (value) => { try { await call('/api/admin/settings', { method: 'PUT', body: { key: s.key, value } }); toast('נשמר'); } catch (e) { say(e); } };
      if (s.type === 'bool') return el('input', { type: 'checkbox', checked: !!s.value, 'aria-label': s.label, onchange: (e) => save(e.target.checked) });
      if (s.type === 'number') return el('input', { type: 'number', value: s.value, min: s.min ?? '', max: s.max ?? '', step: 'any', 'aria-label': s.label, style: 'inline-size:7em', onchange: (e) => save(Number(e.target.value)) });
      if (s.type === 'select') return el('select', { 'aria-label': s.label, onchange: (e) => save(e.target.value) }, s.options.map(([v, t]) => el('option', { value: v, selected: v === s.value }, t)));
      return el('input', { type: 'text', value: s.value, 'aria-label': s.label, onchange: (e) => save(e.target.value) });
    };
    box.replaceChildren(section('settings-s', 'הגדרות האפליקציה',
      el('p', { class: 'muted small' }, 'נשמר מיד, ונכנס לתוקף תוך חצי דקה, בלי פריסה חדשה.'),
      ...groups.map((g) => el('div', {}, el('h3', {}, g), ...list.filter((s) => s.group === g).map((s) => el('div', { class: 'ad-set' },
        el('b', {}, s.label), control(s), el('p', { class: 'muted small' }, s.help)))))));
  }

  /* ---------- members: my household in the table, a search across every household, and each one's name, household and role
     (server/member-admin.ts). A change of role or household asks first. The email is not editable: it is the Google sign-in
     and the key of everything the member keeps; a new address is a new member, and then the old one is removed. ---------- */
  const ROLE_NAMES = { member: 'חבר', head: 'ראש בית', owner: 'מנהל' };
  Object.assign(ERR, {
    email_fixed: 'אי אפשר לשנות כתובת. מוסיפים את החדשה כחבר ומסירים את הישנה.',
    owner_only_from_config: '"מנהל" הוא מנהל האוהל כולו, ושמור לכתובת של בעל האוהל. לראש של משפחה בחרו "ראש בית".',
    owner_stays: 'בעל האוהל נשאר מנהל, ואי אפשר להסיר אותו.', last_owner: 'זה המנהל האחרון. אי אפשר להוריד אותו.',
    already_member: 'הכתובת הזו כבר חבר באוהל. הנה הוא בחיפוש: משנים שם, בית או תפקיד בשורה שלו.',
    self: 'אי אפשר להסיר את עצמך.', 'Invalid email': 'הכתובת לא תקינה.',
    owner_home_fixed: 'הבית של המנהל קבוע.', new_household_head: 'מי שפותח משק בית חדש הוא ראש הבית שלו.', no_household: 'אין בית כזה.', bad_role: 'תפקיד לא מוכר.',
    he_name_hebrew: 'השם בעברית צריך להיות באותיות עבריות.', confirm_needed: 'צריך לאשר את השינוי.', owner_level_only: 'רק בעל האוהל משנה תפקיד או בית.',
  });
  /* A members combobox: a search box with suggestions under it (arrows, Home/End, Enter, Escape; role=combobox over a
     listbox, RTL). Used by the members search and by "למשתמש אחד" in the messages. `look(q)` returns the rows (null: a
     newer search won); `row(m)` draws one suggestion; `chosen(m)` gets the pick; `enter()` runs on Enter with nothing
     marked; `short()` when under two letters; `none()` when nothing was found. The look is design's (.ad-combo, and the
     list: .ad-sugg). */
  function combo({ id, label, listLabel, placeholder, look, row, chosen, enter, short, none }) {
    const q = el('input', { type: 'search', placeholder, 'aria-label': label, enterkeyhint: 'search',
      autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': id, 'aria-autocomplete': 'list' });
    const sugg = el('ul', { id, class: 'ad-sugg', role: 'listbox', 'aria-label': listLabel, hidden: true });
    let timer = 0, hits = [], active = -1;
    const close = () => { sugg.hidden = true; active = -1; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); };
    const mark = (i) => {
      active = i;
      [...sugg.children].forEach((li, j) => { li.setAttribute('aria-selected', String(j === i)); });
      if (i < 0) q.removeAttribute('aria-activedescendant');
      else { q.setAttribute('aria-activedescendant', `${id}-${i}`); sugg.children[i].scrollIntoView({ block: 'nearest' }); }
    };
    const pick = (m) => { close(); chosen(m); };
    const suggest = async () => {
      if (q.value.trim().length < 2) { close(); short?.(); return; }
      try {
        const rows = await look(q.value.trim());
        if (!rows) return;
        hits = rows;
        if (!rows.length) { close(); none?.(); return; }
        sugg.replaceChildren(...rows.map((m, i) => el('li', { id: `${id}-${i}`, role: 'option', 'aria-selected': 'false',
          onpointerdown: (e) => e.preventDefault(),                 // keep the focus in the box
          onpointermove: () => { if (active !== i) mark(i); },
          onclick: () => pick(m) }, ...row(m))));
        sugg.hidden = false; q.setAttribute('aria-expanded', 'true'); mark(-1);
      } catch (err) { say(err); }
    };
    q.oninput = () => { clearTimeout(timer); timer = setTimeout(suggest, 250); };
    q.onkeydown = (e) => {
      const open = !sugg.hidden && hits.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (open) mark(Math.min(active + 1, hits.length - 1)); else suggest(); }
      else if (e.key === 'ArrowUp' && open) { e.preventDefault(); mark(Math.max(active - 1, -1)); }
      else if (e.key === 'Home' && open && active >= 0) { e.preventDefault(); mark(0); }
      else if (e.key === 'End' && open && active >= 0) { e.preventDefault(); mark(hits.length - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); if (open && active >= 0) pick(hits[active]); else enter?.(); }
      else if (e.key === 'Escape' && !sugg.hidden) { e.preventDefault(); close(); }
    };
    q.onblur = () => setTimeout(close, 150);
    return { q, sugg, close, wrap: el('div', { class: 'ad-combo' }, el('label', { class: 'ad-search' }, q), sugg) };
  }
  /** one member as a suggestion: the names, then the email and the household */
  const memberRow = (m, houseName) => [el('b', {}, [m.he_name, m.name].filter(Boolean).join(' · ') || m.email),
    el('small', { class: 'muted' }, el('span', { dir: 'ltr' }, m.email), ' · ', houseName(m.household))];

  async function members(box) {
    const [{ members: list, households, owners }, { allowances: ai }, acc] = await Promise.all([call('/api/admin/people'), call('/api/admin/allowances'),
      call('/api/admin/app-access').catch(() => ({ access: [], leaves: [] }))]);
    const houseName = (id) => households.find((h) => h.id === id)?.title || id;
    const save = async (m, body) => {
      const r = await call('/api/admin/people/' + encodeURIComponent(m.email), { method: 'PUT', body });
      toast('נשמר');
      return r;
    };
    // the AI: family has no limit (on you); a limited account spends its credit (server/credits.ts)
    const aiCell = (m) => {
      const a = ai[m.email] || { limited: false };
      const sw = el('input', { type: 'checkbox', checked: !a.limited, 'aria-label': 'AI בלי הגבלה ל־' + m.email, disabled: m.role === 'owner',
        onchange: async (e) => { try { await call('/api/admin/allowances', { method: 'PUT', body: { email: m.email, limited: !e.target.checked } }); toast(e.target.checked ? 'בלי הגבלה' : 'מוגבל לקרדיט'); members(box); } catch (err) { say(err); } } });
      return el('td', {}, el('label', {}, sw, a.limited ? ` מוגבל · נשאר ₪${a.left_ils}` : ' משפחה, בלי הגבלה'));
    };
    /* the birth year (private: only here). Under 12: horror figures are hidden from them, and a shared research keeps them in
       the family (server/members.ts childOf). Empty: not known, not a child. */
    const yearNow = new Date().getFullYear();
    const yearCell = (m) => {
      const mark = el('small', { class: 'muted' }, m.birth_year && yearNow - m.birth_year < 12 ? ' ילד' : '');
      return el('td', {}, el('input', { type: 'number', inputmode: 'numeric', min: '1900', max: String(yearNow), step: '1', value: m.birth_year || '', placeholder: '—',
        'aria-label': 'שנת הלידה של ' + (m.he_name || m.name || m.email), style: 'inline-size:5.5em',
        onchange: async (e) => {
          const v = e.target.value.trim();
          try {
            const r = await call('/api/members/' + encodeURIComponent(m.email) + '/birth-year', { method: 'PUT', body: { birth_year: v ? Number(v) : null } });
            m.birth_year = r.birth_year; mark.textContent = r.birth_year && yearNow - r.birth_year < 12 ? ' ילד' : ''; toast('נשמר');
          } catch (err) { say(err); e.target.value = m.birth_year || ''; }
        } }), mark);
    };
    /* signed in for the first time and not yet approved (core.ts firstSignIn): approving lifts any AI limit and turns on
       every special feature (POST /api/members/:email/approve, the master's) */
    const firstSignIn = (m) => (m.first_seen && !m.approved_at
      ? el('div', { class: 'ad-first' }, el('small', {}, 'התחבר/ה לראשונה ', el('span', { class: 'muted' }, new Date(m.first_seen).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }))),
        btn('אישור', async () => { await call('/api/members/' + encodeURIComponent(m.email) + '/approve', { method: 'POST', body: {} }); toast(`${m.he_name || m.name || m.email} אושר/ה`); members(box); }, 'btn small primary'))
      : null);
    const who = (m) => m.he_name || m.name || m.email;
    /* beta and secret apps (server/app-access.ts): 'בודק בטא' opens every beta app (mail, pc…); a secret app is opened one by
       one. The owner has them all. The server refuses the app's API without it; the toolbox hides it. */
    const appName = (href) => (H.APPS || []).find((a) => a.href === href)?.name || href;
    const accessCell = (m) => {
      if (owners.includes(m.email)) return el('td', {}, el('small', { class: 'muted' }, 'הכול'));
      const has = new Set(acc.access.filter((x) => x.email === m.email).map((x) => x.app));
      return el('td', {}, acc.leaves.map((app) => el('label', { style: 'display:block;white-space:nowrap' },
        el('input', { type: 'checkbox', checked: has.has(app), 'aria-label': (app === 'beta' ? 'בודק בטא: ' : appName(app) + ': ') + who(m),
          onchange: async (e) => {
            try {
              await call('/api/admin/app-access/' + encodeURIComponent(m.email), { method: 'PUT', body: { app, on: e.target.checked } });
              if (e.target.checked) acc.access.push({ email: m.email, app }); else acc.access = acc.access.filter((x) => !(x.email === m.email && x.app === app));
              toast(e.target.checked ? 'נפתח' : 'נסגר');
            } catch (err) { say(err); e.target.checked = !e.target.checked; }
          } }), app === 'beta' ? ' בודק בטא' : ' ' + appName(app))));
    };
    // the two names: the Hebrew one the helper calls them by, and the name others see
    const nameCell = (m) => el('td', { class: 'ad-names' },
      el('input', { type: 'text', value: m.he_name || '', placeholder: 'שם בעברית', 'aria-label': 'השם בעברית של ' + (m.name || m.email), style: 'inline-size:9em',
        onchange: async (e) => { try { await save(m, { he_name: e.target.value }); m.he_name = e.target.value.trim(); } catch (err) { say(err); e.target.value = m.he_name || ''; } } }),
      el('input', { type: 'text', value: m.name || '', placeholder: 'שם תצוגה', 'aria-label': 'שם התצוגה של ' + m.email, style: 'inline-size:9em',
        onchange: async (e) => { try { await save(m, { name: e.target.value }); m.name = e.target.value.trim(); } catch (err) { say(err); e.target.value = m.name || ''; } } }));
    // the household and the role, each a list; a change asks first and then saves, or goes back
    const houseCell = (m, redraw) => {
      const fixed = m.role === 'owner';
      const sel = el('select', { 'aria-label': 'הבית של ' + who(m), disabled: fixed },
        households.map((h) => el('option', { value: h.id, selected: h.id === m.household }, h.title ? `${h.title}` : h.id)),
        fixed ? null : el('option', { value: '+' }, 'משק בית חדש…'));
      sel.onchange = async () => {
        let body;
        if (sel.value === '+') {
          const t = (prompt(`שם משק הבית החדש של ${who(m)} (למשל: משפחת כהן)`) || '').trim();
          if (!t) { sel.value = m.household; return; }
          body = { newHousehold: t };
        } else body = { household: sel.value };
        const to = body.newHousehold || houseName(sel.value);
        const fresh = body.newHousehold ? `\n"${to}" ייפתח ריק, ו${who(m)} יהיה ראש הבית שלו: העץ שלו מתחיל מאפס, וחשבון ה־AI שלו נשאר כמו שהוא.` : '';
        if (!confirm(`להעביר את ${who(m)} מ"${houseName(m.household)}" אל "${to}"?\nהקניות, המתכונים, לוח השנה והעץ שלו יהיו של הבית החדש.${fresh}`)) { sel.value = m.household; return; }
        try { m.household = (await save(m, { ...body, confirm: true })).household; redraw(); } catch (err) { say(err); sel.value = m.household; }
      };
      return el('td', {}, sel);
    };
    const roleCell = (m, redraw) => {
      const isOwner = owners.includes(m.email);
      const sel = el('select', { 'aria-label': 'התפקיד של ' + who(m), disabled: isOwner },
        Object.entries(ROLE_NAMES).map(([v, n]) => el('option', { value: v, selected: v === m.role, disabled: v === 'owner' && !isOwner && m.role !== 'owner' }, n)));
      sel.onchange = async () => {
        if (!confirm(`לשנות את התפקיד של ${who(m)} מ"${ROLE_NAMES[m.role]}" ל"${ROLE_NAMES[sel.value]}"?`)) { sel.value = m.role; return; }
        try { m.role = (await save(m, { role: sel.value, confirm: true })).role; redraw(); } catch (err) { say(err); sel.value = m.role; }
      };
      return el('td', {}, sel, firstSignIn(m));
    };
    const row = (m, redraw) => el('tr', {},
      nameCell(m), el('td', { dir: 'ltr' }, m.email), houseCell(m, redraw), roleCell(m, redraw), yearCell(m), aiCell(m), accessCell(m),
      el('td', {}, m.email === st.as.email || owners.includes(m.email) ? '' : btn('✕', async () => { await call('/api/members/' + encodeURIComponent(m.email), { method: 'DELETE' }); redraw(); }, 'btn small ghost', `להסיר את ${m.email}?`)));
    const HEAD = ['שם', 'אימייל', 'בית', 'תפקיד', 'שנת לידה', 'AI', 'כלים בבדיקה', ''];
    const table = (rows, redraw) => el('div', { class: 'ad-scroll' }, el('table', {}, el('thead', {}, el('tr', {}, HEAD.map((h) => el('th', {}, h)))),
      el('tbody', {}, rows.map((m) => row(m, redraw)))));

    /* the search, in every household (server/member-admin-rules.ts searchSql): each word in a name, the email or the
       household's name. Typing opens suggestions under the box (a combobox: arrows, Enter, Escape); choosing one shows
       that member's row with the same editors, and Enter with none chosen shows every result. "חיפוש מתקדם" adds filters.
       The look is in admin.css (.ad-combo, #ad-sugg). */
    const found = el('div', { class: 'ad-found', 'aria-live': 'polite' });
    const pick = (o) => el('select', { 'aria-label': o.label }, o.items.map(([v, t]) => el('option', { value: v }, t)));
    const fHouse = pick({ label: 'בית', items: [['', 'כל הבתים'], ...households.map((h) => [h.id, h.title || h.id])] });
    const fRole = pick({ label: 'תפקיד', items: [['', 'כל התפקידים'], ...Object.entries(ROLE_NAMES)] });
    const fSeen = pick({ label: 'התחברות', items: [['', 'כולם'], ['yes', 'התחבר/ה'], ['no', 'לא התחבר/ה עדיין']] });
    const filtered = () => fHouse.value || fRole.value || fSeen.value;
    let seq = 0;
    const fetchPeople = async () => {
      const p = new URLSearchParams({ q: q.value.trim() });
      if (fHouse.value) p.set('household', fHouse.value);
      if (fRole.value) p.set('role', fRole.value);
      if (fSeen.value) p.set('seen', fSeen.value);
      const my = ++seq, r = await call('/api/admin/people?' + p);
      if (my !== seq) return null;                                   // a newer search is on its way
      owners.push(...r.owners.filter((e) => !owners.includes(e)));
      for (const h of r.households) if (!households.some((x) => x.id === h.id)) households.push(h);
      return r.members;
    };
    // after an edit the whole section is drawn again (my household may have changed): the search comes back as it was
    const again = () => { members.keep = { q: q.value, h: fHouse.value, r: fRole.value, s: fSeen.value, shown, open: adv.open }; members(box); };
    const showRows = (rows) => found.replaceChildren(rows.length ? table(rows, again) : el('p', { class: 'muted small' }, 'לא נמצא חבר.'));
    let shown = null;                                                // the member chosen from the suggestions, if any
    // every result as rows (Enter, a filter, the 409 of "already a member"); a chosen member stays chosen when redrawn
    const search = async () => {
      if (q.value.trim().length < 2 && !filtered()) { c.close(); found.replaceChildren(); return; }
      try {
        const rows = await fetchPeople();
        if (!rows) return;
        c.close();
        showRows(shown ? rows.filter((m) => m.email === shown).concat(rows.some((m) => m.email === shown) ? [] : rows) : rows);
      } catch (err) { say(err); }
    };
    const c = combo({ id: 'ad-sugg', label: 'חיפוש חבר בכל הבתים', listLabel: 'חברים שנמצאו', placeholder: 'שם, משפחה, אימייל או בית',
      look: async () => { shown = null; const rows = await fetchPeople(); if (rows?.length) found.replaceChildren(); return rows; },
      row: (m) => memberRow(m, houseName),
      chosen: (m) => { shown = m.email; q.value = who(m); showRows([m]); },
      enter: () => { shown = null; search(); },
      short: () => { shown = null; if (!filtered()) found.replaceChildren(); },
      none: () => found.replaceChildren(el('p', { class: 'muted small' }, 'לא נמצא חבר.')) });
    const q = c.q;
    for (const f of [fHouse, fRole, fSeen]) f.onchange = () => { shown = null; search(); };
    const adv = el('details', { class: 'ad-adv' }, el('summary', {}, 'חיפוש מתקדם'),
      el('div', {}, fHouse, fRole, fSeen));                         // the look: admin.css .ad-adv

    const mine = list[0]?.household;
    const email = el('input', { type: 'email', required: true, dir: 'ltr', placeholder: 'כתובת Gmail', 'aria-label': 'כתובת Gmail' });
    const he = el('input', { type: 'text', placeholder: 'שם בעברית', 'aria-label': 'השם בעברית' });
    const house = el('select', { 'aria-label': 'משק הבית' }, households.map((h) => el('option', { value: h.id, selected: h.id === (mine || 'family') }, h.title || h.id)));
    box.style.minInlineSize = '0';   // a grid item: without this the wide table stretches the card past a phone's width (the table scrolls instead)
    box.replaceChildren(section('members-s', 'חברים',
      el('p', { class: 'muted small' }, 'רק מי שברשימה יכול להתחבר. משק הבית קובע עם מי חולקים רשימת קניות, מתכונים, לוח שנה ועץ משפחה. ',
        'ראש בית מנהל את העץ של הבית שלו; מנהל הוא מנהל האוהל כולו. ',
        'את האימייל אי אפשר לשנות: זו הכניסה עם Google והמפתח של כל מה שהחבר שומר. כתובת חדשה מוסיפים כחבר, ואת הישנה מסירים.'),
      el('h3', {}, `הבית שלי${mine ? ` · ${houseName(mine)}` : ''}`),
      table(list, () => members(box)),
      el('h3', {}, 'חיפוש בכל הבתים'),
      c.wrap, adv, found,
      el('h3', {}, 'הוספת חבר'),
      el('form', { class: 'ad-form', onsubmit: async (e) => {
        e.preventDefault();
        try { await call('/api/members', { body: { email: email.value, he_name: he.value, household: house.value } }); toast(`${email.value} נוסף`); members(box); }
        catch (err) {
          say(err);
          // already a member (409): nothing was changed; show them in the search, where their row is edited
          if (err.code === 'already_member') { q.value = email.value.trim(); shown = null; await search(); q.scrollIntoView({ block: 'center' }); }
        }
      } }, el('label', {}, 'אימייל', email), el('label', {}, 'שם בעברית', he), el('label', {}, 'משק בית', house), el('button', { class: 'btn primary' }, 'הוספה'))));
    if (members.keep) {
      const k = members.keep; members.keep = null;
      Object.assign(q, { value: k.q }); fHouse.value = k.h; fRole.value = k.r; fSeen.value = k.s; adv.open = k.open; shown = k.shown;
      search();
    }
    // the first-sign-in message links here (/admin/#members): the room is drawn after the biometric, so scroll now
    if (location.hash === '#members' && !members.scrolled) { members.scrolled = true; box.scrollIntoView({ block: 'start' }); }
  }

  /* ---------- credit gifts (the owner only): spent first, never expire; above ₪20 the room asks again ---------- */
  async function gifts(box) {
    const [g, { members: list }, { allowances: ai }] = await Promise.all([call('/api/admin/gifts'), call('/api/members'), call('/api/admin/allowances')]);
    const who = el('select', { 'aria-label': 'למי', required: true }, el('option', { value: '' }, 'למי…'),
      list.map((m) => el('option', { value: m.email }, `${m.he_name || m.name || m.email}${ai[m.email]?.limited ? ` · מוגבל, נשאר ₪${ai[m.email].left_ils}` : ' · בלי הגבלה ממילא'}`)));
    const amount = el('input', { type: 'number', min: '0.5', max: '500', step: '0.5', required: true, 'aria-label': 'כמה (₪ של AI)', style: 'inline-size:7em' });
    const note = el('input', { type: 'text', maxlength: 200, 'aria-label': 'מילה אישית (לא חובה)', placeholder: 'למשל: יום הולדת שמח!' });
    const give = async (confirm) => {
      const r = await call('/api/admin/gifts', { body: { email: who.value, ils: amount.value, note: note.value, confirm } });
      toast(`ניתנה מתנה של ₪${r.ils}`); gifts(box); dash(document.getElementById('dash'));
    };
    box.replaceChildren(section('gifts-s', 'מתנות קרדיט',
      el('p', { class: 'muted small' }, `קרדיט ל־AI במתנה, בשקלים של עלות אמיתית. נוצל לפני כל קרדיט אחר, לא פג ולא מועבר. המקבל רואה הודעה אישית. מעל ₪${g.confirm_above} – אישור נוסף.`),
      el('div', { class: 'ad-tiles' },
        el('div', { class: 'ad-tile' }, el('small', {}, 'ניתן החודש'), el('b', {}, ils(g.month.given_ils))),
        el('div', { class: 'ad-tile' }, el('small', {}, 'נוצל בפועל מהמתנות'), el('b', {}, ils(g.month.used_ils))),
        el('div', { class: 'ad-tile' }, el('small', {}, 'מתנות החודש'), el('b', {}, g.month.count))),
      el('form', { class: 'ad-form', onsubmit: async (e) => {
        e.preventDefault();
        try { await give(false); }
        catch (err) {
          if (err.status === 409 && confirm(`מתנה של ₪${amount.value} – יותר מ־₪${g.confirm_above}. לתת?`)) { try { await give(true); } catch (e2) { say(e2); } }
          else if (err.status !== 409) say(err);
        }
      } }, el('label', {}, 'למי', who), el('label', {}, 'כמה (₪)', amount), el('label', {}, 'מילה אישית', note), el('button', { class: 'btn primary' }, 'מתנה')),
      g.gifts.length ? el('div', { class: 'ad-scroll' }, el('table', {}, el('thead', {}, el('tr', {}, ['מתי', 'למי', 'כמה', 'נוצל מכל המתנות שלו', ''].map((h, i) => el('th', { class: i === 2 || i === 3 ? 'num' : '' }, h)))),
        el('tbody', {}, g.gifts.map((x) => el('tr', {}, el('td', { class: 'num' }, day(x.at)), el('td', {}, x.name), el('td', { class: 'num' }, ils(x.ils)), el('td', { class: 'num' }, ils(g.used[x.email] || 0)), el('td', { class: 'muted small' }, x.note || '')))))) : el('p', { class: 'muted small' }, 'עוד אין מתנות החודש.')));
  }

  /* ---------- invitations from outside the family (the owner only, server/join.ts) ----------
     A personal link, used once, into a household of its own with the trial credits. On top, the requests for access
     (server/access.ts): "הזמן" makes an invitation for that email and marks the request invited, "דחה" marks it declined.
     Below, a new invitation, then the list with each one's state (sent / opened / joined / expired / cancelled), the link
     while it is open (copy, WhatsApp, email) and cancel. One search looks in the invitations and in the members.
     The look is design's .bd-inv (admin.css); the actions of a row sit in .bd-inv-acts. */
  const IV = { sent: 'נשלחה', opened: 'נפתחה', redeemed: 'הצטרף/ה', expired: 'פג תוקף', cancelled: 'בוטלה' };
  const IV_ST = { redeemed: 'joined' };      // design's data-st names
  const IV_F = [['all', 'הכל', () => true], ['open', 'ממתינות', (x) => x.status === 'sent' || x.status === 'opened'], ['joined', 'הצטרפו', (x) => x.status === 'redeemed'], ['closed', 'פגו ובוטלו', (x) => x.status === 'expired' || x.status === 'cancelled']];
  Object.assign(ERR, { name_required: 'למי ההזמנה? כתבו שם.', bad_email: 'כתובת המייל לא תקינה.', already_member: 'הכתובת הזו כבר באוהל.', not_open: 'ההזמנה כבר לא פתוחה.' });
  const ivState = { q: '', f: 'all', made: null };
  /* ---------- the family tree's deleted cards (the owner only, server/vault/index.ts trashList) ----------
     A delete in the tree is soft: whoever deleted has "בטל" for a short while, and the owner brings any card back here,
     with the relationships whose other end is still in the tree. Names show only where the owner's own view of the tree
     shows them (another family's card may read "קרוב/ת משפחה"). The look is design's .bd-trash. */
  Object.assign(ERR, { tree_locked: 'פתחו את עץ המשפחה פעם אחת במכשיר הזה, ואז חזרו לכאן.', vault_locked: 'פתחו את עץ המשפחה פעם אחת במכשיר הזה, ואז חזרו לכאן.' });
  async function treeTrash(box) {
    const d = await call('/api/admin/tree-trash');
    const again = () => treeTrash(box).catch(say);
    box.replaceChildren(el('section', { class: 'card bd-trash', id: 'treetrash-s' },
      el('h2', {}, 'שחזור מהעץ'),
      el('p', { class: 'muted small' }, 'כרטיסים שנמחקו מעץ המשפחה. שחזור מחזיר את הכרטיס ואת הקשרים שלו לאנשים שעדיין בעץ.'),
      d.people.length ? el('ul', { class: 'bd-trash-list' }, d.people.map((x) => el('li', { class: 'bd-trash-row' },
        el('span', { class: 'bd-trash-who' }, el('b', {}, x.name), el('small', { class: 'muted' }, [x.ours ? 'המשפחה שלנו' : x.family, x.by ? `נמחק על ידי ${x.by}` : '', day(x.deleted_at)].filter(Boolean).join(' · '))),
        btn('שחזור', async () => { await call(`/api/admin/tree-trash/${x.id}/restore`, { method: 'POST' }); toast(`${x.name} חזר/ה לעץ`); again(); }, 'btn small primary')))) : null,
      el('p', { class: 'bd-trash-empty', hidden: d.people.length > 0 }, 'אין כרטיסים שנמחקו.')));
  }

  /* ---------- עץ מבנה (the owner, 2026-11-13; server/layout.ts, the merge in /assets/apps.js): the tent's structure, the
     fire's default ring and the surprise eggs. Everything is a draft on this page until פרסום; תצוגה מקדימה shows the
     draft on this tab only (sessionStorage 'helper.layoutPreview', read by apps.js). Design's markup: admin.css "עץ מבנה". */
  const PILLOWS = Array.from({ length: 15 }, (_, i) => 'p' + String(i + 1).padStart(2, '0'));
  const SWATCHES = [['#2f7d4a', 'זית'], ['#8e2435', 'בורדו'], ['#d2601a', 'כתום'], ['#c27c12', 'דבש'], ['#3557a8', 'כחול'], ['#b8457a', 'ורוד'], ['#8a5a32', 'אדמה'], ['#6c4ab4', 'סגול']];
  const EGG_ST = { live: 'פעילה', soon: 'בקרוב', over: 'הסתיימה', off: 'כבויה' };
  let stDirty = false;
  addEventListener('beforeunload', (e) => { if (stDirty) e.preventDefault(); });

  async function structure(box) {
    box.classList.add('bd-part');
    await H.loadOnce('/assets/apps.js');
    const L = H.layout(), CODE = L.code, DFLT = { parts: L.defaultPins, pins: L.defaultPins };
    const byHref = new Map(CODE.map((a) => [a.href, a]));
    const d = await call('/api/admin/layout');
    let pv = null; try { pv = JSON.parse(sessionStorage.getItem('helper.layoutPreview') || 'null'); } catch (_) { /* no storage */ }
    const start = pv || d.layout;
    const m0 = H.mergeLayout(CODE, DFLT, start);
    const S = { parts: m0.tree.map((t) => ({ href: t.href, kids: t.kids.slice() })), hidden: new Set(m0.hidden), edits: { ...(start?.edits || {}) },
      ring: (start?.ring || []).slice(), sel: null, fsel: null, held: null, open: new Set(m0.tree.map((t) => t.href)) };
    stDirty = !!pv;
    const toLayout = () => ({ parts: S.parts, hidden: [...S.hidden], edits: S.edits, ring: S.ring });
    const merged = () => H.mergeLayout(CODE, DFLT, toLayout());
    const look = (h) => ({ ...byHref.get(h), ...(S.edits[h] || {}) });
    const pimg = (p) => (p ? el('img', { src: `/assets/pillows/${p}.webp`, alt: '' }) : null);
    const changed = () => { stDirty = true; status(); };
    const find = (h) => tree.querySelector(`.st-node[data-h="${CSS.escape(h)}"]`);

    const tree = el('ul', { class: 'st-tree', role: 'tree', 'aria-label': 'מבנה האוהל' });
    const zone = el('div', { class: 'st-zone' }, 'גוררים לכאן כדי לפתוח חלק חדש');
    const panel = el('aside', { class: 'card st-panel', 'aria-labelledby': 'st-ph-h' });
    const scrim = el('div', { class: 'st-scrim', hidden: true, onclick: () => close() });
    const phone = matchMedia('(max-width: 999px)');
    const state = el('p', { class: 'muted small' });
    const note = el('input', { type: 'text', maxlength: 120, placeholder: 'מה השתנה (לא חובה)', 'aria-label': 'מה השתנה' });
    const status = () => { state.textContent = stDirty ? 'יש שינויים שעוד לא פורסמו.' : d.v ? `הכל פורסם · גרסה ${d.v}` : 'המבנה כמו בקוד. עוד לא פורסמה גרסה.'; };

    /* the tree */
    function row(h, ring) {
      const a = look(h), tag = S.hidden.has(h) ? ['hidden', 'מוסתר'] : a.fixed ? ['fixed', 'קבוע'] : ring.includes(h) ? ['ring', 'במדורה'] : null;
      return el('div', { class: 'st-row', 'aria-current': S.sel === h ? 'true' : null },
        el('button', { class: 'st-grip', type: 'button', 'aria-label': `הזזת ${a.name}` }),
        el('button', { class: 'st-tw', type: 'button', 'aria-label': `${S.open.has(h) ? 'סגירת' : 'פתיחת'} ${a.name}` }),
        el('span', { class: 'st-pil' }, pimg(a.pillow), H.icon(a.ic)),
        el('span', { class: 'st-name' }, el('b', {}, a.name), a.sub ? el('small', {}, a.sub) : null),
        tag ? el('span', { class: 'st-tag', 'data-t': tag[0] }, tag[1]) : null,
        el('button', { class: 'st-ibtn', type: 'button', 'aria-label': `עריכת ${a.name}` }));
    }
    function draw() {
      const ring = merged().pins;
      tree.replaceChildren(...S.parts.map((t) => el('li', { class: 'st-node', role: 'treeitem', 'data-kind': 'part', 'data-h': t.href,
        'aria-expanded': t.kids.length ? String(S.open.has(t.href)) : null, style: `--c:${look(t.href).c2 || '#8a5a32'}` },
      row(t.href, ring),
      t.kids.length ? el('ul', { class: 'st-kids', role: 'group' }, t.kids.map((k) => el('li', { class: 'st-node', role: 'treeitem', 'data-kind': 'tool', 'data-h': k }, row(k, ring)))) : null)));
      if (S.held) find(S.held.h)?.classList.add('held');
      drawFire(); status();
    }
    const landed = (h) => { const n = find(h); n?.classList.add('landed'); setTimeout(() => n?.classList.remove('landed'), 900); };
    /** out of the tree; a part takes its tools with it */
    function take(h) {
      const i = S.parts.findIndex((p) => p.href === h);
      if (i >= 0) return S.parts.splice(i, 1)[0].kids;
      for (const p of S.parts) { const j = p.kids.indexOf(h); if (j >= 0) { p.kids.splice(j, 1); return []; } }
      return [];
    }
    /** to = { top, before } (a part, before that one or last) or { kid: part, before } (a tool in that part) */
    function put(h, to) {
      const kids = take(h);
      if (to.top) { const i = to.before ? S.parts.findIndex((p) => p.href === to.before) : -1; S.parts.splice(i < 0 ? S.parts.length : i, 0, { href: h, kids }); return; }
      const p = S.parts.find((x) => x.href === to.kid), i = to.before ? p.kids.indexOf(to.before) : -1;
      p.kids.splice(i < 0 ? p.kids.length : i, 0, h);
      S.open.add(p.href);
    }
    /** may h go there? a fixed item and a part with tools stay on top */
    const may = (h, to) => to.top || (!byHref.get(h).fixed && !S.parts.find((p) => p.href === h)?.kids.length);
    const after = (list, h, skip) => { const rest = list.slice(list.indexOf(h) + 1).filter((x) => x !== skip); return rest[0] || null; };

    /* drag by the grip (pointer events: a finger or a mouse) */
    let drag = null;
    const clearMarks = () => { tree.querySelectorAll('.into, .no').forEach((n) => n.classList.remove('into', 'no')); zone.classList.remove('over'); drag?.ghost?.classList.remove('no'); };
    function aim(x, y) {
      const t = document.elementFromPoint(x, y);
      if (!t || t.closest('.st-ph')) return;
      clearMarks();
      let to = null, n = null;
      if (zone.contains(t)) { to = { top: true, before: null }; zone.classList.add('over'); }
      else {
        const r0 = t.closest('.st-row'); n = r0 && tree.contains(r0) ? r0.closest('.st-node') : null;
        if (!n || n === drag.node || drag.node.contains(n)) { if (!tree.contains(t)) { drag.to = null; drag.ph.remove(); } return; }
        const r = r0.getBoundingClientRect(), f = (y - r.top) / r.height, h = n.dataset.h;
        if (n.dataset.kind === 'part') {
          const kids = S.parts.find((p) => p.href === h).kids, open = kids.length && S.open.has(h);
          if (f > 0.25 && f < 0.75) to = { kid: h, before: null, into: true };
          else if (f >= 0.75 && open) to = { kid: h, before: kids.find((k) => k !== drag.h) || null, into: true };
          else to = { top: true, before: f <= 0.25 ? h : after(S.parts.map((p) => p.href), h, drag.h) };
        } else {
          const part = n.parentElement.closest('.st-node').dataset.h, kids = S.parts.find((p) => p.href === part).kids;
          to = { kid: part, before: f < 0.5 ? h : after(kids, h, drag.h) };
        }
      }
      drag.to = to; drag.ok = may(drag.h, to);
      if (!drag.ok) { (n || zone).classList.add('no'); drag.ghost.classList.add('no'); drag.ph.remove(); return; }
      if (to.into) n.classList.add('into');
      // where it will land
      if (to.top) { const b = to.before && find(to.before); b ? tree.insertBefore(drag.ph, b) : tree.append(drag.ph); }
      else {
        const pn = find(to.kid);
        let ul = pn.querySelector(':scope > .st-kids');
        if (!ul) { ul = el('ul', { class: 'st-kids', role: 'group' }); pn.append(ul); }
        if (!S.open.has(to.kid)) { S.open.add(to.kid); pn.setAttribute('aria-expanded', 'true'); }
        const b = to.before && find(to.before); b && b.parentElement === ul ? ul.insertBefore(drag.ph, b) : ul.append(drag.ph);
      }
    }
    function endDrag(drop) {
      if (!drag) return;
      const { h, on, to, ok } = drag;
      drag.ghost?.remove(); drag.ph?.remove(); clearMarks();
      tree.classList.remove('dragging'); drag.node.classList.remove('away');
      drag = null;
      if (on && drop && to && ok) { put(h, to); changed(); draw(); landed(h); }
      else if (on) draw();
    }
    tree.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('.st-grip');
      if (!g || e.button > 0 || S.held) return;
      const node = g.closest('.st-node'), r = node.querySelector('.st-row').getBoundingClientRect();
      drag = { h: node.dataset.h, node, x0: e.clientX, y0: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, hh: r.height, on: false };
      g.setPointerCapture(e.pointerId);
    });
    tree.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.on) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
        drag.on = true;
        tree.classList.add('dragging'); drag.node.classList.add('away');
        drag.ghost = el('div', { class: 'st-ghost' }, drag.node.querySelector('.st-row').cloneNode(true));
        drag.ph = el('li', { class: 'st-ph', 'aria-hidden': 'true', style: `--h:${Math.round(drag.hh)}px` });
        document.body.append(drag.ghost);
      }
      drag.ghost.style.cssText = `--x:${e.clientX - drag.ox}px;--y:${e.clientY - drag.oy}px;--w:${drag.w}px`;
      if (e.clientY < 70) scrollBy(0, -14); else if (e.clientY > innerHeight - 90) scrollBy(0, 14);
      aim(e.clientX, e.clientY);
    });
    tree.addEventListener('pointerup', () => endDrag(true));
    tree.addEventListener('pointercancel', () => endDrag(false));
    tree.addEventListener('lostpointercapture', () => endDrag(false));

    /* the keyboard: space on the grip picks up, the arrows move, space puts down, Esc cancels */
    function step(h, dir) {
      const i = S.parts.findIndex((p) => p.href === h);
      if (i >= 0) { const j = i + dir; if (j >= 0 && j < S.parts.length) [S.parts[i], S.parts[j]] = [S.parts[j], S.parts[i]]; return; }
      const pi = S.parts.findIndex((p) => p.kids.includes(h)), kids = S.parts[pi].kids, k = kids.indexOf(h), j = k + dir;
      if (j >= 0 && j < kids.length) { [kids[k], kids[j]] = [kids[j], kids[k]]; return; }
      const next = S.parts[pi + dir];
      if (!next) return;
      kids.splice(k, 1);
      dir < 0 ? next.kids.push(h) : next.kids.unshift(h);
      S.open.add(next.href);
    }
    const grip = (h) => find(h)?.querySelector(':scope > .st-row .st-grip');
    tree.addEventListener('keydown', (e) => {
      const g = e.target.closest('.st-grip');
      if (!g) return;
      const h = g.closest('.st-node').dataset.h, name = look(h).name;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!S.held) { S.held = { h, snap: JSON.stringify(S.parts) }; find(h).classList.add('held'); toast(`${name} הורם. חצים להזזה, רווח להנחה, Esc לביטול.`); }
        else { const moved = S.held.snap !== JSON.stringify(S.parts); S.held = null; if (moved) changed(); draw(); grip(h)?.focus(); landed(h); toast(moved ? `${name} הונח.` : `${name} נשאר במקומו.`); }
      } else if (S.held?.h === h && e.key === 'Escape') { e.preventDefault(); S.parts = JSON.parse(S.held.snap); S.held = null; draw(); grip(h)?.focus(); }
      else if (S.held?.h === h && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); step(h, e.key === 'ArrowUp' ? -1 : 1); draw(); grip(h)?.focus(); }
    });
    tree.addEventListener('click', (e) => {
      const n = e.target.closest('.st-node'); if (!n) return;
      const h = n.dataset.h;
      if (e.target.closest('.st-tw')) { S.open.has(h) ? S.open.delete(h) : S.open.add(h); n.setAttribute('aria-expanded', String(S.open.has(h))); e.target.closest('.st-tw').setAttribute('aria-label', `${S.open.has(h) ? 'סגירת' : 'פתיחת'} ${look(h).name}`); }
      else if (e.target.closest('.st-ibtn')) edit(h);
    });

    /* the panel: name, description, icon, cushion, colour, hide */
    const sheet = () => { panel.hidden = phone.matches && !S.sel; scrim.hidden = !(phone.matches && S.sel); };
    phone.addEventListener('change', sheet);
    function close() {
      const was = S.sel; S.sel = null;
      panel.replaceChildren(el('div', { class: 'st-head' }, el('h3', { id: 'st-ph-h' }, 'עריכה')),
        el('p', { class: 'muted small' }, 'מקישים על העיפרון ליד פריט כדי לשנות את השם, התיאור, הסמל, הכרית והצבע, או להסתיר אותו.'));
      sheet(); draw();
      if (was) find(was)?.querySelector(':scope > .st-row .st-ibtn')?.focus();
    }
    function edit(h) {
      S.sel = h;
      const a0 = byHref.get(h), a = look(h);
      const cur = { name: a.name, sub: a.sub || '', ic: a.ic, pillow: a.pillow || '', c2: (a.c2 || '#8a5a32').toLowerCase() };
      const prev = el('div', { class: 'st-prev' }, el('span', { class: 'pillow' }), el('b'));
      const refresh = () => {
        prev.style.setProperty('--c2', cur.c2);
        prev.firstChild.replaceChildren(...[pimg(cur.pillow), el('span', { class: 'badge' }, H.icon(cur.ic))].filter(Boolean));
        prev.lastChild.textContent = cur.name.trim() || a0.name;
      };
      const name = el('input', { type: 'text', maxlength: 40, value: cur.name, oninput: () => { cur.name = name.value; refresh(); } });
      const sub = el('textarea', { rows: 2, maxlength: 120, oninput: () => { cur.sub = sub.value; } }, cur.sub);
      const pick = (cls, legend, items) => el('fieldset', { class: 'st-pick ' + cls }, el('legend', {}, legend), ...items);
      const radio = (nm, v, fn, extra = {}) => el('input', { type: 'radio', name: nm, value: v, checked: cur[nm.slice(3)] === v, onchange: fn, ...extra });
      const used = {};
      for (const x of merged().apps) if (x.href !== h && x.pillow) (used[x.pillow] ||= []).push(x.name);
      const other = el('input', { type: 'color', value: cur.c2, 'aria-label': 'צבע אחר',
        oninput: () => { cur.c2 = other.value; panel.querySelectorAll('[name="st-c2"]').forEach((r) => { r.checked = false; }); refresh(); } });
      panel.replaceChildren(
        el('div', { class: 'st-head' }, el('h3', { id: 'st-ph-h' }, `עריכה: ${a.name}`), el('button', { class: 'st-ibtn close', type: 'button', 'aria-label': 'סגירה', onclick: () => close() })),
        prev,
        el('label', { class: 'field' }, el('span', {}, 'שם'), name),
        el('label', { class: 'field' }, el('span', {}, 'תיאור'), sub),
        pick('st-icons', 'סמל', [...new Set(CODE.map((x) => x.ic))].map((n) => el('label', { title: n }, radio('st-ic', n, () => { cur.ic = n; refresh(); }, { 'aria-label': n }), H.icon(n)))),
        pick('st-pills', 'כרית', PILLOWS.map((p) => el('label', used[p] ? { 'data-used': true, title: 'בשימוש: ' + used[p].join(', ') } : { title: p },
          radio('st-pillow', p, () => { cur.pillow = p; refresh(); }), el('img', { src: `/assets/pillows/${p}.webp`, alt: p })))),
        pick('st-colors', 'צבע', [...SWATCHES.map(([c, n]) => el('label', { style: `--sw:${c}`, title: n }, radio('st-c2', c, () => { cur.c2 = c; other.value = c; refresh(); }, { 'aria-label': n }))),
          el('label', { class: 'st-other', title: 'צבע אחר' }, other)]),
        el('div', { class: 'st-actions' },
          el('button', { class: 'btn primary', type: 'button', onclick: () => {
            const e = {}, nm = cur.name.trim(), sb = cur.sub.trim();
            if (nm && nm !== a0.name) e.name = nm;
            if (sb && sb !== (a0.sub || '')) e.sub = sb;
            for (const k of ['ic', 'pillow', 'c2']) if (cur[k] && cur[k] !== String(a0[k] || '').toLowerCase()) e[k] = cur[k];
            const before = JSON.stringify(S.edits[h] || {});
            if (Object.keys(e).length) S.edits[h] = e; else delete S.edits[h];
            if (before !== JSON.stringify(S.edits[h] || {})) changed();
            close();
          } }, 'שמירה'),
          el('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, 'ביטול'),
          S.edits[h] ? el('button', { class: 'btn ghost', type: 'button', onclick: () => { delete S.edits[h]; changed(); close(); } }, 'כמו בקוד') : null,
          el('button', { class: 'btn ghost st-del', type: 'button', disabled: !!a0.fixed, title: a0.fixed ? 'פריט קבוע: תמיד מוצג' : null,
            onclick: () => { S.hidden.has(h) ? S.hidden.delete(h) : S.hidden.add(h); changed(); close(); } }, S.hidden.has(h) ? 'החזרה לתפריט' : 'הסתרה')));
      panel.onkeydown = (e) => { if (e.key === 'Escape') close(); };
      refresh(); sheet(); draw(); name.focus();
    }

    /* the fire: the home page's ring for people who pinned nothing (each person's own pins stay theirs) */
    const ringEl = el('div', { class: 'fe-ring' }), tray = el('div', { class: 'fe-tray', hidden: true });
    const setRing = (list) => { S.ring = list; S.fsel = null; tray.hidden = true; changed(); draw(); };
    let ringDrag = null, ringMoved = false;
    function drawFire() {
      const m = merged(), pins = m.pins, items = ['/family/', ...pins, '/tools/', '/settings/'], N = items.length + (pins.length < 12 ? 1 : 0);
      const at = (i) => { const a = 90 + (i * 360) / N; return `--a:${a}deg;--z:${Math.round(10 + 9 * Math.sin((a * Math.PI) / 180))}`; };
      const seats = items.map((h, i) => {
        const a = look(h), fixed = !!byHref.get(h).fixed;
        return el('div', { class: 'fe-seat', style: `${at(i)};--c2:${a.c2 || '#8a5a32'}`, 'data-fixed': fixed, 'data-h': h, 'aria-current': S.fsel === h ? 'true' : null },
          el('button', { class: 'fe-pick', type: 'button', 'aria-pressed': String(S.fsel === h), 'aria-label': fixed ? `${a.name} (קבוע)` : `החלפת ${a.name}` },
            el('span', { class: 'pillow' }, pimg(a.pillow), el('span', { class: 'badge' }, H.icon(a.ic))), el('span', { class: 'label' }, a.name)),
          fixed ? null : el('button', { class: 'fe-x', type: 'button', 'aria-label': `הסרת ${a.name} מהמדורה`, onclick: () => setRing(pins.filter((x) => x !== h)) }));
      });
      if (pins.length < 12) seats.push(el('div', { class: 'fe-seat fe-add', style: at(items.length), 'data-h': '+', 'aria-current': S.fsel === '+' ? 'true' : null },
        el('button', { class: 'fe-pick', type: 'button', 'aria-pressed': String(S.fsel === '+') }, el('span', { class: 'pillow' }), el('span', { class: 'label' }, 'הוספה'))));
      ringEl.replaceChildren(el('div', { class: 'fe-fire', 'aria-hidden': 'true' }, el('img', { src: '/assets/campfire/base.webp', alt: '' }), el('img', { class: 'fe-flame', src: '/assets/campfire/flame-2.webp', alt: '' })), ...seats);
      if (S.fsel) {
        tray.replaceChildren(el('p', { class: 'fe-tray-h' }, ...(S.fsel === '+' ? ['מה להוסיף למדורה?'] : ['מה יבוא במקום ', el('b', {}, look(S.fsel).name), '?'])),
          el('ul', { class: 'fe-opts' }, m.apps.filter((a) => !a.fixed).map((a) => el('li', {}, el('button', { class: 'fe-opt', type: 'button', 'aria-disabled': pins.includes(a.href) ? 'true' : null,
            onclick: () => { if (pins.includes(a.href)) return; setRing(S.fsel === '+' ? [...pins, a.href] : pins.map((x) => (x === S.fsel ? a.href : x))); } }, pimg(a.pillow), el('span', {}, a.name))))));
        tray.hidden = false;
      } else tray.hidden = true;
    }
    ringEl.addEventListener('click', (e) => {
      const s = e.target.closest('.fe-seat'), p = e.target.closest('.fe-pick');
      if (!s || !p || ringMoved) { ringMoved = false; return; }
      if (s.dataset.fixed === '') return toast('עץ המשפחה, כלים והגדרות קבועים במדורה.');
      S.fsel = S.fsel === s.dataset.h ? null : s.dataset.h; draw();
    });
    // reorder: carry a seat to another seat's place
    ringEl.addEventListener('pointerdown', (e) => {
      const s = e.target.closest('.fe-seat');
      if (!s || e.button > 0 || s.dataset.fixed === '' || s.dataset.h === '+' || e.target.closest('.fe-x')) return;
      ringDrag = { s, h: s.dataset.h, x0: e.clientX, y0: e.clientY, on: false, id: e.pointerId };
    });
    ringEl.addEventListener('pointermove', (e) => {
      if (!ringDrag) return;
      const dx = e.clientX - ringDrag.x0, dy = e.clientY - ringDrag.y0;
      if (!ringDrag.on) { if (Math.hypot(dx, dy) < 8) return; ringDrag.on = true; ringEl.setPointerCapture(ringDrag.id); ringEl.classList.add('dragging'); ringDrag.s.classList.add('lifted'); }
      ringDrag.s.style.setProperty('--dx', dx + 'px'); ringDrag.s.style.setProperty('--dy', dy + 'px');
    });
    const ringDrop = (e, drop) => {
      if (!ringDrag) return;
      const { on, h, s } = ringDrag; ringDrag = null;
      if (!on) return;
      ringMoved = true; setTimeout(() => { ringMoved = false; }, 0);
      ringEl.classList.remove('dragging'); s.classList.remove('lifted');
      const pins = merged().pins;
      let best = null, bd = 1e9;
      if (drop) for (const o of ringEl.querySelectorAll('.fe-seat:not([data-fixed]):not(.fe-add)')) {
        if (o === s) continue;
        const r = o.getBoundingClientRect(), dd = Math.hypot(r.left + r.width / 2 - e.clientX, r.top + r.height / 2 - e.clientY);
        if (dd < bd && dd < 90) { bd = dd; best = o.dataset.h; }
      }
      if (!best) return draw();
      const list = pins.filter((x) => x !== h);
      list.splice(pins.indexOf(best) > pins.indexOf(h) ? list.indexOf(best) + 1 : list.indexOf(best), 0, h);
      setRing(list);
    };
    ringEl.addEventListener('pointerup', (e) => ringDrop(e, true));
    ringEl.addEventListener('pointercancel', (e) => ringDrop(e, false));

    /* publish, preview, versions */
    async function publish() {
      const r = await call('/api/admin/layout', { method: 'PUT', body: { layout: toLayout(), note: note.value.trim() } });
      try { sessionStorage.removeItem('helper.layoutPreview'); localStorage.setItem('helper.layout', JSON.stringify({ v: r.v, at: Date.now(), layout: r.layout })); } catch (_) { /* no storage */ }
      stDirty = false;
      document.querySelector('.layout-pv')?.remove();
      toast('המבנה פורסם. כולם יראו אותו בכניסה הבאה לעמוד.');
      await structure(box);
    }
    function preview() {
      try { sessionStorage.setItem('helper.layoutPreview', JSON.stringify(toLayout())); } catch (_) { return toast('אין אפשרות לתצוגה מקדימה בדפדפן הזה.'); }
      stDirty = false;
      location.href = '/';
    }
    const versions = el('details', { class: 'st-ver' }, el('summary', {}, `גרסאות קודמות (${d.versions.length})`),
      d.versions.length ? el('ul', {}, d.versions.map((x) => el('li', {}, el('span', {}, `גרסה ${x.id} · ${day(x.at)}${x.note ? ' · ' + x.note : ''}`), ' ',
        x.id === d.v ? el('small', { class: 'muted' }, 'בשימוש') : btn('שחזור', async () => {
          await call(`/api/admin/layout/restore/${x.id}`, { method: 'POST' });
          try { sessionStorage.removeItem('helper.layoutPreview'); localStorage.removeItem('helper.layout'); } catch (_) { /* no storage */ }
          stDirty = false; toast(`גרסה ${x.id} חזרה ופורסמה`); await structure(box);
        }, 'btn small ghost', `לפרסם שוב את גרסה ${x.id}? השינויים שלא פורסמו כאן יאבדו.`)))) : el('p', { class: 'muted small' }, 'עוד אין גרסאות.'));

    const eggBox = el('div', { class: 'bd-part' });
    box.replaceChildren(
      el('div', { class: 'st-wrap' },
        el('section', { class: 'card st' },
          el('div', { class: 'st-head' }, el('h2', {}, 'עץ מבנה'),
            el('button', { class: 'btn small ghost', type: 'button', onclick: () => { const all = S.parts.every((p) => !p.kids.length || S.open.has(p.href)); S.parts.forEach((p) => (all ? S.open.delete(p.href) : S.open.add(p.href))); draw(); } }, 'פתיחה וסגירה של הכל'),
            el('p', {}, 'גוררים בידית ⠿ כדי לסדר או להעביר כלי לחלק אחר (במקלדת: רווח על הידית, חצים, רווח). מקישים על העיפרון כדי לשנות שם, סמל, כרית וצבע, או להסתיר.')),
          tree, zone,
          el('div', { class: 'st-actions' }, btn('פרסום', publish, 'btn primary'), btn('תצוגה מקדימה', preview, 'btn ghost'),
            btn('ביטול השינויים', async () => { try { sessionStorage.removeItem('helper.layoutPreview'); } catch (_) { /* no storage */ } stDirty = false; document.querySelector('.layout-pv')?.remove(); await structure(box); }, 'btn ghost', 'לבטל את כל השינויים שלא פורסמו?')),
          el('label', { class: 'field' }, el('span', {}, 'מה השתנה'), note), state, versions),
        panel),
      scrim,
      el('section', { class: 'card fe' },
        el('div', { class: 'st-head' }, el('h2', {}, 'המדורה'),
          el('p', {}, 'כך ייראה הגלגל בעמוד הבית למי שעוד לא הצמיד כלום (מי שהצמיד שומר על שלו). מקישים על כרית כדי להחליף אותה, גוררים כדי לסדר, × מוריד ו־+ מוסיף.')),
        ringEl, tray,
        el('div', { class: 'st-actions' }, btn('פרסום', publish, 'btn primary'), btn('חזרה לברירת המחדל', () => setRing([]), 'btn ghost'))),
      eggBox);
    close();
    eggsPart(eggBox, CODE).catch(say);
  }

  /* the surprise eggs: where, what, when; how many found each one and who */
  async function eggsPart(host, code) {
    const { eggs } = await call('/api/admin/eggs');
    const pages = [['/', 'עמוד הבית']];
    for (const a of code) { const p = a.href.split('#')[0]; if (!pages.some(([v]) => v === p)) pages.push([p, a.name]); }
    const pageName = (p) => pages.find(([v]) => v === p)?.[1] || p;
    const md = (t) => { const x = new Date(t); return `${x.getDate()}.${x.getMonth() + 1}`; };
    const when = (e) => (e.starts || e.ends ? `${e.starts ? md(e.starts) : '…'} – ${e.ends ? md(e.ends) : '…'}` : '—');
    const iso = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '');
    const form = el('form', { class: 'egg-form', hidden: true });
    function open(e) {
      const page = el('select', {}, (e && !pages.some(([v]) => v === e.page) ? [...pages, [e.page, e.page]] : pages)
        .map(([v, n]) => el('option', { value: v, selected: (e?.page || '/') === v }, n)));
      const kind = el('select', {}, [['text', 'מופיע טקסט'], ['surprise', 'טקסט וזיקוקים'], ['link', 'טקסט, ואז קישור']].map(([v, n]) => el('option', { value: v, selected: (e?.kind || 'text') === v }, n)));
      const text = el('input', { type: 'text', maxlength: 280, value: e?.text || '', required: true });
      const link = el('input', { type: 'text', dir: 'ltr', maxlength: 300, placeholder: '/songs/ או https://…', value: e?.link || '' });
      const linkF = el('label', { class: 'field', hidden: (e?.kind || 'text') !== 'link' }, el('span', {}, 'לאן הקישור'), link);
      kind.onchange = () => { linkF.hidden = kind.value !== 'link'; };
      const from = el('input', { type: 'date', value: iso(e?.starts) }), to = el('input', { type: 'date', value: iso(e?.ends) });
      const x = el('input', { type: 'range', min: 8, max: 92, value: e?.x ?? 50 }), y = el('input', { type: 'range', min: 8, max: 92, value: e?.y ?? 50 });
      const on = el('input', { type: 'checkbox', checked: e ? !!e.active : true });
      form.replaceChildren(
        el('label', { class: 'field' }, el('span', {}, 'באיזה עמוד'), page),
        el('label', { class: 'field' }, el('span', {}, 'מה כתוב כשמוצאים'), text),
        el('label', { class: 'field' }, el('span', {}, 'מה קורה כשמוצאים'), kind), linkF,
        el('div', { class: 'egg-dates' }, el('label', { class: 'field' }, el('span', {}, 'מתאריך'), from), el('label', { class: 'field' }, el('span', {}, 'עד תאריך'), to)),
        el('div', { class: 'egg-dates' }, el('label', { class: 'field' }, el('span', {}, 'מרחק מימין'), x), el('label', { class: 'field' }, el('span', {}, 'מרחק מלמעלה'), y)),
        el('label', { class: 'egg-on' }, on, ' פעילה'),
        e?.finders?.length ? el('p', { class: 'muted small' }, 'מצאו: ' + e.finders.map((f) => `${f.who} (${day(f.at)})`).join(' · ')) : null,
        el('div', { class: 'st-actions' }, el('button', { class: 'btn primary' }, 'שמירה'), el('button', { class: 'btn ghost', type: 'button', onclick: () => { form.hidden = true; } }, 'ביטול'),
          e ? btn('מחיקה', async () => { await call(`/api/admin/eggs/${encodeURIComponent(e.id)}`, { method: 'DELETE' }); toast('הביצה נמחקה'); await eggsPart(host, code); }, 'btn ghost st-del', 'למחוק את הביצה? גם רשימת המוצאים תימחק.') : null));
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        try {
          await call(e ? `/api/admin/eggs/${encodeURIComponent(e.id)}` : '/api/admin/eggs', { method: e ? 'PUT' : 'POST',
            body: { page: page.value, text: text.value, kind: kind.value, link: link.value, starts: from.value || null, ends: to.value || null, active: on.checked, x: +x.value, y: +y.value } });
          toast('הביצה נשמרה'); await eggsPart(host, code);
        } catch (err) { say(err); }
      };
      form.hidden = false; text.focus();
    }
    host.replaceChildren(el('section', { class: 'card bd-egg' },
      el('div', { class: 'st-head' }, el('h2', {}, 'ביצי הפתעה'), btn('ביצה חדשה', () => open(null), 'btn small primary'),
        el('p', {}, 'ביצה קטנה שמסתתרת בעמוד בימים שבחרתם. מי שמוצא אותה רואה את הטקסט, והמונה עולה. מה שבתוכה נשאר סוד עד שמוצאים.')),
      el('ul', { class: 'egg-list' }, eggs.map((e) => el('li', { class: 'egg-row', 'data-st': e.state },
        el('span', { class: 'egg-mini', 'aria-hidden': 'true' }),
        el('span', { class: 'egg-what' }, el('b', {}, pageName(e.page)), el('small', {}, `"${e.text}"`)),
        el('span', { class: 'egg-when' }, when(e)),
        el('span', { class: 'egg-count', title: e.finders.map((f) => f.who).join(', ') || 'עוד אף אחד' }, el('b', {}, String(e.count)), ' מצאו'),
        el('span', { class: 'egg-st' }, EGG_ST[e.state] || e.state),
        el('button', { class: 'st-ibtn', type: 'button', 'aria-label': `עריכת הביצה ב${pageName(e.page)}`, onclick: () => open(e) })))),
      el('p', { class: 'egg-empty', hidden: eggs.length > 0 }, 'עוד אין ביצים.'),
      form));
  }

  async function invites(box) {
    const { q } = ivState;
    const [d, people, reqs] = await Promise.all([
      call('/api/admin/invites' + (q ? '?q=' + encodeURIComponent(q) : '')),
      q.length >= 2 ? call('/api/admin/people?q=' + encodeURIComponent(q)).catch(() => ({ members: [] })) : { members: [] },
      call('/api/admin/access-requests').catch(() => ({ requests: [] })),
    ]);
    const asked = reqs.requests.filter((r) => r.status === 'asked');
    const again = () => invites(box).catch(say);
    const copy = async (url) => { try { await navigator.clipboard.writeText(url); toast('הקישור הועתק'); } catch (_) { prompt('העתיקו את הקישור:', url); } };
    const words = (x) => `שלום ${x.name}, הזמנתי אותך לאוהל – המקום של הכלים שלנו ליום־יום. ההזמנה אישית ועובדת פעם אחת: ${x.url}`;
    const sendLinks = (x) => [
      el('a', { class: 'btn small ghost', href: `https://wa.me/?text=${encodeURIComponent(words(x))}`, target: '_blank', rel: 'noopener' }, 'וואטסאפ'),
      x.email ? ' ' : null, x.email ? el('a', { class: 'btn small ghost', href: `mailto:${x.email}?subject=${encodeURIComponent('הזמנה לאוהל')}&body=${encodeURIComponent(words(x))}` }, 'מייל') : null];
    async function make(name, email) {
      const r = await call('/api/admin/invites', { body: { name, email: email || undefined, days: +days.value } });
      ivState.made = { name, email, url: r.url };
      return r;
    }

    /* the requests for access, waiting for an answer */
    const reqRow = (r) => {
      const name = r.name || r.google_name || r.email;
      return el('li', { class: 'bd-inv-row', 'data-st': 'asked' },
        el('span', { class: 'bd-inv-who' }, el('b', {}, name),
          el('small', { class: 'muted' }, el('bdi', { dir: 'ltr' }, r.email), r.asked_at ? ' · ' + day(r.asked_at) : '', r.note ? ' · ' + r.note : '')),
        el('span', { class: 'bd-inv-st' }, 'ביקש/ה'),
        el('span', { class: 'bd-inv-acts' },
          btn('הזמן', async () => { await make(name, r.email); await call('/api/admin/access-requests/decide', { body: { email: r.email, status: 'invited' } }); toast(`ההזמנה של ${name} מוכנה`); again(); }, 'btn small primary'), ' ',
          btn('דחה', async () => { await call('/api/admin/access-requests/decide', { body: { email: r.email, status: 'declined' } }); toast('הבקשה נדחתה'); again(); }, 'btn small ghost', `לדחות את הבקשה של ${name}? לא נשלחת לו/ה הודעה.`)));
    };

    /* a new invitation */
    const name = el('input', { type: 'text', maxlength: 80, required: true, 'aria-label': 'למי (שם)', placeholder: 'למשל: רות כהן' });
    const email = el('input', { type: 'email', maxlength: 200, dir: 'ltr', 'aria-label': 'מייל (לא חובה)', placeholder: 'name@gmail.com' });
    const days = el('select', { 'aria-label': 'כמה זמן ההזמנה פתוחה' }, [[3, '3 ימים'], [7, 'שבוע'], [14, 'שבועיים'], [30, 'חודש']].map(([v, t]) => el('option', { value: v, selected: v === 7 }, t)));
    const m = ivState.made;
    const made = m ? el('div', { class: 'iv-made', 'aria-live': 'polite' }, el('p', {}, `ההזמנה של ${m.name} מוכנה:`), el('p', { class: 'iv-link', dir: 'ltr' }, m.url),
      btn('העתקת הקישור', () => copy(m.url), 'btn small primary'), ' ', ...sendLinks(m)) : null;
    ivState.made = null;

    /* the list: the search, the filters, the rows */
    const search = el('input', { type: 'search', value: q, 'aria-label': 'חיפוש לפי שם או מייל', placeholder: 'חיפוש לפי שם או מייל…' });
    let wait;
    search.addEventListener('input', () => { clearTimeout(wait); wait = setTimeout(async () => { ivState.q = search.value.trim(); await again(); const s = box.querySelector('.bd-inv-tools input[type=search]'); s?.focus(); s?.setSelectionRange(s.value.length, s.value.length); }, 350); });
    const filters = el('div', { class: 'bd-inv-f', role: 'group', 'aria-label': 'סינון' }, IV_F.map(([k, t, ok]) =>
      el('button', { type: 'button', 'aria-pressed': String(ivState.f === k), onclick: () => { ivState.f = k; again(); } }, t, ' ', el('span', {}, d.invites.filter(ok).length))));
    const shown = d.invites.filter(IV_F.find(([k]) => k === ivState.f)[2]);
    const sub = (x) => x.status === 'redeemed' ? `${x.used_name || x.used_by} · ${day(x.used_at)}`
      : x.status === 'cancelled' ? `בוטלה ${day(x.cancelled_at)}`
      : x.status === 'expired' ? `פגה ${day(x.exp)}`
      : `${x.status === 'opened' ? `נפתחה ${day(x.opened_at)} · ` : ''}פתוחה עד ${day(x.exp)}`;
    const row = (x) => el('li', { class: 'bd-inv-row', 'data-st': IV_ST[x.status] || x.status },
      el('span', { class: 'bd-inv-who' }, el('b', {}, x.name), el('small', { class: 'muted' }, x.email ? [el('bdi', { dir: 'ltr' }, x.email), ' · '] : '', sub(x))),
      el('span', { class: 'bd-inv-st' }, IV[x.status]),
      x.url ? el('span', { class: 'bd-inv-acts' },
        btn('העתקה', () => copy(x.url), 'btn small ghost'), ' ', ...sendLinks(x), ' ',
        btn('ביטול', async () => { await call(`/api/admin/invites/${x.id}/cancel`, { method: 'POST' }); toast('ההזמנה בוטלה'); again(); }, 'btn small ghost', `לבטל את ההזמנה של ${x.name}? הקישור יפסיק לעבוד מיד.`)) : el('span'));

    box.replaceChildren(el('section', { class: 'card bd-inv', id: 'invites-s' },
      el('h2', {}, 'הזמנות'),
      asked.length ? [el('h3', {}, `בקשות הצטרפות · ${asked.length}`), el('ul', { class: 'bd-inv-list bd-req-list' }, asked.map(reqRow))] : null,
      el('p', { class: 'muted small' }, 'הזמנה אישית למישהו מחוץ למשפחה: הוא נכנס עם Google למקום משלו באוהל, עם קרדיט התחלתי לעוזר החכם, ולא רואה שום דבר של המשפחה. כל קישור עובד פעם אחת. אם תכתבו מייל, רק החשבון הזה יוכל להיכנס בו.'),
      el('form', { class: 'ad-form', onsubmit: async (e) => { e.preventDefault(); try { await make(name.value.trim(), email.value.trim()); await again(); } catch (err) { say(err); } } },
        el('label', {}, 'למי', name), el('label', {}, 'מייל (לא חובה)', email), el('label', {}, 'פתוחה', days), el('button', { class: 'btn primary' }, 'הזמנה חדשה')),
      made,
      el('div', { class: 'bd-inv-tools' }, el('div', { class: 'ad-combo' }, search), filters),
      people.members.length ? el('p', { class: 'small iv-people' }, 'כבר באוהל: ', people.members.slice(0, 8).flatMap((p, i) => [i ? ', ' : '', `${p.he_name || p.name || ''} `, el('bdi', { dir: 'ltr', class: 'muted' }, p.email)])) : null,
      shown.length ? el('ul', { class: 'bd-inv-list' }, shown.map(row)) : null,
      el('p', { class: 'bd-inv-empty', hidden: shown.length > 0 }, q ? 'אין הזמנות שמתאימות לחיפוש.' : ivState.f === 'all' ? 'עוד אין הזמנות.' : 'אין כאן הזמנות.')));
  }

  /* ---------- messages to everyone, or to one member ---------- */
  Object.assign(ERR, { not_member: 'הכתובת הזו לא ברשימת החברים.' });
  async function messages(box) {
    const { messages: list, members: n } = await call('/api/admin/messages');
    const text = el('textarea', { rows: 2, maxlength: 500, required: true, 'aria-label': 'ההודעה', placeholder: 'למשל: מחר בערב מפגש אצל סבתא – מי שעוד לא ענה, ענו בקישור!' });
    const level = el('select', { 'aria-label': 'סוג' }, [['info', 'רגילה'], ['party', 'חגיגית 🎉'], ['warn', 'חשובה ⚠️']].map(([v, t]) => el('option', { value: v }, t)));
    const link = el('input', { type: 'text', dir: 'ltr', 'aria-label': 'קישור (לא חובה)', placeholder: '/gather/' });
    const days = el('input', { type: 'number', min: 1, max: 60, value: 7, 'aria-label': 'כמה ימים', style: 'inline-size:5em' });
    const LV = { info: 'רגילה', party: 'חגיגית', warn: 'חשובה' };

    // to whom: everyone, or one member found with the members search (the same suggestions, /api/admin/people?q=)
    let to = null, houses = [];
    const houseName = (id) => houses.find((h) => h.id === id)?.title || id;
    const chosenLine = el('p', { class: 'muted small', 'aria-live': 'polite' });
    const showTo = () => chosenLine.replaceChildren(to ? `ההודעה תגיע רק אל ${to.he_name || to.name || to.email} (${to.email}).` : 'בחרו חבר מההצעות.');
    let seq = 0;
    const one = combo({ id: 'ad-sugg-to', label: 'למי ההודעה: חיפוש חבר', listLabel: 'חברים שנמצאו', placeholder: 'שם, משפחה, אימייל או בית',
      look: async (q) => {
        to = null; showTo();
        const my = ++seq, r = await call('/api/admin/people?' + new URLSearchParams({ q }));
        if (my !== seq) return null;
        houses = r.households;
        return r.members;
      },
      row: (m) => memberRow(m, houseName),
      chosen: (m) => { to = m; one.q.value = m.he_name || m.name || m.email; showTo(); },
      short: () => { to = null; showTo(); },
      none: () => { to = null; chosenLine.replaceChildren('לא נמצא חבר.'); } });
    const pickOne = el('div', { hidden: true }, one.wrap, chosenLine);
    const forWhom = el('select', { 'aria-label': 'למי', onchange: () => { pickOne.hidden = forWhom.value !== 'one'; keepBox.hidden = !pickOne.hidden; explain(); if (!pickOne.hidden) one.q.focus(); } },
      el('option', { value: 'all' }, 'כל המשתמשים'), el('option', { value: 'one' }, 'למשתמש אחד'));
    const about = el('p', { class: 'muted small' });
    // keep in the inbox (the owner, 2026-11-14): a message to everyone also stays in each member's מהאוהל tab; unchecked, it is only the banner
    const keep = el('input', { type: 'checkbox' });
    const keepBox = el('label', { class: 'toggle', style: 'grid-column:1/-1' }, keep, 'לשמור בתיבת ההודעות (בלשונית "מהאוהל")');
    const explain = () => about.replaceChildren(forWhom.value === 'one'
      ? 'ההודעה מופיעה רק לחבר שבחרתם כשהוא פותח את האוהל, עד שהוא סוגר אותה או שהזמן עובר.'
      : `ההודעה מופיעה לכל אחד מ־${n} החברים כשהוא פותח את האוהל, עד שהוא סוגר אותה או שהזמן עובר.`);
    explain(); showTo();

    box.replaceChildren(section('messages-s', 'הודעות',
      about,
      el('form', { class: 'ad-form', onsubmit: async (e) => {
        e.preventDefault();
        const single = forWhom.value === 'one';
        if (single && !to) { toast('בחרו חבר מההצעות'); one.q.focus(); return; }
        try {
          await call('/api/admin/messages', { body: { text: text.value, level: level.value, link: link.value, days: days.value, ...(single ? { to: to.email } : { keep: keep.checked }) } });
          toast(single ? `נשלחה אל ${to.he_name || to.name || to.email}` : 'נשלחה'); messages(box);
        } catch (err) { say(err); }
      } }, el('label', { style: 'grid-column:1/-1' }, 'למי', forWhom), el('div', { style: 'grid-column:1/-1' }, pickOne),
        el('label', { style: 'grid-column:1/-1' }, 'ההודעה', text), keepBox, el('label', {}, 'סוג', level), el('label', {}, 'קישור', link), el('label', {}, 'ימים', days), el('button', { class: 'btn primary' }, 'שליחה')),
      list.length ? el('div', { class: 'ad-scroll' }, el('table', {}, el('tbody', {}, list.map((m) => el('tr', {},
        el('td', {}, m.to_email ? el('small', { class: 'muted' }, `ל: ${m.to_name || m.to_email} · `) : m.keep ? el('small', { class: 'muted' }, 'נשמרת בתיבה · ') : null, m.text), el('td', {}, LV[m.level] || m.level),
        el('td', { class: 'num' }, m.to_email ? (m.seen ? 'נקראה' : 'עוד לא') : `ראו ${m.seen}`),
        el('td', {}, m.active && m.ends_at > Date.now() ? btn('הפסקה', async () => { await call(`/api/admin/messages/${m.id}/stop`, { method: 'POST' }); messages(box); }, 'btn small ghost') : el('small', { class: 'muted' }, 'הסתיימה'))))))) : null));
  }

  /* ---------- special features for a person ---------- */
  async function features(box, email) {
    const q = email ? '?email=' + encodeURIComponent(email) : '';
    const f = await call('/api/admin/features' + q);
    let who = null;
    if (st.own) {
      const { members: list } = await call('/api/members');
      who = el('select', { 'aria-label': 'למי', onchange: (e) => features(box, e.target.value) }, list.map((m) => el('option', { value: m.email, selected: m.email === f.email }, `${m.he_name || m.name || m.email}`)));
    }
    box.replaceChildren(section('features-s', st.own ? 'תכונות מיוחדות' : `התכונות המיוחדות של ${st.as.name}`,
      el('p', { class: 'muted small' }, 'תכונות שפותחים לאדם מסוים. הרשימה תגדל כשתוסיף תכונות.'),
      who ? el('label', {}, 'למי ', who) : null,
      ...f.features.map((x) => el('div', { class: 'ad-set' }, el('b', {}, x.label),
        el('input', { type: 'checkbox', checked: x.on, 'aria-label': x.label, onchange: async (e) => { try { await call('/api/admin/features', { method: 'PUT', body: { email: f.email, feature: x.key, on: e.target.checked } }); toast(e.target.checked ? 'נפתח' : 'נסגר'); } catch (err) { say(err); } } }),
        el('p', { class: 'muted small' }, x.help)))));
  }

  /* ---------- הרשאת־על: who else may enter the room ---------- */
  async function supers(box) {
    const { supers: list, mayName } = await call('/api/admin/supers');
    const email = el('input', { type: 'email', dir: 'ltr', required: true, 'aria-label': 'כתובת', placeholder: 'כתובת Gmail של חבר' });
    box.replaceChildren(section('supers-s', 'הרשאת־על',
      el('p', { class: 'muted small' }, 'מי שמקבל הרשאת־על נכנס בדלת האחורית בזיהוי הביומטרי שלו, ויכול כל מה שאתה יכול – חוץ ממינוי הרשאות־על. אפשר לבטל בכל רגע, והכניסה שלו נסגרת מיד.'),
      list.length ? el('ul', {}, list.map((s) => el('li', {}, el('b', {}, s.he_name || s.name || s.email), ' ', el('small', { class: 'muted', dir: 'ltr' }, s.email), s.keys ? '' : el('small', { class: 'muted' }, ' · עוד אין לו מפתח גישה'),
        mayName ? btn('ביטול', async () => { await call('/api/admin/supers', { method: 'PUT', body: { email: s.email, on: false } }); supers(box); }, 'btn small ghost', `לבטל את ההרשאה של ${s.email}?`) : null))) : el('p', { class: 'muted small' }, 'עוד אין.'),
      mayName ? el('form', { class: 'ad-form', onsubmit: async (e) => { e.preventDefault(); try { await call('/api/admin/supers', { method: 'PUT', body: { email: email.value, on: true } }); toast('ניתנה הרשאת־על'); supers(box); } catch (err) { say(err); } } },
        el('label', {}, 'למי', email), el('button', { class: 'btn primary' }, 'מתן הרשאת־על')) : null));
  }

  /* ---------- what the AI costs (server/usage.ts) ---------- */
  const FEATURES = { 'research/ask': 'החוקר', 'research/word': 'פירוש מילה', 'research/translate': 'תרגום', 'research/search': 'חיפוש במקורות', 'daemon/chat': 'רַאבַּ"ע – שיחה',
    'voice/speak': 'רַאבַּ"ע – קול', 'voice/sample/:id': 'רַאבַּ"ע – דוגמת קול', 'fun/picks': 'בידור – המלצות', 'calc/solve': 'מחשבון',
    'news/verify': 'חדשות – אימות', 'news/corroborate': 'חדשות – הצלבה', 'news/summary': 'חדשות – סיכום', 'news/translate': 'חדשות – תרגום', 'news/titles': 'חדשות – כותרות',
    'recipes/import': 'מתכונים – ייבוא', 'recipes/world/open': 'מתכונים מהעולם', 'recipes/check': 'מתכונים – בדיקה' };
  async function aiCost(box, days = 30) {
    const d = await call('/api/usage?days=' + days);
    const sel = el('select', { 'aria-label': 'תקופה', onchange: (e) => aiCost(box, e.target.value) }, [7, 14, 30, 90].map((n) => el('option', { value: n, selected: n === +days }, `${n} ימים`)));
    const max = Math.max(...d.daily.map((x) => x.cost), 0.0001);
    const table = (head, rows) => el('div', { class: 'ad-scroll' }, el('table', {}, el('thead', {}, el('tr', {}, head.map((h, i) => el('th', { class: i ? 'num' : '' }, h)))), el('tbody', {}, rows)));
    box.replaceChildren(section('ai-s', 'עלויות ה־AI',
      el('div', { class: 'ad-bar' }, el('span', { class: 'muted small' }, 'כל קריאה ל־Claude ול־Gemini נרשמת: מי, מאיזה כלי ובאיזה מודל.'), el('span', { class: 'spacer' }), sel),
      el('div', { class: 'ad-tiles' },
        el('div', { class: 'ad-tile' }, el('small', {}, `סך הכול, ${d.days} ימים`), el('b', {}, usd(d.total.cost))),
        el('div', { class: 'ad-tile' }, el('small', {}, 'קריאות'), el('b', {}, d.total.calls.toLocaleString('he-IL'))),
        el('div', { class: 'ad-tile' }, el('small', {}, 'לחודש, בקצב הזה'), el('b', {}, usd(d.total.perMonth || 0)))),
      d.daily.length ? el('div', { class: 'ad-bars', role: 'img', 'aria-label': 'עלות לפי יום' }, d.daily.map((x) => el('i', { style: `block-size:${Math.max(3, (x.cost / max) * 100)}%`, title: `${x.key}: ${usd(x.cost)}` }))) : null,
      el('h3', {}, 'לפי אדם'), table(['מי', 'קריאות', 'עלות'], d.users.map((u) => el('tr', {}, el('td', {}, u.name), el('td', { class: 'num' }, u.calls), el('td', { class: 'num' }, usd(u.cost))))),
      el('h3', {}, 'לפי כלי'), table(['כלי', 'קריאות', 'עלות'], d.features.map((f) => el('tr', {}, el('td', {}, FEATURES[f.key] || f.key), el('td', { class: 'num' }, f.calls), el('td', { class: 'num' }, usd(f.cost))))),
      el('h3', {}, 'לפי מודל'), table(['מודל', 'קריאות', 'עלות'], d.models.map((m) => el('tr', {}, el('td', { dir: 'ltr' }, m.key + (m.unpriced ? ' (אין מחיר)' : '')), el('td', { class: 'num' }, m.calls), el('td', { class: 'num' }, usd(m.cost)))))));
  }

  /* ---------- the room's own log ---------- */
  async function log(box) {
    const { log: list } = await call('/api/admin/audit');
    const ACT = { gift: 'נתן מתנה', 'stay:on': 'השאיר פתוח לעבודה', 'stay:off': 'ביטל השארה פתוחה', 'ai:limited': 'הגביל AI', 'ai:family': 'פתח AI בלי הגבלה', enter: 'נכנס', setting: 'שינה הגדרה', 'ledger:add': 'רשם', 'ledger:edit': 'ערך רישום', 'ledger:delete': 'מחק רישום', message: 'שלח הודעה', 'message:stop': 'עצר הודעה',
      'feature:on': 'פתח תכונה', 'feature:off': 'סגר תכונה', 'super:add': 'נתן הרשאת־על', 'super:remove': 'ביטל הרשאת־על', invite: 'הזמין מבחוץ', 'invite:cancel': 'ביטל הזמנה' };
    box.replaceChildren(section('log-s', 'יומן הדלת',
      list.length ? el('div', { class: 'ad-scroll' }, el('table', {}, el('tbody', {}, list.map((r) => el('tr', {},
        el('td', { class: 'num' }, day(r.at)), el('td', {}, ACT[r.action] || r.action), el('td', {}, r.detail || ''),
        el('td', { dir: 'ltr', class: 'muted small' }, r.by_email === r.as_email ? r.by_email : `${r.by_email} @ ${r.as_email}`)))))) : el('p', { class: 'muted small' }, 'עוד ריק.')));
  }

  open();
})();
