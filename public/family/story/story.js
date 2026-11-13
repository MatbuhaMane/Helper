// הסיפור המשפחתי, "המוזיאון החי" (docs/vision/story.md). The server sends only what this viewer may see
// (server/story.ts, through server/story-rules.ts): outside the household a people tag arrives as { gap: true }.
// ?person=<tree id> opens the story of one person (the tree's card links here); ?h=<household> another household's
// tribe items. Recordings are made here in Opus (~40 kbps) and photos are made WebP of at most 2560 px before upload.
(() => {
  const { el, api, toast, modal, closeModal } = H;
  const main = document.querySelector('main.st');
  const params = new URLSearchParams(location.search);
  const other = params.get('h');
  const KIND = { story: 'סיפור', recording: 'הקלטה', reading: 'הקראה', doc: 'מסמך', photo: 'תמונה' };
  const LEVEL = { household: 'בני הבית', tribe: 'כל השבט', private: 'רק אני' };
  const ERR = {
    storage_full: 'המקום של הבית מלא (2GB). כל מה שכבר נשמר נשאר, ואפשר לצפות בו ולהוריד אותו.',
    file_too_large: 'הקובץ גדול מדי (עד 25MB).', file_type_not_allowed: 'אי אפשר לשמור קובץ מהסוג הזה כאן.',
    file_required: 'צריך קובץ, או לכתוב מה נאמר בו.', nothing_to_save: 'כתבו כותרת או סיפור.', only_who_added: 'רק מי שהוסיף את הפריט יכול לשנות אותו.',
    too_many_tries: 'יותר מדי העלאות בשעה האחרונה. נסו שוב מאוחר יותר.',
  };
  const say = (e) => toast(ERR[e?.code] || e?.message || 'משהו השתבש');
  const S = { items: [], names: new Map(), dead: new Set(), mine: true, questions: [], storage: null, view: params.get('person') ? 'person' : 'time', person: params.get('person') || '', q: '' };

  /* ---------------- data ---------------- */

  async function load() {
    const [r, t] = await Promise.all([
      api('/api/story' + (other ? '?h=' + encodeURIComponent(other) : '')),
      other ? Promise.resolve(null) : api('/api/vault/tree').catch(() => null),   // the names of our tree, for the tags
    ]);
    Object.assign(S, { items: r.items, mine: r.mine, questions: r.questions || [], storage: r.storage || null });
    if (t) for (const p of t.people) { S.names.set(p.id, p.name || 'בלי שם'); if (p.life?.died) S.dead.add(p.id); }
    render();
  }
  const nameOf = (id) => (typeof id === 'string' ? S.names.get(id) || 'מישהו מהעץ' : null);

  async function upload(fields, file) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, k === 'people' ? JSON.stringify(v || []) : v ?? '');
    if (file) fd.append('file', file, file.name || 'file');
    const res = await fetch('/api/story', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'HTTP ' + res.status); e.code = data.error; throw e; }
    return data;
  }

  /** a photo made small on this device: WebP (or JPEG where WebP can't be written), at most 2560 px on the long side */
  async function smaller(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return file;
    const k = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
    const c = el('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.82));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? new File([blob], 'photo.' + (blob.type === 'image/webp' ? 'webp' : 'jpg'), { type: blob.type }) : file;
  }

  /* ---------------- the recorder: a big microphone, a live wave, a buzz at the start and the end ---------------- */

  const OPUS = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
  function recorder(onDone) {
    let rec = null, stream = null, ctx = null, raf = 0, started = 0, tick = 0, handed = null;
    const canvas = el('canvas', { class: 'st-wave', width: 600, height: 80, style: 'max-inline-size: 100%; block-size: auto', 'aria-hidden': 'true' });
    const time = el('span', { class: 'st-time', 'aria-live': 'off' }, '0:00');
    const mic = el('button', { type: 'button', class: 'st-mic', 'aria-label': 'התחלת הקלטה', 'aria-pressed': 'false', onclick: () => (rec ? stop() : start()) }, H.icon('mic'));
    const box = el('div', { class: 'st-rec' }, mic, canvas, time);
    const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    async function start() {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch { return toast('אין גישה למיקרופון. אפשר לאשר אותה בהגדרות הדפדפן.'); }
      const type = OPUS.find((t) => window.MediaRecorder?.isTypeSupported?.(t));
      rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 40000 });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const t = (rec.mimeType || type || 'audio/webm').split(';')[0];
        onDone(new File([new Blob(chunks, { type: t })], 'recording.' + (t.includes('ogg') ? 'ogg' : t.includes('mp4') ? 'm4a' : 'webm'), { type: t }));
        rec = null; handed?.(); handed = null;
      };
      rec.start(1000);
      navigator.vibrate?.(30);
      started = Date.now();
      mic.classList.add('on'); mic.setAttribute('aria-pressed', 'true'); mic.setAttribute('aria-label', 'סיום ההקלטה');
      tick = setInterval(() => (time.textContent = fmt(Date.now() - started)), 250);
      // the live wave
      ctx = new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize), g = canvas.getContext('2d');
      const color = getComputedStyle(document.documentElement).getPropertyValue('--primary') || '#556b2f';
      const draw = () => {
        an.getByteTimeDomainData(buf);
        g.clearRect(0, 0, canvas.width, canvas.height); g.strokeStyle = color; g.lineWidth = 3; g.beginPath();
        for (let i = 0; i < buf.length; i++) { const x = (i / buf.length) * canvas.width, y = (buf[i] / 255) * canvas.height; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); raf = requestAnimationFrame(draw);
      };
      draw();
    }
    function stop() {
      navigator.vibrate?.([20, 60, 20]);
      clearInterval(tick); cancelAnimationFrame(raf); ctx?.close().catch(() => {});
      rec?.stop(); stream?.getTracks().forEach((t) => t.stop());
      mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false'); mic.setAttribute('aria-label', 'הקלטה מחדש');
    }
    /** stops a recording in progress; resolves once its file was handed over */
    box.stop = () => (rec ? new Promise((r) => { handed = r; stop(); }) : Promise.resolve());
    return box;
  }

  /* ---------------- adding ---------------- */

  function peoplePicker(chosen = []) {
    const set = new Set(chosen.filter((x) => typeof x === 'string'));
    const box = el('div', { class: 'st-people', role: 'group', 'aria-label': 'מי בסיפור' });
    for (const [id, name] of S.names) {
      const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(set.has(id)), onclick: () => {
        set.has(id) ? set.delete(id) : set.add(id); b.setAttribute('aria-pressed', String(set.has(id)));
      } }, name);
      box.append(b);
    }
    if (!S.names.size) box.append(el('span', { class: 'muted' }, 'אין עדיין אנשים בעץ.'));
    box.value = () => [...set];
    return box;
  }
  const field = (label, input) => el('label', { class: 'field' }, el('span', {}, label), input);
  const levelSelect = (v = 'household') => el('select', {}, ...Object.entries(LEVEL).map(([k, t]) => el('option', { value: k, selected: k === v ? '' : null }, t)));

  function addForm(kind, preset = {}) {
    let file = null;
    const title = el('input', { type: 'text', maxlength: 160, value: preset.title || '' });
    const text = el('textarea', { rows: kind === 'story' ? 8 : 3, maxlength: 20000 });
    const when = el('input', { type: 'text', maxlength: 40, placeholder: 'למשל 1952, או שנות ה-50' });
    const place = el('input', { type: 'text', maxlength: 80, placeholder: 'למשל בגדד, או קיבוץ דגניה' });
    const people = peoplePicker(preset.people || (S.person ? [S.person] : []));
    const level = levelSelect();
    const got = el('p', { class: 'hint', 'aria-live': 'polite' });
    let media = null;
    if (kind === 'recording' || kind === 'reading') {
      media = recorder((f) => { file = f; got.textContent = 'ההקלטה מוכנה לשמירה.'; });
      const pick = el('input', { type: 'file', accept: 'audio/*', onchange: () => { file = pick.files[0] || null; if (file) got.textContent = file.name; } });
      media = el('div', {}, media, field('או קובץ שמע קיים', pick));
    } else if (kind === 'photo' || kind === 'doc') {
      const pick = el('input', { type: 'file', accept: kind === 'photo' ? 'image/*' : 'image/*,application/pdf', onchange: async () => {
        file = pick.files[0] || null;
        if (file && kind === 'photo') file = await smaller(file);
        if (file) got.textContent = file.name;
      } });
      media = field(kind === 'photo' ? 'התמונה' : 'המסמך (תמונה או PDF)', pick);
    }
    const save = el('button', { type: 'submit', class: 'btn primary' }, 'שמירה');
    const form = el('form', { class: 'st-form', onsubmit: async (e) => {
      e.preventDefault();
      await media?.querySelector?.('.st-rec')?.stop?.();
      save.disabled = true;
      try {
        await upload({ kind, title: title.value, text: text.value, when: when.value, place: place.value, people: people.value(), level: level.value }, file);
        closeModal(); toast('נשמר.'); await load();
      } catch (err) { say(err); } finally { save.disabled = false; }
    } },
    el('h2', {}, 'הוספת ' + KIND[kind]),
    media, got,
    field('כותרת', title),
    field(kind === 'story' ? 'הסיפור' : kind === 'reading' ? 'מה מוקרא (אפשר להעתיק את הטקסט)' : 'מה רואים או שומעים כאן', text),
    el('div', { class: 'st-two' }, field('מתי', when), field('איפה', place)),
    el('div', { class: 'field' }, el('span', {}, 'מי בסיפור'), people),
    field('מי רואה', level),
    el('div', { class: 'row' }, save));
    modal(form);
    (media ? title : text).focus?.();
  }

  /** the guided interview: a person, then the fixed questions one by one; each answer is a recording tagged in them */
  function interview() {
    const who = el('select', {}, el('option', { value: '' }, 'בחרו את מי מראיינים'), ...[...S.names].map(([id, n]) => el('option', { value: id, selected: id === S.person ? '' : null }, n)));
    let i = 0, file = null, saved = 0;
    const q = el('p', { class: 'st-question', 'aria-live': 'polite' });
    const count = el('p', { class: 'muted' });
    const slot = el('div');
    const next = el('button', { type: 'button', class: 'btn primary' }, 'שמירה והשאלה הבאה');
    const skip = el('button', { type: 'button', class: 'btn ghost' }, 'דילוג');
    const show = () => {
      if (i >= S.questions.length) { closeModal(); toast(saved ? `נשמרו ${saved} תשובות.` : 'הראיון הסתיים.'); return load(); }
      q.textContent = S.questions[i]; count.textContent = `שאלה ${i + 1} מתוך ${S.questions.length}`; file = null;
      slot.replaceChildren(recorder((f) => { file = f; }));
    };
    next.onclick = async () => {
      if (!who.value) return toast('בחרו קודם את מי מראיינים.');
      await slot.querySelector('.st-rec')?.stop?.();
      if (!file) return toast('הקליטו תשובה, או דלגו.');
      next.disabled = true;
      try {
        await upload({ kind: 'recording', title: S.questions[i], text: '', when: '', place: '', people: [who.value], level: 'household' }, file);
        saved++; i++; show();
      } catch (err) { say(err); } finally { next.disabled = false; }
    };
    skip.onclick = () => { slot.querySelector('.st-rec')?.stop?.(); i++; show(); };
    modal(el('div', { class: 'st-form' }, el('h2', {}, 'ראיון מודרך'), field('את מי מראיינים', who), count, q, slot, el('div', { class: 'row' }, next, skip)));
    show();
  }

  /* ---------------- an item ---------------- */

  async function openFile(it, holder) {
    try {
      const res = await fetch(`/api/story/${it.id}/file`);
      if (!res.ok) throw new Error('הקובץ לא נפתח.');
      const url = URL.createObjectURL(await res.blob());
      if (it.mime?.startsWith('audio/')) holder.replaceChildren(el('audio', { controls: '', src: url, autoplay: '' }));
      else if (it.mime?.startsWith('image/')) holder.replaceChildren(el('img', { src: url, alt: it.title || KIND[it.kind], class: 'st-img' }));
      else holder.replaceChildren(el('a', { href: url, download: (it.title || 'מסמך') + '.pdf', class: 'btn' }, 'הורדת המסמך'));
    } catch (e) { say(e); }
  }

  function editForm(it) {
    const title = el('input', { type: 'text', maxlength: 160, value: it.title });
    const text = el('textarea', { rows: 6, maxlength: 20000 }); text.value = it.text;
    const when = el('input', { type: 'text', maxlength: 40, value: it.when });
    const place = el('input', { type: 'text', maxlength: 80, value: it.place });
    const people = peoplePicker(it.people), level = levelSelect(it.level);
    modal(el('form', { class: 'st-form', onsubmit: async (e) => {
      e.preventDefault();
      try {
        await api('/api/story/' + it.id, { method: 'PUT', body: { title: title.value, text: text.value, when: when.value, place: place.value, people: people.value(), level: level.value } });
        closeModal(); await load();
      } catch (err) { say(err); }
    } }, el('h2', {}, 'עריכה'), field('כותרת', title), field('הטקסט', text), el('div', { class: 'st-two' }, field('מתי', when), field('איפה', place)),
    el('div', { class: 'field' }, el('span', {}, 'מי בסיפור'), people), field('מי רואה', level),
    el('div', { class: 'row' }, el('button', { type: 'submit', class: 'btn primary' }, 'שמירה'), el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn ghost', onclick: async () => {
        try {
          await api('/api/story/' + it.id, { method: 'DELETE' }); closeModal(); await load();
          toast('הפריט הוסר.', 'ביטול', async () => { await api(`/api/story/${it.id}/restore`, { method: 'POST' }).catch(say); load(); });
        } catch (err) { say(err); }
      } }, 'הסרה'))));
  }

  function card(it) {
    const quiet = it.people.some((p) => typeof p === 'string' && S.dead.has(p));      // calm and respectful, as in the tree
    const holder = el('div', { class: 'st-media' });
    if (it.file) holder.append(el('button', { type: 'button', class: 'btn', onclick: () => openFile(it, holder) },
      it.mime?.startsWith('audio/') ? 'השמעה' : it.mime?.startsWith('image/') ? 'הצגה' : 'פתיחה'));
    const tags = it.people.map((p) => (typeof p === 'string'
      ? el('a', { class: 'chip', href: '?person=' + encodeURIComponent(p) }, nameOf(p))
      : el('span', { class: 'chip st-gap', 'aria-hidden': 'true' })));
    return el('article', { class: 'card st-item' + (quiet ? ' st-quiet' : ''), 'data-kind': it.kind },
      el('header', { class: 'st-item-head' },
        el('span', { class: 'st-kind' }, KIND[it.kind]),
        it.when ? el('span', { class: 'muted' }, it.when) : null,
        it.place ? el('span', { class: 'muted' }, '· ' + it.place) : null,
        it.level && it.level !== 'household' ? el('span', { class: 'st-level' }, LEVEL[it.level]) : null,
        it.mine ? el('button', { type: 'button', class: 'mini', 'aria-label': 'עריכה', onclick: () => editForm(it) }, el('span', { 'aria-hidden': 'true' }, '✎')) : null),
      it.title ? el('h3', {}, it.title) : null,
      it.text ? el('p', { class: 'st-text' }, it.text) : null,
      holder,
      tags.length ? el('div', { class: 'st-tags' }, ...tags) : null);
  }

  /* ---------------- the museum: by time, by person, by place ---------------- */

  const decade = (y) => (y == null ? 'בלי תאריך' : y < 1900 ? 'לפני 1900' : `שנות ה-${String(Math.floor(y / 10) * 10).slice(2)} (${Math.floor(y / 10) * 10})`);
  function groups(list) {
    const g = new Map(), add = (k, it) => { if (!g.has(k)) g.set(k, []); g.get(k).push(it); };
    if (S.view === 'time') for (const it of list) add(decade(it.year), it);
    else if (S.view === 'place') for (const it of list) add(it.place || 'בלי מקום', it);
    else for (const it of list) { const ps = it.people.filter((p) => typeof p === 'string'); if (!ps.length) add('בלי תיוג', it); for (const p of ps) add(p, it); }
    if (S.view === 'place') return [...g].sort((a, b) => (a[0] === 'בלי מקום') - (b[0] === 'בלי מקום') || a[0].localeCompare(b[0], 'he'));
    return [...g];
  }
  const matches = (it) => {
    if (S.person && !it.people.includes(S.person)) return false;
    if (!S.q) return true;
    return [it.title, it.text, it.place, it.when, ...it.people.map(nameOf)].some((s) => s && s.includes(S.q));
  };

  function list() {
    const shown = S.items.filter(matches);
    const box = el('section', { class: 'st-list', 'aria-live': 'polite' });
    if (!S.items.length) {
      box.append(el('div', { class: 'notice' }, S.mine ? 'עוד אין כאן כלום. אפשר להתחיל בסיפור קצר, בתמונה, או בראיון עם סבא או סבתא.' : 'המשפחה הזו לא פתחה עדיין פריטים לשבט.'));
      return box;
    }
    if (!shown.length) { box.append(el('p', { class: 'muted' }, 'לא נמצא פריט מתאים.')); return box; }
    for (const [k, items] of groups(shown)) {
      const label = S.view === 'person' && S.names.has(k) ? 'הסיפור של ' + S.names.get(k) : k;
      box.append(el('h2', { class: 'st-group' }, label), ...items.map(card));
    }
    return box;
  }

  function render() {
    main.textContent = ''; main.removeAttribute('aria-busy');
    const who = S.person && S.names.get(S.person);
    document.title = (who ? 'הסיפור של ' + who : 'הסיפור המשפחתי') + ' – האוהל';
    const head = el('div', { class: 'st-head' },
      el('h1', {}, who ? 'הסיפור של ' + who : 'הסיפור המשפחתי'),
      el('p', { class: 'muted' }, other ? 'פריטים שמשפחה מקושרת פתחה לשבט.' : 'המוזיאון החי של המשפחה: סיפורים, הקלטות, מסמכים ותמונות.'));
    if (who) head.append(el('a', { href: '/family/story/', class: 'btn ghost' }, 'כל הסיפור המשפחתי'));
    main.append(head);
    if (S.mine) {
      const full = S.storage && S.storage.used >= S.storage.quota;
      const add = (k) => el('button', { type: 'button', class: 'btn', disabled: full && k !== 'story' ? '' : null, onclick: () => addForm(k) }, KIND[k]);
      main.append(el('div', { class: 'st-add', role: 'group', 'aria-label': 'הוספה' },
        el('button', { type: 'button', class: 'btn primary', disabled: full ? '' : null, onclick: interview }, 'ראיון מודרך'),
        add('story'), add('recording'), add('reading'), add('photo'), add('doc')));
      if (S.storage) {
        const gb = (n) => (n / 1024 ** 3).toFixed(n < 1024 ** 3 ? 2 : 1);
        main.append(el('p', { class: 'st-storage' + (full ? ' full' : '') },
          full ? 'המקום של הבית מלא. כל מה שנשמר נשאר, ואפשר לצפות בו ולהוריד אותו. סיפור כתוב עדיין אפשר להוסיף.'
            : `נוצלו ${gb(S.storage.used)} מתוך ${gb(S.storage.quota)} GB`,
          el('meter', { min: 0, max: S.storage.quota, value: S.storage.used, 'aria-label': 'המקום של הבית' })));
      }
    }
    const views = el('div', { class: 'tabs st-views', role: 'tablist', 'aria-label': 'איך מסתובבים במוזיאון' },
      ...[['time', 'ציר זמן'], ['person', 'לפי אדם'], ['place', 'לפי מקום']].map(([k, t]) =>
        el('button', { type: 'button', role: 'tab', class: 'st-view', 'aria-selected': String(S.view === k), onclick: () => { S.view = k; render(); } }, t)));
    const search = el('input', { type: 'search', class: 'st-search', placeholder: 'חיפוש בכל הסיפור', 'aria-label': 'חיפוש', value: S.q, oninput: () => {
      S.q = search.value.trim(); main.querySelector('.st-list').replaceWith(list());
    } });
    main.append(views, search, list());
  }

  H.header('הסיפור המשפחתי');
  load().catch((e) => {
    main.removeAttribute('aria-busy');
    main.replaceChildren(el('div', { class: 'notice' }, e?.code === 'tree_locked' ? 'הסיפור המשפחתי נעול, כמו העץ. פתחו אותו כדי להמשיך.' : e?.message || 'הסיפור לא נטען.'));
  });
})();
