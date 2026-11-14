/* הגינה (docs/vision/future-specs.md §4; H.FUTURE 'garden'): the household's plants (shared by the household), when each
   needs water by the weather (a fixed rule, server/garden-rules.ts), "השקיתי" in one tap, and from a photo: a new plant
   (identify, then confirm) and the plant doctor. Photos are free with a quota (3 a day), then "להמשיך בקרדיטים".
   The look is design's: shared classes only; the few sizes held inline here wait for garden.css (docs/decisions.md). */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('הגינה');
  const root = document.querySelector('main');
  let data = null;
  const modal = (...parts) => H.modal(...parts.filter(Boolean));   // (H.modal shows a null as text)

  const fmt = (d) => (d ? new Date(d + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) : '');
  const days = (n) => (n === 1 ? 'יום' : n === 2 ? 'יומיים' : `${n} ימים`);
  const everyText = (n) => (n === 1 ? 'כל יום' : n === 7 ? 'פעם בשבוע' : n === 14 ? 'פעם בשבועיים' : `כל ${days(n)}`);
  const WHY = {
    bad_name: 'צריך שם.', bad_every: 'כל כמה ימים? מספר בין 1 ל-60.', bad_date: 'התאריך לא תקין (ולא בעתיד).', too_many: 'הגעתם ל-100 צמחים.',
    not_found: 'הצמח כבר לא קיים.', bad_photo: 'התמונה לא נקראה. נסו תמונה אחרת.', ai_failed: 'לא הצלחנו לקרוא את התמונה. נסו שוב.',
    ai_not_configured: 'הזיהוי מתמונה עוד לא מחובר.', ai_credit_needed: 'נגמרו התמונות להיום. חזרו מחר.',
  };
  const why = (e) => WHY[e?.code] || WHY[e?.message] || e?.message || 'משהו השתבש.';
  const picture = (p) => (p.has_photo ? `/api/garden/${p.id}/photo?v=${p.updated_at || ''}` : `/assets/kit/garden/${data.presets.some((x) => x.kind === p.kind) ? p.kind : 'pothos'}.webp`);
  const left = () => Math.max(0, data.quota.free - data.quota.used);

  /** a photo from the camera or the gallery, made small in the browser: a long side of `max` px, as a JPEG data URL */
  function pickPhoto(max = 1024, q = 0.8) {
    return new Promise((resolve) => {
      const input = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
      input.addEventListener('change', async () => {
        const f = input.files?.[0]; input.remove();
        if (!f) return resolve(null);
        try {
          const bmp = await createImageBitmap(f);
          const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
          const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
          c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', q));
        } catch { toast('התמונה לא נפתחה.'); resolve(null); }
      });
      document.body.append(input);
      input.click();
    });
  }

  /** identify or the doctor: the photo, the quota (402 quota_done → "להמשיך בקרדיטים"), the answer */
  async function ask(path, extra, box) {
    const image = await pickPhoto();
    if (!image) return null;
    const send = async (paid) => {
      box.replaceChildren(el('p', { class: 'muted', role: 'status' }, 'מסתכלים בתמונה…'));
      try {
        const r = await api(path, { method: 'POST', body: { image, paid, ...extra } });
        data.quota.used = r.used;
        return r;
      } catch (e) {
        if (e.code === 'quota_done') {
          return new Promise((resolve) => box.replaceChildren(
            el('p', { role: 'status' }, `נגמרו ${data.quota.free} התמונות החינמיות של היום. מחר יש שוב.`),
            el('button', { class: 'btn', type: 'button', onclick: async () => resolve(await send(true)) }, 'להמשיך בקרדיטים')));
        }
        box.replaceChildren(el('p', { class: 'notice', role: 'alert' }, why(e)));
        return null;
      }
    };
    return send(false);
  }
  const quotaLine = () => el('p', { class: 'muted', style: 'margin:6px 0 0;font-size:.88rem' }, left() ? `עוד ${left() === 1 ? 'תמונה אחת' : `${left()} תמונות`} חינם היום` : 'התמונות החינמיות של היום נגמרו (אפשר להמשיך בקרדיטים)');

  /** how a plant stands, in words */
  function stateLine(p) {
    const d = p.due;
    const because = d.why === 'rain' ? ' (ירד גשם)' : d.why === 'heat' ? ' (חם היום)' : '';
    if (d.state === 'late') return { text: `צריך מים, באיחור של ${days(-d.days)}`, strong: true };
    if (d.state === 'today') return { text: `להשקות היום${because}`, strong: true };
    if (d.state === 'soon') return { text: `להשקות מחר${because}` };
    if (d.state === 'new') return { text: 'מתי הושקה לאחרונה?' };
    return { text: `להשקות בעוד ${days(d.days)}${because}` };
  }

  async function watered(p) {
    try { await api(`/api/garden/${p.id}/water`, { method: 'POST', body: {} }); toast(`${p.name}: הושקה היום 💧`); await load(); }
    catch (e) { toast(why(e)); }
  }

  function plantCard(p) {
    const s = stateLine(p);
    const due = p.due.state === 'late' || p.due.state === 'today';
    return el('li', { class: 'card', style: 'padding:10px 12px;margin:10px 0;display:flex;gap:12px;align-items:center' },
      el('img', { src: picture(p), alt: '', width: 64, height: 64, loading: 'lazy', decoding: 'async', style: 'inline-size:64px;block-size:64px;object-fit:cover;border-radius:12px;flex:none' }),
      el('div', { style: 'flex:1;min-inline-size:0' },
        el('h3', { style: 'margin:0;font-size:1.05rem' }, el('button', { class: 'linkish', type: 'button', style: 'all:unset;cursor:pointer', onclick: () => page(p) }, p.name)),
        el(s.strong ? 'b' : 'p', { class: s.strong ? '' : 'muted', style: 'display:block;margin:2px 0 0;font-size:.92rem' }, s.text),
        el('div', { style: 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap' },
          el('button', { class: 'btn small' + (due || p.due.state === 'new' ? ' primary' : ''), type: 'button', onclick: () => watered(p) }, 'השקיתי'),
          el('button', { class: 'btn ghost small', type: 'button', 'aria-label': `הדף של ${p.name}`, onclick: () => page(p) }, 'פרטים'))));
  }

  /** a plant's page: its care, its history, the doctor for it, and the edit fields */
  function page(p) {
    const tip = data.presets.find((x) => x.kind === p.kind)?.tip;
    const hist = data.log.filter((l) => l.plant === p.id).slice(0, 12);
    const doc = el('div', { 'aria-live': 'polite' });
    modal(
      el('div', { style: 'display:flex;gap:12px;align-items:center' },
        el('img', { src: picture(p), alt: '', width: 72, height: 72, style: 'inline-size:72px;block-size:72px;object-fit:cover;border-radius:14px' }),
        el('div', {}, el('h2', { style: 'margin:0' }, p.name),
          el('p', { class: 'muted', style: 'margin:2px 0 0' }, `${p.place === 'out' ? 'בחוץ' : 'בבית'} · ${everyText(p.every_days)}`))),
      p.note || tip ? el('p', {}, p.note || tip) : null,
      el('p', {}, el('b', {}, stateLine(p).text), p.last_watered ? ` · הושקה לאחרונה ב-${fmt(p.last_watered)}` : ''),
      hist.length ? el('details', {}, el('summary', { style: 'cursor:pointer' }, 'היסטוריה'),
        el('ul', { style: 'padding-inline-start:1.2em;line-height:1.8' }, hist.map((l) =>
          el('li', {}, l.kind === 'doctor' ? `🩺 ${fmt(l.on_date)}: ${l.note || ''}` : `💧 ${fmt(l.on_date)}${l.who ? ` (${l.who})` : ''}`)))) : null,
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => { H.closeModal(); watered(p); } }, 'השקיתי'),
        el('button', { class: 'btn', type: 'button', onclick: () => doctor(doc, p) }, '🩺 משהו לא בסדר איתו?'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => editor(p) }, 'עריכה')),
      doc);
  }

  /** the plant doctor: a photo → what is wrong and what to do; for a plant, written in its history */
  async function doctor(box, p = null) {
    const r = await ask('/api/garden/doctor', p ? { plant: p.id } : {}, box);
    if (!r) return;
    box.replaceChildren(el('section', { class: 'card', style: 'padding:12px;margin-top:12px' },
      el('h3', { style: 'margin:0 0 4px' }, (r.urgent ? '⚠️ ' : '') + r.problem),
      r.plant && !p ? el('p', { class: 'muted', style: 'margin:0' }, r.plant) : null,
      r.why ? el('p', {}, r.why) : null,
      r.steps.length ? el('ol', { style: 'padding-inline-start:1.4em;line-height:1.7' }, r.steps.map((x) => el('li', {}, x))) : null,
      el('p', { class: 'muted', style: 'font-size:.85rem;margin:6px 0 0' }, 'זו הערכה מתמונה, לא בדיקה. אם זה מחמיר, שאלו במשתלה.'),
      quotaLine()));
    if (p) load();
  }

  /** a new plant from a photo: identify, then confirm in the editor */
  async function fromPhoto(box) {
    const r = await ask('/api/garden/identify', {}, box);
    if (!r) return;
    box.replaceChildren();
    editor(null, { name: r.name === 'לא נמצא צמח' ? '' : r.name, kind: r.kind, place: r.place, every_days: r.every_days, note: r.care || null },
      r.sure ? 'זיהינו מהתמונה. בדקו ושמרו.' : 'לא בטוחים בזיהוי. תקנו את השם אם צריך.');
  }

  /** add or change a plant */
  function editor(p, seed = {}, hint = '') {
    const isNew = !p;
    p = p || { name: '', kind: 'custom', place: 'in', every_days: 7, last_watered: null, note: null, ...seed };
    const name = el('input', { type: 'text', maxlength: 60, dir: 'auto', value: p.name, required: true });
    const place = el('select', {}, el('option', { value: 'in' }, 'בבית (גשם לא משקה אותו)'), el('option', { value: 'out' }, 'בחוץ (גשם נחשב השקיה)'));
    place.value = p.place;
    const every = el('input', { type: 'number', min: 1, max: 60, inputmode: 'numeric', value: p.every_days });
    const last = el('input', { type: 'date', value: p.last_watered || (isNew ? data.today : ''), max: data.today });
    const note = el('textarea', { rows: 3, maxlength: 300, dir: 'auto' }, p.note || '');
    const people = data.people || [];
    const to = people.length > 1 ? el('select', {}, people.map((x) => el('option', { value: x.email }, x.email === data.me ? `${x.name || 'אני'} (אני)` : x.name || x.email))) : null;
    if (to) to.value = p.remind_to || data.me;
    let photo;   // undefined: unchanged, null: removed, a data URL: new
    const photoBtn = el('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
      const d = await pickPhoto(320, 0.7);
      if (d) { photo = d; photoBtn.textContent = '✓ תמונה חדשה'; }
    } }, p.has_photo ? 'להחליף תמונה' : 'תמונה של הצמח (לא חובה)');
    const err = el('p', { class: 'hint', role: 'alert' });
    const save = async () => {
      const b = { name: name.value, kind: p.kind, place: place.value, every_days: every.value, last_watered: last.value || null, note: note.value };
      if (to) b.remind_to = to.value;
      if (photo !== undefined) b.photo = photo;
      try { await api(isNew ? '/api/garden' : `/api/garden/${p.id}`, { method: isNew ? 'POST' : 'PUT', body: b }); H.closeModal(); await load(); toast(isNew ? 'נוסף לגינה 🌱' : 'נשמר'); }
      catch (x) { err.textContent = why(x); }
    };
    const del = async () => {
      if (!confirm(`למחוק את "${p.name}" ואת ההיסטוריה שלו?`)) return;
      try { await api(`/api/garden/${p.id}`, { method: 'DELETE' }); H.closeModal(); await load(); toast('נמחק'); } catch (x) { err.textContent = why(x); }
    };
    modal(el('h2', {}, isNew ? 'צמח חדש' : 'עריכה'),
      hint ? el('p', { class: 'muted' }, hint) : null,
      el('label', { class: 'field' }, el('span', {}, 'שם'), name),
      el('label', { class: 'field' }, el('span', {}, 'איפה הוא'), place),
      el('label', { class: 'field' }, el('span', {}, 'כל כמה ימים משקים'), every),
      el('label', { class: 'field' }, el('span', {}, 'מתי הושקה לאחרונה'), last),
      to ? el('label', { class: 'field' }, el('span', {}, 'מי מקבל את התזכורת בבוקר'), to) : null,
      el('label', { class: 'field' }, el('span', {}, 'טיפול והערות'), note),
      el('div', { style: 'margin:4px 0 10px' }, photoBtn),
      err,
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        el('button', { class: 'btn primary', type: 'button', onclick: save }, 'שמירה'),
        isNew ? null : el('button', { class: 'btn ghost', type: 'button', onclick: del }, 'מחיקה')));
    setTimeout(() => name.focus(), 50);
  }

  /** the common plants, each a tap away */
  function starter() {
    return el('div', { role: 'group', 'aria-label': 'צמחים נפוצים', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin:8px 0' },
      data.presets.map((x) => el('button', { class: 'card', type: 'button', style: 'padding:8px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;font:inherit;color:inherit',
        onclick: () => editor(null, { name: x.name, kind: x.kind, place: x.place, every_days: x.every_days, note: x.tip }) },
      el('img', { src: `/assets/kit/garden/${x.kind}.webp`, alt: '', width: 56, height: 56, loading: 'lazy', style: 'inline-size:56px;block-size:56px;object-fit:contain' }),
      el('span', { style: 'font-size:.85rem;text-align:center' }, x.name))));
  }

  function weatherLine() {
    const w = data.wx;
    if (!w) return null;
    const bits = [];
    if (w.max != null) bits.push(`היום עד ${Math.round(w.max)}°`);
    if (w.rained) bits.push(w.rained === data.today ? 'ירד גשם היום, הצמחים בחוץ הושקו' : 'ירד גשם אתמול, הצמחים בחוץ הושקו');
    else if (w.max != null && w.max >= 32) bits.push('חם: הצמחים בחוץ ישתו יום מוקדם');
    return el('p', { class: 'muted', style: 'margin:0' }, bits.join(' · '));
  }

  function draw() {
    root.textContent = '';
    const need = data.plants.filter((p) => p.due.state === 'late' || p.due.state === 'today').length;
    const work = el('div', { 'aria-live': 'polite' });
    root.append(...[
      el('section', { style: 'margin:14px 0' },
        el('p', { role: 'status', style: 'margin:0 0 4px;font-weight:600' }, data.plants.length
          ? (need ? `${need === 1 ? 'צמח אחד צריך' : `${need} צמחים צריכים`} מים היום` : 'כולם שתו. 🌿')
          : 'הגינה של כל הבית: מה שמוסיפים ומשקים כאן, כל בני הבית רואים.'),
        weatherLine()),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => fromPhoto(work) }, '📷 צמח חדש מתמונה'),
        el('button', { class: 'btn', type: 'button', onclick: () => doctor(work) }, '🩺 רופא הצמחים')),
      quotaLine(),
      work,
      data.plants.length ? el('ul', { style: 'list-style:none;padding:0;margin:8px 0 0' }, data.plants.map(plantCard)) : null,
      data.plants.length
        ? el('details', { style: 'margin-top:18px' }, el('summary', { style: 'cursor:pointer' }, 'להוסיף מהרשימה'), starter(),
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => editor(null) }, 'צמח שלא ברשימה'))
        : el('section', { style: 'margin-top:18px' }, el('h2', {}, 'או בוחרים מהרשימה'), starter(),
          el('button', { class: 'btn ghost', type: 'button', onclick: () => editor(null) }, 'צמח שלא ברשימה')),
    ].filter(Boolean));
  }

  async function load() {
    try { data = await api('/api/garden'); draw(); }
    catch (e) { root.textContent = ''; root.append(el('p', { class: 'notice' }, why(e))); }
  }
  root.append(el('p', { class: 'muted' }, 'טוען…'));
  await load();
})();
