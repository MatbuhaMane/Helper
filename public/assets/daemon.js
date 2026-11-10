/* The daemon companion (after the daemon of Bayt al-Hikma): a shard of your soul that lives beside you as an animal.
 * It floats on every page (or sits large on the home page), talks with you, speaks aloud, listens,
 * changes into any animal and runs the helper's apps for you through Claude. */
(() => {
  'use strict';
  const { el, api, toast } = H;
  const PREFS = 'helper.daemon.prefs';
  let prefs = { speak: true };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch (_) { /* ignore */ }
  const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch (_) { /* ignore */ } };

  let state = null;       // { daemon, transcript, ai, images }
  let root, panel, log, input, statusEl, nameEl, formEl, micBtn, spkBtn, portrait;
  let busy = false;

  /* ---------- the body ---------- */
  function build(hero) {
    portrait = el('img', { class: 'dm-portrait gone', alt: '', decoding: 'async' });
    const canvas = el('canvas', { class: 'dm-embers' });
    root = el('div', { class: 'dm is-spark ' + (hero ? 'dm-hero' : 'dm-float') },
      el('button', { class: 'dm-btn', 'aria-label': 'הדימון שלך', onclick: () => togglePanel() },
        canvas, el('div', { class: 'dm-aura' }),
        el('div', { class: 'dm-body' }, el('div', { class: 'dm-face' }, portrait,
          el('div', { class: 'dm-spark' }, el('div', { class: 'dm-eyes' }, el('i', { class: 'dm-eye' }), el('i', { class: 'dm-eye' }))),
          el('span', { class: 'dm-emoji' })))),
      el('span', { class: 'dm-badge' }, '1'),
      hero ? el('span', { class: 'dm-label' }) : null);
    embers(canvas);
    blinkLoop();
    // Look toward the pointer, like the game's daemon looks where you look.
    window.addEventListener('pointermove', (e) => {
      const r = root.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / innerWidth;
      const dy = (e.clientY - (r.top + r.height / 2)) / innerHeight;
      root.style.setProperty('--ry', `${(dx * 22).toFixed(1)}deg`);
      root.style.setProperty('--rx', `${(-dy * 16).toFixed(1)}deg`);
      root.querySelector('.dm-eyes').style.transform = `translate(${dx * 14}%, ${dy * 14 - 6}%)`;
    }, { passive: true });
    return root;
  }

  function blinkLoop() {
    setTimeout(() => { root.classList.add('blink'); setTimeout(() => root.classList.remove('blink'), 130); blinkLoop(); }, 2200 + Math.random() * 3800);
  }

  /** Embers shed by the daemon (and a burst when it changes shape). */
  let burst = 0;
  function embers(canvas) {
    const ctx = canvas.getContext('2d');
    const parts = [];
    let last = performance.now();
    const frame = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const w = canvas.width = canvas.clientWidth * devicePixelRatio;
      const h = canvas.height = canvas.clientHeight * devicePixelRatio;
      ctx.clearRect(0, 0, w, h);
      const rate = 3 + burst * 80 + Number(getComputedStyle(root).getPropertyValue('--voice') || 0) * 10;
      burst = Math.max(0, burst - dt * 1.4);
      for (let i = 0; i < rate * dt * 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = (0.2 + Math.random() * 0.06) * w * (burst > 0.05 ? 0.6 : 1);
        const sp = burst > 0.05 ? 40 + Math.random() * 120 : 6 + Math.random() * 14;
        parts.push({ x: w / 2 + Math.cos(a) * r, y: h / 2 + Math.sin(a) * r, vx: Math.cos(a) * sp * (burst > 0.05 ? 1 : 0.2), vy: -sp - Math.random() * 10, life: 1.2 + Math.random() * 1.4, age: 0, s: (0.8 + Math.random() * 1.6) * devicePixelRatio });
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age > p.life) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt * devicePixelRatio; p.y += p.vy * dt * devicePixelRatio; p.vy *= 0.99;
        const k = 1 - p.age / p.life;
        ctx.fillStyle = root.classList.contains('mood-love') ? `rgba(255,150,180,${k})` : `rgba(255,${190 + 40 * k | 0},120,${k})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * k + 0.3, 0, 7); ctx.fill();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* ---------- shapes ---------- */
  let shownSlug = null;
  function setForm(form, animate) {
    root.classList.toggle('has-form', form.slug !== 'spark');
    root.querySelector('.dm-emoji').textContent = form.slug === 'spark' ? '' : form.emoji;
    updateLabels();
    if (form.slug === shownSlug) return;
    shownSlug = form.slug;
    // Fold back into the spark...
    portrait.classList.add('gone');
    root.classList.add('is-spark');
    if (animate) burst = 1;
    if (form.slug === 'spark' || !state?.images) return;
    // ...and grow into the new animal once its picture is ready (the first time a shape is painted it takes a few seconds).
    root.classList.add('thinking');
    if (animate) setStatus(`מתגלגל ל${form.he}…`);
    const img = new Image();
    img.onload = () => {
      if (shownSlug !== form.slug) return;
      portrait.src = img.src;
      root.classList.remove('thinking');
      burst = Math.max(burst, 0.8);
      setTimeout(() => { portrait.classList.remove('gone'); root.classList.remove('is-spark'); }, animate ? 250 : 0);
      if (animate) setStatus('');
    };
    img.onerror = () => {
      root.classList.remove('thinking');
      if (animate) setStatus(`לא הצלחתי לצייר את עצמי כ${form.he}, אז בינתיים אני ניצוץ ${form.emoji}`);
    };
    img.src = `/api/daemon/form/${encodeURIComponent(form.slug)}`;
  }

  let moodTimer;
  function emote(mood) {
    root.className = root.className.replace(/\bmood-\w+/g, '').trim();
    root.classList.add('mood-' + mood);
    clearTimeout(moodTimer);
    moodTimer = setTimeout(() => root.classList.remove('mood-' + mood), 2400);
  }

  /* ---------- voice ---------- */
  function speak(text) {
    if (!prefs.speak || !('speechSynthesis' in window) || !text) return;
    const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/https?:\/\/\S+/g, '');
    const u = new SpeechSynthesisUtterance(clean);
    const hebrew = /[֐-׿]/.test(clean);
    u.lang = hebrew ? 'he-IL' : 'en-US';
    const voices = speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang.startsWith(hebrew ? 'he' : 'en') && /natural|online|google/i.test(x.name)) || voices.find((x) => x.lang.startsWith(hebrew ? 'he' : 'en'));
    if (v) u.voice = v;
    u.rate = 1.02;
    // The light pulses with its voice: a beat on every word.
    let decay;
    const beat = () => { root.style.setProperty('--voice', '1'); clearTimeout(decay); decay = setTimeout(() => root.style.setProperty('--voice', '0.35'), 120); };
    u.onboundary = beat;
    u.onstart = beat;
    u.onend = u.onerror = () => { clearTimeout(decay); root.style.setProperty('--voice', '0'); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function toggleMic() {
    if (!Recognition) return toast('הדפדפן הזה לא תומך בדיבור. נסו בכרום או באדג׳.');
    if (rec) { rec.stop(); return; }
    rec = new Recognition();
    rec.lang = 'he-IL';
    rec.interimResults = true;
    rec.onresult = (e) => { input.value = [...e.results].map((r) => r[0].transcript).join(''); };
    rec.onend = () => { micBtn.classList.remove('on'); const t = input.value.trim(); rec = null; if (t) send(t); };
    rec.onerror = () => { micBtn.classList.remove('on'); rec = null; };
    speechSynthesis?.cancel();
    micBtn.classList.add('on');
    rec.start();
  }

  /* ---------- chat ---------- */
  function buildPanel(inline) {
    nameEl = el('b');
    formEl = el('small');
    statusEl = el('div', { class: 'dm-status', 'aria-live': 'polite' });
    log = el('div', { class: 'dm-log' });
    input = el('input', { type: 'text', placeholder: 'דברו איתי… (למשל: "תהפוך לינשוף" או "מה חסר לנו לשקשוקה?")', 'aria-label': 'הודעה לדימון' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) send(input.value); });
    micBtn = el('button', { class: 'mini', title: 'דיבור', 'aria-label': 'דיבור', onclick: toggleMic }, '🎙');
    spkBtn = el('button', { class: 'mini', title: 'הקראה בקול', 'aria-label': 'הקראה בקול', onclick: () => { prefs.speak = !prefs.speak; savePrefs(); spkBtn.textContent = prefs.speak ? '🔊' : '🔇'; if (!prefs.speak) speechSynthesis?.cancel(); } }, prefs.speak ? '🔊' : '🔇');
    panel = el('section', { class: 'dm-panel' + (inline ? ' inline' : ''), hidden: !inline, 'aria-label': 'שיחה עם הדימון' },
      el('div', { class: 'dm-head' }, el('div', {}, nameEl, ' ', formEl), el('span', { class: 'spacer' }), spkBtn,
        el('button', { class: 'mini', title: 'להתחיל שיחה חדשה', 'aria-label': 'שיחה חדשה', onclick: async () => {
          if (!confirm('להתחיל שיחה חדשה? הדימון יזכור את הדברים החשובים.')) return;
          await api('/api/daemon/reset', { method: 'POST' });
          log.textContent = '';
          toast('שיחה חדשה ✨');
        } }, '↺'),
        inline ? null : el('button', { class: 'mini', 'aria-label': 'סגירה', onclick: () => togglePanel(false) }, '✕')),
      log, statusEl, el('div', { class: 'dm-input' }, input, micBtn, el('button', { class: 'btn primary', onclick: () => send(input.value) }, 'שלח')));
    return panel;
  }

  function updateLabels() {
    const d = state?.daemon;
    if (!d) return;
    if (nameEl) nameEl.textContent = d.name || 'הדימון שלך';
    if (formEl) formEl.textContent = `${d.form.emoji} ${d.form.he}`;
    const label = root?.querySelector('.dm-label');
    if (label) label.textContent = d.name ? `${d.name} · ${d.form.he}` : 'הדימון שלך';
  }

  function setStatus(t) { if (statusEl) statusEl.textContent = t || ''; }

  function addMsg(who, text, extra = {}) {
    const m = el('div', { class: 'dm-msg ' + who, dir: 'auto' }, text);
    if (extra.sources?.length) m.append(...extra.sources.map((s) => el('a', { class: 'src', href: s.url, target: '_blank', rel: 'noopener' }, '🔗 ' + (s.title || new URL(s.url).hostname))));
    if (extra.actions?.length) m.append(el('div', { class: 'acts' }, extra.actions));
    log.append(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }

  function togglePanel(open) {
    if (panel.classList.contains('inline')) { input.focus(); return; }
    const show = open ?? panel.hidden;
    panel.hidden = !show;
    root.classList.remove('unread');
    if (show) { input.focus(); log.scrollTop = log.scrollHeight; }
  }

  async function send(text, event) {
    text = (text || '').trim();
    if ((!text && !event) || busy) return;
    if (!state?.ai) { addMsg('daemon', 'עוד לא חיברו לי מוח (מפתח API של Claude). כשמנהל המשפחה יוסיף אותו – נדבר 🙂'); return; }
    busy = true;
    input.value = '';
    if (text) addMsg('me', text);
    root.classList.add('thinking');
    setStatus('חושב…');
    try {
      const r = await api('/api/daemon/chat', { body: { text, event, page: location.pathname + location.hash } });
      state.daemon = r.daemon;
      const actions = [];
      for (const ev of r.events) {
        if (ev.type === 'shapeshift') setForm(ev.form, true);
        if (ev.type === 'emote') emote(ev.mood);
        if (ev.type === 'open') actions.push(el('a', { class: 'btn ghost small', href: ev.href }, ev.label));
        if (ev.type === 'mail_plan') actions.push(el('a', { class: 'btn primary small', href: `/mail/#plan=${ev.id}` }, '📬 לבדיקה ולאישור'));
        if (ev.type === 'groceries_changed') window.dispatchEvent(new Event('helper:groceries-changed'));
        if (ev.type === 'recipes_changed') window.dispatchEvent(new Event('helper:recipes-changed'));
      }
      updateLabels();
      if (!r.events.some((e) => e.type === 'shapeshift')) root.classList.remove('thinking');
      if (r.reply) {
        addMsg('daemon', r.reply, { sources: r.sources, actions });
        speak(r.reply);
        if (panel.hidden) root.classList.add('unread');
      }
      setStatus(root.classList.contains('thinking') ? statusEl.textContent : '');
    } catch (e) {
      root.classList.remove('thinking');
      setStatus('');
      addMsg('daemon', '😕 ' + e.message);
    } finally {
      busy = false;
    }
  }

  /* ---------- mounting ---------- */
  async function mount(heroContainer) {
    const r = await H.me();
    if (!r.user) return;
    try { state = await api('/api/daemon', { noRedirect: true }); } catch (_) { return; }
    const hero = !!heroContainer;
    const body = build(hero);
    const chat = buildPanel(hero);
    if (hero) heroContainer.append(body, chat);
    else document.body.append(body, chat);
    for (const m of state.transcript) addMsg(m.who, m.text);
    setForm(state.daemon.form, false);
    updateLabels();
    if (!state.daemon.name && !state.transcript.length) {
      // First meeting: the spark wakes up beside them.
      if (!hero) togglePanel(true);
      setTimeout(() => send('', 'first meeting: the person just opened the helper and sees you for the first time'), 600);
    }
  }

  H.daemon = { mount };
})();
