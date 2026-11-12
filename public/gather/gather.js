/* מפגש משפחתי – the host's side (docs/business/gathering.md). A member makes a gathering, sends one link to the family's
   WhatsApp group, and sees here who is coming, what each one brings, the comments, and the day's warnings (Shabbat, a
   holiday, a fast). The invitation itself (no sign-in) is /gather/invite/. Everything is decided on the server
   (server/gather.ts); this page only shows what the server agreed to give. */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('מפגש משפחתי');
  const root = document.querySelector('main');
  const q = new URLSearchParams(location.search);
  const FOOD = [['', 'בלי כללים מיוחדים'], ['kosher', 'כשר (בשרי, חלבי, פרווה)'], ['halal', 'חלאל']];
  const KIND = { meat: 'בשרי', dairy: 'חלבי', parve: 'פרווה', '': '' };
  const COMING = { yes: 'מגיע/ה', no: 'לא מגיע/ה', maybe: 'אולי' };
  const ERR = { title_required: 'צריך שם למפגש.', bad_date: 'צריך תאריך.', too_many_tries: 'יותר מדי ניסיונות. נסו שוב בעוד שעה.', too_many_items: 'הרשימה מלאה.' };
  const say = (e) => toast(ERR[e?.code] || e?.message || 'משהו השתבש');
  const fullDate = (iso) => new Date(iso + 'T12:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  /* ---------- a new gathering, or its details ---------- */
  function form(g = {}, after) {
    const title = el('input', { type: 'text', maxlength: 80, required: true, value: g.title || '', 'aria-label': 'שם המפגש', placeholder: 'למשל: יום הולדת 80 לסבתא' });
    const date = el('input', { type: 'date', required: true, value: g.date || q.get('new') || '', 'aria-label': 'תאריך' });
    const time = el('input', { type: 'time', value: g.time || '', 'aria-label': 'שעה' });
    const place = el('input', { type: 'text', maxlength: 160, value: g.place || '', 'aria-label': 'מקום', placeholder: 'למשל: אצל דוד משה, חיפה' });
    const map = el('input', { type: 'url', dir: 'ltr', maxlength: 500, value: g.map || '', 'aria-label': 'קישור למפה', placeholder: 'https://maps.app.goo.gl/…' });
    const note = el('textarea', { rows: 3, maxlength: 1000, 'aria-label': 'הערה למוזמנים', placeholder: 'מה כדאי לדעת: חניה, קוד לבניין, הפתעה…' }, g.note || '');
    const food = el('select', { 'aria-label': 'האוכל' }, FOOD.map(([v, t]) => el('option', { value: v, selected: (g.food || '') === v }, t)));
    const save = async (e) => {
      e.preventDefault();
      const body = { title: title.value, date: date.value, time: time.value || null, place: place.value, map: map.value, note: note.value, food: food.value };
      try {
        const r = await api(g.id ? `/api/gather/${g.id}` : '/api/gather', { method: g.id ? 'PUT' : 'POST', body });
        H.closeModal();
        if (after) after(); else location.href = '/gather/?id=' + encodeURIComponent(r.id);
      } catch (err) { say(err); }
    };
    H.modal(el('form', { class: 'ga-form', onsubmit: save },
      el('h2', {}, g.id ? 'פרטי המפגש' : 'מפגש חדש'),
      el('label', {}, 'שם המפגש', title),
      el('div', { class: 'ga-two' }, el('label', {}, 'תאריך', date), el('label', {}, 'שעה (לא חובה)', time)),
      el('label', {}, 'מקום', place),
      el('label', {}, 'קישור למפה (לא חובה)', map),
      el('label', {}, 'האוכל', food),
      el('label', {}, 'הערה למוזמנים', note),
      el('div', { class: 'ga-acts' }, el('button', { class: 'btn primary' }, g.id ? 'שמירה' : 'יצירת המפגש'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'ביטול'))));
    setTimeout(() => title.focus(), 50);
  }

  /* ---------- the list: ideas from the family's days, and our gatherings ---------- */
  async function drawList() {
    let list = [], ideas = [];
    try { [list, ideas] = await Promise.all([api('/api/gather').then((r) => r.gatherings), api('/api/gather/ideas').then((r) => r.ideas).catch(() => [])]); } catch (e) { return say(e); }
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = list.filter((g) => g.date >= today && g.status === 'active'), past = list.filter((g) => !upcoming.includes(g));
    const row = (g) => el('div', { class: 'card ga-row' },
      el('h3', {}, el('a', { href: '/gather/?id=' + encodeURIComponent(g.id) }, g.title)),
      el('p', { class: 'muted' }, `${fullDate(g.date)}${g.time ? ' · ' + g.time : ''}${g.place ? ' · ' + g.place : ''}`),
      el('p', { class: 'small' }, g.status !== 'active' ? 'בוטל' : g.ours ? `${g.coming} מגיעים · ${g.answers} ענו` : 'הוזמנת'));
    root.replaceChildren(el('section', { class: 'ga' },
      el('header', { class: 'ga-head' }, el('h1', {}, 'מפגש משפחתי'), el('button', { class: 'btn primary', onclick: () => form() }, '+ מפגש חדש')),
      el('p', { class: 'muted' }, 'קישור אחד לקבוצת הווטסאפ של המשפחה: כל אחד עונה אם הוא מגיע ועם כמה, ובוחר מה הוא מביא, בלי הרשמה.'),
      ideas.length ? el('section', { class: 'card ga-ideas' }, el('h2', {}, 'רעיונות למפגש'),
        el('ul', {}, ideas.map((i) => el('li', {}, el('span', {}, `${i.title} · ${fullDate(i.date)}`),
          el('button', { class: 'btn small', onclick: () => form({ title: i.title, date: i.date }) }, 'לארגן'))))) : null,
      upcoming.length ? el('section', {}, el('h2', {}, 'בקרוב'), el('div', { class: 'ga-list' }, upcoming.map(row)))
        : el('p', { class: 'card ga-empty' }, 'עוד אין מפגש קרוב. ', el('button', { class: 'btn small primary', onclick: () => form() }, 'ליצור אחד')),
      past.length ? el('section', {}, el('h2', {}, 'שהיו'), el('div', { class: 'ga-list' }, past.map(row))) : null));
    if (q.get('new') && !q.get('id')) form();
  }

  /* ---------- one gathering ---------- */
  async function drawOne(id) {
    let g;
    try { g = await api('/api/gather/' + encodeURIComponent(id)); } catch (e) { root.replaceChildren(el('p', { class: 'card' }, 'המפגש לא נמצא. ', el('a', { href: '/gather/' }, 'לכל המפגשים'))); return; }
    const again = () => drawOne(id);
    const yes = g.rsvps.filter((r) => r.coming === 'yes'), total = yes.reduce((s, r) => s + r.count, 0);
    const answeredBy = new Set(g.rsvps.map((r) => r.name.trim().split(/\s+/)[0]));
    const copy = async () => { try { await navigator.clipboard.writeText(g.url); toast('הקישור הועתק'); } catch (_) { prompt('הקישור:', g.url); } };
    const act = (label, fn, cls = 'btn small', sure) => el('button', { class: cls, type: 'button', onclick: async () => { if (sure && !confirm(sure)) return; try { await fn(); again(); } catch (e) { say(e); } } }, label);
    const notes = [...g.warnings, ...g.food_notes];

    // whom to invite: the host's own list (from the tree or typed), and who of them answered
    const inviteName = el('input', { type: 'text', maxlength: 60, 'aria-label': 'שם להזמנה', placeholder: 'שם' });
    const saveInvitees = (list) => api('/api/gather/' + g.id, { method: 'PUT', body: { invitees: list } });
    const invitees = el('section', { class: 'card ga-invitees' },
      el('h2', {}, 'את מי להזמין'),
      el('p', { class: 'muted small' }, 'רשימה בשבילכם בלבד: המוזמנים לא רואים אותה. מי שכבר ענה מסומן.'),
      g.invitees.length ? el('ul', { class: 'ga-chips' }, g.invitees.map((n) => el('li', { class: answeredBy.has(n.trim().split(/\s+/)[0]) ? 'on' : '' },
        answeredBy.has(n.trim().split(/\s+/)[0]) ? '✓ ' : '', n,
        el('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'הסרה מהרשימה: ' + n, onclick: async () => { try { await saveInvitees(g.invitees.filter((x) => x !== n)); again(); } catch (e) { say(e); } } }, '✕')))) : null,
      el('form', { class: 'ga-inline', onsubmit: async (e) => { e.preventDefault(); if (!inviteName.value.trim()) return; try { await saveInvitees([...g.invitees, inviteName.value.trim()]); again(); } catch (err) { say(err); } } },
        inviteName, el('button', { class: 'btn small' }, 'הוספה'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => fromTree(g, saveInvitees, again) }, 'הצעה מעץ המשפחה')));

    // what to bring
    const itemTitle = el('input', { type: 'text', maxlength: 80, 'aria-label': 'מה צריך להביא', placeholder: 'למשל: עוגה, שתייה, כיסאות' });
    const itemKind = el('select', { 'aria-label': 'בשרי, חלבי או פרווה' }, [['', '—'], ['meat', 'בשרי'], ['dairy', 'חלבי'], ['parve', 'פרווה']].map(([v, t]) => el('option', { value: v }, t)));
    const items = el('section', { class: 'card ga-items' },
      el('h2', {}, 'מי מביא מה'),
      g.items.length ? el('ul', { class: 'ga-list-items' }, g.items.map((i) => el('li', {},
        el('b', {}, i.title), i.kind ? el('small', { class: 'ga-kind' }, KIND[i.kind]) : null,
        el('span', { class: 'muted' }, i.taker ? ` · ${i.taker} מביא/ה` : ' · עוד אין מי שמביא'),
        act('✕', () => api(`/api/gather/${g.id}/items/${i.id}`, { method: 'DELETE' }), 'btn small ghost', `להוריד את "${i.title}" מהרשימה?`)))) : el('p', { class: 'muted small' }, 'הוסיפו מה צריך, והמוזמנים יבחרו מה כל אחד מביא. מי שמשתמש באוהל ימצא את מה שלקח ברשימת הקניות שלו.'),
      el('form', { class: 'ga-inline', onsubmit: async (e) => { e.preventDefault(); if (!itemTitle.value.trim()) return; try { await api(`/api/gather/${g.id}/items`, { body: { title: itemTitle.value, kind: itemKind.value } }); again(); } catch (err) { say(err); } } },
        itemTitle, g.food === 'kosher' ? itemKind : null, el('button', { class: 'btn small' }, 'הוספה')));

    root.replaceChildren(el('section', { class: 'ga' },
      el('a', { class: 'folder-back', href: '/gather/' }, '‹ כל המפגשים'),
      el('header', { class: 'ga-head' },
        el('div', {}, el('h1', {}, g.title), el('p', {}, g.when), g.place ? el('p', {}, g.map ? el('a', { href: g.map, target: '_blank', rel: 'noopener noreferrer' }, '📍 ' + g.place) : '📍 ' + g.place) : null, g.note ? el('p', { class: 'muted' }, g.note) : null),
        el('button', { class: 'btn small ghost', onclick: () => form(g, again) }, 'עריכה')),
      notes.length ? el('div', { class: 'notice ga-notes' }, el('ul', {}, notes.map((n) => el('li', {}, n)))) : null,
      el('section', { class: 'card ga-share' },
        el('h2', {}, 'ההזמנה'),
        g.open ? [
          el('p', { class: 'muted small' }, 'מי שיש לו את הקישור רואה רק את המפגש: שם, תאריך, מקום, ושמות פרטיים של מי שמגיע. הקישור נסגר יום אחרי המפגש.'),
          el('div', { class: 'ga-acts' },
            el('a', { class: 'btn primary', href: g.whatsapp, target: '_blank', rel: 'noopener' }, 'שליחה לווטסאפ'),
            el('button', { class: 'btn', type: 'button', onclick: copy }, 'העתקת הקישור'),
            el('a', { class: 'btn ghost', href: g.url, target: '_blank', rel: 'noopener' }, 'איך זה נראה למוזמנים'),
            act('סגירת הקישור', () => api(`/api/gather/${g.id}/cancel`, { method: 'POST' }), 'btn ghost danger', 'לסגור את הקישור? מי שיפתח אותו יראה שהמפגש בוטל.'))]
          : [el('p', {}, g.status === 'active' ? 'הקישור נסגר: המפגש כבר עבר.' : 'הקישור סגור.'),
            g.status === 'active' ? null : act('פתיחה מחדש (קישור חדש)', () => api(`/api/gather/${g.id}/reopen`, { method: 'POST' }))],
        el('p', { class: 'muted small ga-stats' }, `נפתח ${g.stats.open || 0} פעמים · ${g.stats.rsvp || 0} ענו · ${g.stats.signin || 0} נכנסו לאוהל מההזמנה`)),
      el('section', { class: 'card ga-coming' },
        el('h2', {}, `מגיעים: ${total}`),
        g.rsvps.length ? el('ul', {}, g.rsvps.map((r) => el('li', {}, el('b', {}, r.name), ` · ${COMING[r.coming] || r.coming}`, r.coming === 'yes' && r.count > 1 ? ` (${r.count})` : '', r.member ? el('small', { class: 'muted' }, ' · משתמש/ת באוהל') : null, r.note ? el('p', { class: 'muted small' }, r.note) : null)))
          : el('p', { class: 'muted small' }, 'עוד אין תשובות. שלחו את הקישור לקבוצה.')),
      invitees,
      items,
      el('section', { class: 'card ga-comments' },
        el('h2', {}, 'תגובות'),
        g.comments.length ? el('ul', {}, g.comments.map((c) => el('li', {}, el('b', {}, c.name.split(/\s+/)[0]), ': ', c.text, el('small', { class: 'muted' }, ' ' + new Date(c.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })),
          act('✕', () => api(`/api/gather/${g.id}/comments/${c.id}`, { method: 'DELETE' }), 'btn small ghost', 'להוריד את התגובה?'))))
          : el('p', { class: 'muted small' }, 'המוזמנים יכולים לכתוב כאן מתוך ההזמנה.'))));
  }

  /* ---------- whom to invite, from the family tree (needs the vault open; the tree's privacy applies) ---------- */
  async function fromTree(g, saveInvitees, after) {
    let t;
    try { t = await api('/api/vault/tree', { noRedirect: true }); } catch (e) {
      return H.modal(el('div', { class: 'ga-form' }, el('h2', {}, 'הצעה מעץ המשפחה'), el('p', {}, 'עץ המשפחה שמור בכספת. פתחו אותה, וחזרו לכאן.'), el('a', { class: 'btn primary', href: '/family/' }, 'לעץ המשפחה')));
    }
    const people = t.people.filter((p) => p.name && p.name !== 'קרוב/ת משפחה');
    const kids = (id) => t.links.filter((l) => l.type === 'parent' && l.a === id).map((l) => l.b);
    const mates = (id) => t.links.filter((l) => l.type === 'partner' && (l.a === id || l.b === id) && l.status !== 'divorced' && l.status !== 'separated').map((l) => (l.a === id ? l.b : l.a));
    /** the person, their partner, their descendants and the descendants' partners */
    const family = (id) => { const out = new Set([id, ...mates(id)]), stack = [id, ...mates(id)]; while (stack.length) for (const c of kids(stack.pop())) if (!out.has(c)) { out.add(c); stack.push(c); for (const m of mates(c)) out.add(m); } return out; };
    const who = el('select', { 'aria-label': 'סביב מי המפגש' }, el('option', { value: '' }, 'בחרו…'), people.map((p) => el('option', { value: p.id }, p.name)));
    const list = el('div', { class: 'ga-pick' });
    const draw = () => {
      const ids = who.value ? [...family(who.value)] : [];
      list.replaceChildren(...ids.map((id) => t.people.find((p) => p.id === id)).filter((p) => p && p.name && p.name !== 'קרוב/ת משפחה')
        .map((p) => el('label', { class: 'ga-check' }, el('input', { type: 'checkbox', checked: !g.invitees.includes(p.name), value: p.name }), ' ', p.name)));
    };
    who.addEventListener('change', draw);
    H.modal(el('form', { class: 'ga-form', onsubmit: async (e) => {
      e.preventDefault();
      const chosen = [...list.querySelectorAll('input:checked')].map((x) => x.value);
      try { await saveInvitees([...new Set([...g.invitees, ...chosen])]); H.closeModal(); toast(`נוספו ${chosen.length} לרשימה`); after(); } catch (err) { say(err); }
    } },
      el('h2', {}, 'הצעה מעץ המשפחה'),
      el('p', { class: 'muted small' }, 'בחרו סביב מי המפגש (למשל סבתא), והאוהל יציע את הצאצאים ובני הזוג שלהם. השמות נשמרים ברשימה שלכם בלבד.'),
      el('label', {}, 'סביב מי', who), list,
      el('div', { class: 'ga-acts' }, el('button', { class: 'btn primary' }, 'הוספה לרשימה'), el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'ביטול'))));
  }

  if (q.get('id')) drawOne(q.get('id')); else drawList();
})();
