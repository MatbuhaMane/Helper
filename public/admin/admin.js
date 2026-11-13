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
  function gate() {
    if (st) st.open = false;
    root.classList.remove('bd');
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
    const top = { dash: el('div', { class: 'bd-part', id: 'dash' }) };
    let dashP;
    if (st.own) { top.usage = el('div', { class: 'bd-part', 'data-part': 'usage' }); top.inbox = el('div', { class: 'bd-part', 'data-part': 'inbox' }); }
    const board = el('section', { class: 'bd-dash', 'aria-label': 'לוח' }, ...Object.values(top));
    /* below it, every other part as an app tile (design's class contract, like the tools rack); a tap opens it */
    const APPS = st.own
      ? [['messages', 'הודעות', messages], ['credits', 'כסף', async (box) => { const d = await dashP; if (d?.money) money(box, d.money); }], ...(st.level === 'owner' ? [['gifts', 'מתנות קרדיט', gifts]] : []), ['settings', 'הגדרות האפליקציה', settings],
         ['members', 'חברים', members], ['features', 'תכונות מיוחדות', features], ['permissions', 'הרשאת־על', supers], ['ai', 'עלויות AI', aiCost], ['log', 'יומן', log]]
      : [['features', `התכונות של ${st.as.name}`, features]];
    const FALLBACK = { messages: 'mail', credits: 'calc', gifts: 'smile', members: 'family', features: 'tools', permissions: 'unlocked', ai: 'lens', log: 'note' };
    const tint = ['var(--vine);--c2:var(--olive)', 'var(--olive);--c2:var(--soil)', 'var(--soil);--c2:var(--vine)'];
    const ic = (id) => { const s = H.icon(id); return s.innerHTML ? s : H.icon(FALLBACK[id] || 'tools'); };   // design's own icon once it is in
    const panels = {}, loaded = new Set();
    const tiles = APPS.map(([id, name, load], i) => {
      panels[id] = el('section', { class: 'bd-panel', id, hidden: true, 'aria-label': name });
      return el('a', { class: 'app', href: '#' + id, 'data-bd': id, style: `--c1:${tint[i % 3]};--n:${i}`, 'aria-controls': id },
        el('span', { class: 'ic' }, ic(id)), el('span', { class: 'name' }, name));
    });
    const loaders = Object.fromEntries(APPS.map(([id, , load]) => [id, load]));
    /** one part open at a time, loaded the first time it opens; the address keeps it (#members) for a reload or the back button */
    const show = (id, scroll) => {
      for (const [k, p] of Object.entries(panels)) p.hidden = k !== id;
      for (const t of tiles) t.toggleAttribute('aria-current', t.dataset.bd === id);
      if (!panels[id]) return;
      if (!loaded.has(id)) { loaded.add(id); loaders[id](panels[id]); }
      if (scroll) panels[id].scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    for (const t of tiles) t.addEventListener('click', (e) => {
      e.preventDefault();
      const id = t.dataset.bd, again = location.hash === '#' + id && !panels[id].hidden;   // a second tap closes it
      history.replaceState(null, '', again ? location.pathname : '#' + id);
      show(again ? '' : id, !again);
    });
    root.classList.add('bd');   // the page's own <main> is design's main.bd
    root.replaceChildren(
      el('header', { class: 'bd-head' }, el('h1', {}, 'הדלת האחורית'), bar),
      board,
      el('nav', { class: 'apps-grid bd-apps', 'aria-label': 'כלי הבעלים' }, tiles),
      ...Object.values(panels));
    dashP = dash(top.dash);
    if (st.own) { usage(top.usage); inbox(top.inbox); }
    show(location.hash.slice(1), !!location.hash);
  }

  /* ---------- the family's feedback (a button anywhere, or through the companion) ---------- */
  async function inbox(box) {
    let d;
    try { d = await call('/api/admin/feedback'); } catch (e) { return box.replaceChildren(el('p', { class: 'card' }, ERR[e.code] || e.message)); }
    const when = (t) => new Date(t).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const mark = async (f, patch) => { try { await call(`/api/admin/feedback/${f.id}`, { method: 'PUT', body: patch }); inbox(box); } catch (e) { toast(ERR[e.code] || e.message); } };
    box.replaceChildren(section('inbox-s', d.unread ? `פניות · ${d.unread} חדשות` : 'פניות',
      d.feedback.length ? el('ul', { class: 'ad-inbox', style: 'list-style:none;margin:0;padding:0;display:grid;gap:10px' }, d.feedback.map((f) => el('li', {
        class: 'card' + (f.read_at ? '' : ' unread'), style: 'display:grid;gap:6px;' + (f.done ? 'opacity:.6' : f.read_at ? '' : 'border-inline-start:4px solid var(--primary)') },
        el('div', { class: 'small muted' }, `${f.name || f.email} · ${when(f.at)}${f.page ? ' · ' + f.page : ''}${f.via === 'companion' ? ' · דרך העוזר' : ''}`),
        el('p', { dir: 'auto', style: 'margin:0;white-space:pre-wrap' }, f.text),
        el('div', { class: 'row' },
          el('button', { class: 'btn small ghost', type: 'button', onclick: () => mark(f, { read: !f.read_at }) }, f.read_at ? 'סימון כלא נקראה' : 'נקראה'),
          el('button', { class: 'btn small ghost', type: 'button', onclick: () => mark(f, { done: !f.done, read: true }) }, f.done ? 'החזרה לפתוחות' : 'טופלה')))))
        : el('p', { class: 'muted' }, 'עוד אין פניות. כפתור "משוב לבעלים של האוהל" נמצא בהגדרות, ואפשר גם לבקש מהעוזר להעביר.')));
  }

  /* ---------- usage: who comes in, and which tools (never what is in them) ---------- */
  async function usage(box) {
    let d;
    try { d = await call('/api/admin/usage'); } catch (e) { return box.replaceChildren(el('p', { class: 'card' }, ERR[e.code] || e.message)); }
    const ago = (t) => (!t ? 'עוד לא' : H.timeAgo ? H.timeAgo(t) : new Date(t).toLocaleDateString('he-IL'));
    const most = Math.max(1, ...d.tools.map((t) => t.people));
    box.replaceChildren(section('usage-s', 'שימוש',
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
        : el('p', { class: 'muted' }, 'עוד אין ביקורים בכלים.')));
  }

  /* ---------- the dashboard, and the money ---------- */
  async function dash(box) {
    let d;
    try { d = await call('/api/admin/overview'); } catch (e) { return box.replaceChildren(el('p', { class: 'card' }, ERR[e.code] || e.message)); }
    const s = d.stats, m = d.money;
    const tile = (label, value, cls = '') => el('div', { class: 'ad-tile ' + cls }, el('small', {}, label), el('b', {}, value));
    const mb = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : (n / 1e6).toFixed(1) + ' MB');
    box.replaceChildren(el('section', { class: 'card' },
      el('h2', {}, st.own ? 'לוח' : 'מצב האוהל'),
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

  /* ---------- members (who may sign in, and to which household) ---------- */
  async function members(box) {
    const [{ members: list }, { allowances: ai }] = await Promise.all([call('/api/members'), call('/api/admin/allowances')]);
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
    const email = el('input', { type: 'email', required: true, dir: 'ltr', placeholder: 'כתובת Gmail', 'aria-label': 'כתובת Gmail' });
    const he = el('input', { type: 'text', placeholder: 'שם בעברית', 'aria-label': 'השם בעברית' });
    const house = el('input', { type: 'text', value: 'family', dir: 'ltr', 'aria-label': 'משק הבית' });
    box.replaceChildren(section('members-s', 'חברים',
      el('p', { class: 'muted small' }, 'רק מי שברשימה יכול להתחבר. משק הבית קובע עם מי חולקים רשימת קניות, מתכונים, לוח שנה ועץ משפחה.'),
      el('div', { class: 'ad-scroll' }, el('table', {}, el('thead', {}, el('tr', {}, ['שם', 'אימייל', 'בית', 'תפקיד', 'שנת לידה', 'AI', ''].map((h) => el('th', {}, h)))),
        el('tbody', {}, list.map((m) => el('tr', {},
          el('td', {}, el('input', { type: 'text', value: m.he_name || '', placeholder: m.name || '', 'aria-label': 'השם בעברית של ' + (m.name || m.email), style: 'inline-size:9em',
            onchange: async (e) => { try { await call('/api/members/' + encodeURIComponent(m.email) + '/name', { method: 'PUT', body: { he_name: e.target.value } }); toast('נשמר'); } catch (err) { say(err); } } })),
          el('td', { dir: 'ltr' }, m.email), el('td', { dir: 'ltr' }, m.household), el('td', {}, m.role === 'owner' ? 'מנהל' : 'חבר', firstSignIn(m)), yearCell(m), aiCell(m),
          el('td', {}, m.email === st.as.email ? '' : btn('✕', async () => { await call('/api/members/' + encodeURIComponent(m.email), { method: 'DELETE' }); members(box); }, 'btn small ghost', `להסיר את ${m.email}?`))))))),
      el('form', { class: 'ad-form', onsubmit: async (e) => {
        e.preventDefault();
        try { await call('/api/members', { body: { email: email.value, he_name: he.value, household: house.value } }); toast(`${email.value} נוסף`); members(box); } catch (err) { say(err); }
      } }, el('label', {}, 'אימייל', email), el('label', {}, 'שם בעברית', he), el('label', {}, 'משק בית', house), el('button', { class: 'btn primary' }, 'הוספה'))));
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

  /* ---------- messages to everyone ---------- */
  async function messages(box) {
    const { messages: list, members: n } = await call('/api/admin/messages');
    const text = el('textarea', { rows: 2, maxlength: 500, required: true, 'aria-label': 'ההודעה', placeholder: 'למשל: מחר בערב מפגש אצל סבתא – מי שעוד לא ענה, ענו בקישור!' });
    const level = el('select', { 'aria-label': 'סוג' }, [['info', 'רגילה'], ['party', 'חגיגית 🎉'], ['warn', 'חשובה ⚠️']].map(([v, t]) => el('option', { value: v }, t)));
    const link = el('input', { type: 'text', dir: 'ltr', 'aria-label': 'קישור (לא חובה)', placeholder: '/gather/' });
    const days = el('input', { type: 'number', min: 1, max: 60, value: 7, 'aria-label': 'כמה ימים', style: 'inline-size:5em' });
    const LV = { info: 'רגילה', party: 'חגיגית', warn: 'חשובה' };
    box.replaceChildren(section('messages-s', 'הודעה לכל המשתמשים',
      el('p', { class: 'muted small' }, `ההודעה מופיעה לכל אחד מ־${n} החברים כשהוא פותח את האוהל, עד שהוא סוגר אותה או שהזמן עובר.`),
      el('form', { class: 'ad-form', onsubmit: async (e) => {
        e.preventDefault();
        try { await call('/api/admin/messages', { body: { text: text.value, level: level.value, link: link.value, days: days.value } }); toast('נשלחה'); messages(box); } catch (err) { say(err); }
      } }, el('label', { style: 'grid-column:1/-1' }, 'ההודעה', text), el('label', {}, 'סוג', level), el('label', {}, 'קישור', link), el('label', {}, 'ימים', days), el('button', { class: 'btn primary' }, 'שליחה')),
      list.length ? el('div', { class: 'ad-scroll' }, el('table', {}, el('tbody', {}, list.map((m) => el('tr', {},
        el('td', {}, m.text), el('td', {}, LV[m.level] || m.level), el('td', { class: 'num' }, `ראו ${m.seen}`),
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
      'feature:on': 'פתח תכונה', 'feature:off': 'סגר תכונה', 'super:add': 'נתן הרשאת־על', 'super:remove': 'ביטל הרשאת־על' };
    box.replaceChildren(section('log-s', 'יומן הדלת',
      list.length ? el('div', { class: 'ad-scroll' }, el('table', {}, el('tbody', {}, list.map((r) => el('tr', {},
        el('td', { class: 'num' }, day(r.at)), el('td', {}, ACT[r.action] || r.action), el('td', {}, r.detail || ''),
        el('td', { dir: 'ltr', class: 'muted small' }, r.by_email === r.as_email ? r.by_email : `${r.by_email} @ ${r.as_email}`)))))) : el('p', { class: 'muted small' }, 'עוד ריק.')));
  }

  open();
})();
