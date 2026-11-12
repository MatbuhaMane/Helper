/* ההזמנה למפגש – opened from the family's WhatsApp group, with no app and no sign-in (docs/business/gathering.md, "the first
   minute"). The link's key is after the # (never sent in the address, so it stays out of logs). It shows only the
   gathering: its name, day and place, the first names of who is coming, what they bring, and the comments. A guest's first
   answer gives them a key, kept on this device, so they can change it later. A member signed in is known by their sign-in. */
(() => {
  const { el, toast } = H;
  const root = document.querySelector('main');
  const token = location.hash.slice(1).split(/[?&]/)[0];
  const KEY = 'gather-guest:' + token.slice(0, 16);
  const SEEN = 'gather-seen:' + token.slice(0, 16);
  const KIND = { meat: 'בשרי', dairy: 'חלבי', parve: 'פרווה' };
  const ERR = { answer_first: 'קודם ספרו לנו אם אתם מגיעים.', taken: 'מישהו כבר לקח את זה.', closed: 'ההזמנה נסגרה.', name_required: 'איך קוראים לך?', too_many_tries: 'יותר מדי ניסיונות. נסו שוב בעוד שעה.' };
  const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* a private window: the answer still counts */ } } };
  let guest = store.get(KEY);
  const base = `/api/gather/invite/${encodeURIComponent(token)}`;
  async function call(path, opts = {}) {
    const r = await fetch(base + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-guest': guest }, body: opts.body ? JSON.stringify({ ...opts.body, guest }) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(ERR[data.error] || 'משהו השתבש'); e.code = data.error; e.status = r.status; throw e; }
    return data;
  }
  const say = (e) => toast(e?.message || 'משהו השתבש');

  async function draw() {
    if (!token) return root.replaceChildren(el('section', { class: 'card ga-invite' }, el('h1', {}, 'הזמנה למפגש'), el('p', {}, 'הקישור לא שלם. בקשו מהמארגנים לשלוח אותו שוב.')));
    let g;
    const first = !store.get(SEEN);
    try { g = await call(first ? '?seen=1' : ''); if (first) store.set(SEEN, '1'); }
    catch (e) { return root.replaceChildren(el('section', { class: 'card ga-invite' }, el('h1', {}, 'הזמנה למפגש'), el('p', {}, e.status === 404 ? 'ההזמנה לא נמצאה. אולי הקישור השתנה: בקשו מהמארגנים לשלוח אותו שוב.' : e.message))); }
    if (g.closed) return root.replaceChildren(el('section', { class: 'card ga-invite' }, el('h1', {}, g.title), el('p', {}, g.cancelled ? 'המארגנים סגרו את ההזמנה.' : 'המפגש כבר עבר. תודה שבאתם!')));
    const me = g.me, answered = !!me;

    // the answer: coming, maybe, or not; with how many
    const name = el('input', { type: 'text', maxlength: 60, required: true, value: me?.name || g.member?.name || '', autocomplete: 'name', 'aria-label': 'השם שלך', placeholder: 'השם שלך' });
    let n = me?.count || 1;
    const num = el('output', { 'aria-live': 'polite' }, String(n));
    const step = (d) => { n = Math.max(1, Math.min(30, n + d)); num.textContent = String(n); };
    const note = el('input', { type: 'text', maxlength: 300, value: me?.note || '', 'aria-label': 'הערה (לא חובה)', placeholder: 'הערה (לא חובה): צמחוני, נאחר קצת…' });
    const answer = async (coming) => {
      if (!name.value.trim()) { name.focus(); return toast('איך קוראים לך?'); }
      try {
        const r = await call('/rsvp', { body: { name: name.value, coming, count: n, note: note.value } });
        if (r.guest) { guest = r.guest; store.set(KEY, guest); }
        toast(coming === 'yes' ? 'מעולה, נתראה!' : coming === 'maybe' ? 'רשמנו "אולי"' : 'תודה שעדכנת');
        draw();
      } catch (e) { say(e); }
    };
    const rsvp = el('section', { class: 'card ga-rsvp' },
      el('h2', {}, answered ? 'התשובה שלך' : 'מגיעים?'),
      answered ? el('p', {}, me.coming === 'yes' ? `רשום: ${me.name} מגיע/ה${me.count > 1 ? `, ${me.count} איש` : ''}.` : me.coming === 'maybe' ? `רשום: ${me.name}, אולי.` : `רשום: ${me.name} לא מגיע/ה.`) : null,
      el('label', {}, 'השם שלך', name),
      el('div', { class: 'ga-count' }, el('span', {}, 'כמה תגיעו (איתך)'),
        el('button', { class: 'btn small', type: 'button', 'aria-label': 'פחות', onclick: () => step(-1) }, '−'), num,
        el('button', { class: 'btn small', type: 'button', 'aria-label': 'יותר', onclick: () => step(1) }, '+')),
      note,
      el('div', { class: 'ga-acts' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => answer('yes') }, 'מגיע/ה'),
        el('button', { class: 'btn', type: 'button', onclick: () => answer('maybe') }, 'אולי'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => answer('no') }, 'לא אוכל להגיע')));

    // what to bring
    const mineTitle = el('input', { type: 'text', maxlength: 80, 'aria-label': 'מה תביאו', placeholder: 'למשל: עוגה, סלט, שתייה' });
    const mineKind = el('select', { 'aria-label': 'בשרי, חלבי או פרווה' }, [['', '—'], ['meat', 'בשרי'], ['dairy', 'חלבי'], ['parve', 'פרווה']].map(([v, t]) => el('option', { value: v }, t)));
    const act = (label, path, cls = 'btn small') => el('button', { class: cls, type: 'button', onclick: async () => { if (!answered) return toast(ERR.answer_first); try { await call(path, { body: {} }); draw(); } catch (e) { say(e); } } }, label);
    const items = el('section', { class: 'card ga-items' },
      el('h2', {}, 'מי מביא מה'),
      g.items.length ? el('ul', { class: 'ga-list-items' }, g.items.map((i) => el('li', {},
        el('b', {}, i.title), i.kind ? el('small', { class: 'ga-kind' }, KIND[i.kind] || '') : null,
        i.mine ? [el('span', {}, ' · את/ה מביא/ה'), act('לא אביא', `/items/${i.id}/release`, 'btn small ghost')]
          : i.taker ? el('span', { class: 'muted' }, ` · ${i.taker} מביא/ה`) : act('אני אביא', `/items/${i.id}/take`)))) : el('p', { class: 'muted small' }, 'עוד אין רשימה. אפשר להוסיף מה תביאו.'),
      el('form', { class: 'ga-inline', onsubmit: async (e) => {
        e.preventDefault();
        if (!answered) return toast(ERR.answer_first);
        if (!mineTitle.value.trim()) return;
        try { await call('/items', { body: { title: mineTitle.value, kind: mineKind.value } }); draw(); } catch (err) { say(err); }
      } }, mineTitle, g.food === 'kosher' ? mineKind : null, el('button', { class: 'btn small' }, 'אני אביא את זה')),
      g.member ? el('p', { class: 'muted small' }, 'מה שתיקח/י ייכנס גם לרשימת הקניות שלך באוהל.') : null);

    // the comments
    const text = el('input', { type: 'text', maxlength: 600, 'aria-label': 'תגובה', placeholder: 'כתבו משהו לכולם' });
    const comments = el('section', { class: 'card ga-comments' },
      el('h2', {}, 'תגובות'),
      g.comments.length ? el('ul', {}, g.comments.map((c) => el('li', {}, el('b', {}, c.name), ': ', c.text,
        c.mine ? el('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'מחיקת התגובה', onclick: async () => { try { await call(`/comments/${c.id}`, { method: 'DELETE' }); draw(); } catch (e) { say(e); } } }, '✕') : null))) : null,
      el('form', { class: 'ga-inline', onsubmit: async (e) => {
        e.preventDefault();
        if (!answered) return toast(ERR.answer_first);
        if (!text.value.trim()) return;
        try { await call('/comments', { body: { text: text.value } }); draw(); } catch (err) { say(err); }
      } }, text, el('button', { class: 'btn small' }, 'שליחה')));

    const notes = [...g.warnings, ...g.food_notes];
    root.replaceChildren(el('section', { class: 'ga ga-invite' },
      el('header', { class: 'card ga-head' },
        el('small', { class: 'muted' }, 'הזמנה למפגש משפחתי'),
        el('h1', {}, g.title), el('p', {}, g.when),
        g.place ? el('p', {}, g.map ? el('a', { href: g.map, target: '_blank', rel: 'noopener noreferrer' }, '📍 ' + g.place) : '📍 ' + g.place) : null,
        g.note ? el('p', { class: 'muted' }, g.note) : null,
        el('p', { class: 'ga-total' }, g.total ? `מגיעים: ${g.total}${g.coming.length ? ' · ' + g.coming.map((c) => c.count > 1 ? `${c.name} (${c.count})` : c.name).join(', ') : ''}` : 'עוד אין אישורים. תהיו הראשונים!')),
      notes.length ? el('div', { class: 'notice ga-notes' }, el('ul', {}, notes.map((x) => el('li', {}, x)))) : null,
      rsvp,
      items,
      el('section', { class: 'card ga-cal' },
        el('h2', {}, 'שלא תשכחו'),
        el('div', { class: 'ga-acts' },
          el('a', { class: 'btn', href: g.google, target: '_blank', rel: 'noopener' }, 'הוספה ליומן Google'),
          el('a', { class: 'btn ghost', href: g.ics, download: 'gathering.ics' }, 'אייפון ו־Outlook')),
        el('p', { class: 'muted small' }, 'עם תזכורת יום לפני, ושעתיים לפני.')),
      comments,
      // after the answer: the door to the rest (only now – the first minute is the gathering alone)
      answered && !g.member ? el('section', { class: 'card ga-join' },
        el('p', {}, 'משתמשים באוהל? היכנסו, ומה שתביאו ייכנס לרשימת הקניות שלכם, והמפגש ללוח השנה.'),
        el('a', { class: 'btn small', href: '/api/auth/login?next=' + encodeURIComponent('/gather/invite/#' + token),
          onclick: () => { try { navigator.sendBeacon?.(base + '/event', new Blob([JSON.stringify({ kind: 'signin' })], { type: 'application/json' })); } catch (_) { /* fine */ } } }, 'כניסה עם Google')) : null,
      el('p', { class: 'muted small ga-fine' }, 'ההזמנה הזו מהאוהל: מי שיש לו את הקישור רואה רק את המפגש ואת השמות הפרטיים של מי שמגיע.')));
  }
  addEventListener('hashchange', () => location.reload());
  draw();
})();
