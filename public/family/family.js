/* ניהול משפחה – the family vault: a family tree, and for each person a panel of documents, pictures and details.
 * Everything here is fetched only while the vault is unlocked (a passkey, or a fresh Google sign-in) and only into memory:
 * files are shown from blob URLs that are revoked when the panel closes or the vault locks; nothing is cached.
 * Access rules live on the server (server/vault) – this page only shows what the server agreed to give. */
(() => {
  'use strict';
  const { el, api, toast } = H;
  H.header('ניהול משפחה');
  const root = document.querySelector('main');
  const blobs = new Set();                  // every object URL made here, revoked on lock
  let S = { people: [], me: '', until: 0 };
  let lockTimer = 0, tickTimer = 0, hiddenAt = 0;

  const ERR = {
    vault_locked: 'הכספת ננעלה', too_many_tries: 'יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.', file_type_not_allowed: 'סוג הקובץ לא נתמך: PDF, תמונות, Word, Excel או טקסט.',
    file_too_large: 'הקובץ גדול מ־25MB.', sign_in_again: 'צריך להיכנס שוב עם Google.', no_passkey: 'עוד אין מפתח גישה במכשיר הזה.', name_required: 'צריך שם.',
    vault_not_configured: 'הכספת עוד לא הוגדרה בשרת (VAULT_KEY).', passkey_not_verified: 'המכשיר לא אישר את זהותך.', passkey_bad_signature: 'המפתח לא אושר.',
    passkey_algorithm_not_supported: 'המכשיר הזה לא תומך בסוג המפתח.', challenge_expired: 'עבר יותר מדי זמן. נסו שוב.',
  };
  const say = (e) => toast(ERR[e?.code] || e?.message || 'משהו השתבש');
  const call = async (path, opts = {}) => {
    try { return await api(path, { ...opts, noRedirect: true }); } catch (e) { if (e.code === 'vault_locked') { lockView('הכספת ננעלה. פתחו אותה שוב.'); } throw e; }
  };

  /* ---------- passkeys (WebAuthn) ---------- */
  const toBuf = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)).buffer;
  const toB64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const passkeysWork = () => !!window.PublicKeyCredential && !!navigator.credentials;

  async function addPasskey() {
    const o = await call('/api/vault/passkeys/options', { method: 'POST' });
    const pk = o.publicKey;
    const cred = await navigator.credentials.create({ publicKey: {
      ...pk, challenge: toBuf(pk.challenge), user: { ...pk.user, id: toBuf(pk.user.id) },
      excludeCredentials: pk.excludeCredentials.map((c) => ({ ...c, id: toBuf(c.id) })),
    } });
    const label = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Windows/.test(navigator.userAgent) ? 'Windows' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'מכשיר';
    await call('/api/vault/passkeys', { body: { challengeId: o.challengeId, label, response: { clientDataJSON: toB64(cred.response.clientDataJSON), attestationObject: toB64(cred.response.attestationObject) } } });
  }
  async function unlockWithPasskey() {
    const o = await call('/api/vault/unlock/options', { method: 'POST' });
    const pk = o.publicKey;
    const a = await navigator.credentials.get({ publicKey: { ...pk, challenge: toBuf(pk.challenge), allowCredentials: pk.allowCredentials.map((c) => ({ ...c, id: toBuf(c.id) })) } });
    await call('/api/vault/unlock', { body: { challengeId: o.challengeId, id: toB64(a.rawId), response: {
      clientDataJSON: toB64(a.response.clientDataJSON), authenticatorData: toB64(a.response.authenticatorData), signature: toB64(a.response.signature) } } });
  }
  const reauth = () => { location.href = '/api/auth/login?reauth=1&next=' + encodeURIComponent('/family/?fresh=1'); };

  /* ---------- locked ---------- */
  function wipe() {
    for (const u of blobs) URL.revokeObjectURL(u);
    blobs.clear();
    if (H.sheet?.isOpen) H.sheet.close();
    H.closeModal?.();
    clearTimeout(lockTimer); clearInterval(tickTimer);
    S = { people: [], me: '', until: 0 };
  }
  function lockView(note) {
    wipe();
    root.replaceChildren(el('section', { class: 'fv-lock card' },
      el('span', { class: 'fv-lock-ic', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15.5" r="1.4"/></svg>' }),
      el('h1', {}, 'הכספת המשפחתית'),
      el('p', { class: 'muted' }, note || 'המסמכים, התמונות והפרטים של המשפחה שמורים כאן מוצפנים. כדי לפתוח צריך לאשר שזה אתה.'),
      el('div', { class: 'fv-lock-acts' }), el('p', { class: 'fv-lock-foot muted' }, 'הכספת ננעלת לבד אחרי רבע שעה בלי פעולה.')));
    status().catch(say);
  }
  async function status() {
    const st = await call('/api/vault/status');
    const acts = root.querySelector('.fv-lock-acts');
    if (!acts) return st;
    acts.replaceChildren();
    if (!st.configured) { acts.append(el('p', {}, ERR.vault_not_configured)); return st; }
    if (st.unlocked) { open(); return st; }
    const fresh = new URLSearchParams(location.search).has('fresh');
    if (fresh) history.replaceState(null, '', '/family/');
    if (st.passkeys && passkeysWork()) {
      acts.append(el('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await unlockWithPasskey(); open(); } catch (err) { if (err?.name !== 'NotAllowedError') say(err); e.target.disabled = false; } } },
        'פתיחה בטביעת אצבע, בפנים או ב־Windows Hello'));
    }
    if (st.fresh && fresh) {
      // just back from signing in to Google again: that opens the vault – and is the moment to add a passkey on this device
      try { await call('/api/vault/unlock/fresh', { method: 'POST' }); } catch (e) { say(e); return st; }
      if (passkeysWork()) return offerPasskey(st.passkeys);
      return open();
    }
    acts.append(el('button', { class: 'btn' + (st.passkeys ? ' ghost' : ' primary'), onclick: reauth }, 'כניסה מחדש עם Google'));
    if (!st.passkeys) acts.append(el('p', { class: 'muted small' }, 'אחרי הכניסה אפשר להגדיר מפתח גישה למכשיר הזה, ומאז לפתוח בטביעת אצבע.'));
    return st;
  }
  function offerPasskey(had) {
    const acts = root.querySelector('.fv-lock-acts');
    acts.replaceChildren(
      el('p', {}, had ? 'אפשר להוסיף גם את המכשיר הזה.' : 'כדי לפתוח בפעם הבאה בלי להיכנס שוב, הגדירו מפתח גישה: טביעת אצבע, פנים, או Windows Hello.'),
      el('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { await addPasskey(); toast('המפתח נשמר'); open(); } catch (err) { if (err?.name !== 'NotAllowedError') say(err); e.target.disabled = false; } } }, 'הגדרת מפתח גישה'),
      el('button', { class: 'btn ghost', onclick: () => open() }, 'לא עכשיו'));
  }

  /* ---------- open: the tree ---------- */
  async function open() {
    const [t, st] = await Promise.all([call('/api/vault/tree'), call('/api/vault/status')]);
    S.people = t.people; S.me = t.me; S.until = st.until;
    schedule();
    const clock = el('span', { class: 'fv-clock muted' });
    const bar = el('div', { class: 'fv-bar' },
      el('h1', {}, 'אילן היוחסין'),
      el('span', { class: 'spacer' }),
      clock,
      el('button', { class: 'btn small', onclick: () => personForm() }, '+ בן משפחה'),
      el('button', { class: 'btn small ghost', onclick: activity }, 'יומן פעילות'),
      el('button', { class: 'btn small ghost', onclick: keys }, 'מפתחות גישה'),
      el('button', { class: 'btn small ghost fv-lockbtn', onclick: () => lockNow() }, 'נעילה'));
    const board = el('div', { class: 'fv-tree' });
    root.replaceChildren(el('section', { class: 'fv' }, bar, board));
    tickTimer = setInterval(() => { const s = Math.max(0, Math.round((S.until - Date.now()) / 1000)); clock.textContent = `ננעלת בעוד ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
    drawTree(board);
  }
  function schedule() {
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => lockView('הכספת ננעלה אחרי רבע שעה בלי פעולה.'), Math.max(0, S.until - Date.now()));
  }
  /** each action on the server extends the unlock; the page keeps its own clock in step */
  const touched = () => { S.until = Math.min(Date.now() + 15 * 60e3, S.until + 15 * 60e3); schedule(); };
  async function lockNow() { await call('/api/vault/lock', { method: 'POST' }).catch(() => {}); lockView('הכספת נעולה.'); }

  /** generations from the parent links (partners share a row) */
  function generations() {
    const by = new Map(S.people.map((p) => [p.id, p]));
    const lvl = new Map();
    const level = (p, seen = new Set()) => {
      if (lvl.has(p.id)) return lvl.get(p.id);
      if (seen.has(p.id)) return 0;
      seen.add(p.id);
      const ps = [p.parent1, p.parent2].map((id) => by.get(id)).filter(Boolean);
      const v = ps.length ? Math.max(...ps.map((q) => level(q, seen))) + 1 : 0;
      lvl.set(p.id, v);
      return v;
    };
    S.people.forEach((p) => level(p));
    for (let i = 0; i < 3; i++) for (const p of S.people) { const q = by.get(p.partner); if (q) { const m = Math.max(lvl.get(p.id), lvl.get(q.id)); lvl.set(p.id, m); lvl.set(q.id, m); } }
    const rows = [];
    for (const p of S.people) (rows[lvl.get(p.id)] ||= []).push(p);
    // partners side by side; children near their parents (the order of the row above)
    return rows.filter(Boolean).map((row, i, all) => {
      const above = (all[i - 1] || []).map((p) => p.id);
      const key = (p) => { const k = [p.parent1, p.parent2].map((id) => above.indexOf(id)).filter((x) => x >= 0); return k.length ? Math.min(...k) : 99; };
      row.sort((a, b) => key(a) - key(b));
      const out = [];
      for (const p of row) { if (out.includes(p)) continue; out.push(p); const q = row.find((x) => x.id === p.partner); if (q && !out.includes(q)) out.push(q); }
      return out;
    });
  }
  function drawTree(board) {
    if (!S.people.length) {
      board.replaceChildren(el('div', { class: 'fv-empty card' }, el('h2', {}, 'האילן עוד ריק'), el('p', { class: 'muted' }, 'התחילו מעצמכם, ואז הוסיפו הורים, בני זוג וילדים. לכל אחד תהיה חלונית משלו למסמכים, לתמונות ולפרטים.'),
        el('button', { class: 'btn primary', onclick: () => personForm() }, '+ בן המשפחה הראשון')));
      return;
    }
    const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    lines.setAttribute('class', 'fv-lines'); lines.setAttribute('aria-hidden', 'true');
    const rows = generations().map((row) => el('div', { class: 'fv-row' }, row.map(card)));
    board.replaceChildren(lines, ...rows);
    requestAnimationFrame(() => connect(board, lines));
    if (!board.dataset.watch) { board.dataset.watch = '1'; new ResizeObserver(() => connect(board, lines)).observe(board); }
  }
  function card(p) {
    const n = p.counts || {};
    const pic = el('span', { class: 'fv-pic', 'aria-hidden': 'true' }, initials(p.name));
    if (p.photo) photoInto(p.photo, pic);
    return el('button', { class: 'fv-card', 'data-id': p.id, onclick: () => panel(p.id) },
      pic, el('b', {}, p.name),
      el('small', { class: 'muted' }, [n.doc ? `${n.doc} מסמכים` : '', n.photo ? `${n.photo} תמונות` : ''].filter(Boolean).join(' · ') || 'ריק עדיין'));
  }
  const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
  async function blobUrl(id) {
    const r = await fetch(`/api/vault/items/${encodeURIComponent(id)}/file`, { cache: 'no-store' });
    if (r.status === 423) { lockView('הכספת ננעלה. פתחו אותה שוב.'); throw new Error('locked'); }
    if (!r.ok) throw new Error('file');
    touched();
    const u = URL.createObjectURL(await r.blob());
    blobs.add(u);
    return u;
  }
  async function photoInto(id, node) {
    try { const u = await blobUrl(id); node.replaceChildren(el('img', { src: u, alt: '' })); } catch (_) { /* initials stay */ }
  }
  /** the lines of the tree: parents to children, partners to each other */
  function connect(board, svg) {
    const b = board.getBoundingClientRect();
    svg.setAttribute('width', b.width); svg.setAttribute('height', b.height);
    const box = (id) => { const c = board.querySelector(`[data-id="${CSS.escape(id)}"]`); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left - b.left + r.width / 2, top: r.top - b.top, bottom: r.bottom - b.top, l: r.left - b.left, r: r.right - b.left, mid: r.top - b.top + r.height / 2 }; };
    let d = '';
    const done = new Set();
    for (const p of S.people) {
      const a = box(p.id), q = p.partner && box(p.partner);
      if (a && q && !done.has(p.partner)) { done.add(p.id); const [x1, x2] = a.x < q.x ? [a.r, q.l] : [q.r, a.l]; d += `M${x1},${a.mid} H${x2} `; }
      const ps = [p.parent1, p.parent2].map((id) => id && box(id)).filter(Boolean);
      if (a && ps.length) {
        const from = ps.length === 2 ? (ps[0].x + ps[1].x) / 2 : ps[0].x, y0 = Math.max(...ps.map((x) => x.bottom)), ym = (y0 + a.top) / 2;
        d += `M${from},${ps.length === 2 ? ps[0].mid : y0} V${ym} H${a.x} V${a.top} `;
      }
    }
    svg.innerHTML = `<path d="${d}"/>`;
  }

  /* ---------- adding or editing a person ---------- */
  function personForm(p) {
    const name = el('input', { type: 'text', value: p?.name || '', maxlength: 80, required: true, 'aria-label': 'שם', placeholder: 'שם מלא' });
    const opts = (sel) => [el('option', { value: '' }, '—'), ...S.people.filter((x) => x.id !== p?.id).map((x) => el('option', { value: x.id, selected: x.id === sel }, x.name))];
    const p1 = el('select', { 'aria-label': 'הורה' }, opts(p?.parent1)), p2 = el('select', { 'aria-label': 'הורה נוסף' }, opts(p?.parent2)), pa = el('select', { 'aria-label': 'בן או בת זוג' }, opts(p?.partner));
    const member = el('input', { type: 'email', value: p?.member || '', dir: 'ltr', placeholder: 'כתובת Gmail (אם הוא משתמש בעוזר)', 'aria-label': 'כתובת Gmail' });
    const save = async (e) => {
      e.preventDefault();
      try {
        const r = await call(p ? `/api/vault/people/${p.id}` : '/api/vault/people', { method: p ? 'PUT' : 'POST', body: { name: name.value, parent1: p1.value || null, parent2: p2.value || null, partner: pa.value || null, member: member.value || null, details: p?.details } });
        H.closeModal(); touched(); await open(); if (p) panel(r.id);
      } catch (err) { say(err); }
    };
    H.modal(el('form', { class: 'fv-form', onsubmit: save },
      el('h2', {}, p ? 'עריכת ' + p.name : 'בן משפחה חדש'),
      el('label', {}, 'שם', name),
      el('div', { class: 'fv-two' }, el('label', {}, 'הורה', p1), el('label', {}, 'הורה נוסף', p2)),
      el('label', {}, 'בן או בת זוג', pa),
      el('label', {}, 'משתמש בעוזר', member),
      el('div', { class: 'fv-acts' }, el('button', { class: 'btn primary' }, 'שמירה'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'ביטול'))));
    setTimeout(() => name.focus(), 50);
  }

  /* ---------- a person's panel ---------- */
  const TABS = [['doc', 'מסמכים'], ['photo', 'תמונות'], ['info', 'מידע']];
  async function panel(id, tab = 'doc') {
    let p, list;
    try { [p, list] = await Promise.all([call(`/api/vault/people/${id}`), call(`/api/vault/people/${id}/items`)]); } catch (e) { return say(e); }
    touched();
    const panelBlobs = new Set();
    const body = el('div', { class: 'fv-panel' });
    const draw = (t) => {
      tab = t;
      const items = list.items.filter((x) => x.kind === t);
      body.replaceChildren(...[
        el('header', { class: 'fv-ph' }, el('span', { class: 'fv-pic big', 'aria-hidden': 'true' }, initials(p.name)), el('div', {}, el('h2', {}, p.name), p.member ? el('small', { class: 'muted', dir: 'ltr' }, p.member) : null),
          el('span', { class: 'spacer' }), el('button', { class: 'btn small ghost', onclick: () => personForm(p) }, 'עריכה')),
        el('nav', { class: 'fv-tabs', role: 'tablist' }, TABS.map(([k, label]) => el('button', { role: 'tab', 'aria-selected': String(k === t), class: k === t ? 'on' : '', onclick: () => draw(k) }, label, el('small', {}, String(list.items.filter((x) => x.kind === k).length))))),
        adder(t),
        t === 'photo' ? el('div', { class: 'fv-photos' }, items.map(photoTile)) : el('ul', { class: 'fv-list' }, items.map(row)),
        items.length ? null : el('p', { class: 'muted fv-none' }, t === 'doc' ? 'אין מסמכים עדיין.' : t === 'photo' ? 'אין תמונות עדיין.' : 'אין פרטים עדיין.'),
        el('button', { class: 'btn small ghost fv-trash', onclick: () => trash(p) }, 'סל המחזור (30 יום)')].filter(Boolean));   // (null would print as text)
      const pic = body.querySelector('.fv-ph .fv-pic');
      if (p.photo) photoInto(p.photo, pic);
    };
    const reload = async () => { list = await call(`/api/vault/people/${id}/items`); touched(); draw(tab); };

    function adder(t) {
      const title = el('input', { type: 'text', maxlength: 160, placeholder: t === 'info' ? 'נושא (למשל: קופת חולים, מידות, אלרגיות)' : 'שם (לא חובה)', 'aria-label': 'שם' });
      const note = t === 'info' ? el('textarea', { rows: 3, maxlength: 4000, placeholder: 'הפרטים', 'aria-label': 'הפרטים' }) : null;
      const file = t === 'info' ? null : el('input', { type: 'file', 'aria-label': 'קובץ', accept: t === 'photo' ? 'image/*' : '.pdf,image/*,.doc,.docx,.xlsx,.txt', multiple: t === 'photo' });
      const priv = el('input', { type: 'checkbox', 'aria-label': 'פרטי' });
      const go = async (e) => {
        e.preventDefault();
        const files = file ? [...file.files] : [null];
        if (file && !files.length) return toast('בחרו קובץ');
        if (t === 'info' && !title.value.trim()) return toast('כתבו נושא');
        const btn = e.target.querySelector('button'); btn.disabled = true;
        try {
          for (const f of files) {
            const fd = new FormData();
            fd.append('person', p.id); fd.append('kind', t); fd.append('title', title.value); fd.append('private', priv.checked ? '1' : '0');
            if (note) fd.append('note', note.value);
            if (f) fd.append('file', f);
            const r = await fetch('/api/vault/items', { method: 'POST', body: fd });
            if (r.status === 423) return lockView('הכספת ננעלה. פתחו אותה שוב.');
            if (!r.ok) { const d = await r.json().catch(() => ({})); throw Object.assign(new Error(d.error), { code: d.error }); }
          }
          toast('נשמר בכספת'); await reload(); await refreshTree();
        } catch (err) { say(err); } finally { btn.disabled = false; }
      };
      return el('form', { class: 'fv-add', onsubmit: go }, title, note, file,
        el('label', { class: 'fv-priv' }, priv, ' פרטי – רק אני רואה'), el('button', { class: 'btn small primary' }, t === 'info' ? 'הוספה' : 'העלאה'));
    }
    const who = (email) => (email === S.me ? 'אני' : email.split('@')[0]);
    const when = (t) => new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
    function actions(it) {
      return el('div', { class: 'fv-acts-row' },
        it.kind !== 'info' ? el('button', { class: 'btn small', onclick: () => show(it) }, 'פתיחה') : null,
        it.kind !== 'info' ? el('button', { class: 'btn small ghost', onclick: () => save(it) }, 'הורדה') : null,
        el('button', { class: 'btn small ghost', onclick: () => rename(it) }, 'עריכה'),
        it.mine ? el('button', { class: 'btn small ghost', onclick: () => setPrivate(it, !it.private) }, it.private ? 'שיתוף עם המשפחה' : 'הפיכה לפרטי') : null,
        it.kind === 'photo' && !it.private ? el('button', { class: 'btn small ghost', onclick: () => asProfile(it) }, 'תמונת האילן') : null,
        el('button', { class: 'btn small ghost danger', onclick: () => remove(it) }, 'מחיקה'));
    }
    function row(it) {
      return el('li', { class: 'fv-item' },
        el('div', { class: 'fv-item-head' }, it.private ? el('span', { class: 'fv-lockbadge', title: 'פרטי' }, '🔒') : null, el('b', {}, it.title || 'ללא שם'),
          el('small', { class: 'muted' }, `${who(it.by)} · ${when(it.created)}${it.size ? ' · ' + Math.max(1, Math.round(it.size / 1024)) + 'KB' : ''}`)),
        it.note ? el('p', { class: 'fv-note' }, it.note) : null, actions(it));
    }
    function photoTile(it) {
      // a picture: tap to see it large; its actions in a small menu (a narrow tile has no room for a row of buttons)
      const more = el('button', { class: 'btn small ghost fv-more', 'aria-label': 'פעולות', title: 'פעולות', onclick: () => H.modal(el('div', { class: 'fv-form' }, el('h2', {}, it.title || 'תמונה'), actions(it))) }, '⋯');
      const fig = el('figure', { class: 'fv-photo' }, el('span', { class: 'fv-ph-wait' }), el('figcaption', {}, el('span', {}, it.private ? '🔒 ' : '', it.title || ''), more));
      blobUrl(it.id).then((u) => { panelBlobs.add(u); fig.firstChild.replaceWith(el('img', { src: u, alt: it.title || 'תמונה', onclick: () => show(it, u) })); }).catch(() => {});
      return fig;
    }
    async function show(it, known) {
      try {
        const u = known || await blobUrl(it.id);
        panelBlobs.add(u);
        if (it.mime?.startsWith('image/')) H.modal(el('img', { class: 'fv-full', src: u, alt: it.title || '' }));
        else if (it.mime === 'application/pdf' || it.mime === 'text/plain') window.open(u, '_blank', 'noopener');
        else save(it, u);
      } catch (e) { if (e.message !== 'locked') toast('לא הצלחתי לפתוח'); }
    }
    async function save(it, known) {
      try { const u = known || await blobUrl(it.id); panelBlobs.add(u); const a = el('a', { href: u, download: it.title || 'מסמך' }); document.body.append(a); a.click(); a.remove(); }
      catch (e) { if (e.message !== 'locked') toast('לא הצלחתי להוריד'); }
    }
    function rename(it) {
      const title = el('input', { type: 'text', value: it.title || '', maxlength: 160, 'aria-label': 'שם' });
      const note = el('textarea', { rows: 4, maxlength: 4000, 'aria-label': 'הערה' }, it.note || '');
      H.modal(el('form', { class: 'fv-form', onsubmit: async (e) => { e.preventDefault(); try { await call(`/api/vault/items/${it.id}`, { method: 'PUT', body: { title: title.value, note: note.value } }); H.closeModal(); reload(); } catch (err) { say(err); } } },
        el('h2', {}, 'עריכה'), el('label', {}, 'שם', title), el('label', {}, it.kind === 'info' ? 'הפרטים' : 'הערה', note),
        el('div', { class: 'fv-acts' }, el('button', { class: 'btn primary' }, 'שמירה'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'ביטול'))));
    }
    async function setPrivate(it, v) { H.closeModal(); try { await call(`/api/vault/items/${it.id}`, { method: 'PUT', body: { private: v } }); toast(v ? 'עכשיו רק אתה רואה את זה' : 'עכשיו כל המשפחה רואה את זה'); reload(); } catch (e) { say(e); } }
    async function asProfile(it) { H.closeModal(); try { await call(`/api/vault/items/${it.id}`, { method: 'PUT', body: { photo: true } }); p.photo = it.id; toast('זו תמונת האילן'); draw(tab); refreshTree(); } catch (e) { say(e); } }
    async function remove(it) {
      H.closeModal();
      if (!confirm(`למחוק את "${it.title || 'הפריט'}"? אפשר לשחזר מסל המחזור במשך 30 יום.`)) return;
      try { await call(`/api/vault/items/${it.id}`, { method: 'DELETE' }); reload(); refreshTree(); } catch (e) { say(e); }
    }
    draw(tab);
    H.sheet.open(document.querySelector(`.fv-card[data-id="${CSS.escape(id)}"]`), body, { size: 'large', className: 'fv-sheet',
      onLeave: () => { for (const u of panelBlobs) { URL.revokeObjectURL(u); blobs.delete(u); } } });
  }
  async function refreshTree() {
    const board = root.querySelector('.fv-tree');
    if (!board) return;
    try { const t = await call('/api/vault/tree'); S.people = t.people; drawTree(board); } catch (_) { /* locked: handled */ }
  }
  async function trash(p) {
    try {
      const { items } = await call(`/api/vault/people/${p.id}/items?trash=1`);
      H.modal(el('div', { class: 'fv-form' }, el('h2', {}, 'סל המחזור של ' + p.name),
        items.length ? el('ul', { class: 'fv-list' }, items.map((it) => el('li', { class: 'fv-item' }, el('b', {}, it.title || 'ללא שם'),
          el('small', { class: 'muted' }, ' נמחק ' + new Date(it.deleted).toLocaleDateString('he-IL')),
          el('button', { class: 'btn small', onclick: async () => { await call(`/api/vault/items/${it.id}/restore`, { method: 'POST' }); toast('שוחזר'); H.closeModal(); panel(p.id); refreshTree(); } }, 'שחזור'))))
          : el('p', { class: 'muted' }, 'הסל ריק.')));
    } catch (e) { say(e); }
  }

  /* ---------- the audit log, and the passkeys ---------- */
  const ACT = { unlock: 'פתח את הכספת', lock: 'נעל', view: 'צפה', add: 'הוסיף', edit: 'ערך', delete: 'מחק', restore: 'שחזר', passkey: 'מפתח גישה' };
  const KIND = { tree: 'באילן', person: 'בבן משפחה', doc: 'מסמך', photo: 'תמונה', info: 'פרט', google: 'עם Google', 'passkey': 'עם מפתח גישה', add: 'נוסף', remove: 'הוסר' };
  async function activity() {
    try {
      const { events } = await call('/api/vault/audit');
      const names = new Map(S.people.map((p) => [p.id, p.name]));
      H.modal(el('div', { class: 'fv-form fv-log' }, el('h2', {}, 'יומן פעילות'), el('p', { class: 'muted small' }, 'כל פתיחה, צפייה, הוספה ומחיקה נרשמות כאן. פעולות של אחרים על הפריטים הפרטיים שלהם לא מוצגות.'),
        el('ul', {}, events.map((e) => { const [a, k] = e.action.split(':'); return el('li', {}, el('b', {}, e.email === S.me ? 'אני' : e.email.split('@')[0]), ' ', ACT[a] || a, ' ', KIND[k] || k || '', e.person_id && names.get(e.person_id) ? ` · ${names.get(e.person_id)}` : '', el('small', { class: 'muted' }, ' ' + new Date(e.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }))); }))));
    } catch (e) { say(e); }
  }
  async function keys() {
    try {
      const { passkeys } = await call('/api/vault/passkeys');
      const box = el('div', { class: 'fv-form' }, el('h2', {}, 'מפתחות הגישה שלי'), el('p', { class: 'muted small' }, 'כל מכשיר שיכול לפתוח את הכספת בטביעת אצבע, בפנים או ב־Windows Hello. מכשיר שאבד – הסירו אותו כאן.'),
        el('ul', { class: 'fv-list' }, passkeys.map((k) => el('li', { class: 'fv-item' }, el('b', {}, k.label || 'מכשיר'), el('small', { class: 'muted' }, ` נוסף ${new Date(k.created_at).toLocaleDateString('he-IL')}${k.last_used ? ' · בשימוש ' + new Date(k.last_used).toLocaleDateString('he-IL') : ''}`),
          el('button', { class: 'btn small ghost danger', onclick: async () => { if (!confirm('להסיר את המפתח הזה?')) return; await call(`/api/vault/passkeys/${encodeURIComponent(k.id)}`, { method: 'DELETE' }); H.closeModal(); keys(); } }, 'הסרה')))),
        passkeysWork() ? el('button', { class: 'btn primary', onclick: async () => { try { await addPasskey(); toast('המפתח נשמר'); H.closeModal(); keys(); } catch (err) { if (err?.name !== 'NotAllowedError') say(err); } } }, '+ המכשיר הזה') : el('p', { class: 'muted' }, 'המכשיר הזה לא תומך במפתחות גישה.'));
      H.modal(box);
    } catch (e) { say(e); }
  }

  /* ---------- leaving the page alone ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 5 * 60e3 && S.until) lockNow();     // five minutes away: locked
  });
  addEventListener('pagehide', () => wipe());

  H.requireLogin().then(() => lockView()).catch(() => {});
})();
