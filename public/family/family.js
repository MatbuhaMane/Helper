/* עץ המשפחה – the family vault: a family tree, and for each person a panel of documents, pictures and details.
 * Everything here is fetched only while the vault is unlocked (a passkey, or a fresh Google sign-in) and only into memory:
 * files are shown from blob URLs that are revoked when the panel closes or the vault locks; nothing is cached.
 * Access rules live on the server (server/vault) – this page only shows what the server agreed to give. */
(() => {
  'use strict';
  const { el, api, toast } = H;
  H.header('עץ המשפחה');
  const root = document.querySelector('main');
  const blobs = new Set();                  // every object URL made here, revoked on lock
  let S = { people: [], me: '', until: 0 };
  let lockTimer = 0, tickTimer = 0, hiddenAt = 0;

  const ERR = {
    vault_locked: 'הכספת ננעלה', too_many_tries: 'יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.', file_type_not_allowed: 'סוג הקובץ לא נתמך: PDF, תמונות, Word, Excel או טקסט.',
    file_too_large: 'הקובץ גדול מ־25MB.', sign_in_again: 'צריך להיכנס שוב עם Google.', no_passkey: 'עוד אין מפתח גישה במכשיר הזה.', name_required: 'צריך שם.',
    vault_not_configured: 'הכספת עוד לא הוגדרה בשרת (VAULT_KEY).', passkey_not_verified: 'המכשיר לא אישר את זהותך.', passkey_bad_signature: 'המפתח לא אושר.',
    passkey_algorithm_not_supported: 'המכשיר הזה לא תומך בסוג המפתח.', challenge_expired: 'עבר יותר מדי זמן. נסו שוב.',
    // stage 2: heads, links between trees, privacy
    head_only_member: 'רק ראש משק הבית מחבר כרטיס למשתמש אחר. אפשר לכתוב כאן רק את הכתובת שלך.', only_a_head: 'רק ראש משק הבית יכול לעשות את זה.',
    only_the_person: 'רק האדם עצמו קובע את הפרטיות שלו.', only_the_owner: 'רק בעל העוזר ממנה את הנהלת השבט.', not_yours: 'רק מי שביקש, ראשי המשפחות, האדם עצמו או הנהלת השבט יכולים לנתק.',
    bad_email: 'כתובת המייל לא נראית תקינה.', same_household: 'הכתובת הזו שייכת למשק הבית שלנו.', note_required: 'כתבו לצד השני מי זה או זו.',
    already_asked: 'כבר נשלחה בקשה כזו, והיא עוד מחכה.', already_linked: 'השניים כבר מקושרים.', two_in_one_tree: 'אותו אדם כבר מופיע בעץ הזה בכרטיס אחר.',
    different_people: 'לשני הכרטיסים כתובות מייל שונות – אלה שני אנשים.', gone: 'הכרטיס בצד השני כבר לא קיים.', not_member: 'אין משתמש בכתובת הזו.', title_required: 'צריך שם למשפחה.',
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

  /* ---------- open: עץ המשפחה ---------- */
  async function open() {
    const [t, st] = await Promise.all([call('/api/vault/tree'), call('/api/vault/status')]);
    S.people = t.people; S.links = t.links || []; S.me = t.me; S.until = st.until; S.roles = t.roles || {};
    // what waits for me in the links between trees (a request to approve, my own consent)
    const inbox = await call('/api/vault/bridges').catch(() => null);
    const waiting = inbox ? inbox.incoming.length + inbox.consent.length : 0;
    S.owner = (await H.me()).user?.role === 'owner';
    S.mine = S.people.find((p) => p.member === S.me)?.id || null;          // "me" in the tree, for "how are we related"
    if (!S.focus) { try { S.focus = localStorage.getItem('fv-focus'); } catch (_) { /* fine */ } }
    S.focus = S.people.some((p) => p.id === S.focus) ? S.focus : (S.mine || S.people[0]?.id || null);
    schedule();
    const clock = el('span', { class: 'fv-clock muted' });
    const find = el('input', { type: 'search', class: 'fv-find', placeholder: 'חיפוש בעץ', 'aria-label': 'חיפוש בעץ', list: 'fv-names' });
    find.addEventListener('change', () => { const p = S.people.find((x) => x.name === find.value.trim()) || S.people.find((x) => x.name.includes(find.value.trim())); if (p) { S.view = 'family'; focusOn(p.id); find.value = ''; } });
    const views = el('div', { class: 'fv-views', role: 'tablist', 'aria-label': 'תצוגה' },
      [['family', 'המשפחה'], ['all', 'כל העץ']].map(([v, n]) => el('button', { role: 'tab', 'aria-selected': String((S.view || 'family') === v), onclick: () => { S.view = v; draw(); views.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(['family', 'all'][i] === v))); } }, n)));
    const bar = el('div', { class: 'fv-bar' },
      el('h1', {}, 'עץ המשפחה'),
      el('span', { class: 'spacer' }),
      clock,
      el('button', { class: 'btn small primary', onclick: () => personForm() }, '+ בן משפחה'),
      el('button', { class: 'btn small ghost', onclick: relatedTool }, 'איך אנחנו קשורים?'),
      el('button', { class: 'btn small ghost', onclick: linksTool }, waiting ? `עצים מקושרים (${waiting} מחכים)` : 'עצים מקושרים'),
      el('button', { class: 'btn small ghost', onclick: activity }, 'יומן פעילות'),
      el('button', { class: 'btn small ghost', onclick: keys }, 'מפתחות גישה'),
      S.owner ? el('button', { class: 'btn small ghost', onclick: backups }, 'גיבויים') : null,
      el('button', { class: 'btn small ghost fv-lockbtn', onclick: () => lockNow() }, 'נעילה'));
    const tools = el('div', { class: 'fv-tools' }, views, find, el('datalist', { id: 'fv-names' }, S.people.map((p) => el('option', { value: p.name }))));
    const board = el('div', { class: 'fv-tree' });
    root.replaceChildren(el('section', { class: 'fv' }, bar, S.people.length ? tools : null, board));
    tickTimer = setInterval(() => { const s = Math.max(0, Math.round((S.until - Date.now()) / 1000)); clock.textContent = `ננעלת בעוד ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
    draw();
  }
  function schedule() {
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => lockView('הכספת ננעלה אחרי רבע שעה בלי פעולה.'), Math.max(0, S.until - Date.now()));
  }
  /** each action on the server extends the unlock; the page keeps its own clock in step */
  const touched = () => { S.until = Math.min(Date.now() + 15 * 60e3, S.until + 15 * 60e3); schedule(); };
  async function lockNow() { await call('/api/vault/lock', { method: 'POST' }).catch(() => {}); lockView('הכספת נעולה.'); }

  /* ---------- who is whose: the relationships ---------- */
  const byId = (id) => S.people.find((p) => p.id === id);
  const parentLinks = (id) => S.links.filter((l) => l.type === 'parent' && l.b === id);
  const parentsOf = (id) => parentLinks(id).map((l) => l.a);
  const childrenOf = (id) => S.links.filter((l) => l.type === 'parent' && l.a === id).map((l) => l.b);
  const partnerLinks = (id) => S.links.filter((l) => l.type === 'partner' && (l.a === id || l.b === id));
  const partnersOf = (id) => partnerLinks(id).map((l) => (l.a === id ? l.b : l.a));
  /** brothers and sisters: anyone with a parent in common (half when not all parents are shared) */
  function siblingsOf(id) {
    const mine = new Set(parentsOf(id));
    const out = new Map();
    for (const par of mine) for (const c of childrenOf(par)) if (c !== id) out.set(c, true);
    return [...out.keys()].map((c) => { const theirs = new Set(parentsOf(c)); const half = [...mine].some((x) => !theirs.has(x)) || [...theirs].some((x) => !mine.has(x)); return { id: c, half }; });
  }
  const sexOf = (id) => byId(id)?.sex || '';
  const g = (id, m, f, both) => (sexOf(id) === 'm' ? m : sexOf(id) === 'f' ? f : both);

  /* ---------- how are we related: the shortest path, named in Hebrew ---------- */
  /** steps from `from` to `to`: U (to a parent), D (to a child), P (to a partner); partners cost a little more than blood */
  function pathBetween(from, to) {
    if (!from || !to) return null;
    const dist = new Map([[from, 0]]), prev = new Map(), queue = [[0, from]];
    while (queue.length) {
      queue.sort((a, b) => a[0] - b[0]);
      const [d, x] = queue.shift();
      if (x === to) break;
      if (d > dist.get(x)) continue;
      const next = [...parentsOf(x).map((y) => [y, 'U', 1]), ...childrenOf(x).map((y) => [y, 'D', 1]), ...partnersOf(x).map((y) => [y, 'P', 1.2])];
      for (const [y, s, w] of next) {
        const nd = d + w;
        if (nd < (dist.get(y) ?? Infinity)) { dist.set(y, nd); prev.set(y, [x, s]); queue.push([nd, y]); }
      }
    }
    if (!dist.has(to)) return null;
    const steps = [], nodes = [to];
    for (let x = to; x !== from;) { const [p, s] = prev.get(x); steps.unshift(s); nodes.unshift(p); x = p; }
    return { steps: steps.join(''), nodes };
  }
  const ORD = ['', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'], ORDF = ['', 'ראשונה', 'שנייה', 'שלישית', 'רביעית', 'חמישית'];
  /** what `to` is to `from`: "סבתא", "בן דוד שני", "גיסה" – or the path in words */
  function relationName(from, to) {
    if (from === to) return g(to, 'זה אתה', 'זו את', 'זה/זו את/ה');
    const r = pathBetween(from, to);
    if (!r) return null;
    const s = r.steps, t = to, n = s.length;
    const link = (x, y) => S.links.find((l) => l.type === 'partner' && ((l.a === x && l.b === y) || (l.a === y && l.b === x)));
    const pk = (child, parent) => S.links.find((l) => l.type === 'parent' && l.a === parent && l.b === child)?.kind;
    if (/^U+$/.test(s)) {
      if (n === 1) { const k = pk(from, t); return k === 'step' ? g(t, 'אבא חורג', 'אמא חורגת', 'הורה חורג') : k === 'adopt' ? g(t, 'אבא (מאמץ)', 'אמא (מאמצת)', 'הורה מאמץ') : g(t, 'אבא', 'אמא', 'הורה'); }
      if (n === 2) return g(t, 'סבא', 'סבתא', 'סבא/סבתא');
      if (n === 3) return g(t, 'סבא רבא', 'סבתא רבתא', 'סבא רבא/סבתא רבתא');
      return `${g(t, 'אב קדמון', 'אם קדמונית', 'דור קדום')} – ${n} דורות אחורה`;
    }
    if (/^D+$/.test(s)) {
      if (n === 1) return g(t, 'בן', 'בת', 'ילד/ה');
      if (n === 2) return g(t, 'נכד', 'נכדה', 'נכד/ה');
      if (n === 3) return g(t, 'נין', 'נינה', 'נין/ה');
      if (n === 4) return g(t, 'חימש', 'חימשת', 'חימש/ת');
      return `${g(t, 'צאצא', 'צאצאית', 'צאצא/ית')} – ${n} דורות קדימה`;
    }
    const m = /^(U+)(D+)$/.exec(s);
    if (m) {
      const up = m[1].length, down = m[2].length;
      if (up === 1 && down === 1) { const half = siblingsOf(from).find((x) => x.id === t)?.half; return g(t, 'אח', 'אחות', 'אח/אחות') + (half ? ' למחצה' : ''); }
      if (up === 2 && down === 1) return g(t, 'דוד', 'דודה', 'דוד/דודה');
      if (up === 1 && down === 2) return g(t, 'אחיין', 'אחיינית', 'אחיין/ית');
      if (up === down && up <= 6) { const k = up - 1; return g(t, 'בן דוד', 'בת דודה', 'בן/בת דוד') + (k > 1 ? ' ' + (sexOf(t) === 'f' ? ORDF[k] : ORD[k]) : ''); }
    }
    if (s === 'P') { const l = link(from, t); if (l?.status === 'divorced') return g(t, 'גרוש', 'גרושה', 'גרוש/ה'); if (l?.status === 'separated') return g(t, 'בן זוג לשעבר', 'בת זוג לשעבר', 'בן/בת זוג לשעבר'); return l?.kind === 'married' ? g(t, 'בעל', 'אישה', 'בן/בת זוג') : l?.kind === 'engaged' ? g(t, 'ארוס', 'ארוסה', 'ארוס/ה') : g(t, 'בן זוג', 'בת זוג', 'בן/בת זוג'); }
    if (s === 'PU') return sexOf(from) === 'm' ? g(t, 'חותן', 'חותנת', 'חותן/חותנת') : sexOf(from) === 'f' ? g(t, 'חם', 'חמות', 'חם/חמות') : g(t, 'חותן/חם', 'חותנת/חמות', 'הורה של בן/בת הזוג');
    if (s === 'DP') return g(t, 'חתן', 'כלה', 'חתן/כלה');
    if (s === 'PUD' || s === 'UDP') return g(t, 'גיס', 'גיסה', 'גיס/ה');
    if (s === 'DPU') return g(t, 'מחותן', 'מחותנת', 'מחותן/ת');
    if (s === 'PD') return g(t, 'בן חורג', 'בת חורגת', 'ילד/ה חורג/ת');
    if (s === 'UP') return g(t, 'אבא חורג', 'אמא חורגת', 'הורה חורג');
    return pathWords(r);
  }
  /** the path in words, nearest last: "בת של אח של אמא" */
  function pathWords(r) {
    const words = [];
    for (let i = 0; i < r.steps.length; i++) {
      const s = r.steps[i], next = r.steps[i + 1], to = r.nodes[i + 1];
      if (s === 'U' && next === 'D') { const sib = r.nodes[i + 2]; words.push(g(sib, 'אח', 'אחות', 'אח/אחות')); i++; continue; }
      words.push(s === 'U' ? g(to, 'אבא', 'אמא', 'הורה') : s === 'D' ? g(to, 'בן', 'בת', 'ילד/ה') : g(to, 'בעל', 'אישה', 'בן/בת זוג'));
    }
    return words.reverse().join(' של ');
  }
  /** how are we related – inside our tree here in the page; with someone from a linked tree, on the server */
  async function relatedTool() {
    let f = null;
    try { f = await call('/api/vault/forest'); touched(); } catch (_) { /* our tree alone */ }
    const mine = new Set(S.people.map((p) => p.id));
    // a record in another tree that is one of ours is already in the list as ours
    const dup = new Set();
    for (const [x, y] of f?.same || []) { if (mine.has(x)) dup.add(y); else if (mine.has(y)) dup.add(x); else dup.add(y); }
    const others = (f?.people || []).filter((p) => p.household !== 'mine' && !dup.has(p.id) && !p.anonymous && !p.hidden.includes('identity'));
    const houses = (f?.households || []).filter((h) => h.id !== 'mine');
    const foreign = new Map(others.map((p) => [p.id, p]));
    const nameOf = (id) => byId(id)?.name || foreign.get(id)?.name || 'קרוב/ת משפחה';
    const sexOfAny = (id) => byId(id)?.sex || foreign.get(id)?.sex || '';
    const gAny = (id, m, w, both) => (sexOfAny(id) === 'm' ? m : sexOfAny(id) === 'f' ? w : both);
    const opts = (sel) => S.people.map((p) => el('option', { value: p.id, selected: p.id === sel }, p.name));
    const a = el('select', { 'aria-label': 'מ' }, opts(S.mine || S.focus));
    const firstOther = S.focus !== (S.mine || S.focus) ? S.focus : S.people.find((p) => p.id !== a.value)?.id;
    const b = el('select', { 'aria-label': 'אל' },
      houses.length ? el('optgroup', { label: 'העץ שלנו' }, opts(firstOther)) : opts(firstOther),
      houses.map((h) => { const ps = others.filter((p) => p.household === h.id); return ps.length ? el('optgroup', { label: h.title }, ps.map((p) => el('option', { value: p.id }, p.name))) : null; }));
    const out = el('div', { class: 'fv-rel-out', 'aria-live': 'polite' });
    const show = (r, name) => out.replaceChildren(!r || !name ? el('p', { class: 'muted' }, 'אין ביניהם קשר בעצים (עדיין).') :
      el('div', {}, el('p', { class: 'fv-rel-name' }, `${nameOf(b.value)} ${gAny(b.value, 'הוא', 'היא', 'הוא/היא')} ${name} של ${nameOf(a.value)}`),
        el('ol', { class: 'fv-rel-path' }, r.nodes.map((n) => el('li', {}, n.name ?? nameOf(n))))));
    const run = async () => {
      if (mine.has(b.value)) return show(pathBetween(a.value, b.value), relationName(a.value, b.value));
      try {
        const r = await call(`/api/vault/related?from=${encodeURIComponent(a.value)}&to=${encodeURIComponent(b.value)}`);
        show(r.path.length ? { nodes: r.path } : null, r.name);
      } catch (e) { say(e); }
    };
    a.addEventListener('change', run); b.addEventListener('change', run);
    H.modal(el('div', { class: 'fv-form' }, el('h2', {}, 'איך אנחנו קשורים?'), el('div', { class: 'fv-two' }, el('label', {}, 'מ־', a), el('label', {}, 'אל', b)),
      houses.length ? el('p', { class: 'muted small' }, 'גם עם מי שבעצים המקושרים, לפי מה שכל אחד הרשה לראות ממנו.') : null, out));
    run();
  }

  /* ---------- drawing: the family around one person, or the whole tree ---------- */
  function draw() {
    const board = root.querySelector('.fv-tree');
    if (!board) return;
    if (!S.people.length) {
      board.replaceChildren(el('div', { class: 'fv-empty card' }, el('h2', {}, 'העץ עוד ריק'), el('p', { class: 'muted' }, 'התחילו מעצמכם, ואז הוסיפו הורים, בני זוג וילדים. לכל אחד תהיה חלונית משלו למסמכים, לתמונות ולפרטים.'),
        el('button', { class: 'btn primary', onclick: () => personForm() }, '+ בן המשפחה הראשון')));
      return;
    }
    (S.view === 'all' ? drawAll : drawFamily)(board);
  }
  /** move the centre to someone, with the cards gliding from where they were (FLIP) */
  function focusOn(id) {
    const board = root.querySelector('.fv-tree');
    const before = new Map([...board.querySelectorAll('.fv-card')].map((c) => [c.dataset.id, c.getBoundingClientRect()]));
    S.focus = id;
    try { localStorage.setItem('fv-focus', id); } catch (_) { /* fine */ }
    draw();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const anims = [];
    for (const c of board.querySelectorAll('.fv-card')) {
      const was = before.get(c.dataset.id), now = c.getBoundingClientRect();
      if (was) anims.push(c.animate([{ transform: `translate(${was.left - now.left}px, ${was.top - now.top}px)` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)' }));
      else anims.push(c.animate([{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'ease-out' }));
    }
    // the lines were measured while the cards were still gliding: draw them again where the cards came to rest
    Promise.allSettled(anims.map((a) => a.finished)).then(() => redrawLines(board));
  }
  /** the lines on the board as it is now (the layer is made anew by every drawing) */
  function redrawLines(board) {
    const svg = board.querySelector('.fv-lines');
    if (svg && S.links) connect(board, svg);            // (after a lock the tree is gone from memory)
  }
  /** redraw the lines when the board changes size – once per board, finding the current layer each time */
  function watchSize(board) {
    if (board.dataset.watch) return;
    board.dataset.watch = '1';
    new ResizeObserver(() => redrawLines(board)).observe(board);
  }
  /** the nuclear family around the person in the centre: grandparents, parents, the person with siblings and partners, children */
  function drawFamily(board) {
    const f = S.focus;
    const parents = parentsOf(f), grand = parents.flatMap((p) => parentsOf(p).map((gp) => ({ gp, via: p })));
    const sibs = siblingsOf(f), partners = partnersOf(f), kids = childrenOf(f);
    const grandkids = kids.flatMap(childrenOf);
    const row = (cls, label, items) => (items.length ? el('div', { class: 'fv-gen ' + cls }, el('span', { class: 'fv-gen-label' }, label), el('div', { class: 'fv-row' }, items)) : null);
    const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    lines.setAttribute('class', 'fv-lines'); lines.setAttribute('aria-hidden', 'true');
    board.replaceChildren(...[lines,
      row('g-grand', 'סבים וסבתות', grand.map(({ gp }) => card(byId(gp)))),
      row('g-parents', 'הורים', parents.map((p) => card(byId(p)))),
      el('div', { class: 'fv-gen g-focus' }, el('div', { class: 'fv-row' },
        ...sibs.filter((x) => x.half === false).slice(0, 8).map((x) => card(byId(x.id), 'sib')),
        card(byId(f), 'focus'),
        ...partners.map((p) => card(byId(p), 'partner')),
        ...sibs.filter((x) => x.half).slice(0, 6).map((x) => card(byId(x.id), 'sib')))),
      row('g-kids', 'ילדים', kids.map((k) => card(byId(k)))),
      grandkids.length ? el('p', { class: 'fv-more muted' }, `ועוד ${grandkids.length} ${grandkids.length === 1 ? 'נכד/ה' : 'נכדים'} – לחצו על אחד הילדים כדי לרדת בענף`) : null,
    ].filter(Boolean));
    requestAnimationFrame(() => connect(board, lines));
    watchSize(board);
  }
  /** generations from the parent links (partners share a row) – the zoomed-out view until the forest comes */
  function generations() {
    const lvl = new Map();
    const level = (id, seen = new Set()) => {
      if (lvl.has(id)) return lvl.get(id);
      if (seen.has(id)) return 0;
      seen.add(id);
      const ps = parentsOf(id).filter(byId);
      const v = ps.length ? Math.max(...ps.map((q) => level(q, seen))) + 1 : 0;
      lvl.set(id, v);
      return v;
    };
    S.people.forEach((p) => level(p.id));
    for (let i = 0; i < 3; i++) for (const l of S.links) if (l.type === 'partner') { const m = Math.max(lvl.get(l.a) ?? 0, lvl.get(l.b) ?? 0); lvl.set(l.a, m); lvl.set(l.b, m); }
    const rows = [];
    for (const p of S.people) (rows[lvl.get(p.id)] ||= []).push(p);
    return rows.filter(Boolean).map((row, i, all) => {
      const above = (all[i - 1] || []).map((p) => p.id);
      const key = (p) => { const k = parentsOf(p.id).map((id) => above.indexOf(id)).filter((x) => x >= 0); return k.length ? Math.min(...k) : 99; };
      row.sort((a, b) => key(a) - key(b));
      const out = [];
      for (const p of row) { if (out.includes(p)) continue; out.push(p); for (const q of partnersOf(p.id).map(byId)) if (q && row.includes(q) && !out.includes(q)) out.push(q); }
      return out;
    });
  }
  function drawAll(board) {
    const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    lines.setAttribute('class', 'fv-lines'); lines.setAttribute('aria-hidden', 'true');
    board.replaceChildren(lines, ...generations().map((row) => el('div', { class: 'fv-row' }, row.map((p) => card(p, p.id === S.focus ? 'focus' : '')))));
    requestAnimationFrame(() => connect(board, lines));
    watchSize(board);
  }
  function card(p, role = '') {
    if (!p) return null;
    const n = p.counts || {};
    const pic = el('span', { class: 'fv-pic', 'aria-hidden': 'true' }, initials(p.name));
    if (p.photo) photoInto(p.photo, pic);
    const rel = S.mine && S.mine !== p.id ? relationName(S.mine, p.id) : S.mine === p.id ? 'אני' : null;
    const isFocus = role === 'focus';
    return el('button', { class: 'fv-card' + (role ? ' r-' + role : ''), 'data-id': p.id, title: isFocus ? 'פתיחת החלונית' : 'מרכז העץ סביב ' + p.name,
      onclick: () => (isFocus ? panel(p.id) : (S.view === 'all' ? (S.view = 'family', root.querySelectorAll('.fv-views button').forEach((b, i) => b.setAttribute('aria-selected', String(i === 0))), focusOn(p.id)) : focusOn(p.id))) },
      pic, el('b', {}, p.name),
      rel ? el('small', { class: 'fv-relname' }, rel) : null,
      el('small', { class: 'muted' }, [n.doc ? `${n.doc} מסמכים` : '', n.photo ? `${n.photo} תמונות` : ''].filter(Boolean).join(' · ') || (isFocus ? 'לחצו לפתיחה' : '')));
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
  /** the lines between the cards on the board: parents to children, partners to each other */
  function connect(board, svg) {
    const b = board.getBoundingClientRect();
    svg.setAttribute('width', b.width); svg.setAttribute('height', b.height);
    const box = (id) => { const c = board.querySelector(`.fv-card[data-id="${CSS.escape(id)}"]`); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left - b.left + r.width / 2, top: r.top - b.top, bottom: r.bottom - b.top, l: r.left - b.left, r: r.right - b.left, mid: r.top - b.top + r.height / 2 }; };
    let d = '', dash = '', lineage = '';
    // the line of descent of the person in the centre: from their grandparents to their parents, and from their parents to them
    const upLine = new Set(S.focus ? [S.focus, ...parentsOf(S.focus)] : []);
    for (const l of S.links) if (l.type === 'partner') {
      const x = box(l.a), y = box(l.b);
      if (!x || !y) continue;
      const [x1, x2] = x.x < y.x ? [x.r, y.l] : [y.r, x.l];
      const seg = `M${x1},${x.mid} H${x2} `;
      if (l.status === 'divorced' || l.status === 'separated') dash += seg; else d += seg;
    }
    for (const p of S.people) {
      const a = box(p.id);
      const ps = parentsOf(p.id).map(box).filter(Boolean);
      if (!a || !ps.length) continue;
      const from = ps.length >= 2 ? (ps[0].x + ps[1].x) / 2 : ps[0].x, y0 = Math.max(...ps.map((x) => x.bottom)), ym = (y0 + a.top) / 2;
      const seg = `M${from},${ps.length >= 2 ? ps[0].mid : y0} V${ym} H${a.x} V${a.top} `;
      if (upLine.has(p.id)) lineage += seg; else d += seg;
    }
    svg.innerHTML = `<path d="${d}"/><path class="ended" d="${dash}"/><path class="lineage" d="${lineage}"/>`;
  }

  /* ---------- adding or editing a person ---------- */
  /** rel (adding only): { as: 'child' | 'parent' | 'partner', of: id } – the new person is the child / parent / partner of `of` */
  function personForm(p, rel) {
    const d = p?.details || {};
    // what the server did not send me (kept private by the person or the head): not shown, and kept as it is on save
    const hid = new Set(p?.hidden || []);
    const name = el('input', { type: 'text', value: p?.name || '', maxlength: 80, required: true, 'aria-label': 'שם', placeholder: 'שם מלא', disabled: hid.has('identity') });
    const member = el('input', { type: 'email', value: p?.member || '', dir: 'ltr', placeholder: 'כתובת Gmail (אם הוא משתמש בעוזר)', 'aria-label': 'כתובת Gmail' });
    const sex = el('select', { 'aria-label': 'מין' }, [['', '—'], ['m', 'זכר'], ['f', 'נקבה']].map(([v, t]) => el('option', { value: v, selected: (d.sex || '') === v }, t)));
    const born = el('input', { type: 'date', value: d.born || '', 'aria-label': 'תאריך לידה' });
    const bornLate = el('input', { type: 'checkbox', checked: !!d.bornAfterSunset, 'aria-label': 'אחרי השקיעה' });
    const died = el('input', { type: 'date', value: d.died || '', 'aria-label': 'תאריך פטירה' });
    const diedLate = el('input', { type: 'checkbox', checked: !!d.diedAfterSunset, 'aria-label': 'אחרי השקיעה' });
    const place = el('input', { type: 'text', value: d.place || '', maxlength: 120, 'aria-label': 'מקום לידה', placeholder: 'עיר, ארץ' });
    const notes = el('textarea', { rows: 3, maxlength: 2000, 'aria-label': 'הערות', placeholder: 'כינוי, שם בלידה, מקצוע, כל מה שכדאי לזכור' }, d.notes || '');
    const by = el('select', { 'aria-label': 'יום ההולדת לפי' }, [['gregorian', 'התאריך הלועזי'], ['hebrew', 'התאריך העברי']].map(([v, t]) => el('option', { value: v, selected: (d.birthdayBy || 'gregorian') === v }, t)));
    const inCal = el('input', { type: 'checkbox', checked: d.calendar !== false, 'aria-label': 'בלוח השנה המשפחתי' });
    const save = async (e) => {
      e.preventDefault();
      const body = { name: name.value, member: member.value || null,
        details: { ...d, sex: sex.value, born: born.value, bornAfterSunset: bornLate.checked, died: died.value, diedAfterSunset: diedLate.checked, place: place.value.trim(), notes: notes.value.trim(), birthdayBy: by.value, calendar: inCal.checked } };
      if (!p && rel?.as === 'child') body.parent1 = rel.of;
      if (!p && rel?.as === 'parent') body.child = rel.of;
      if (!p && rel?.as === 'partner') body.partner = rel.of;
      try {
        const r = await call(p ? `/api/vault/people/${p.id}` : '/api/vault/people', { method: p ? 'PUT' : 'POST', body });
        H.closeModal(); touched();
        if (!p && !rel) S.focus = r.id;
        await open();
        if (p || rel) panel(p ? r.id : rel.of);
      } catch (err) { say(err); }
    };
    const of = rel && byId(rel.of)?.name;
    const title = p ? 'עריכת ' + p.name : rel ? { child: `ילד/ה של ${of}`, parent: `הורה של ${of}`, partner: `בן/בת זוג של ${of}` }[rel.as] : 'בן משפחה חדש';
    H.modal(el('form', { class: 'fv-form', onsubmit: save },
      el('h2', {}, title),
      hid.has('identity') ? el('p', { class: 'muted small' }, 'השם של בן המשפחה הזה פרטי, ולכן לא מוצג כאן.') : el('div', { class: 'fv-two' }, el('label', {}, 'שם', name), el('label', {}, 'מין (לניסוח העברי)', sex)),
      ...(hid.has('dates') ? [el('p', { class: 'muted small' }, 'התאריכים והמקומות פרטיים, ולכן לא מוצגים כאן.')] : [
        el('div', { class: 'fv-two' }, el('label', {}, 'תאריך לידה', born), el('label', { class: 'fv-check' }, bornLate, ' נולד/ה אחרי השקיעה')),
        el('div', { class: 'fv-two' }, el('label', {}, 'תאריך פטירה', died), el('label', { class: 'fv-check' }, diedLate, ' נפטר/ה אחרי השקיעה')),
        el('div', { class: 'fv-two' }, el('label', {}, 'מקום לידה', place), el('label', {}, 'יום ההולדת לפי', by))]),
      hid.has('notes') ? el('p', { class: 'muted small' }, 'ההערות פרטיות.') : el('label', {}, 'הערות', notes),
      hid.has('identity') ? null : el('label', {}, S.roles?.head ? 'משתמש בעוזר' : 'משתמש בעוזר (רק ראש משק הבית מחבר כתובת של מישהו אחר)', member),
      hid.has('dates') ? null : el('label', { class: 'fv-check' }, inCal, ' בלוח השנה המשפחתי (יום הולדת, ואחרי פטירה – יום השנה)'),
      el('div', { class: 'fv-acts' }, el('button', { class: 'btn primary' }, 'שמירה'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'ביטול'))));
    setTimeout(() => name.focus(), 50);
  }

  /* ---------- a person's relationships, in their panel ---------- */
  const PARENT_KIND = { bio: 'ביולוגי', adopt: 'מאמץ', step: 'חורג', foster: 'אומנה' };
  const PARTNER_KIND = { married: 'נשואים', partner: 'בני זוג', engaged: 'מאורסים' };
  const PARTNER_STATUS = { together: 'יחד', divorced: 'גרושים', widowed: 'אלמנות', separated: 'נפרדו' };
  function relationsBox(p, refresh) {
    const line = (label, id, linkObj, extra) => el('li', { class: 'fv-relrow' },
      el('button', { class: 'fv-rel-who', onclick: () => { H.sheet.close(); S.view = 'family'; setTimeout(() => focusOn(id), 300); } }, byId(id)?.name || '?'),
      el('small', { class: 'muted' }, label), extra || null,
      linkObj ? el('button', { class: 'btn small ghost danger', title: 'הסרת הקשר', 'aria-label': 'הסרת הקשר', onclick: async () => { if (!confirm('להסיר את הקשר? האנשים עצמם נשארים בעץ.')) return; await call('/api/vault/links/' + linkObj.id, { method: 'DELETE' }); await reload(); } }, '✕') : null);
    const sel = (map, value, onchange) => { const s = el('select', { class: 'fv-mini' }, Object.entries(map).map(([v, t]) => el('option', { value: v, selected: v === value }, t))); s.addEventListener('change', () => onchange(s.value)); return s; };
    const save = async (l, patch) => { await call('/api/vault/links/' + l.id, { method: 'PUT', body: patch }); await reload(); };
    const reload = async () => { const t = await call('/api/vault/tree'); S.people = t.people; S.links = t.links; touched(); refresh(); };
    const items = [];
    for (const l of parentLinks(p.id)) items.push(line(g(l.a, 'אבא', 'אמא', 'הורה'), l.a, l, sel(PARENT_KIND, l.kind, (v) => save(l, { kind: v }))));
    for (const l of partnerLinks(p.id)) {
      const other = l.a === p.id ? l.b : l.a;
      items.push(line(relationName(p.id, other) || 'בן/בת זוג', other, l, el('span', { class: 'fv-relopts' }, sel(PARTNER_KIND, l.kind, (v) => save(l, { kind: v })), sel(PARTNER_STATUS, l.status, (v) => save(l, { status: v })))));
    }
    for (const c of childrenOf(p.id)) { const l = S.links.find((x) => x.type === 'parent' && x.a === p.id && x.b === c); items.push(line(g(c, 'בן', 'בת', 'ילד/ה'), c, l, sel(PARENT_KIND, l.kind, (v) => save(l, { kind: v })))); }
    for (const s of siblingsOf(p.id)) items.push(line(g(s.id, 'אח', 'אחות', 'אח/אחות') + (s.half ? ' למחצה' : ''), s.id, null));
    const connectExisting = () => {
      const who = el('select', { 'aria-label': 'מי' }, S.people.filter((x) => x.id !== p.id).map((x) => el('option', { value: x.id }, x.name)));
      const as = el('select', { 'aria-label': 'קשר' }, [['parent', `הורה של ${p.name}`], ['child', `ילד/ה של ${p.name}`], ['partner', `בן/בת זוג של ${p.name}`]].map(([v, t]) => el('option', { value: v }, t)));
      H.modal(el('form', { class: 'fv-form', onsubmit: async (e) => {
        e.preventDefault();
        const body = as.value === 'parent' ? { type: 'parent', a: who.value, b: p.id } : as.value === 'child' ? { type: 'parent', a: p.id, b: who.value } : { type: 'partner', a: p.id, b: who.value };
        try { await call('/api/vault/links', { body }); H.closeModal(); await reload(); } catch (err) { say(err); }
      } }, el('h2', {}, 'חיבור לאדם שכבר בעץ'), el('label', {}, 'מי', who), el('label', {}, 'הוא/היא', as),
        el('div', { class: 'fv-acts' }, el('button', { class: 'btn primary' }, 'חיבור'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'ביטול'))));
    };
    return el('section', { class: 'fv-rels' },
      el('h3', {}, 'קשרים'),
      items.length ? el('ul', { class: 'fv-rel-list' }, items) : el('p', { class: 'muted small' }, 'עוד אין קשרים. הוסיפו הורים, בני זוג או ילדים.'),
      el('div', { class: 'fv-acts-row' },
        el('button', { class: 'btn small', onclick: () => { H.sheet.close(); personForm(null, { as: 'parent', of: p.id }); } }, '+ הורה'),
        el('button', { class: 'btn small', onclick: () => { H.sheet.close(); personForm(null, { as: 'partner', of: p.id }); } }, '+ בן/בת זוג'),
        el('button', { class: 'btn small', onclick: () => { H.sheet.close(); personForm(null, { as: 'child', of: p.id }); } }, '+ ילד/ה'),
        el('button', { class: 'btn small ghost', onclick: connectExisting }, 'חיבור לאדם קיים')));
  }

  /** a number in Hebrew letters, with its geresh or gershayim: 27 → כ״ז, 745 → תשמ״ה */
  function heNum(n) {
    const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], hund = ['', 'ק', 'ר', 'ש', 'ת'];
    let h = Math.floor(n / 100), out = '';
    while (h > 4) { out += 'ת'; h -= 4; }
    out += hund[h];
    const r = n % 100;
    out += r === 15 ? 'טו' : r === 16 ? 'טז' : tens[Math.floor(r / 10)] + ones[r % 10];
    return out.length > 1 ? out.slice(0, -1) + '״' + out.slice(-1) : out + '׳';
  }
  /** a day as a Hebrew date in letters: "כ״ז באדר תשמ״ה" */
  function heDate(t) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', year: 'numeric' }).formatToParts(t).map((x) => [x.type, x.value]));
    return `${heNum(+p.day)} ב${new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long' }).format(t)} ${heNum(+p.year % 1000)}`;
  }
  /** "נולד ב־20 במרץ 1985 (כ״ז באדר תשמ״ה) בירושלים · בן 41" – from the person's details, in the right gender */
  function lifeLine(d = {}) {
    const day = (iso) => { const t = new Date(iso + 'T12:00'); return isNaN(t) ? null : t; };
    const b = d.born && day(d.born), x = d.died && day(d.died);
    if (!b && !x && !d.place) return null;
    const gs = (m, f, both) => (d.sex === 'm' ? m : d.sex === 'f' ? f : both);
    const greg = (t) => t.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
    const years = (from, to) => { let y = to.getFullYear() - from.getFullYear(); if (to < new Date(to.getFullYear(), from.getMonth(), from.getDate())) y--; return y; };
    const parts = [];
    const next = (t, late) => (late ? new Date(t.getTime() + 864e5) : t);
    if (b) parts.push(`${gs('נולד', 'נולדה', 'נולד/ה')} ב־${greg(b)} (${heDate(next(b, d.bornAfterSunset))})${d.place ? ' ב' + d.place : ''}`);
    else if (d.place) parts.push('מ' + d.place);
    if (x) parts.push(`${gs('נפטר', 'נפטרה', 'נפטר/ה')} ב־${greg(x)} (${heDate(next(x, d.diedAfterSunset))})`);
    if (b) parts.push(x ? `${gs('חי', 'חיה', 'חי/ה')} ${years(b, x)} שנים` : `${gs('בן', 'בת', 'בן/בת')} ${years(b, new Date())}`);
    return el('p', { class: 'fv-life muted' }, parts.join(' · '));
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
        el('header', { class: 'fv-ph' }, el('span', { class: 'fv-pic big', 'aria-hidden': 'true' }, initials(p.name)), el('div', {}, el('h2', {}, p.name), S.mine && S.mine !== p.id && relationName(S.mine, p.id) ? el('p', { class: 'fv-relname' }, relationName(S.mine, p.id)) : null, lifeLine(p.details), p.member ? el('small', { class: 'muted', dir: 'ltr' }, p.member) : null,
            el('p', { class: 'muted small fv-user' }, p.user ? 'משתמש/ת בעוזר – קובע/ת בעצמו/ה מה רואים' : 'לא משתמש/ת בעוזר – ראש משק הבית מנהל את הפרטים')),
          el('span', { class: 'spacer' }), el('button', { class: 'btn small ghost', onclick: () => personForm(p) }, 'עריכה')),
        relationsBox(p, () => draw(tab)),
        treesBox(p),
        privacyBox(p),
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
    try { const t = await call('/api/vault/tree'); S.people = t.people; S.links = t.links || []; draw(); } catch (_) { /* locked: handled */ }
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

  /* ---------- stage 2: privacy, links between trees, heads (the server decides everything; docs/family-forest.md) ---------- */
  const LEVEL_NAMES = (user) => ({ private: user ? 'רק האדם עצמו' : 'רק ראשי משק הבית', household: 'משק הבית שלנו', linked: 'גם המשפחות המקושרות', forest: 'כל השבט' });
  const GROUPS = [['identity', 'שם ומין'], ['dates', 'תאריכים ומקומות'], ['notes', 'הערות'], ['files', 'מסמכים ותמונות']];
  /** who sees what of this person – for the one who decides: the person (a user) or a head (someone who is not) */
  function privacyBox(p) {
    if (!p.may?.privacy) return p.hidden?.length ? el('p', { class: 'muted small' }, 'חלק מהפרטים כאן פרטיים.') : null;
    const names = LEVEL_NAMES(p.user);
    const sels = Object.fromEntries(GROUPS.map(([g, label]) => {
      const opts = g === 'files' ? ['private', 'household'] : ['private', 'household', 'linked', 'forest'];   // files stay at home
      return [g, el('select', { 'aria-label': label }, opts.map((v) => el('option', { value: v, selected: p.privacy[g] === v }, names[v])))];
    }));
    const anon = el('input', { type: 'checkbox', checked: !!p.anonymous, 'aria-label': 'אנונימי מחוץ למשק הבית' });
    const save = async () => {
      try {
        const r = await call(`/api/vault/people/${p.id}/privacy`, { method: 'PUT', body: { privacy: Object.fromEntries(Object.entries(sels).map(([g, s]) => [g, s.value])), anonymous: anon.checked } });
        p.privacy = r.privacy; p.anonymous = r.anonymous; touched(); toast('נשמר');
      } catch (e) { say(e); }
    };
    for (const x of [...Object.values(sels), anon]) x.addEventListener('change', save);
    return el('section', { class: 'fv-privacy' },
      el('h3', {}, 'מי רואה'),
      el('p', { class: 'muted small' }, p.user ? 'את הכרטיס שלך רק את/ה קובע/ת, בכל עץ שבו הוא מופיע.' : 'בשביל מי שלא משתמש בעוזר, ראש משק הבית קובע. מסמכים ותמונות לא יוצאים ממשק הבית.'),
      el('div', { class: 'fv-two' }, GROUPS.map(([g, label]) => el('label', {}, label, sels[g]))),
      el('label', { class: 'fv-check' }, anon, ' אנונימי מחוץ למשק הבית: רק "קרוב/ת משפחה", בלי שם ובלי פרטים (אבל הקשר המשפחתי נשמר)'));
  }
  const BRIDGE_STATUS = { pending: 'בקשה נשלחה אל', awaiting_person: 'מחכה להסכמה של האדם עצמו:', confirmed: 'גם בעץ של' };
  /** this person in other households' trees */
  function treesBox(p) {
    const rows = (p.bridges || []).map((b) => el('li', { class: 'fv-relrow' },
      el('span', {}, `${BRIDGE_STATUS[b.status] || ''} ${b.other}`),
      el('button', { class: 'btn small ghost danger', onclick: async () => {
        if (!confirm(b.status === 'confirmed' ? 'לנתק את הקישור? הכרטיס נשאר בשני העצים, רק הקישור ביניהם נעלם.' : 'לבטל את הבקשה?')) return;
        try { await call('/api/vault/bridges/' + b.id, { method: 'DELETE' }); toast('נותק'); H.sheet.close(); panel(p.id); } catch (e) { say(e); }
      } }, b.status === 'confirmed' ? 'ניתוק' : 'ביטול')));
    return el('section', { class: 'fv-trees' },
      el('h3', {}, 'בעצים של משפחות אחרות'),
      rows.length ? el('ul', { class: 'fv-rel-list' }, rows)
        : el('p', { class: 'muted small' }, `אם ${p.name} מופיע/ה גם בעץ של משפחה אחרת (למשל כלה, שמופיעה גם בעץ של ההורים שלה), אפשר לקשר את שני העצים דרכו/ה.`),
      el('div', { class: 'fv-acts-row' }, el('button', { class: 'btn small', onclick: () => linkAsk(p) }, '+ קישור לעץ של משפחה אחרת')));
  }
  /** ask another household to link their tree to ours through this person: only the note goes with it */
  function linkAsk(p) {
    const email = el('input', { type: 'email', dir: 'ltr', required: true, placeholder: 'name@gmail.com', 'aria-label': 'המייל של מישהו מהמשפחה השנייה' });
    const note = el('textarea', { rows: 3, maxlength: 300, required: true, 'aria-label': 'מי זה או זו', placeholder: `למשל: ${p.name}, הבת של רינה ויוסי` });
    H.modal(el('form', { class: 'fv-form', onsubmit: async (e) => {
      e.preventDefault();
      try { await call('/api/vault/bridges', { body: { person: p.id, email: email.value.trim(), note: note.value.trim() } }); H.closeModal(); toast('הבקשה נשלחה. ראש משק הבית בצד השני יאשר אותה.'); }
      catch (err) { say(err); }
    } },
      el('h2', {}, `קישור לעץ אחר דרך ${p.name}`),
      el('p', { class: 'muted small' }, 'הבקשה תגיע לראש משק הבית של המשפחה השנייה. הוא יבדוק את הקשר ויבחר את אותו אדם בעץ שלהם. מהעץ שלנו לא נשלח דבר מלבד מה שתכתבו כאן, וכל צד יכול לנתק בכל רגע.'),
      el('label', {}, 'המייל של מישהו מהמשפחה השנייה', email),
      el('label', {}, 'מי זה או זו, במילים שלכם', note),
      el('div', { class: 'fv-acts' }, el('button', { class: 'btn primary' }, 'שליחת הבקשה'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'ביטול'))));
    setTimeout(() => email.focus(), 50);
  }
  /** the links of our tree: requests to approve, my own consent, what we asked, the linked trees, the heads */
  async function linksTool() {
    let b, r;
    try { [b, r] = await Promise.all([call('/api/vault/bridges'), call('/api/vault/roles')]); } catch (e) { return say(e); }
    touched();
    const when = (t) => (t ? new Date(t).toLocaleDateString('he-IL') : '');
    const again = () => { H.closeModal(); linksTool(); };
    /** a button that does `fn` and shows the window again (after asking `sure`, if given) */
    const act = (label, fn, cls = 'btn small', sure) => el('button', { class: cls, type: 'button', onclick: async () => {
      if (sure && !confirm(sure)) return;
      try { await fn(); again(); } catch (e) { say(e); }
    } }, label);
    const nameOf = (id) => byId(id)?.name || '?';
    const part = (title, ...body) => el('section', { class: 'fv-links-part' }, el('h3', {}, title), ...body);
    const parts = [];
    if (b.consent.length) parts.push(part('מחכה להסכמה שלך', el('ul', { class: 'fv-list' }, b.consent.map((c) => el('li', { class: 'fv-item' },
      el('p', {}, `${c.from} ו${c.to} רוצים לקשר את העצים שלהם דרכך.`), el('p', { class: 'muted small' }, `"${c.note}"`),
      el('div', { class: 'fv-acts-row' },
        act('מסכים/ה', () => call(`/api/vault/bridges/${c.id}/consent`, { method: 'POST' }), 'btn small primary'),
        act('לא מסכים/ה', () => call(`/api/vault/bridges/${c.id}/decline`, { method: 'POST' }), 'btn small ghost')))))));
    if (b.incoming.length) parts.push(part('בקשות לקשר את העץ שלנו',
      el('p', { class: 'muted small' }, 'בדקו שהקשר המשפחתי נכון, ובחרו את אותו אדם בעץ שלנו. אם הוא עוד לא בעץ, הוסיפו אותו קודם.'),
      el('ul', { class: 'fv-list' }, b.incoming.map((q) => {
        const who = el('select', { 'aria-label': 'אותו אדם בעץ שלנו' }, el('option', { value: '' }, 'בחרו מהעץ שלנו…'), S.people.map((p) => el('option', { value: p.id }, p.name)));
        return el('li', { class: 'fv-item' },
          el('p', {}, `${q.by || 'מישהו'} מ${q.from}: "${q.note}"`), el('small', { class: 'muted' }, when(q.at)),
          el('label', {}, 'אותו אדם אצלנו', who),
          el('div', { class: 'fv-acts-row' },
            act('אישור', async () => {
              if (!who.value) throw new Error('בחרו את אותו אדם בעץ שלנו');
              const x = await call(`/api/vault/bridges/${q.id}/approve`, { body: { person: who.value } });
              toast(x.status === 'confirmed' ? 'העצים קושרו' : 'אושר. מחכה עכשיו להסכמה של האדם עצמו.');
            }, 'btn small primary'),
            act('דחייה', () => call(`/api/vault/bridges/${q.id}/decline`, { method: 'POST' }), 'btn small ghost', 'לדחות את הבקשה?')));
      }))));
    parts.push(part('העצים שמקושרים אלינו', b.linked.length
      ? el('ul', { class: 'fv-list' }, b.linked.map((l) => el('li', { class: 'fv-item' },
        el('span', {}, `${l.other}, דרך ${nameOf(l.person)}`), el('small', { class: 'muted' }, ' ' + when(l.at)),
        act('ניתוק', () => call(`/api/vault/bridges/${l.id}`, { method: 'DELETE' }), 'btn small ghost danger', `לנתק את העץ של ${l.other}? הכרטיסים נשארים, רק הקישור נעלם.`))))
      : el('p', { class: 'muted small' }, 'עוד אין. פתחו את הכרטיס של מי שמופיע גם בעץ של משפחה אחרת, ובחרו "קישור לעץ של משפחה אחרת".')));
    const OUT = { pending: 'מחכה לאישור', awaiting_person: 'מחכה להסכמה של האדם עצמו', declined: 'נדחתה' };
    if (b.outgoing.length) parts.push(part('בקשות ששלחנו', el('ul', { class: 'fv-list' }, b.outgoing.map((o) => el('li', { class: 'fv-item' },
      el('span', {}, `${nameOf(o.person)} ← `, el('span', { dir: 'ltr' }, o.to)), el('small', { class: 'muted' }, ` ${OUT[o.status] || o.status} · ${when(o.at)}`),
      o.status === 'declined' ? null : act('ביטול', () => call(`/api/vault/bridges/${o.id}`, { method: 'DELETE' }), 'btn small ghost', 'לבטל את הבקשה?'))))));
    if (b.tribe.length) parts.push(part('הנהלת השבט: כל הקישורים בשבט', el('ul', { class: 'fv-list' }, b.tribe.map((t) => el('li', { class: 'fv-item' },
      el('span', {}, `${t.a} ↔ ${t.b}`),
      act('ניתוק', () => call(`/api/vault/bridges/${t.id}`, { method: 'DELETE' }), 'btn small ghost danger', `לנתק את ${t.a} מ${t.b}?`))))));
    // the household: its name for the others, its heads, the tribe head
    const title = el('input', { type: 'text', maxlength: 60, value: r.title || '', placeholder: 'למשל: משפחת לוי', 'aria-label': 'שם המשפחה', disabled: !r.me.head });
    const tribeEmail = el('input', { type: 'email', dir: 'ltr', placeholder: 'name@gmail.com', 'aria-label': 'המייל של הנהלת השבט' });
    parts.push(part('משק הבית שלנו',
      el('label', {}, 'השם שהמשפחות האחרות רואות', title),
      r.me.head ? el('div', { class: 'fv-acts-row' }, act('שמירת השם', () => call('/api/vault/household', { method: 'PUT', body: { title: title.value } }))) : null,
      el('p', { class: 'muted small' }, 'ראש משק הבית מאשר קישורים לעצים אחרים, ומנהל את הפרטים והפרטיות של מי שלא משתמש בעוזר.'),
      el('ul', { class: 'fv-list' }, r.members.map((m) => el('li', { class: 'fv-item' },
        el('b', {}, m.name || m.email), el('small', { class: 'muted' }, m.head ? ' · ראש משק הבית' : ''),
        r.me.head && !m.owner ? act(m.head ? 'הסרה מהראשות' : 'מינוי לראש משק הבית', () => call('/api/vault/roles', { method: 'PUT', body: { email: m.email, role: 'head', on: !m.head } }), 'btn small ghost') : null))),
      el('p', { class: 'small' }, r.tribe.length ? 'הנהלת השבט: ' + r.tribe.map((t) => `${t.name} (${t.household})`).join(', ') : 'לשבט עוד אין הנהלה.'),
      r.me.owner ? el('div', { class: 'fv-acts-row' }, el('label', {}, 'מינוי להנהלת השבט', tribeEmail),
        act('מינוי', () => call('/api/vault/roles', { method: 'PUT', body: { email: tribeEmail.value.trim(), role: 'tribe', on: true } })),
        act('הסרה', () => call('/api/vault/roles', { method: 'PUT', body: { email: tribeEmail.value.trim(), role: 'tribe', on: false } }), 'btn small ghost')) : null));
    H.modal(el('div', { class: 'fv-form fv-links' },
      el('h2', {}, 'עצים מקושרים'),
      el('p', { class: 'muted small' }, 'כשאותו אדם מופיע בעץ שלנו ובעץ של משפחה אחרת, אפשר לקשר את שני העצים דרכו, בהסכמה של שני הצדדים. כל אחד מחליט מה רואים ממנו מחוץ למשק הבית.'),
      ...parts));
  }

  /* ---------- the audit log, and the passkeys ---------- */
  const ACT = { unlock: 'פתח את הכספת', lock: 'נעל', view: 'צפה', add: 'הוסיף', edit: 'ערך', delete: 'מחק', restore: 'שחזר', passkey: 'מפתח גישה',
    ask: 'ביקש', approve: 'אישר', consent: 'הסכים ל', decline: 'דחה', revoke: 'ניתק', remove: 'הסיר' };
  const KIND = { tree: 'באילן', person: 'בבן משפחה', doc: 'מסמך', photo: 'תמונה', info: 'פרט', google: 'עם Google', 'passkey': 'עם מפתח גישה', add: 'נוסף', remove: 'הוסר',
    bridge: 'קישור לעץ אחר', privacy: 'פרטיות', household: 'שם המשפחה', role: 'תפקיד', forest: 'בעצים המקושרים', related: 'בקשר בין שני אנשים', link: 'קשר' };
  async function activity() {
    try {
      const { events } = await call('/api/vault/audit');
      const names = new Map(S.people.map((p) => [p.id, p.name]));
      H.modal(el('div', { class: 'fv-form fv-log' }, el('h2', {}, 'יומן פעילות'), el('p', { class: 'muted small' }, 'כל פתיחה, צפייה, הוספה ומחיקה נרשמות כאן. פעולות של אחרים על הפריטים הפרטיים שלהם לא מוצגות.'),
        el('ul', {}, events.map((e) => { const [a, k, x] = e.action.split(':'); return el('li', {}, el('b', {}, e.email === S.me ? 'אני' : e.email.split('@')[0]), ' ', ACT[a] || a, ' ', KIND[k] || k || '', x === 'from-outside' ? ' (ממשפחה אחרת)' : x === 'tribe' ? ' (הנהלת השבט)' : '', e.person_id && names.get(e.person_id) ? ` · ${names.get(e.person_id)}` : '', el('small', { class: 'muted' }, ' ' + new Date(e.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }))); }))));
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

  /* ---------- backups (the owner): Cloudflare first, an encrypted copy on Drive, the NAS pulls its own ---------- */
  async function backups() {
    let b;
    try { b = await call('/api/vault/backups'); } catch (e) { return say(e); }
    const when = (t) => (t ? new Date(t).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : 'עוד לא');
    const run = el('button', { class: 'btn small primary', onclick: async () => {
      run.disabled = true; run.textContent = 'מגבה…';
      try { const r = await call('/api/vault/backups/run', { method: 'POST' }); toast(`הגיבוי הסתיים: ${r.copied} עותקים חדשים${r.failed ? `, ${r.failed} נכשלו` : ''}`); H.closeModal(); backups(); }
      catch (e) { say(e); run.disabled = false; run.textContent = 'גיבוי עכשיו'; }
    } }, 'גיבוי עכשיו');
    H.modal(el('div', { class: 'fv-form' },
      el('h2', {}, 'גיבויים'),
      el('p', { class: 'muted small' }, 'הקבצים נשמרים ב־Cloudflare. מכל קובץ נשמר עותק מוצפן גם ב־Google Drive, וה־NAS מושך לעצמו את כל העותקים. בלי מפתח הכספת אי אפשר לקרוא אף אחד מהם.'),
      el('div', { class: 'fv-item' }, el('b', {}, 'Google Drive'),
        b.drive.email
          ? [el('span', { dir: 'ltr', class: 'muted small' }, b.drive.email), el('span', {}, `${b.drive.copies} מתוך ${b.drive.files} קבצים מגובים`),
             el('button', { class: 'btn small ghost', onclick: async () => { if (!confirm('לנתק את Google Drive מהגיבויים? העותקים שכבר שם נשארים.')) return; await call('/api/vault/backups/drive/disconnect', { method: 'POST' }); H.closeModal(); backups(); } }, 'ניתוק')]
          : [el('span', { class: 'muted small' }, 'לא מחובר'), el('button', { class: 'btn small primary', onclick: () => { location.href = '/api/auth/login?drive=1&next=' + encodeURIComponent('/family/?fresh=1'); } }, 'חיבור Google Drive')]),
      el('div', { class: 'fv-item' }, el('b', {}, 'NAS'), el('span', { class: 'muted small' }, 'ה־NAS מושך את הגיבויים מ־Cloudflare בעצמו (Cloud Sync). כך שום דבר בבית לא פתוח לאינטרנט. ההגדרה מתוארת ב־docs/security.md.')),
      el('div', { class: 'fv-item' }, el('b', {}, 'עותק לילי של האילן'), el('span', { class: 'muted small' }, `האחרון: ${when(b.lastSnapshot)}`),
        b.lastRun ? el('span', { class: 'muted small' }, `הגיבוי האחרון: ${when(b.lastRun.at)} · ${b.lastRun.copied} עותקים חדשים${b.lastRun.failed ? ` · ${b.lastRun.failed} נכשלו` : ''}`) : null),
      el('div', { class: 'fv-acts' }, run)));
  }

  /* ---------- leaving the page alone ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 5 * 60e3 && S.until) lockNow();     // five minutes away: locked
  });
  addEventListener('pagehide', () => wipe());

  H.requireLogin().then(() => lockView()).catch(() => {});
})();
