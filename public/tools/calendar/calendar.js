/* לוח שנה: the month – Gregorian, or the Hebrew month from its first day – with the Hebrew date of every day, the holidays,
   Rosh Chodesh, the fasts, the Israeli days of remembrance and the parasha of each Shabbat (with candle lighting and havdalah for the
   family's city); the family's own days (birthdays, memorial days, anniversaries – shared by everyone, kept on the server);
   reminders of what is coming, and the whole year to add to the phone's calendar (.ics, with its alarms).
   Beside the month, the year: every event of the Hebrew year, each with a short Hebrew description. From Hebcal (public).
   Hebcal's years are kept on this device (localStorage) so the calendar opens at once and works offline. */
(async () => {
  const { el, toast } = H;
  await H.requireLogin();
  H.header('לוח שנה');
  const P = H.prefs('calendar', { city: H.prefs('parasha', { city: '281184' }).city || '281184', kinds: ['major', 'minor', 'fast', 'modern', 'roshchodesh', 'family'], mode: 'greg', remind: 3 });
  if (!P.kinds.includes('family')) P.kinds.push('family');
  const CITIES = [['281184', 'ירושלים'], ['293397', 'תל אביב'], ['294801', 'חיפה'], ['295530', 'באר שבע']];
  const KINDS = [['major', 'חגים'], ['minor', 'מועדים'], ['fast', 'צומות'], ['modern', 'ימים לאומיים'], ['roshchodesh', 'ראשי חודשים'], ['family', 'משפחה']];
  const FAMILY = { birthday: ['🎂', 'יום הולדת'], yahrzeit: ['🕯️', 'יום זיכרון'], anniversary: ['💍', 'יום נישואין'], other: ['⭐', 'יום משפחתי'] };
  const root = document.querySelector('main');

  /* Hebrew numerals: 15 → טו, 787 → תשפ״ז */
  function gem(n, marks = true) {
    const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    let s = '';
    let h = Math.floor(n / 100); n %= 100;
    while (h >= 4) { s += 'ת'; h -= 4; }
    s += ['', 'ק', 'ר', 'ש'][h];
    if (n === 15) s += 'טו'; else if (n === 16) s += 'טז'; else s += tens[Math.floor(n / 10)] + ones[n % 10];
    if (!marks) return s;
    return s.length > 1 ? s.slice(0, -1) + '״' + s.slice(-1) : s + '׳';
  }
  const hp = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const hMonth = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long' });
  const hebCache = new Map();
  /** the Hebrew date of a day: { day, month (Hebrew name), year } */
  function heb(d) {
    const k = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
    if (hebCache.has(k)) return hebCache.get(k);
    const parts = Object.fromEntries(hp.formatToParts(d).map((p) => [p.type, p.value]));
    const v = { day: +parts.day, month: hMonth.format(d), year: +parts.year };
    hebCache.set(k, v);
    return v;
  }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const heDay = (d) => gem(heb(d).day);
  const heFull = (d) => { const h = heb(d); return `${gem(h.day)} ב${h.month} ${gem(h.year % 1000)}`; };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromIso = (s) => new Date(s.slice(0, 10) + 'T12:00');
  const time = (s) => new Date(s).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const plain = (s) => String(s || '').replace(/[\u0591-\u05C7]/g, '');   // Hebcal's titles come vocalised
  const monthStart = (d) => { let x = new Date(d); while (heb(x).day > 1) x = addDays(x, -1); return x; };
  const monthEnd = (d) => { let x = new Date(d); while (heb(addDays(x, 1)).day !== 1) x = addDays(x, 1); return x; };
  /** the first day of a Hebrew year (1 Tishrei) */
  function yearStart(hy) {
    let x = new Date(hy - 3761, 8, 1, 12);
    for (let i = 0; i < 70 && !(heb(x).year === hy && heb(x).day === 1 && heb(x).month === 'תשרי'); i++) x = addDays(x, 1);
    return x;
  }

  /* Hebcal, one Hebrew year at a time */
  const years = new Map();
  async function year(hy) {
    if (years.has(hy)) return years.get(hy);
    const key = `cal-${hy}-${P.city}`;
    const fetchIt = fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&yt=H&year=${hy}&maj=on&min=on&mod=on&nx=on&mf=on&ss=on&s=on&c=on&geonameid=${P.city}&M=on&lg=he&i=on`)
      .then((r) => { if (!r.ok) throw new Error('hebcal'); return r.json(); })
      .then((d) => { try { localStorage.setItem(key, JSON.stringify(d.items)); } catch (_) { /* full or blocked */ } return d.items; });
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { /* none */ }
    const p = cached ? Promise.resolve(cached) : fetchIt;
    if (cached) fetchIt.catch(() => {});   // refresh quietly
    years.set(hy, p);
    p.catch(() => years.delete(hy));
    return p;
  }
  async function itemsBetween(a, b) {
    const ys = [...new Set([heb(a).year, heb(b).year])];
    const all = (await Promise.all(ys.map((y) => year(y).catch(() => [])))).flat();
    const from = iso(a), to = iso(b);
    return all.filter((i) => i.date.slice(0, 10) >= from && i.date.slice(0, 10) <= to);
  }
  const kindOf = (i) => (i.family ? 'family' : i.category === 'roshchodesh' ? 'roshchodesh' : i.category === 'holiday' ? (i.subcat === 'shabbat' ? 'minor' : i.subcat || 'minor') : i.category);

  /* the family's days: shared, on the server */
  let family = [];
  async function loadFamily() {
    try { family = (await H.api('/api/calendar/events')).events; } catch (_) { family = []; }
  }
  const leap = (hy) => [0, 3, 6, 8, 11, 14, 17].includes(hy % 19);
  /** does the family day e fall on the day d? (by its Hebrew date, its Gregorian date, or once) */
  function occursOn(e, d) {
    const base = e.after_sunset ? addDays(fromIso(e.date), 1) : fromIso(e.date);
    if (iso(d) < iso(fromIso(e.date))) return false;
    if (e.recur === 'none') return iso(d) === e.date;
    if (e.recur === 'gregorian') {
      const b = fromIso(e.date);
      if (b.getMonth() !== d.getMonth()) return false;
      if (b.getDate() === d.getDate()) return true;
      return b.getMonth() === 1 && b.getDate() === 29 && d.getDate() === 28 && new Date(d.getFullYear(), 1, 29).getMonth() !== 1;   // 29 February
    }
    const hb = heb(base), hd = heb(d);
    // Adar: in a year with one Adar the day is in it; in a leap year a birthday is in Adar II, a memorial day in Adar I
    let month = hb.month;
    if (/^אדר/.test(month)) month = !leap(hd.year) ? 'אדר' : month === 'אדר' ? (e.kind === 'yahrzeit' ? 'אדר א׳' : 'אדר ב׳') : month;
    if (hd.month !== month) return false;
    if (hd.day === hb.day) return true;
    return hb.day === 30 && hd.day === 29 && heb(addDays(d, 1)).day === 1;   // a 30th in a month of 29 days: the 29th
  }
  function yearsSince(e, d) {
    const base = e.after_sunset ? addDays(fromIso(e.date), 1) : fromIso(e.date);
    return e.recur === 'hebrew' ? heb(d).year - heb(base).year : d.getFullYear() - fromIso(e.date).getFullYear();
  }
  function familyLabel(e, d) {
    const [ic, kind] = FAMILY[e.kind] || FAMILY.other;
    const n = yearsSince(e, d);
    const count = e.recur === 'none' || n <= 0 ? '' : e.kind === 'birthday' ? ` (${n})` : ` · ${n} שנים`;
    return `${ic} ${e.title}${count}`;
  }
  /** the family's days as calendar items between a and b */
  function familyBetween(a, b) {
    const out = [];
    for (let d = new Date(a); d <= b; d = addDays(d, 1)) for (const e of family) if (occursOn(e, d)) out.push({ family: e, date: iso(d), title: familyLabel(e, d) });
    return out;
  }

  /* state */
  const today = new Date(); today.setHours(12, 0, 0, 0);
  let view = new Date(today);
  let sel = new Date(today);

  const grid = el('div', { class: 'cal-grid', role: 'grid', 'aria-label': 'החודש' });
  const title = el('div', { class: 'cal-title' });
  const remindBox = el('section', { class: 'cal-remind', 'aria-live': 'polite' });
  const dayBox = el('section', { class: 'card cal-day', 'aria-live': 'polite' });
  const yearBox = el('section', { class: 'card cal-year' });
  const city = el('select', { class: 'cal-city', 'aria-label': 'העיר לזמני השבת', onchange: (e) => { P.city = e.target.value; H.savePrefs('calendar'); years.clear(); drawAll(); } },
    CITIES.map(([id, n]) => el('option', { value: id, selected: id === P.city }, n)));
  const modeBtn = el('button', { class: 'cal-today', onclick: () => { P.mode = P.mode === 'heb' ? 'greg' : 'heb'; H.savePrefs('calendar'); view = new Date(sel); drawAll(); } });
  const remindSel = el('select', { class: 'cal-city', 'aria-label': 'תזכורת לפני', onchange: (e) => { P.remind = +e.target.value; H.savePrefs('calendar'); drawRemind(); } },
    [[0, 'בלי תזכורות'], [1, 'תזכורת: יום לפני'], [3, 'תזכורת: 3 ימים לפני'], [7, 'תזכורת: שבוע לפני']].map(([v, n]) => el('option', { value: v, selected: +P.remind === v }, n)));
  const nav = (dm) => {
    if (P.mode === 'heb') view = dm < 0 ? addDays(monthStart(view), -1) : addDays(monthEnd(view), 1);
    else view = new Date(view.getFullYear(), view.getMonth() + dm, 1, 12);
    drawMonth();
  };
  root.append(el('div', { class: 'cal' },
    el('a', { class: 'folder-back', href: '/tools/' }, '‹ כלים'),
    el('header', { class: 'cal-head' },
      el('span', { class: 'cal-logo', 'aria-hidden': 'true' }, H.icon('calendar')),
      el('div', {}, el('small', {}, 'לוח שנה'), el('h1', {}, 'עברי ולועזי'))),
    remindBox,
    el('div', { class: 'cal-cols' },
      el('div', { class: 'cal-main' },
        el('section', { class: 'card cal-month' },
          el('div', { class: 'cal-bar' },
            el('button', { class: 'cal-arrow', 'aria-label': 'החודש הקודם', onclick: () => nav(-1) }, '›'),
            title,
            el('button', { class: 'cal-arrow', 'aria-label': 'החודש הבא', onclick: () => nav(1) }, '‹')),
          el('div', { class: 'cal-tools' },
            el('button', { class: 'cal-today', onclick: () => { view = new Date(today); sel = new Date(today); drawAll(); } }, 'היום'), modeBtn, city),
          el('div', { class: 'cal-week', 'aria-hidden': 'true' }, ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'].map((d) => el('span', {}, d))),
          grid,
          el('div', { class: 'cal-legend' }, KINDS.map(([k, n]) => el('span', { class: 'k-' + k }, el('i'), n)))),
        dayBox,
        el('section', { class: 'card cal-sync' },
          el('h3', {}, 'התזכורות והיומן בטלפון'),
          el('div', { class: 'cal-tools start' }, remindSel,
            el('button', { class: 'cal-today', onclick: () => exportIcs() }, '📲 הוספה ליומן בטלפון'),
            'Notification' in window ? el('button', { class: 'cal-today', onclick: () => askNotify() }, '🔔 התראות בדפדפן') : ''),
          el('p', { class: 'muted cal-fine' }, 'הקובץ (ics) נפתח ביומן של הטלפון או של Google ומוסיף את החגים, הצומות והימים המשפחתיים של השנה, כל אחד עם התראה לפי התזכורת שבחרתם. התראות בדפדפן מופיעות כשפותחים את העוזר.'))),
      yearBox)));

  async function drawMonth() {
    let first, last;
    if (P.mode === 'heb') { first = monthStart(view); last = monthEnd(view); }
    else { first = new Date(view.getFullYear(), view.getMonth(), 1, 12); last = new Date(view.getFullYear(), view.getMonth() + 1, 0, 12); }
    modeBtn.textContent = P.mode === 'heb' ? 'לפי החודש הלועזי' : 'לפי החודש העברי';
    const h1 = heb(first), h2 = heb(last);
    if (P.mode === 'heb') {
      const g1 = first.toLocaleDateString('he-IL', { month: 'long' }), g2 = last.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
      title.replaceChildren(el('h2', {}, `${h1.month} ${gem(h1.year % 1000)}`), el('p', {}, g1 === g2.split(' ')[0] ? g2 : `${g1}–${g2}`));
    } else {
      title.replaceChildren(el('h2', {}, first.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })),
        el('p', {}, h1.month === h2.month ? h1.month : `${h1.month}–${h2.month}`, ' ', gem(h2.year % 1000)));
    }
    const start = addDays(first, -first.getDay());
    const end = addDays(last, 6 - last.getDay());
    let items = [];
    try { items = await itemsBetween(start, end); } catch (_) { /* the grid without events */ }
    items = items.concat(familyBetween(start, end));
    const byDay = new Map();
    for (const i of items) { const k = i.date.slice(0, 10); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(i); }
    const cells = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const day = new Date(d), k = iso(day), list = byDay.get(k) || [];
      const ev = list.filter((i) => (i.family || i.category === 'holiday' || i.category === 'roshchodesh') && P.kinds.includes(kindOf(i)));
      ev.sort((a, b) => (b.family ? 1 : 0) - (a.family ? 1 : 0));
      const par = list.find((i) => i.category === 'parashat');
      const hd = heb(day);
      const inMonth = day >= first && day <= last;
      const big = P.mode === 'heb' ? gem(hd.day) : day.getDate();
      const small = P.mode === 'heb' ? (day.getDate() === 1 ? day.toLocaleDateString('he-IL', { month: 'short' }) : day.getDate()) : (hd.day === 1 ? hd.month : gem(hd.day));
      cells.push(el('button', {
        class: ['cal-cell', !inMonth && 'out', k === iso(today) && 'today', k === iso(sel) && 'sel', day.getDay() === 6 && 'shabbat',
          ev.some((i) => i.yomtov) && 'yomtov', (P.mode === 'heb' ? day.getDate() === 1 : hd.day === 1) && 'hfirst', P.mode === 'heb' && 'hebmode'].filter(Boolean).join(' '),
        role: 'gridcell', 'aria-label': `${day.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}, ${heFull(day)}${ev.length ? ', ' + ev.map((i) => plain(i.title)).join(', ') : ''}`,
        'aria-selected': String(k === iso(sel)), onclick: () => { sel = day; if (!inMonth) view = new Date(day); drawAll(); },
      },
        el('span', { class: 'g' }, big),
        el('span', { class: 'h' }, small),
        ev.length ? el('span', { class: 'ev' }, ev.slice(0, 2).map((i) => el('span', { class: 'k-' + kindOf(i) }, plain(i.title).replace(/\s*\(.*?\)/, '')))) : '',
        par ? el('span', { class: 'par' }, plain(par.title).replace('פרשת ', '')) : ''));
    }
    grid.replaceChildren(...cells);
  }

  async function drawDay() {
    const k = iso(sel);
    dayBox.replaceChildren(el('p', { class: 'muted' }, 'טוען…'));
    let list = [];
    try { list = await itemsBetween(sel, sel); } catch (_) { /* below */ }
    const ev = list.filter((i) => i.category === 'holiday' || i.category === 'roshchodesh' || i.category === 'mevarchim');
    const par = list.find((i) => i.category === 'parashat');
    const times = list.filter((i) => i.category === 'candles' || i.category === 'havdalah' || (i.category === 'zmanim' && i.subcat === 'fast'));
    const fam = family.filter((e) => occursOn(e, sel));
    dayBox.replaceChildren(
      el('div', { class: 'cal-day-head' },
        el('div', { class: 'cal-day-num' }, el('b', {}, sel.getDate()), el('span', {}, gem(heb(sel).day))),
        el('div', {}, el('h3', {}, sel.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })), el('p', {}, heFull(sel)))),
      ev.length || par || times.length || fam.length ? el('ul', { class: 'cal-events' },
        fam.map((e) => el('li', { class: 'k-family' }, el('i'), el('div', {}, el('b', {}, familyLabel(e, sel)),
          el('p', {}, `${(FAMILY[e.kind] || FAMILY.other)[1]} · ${e.recur === 'hebrew' ? 'לפי התאריך העברי' : e.recur === 'gregorian' ? 'לפי התאריך הלועזי' : 'פעם אחת'}${e.note ? ' · ' + e.note : ''}`),
          e.from === 'tree' ? el('a', { class: 'cal-link', href: '/family/' }, 'בעץ המשפחה ›') : el('button', { class: 'cal-link', onclick: () => editFamily(e) }, 'עריכה')))),
        ev.map((i) => el('li', { class: 'k-' + kindOf(i) }, el('i'), el('div', {}, el('b', {}, plain(i.title)), i.memo ? el('p', {}, plain(i.memo)) : ''))),
        par ? el('li', { class: 'k-par' }, el('i'), el('div', {}, el('b', {}, plain(par.title)), el('p', {}, el('a', { href: '/parasha/' }, 'לעיון בפרשה ›')))) : '',
        times.map((i) => el('li', { class: 'k-time' }, el('i'), el('div', {}, el('b', {}, plain(i.hebrew || i.title).replace(/:.*/, '')), ' ', time(i.date), i.memo ? el('p', {}, plain(i.memo)) : '')))) :
        el('p', { class: 'muted' }, k === iso(today) ? 'היום אין מועד מיוחד בלוח.' : 'אין מועד מיוחד ביום הזה.'),
      el('button', { class: 'cal-add', onclick: () => editFamily(null) }, '+ יום משפחתי ביום הזה'));
  }

  /* add or change a family day */
  function editFamily(e) {
    const f = { title: e?.title || '', kind: e?.kind || 'birthday', date: e?.date || iso(sel), after_sunset: !!e?.after_sunset, recur: e?.recur || 'hebrew', note: e?.note || '' };
    const titleIn = el('input', { type: 'text', value: f.title, placeholder: 'למשל: יום ההולדת של סבתא', maxlength: 80, 'aria-label': 'שם' });
    const kindIn = el('select', { 'aria-label': 'סוג' }, Object.entries(FAMILY).map(([k, [ic, n]]) => el('option', { value: k, selected: k === f.kind }, `${ic} ${n}`)));
    const dateIn = el('input', { type: 'date', value: f.date, 'aria-label': 'התאריך' });
    const sunsetIn = el('input', { type: 'checkbox', checked: f.after_sunset });
    const recurIn = el('select', { 'aria-label': 'חוזר' }, [['hebrew', 'חוזר כל שנה לפי התאריך העברי'], ['gregorian', 'חוזר כל שנה לפי התאריך הלועזי'], ['none', 'פעם אחת']].map(([v, n]) => el('option', { value: v, selected: v === f.recur }, n)));
    const noteIn = el('input', { type: 'text', value: f.note, placeholder: 'הערה (לא חובה)', maxlength: 400, 'aria-label': 'הערה' });
    const heOut = el('p', { class: 'muted cal-fine' });
    const showHe = () => { const b = fromIso(dateIn.value || iso(sel)); heOut.textContent = 'התאריך העברי: ' + heFull(sunsetIn.checked ? addDays(b, 1) : b); };
    dateIn.addEventListener('input', showHe); sunsetIn.addEventListener('change', showHe); showHe();
    const save = async () => {
      const data = { title: titleIn.value.trim(), kind: kindIn.value, date: dateIn.value, after_sunset: sunsetIn.checked, recur: recurIn.value, note: noteIn.value.trim() };
      if (!data.title || !data.date) return toast('צריך שם ותאריך');
      try {
        if (e) await H.api('/api/calendar/events/' + e.id, { method: 'PUT', body: data });
        else await H.api('/api/calendar/events', { body: data });
        H.closeModal(); await loadFamily(); drawAll(); toast('נשמר בלוח המשפחה');
      } catch (_) { toast('השמירה לא הצליחה'); }
    };
    const del = async () => {
      if (!confirm(`למחוק את "${e.title}" מלוח המשפחה?`)) return;
      try { await H.api('/api/calendar/events/' + e.id, { method: 'DELETE' }); H.closeModal(); await loadFamily(); drawAll(); toast('נמחק'); } catch (_) { toast('המחיקה לא הצליחה'); }
    };
    H.modal(el('div', { class: 'cal-form' },
      el('h3', {}, e ? 'עריכת יום משפחתי' : 'יום משפחתי חדש'),
      el('label', {}, 'שם', titleIn), el('label', {}, 'סוג', kindIn),
      el('label', {}, 'התאריך (שבו זה קרה)', dateIn),
      el('label', { class: 'row' }, sunsetIn, 'אחרי השקיעה (התאריך העברי הוא של היום הבא)'), heOut,
      el('label', {}, 'חוזר', recurIn), el('label', {}, 'הערה', noteIn),
      el('div', { class: 'cal-form-acts' }, el('button', { class: 'btn primary', onclick: save }, 'שמירה'), e ? el('button', { class: 'btn ghost', onclick: del }, 'מחיקה') : '')));
    setTimeout(() => titleIn.focus(), 50);
  }

  /* the year's events, each once (the days of a festival together) */
  function groupsOf(items) {
    const groups = [];
    for (const i of items.filter((x) => x.category === 'holiday' || x.category === 'roshchodesh')) {
      const key = (i.link || '').replace(/\?.*$/, '').replace(/-\d{4}$/, '') + '|' + (i.category === 'roshchodesh' ? i.date.slice(0, 7) : '');
      const last = groups[groups.length - 1];
      const near = last && last.key === key && (new Date(i.date) - new Date(last.to)) <= 864e5 * 2;
      if (near) { last.to = i.date; last.items.push(i); } else groups.push({ key, from: i.date, to: i.date, items: [i] });
    }
    return groups;
  }
  const nameOf = (g) => {
    if (g.items[0].family) return g.items[0].title;
    const main = g.items.find((i) => !/^ערב /.test(i.hebrew || '')) || g.items[0];
    return plain(main.hebrew || main.title).replace(/\s+\d{4}$/, '').replace(/\s+[א-ח]׳(\s*\(.*\))?$/, '').replace(/\s*\(.*?\)\s*$/, '');
  };
  /** everything of the Hebrew year hy: Hebcal's groups and the family's days, in order */
  async function yearGroups(hy) {
    const items = await year(hy);
    const a = yearStart(hy), b = addDays(yearStart(hy + 1), -1);
    const fam = familyBetween(a, b).map((i) => ({ key: 'f' + i.family.id + i.date, from: i.date, to: i.date, items: [i] }));
    return groupsOf(items).concat(fam).sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : 0));
  }
  let yearFilter = 'all';
  async function drawYear() {
    const hy = heb(sel).year;
    yearBox.replaceChildren(el('h2', {}, `אירועי השנה ${gem(hy % 1000)}`), el('p', { class: 'muted' }, 'טוען…'));
    let groups = [];
    try { groups = await yearGroups(hy); } catch (_) { yearBox.replaceChildren(el('h2', {}, 'אירועי השנה'), el('p', {}, 'לא הצלחתי לטעון את לוח השנה. נסו שוב בעוד רגע.')); return; }
    const shown = groups.filter((g) => { const k = kindOf(g.items[0]); return yearFilter === 'all' ? k !== 'roshchodesh' || P.kinds.includes('roshchodesh') : k === yearFilter; });
    const fmtRange = (g) => {
      const a = fromIso(g.from), b = fromIso(g.to);
      const g1 = a.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
      const g2 = +b !== +a ? b.toLocaleDateString('he-IL', { day: 'numeric', month: a.getMonth() === b.getMonth() ? undefined : 'long' }) : '';
      const h = heb(a);
      return `${gem(h.day)} ב${h.month}${+b !== +a ? '–' + heDay(b) : ''} · ${g2 ? (a.getMonth() === b.getMonth() ? `${a.getDate()}–${g2} ב${a.toLocaleDateString('he-IL', { month: 'long' })}` : `${g1}–${g2}`) : g1}`;
    };
    let lastMonth = '';
    const rows = [];
    for (const g of shown) {
      const a = fromIso(g.from);
      const m = heb(a).month;
      if (m !== lastMonth) { rows.push(el('li', { class: 'cal-ym' }, m)); lastMonth = m; }
      const past = fromIso(g.to) < today;
      const memo = g.items[0].family ? (g.items[0].family.note || (FAMILY[g.items[0].family.kind] || FAMILY.other)[1]) : plain(g.items.find((i) => i.memo)?.memo || '');
      rows.push(el('li', { class: `cal-yi k-${kindOf(g.items[0])}${past ? ' past' : ''}` },
        el('button', { onclick: () => { sel = a; view = new Date(a); drawAll(); document.querySelector('.cal-month').scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
          el('i'), el('div', {}, el('b', {}, nameOf(g)), el('small', {}, fmtRange(g)), memo ? el('p', {}, memo) : ''))));
    }
    const next = shown.find((g) => fromIso(g.to) >= today && kindOf(g.items[0]) !== 'roshchodesh');
    yearBox.replaceChildren(
      el('div', { class: 'cal-year-head' }, el('h2', {}, `אירועי השנה ${gem(hy % 1000)}`),
        next ? el('p', { class: 'cal-next' }, 'הבא: ', el('b', {}, nameOf(next)), ` · ${Math.max(0, Math.round((fromIso(next.from) - today) / 864e5))} ימים`) : ''),
      el('div', { class: 'cal-filter', role: 'radiogroup', 'aria-label': 'סוג האירועים' },
        [['all', 'הכל'], ...KINDS].map(([k, n]) => el('button', { role: 'radio', 'aria-checked': String(k === yearFilter), class: 'k-' + k + (k === yearFilter ? ' on' : ''), onclick: () => { yearFilter = k; drawYear(); } }, k === 'all' ? '' : el('i'), n))),
      el('ol', { class: 'cal-ylist' }, rows),
      el('p', { class: 'rs-fine muted' }, 'הלוח, הזמנים והתיאורים מ־Hebcal. הימים המשפחתיים משותפים לכל המשפחה.'));
    const list = yearBox.querySelector('.cal-ylist'), up = list.querySelector('.cal-yi:not(.past)');
    if (up) list.scrollTop = Math.max(0, up.offsetTop - list.offsetTop - 40);   // only the list scrolls, never the page
  }

  /* what is coming: the next days' holidays, fasts and family days (as many days ahead as the reminder says) */
  async function upcoming(days) {
    if (!days) return [];
    const end = addDays(today, days);
    const hy = heb(today).year;
    const gs = (await Promise.all([hy, heb(end).year].filter((v, i, a) => a.indexOf(v) === i).map((y) => yearGroups(y).catch(() => [])))).flat();
    return gs.filter((g) => { const k = kindOf(g.items[0]); return ['major', 'fast', 'modern', 'family'].includes(k) && fromIso(g.from) >= today && fromIso(g.from) <= end; })
      .filter((g, i, a) => a.findIndex((x) => x.key === g.key && x.from === g.from) === i);
  }
  const whenText = (g) => { const n = Math.round((fromIso(g.from) - today) / 864e5); return n === 0 ? 'היום' : n === 1 ? 'מחר' : n === 2 ? 'מחרתיים' : `בעוד ${n} ימים`; };
  async function drawRemind() {
    const list = await upcoming(+P.remind);
    remindBox.replaceChildren(...(list.length ? [el('span', { class: 'cal-remind-ic', 'aria-hidden': 'true' }, '🔔'),
      ...list.map((g) => el('button', { class: 'cal-remind-i k-' + kindOf(g.items[0]), onclick: () => { sel = fromIso(g.from); view = new Date(sel); drawAll(); } }, el('i'), el('b', {}, nameOf(g)), ' ' + whenText(g)))] : []));
    remindBox.hidden = !list.length;
    notify(list);
  }
  /* the browser's own notification, once a day for each coming day, when the helper is opened */
  async function askNotify() {
    const r = await Notification.requestPermission();
    toast(r === 'granted' ? 'התראות הופעלו: תראו אותן כשתפתחו את העוזר' : 'ההתראות לא אושרו בדפדפן');
    if (r === 'granted') drawRemind();
  }
  function notify(list) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    for (const g of list) {
      const key = `cal-notified-${g.key}-${g.from}-${iso(today)}`;
      try { if (localStorage.getItem(key)) continue; localStorage.setItem(key, '1'); } catch (_) { /* per device */ }
      try { new Notification(`${nameOf(g)} – ${whenText(g)}`, { body: fromIso(g.from).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + heFull(fromIso(g.from)), icon: '/icon.svg', lang: 'he', dir: 'rtl' }); } catch (_) { /* not allowed here */ }
    }
  }

  /* the year in the phone's calendar: an .ics file with the holidays, fasts, Israeli days and the family's days, each with its alarm */
  async function exportIcs() {
    const hy = heb(sel).year;
    let groups = [];
    try { groups = (await Promise.all([hy, hy + 1].map((y) => yearGroups(y)))).flat(); } catch (_) { return toast('לא הצלחתי להכין את הקובץ'); }
    groups = groups.filter((g) => ['major', 'minor', 'fast', 'modern', 'family'].includes(kindOf(g.items[0])));
    const d8 = (d) => iso(d).replace(/-/g, '');
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Helper//Family calendar//HE', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc('לוח השנה – העוזר המשפחתי')}`];
    for (const g of groups) {
      const a = fromIso(g.from), b = addDays(fromIso(g.to), 1);
      const memo = g.items[0].family ? (g.items[0].family.note || '') : plain(g.items.find((i) => i.memo)?.memo || '');
      lines.push('BEGIN:VEVENT', `UID:${d8(a)}-${esc(g.key).replace(/[^\w-]/g, '').slice(0, 60)}@helper`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(a)}`, `DTEND;VALUE=DATE:${d8(b)}`,
        `SUMMARY:${esc(nameOf(g))}`, `DESCRIPTION:${esc((memo ? memo + '\n' : '') + heFull(a))}`, 'TRANSP:TRANSPARENT');
      if (+P.remind) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(nameOf(g))}`, `TRIGGER:-P${+P.remind}D`, 'END:VALARM');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `לוח-השנה-${gem(hy % 1000, false)}.ics` });
    document.body.append(a); a.click(); a.remove();
    toast(`הקובץ מוכן: ${groups.length} ימים לשנתיים. פתחו אותו כדי להוסיף ליומן.`);
  }

  function drawAll() { drawMonth(); drawDay(); drawYear(); }
  grid.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
    if (!step) return;
    e.preventDefault();
    sel = addDays(sel, step);
    view = new Date(sel);
    drawAll();
    setTimeout(() => grid.querySelector('.sel')?.focus(), 50);
  });
  await loadFamily();
  drawAll();
  drawRemind();
})();
