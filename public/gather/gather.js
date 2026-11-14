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
      el('button', { class: 'btn small ghost ga-calc-open', type: 'button', onclick: () => calcSheet(g, again) }, 'מחשבון אוכל'),
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

  /* ---------- the food calculator (docs/design/gather-calc.md): how many, which meal, who eats what → a list to tick.
     The proposal comes from the server's rules (server/gather-rules.ts, foodPlan); the host's changes stay while the
     numbers change: what they unticked or removed, and what they added themselves. ---------- */
  function calcSheet(g, after) {
    const d = g.calc || {};
    const st = { adults: d.adults || 10, kids: d.kids || 0, veg: d.veg || 0, vegan: d.vegan || 0, gf: d.gf || 0, meal: 'lunch', kosher: d.kosher || '' };
    const DIET = { veg: 'צמחוני', vegan: 'טבעוני', gf: 'ללא גלוטן' };
    let rows = [], first = true, timer = 0, seq = 0;
    const off = new Set(), gone = new Set(), mine = [];           // by title: unticked, removed; the host's own rows
    const list = el('ul', { class: 'ga-calc-items' });
    const count = el('small', { class: 'muted' });
    const go = el('button', { class: 'btn primary', type: 'submit' });
    const stepper = (key, label, small) => {
      const out = el('output', { 'aria-live': 'polite' }, String(st[key]));
      const step = (n) => { st[key] = Math.max(0, Math.min(300, st[key] + n)); out.textContent = String(st[key]); soon(); };
      return el('div', { class: small ? 'ga-count small' : 'ga-count' }, el('span', {}, label),
        el('button', { class: 'btn', type: 'button', 'aria-label': `פחות ${label}`, onclick: () => step(-1) }, '−'), out,
        el('button', { class: 'btn', type: 'button', 'aria-label': `עוד ${label}`, onclick: () => step(1) }, '+'));
    };
    const seg = (name, legend, opts) => el('fieldset', { class: 'ga-seg' }, el('legend', {}, legend),
      opts.map(([v, t]) => el('label', {}, el('input', { type: 'radio', name, value: v, checked: st[name] === v, onchange: () => { st[name] = v; soon(); } }), el('span', {}, t))));
    const draw = () => {
      const all = [...rows.filter((r) => !gone.has(r.title)), ...mine];
      const on = all.filter((r) => !off.has(r.title));
      list.removeAttribute('aria-busy');
      list.replaceChildren(...all.map((r, i) => {
        const id = `ci-${i}`;
        const box = el('input', { type: 'checkbox', id, checked: !off.has(r.title), 'aria-label': r.title, onchange: () => { if (box.checked) off.delete(r.title); else off.add(r.title); draw(); } });
        const qty = el('input', { class: 'ga-qty', type: 'text', maxlength: 30, value: r.qty, 'aria-label': `כמות ${r.title}`, oninput: () => { r.qty = qty.value; } });
        return el('li', { class: 'ga-calc-item' + (off.has(r.title) ? ' off' : '') + (r.fresh ? ' new' : '') }, box,
          el('label', { for: id }, r.title, r.diet ? el('small', { class: 'ga-kind' }, DIET[r.diet]) : null), qty,
          el('button', { class: 'ga-calc-x', type: 'button', 'aria-label': `הסרת ${r.title}`, onclick: () => { if (r.own) mine.splice(mine.indexOf(r), 1); else gone.add(r.title); off.delete(r.title); draw(); } }));
      }));
      for (const r of mine) if (r.fresh) setTimeout(() => { r.fresh = false; }, 1000);
      count.textContent = `${on.length} מתוך ${all.length} מסומנים`;
      go.textContent = `הוספה למי מביא מה (${on.length})`;
      go.disabled = !on.length;
    };
    const make = async () => {
      const n = ++seq;
      list.setAttribute('aria-busy', 'true');
      if (first) list.replaceChildren(...Array.from({ length: 5 }, () => el('li', { class: 'ga-calc-item' })));
      try {
        const r = await api(`/api/gather/${g.id}/calc`, { body: { adults: st.adults, kids: st.kids, veg: st.veg, vegan: st.vegan, gf: st.gf, meal: st.meal, kosher: st.kosher } });
        if (n !== seq) return;                                    // a newer tap already asked again
        rows = r.items; first = false; draw();
      } catch (e) { list.removeAttribute('aria-busy'); say(e); }
    };
    const soon = () => { clearTimeout(timer); timer = setTimeout(make, 200); };
    const extra = el('input', { type: 'text', maxlength: 60, placeholder: 'פריט נוסף', 'aria-label': 'פריט נוסף' });
    const addOwn = () => {
      const t = extra.value.trim();
      if (!t) return extra.focus();
      if (![...rows, ...mine].some((r) => r.title === t && !gone.has(t))) mine.push({ title: t, qty: '', kind: '', diet: '', own: true, fresh: true });
      gone.delete(t); off.delete(t); extra.value = ''; draw(); extra.focus();
    };
    extra.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addOwn(); } });
    const submit = async (e) => {
      e.preventDefault();
      const chosen = [...rows.filter((r) => !gone.has(r.title)), ...mine].filter((r) => !off.has(r.title))
        .map((r) => ({ title: r.title, qty: r.qty, kind: g.food === 'kosher' ? r.kind : '' }));
      if (!chosen.length) return;
      go.disabled = true;
      try {
        const r = await api(`/api/gather/${g.id}/items/many`, { body: { items: chosen } });
        H.closeModal();
        toast(r.skipped ? `נוספו ${r.added}; הרשימה מלאה, ${r.skipped} לא נכנסו` : `נוספו ${r.added} פריטים לרשימה`);
        after();
      } catch (err) { go.disabled = false; say(err); }
    };
    H.modal(el('form', { class: 'ga-form ga-calc', onsubmit: submit },
      el('h2', {}, 'מחשבון אוכל'),
      el('p', { class: 'muted' }, 'כמה מגיעים ומה אוכלים, ונציע רשימה. אפשר לשנות הכול.'),
      el('div', { class: 'ga-calc-people' }, stepper('adults', 'מבוגרים'), stepper('kids', 'ילדים')),
      seg('meal', 'הארוחה', [['breakfast', 'בוקר'], ['lunch', 'צהריים'], ['dinner', 'ערב'], ['snacks', 'כיבוד']]),
      el('fieldset', { class: 'ga-calc-diets' }, el('legend', {}, 'מתוכם'), stepper('veg', 'צמחונים', true), stepper('vegan', 'טבעונים', true), stepper('gf', 'ללא גלוטן', true)),
      seg('kosher', 'כשרות', [['', 'לא משנה'], ['meat', 'בשרי'], ['dairy', 'חלבי'], ['parve', 'פרווה']]),
      el('section', { class: 'ga-calc-list', 'aria-live': 'polite' },
        el('h3', { class: 'ga-calc-head' }, 'ההצעה ', count), list,
        el('div', { class: 'ga-inline ga-calc-add' }, extra, el('button', { class: 'btn', type: 'button', onclick: addOwn }, 'הוספה'))),
      el('div', { class: 'ga-calc-foot' }, go)));
    make();
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
