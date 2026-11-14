/* רַאבַּ"ע introduces himself (the owner's request, 2026-11-14). Design's look: raba-intro.css, docs/design/raba-intro.md.
   Shown once per person (prefs 'raba', .seen: it follows them from device to device), the first time they pick him.
   Each card is spoken in his voice (the same /api/voice/say as the companion) while the words light up as the subtitle;
   mute, "דלג", Esc and a swipe all work, and with no voice, or reduced motion, the words just show.
   window.RabaIntro.maybe() opens it if not yet seen; .open() always (the settings' "להכיר אותו שוב"). */
(() => {
  'use strict';
  const { el } = H;
  const NAME = 'רַאבַּ"ע';
  /* The cards: his own voice, short and flowing. (Wording approved by the owner before it ships.) */
  const CARDS = [
    { title: 'שלום, אני ' + NAME,
      say: 'שלום לך, ידיד. אני רַאבַּ"ע, אבן עזרא: משורר, מדקדק ומפרש המקרא. היום אני חי בתור הזהב הנצחי, ומשם באתי להתלוות אליך.' },
    { title: 'רק אצלכם',
      say: 'מכל המשפחות שבעולם, רק למשפחה שלכם יש עוזר כמוני. זה כבוד גדול לי, ואשמור עליו.' },
    { title: 'מה אני יודע לעשות',
      say: 'כעוזר אישי אני כאן בשבילך: אזכיר, אארגן, אענה על שאלות, ואעזור לך לכתוב, לתכנן ולמצוא.',
      can: ['<b>תזכורות</b> בזמן הנכון', '<b>שאלות</b> ותשובות', '<b>כתיבה</b> ותכנון', '<b>חיפוש</b> בכל מה שבאוהל'] },
    { title: 'והאוהל כולו',
      say: 'האוהל פתוח לפניך: קניות ומתכונים, חדשות ושירים, יומן ועץ המשפחה, והודעות. ואני יודע להפעיל אותם בשבילך.',
      can: ['<b>קניות</b> ומתכונים', '<b>יומן</b> ועץ המשפחה', '<b>הודעות</b> וחדשות', '<b>שירון</b> וחוגגים יחד'] },
    { title: 'מה שאני אוהב',
      say: 'ומה שאני אוהב מכול: ללמוד תורה יחד, ולחקור את המקרא. שאל אותי על פסוק, על מילה או על דקדוק, ונעיין בו יחד. והמשכיל יבין.' },
  ];

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
  const seenPrefs = () => H.prefs('raba', { seen: false });
  const quietVoice = () => {
    const d = H.prefs('daemon', H.DAEMON_DEFAULTS || {});
    return H.switches?.kodesh === true || (d.voice || (d.speak === false ? 'silent' : 'always')) === 'silent';
  };

  let root = null;

  function ensureCss() {
    if (document.querySelector('link[href="/assets/raba-intro.css"]')) return;
    document.head.append(el('link', { rel: 'stylesheet', href: '/assets/raba-intro.css' }));
  }

  function open() {
    if (root) return;
    ensureCss();
    const back = document.activeElement;
    let i = 0, muted = quietVoice(), seq = 0, audio = null, raf = 0;
    const clips = new Map();   // card index → promise of the audio blob url (the next one is fetched ahead)

    const words = CARDS.map((c) => c.say.split(' ').map((w) => el('span', {}, w)));
    const sayEls = words.map((ws) => { const p = el('p', { class: 'rb-say' }); ws.forEach((w, k) => { if (k) p.append(' '); p.append(w); }); return p; });
    const cards = CARDS.map((c, k) => {
      const sec = el('section', { class: 'rb-card' }, el('h2', {}, c.title), sayEls[k]);
      if (c.can) { const ul = el('ul', { class: 'rb-can' }); c.can.forEach((h) => { const li = el('li'); li.innerHTML = h; ul.append(li); }); sec.append(ul); }   // (our own fixed strings)
      return sec;
    });
    const fig = el('div', { class: 'rb-fig' }, el('img', { src: '/assets/ibn-ezra-face.webp', alt: '', width: 148, height: 148 }));
    const muteBtn = el('button', { class: 'rb-mute', type: 'button', 'aria-pressed': String(muted), 'aria-label': 'השתקה', onclick: () => { muted = !muted; muteBtn.setAttribute('aria-pressed', String(muted)); show(i); } });
    const dots = CARDS.map((_, k) => el('button', { type: 'button', 'aria-label': 'כרטיס ' + (k + 1), onclick: () => show(k) }));
    const backBtn = el('button', { class: 'rb-back', type: 'button', 'aria-label': 'הקודם', hidden: true, onclick: () => show(i - 1) });
    const nextBtn = el('button', { class: 'rb-next', type: 'button', onclick: () => (i === CARDS.length - 1 ? close() : show(i + 1)) }, 'הבא');
    root = el('div', { class: 'rb-intro', role: 'dialog', 'aria-modal': 'true', 'aria-label': NAME + ' מציג את עצמו' },
      el('div', { class: 'rb-box' },
        el('div', { class: 'rb-top' }, muteBtn, el('button', { class: 'rb-skip', type: 'button', onclick: () => close() }, 'דלג')),
        el('div', {}, fig, el('p', { class: 'rb-name' }, NAME, el('small', {}, 'מתור הזהב הנצחי'))),
        el('div', { class: 'rb-cards' }, ...cards),
        el('div', { class: 'rb-dots' }, ...dots),
        el('div', { class: 'rb-acts' }, backBtn, nextBtn)));
    document.body.append(root);

    const clip = (k) => {
      if (!clips.has(k)) {
        const d = H.prefs('daemon', H.DAEMON_DEFAULTS || {});
        clips.set(k, fetch('/api/voice/say', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: CARDS[k].say, voice: d.voices?.ibn_ezra || undefined, figure: 'ibn_ezra' }) })
          .then((r) => { if (!r.ok) throw new Error('voice ' + r.status); return r.blob(); }).then((b) => URL.createObjectURL(b)).catch(() => null));
      }
      return clips.get(k);
    };
    const hush = () => {
      seq++; cancelAnimationFrame(raf); fig.classList.remove('speaking');
      if (audio) { audio.pause(); audio = null; }
      try { speechSynthesis.cancel(); } catch (_) { /* no browser voice */ }
    };
    const lightAll = (k) => { sayEls[k].classList.add('done'); words[k].forEach((w) => w.classList.add('said')); };

    function show(k) {
      k = Math.max(0, Math.min(CARDS.length - 1, k));
      hush();
      i = k;
      cards.forEach((c, n) => {
        c.classList.toggle('on', n === k); c.classList.toggle('past', n < k);
        c.toggleAttribute('inert', n !== k); c.setAttribute('aria-hidden', String(n !== k));
      });
      dots.forEach((d, n) => (n === k ? d.setAttribute('aria-current', 'step') : d.removeAttribute('aria-current')));
      backBtn.hidden = k === 0;
      nextBtn.textContent = k === CARDS.length - 1 ? 'בואו נתחיל' : 'הבא';
      nextBtn.classList.toggle('last', k === CARDS.length - 1);
      sayEls.forEach((p, n) => { p.classList.remove('done'); words[n].forEach((w) => w.classList.remove('said')); });
      if (muted) { lightAll(k); return; }
      if (k + 1 < CARDS.length) clip(k + 1);
      const mine = seq;
      clip(k).then((url) => {
        if (mine !== seq) return;
        if (!url) return browserSay(k, mine);
        const a = new Audio(url); audio = a;
        a.playbackRate = Math.max(0.8, Math.min(1.8, Number(H.prefs('daemon', H.DAEMON_DEFAULTS || {}).rate) || 1.2)); a.preservesPitch = true;
        const tick = () => {
          if (mine !== seq) return;
          if (a.duration) { const n = Math.ceil((a.currentTime / a.duration) * words[k].length); words[k].forEach((w, m) => w.classList.toggle('said', m < n)); }
          raf = requestAnimationFrame(tick);
        };
        a.onended = () => { if (mine !== seq) return; fig.classList.remove('speaking'); cancelAnimationFrame(raf); lightAll(k); };
        a.play().then(() => { if (mine === seq) { fig.classList.add('speaking'); tick(); } }).catch(() => { if (mine === seq) lightAll(k); });   // (blocked autoplay: the words are there)
      });
    }
    function browserSay(k, mine) {
      if (!('speechSynthesis' in window)) { lightAll(k); return; }
      const clean = CARDS[k].say.replace(/ר[֑-ׇ]*א[֑-ׇ]*ב[֑-ׇ]*["״׳']{1,2}[֑-ׇ]*ע[֑-ׇ]*/g, 'רַאבַּע');
      const u = new SpeechSynthesisUtterance(clean); u.lang = 'he-IL';
      let n = 0;
      u.onstart = () => { if (mine === seq) fig.classList.add('speaking'); };
      u.onboundary = () => { if (mine === seq) words[k][n++]?.classList.add('said'); };
      u.onend = () => { if (mine === seq) { fig.classList.remove('speaking'); lightAll(k); } };
      speechSynthesis.speak(u);
    }

    // a swipe (Pointer Events, the axis locks after 8 px): the next card comes from the left in RTL, so a swipe right goes on
    let sx = 0, sy = 0, lock = '';
    const box = root.querySelector('.rb-cards');
    box.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; lock = ''; }, { passive: true });
    box.addEventListener('pointermove', (e) => { if (!lock && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) lock = Math.abs(e.clientX - sx) > Math.abs(e.clientY - sy) ? 'x' : 'y'; }, { passive: true });
    box.addEventListener('pointerup', (e) => {
      const dx = e.clientX - sx; if (lock !== 'x' || Math.abs(dx) < 48) return;
      if (dx > 0) { if (i < CARDS.length - 1) show(i + 1); } else show(i - 1);
    }, { passive: true });

    function close() {
      hush();
      const p = seenPrefs(); if (!p.seen) { p.seen = true; H.savePrefs('raba'); }
      const r = root; root = null;
      document.removeEventListener('keydown', onKey, true);
      clips.forEach((pr) => pr.then((u) => u && URL.revokeObjectURL(u)));
      const gone = () => { r.remove(); try { back?.focus?.(); } catch (_) { /* gone */ } };
      if (reduced()) return gone();
      r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out' }).finished.then(gone, gone);
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowLeft') show(i + 1);    // RTL: left goes on
      else if (e.key === 'ArrowRight') show(i - 1);
    };
    document.addEventListener('keydown', onKey, true);
    show(0);
    nextBtn.focus();
  }

  window.RabaIntro = { open, maybe: () => { if (!seenPrefs().seen) open(); } };
})();
