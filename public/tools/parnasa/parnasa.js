/* פרנסה: the household's money (docs/decisions.md 2026-11-13). The look and the markup: docs/design/parnasa.md.
   One number first (what is left this month), a quick entry with a guessed category, the money's split, the recurring
   charges, tips (the plain ones first, then Claude's on the month's sums only), the recent payments and holdings.
   #import reads a bank or card file here on the device (parnasa-core.js) and sends only the rows the person approved.
   "שלי" is the person's own; a shared קופה (by invitation, people of the same household) is shown when they have one.
   General guidance only: the page says so, and the investments are tracking only. */
(async () => {
  const { el, api, toast } = H;
  const P = window.PRCore;
  await H.requireLogin();
  H.header('פרנסה');
  const root = document.querySelector('main.pr');
  const prefs = H.prefs('parnasa', { scope: 'me' });

  /* ---------- small helpers ---------- */
  const PATHS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    out: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    in: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/>',
    file: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M12 17v-6M9.5 13.5 12 11l2.5 2.5"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.5 9.5"/>',
    repeat: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13"/>',
    trend: '<path d="M3.5 17 9.5 11l4 4 7-8"/><path d="M15 7h5.5v5.5"/>',
    prev: '<path d="m9 6 6 6-6 6"/>', next: '<path d="m15 6-6 6 6 6"/>',
  };
  const ic = (name) => { const t = document.createElement('template'); t.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`; return t.content.firstChild; };
  const num = (n, sign) => el('span', { class: 'pr-num' }, P.money(n, sign));
  const dot = () => el('i', { class: 'pr-dot' });
  const MSG = {
    bad_amount: 'הסכום לא נראה תקין.', bad_date: 'התאריך לא נראה תקין.', bad_symbol: 'הסימול לא נראה תקין (אותיות באנגלית או מספר).', bad_qty: 'כמה יחידות?',
    not_household: 'אפשר להזמין רק אנשים מהבית.', not_found: 'זה כבר לא כאן.', no_rows: 'לא נמצאו שורות לשמירה.', too_many_rows: 'יותר מדי שורות בפעם אחת.',
  };
  const say = (e) => MSG[e.code] || e.message || 'משהו השתבש. נסו שוב.';
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); const t = y * 12 + mo - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const monthLabel = (m) => new Date(m + '-15T12:00:00').toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  const monthOnly = (m) => new Date(m + '-15T12:00:00').toLocaleDateString('he-IL', { month: 'long' });
  const dayLabel = (d) => {
    const t = today();
    if (d === t) return 'היום';
    const y = new Date(t + 'T12:00:00'); y.setDate(y.getDate() - 1);
    if (d === y.toISOString().slice(0, 10)) return 'אתמול';
    return new Date(d + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
  };

  let data = null, month = today().slice(0, 7), scope = prefs.scope || 'me';
  const cat = (key) => data.cats.find((c) => c.key === key) || data.cats.find((c) => c.key === 'other');
  const myKupot = () => (data?.kupot || []).filter((k) => k.status === 'member');
  const kupa = () => myKupot().find((k) => k.id === scope);
  const faces = (k) => el('span', { class: 'pr-faces' }, k.members.filter((m) => !m.invited).slice(0, 3).map((m) => el('i', {}, (m.name || '?').trim()[0] || '?')));
  const kupaBadge = (k, prefix = '') => el('span', { class: 'pr-kupa' }, faces(k), el('span', { class: 'pr-kupa-name' }, prefix + k.name));

  /* ---------- loading ---------- */
  async function load() {
    try {
      data = await api(`/api/parnasa?scope=${encodeURIComponent(scope)}&month=${month}`);
    } catch (e) {
      if (e.status === 404 && scope !== 'me') { scope = 'me'; H.savePrefs('parnasa', { scope }); return load(); }
      root.replaceChildren(el('p', { class: 'pr-muted' }, say(e)));
      return;
    }
    render();
  }
  window.addEventListener('hashchange', () => (data ? render() : null));

  function render() {
    if (location.hash === '#import') return renderImport();
    root.replaceChildren(head(), ...invites(), el('div', { class: 'pr-grid' },
      balance(), quick(), split(), recur(), tips(), recent(), invest()), kupaFoot(), fab());
    watchFab();
  }

  /* ---------- the head: scope and month ---------- */
  function head() {
    const ks = myKupot();
    const scopeBtns = ks.length ? el('div', { class: 'pr-scope', role: 'group', 'aria-label': 'של מי' },
      el('button', { type: 'button', 'aria-pressed': String(scope === 'me'), onclick: () => setScope('me') }, 'שלי'),
      ...ks.map((k) => el('button', { type: 'button', 'aria-pressed': String(scope === k.id), onclick: () => setScope(k.id) }, kupaBadge(k)))) : null;
    const now = today().slice(0, 7);
    return el('div', {},
      el('a', { class: 'pr-link', href: '/tools/' }, '→ כלים'),
      el('header', { class: 'pr-head' },
        el('div', {}, el('h1', {}, H.icon('parnasa'), ' פרנסה'), el('p', {}, 'הכסף של הבית, בנחת')),
        el('div', { class: 'pr-head-tools' }, scopeBtns,
          el('div', { class: 'pr-month' },
            el('button', { type: 'button', 'aria-label': 'החודש הקודם', onclick: () => { month = addMonths(month, -1); load(); } }, ic('prev')),
            el('b', { 'aria-live': 'polite' }, monthLabel(month)),
            el('button', { type: 'button', 'aria-label': 'החודש הבא', disabled: month >= now, onclick: () => { month = addMonths(month, 1); load(); } }, ic('next'))))));
  }
  function setScope(s) { scope = s; H.savePrefs('parnasa', { scope }); load(); }

  /** invitations to a shared קופה, waiting for an answer */
  function invites() {
    return (data.kupot || []).filter((k) => k.status === 'invited').map((k) => {
      const from = k.members.filter((m) => !m.me && !m.invited).map((m) => m.name).join(' ו') || 'מישהו מהבית';
      return el('section', { class: 'card pr-invite' },
        el('p', {}, `${from} מזמינים אתכם לקופה משותפת: `, el('b', {}, k.name), '. מה שיירשם בה ייראה לכל מי שבה.'),
        el('div', { class: 'pr-quick-btns' },
          el('button', { class: 'btn primary', type: 'button', onclick: () => answer(k, 'accept') }, 'הצטרפות'),
          el('button', { class: 'btn ghost', type: 'button', onclick: () => answer(k, 'leave') }, 'לא תודה')));
    });
  }
  async function answer(k, how) {
    try { await api(`/api/parnasa/kupa/${encodeURIComponent(k.id)}/${how}`, { method: 'POST', body: {} }); if (how === 'accept') scope = k.id, H.savePrefs('parnasa', { scope }); load(); } catch (e) { toast(say(e)); }
  }

  /* ---------- the balance ---------- */
  function balance() {
    const s = data.sum, p = data.prev, max = Math.max(s.in, s.out, 1);
    const isNow = month === today().slice(0, 7);
    const days = isNow ? +today().slice(8, 10) : 0;
    const pct = s.in > 0 ? Math.round((s.out / s.in) * 100) : null;
    const pace = isNow
      ? `עברו ${days === 1 ? 'יום אחד' : days + ' ימים'} מהחודש${pct != null ? `, ויצאו ${pct}% מההכנסה` : ''}.`
      : pct != null ? `בכל החודש יצאו ${pct}% מההכנסה.` : 'לא נרשמה הכנסה בחודש הזה.';
    const hasPrev = p.in || p.out;
    return el('section', { class: 'card pr-balance', 'aria-labelledby': 'bal-h' },
      el('div', { class: 'pr-card-head' }, el('h2', { id: 'bal-h' }, isNow ? 'נשאר החודש' : `נשאר ב${monthOnly(month)}`),
        hasPrev ? el('span', { class: 'pr-delta' }, el('b', { class: 'pr-num' }, P.money(s.left - p.left, true)), ` לעומת ${monthOnly(addMonths(month, -1))}`) : null),
      el('p', { class: 'pr-big', 'data-sign': s.left < 0 ? 'minus' : 'plus' }, num(s.left)),
      el('dl', { class: 'pr-flow' },
        el('div', { 'data-kind': 'in' }, el('dt', {}, 'נכנס'), el('dd', {}, num(s.in)), meter(s.in / max)),
        el('div', { 'data-kind': 'out' }, el('dt', {}, 'יצא'), el('dd', {}, num(s.out)), meter(s.out / max))),
      el('p', { class: 'pr-pace' }, pace));
  }
  const meter = (f) => el('span', { class: 'pr-meter', 'aria-hidden': 'true' }, el('i', { style: `--w:${Math.round(Math.max(0, Math.min(1, f)) * 1000) / 10}%` }));

  /* ---------- quick entry ---------- */
  function quick() {
    const again = (data.again || []).filter((a) => a.amount);
    return el('section', { class: 'card pr-quick', 'aria-labelledby': 'q-h' },
      el('h2', { id: 'q-h' }, 'רישום מהיר'),
      el('div', { class: 'pr-quick-btns' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => entry({ kind: 'out' }) }, ic('out'), ' הוצאה'),
        el('button', { class: 'btn', type: 'button', onclick: () => entry({ kind: 'in' }) }, ic('in'), ' הכנסה')),
      again.length ? el('div', { class: 'pr-again', role: 'group', 'aria-label': 'שוב, בנגיעה אחת' }, again.map((a) =>
        el('button', { class: 'chip', type: 'button', 'data-c': cat(a.cat).c || null, onclick: (e) => tapAgain(a, e.currentTarget) },
          dot(), a.what, ' ', el('span', { class: 'pr-num' }, (a.same ? '' : '~') + P.money(Math.abs(a.amount)))))) : null,
      el('a', { class: 'pr-link', href: '#import' }, ic('file'), ' ייבוא קובץ מהבנק או מחברת האשראי'));
  }
  async function tapAgain(a, chip) {
    if (!a.same) return entry({ kind: a.amount > 0 ? 'in' : 'out', amount: Math.abs(a.amount), what: a.what, cat: a.cat });
    try {
      const r = await api('/api/parnasa/tx', { body: { scope, date: today(), amount: a.amount, what: a.what, cat: a.cat, key: a.key || P.learnKey(a.what) } });
      chip.classList.add('done'); setTimeout(() => chip.classList.remove('done'), 1100);
      saved(r, a.what, a.amount);
    } catch (e) { toast(say(e)); }
  }
  /** after a save: the toast with "בטל", and the dashboard again */
  function saved(r, what, amount) {
    toast(`נרשם: ${what} ${P.money(Math.abs(amount))}`, 'בטל', async () => {
      try {
        await api(`/api/parnasa/tx/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
        if (r.recur) await api(`/api/parnasa/recur/${encodeURIComponent(r.recur)}`, { method: 'DELETE' });
        load();
      } catch (e) { toast(say(e)); }
    });
    load();
  }

  /* ---------- the entry sheet ---------- */
  function entry(pre = {}) {
    let kind = pre.kind || 'out', chosen = pre.cat || null, all = false;
    const amount = el('input', { inputmode: 'decimal', placeholder: '0', 'aria-label': 'סכום', autocomplete: 'off', value: pre.amount ? String(pre.amount) : null });
    const what = el('input', { type: 'text', autocomplete: 'off', maxlength: '120', value: pre.what || null });
    const date = el('input', { type: 'date', 'aria-label': 'תאריך', value: today(), max: today() });
    const rec = el('input', { type: 'checkbox' });
    const k = myKupot()[0] && (kupa() || myKupot()[0]);
    const inKupa = k ? el('input', { type: 'checkbox', checked: scope !== 'me' }) : null;
    const guessBox = el('div', { class: 'pr-guess', 'aria-live': 'polite' });
    const title = el('h3', { id: 'e-h' });
    const kindBtns = ['out', 'in'].map((kk) => el('button', { type: 'button', role: 'radio', onclick: () => { kind = kk; chosen = null; all = false; paint(); } }, kk === 'out' ? 'הוצאה' : 'הכנסה'));
    function paint() {
      title.textContent = kind === 'out' ? 'רישום הוצאה' : 'רישום הכנסה';
      kindBtns.forEach((b, i) => b.setAttribute('aria-checked', String((i === 0) === (kind === 'out'))));
      const g = P.guess(what.value, kind, data.learned);
      if (!chosen || !data.cats.some((c) => c.key === chosen && c.kind === kind)) chosen = g.best;
      const keys = all ? data.cats.filter((c) => c.kind === kind).map((c) => c.key) : [...new Set([chosen, ...g.offer])].slice(0, 3);
      guessBox.replaceChildren(el('span', {}, 'קטגוריה:'), ...keys.map((key) => {
        const c = cat(key);
        return el('button', { class: 'chip', type: 'button', 'data-c': c.c || null, 'aria-pressed': String(key === chosen), onclick: () => { chosen = key; paint(); } }, dot(), c.name);
      }), all ? null : el('button', { class: 'chip', type: 'button', 'data-c': kind === 'out' ? '8' : null, 'aria-pressed': 'false', onclick: () => { all = true; paint(); } }, dot(), 'אחר…'));
    }
    what.addEventListener('input', () => { if (!all) { chosen = null; paint(); } });
    const form = el('form', { class: 'pr-entry', 'aria-labelledby': 'e-h', novalidate: true },
      el('div', { class: 'pr-kind', role: 'radiogroup', 'aria-label': 'סוג' }, kindBtns),
      el('label', { class: 'pr-amount' }, amount, el('b', {}, '₪')),
      el('label', { class: 'field' }, el('span', {}, 'על מה'), what),
      guessBox,
      el('div', { class: 'pr-entry-more' }, date,
        el('label', { class: 'toggle' }, rec, 'חוזר כל חודש'),
        inKupa ? el('label', { class: 'toggle' }, inKupa, kupaBadge(k, 'ב')) : null),
      el('button', { class: 'btn primary', type: 'submit' }, 'שמירה'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = Number(String(amount.value).replace(/[,\s₪]/g, ''));
      if (!Number.isFinite(n) || n <= 0) { toast('כמה? הסכום חסר.'); amount.focus(); return; }
      const signed = kind === 'out' ? -n : n;
      const body = { scope: inKupa?.checked ? k.id : 'me', date: date.value || today(), amount: signed, what: what.value.trim(), cat: chosen, key: P.learnKey(what.value), recur: rec.checked };
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const r = await api('/api/parnasa/tx', { body });
        H.closeModal();
        saved(r, body.what || (kind === 'out' ? 'הוצאה' : 'הכנסה'), signed);
      } catch (err) { btn.disabled = false; toast(say(err)); }
    });
    paint();
    H.modal(title, form);
    setTimeout(() => amount.focus(), 30);
  }

  /* ---------- where the money went ---------- */
  function split() {
    const by = Object.entries(data.sum.byCat).sort((a, b) => b[1] - a[1]);
    const total = data.sum.out, max = by[0]?.[1] || 1, prev = data.prev.byCat;
    const card = el('section', { class: 'card pr-split', 'aria-labelledby': 's-h' },
      el('div', { class: 'pr-card-head' }, el('h2', { id: 's-h' }, 'לאן הלך הכסף'),
        by.length ? el('span', { class: 'pr-muted' }, num(total), ` ב-${by.length === 1 ? 'קטגוריה אחת' : by.length + ' קטגוריות'}`) : null));
    if (!by.length) { card.append(el('p', { class: 'pr-muted' }, 'עוד אין הוצאות בחודש הזה.')); return card; }
    card.append(
      el('div', { class: 'pr-stack', 'aria-hidden': 'true' }, by.map(([k, v]) => el('i', { 'data-c': cat(k).c, style: `--w:${Math.round((v / total) * 1000) / 10}%` }))),
      el('ol', { class: 'pr-cats' }, by.map(([k, v]) => {
        const p = prev[k] || 0, up = p > 0 && Math.abs(v - p) >= 200 && Math.abs(v / p - 1) >= 0.25 && (month < today().slice(0, 7) || +today().slice(8, 10) >= 20);
        return el('li', { class: 'pr-cat', 'data-c': cat(k).c }, dot(), el('span', { class: 'pr-cat-name' }, cat(k).name), num(v),
          el('span', { class: 'pr-cat-pct' }, `${Math.round((v / total) * 100)}%`), meter(v / max),
          up ? el('span', { class: 'pr-cat-up' }, `${v > p ? '▲ +' : '▼ −'}${Math.round(Math.abs(v / p - 1) * 100)}% מ${monthOnly(addMonths(month, -1))}`) : null);
      })));
    return card;
  }

  /* ---------- recurring charges ---------- */
  const everyText = (r) => {
    const next = new Date(r.next_date + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
    return r.every === 2 ? `כל חודשיים · הבא ב-${next}` : `כל חודש · ב-${r.day} לחודש`;
  };
  function recur() {
    const list = data.recur || [];
    const card = el('section', { class: 'card pr-recur', 'aria-labelledby': 'r-h' },
      el('div', { class: 'pr-card-head' }, el('h2', { id: 'r-h' }, 'חיובים קבועים'),
        list.length ? el('a', { href: '#', onclick: (e) => { e.preventDefault(); manageRecur(); } }, 'עריכה') : null));
    if (!list.length) { card.append(el('p', { class: 'pr-muted' }, 'אין עדיין. ברישום הוצאה אפשר לסמן "חוזר כל חודש", והיא תירשם לבד בכל חודש.')); return card; }
    card.append(el('ul', { class: 'pr-recur-list' }, list.map((r) => {
      const c = cat(r.cat), isIn = r.amount > 0;
      return el('li', { 'data-c': isIn ? null : c.c }, el('span', { class: 'pr-ic', style: isIn ? '--pr-c:var(--pr-in)' : null }, ic('repeat')),
        el('span', { class: 'pr-line' }, el('b', {}, r.what), el('small', {}, everyText(r))),
        el('span', { class: 'pr-amt', 'data-kind': isIn ? 'in' : null }, num(r.amount, isIn)));
    })), el('p', { class: 'pr-recur-sum' }, el('span', {}, 'בכל חודש'), el('b', { class: 'pr-num' }, P.money(data.recurMonthly, data.recurMonthly > 0))));
    return card;
  }
  function manageRecur() {
    H.modal(el('h3', {}, 'חיובים קבועים'), el('p', { class: 'pr-muted' }, 'עצירה לא מוחקת את מה שכבר נרשם, רק את החודשים הבאים.'),
      el('ul', { class: 'pr-recur-list' }, data.recur.map((r) => el('li', {},
        el('span', { class: 'pr-ic' }, ic('repeat')), el('span', { class: 'pr-line' }, el('b', {}, r.what), el('small', {}, `${P.money(r.amount)} · ${everyText(r)}`)),
        el('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
          try { await api(`/api/parnasa/recur/${encodeURIComponent(r.id)}`, { method: 'DELETE' }); H.closeModal(); toast(`${r.what}: החיוב נעצר`); load(); } catch (e) { toast(say(e)); }
        } }, 'עצירה')))));
  }

  /* ---------- tips ---------- */
  function tips() {
    const isNow = month === today().slice(0, 7);
    const plain = P.ruleTips(data.sum, data.prev, data.recurMonthly, data.cats, isNow ? +today().slice(8, 10) : 31, monthOnly(addMonths(month, -1)));
    const list = el('ul', { class: 'pr-tip-list' }, plain.map((t) => tip(t, 'מהרישומים שלך')));
    const card = el('section', { class: 'card pr-tips', 'aria-labelledby': 't-h' }, el('h2', { id: 't-h' }, 'כדאי לשים לב'), list,
      el('p', { class: 'pr-note' }, 'הכוונה כללית בלבד, לא ייעוץ פיננסי או ייעוץ השקעות.'));
    const room = 3 - plain.length;
    if (room > 0 && (data.sum.out || data.sum.in)) {
      const want = `${scope}|${month}`;
      api('/api/parnasa/tips', { body: { scope, month } }).then((r) => {
        if (`${scope}|${month}` !== want) return;
        (r.tips || []).slice(0, room).forEach((t) => list.append(tip(t, '✨ העוזר החכם')));
        if (!list.children.length) list.replaceWith(el('p', { class: 'pr-muted' }, 'אין כרגע מה להעיר. נמשיך להסתכל.'));
      }).catch(() => { if (!list.children.length) list.replaceWith(el('p', { class: 'pr-muted' }, 'הטיפים יופיעו כשיהיו כאן כמה רישומים.')); });
    } else if (!plain.length) list.replaceWith(el('p', { class: 'pr-muted' }, 'הטיפים יופיעו כשיהיו כאן כמה רישומים.'));
    return card;
  }
  const tip = (text, from) => el('li', { class: 'pr-tip' }, el('span', { class: 'pr-tip-ic' }, ic('bulb')), el('p', {}, text), el('small', {}, from));

  /* ---------- recent payments ---------- */
  const txRow = (t) => {
    const c = cat(t.cat), isIn = t.amount > 0;
    return [el('span', { class: 'pr-ic', style: isIn ? '--pr-c:var(--pr-in)' : null }, isIn ? ic('in') : el('b', {}, (t.what || '?').trim()[0])),
      el('span', { class: 'pr-line' }, el('b', {}, t.what), el('small', {}, `${dayLabel(t.date)} · ${c.name}${t.recur_id ? ' · קבוע' : ''}`)),
      el('span', { class: 'pr-amt', 'data-kind': isIn ? 'in' : null }, num(t.amount, isIn))];
  };
  function recent() {
    const list = data.recent || [];
    const card = el('section', { class: 'card pr-txs', 'aria-labelledby': 'x-h' },
      el('div', { class: 'pr-card-head' }, el('h2', { id: 'x-h' }, 'תנועות אחרונות'),
        list.length ? el('a', { href: '#', onclick: (e) => { e.preventDefault(); manageTx(); } }, 'מחיקה') : null));
    if (!list.length) { card.append(el('p', { class: 'pr-muted' }, 'עוד לא נרשם כלום. אפשר להתחיל ב"הוצאה", או לייבא קובץ מהבנק.')); return card; }
    card.append(el('ul', { class: 'pr-tx-list' }, list.map((t) => el('li', { 'data-c': t.amount > 0 ? null : cat(t.cat).c }, txRow(t)))));
    return card;
  }
  function manageTx() {
    const ul = el('ul', { class: 'pr-tx-list' }, data.recent.map((t) => {
      const li = el('li', {}, txRow(t)[1], el('button', { class: 'btn small ghost', type: 'button', 'aria-label': `מחיקה: ${t.what}`, onclick: async () => {
        try { await api(`/api/parnasa/tx/${encodeURIComponent(t.id)}`, { method: 'DELETE' }); li.remove(); load(); } catch (e) { toast(say(e)); }
      } }, 'מחיקה'));
      return li;
    }));
    H.modal(el('h3', {}, 'מחיקת תנועות'), ul);
  }

  /* ---------- investments: tracking only ---------- */
  function invest() {
    const h = data.holdings || { items: [] };
    const card = el('section', { class: 'card pr-invest', 'aria-labelledby': 'i-h' },
      el('div', { class: 'pr-card-head' }, el('h2', { id: 'i-h' }, 'השקעות'), h.items.length ? el('a', { href: '#', onclick: (e) => { e.preventDefault(); manageHoldings(); } }, 'עריכה') : null));
    if (!h.items.length) {
      card.append(el('div', { class: 'pr-empty' }, ic('trend'), el('span', {}, 'אין עדיין החזקות. אפשר להוסיף מניה או קרן, רק כדי לעקוב.'),
        el('button', { class: 'btn small', type: 'button', onclick: manageHoldings }, 'הוספת החזקה')));
    } else {
      const ch = h.cost > 0 ? Math.round(((h.value - h.cost) / h.cost) * 1000) / 10 : null;
      card.append(el('p', { class: 'pr-big' }, num(h.value)),
        ch != null ? el('span', { class: 'pr-delta' }, el('b', { class: 'pr-num' }, `${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch)}%`), ' מהעלות') : null,
        el('ul', { class: 'pr-holds' }, h.items.map((x, i) => el('li', {},
          el('span', { class: 'pr-ic', 'data-c': [3, 6, 4, 5, 1, 2, 7][i % 7] }, el('b', { class: 'pr-sym' }, x.symbol)),
          el('span', { class: 'pr-line' }, el('b', {}, x.name), el('small', {}, `${x.qty.toLocaleString('he-IL')} יחידות${x.value == null ? ' · לפי העלות, אין מחיר' : ''}`)),
          el('span', { class: 'pr-amt' }, num(x.value ?? x.cost)),
          x.change != null ? el('span', { class: 'pr-chg', 'data-dir': x.change >= 0 ? 'up' : 'down' }, `${x.change >= 0 ? '▲' : '▼'} ${Math.abs(x.change)}%`) : null))));
    }
    card.append(el('p', { class: 'pr-note' }, 'מעקב בלבד: המחירים מתעדכנים באיחור, ואין כאן קנייה, מכירה או המלצה.'));
    return card;
  }
  function manageHoldings() {
    const sym = el('input', { type: 'text', autocomplete: 'off', maxlength: '16', dir: 'ltr', placeholder: 'VOO' });
    const name = el('input', { type: 'text', autocomplete: 'off', maxlength: '60' });
    const qty = el('input', { inputmode: 'decimal', autocomplete: 'off' });
    const cost = el('input', { inputmode: 'decimal', autocomplete: 'off' });
    const form = el('form', { class: 'pr-entry', novalidate: true },
      el('label', { class: 'field' }, el('span', {}, 'סימול: VOO בארה"ב, או TEVA.TA בתל אביב (מספר של קרן נספר לפי העלות)'), sym),
      el('label', { class: 'field' }, el('span', {}, 'שם (לא חובה)'), name),
      el('label', { class: 'field' }, el('span', {}, 'כמה יחידות'), qty),
      el('label', { class: 'field' }, el('span', {}, 'כמה עלה בסך הכל (₪)'), cost),
      el('button', { class: 'btn primary', type: 'submit' }, 'הוספה'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/parnasa/holdings', { body: { scope, symbol: sym.value, name: name.value, qty: Number(qty.value.replace(/,/g, '')), cost: Number(cost.value.replace(/[,₪\s]/g, '') || 0) } });
        H.closeModal(); load();
      } catch (err) { toast(say(err)); }
    });
    const items = data.holdings?.items || [];
    H.modal(el('h3', {}, 'השקעות'), form, items.length ? el('ul', { class: 'pr-holds' }, items.map((x) => el('li', {},
      el('span', { class: 'pr-ic' }, el('b', { class: 'pr-sym' }, x.symbol)), el('span', { class: 'pr-line' }, el('b', {}, x.name), el('small', {}, `${x.qty} יחידות`)),
      el('button', { class: 'btn small ghost', type: 'button', 'aria-label': `הסרה: ${x.name}`, onclick: async () => {
        try { await api(`/api/parnasa/holdings/${encodeURIComponent(x.id)}`, { method: 'DELETE' }); H.closeModal(); load(); } catch (err) { toast(say(err)); }
      } }, 'הסרה')))) : null,
      el('p', { class: 'pr-note' }, 'מעקב בלבד: המחירים מתעדכנים באיחור, ואין כאן קנייה, מכירה או המלצה.'));
    setTimeout(() => sym.focus(), 30);
  }

  /* ---------- the shared קופה ---------- */
  function kupaFoot() {
    const k = kupa();
    return el('p', { class: 'pr-muted pr-foot' },
      k ? [el('button', { class: 'btn small ghost', type: 'button', onclick: () => kupaInvite(k) }, 'הזמנה לקופה'), ' ',
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => kupaLeave(k) }, 'יציאה מהקופה')]
        : el('button', { class: 'btn small ghost', type: 'button', onclick: kupaOpen }, 'פתיחת קופה משותפת עם בן או בת הבית'));
  }
  async function people() {
    try { return (await api('/api/parnasa/people')).people || []; } catch (e) { toast(say(e)); return null; }
  }
  const personSelect = (list) => el('select', {}, el('option', { value: '' }, 'בלי הזמנה עכשיו'), list.map((p) => el('option', { value: p.email }, p.name)));
  async function kupaOpen() {
    const list = await people(); if (!list) return;
    const name = el('input', { type: 'text', maxlength: '40', placeholder: 'קופת הבית' }), who = personSelect(list);
    const form = el('form', { class: 'pr-entry', novalidate: true },
      el('p', { class: 'pr-muted' }, 'קופה משותפת היא מקום לרישומים של הבית, שכל מי שבה רואה ורושם. מה שרשום ב"שלי" נשאר שלכם בלבד.'),
      el('label', { class: 'field' }, el('span', {}, 'שם הקופה'), name),
      el('label', { class: 'field' }, el('span', {}, 'להזמין את'), who),
      el('button', { class: 'btn primary', type: 'submit' }, 'פתיחה'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const r = await api('/api/parnasa/kupa', { body: { name: name.value, invite: who.value || undefined } }); H.closeModal(); scope = r.id; H.savePrefs('parnasa', { scope }); toast(who.value ? 'הקופה נפתחה, וההזמנה נשלחה' : 'הקופה נפתחה'); load(); } catch (err) { toast(say(err)); }
    });
    H.modal(el('h3', {}, 'קופה משותפת'), form);
  }
  async function kupaInvite(k) {
    const list = (await people())?.filter((p) => !k.members.some((m) => m.name === p.name)); if (!list) return;
    if (!list.length) return toast('כל בני הבית כבר בקופה או הוזמנו');
    const who = personSelect(list);
    const form = el('form', { class: 'pr-entry', novalidate: true }, el('label', { class: 'field' }, el('span', {}, 'להזמין את'), who), el('button', { class: 'btn primary', type: 'submit' }, 'הזמנה'));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (!who.value) return;
      try { await api(`/api/parnasa/kupa/${encodeURIComponent(k.id)}/invite`, { body: { email: who.value } }); H.closeModal(); toast('ההזמנה נשלחה'); load(); } catch (err) { toast(say(err)); }
    });
    H.modal(el('h3', {}, `הזמנה ל${k.name}`), form);
  }
  function kupaLeave(k) {
    const last = k.members.filter((m) => !m.invited).length <= 1;
    H.modal(el('h3', {}, 'יציאה מהקופה'),
      el('p', {}, last ? 'אתם האחרונים בקופה. ביציאה הקופה נסגרת וכל מה שנרשם בה יימחק, ולא יהיה אפשר להחזיר.' : 'מה שרשמתם בקופה נשאר בה, לשאר החברים. לא תראו אותו יותר.'),
      el('div', { class: 'pr-quick-btns' },
        el('button', { class: 'btn primary', type: 'button', onclick: async () => {
          try { await api(`/api/parnasa/kupa/${encodeURIComponent(k.id)}/leave`, { method: 'POST', body: {} }); H.closeModal(); scope = 'me'; H.savePrefs('parnasa', { scope }); load(); } catch (e) { toast(say(e)); }
        } }, last ? 'לסגור את הקופה' : 'יציאה'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'ביטול')));
  }

  /* ---------- the floating button (phones; hidden while the quick card shows) ---------- */
  let fabObs = null;
  const fab = () => el('button', { class: 'pr-fab', type: 'button', 'aria-label': 'רישום הוצאה', onclick: () => entry({ kind: 'out' }) }, ic('plus'));
  function watchFab() {
    fabObs?.disconnect();
    const q = root.querySelector('.pr-quick'), f = root.querySelector('.pr-fab');
    if (!q || !f || !('IntersectionObserver' in window)) return;
    fabObs = new IntersectionObserver(([e]) => { f.hidden = e.isIntersecting; });
    fabObs.observe(q);
  }

  /* ---------- importing a bank or card file (#import) ---------- */
  let imp = null;   // { rows, found, payments, step, flip, saved }
  const steps = (n) => el('ol', { class: 'pr-steps' }, ['הקובץ', 'בדיקה', 'נשמר'].map((t, i) => el('li', { class: i + 1 < n ? 'done' : null, 'aria-current': i + 1 === n ? 'step' : null }, t)));
  function renderImport() {
    if (!imp) imp = { step: 1 };
    const where = scope === 'me' ? 'שלי' : kupa()?.name || 'שלי';
    const sec = el('section', { class: 'card', 'aria-labelledby': 'im-h' }, el('h2', { id: 'im-h' }, 'ייבוא מהבנק או מחברת האשראי'), steps(imp.step));
    if (imp.step === 1) {
      const input = el('input', { type: 'file', accept: '.csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const drop = el('label', { class: 'pr-drop' }, ic('file'), el('b', {}, 'בחירת קובץ, או גרירה לכאן'), el('small', {}, 'Excel או CSV, כמו שהורדת מאתר הבנק'), input);
      input.addEventListener('change', () => input.files[0] && readFile(input.files[0]));
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) readFile(f); });
      sec.append(drop, el('p', { class: 'pr-banks' }, `מכיר את הקבצים של הבנקים הגדולים ושל כאל, מקס וישראכרט. הקובץ נקרא אצלך, ורק השורות שאישרת נשמרות (ב"${where}").`));
    } else if (imp.step === 2) sec.append(...review());
    else sec.append(el('div', { class: 'pr-done' }, ic('check'), el('b', {}, `${imp.saved} תנועות נשמרו`),
      el('span', { class: 'pr-muted' }, 'הקטגוריות שתיקנת ייזכרו לפעם הבאה.'),
      el('a', { class: 'btn', href: '#', onclick: () => { imp = null; } }, 'לסקירה')));
    root.replaceChildren(el('a', { class: 'pr-link', href: '#', onclick: () => { imp = null; } }, '→ פרנסה'), sec);
  }

  /** text from a file in whatever it was saved in (Israeli banks still give windows-1255 at times) */
  const textOf = (buf) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1255').decode(buf); } };
  const inflate = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  async function readFile(file) {
    if (file.size > 15e6) return toast('הקובץ גדול מדי.');
    let rows;
    try {
      const buf = await file.arrayBuffer();
      const kind = P.sniff(buf);
      if (kind === 'biff') return toast('זה קובץ Excel ישן. אפשר לפתוח אותו ולשמור כ-xlsx או CSV, או להוריד מהבנק בפורמט אחר.', null, null);
      rows = kind === 'xlsx' ? await P.parseXlsx(buf, inflate) : kind === 'html' ? P.parseHtmlTable(textOf(buf)) : P.parseCsv(textOf(buf));
    } catch (e) { return toast('לא הצלחתי לקרוא את הקובץ. אפשר לנסות לשמור אותו כ-CSV.'); }
    const found = P.detect(rows);
    if (!found) return toast('לא מצאתי בקובץ עמודות של תאריך, תיאור וסכום.');
    imp = { step: 2, rows, found, flip: false };
    await prepare();
  }
  async function prepare() {
    let pays = P.toPayments(imp.rows, imp.found, { flip: imp.flip, learned: data.learned });
    if (!pays.length) { imp = { step: 1 }; renderImport(); return toast('לא נמצאו בקובץ תנועות עם תאריך וסכום.'); }
    if (pays.length > 2000) { toast('הקובץ ארוך: נבדקות 2,000 התנועות האחרונות.'); pays = pays.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 2000); }
    try {
      const r = await api('/api/parnasa/import/check', { body: { scope, rows: pays.map(({ date, amount, what }) => ({ date, amount, what })) } });
      pays.forEach((p, i) => { if (r.dup[i]) { p.state = 'dup'; p.pick = false; p.why = 'כבר רשום, באותו יום ובאותו סכום.'; } });
    } catch (e) { toast(say(e)); }
    imp.payments = pays;
    renderImport();
  }
  function review() {
    const pays = imp.payments;
    const count = (s) => pays.filter((p) => p.state === s).length;
    const bar = el('span');
    const paintBar = () => {
      const picked = pays.filter((p) => p.pick);
      bar.replaceChildren(el('b', {}, picked.length === 1 ? 'שורה אחת' : `${picked.length} שורות`), ' יישמרו · ', num(picked.reduce((a, p) => a + p.amount, 0), true));
      save.disabled = !picked.length;
    };
    const save = el('button', { class: 'btn primary', type: 'button', onclick: doSave }, 'שמירה');
    const rows = pays.map((p) => {
      const opts = data.cats.filter((c) => c.kind === (p.amount > 0 ? 'in' : 'out')).map((c) => el('option', { value: c.key, selected: c.key === p.cat }, c.name));
      const li = el('li', { class: 'pr-row', 'data-state': p.state, 'data-c': p.amount > 0 ? null : cat(p.cat).c });
      const sel = el('select', { class: 'pr-row-cat', 'aria-label': `קטגוריה: ${p.what}`, onchange: () => { p.cat = sel.value; li.setAttribute('data-c', p.amount > 0 ? '' : cat(p.cat).c); } }, opts);
      const box = el('input', { type: 'checkbox', checked: p.pick, 'aria-label': `לשמור: ${p.what}`, onchange: () => { p.pick = box.checked; paintBar(); } });
      li.append(el('label', { class: 'pr-pick' }, box), el('span', { class: 'pr-row-date' }, `${p.date.slice(8, 10)}.${p.date.slice(5, 7)}`),
        el('span', { class: 'pr-row-what' }, p.what), sel, el('span', { class: 'pr-amt', 'data-kind': p.amount > 0 ? 'in' : null }, num(p.amount, true)),
        p.why ? el('span', { class: 'pr-row-why' }, p.why) : null);
      return li;
    });
    const flip = el('input', { type: 'checkbox', checked: imp.flip, onchange: () => { imp.flip = flip.checked; prepare(); } });
    async function doSave() {
      const picked = pays.filter((p) => p.pick);
      save.disabled = true;
      try {
        const r = await api('/api/parnasa/import', { body: { scope, rows: picked.map(({ date, amount, what, cat: c, key }) => ({ date, amount, what, cat: c, key })) } });
        imp = { step: 3, saved: r.saved };
        renderImport();
        api(`/api/parnasa?scope=${encodeURIComponent(scope)}&month=${month}`).then((d) => { data = d; }).catch(() => {});
      } catch (e) { save.disabled = false; toast(say(e)); }
    }
    const unsure = count('unsure'), dup = count('dup'), fresh = pays.length - unsure - dup;
    const out = [
      el('div', { class: 'pr-review-sum' },
        el('span', { class: 'pr-pill' }, fresh === 1 ? 'חדשה אחת' : `${fresh} חדשות`),
        unsure ? el('span', { class: 'pr-pill', 'data-state': 'unsure' }, `${unsure} לבדיקה`) : null,
        dup ? el('span', { class: 'pr-pill', 'data-state': 'dup' }, dup === 1 ? 'אחת כבר רשומה' : `${dup} כבר רשומות`) : null),
      el('label', { class: 'toggle' }, flip, 'ההוצאות יצאו כהכנסות? להפוך את הסימנים'),
      el('ul', { class: 'pr-rows' }, el('li', { class: 'pr-row pr-row-head', 'aria-hidden': 'true' }, el('span'), el('span', {}, 'תאריך'), el('span', {}, 'מה'), el('span', {}, 'קטגוריה'), el('span', {}, 'סכום')), rows),
      el('div', { class: 'pr-review-bar' }, bar, el('span', { class: 'pr-quick-btns' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { imp = { step: 1 }; renderImport(); } }, 'ביטול'), save)),
    ];
    paintBar();
    return out;
  }

  await load();
})();
