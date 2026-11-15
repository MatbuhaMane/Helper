/* יד ביד, שלב 1 (docs/vision/yad-beyad.md; the look is design's: public/tools/yad/yad.css, markup docs/design/yad.md).
   Locked behind the owner switch "yad": while it is off the server answers 404 to everyone but the owner, and this page says so.
   Phone first. Hands are shown with the hand glyph, never as money. No GPS: the area is chosen by hand. */
(async () => {
  const { el, api, toast } = H;
  const r = await H.requireLogin();
  H.header('יד ביד');
  const root = document.querySelector('main');
  const isOwner = r.user && r.user.role === 'owner';
  const hands = (t) => (t % 10 === 0 ? String(t / 10) : (t / 10).toFixed(1));
  const hand = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'yd-h'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = '<use href="#yd-hand"/>'; return s; };
  const amount = (t) => el('b', {}, hand(), ' ' + hands(t));
  const WHY = {
    not_found: 'לא נמצא.', no_funds: 'אין מספיק ידיים.', frozen: 'החשבון הוקפא.', removed: 'הוצאת מיד ביד.', declaration_needed: 'צריך לסמן את ההצהרה על הרישיון.',
    own_need: 'זה הצורך שלך.', not_open: 'הצורך כבר לא פתוח.', half_hours: 'הזמן: חצי שעה עד 24 שעות.', level: 'חסר שם או רמה.', fund_reason: 'כתבו שורה: למה מהקופה.',
    consent: 'צריך לסמן שהאדם יודע ומסכים.', reason: 'כתבו סיבה קצרה.', slow_down: 'לאט, נסו עוד דקה.', forbidden: 'אין לכם הרשאה לזה.', region: 'האזור לא מוכר.',
  };
  const why = (e) => WHY[e?.code] || WHY[e?.message] || e?.message || 'משהו השתבש.';
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); return true; } catch (e) { toast(why(e)); return false; } };

  /* the gate: a member sees nothing while the switch is off */
  let cat;
  try { cat = await api('/api/yad/catalog'); } catch (e) {
    root.append(el('section', { class: 'card', style: 'margin:24px auto;max-width:520px;padding:18px;text-align:center' }, el('p', {}, e.status === 404 || e.code === 'not_found' ? 'הכלי הזה עוד לא נפתח.' : why(e))));
    return;
  }
  document.body.insertAdjacentHTML('afterbegin', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="yd-hand" viewBox="0 0 24 24"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-4.8-2.4L4.5 14.5a1.6 1.6 0 0 1 2.6-1.9L8 14"/></symbol></svg>');
  root.classList.add('yd');
  const typeById = new Map(cat.types.map((t) => [t.id, t]));
  const regionName = (id) => (cat.regions.find((x) => x.id === id) || {}).name || '';
  let view = 'home', dash = null, mine = null;

  const seg = (opts, cur, on) => el('div', { class: 'yd-seg', role: 'group' }, ...opts.map(([k, label]) => el('button', { type: 'button', 'aria-pressed': String(k === cur), onclick: () => on(k) }, label)));
  const tag = (txt, cls = '') => el('span', { class: 'yd-tag ' + cls }, txt);
  const STATUS = { open: ['פתוח', ''], offered: ['מישהו הציע לעזור', 'act'], agreed: ['סגרתם, מחכה לאישור משני הצדדים', 'act'], done: ['הושלם', ''], cancelled: ['בוטל', ''], removed: ['הוסר', ''], rejected: ['לא אושר', ''] };

  /* ---------- the board (a sheet) ---------- */
  async function openBoard(sort = 'distance') {
    let list;
    try { list = (await api('/api/yad/board?sort=' + sort)).needs; } catch (e) { return toast(why(e)); }
    const body = el('div', { class: 'yd-sheet' }, el('h2', {}, 'לוח הדרושים'),
      seg([['distance', 'מרחק'], ['type', 'סוג']], sort, (k) => openBoard(k)),
      list.length ? el('div', { class: 'yd-needs' }, ...list.map((n) => el('article', { class: 'card yd-need' + (n.public_good ? ' pub' : '') },
        el('div', { class: 'tx' }, el('b', {}, n.title), n.detail ? el('small', {}, n.detail) : null,
          el('span', { class: 'yd-tags' }, n.public_good ? tag(n.from_ohel ? 'מאת האוהל · לטובת הציבור' : 'לטובת הציבור', 'pub') : null, n.range ? tag(n.range.label) : null,
            tag(n.level_name), tag((n.half_hours / 2) + ' שעות'), (typeById.get(n.type_id) || {}).declaration && (typeById.get(n.type_id) || {}).declaration !== 'none' ? tag('לפי הצהרת המשתמש') : null)),
        el('div', { class: 'go' }, amount(n.gross), el('button', { class: 'btn primary', type: 'button', onclick: async () => { if (await act(() => api(`/api/yad/needs/${n.id}/offer`, { method: 'POST', body: {} }), 'ההצעה נשלחה')) { H.closeModal(); load(); } } }, 'אני יכול לעזור'),
          el('button', { class: 'yd-link', type: 'button', onclick: () => reportSheet('need', n.id) }, 'דיווח')))))
        : el('p', { class: 'yd-empty' }, 'אין עכשיו צרכים פתוחים. כשיפורסם צורך מתאים תקבלו הודעה.'));
    H.modal(body);
  }
  function reportSheet(kind, target) {
    const t = el('textarea', { rows: 3, maxlength: 300, placeholder: 'מה לא תקין?' });
    H.modal(el('div', { class: 'yd-sheet' }, el('h2', {}, 'דיווח'), t,
      el('button', { class: 'btn primary', type: 'button', onclick: async () => { if (await act(() => api('/api/yad/reports', { method: 'POST', body: { kind, target, reason: t.value } }), 'הדיווח נשלח לבעלים')) H.closeModal(); } }, 'שליחה')));
  }

  /* ---------- creating a need / reporting a deed ---------- */
  function createSheet(deedMode = false) {
    const kind = deedMode ? 'deed' : 'service';
    let listed = true, typeId = '', pay = 'person';
    const wrap = el('div', { class: 'yd-sheet' });
    const hh = el('input', { type: 'number', min: 1, max: 48, value: 2, inputmode: 'numeric' });
    const title = el('input', { type: 'text', maxlength: 120, placeholder: 'במה צריך עזרה' });
    const detail = el('textarea', { rows: 2, maxlength: 1000, placeholder: 'פרטים (בלי כתובת מדויקת: אותה כותבים אחרי שמסכימים)' });
    const dif = el('select', {}, ...[0, 1, 2].map((v) => el('option', { value: v }, ['קל', 'בינוני', 'קשה'][v])));
    const exp = el('select', {}, ...[0, 1, 2].map((v) => el('option', { value: v }, ['בלי מומחיות', 'קצת ניסיון', 'מקצוען'][v])));
    const reason = el('input', { type: 'text', maxlength: 300, placeholder: 'למה מהקופה (רק הבעלים קורא)' });
    const forName = el('input', { type: 'text', maxlength: 80, placeholder: 'עבור מי (לא חובה)' });
    const consent = el('input', { type: 'checkbox' });
    const sel = el('select', {}, el('option', { value: '' }, 'בחרו סוג…'), ...cat.types.filter((t) => t.kind === kind).map((t) => el('option', { value: t.id }, t.name)));
    sel.onchange = () => { typeId = sel.value; draw(); };
    const lvl = el('p', { class: 'yd-note' });
    function draw() {
      const t = typeById.get(typeId);
      lvl.textContent = listed && t ? (t.note || '') : (!listed ? 'סוג שלא ברשימה מחכה לאישור הבעלים. עד אז רק את/ה רואה אותו.' : '');
      wrap.querySelectorAll('[data-unl]').forEach((n) => { n.hidden = listed; });
      wrap.querySelectorAll('[data-fund]').forEach((n) => { n.hidden = pay !== 'fund'; });
      wrap.querySelectorAll('[data-lst]').forEach((n) => { n.hidden = !listed; });
    }
    const paySeg = el('div', { class: 'yd-seg', role: 'group' });
    const payBtns = [['person', 'משלם/ת בידיים'], ['fund', 'מהקופה']].map(([k, l]) => el('button', { type: 'button', 'aria-pressed': String(k === pay), onclick: () => { pay = k; payBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['person', 'fund'][i] === pay))); draw(); } }, l));
    paySeg.append(...payBtns);
    wrap.append(el('h2', {}, deedMode ? 'עשיתי מעשה' : 'יצירת צורך'),
      seg([['y', 'מהרשימה'], ['n', 'לא ברשימה']], 'y', (k) => { listed = k === 'y'; wrap.querySelectorAll('.yd-seg')[0].querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === listed))); draw(); }),
      el('label', { class: 'field', 'data-lst': 1 }, el('span', {}, 'סוג'), sel),
      el('label', { class: 'field', 'data-unl': 1, hidden: true }, el('span', {}, 'שם'), title),
      el('div', { 'data-unl': 1, hidden: true, class: 'yd-pair' }, el('label', { class: 'field' }, el('span', {}, 'קושי'), dif), el('label', { class: 'field' }, el('span', {}, 'בקיאות'), exp)),
      el('label', { class: 'field' }, el('span', {}, 'כמה זמן, בחצאי שעה (2 = שעה)'), hh), lvl,
      deedMode ? null : detail,
      deedMode ? null : el('div', {}, paySeg),
      deedMode ? null : el('div', { 'data-fund': 1, hidden: true, class: 'yd-q' }, reason, forName, el('label', { class: 'yd-check' }, consent, el('span', {}, 'האדם יודע ומסכים'))),
      el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        const base = { half_hours: Number(hh.value), ...(listed ? { type_id: typeId || null } : { title: title.value, difficulty: Number(dif.value), expertise: Number(exp.value) }) };
        if (listed && !typeId) return toast('בחרו סוג מהרשימה.');
        const ok = await act(() => api(deedMode ? '/api/yad/deeds' : '/api/yad/needs', { method: 'POST', body: deedMode ? base : { ...base, detail: detail.value, pay, fund_reason: reason.value, for_name: forName.value, consent: consent.checked } }), deedMode ? 'המעשה נשלח לאישור הבעלים' : 'הצורך נשמר');
        if (ok) { H.closeModal(); load(); }
      } }, deedMode ? 'שליחה לאישור' : 'פרסום'));
    draw(); H.modal(wrap);
  }

  /* ---------- one of my needs: the steps of the flow ---------- */
  async function needSheet(n, mineAsker) {
    const body = el('div', { class: 'yd-sheet' }, el('h2', {}, n.title), el('p', {}, STATUS[n.status]?.[0] || n.status), n.reject_why ? el('p', { class: 'yd-note' }, 'הסיבה: ' + n.reject_why) : null, amount(n.gross || 0));
    const row = el('div', { class: 'yd-qacts' });
    const done = () => { H.closeModal(); load(); };
    if (mineAsker && n.status === 'offered') row.append(el('button', { class: 'btn primary', onclick: async () => { if (await act(() => api(`/api/yad/needs/${n.id}/answer`, { method: 'POST', body: { accept: true } }), 'סגרתם')) done(); } }, 'מאשר/ת'), el('button', { class: 'btn', onclick: async () => { if (await act(() => api(`/api/yad/needs/${n.id}/answer`, { method: 'POST', body: { accept: false } }))) done(); } }, 'לא הפעם'));
    if (n.status === 'agreed') {
      if (mineAsker) { const a = el('input', { type: 'text', maxlength: 300, placeholder: 'הכתובת המדויקת (רק שני הצדדים רואים)' }); body.append(el('div', { class: 'yd-q' }, a, el('button', { class: 'btn', onclick: () => act(() => api(`/api/yad/needs/${n.id}/address`, { method: 'PUT', body: { address: a.value } }), 'הכתובת נשמרה') }, 'שמירת כתובת'))); }
      const show = el('p', { class: 'yd-note' });
      body.append(show, el('button', { class: 'yd-link', onclick: async () => { try { show.textContent = (await api(`/api/yad/needs/${n.id}/address`)).address || 'עוד לא נכתבה כתובת.'; } catch (e) { toast(why(e)); } } }, 'הצגת הכתובת'));
      row.append(el('button', { class: 'btn primary', onclick: async () => { if (await act(() => api(`/api/yad/needs/${n.id}/confirm`, { method: 'POST', body: {} }), 'אישרת. כשגם הצד השני יאשר הידיים יעברו')) done(); } }, 'זה בוצע'));
    }
    if (mineAsker && n.status === 'done') { const t = el('input', { type: 'text', maxlength: 300, placeholder: 'המלצה קצרה (לא חובה)' }); body.append(el('div', { class: 'yd-q' }, t, el('button', { class: 'btn', onclick: () => act(() => api(`/api/yad/needs/${n.id}/recommend`, { method: 'POST', body: { text: t.value } }), 'תודה') }, 'שליחת המלצה'))); }
    if (mineAsker && ['open', 'offered', 'agreed'].includes(n.status)) row.append(el('button', { class: 'btn', onclick: async () => { if (await act(() => api(`/api/yad/needs/${n.id}/cancel`, { method: 'POST', body: {} }), 'בוטל')) done(); } }, 'ביטול'));
    body.append(row); H.modal(body);
  }

  const rowOf = (n, asker) => el('li', {}, el('button', { class: 'yd-row', type: 'button', style: 'inline-size:100%;text-align:start', onclick: () => needSheet(n, asker) },
    el('div', { class: 'tx' }, el('b', {}, n.title), el('span', { class: 'yd-tags' }, ...(n.waits_owner ? [tag('ממתין לאישור הבעלים, רק את/ה רואה אותו', 'pend')] : [tag(STATUS[n.status]?.[0] || n.status, STATUS[n.status]?.[1] || '')]))), n.gross ? el('span', { class: 'yd-amt' }, amount(n.gross)) : null));
  const list = (title, items, mk) => {
    const active = items.filter((n) => ['open', 'offered', 'agreed'].includes(n.status)), past = items.filter((n) => !active.includes(n));
    let tab = 'a'; const ul = el('ul', { class: 'yd-rows' });
    const draw = () => { ul.replaceChildren(...((tab === 'a' ? active : past).map(mk)), ...(((tab === 'a' ? active : past).length) ? [] : [el('li', { class: 'yd-empty' }, 'אין כאן כלום עדיין')])); };
    const head = el('header', {}, el('h2', {}, title), seg([['a', 'פעילים'], ['p', 'מהעבר']], 'a', (k) => { tab = k; head.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === (k === 'a')))); draw(); }));
    draw(); return el('section', { class: 'card yd-list' }, head, ul);
  };

  /* ---------- the screens ---------- */
  async function load() {
    [dash, mine] = await Promise.all([api('/api/yad/dashboard'), api('/api/yad/mine')]);
    draw();
  }
  function draw() {
    root.replaceChildren();
    if (view === 'profile') return drawProfile();
    if (view === 'fund') return drawFund();
    const back = el('a', { class: 'yd-back', href: '/tools/' }, '‹ כלים');
    const banner = el('section', { class: 'card yd-banner' }, el('div', { class: 'grow' }, el('h1', {}, 'יד ביד'), el('p', {}, 'לתת יד: עוזרים זה לזה ולקהילה'),
      el('span', { class: 'yd-area' }, cat.region ? regionName(cat.region) + ' · ' : 'עוד לא בחרתם אזור · ', el('button', { class: 'yd-link', type: 'button', onclick: () => { view = 'profile'; draw(); } }, 'שינוי'))));
    const fig = (cls, label, ...kids) => el('div', { class: 'card yd-fig ' + cls }, el('small', {}, label), ...kids);
    const pair = (a, b) => el('p', { class: 'gr' }, el('em', {}, a), el('b', {}, hands(b)));
    const dashEl = el('section', { class: 'yd-dash' },
      fig('bal', 'היתרה שלי', amount(dash.balance)),
      fig('ex', 'נתתי וקיבלתי', el('div', { class: 'yd-pair' }, el('div', {}, el('span', {}, 'בחודש הזה'), pair('נתתי', dash.gave_month), pair('קיבלתי', dash.received_month)), el('div', {}, el('span', {}, 'בסך הכול'), pair('נתתי', dash.gave_total), pair('קיבלתי', dash.received_total)))),
      el('button', { class: 'card yd-fig', type: 'button', onclick: () => { view = 'fund'; draw(); } }, el('small', {}, 'התרומה שלי לקופה'), amount(dash.tithe), el('span', { class: 'yd-more' }, 'לדף הקופה ‹')),
      fig('wait' + (dash.waiting ? ' has' : ''), 'מחכה לי', el('b', {}, String(dash.waiting))));
    const acts = el('div', { class: 'yd-acts' }, el('button', { class: 'btn primary', type: 'button', onclick: () => openBoard() }, 'לוח הדרושים'), el('button', { class: 'btn', type: 'button', onclick: () => createSheet(false) }, 'יצירת צורך'));
    const more = el('p', {}, el('button', { class: 'yd-link', type: 'button', onclick: () => createSheet(true) }, 'עשיתי מעשה לטובת הקהילה'), ' · ', el('button', { class: 'yd-link', type: 'button', onclick: rules }, 'כללי יד ביד'), isOwner ? [' · ', el('button', { class: 'yd-link', type: 'button', onclick: queueSheet }, 'מחכה לאישור שלי')] : null);
    const filled = mine.helps.map((h) => ({ ...h, status: h.status }));
    root.append(back, banner, dashEl, acts, more,
      el('div', { class: 'yd-lists' }, list('הצרכים שמילאתי', filled, (n) => rowOf(n, false)), list('הצרכים שלי', mine.needs, (n) => rowOf(n, true))),
      mine.deeds.length ? el('section', { class: 'card yd-list' }, el('h2', {}, 'המעשים שדיווחתי'), el('ul', { class: 'yd-rows' }, ...mine.deeds.map((d) => el('li', {}, el('div', { class: 'yd-row' }, el('div', { class: 'tx' }, el('b', {}, d.title), el('span', { class: 'yd-tags' }, tag(d.status === 'approved' ? 'אושר' : d.status === 'rejected' ? 'לא אושר: ' + d.reject_why : 'ממתין לאישור', d.status === 'pending' ? 'pend' : ''))))))) ) : null);
  }
  function rules() {
    H.modal(el('div', { class: 'yd-sheet' }, el('h2', {}, 'כללי יד ביד'), el('ol', { class: 'yd-rules' },
      el('li', {}, 'ידיים אין להן ערך כספי, ואי אפשר להמיר אותן לכסף.'), el('li', {}, 'אין שירותים משפטיים. שירות מקצועי מופיע רק "לפי הצהרת המשתמש": האוהל לא בודק רישיונות.'),
      el('li', {}, 'בשלב הזה מגיל 18, במשפחה ובין חברים. הצהרה שקרית היא סיבה להוצאה מהמערכת.'), el('li', {}, 'עשירית מכל מה שמרוויחים הולכת לקופה הציבורית. סגירת חשבון מבטלת את הידיים, בלי פיצוי.'))));
  }
  function drawProfile() {
    const mineOff = new Map(cat.offers.map((o) => [o.type_id, o.declared]));
    const checks = new Map(); const decl = new Map();
    const group = (kind, label) => el('details', {}, el('summary', {}, label), el('div', { class: 'yd-checks' }, ...cat.types.filter((t) => t.kind === kind).map((t) => {
      const c = el('input', { type: 'checkbox', checked: mineOff.has(t.id) }); checks.set(t.id, c);
      const d = t.declaration !== 'none' ? el('input', { type: 'checkbox', checked: mineOff.get(t.id) === 1 }) : null; if (d) decl.set(t.id, d);
      return el('div', {}, el('label', { class: 'yd-check' }, c, el('span', {}, t.name), t.declaration !== 'none' ? tag('דורש רישיון', 'pend') : null),
        t.note ? el('small', { class: 'yd-note' }, t.note) : null,
        d ? el('label', { class: 'yd-check yd-decl' }, d, el('span', {}, t.declaration === 'driving' ? 'יש לי רישיון נהיגה בתוקף, והרכב מבוטח. האוהל לא בודק זאת.' : 'אני מצהיר/ה שיש לי רישיון לעסוק בזה. האוהל לא בודק זאת. הצהרה שקרית היא סיבה להוצאה.')) : null);
    })));
    const area = el('select', {}, el('option', { value: '' }, 'בחרו…'), ...cat.regions.map((x) => el('option', { value: x.id, selected: x.id === cat.region }, x.name)));
    root.append(el('a', { class: 'yd-back', href: '#', onclick: (e) => { e.preventDefault(); view = 'home'; draw(); } }, '‹ יד ביד'), el('h1', {}, 'מה אני מוכן לתת'),
      el('p', { style: 'color:var(--muted)' }, 'מסמנים סוגים מהרשימה. כשמתפרסם צורך מתאים תקבלו הודעה, לפי רמת הניג\'וס. אין לוח הצעות.'),
      el('section', { class: 'card yd-give' }, group('service', 'שירותים בין חברים'), group('deed', 'מעשים לקהילה')),
      el('section', { class: 'card yd-give' }, el('h2', {}, 'האזור שלי'), el('label', { class: 'field' }, el('span', {}, 'יישוב או אזור'), area),
        el('p', { class: 'yd-note' }, 'בוחרים פעם אחת, ביד. אחרים רואים רק טווח מרחק, כמו "עד 5 ק"מ". הכתובת המדויקת עוברת רק בין שני הצדדים, אחרי שהסכימו.')),
      el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        const offers = [...checks].filter(([, c]) => c.checked).map(([id]) => ({ type_id: id, declared: decl.has(id) ? decl.get(id).checked : undefined }));
        if (await act(async () => { await api('/api/yad/region', { method: 'PUT', body: { region: area.value || null } }); await api('/api/yad/offers', { method: 'PUT', body: { offers } }); }, 'נשמר')) { cat = await api('/api/yad/catalog'); view = 'home'; await load(); }
      } }, 'שמירה'),
      el('p', {}, el('button', { class: 'yd-link', type: 'button', onclick: () => { if (confirm('סגירת החשבון ב"יד ביד" מבטלת את כל הידיים שלכם: הן עוברות לקופה, בלי פיצוי. להמשיך?')) act(() => api('/api/yad/close', { method: 'POST', body: {} }), 'החשבון נסגר'); } }, 'סגירת החשבון ביד ביד')));
  }
  async function drawFund() {
    const f = await api('/api/yad/fund');
    root.append(el('a', { class: 'yd-back', href: '#', onclick: (e) => { e.preventDefault(); view = 'home'; draw(); } }, '‹ יד ביד'),
      el('section', { class: 'card yd-pot' }, el('small', {}, 'הקופה הציבורית'), amount(f.balance), el('p', {}, 'עשירית מכל יד שמרוויחים נכנסת לכאן, ועוזרת למי שלא יכול לתת.')),
      el('section', { class: 'card yd-pub-ask' }, el('h2', {}, 'התרומה שלי לקופה'), el('p', {}, el('b', {}, hands(dash.tithe)), ' ידיים עד עכשיו')),
      el('section', { class: 'card yd-list' }, el('h2', {}, 'ההוצאות האחרונות'), el('ul', { class: 'yd-rows' }, ...(f.recent.length ? f.recent.map((x) => el('li', {}, el('div', { class: 'yd-row' }, el('div', { class: 'tx' }, el('b', {}, x.what), el('small', {}, new Date(x.at).toLocaleDateString('he-IL'))), el('span', { class: 'yd-amt' }, amount(x.tenths))))) : [el('li', { class: 'yd-empty' }, 'עוד לא יצאה הוצאה')]))));
  }

  /* ---------- the owner's queue (the "ממתין לאישור" page gets a "יד ביד" filter and this count; until then it opens here) ---------- */
  async function queueSheet() {
    let q; try { q = await api('/api/yad/queue'); } catch (e) { return toast(why(e)); }
    const reason = () => el('input', { type: 'text', maxlength: 300, placeholder: 'סיבה קצרה, נשלחת לאדם' });
    const card = (title, lines, buttons) => el('article', { class: 'card yd-q' }, el('b', {}, title), ...lines.map((l) => el('small', {}, l)), el('div', { class: 'yd-qacts' }, ...buttons));
    const post = async (url, body) => { if (await act(() => api(url, { method: 'POST', body }), 'בוצע')) { H.closeModal(); queueSheet(); } };
    const items = [
      ...q.deeds.map((d) => { const why1 = reason(), hh = el('input', { type: 'number', min: 1, max: 48, value: d.half_hours, 'aria-label': 'חצאי שעה' }); return card('מעשה: ' + d.title, [d.email, d.level_ok ? '' : 'סוג שלא ברשימה, מחכה לרמה'], [hh, el('button', { class: 'btn primary', onclick: () => post('/api/yad/queue/deeds/' + d.id, { approve: true, half_hours: Number(hh.value) }) }, 'אישור'), why1, el('button', { class: 'btn', onclick: () => post('/api/yad/queue/deeds/' + d.id, { approve: false, reason: why1.value }) }, 'דחייה')]); }),
      ...q.needs.map((n) => { const why1 = reason(); return card('צורך: ' + n.title, [n.email, n.level_ok ? '' : `סוג שלא ברשימה (קושי ${n.difficulty}, בקיאות ${n.expertise})`, n.pay !== 'person' ? 'מהקופה: ' + n.fund_reason : '', n.for_name ? `עבור ${n.for_name}${n.consent ? ' (סומן שהאדם יודע ומסכים: לבדוק)' : ''}` : ''].filter(Boolean),
        [el('button', { class: 'btn primary', onclick: () => post('/api/yad/queue/needs/' + n.id, { approve: true }) }, 'אישור'), ...(n.level_ok ? [] : [el('button', { class: 'btn', onclick: () => post('/api/yad/queue/needs/' + n.id, { approve: true, add_to_list: true }) }, 'אישור והוספה לרשימה')]), why1, el('button', { class: 'btn', onclick: () => post('/api/yad/queue/needs/' + n.id, { approve: false, reason: why1.value }) }, 'דחייה')]); }),
      ...q.reports.map((x) => card(`דיווח (${x.kind}): ${x.reason}`, ['על: ' + x.target], [['dismiss', 'לדחות'], ['remove_need', 'להסיר את הצורך'], ['remove_person', 'להוציא את האדם']].map(([a, l]) => el('button', { class: 'btn', onclick: () => post('/api/yad/queue/reports/' + x.id, { action: a }) }, l)))),
    ];
    H.modal(el('div', { class: 'yd-sheet' }, el('h2', {}, 'ממתין לאישור: יד ביד (' + q.count + ')'), items.length ? el('div', { class: 'yd-qlist' }, ...items) : el('p', { class: 'yd-empty' }, 'אין כלום שמחכה.')));
  }

  await load();
  if (location.hash === '#queue') queueSheet();   // the link from "ממתין לאישור" in the messages page
})();
