/* תחזוקת הבית (docs/vision/later.md; H.FUTURE 'home'): the household's things that need regular care, what is late or
   due soon first, "בוצע היום" in one tap, and a warranty date for each. Shared by the household (/api/home, server/home.ts).
   Later (the spec): a warranty from a photo of the receipt, a reminder by push, and the link to the garage.
   The look is design's: shared classes only; the few sizes held inline here wait for home.css (docs/decisions.md). */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('תחזוקת הבית');
  const root = document.querySelector('main');
  let data = null;

  const fmt = (d) => (d ? new Date(d + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const days = (n) => (n === 1 ? 'יום' : n === 2 ? 'יומיים' : `${n} ימים`);
  const EVERY = [[7, 'כל שבוע'], [14, 'כל שבועיים'], [30, 'כל חודש'], [60, 'כל חודשיים'], [90, 'כל שלושה חודשים'], [180, 'כל חצי שנה'], [365, 'כל שנה'], [730, 'כל שנתיים']];
  const everyText = (n) => (EVERY.find(([d]) => d === n) || [0, n ? `כל ${days(n)}` : 'בלי מועד קבוע'])[1];
  const WHY = { bad_name: 'צריך שם.', bad_every: 'כל כמה ימים? מספר בין 1 ל-3650.', bad_date: 'התאריך לא תקין (ותאריך ביצוע לא יכול להיות בעתיד).', too_many: 'הגעתם ל-200 פריטים.', not_found: 'הפריט כבר לא קיים.' };
  const why = (e) => WHY[e?.message] || e?.message || 'משהו השתבש.';

  /** how an item stands, in words */
  function stateLine(it) {
    const d = it.due;
    if (d.state === 'late') return { text: `באיחור של ${days(-d.days)}`, strong: true };
    if (d.state === 'soon') return { text: d.days === 0 ? 'היום' : `בעוד ${days(d.days)}`, strong: true };
    if (d.state === 'new') return { text: 'עוד לא סומן מתי נעשה לאחרונה' };
    if (d.state === 'ok') return { text: `הבא: ${fmt(d.next)}` };
    return { text: 'בלי מועד קבוע' };
  }
  const warrantyLine = (w) => (!w ? null : w.state === 'over' ? 'האחריות נגמרה' : w.state === 'ending' ? `האחריות נגמרת בעוד ${days(w.days)}` : null);

  async function markDone(it) {
    try { await api(`/api/home/${it.id}/done`, { method: 'POST', body: {} }); toast(`${it.name}: סומן שבוצע היום`); await load(); }
    catch (e) { toast(why(e)); }
  }

  function itemCard(it) {
    const s = stateLine(it), w = warrantyLine(it.warranty);
    const tip = data.presets.find((p) => p.kind === it.kind)?.tip;
    const last = data.log.find((l) => l.item === it.id);
    return el('li', { class: 'card', style: 'padding:12px 14px;margin:10px 0' },
      el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline' },
        el('h3', { style: 'margin:0;font-size:1.05rem;flex:1 1 10em' }, it.name),
        el(s.strong ? 'b' : 'span', { class: s.strong ? '' : 'muted' }, s.text)),
      el('p', { class: 'muted', style: 'margin:6px 0 0;font-size:.9rem' },
        [it.every_days ? everyText(it.every_days) : null, it.last_done ? `נעשה ב-${fmt(it.last_done)}${last?.who && last.done_on === it.last_done ? ` (${last.who})` : ''}` : null].filter(Boolean).join(' · ')),
      tip || it.note ? el('p', { style: 'margin:6px 0 0;font-size:.92rem' }, it.note || tip) : null,
      w ? el('p', { style: 'margin:6px 0 0;font-size:.92rem' }, el('b', {}, w), ` (${fmt(it.warranty_until)})`) : null,
      el('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' },
        it.every_days ? el('button', { class: 'btn ' + (it.due.state === 'late' || it.due.state === 'soon' ? 'primary' : '') + ' small', type: 'button', onclick: () => markDone(it) }, 'בוצע היום') : null,
        el('button', { class: 'btn ghost small', type: 'button', 'aria-label': `עריכת ${it.name}`, onclick: () => editor(it) }, 'עריכה')));
  }

  /** add or change one thing */
  function editor(it) {
    const isNew = !it;
    it = it || { name: '', kind: 'custom', every_days: 365, last_done: null, warranty_until: null, note: null };
    const name = el('input', { type: 'text', maxlength: 60, dir: 'auto', value: it.name, required: true });
    const every = el('select', {}, [...EVERY, [0, 'בלי מועד קבוע'], [-1, 'מספר ימים אחר…']].map(([d, t]) => el('option', { value: d }, t)));
    const custom = el('input', { type: 'number', min: 1, max: 3650, inputmode: 'numeric', 'aria-label': 'כל כמה ימים', hidden: true });
    const known = EVERY.some(([d]) => d === it.every_days);
    every.value = !it.every_days ? '0' : known ? String(it.every_days) : '-1';
    if (!known && it.every_days) { custom.hidden = false; custom.value = it.every_days; }
    every.addEventListener('change', () => { custom.hidden = every.value !== '-1'; if (!custom.hidden) custom.focus(); });
    const last = el('input', { type: 'date', value: it.last_done || '', max: data.today });
    const warr = el('input', { type: 'date', value: it.warranty_until || '' });
    const note = el('textarea', { rows: 2, maxlength: 300, dir: 'auto' }, it.note || '');
    const err = el('p', { class: 'hint', role: 'alert' });
    const save = async () => {
      const e = every.value === '-1' ? custom.value : every.value === '0' ? null : every.value;
      const b = { name: name.value, kind: it.kind, every_days: e, last_done: last.value || null, warranty_until: warr.value || null, note: note.value };
      try { await api(isNew ? '/api/home' : `/api/home/${it.id}`, { method: isNew ? 'POST' : 'PUT', body: b }); H.closeModal(); await load(); toast(isNew ? 'נוסף' : 'נשמר'); }
      catch (x) { err.textContent = why(x); }
    };
    const del = async () => {
      if (!confirm(`למחוק את "${it.name}" ואת ההיסטוריה שלו?`)) return;
      try { await api(`/api/home/${it.id}`, { method: 'DELETE' }); H.closeModal(); await load(); toast('נמחק'); } catch (x) { err.textContent = why(x); }
    };
    H.modal(el('h2', {}, isNew ? 'משהו חדש לתחזק' : 'עריכה'),
      el('label', { class: 'field' }, el('span', {}, 'מה'), name),
      el('label', { class: 'field' }, el('span', {}, 'כל כמה זמן'), every), custom,
      el('label', { class: 'field' }, el('span', {}, 'מתי נעשה לאחרונה'), last),
      el('label', { class: 'field' }, el('span', {}, 'האחריות בתוקף עד (לא חובה)'), warr),
      el('label', { class: 'field' }, el('span', {}, 'הערה (לא חובה)'), note),
      err,
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        el('button', { class: 'btn primary', type: 'button', onclick: save }, 'שמירה'),
        isNew ? null : el('button', { class: 'btn ghost', type: 'button', onclick: del }, 'מחיקה')));
    setTimeout(() => name.focus(), 50);
  }

  /** the first visit: tick the things this home has */
  function starter() {
    const have = new Set(data.items.map((i) => i.kind));
    const left = data.presets.filter((p) => !have.has(p.kind));
    if (!left.length) return null;
    const picked = new Set();
    const go = el('button', { class: 'btn primary', type: 'button', disabled: true, onclick: async () => {
      go.disabled = true;
      try {
        for (const k of picked) { const p = data.presets.find((x) => x.kind === k); await api('/api/home', { method: 'POST', body: { kind: p.kind, every_days: p.every_days } }); }
        toast('נוסף. סמנו מתי כל דבר נעשה לאחרונה, ואזכיר כשמגיע הזמן.'); await load();
      } catch (e) { toast(why(e)); go.disabled = false; }
    } }, 'הוספה');
    return el('section', { class: 'card', style: 'padding:14px' },
      el('h2', { style: 'margin-top:0' }, data.items.length ? 'עוד דברים שיש בבית' : 'מה יש בבית שלכם?'),
      el('p', { class: 'muted', style: 'margin-top:0' }, 'בוחרים, וכל דבר מקבל מועד טיפול קבוע. אפשר לשנות אחר כך.'),
      el('div', { role: 'group', 'aria-label': 'דברים נפוצים בבית', style: 'display:flex;flex-wrap:wrap;gap:6px;margin-block-end:12px' },
        left.map((p) => el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onclick: (e) => {
          const on = !picked.has(p.kind); on ? picked.add(p.kind) : picked.delete(p.kind);
          e.currentTarget.setAttribute('aria-pressed', String(on)); go.disabled = !picked.size;
        } }, `${p.name} · ${everyText(p.every_days)}`))),
      go);
  }

  function draw() {
    root.textContent = '';
    const late = data.items.filter((i) => i.due.state === 'late').length, soon = data.items.filter((i) => i.due.state === 'soon').length;
    const ending = data.items.filter((i) => i.warranty?.state === 'ending').length;
    const sum = [late && `${late} באיחור`, soon && `${soon} בשבוע הקרוב`, ending && `${ending} עם אחריות שנגמרת`].filter(Boolean).join(' · ');
    root.append(...[
      el('div', { style: 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:14px 0' },
        el('p', { role: 'status', style: 'margin:0;flex:1' }, data.items.length ? (sum || 'הכול בזמן. 👍') : 'הבית של כולם: מה שמסמנים כאן, כל בני הבית רואים.'),
        data.items.length ? el('button', { class: 'btn small', type: 'button', onclick: () => editor(null) }, '+ משהו אחר') : null),
      data.items.length ? el('ul', { style: 'list-style:none;padding:0;margin:0' }, data.items.map(itemCard)) : null,
      data.items.length ? null : starter(),
      data.items.length ? null : el('button', { class: 'btn ghost', type: 'button', style: 'margin-top:8px', onclick: () => editor(null) }, 'משהו שלא ברשימה')].filter(Boolean));
    if (data.items.length) {
      const more = starter();
      if (more) root.append(el('details', { style: 'margin-top:18px' }, el('summary', { style: 'cursor:pointer' }, 'להוסיף עוד דברים נפוצים'), more));
    }
    if (data.log.length) {
      const name = (id) => data.items.find((i) => i.id === id)?.name;
      root.append(el('section', { style: 'margin-top:22px' }, el('h2', {}, 'נעשה לאחרונה'),
        el('ul', { style: 'padding-inline-start:1.2em;line-height:1.8' }, data.log.filter((l) => name(l.item)).slice(0, 10).map((l) =>
          el('li', {}, `${name(l.item)}, ${fmt(l.done_on)}${l.who ? ` (${l.who})` : ''}`)))));
    }
  }

  async function load() {
    try { data = await api('/api/home'); draw(); }
    catch (e) { root.textContent = ''; root.append(el('p', { class: 'notice' }, why(e))); }
  }
  root.append(el('p', { class: 'muted' }, 'טוען…'));
  await load();
})();
