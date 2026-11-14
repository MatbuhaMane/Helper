/* מדיטציה ונשימה (docs/vision/future-specs.md; H.FUTURE 'breath'): choose 2, 5 or 10 minutes and a way of breathing, then
   breathe with a circle that grows on the in-breath and shrinks on the out-breath, and an end screen. No server and no AI;
   the length and the way are the person's (H.prefs 'breath'). Open with vision (ש4–ש6): recorded meditations, a voice or
   background sound later. Now (the owner): a guiding voice that can be switched off, and a session ticks the habit (the goals).
   Motion: the circle moves by transform and opacity only; with prefers-reduced-motion it stays still and only the words change.
   The look (the night scene) is design's: shared classes and tokens only; the few sizes inline here wait for breath.css. */
(async () => {
  const { el } = H;
  const B = window.Breath;
  await H.requireLogin();
  H.header('נשימה');
  const root = document.querySelector('main');
  const P = H.prefs('breath', { mins: 5, kind: 'calm', voice: true });
  const V = window.Voice;
  const MINS = [2, 5, 10];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let run = null; // the practice under way: { p, total, start, paused (ms when paused, or 0), off (ms paused so far), … }
  let lock = null;

  async function wake(on) {
    try {
      if (on && !lock && 'wakeLock' in navigator) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      if (!on && lock) { await lock.release(); lock = null; }
    } catch { lock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && run && !run.paused) wake(true); });

  const pattern = () => B.PATTERNS.find((p) => p.id === P.kind) || B.PATTERNS[0];
  const minsText = (m) => (m === 1 ? 'דקה' : m === 2 ? 'שתי דקות' : `${m} דקות`);

  /** the first screen: how long, and which way */
  function choose() {
    stop();
    const group = (label, items, isOn, pick) => el('div', { role: 'group', 'aria-label': label, style: 'display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 16px' },
      items.map((it) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(isOn(it)), onclick: () => { pick(it); H.savePrefs('breath'); choose(); } }, it.name || minsText(it))));
    const p = pattern();
    root.replaceChildren(
      el('section', { class: 'card', style: 'padding:16px;margin:12px 0' },
        el('h2', { style: 'margin:0 0 4px' }, 'כמה זמן?'),
        group('אורך התרגול', MINS, (m) => m === P.mins, (m) => { P.mins = m; }),
        el('h2', { style: 'margin:0 0 4px' }, 'איך נושמים?'),
        group('סוג הנשימה', B.PATTERNS, (x) => x.id === p.id, (x) => { P.kind = x.id; }),
        el('p', { class: 'muted', style: 'margin:0 0 12px' }, p.line),
        el('label', { class: 'toggle', style: 'margin:0 0 16px' },
          el('input', { type: 'checkbox', checked: P.voice !== false, onchange: (e) => { P.voice = e.target.checked; H.savePrefs('breath'); } }),
          'קול מנחה ("שאיפה", "נשיפה")'),
        el('button', { type: 'button', class: 'btn primary', onclick: begin }, `להתחיל · ${minsText(P.mins)}`)),
      el('p', { class: 'muted' }, 'שבו בנוח. נושמים פנימה כשהעיגול גדל, החוצה כשהוא קטן.'));
  }

  /** the practice */
  function begin() {
    const p = pattern();
    const total = B.rounds(p, P.mins) * B.length(p);
    const ring = el('div', { 'aria-hidden': 'true', style: 'inline-size:min(60vw,240px);block-size:min(60vw,240px);border-radius:50%;background:var(--olive, currentColor);opacity:.35;transform:scale(.55);will-change:transform,opacity' });
    const word = el('div', { 'aria-live': 'polite', style: 'font-size:1.8rem;font-weight:600;min-block-size:2.4rem' }, '');
    const count = el('div', { class: 'muted', style: 'font-size:1.2rem' }, '');
    const leftLine = el('div', { class: 'muted' }, '');
    const pauseBtn = el('button', { type: 'button', class: 'btn', onclick: () => pause() }, 'השהיה');
    root.replaceChildren(el('section', { class: 'card', style: 'padding:24px 16px;margin:12px 0;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center' },
      el('div', { class: 'muted' }, p.name),
      el('div', { style: 'display:grid;place-items:center;min-block-size:min(60vw,240px)' }, ring),
      word, count, leftLine,
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center' }, pauseBtn,
        el('button', { type: 'button', class: 'btn ghost', onclick: () => done(true) }, 'לסיים'))));
    run = { p, total, start: Date.now(), paused: 0, off: 0, last: -1, ring, word, count, leftLine, pauseBtn };
    run.tick = setInterval(tick, 200);
    tick();
    wake(true);
  }

  const elapsed = () => ((run.paused || Date.now()) - run.start - run.off) / 1000;

  function tick() {
    if (!run || run.paused) return;
    const sec = elapsed();
    if (sec >= run.total) return done(false);
    const a = B.at(run.p, sec);
    const key = a.round * 100 + a.i;
    if (key !== run.last) { run.last = key; move(a); }
    run.count.textContent = String(Math.ceil(a.left));
    const rest = Math.ceil(run.total - sec);
    run.leftLine.textContent = `נשארו ${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`;
  }

  /** a new phase: the word, and the circle grows (in), stays (hold, rest) or shrinks (out) over the phase */
  function move(a) {
    run.word.textContent = a.word;
    if (P.voice !== false) V.say(a.word, { keep: true });   // the same few words again and again: fetched once
    if (still) return;
    const big = a.phase === 'in' || a.phase === 'hold';
    void run.ring.offsetWidth; // a fresh circle has no style yet, and would jump instead of growing
    run.ring.style.transition = `transform ${a.left}s ease-in-out, opacity ${a.left}s ease-in-out`;
    run.ring.style.transform = `scale(${big ? 1 : 0.55})`;
    run.ring.style.opacity = big ? '.7' : '.35';
  }

  function pause() {
    if (!run) return;
    if (run.paused) {
      run.off += Date.now() - run.paused; run.paused = 0; run.last = -1; run.pauseBtn.textContent = 'השהיה'; wake(true); tick();
    } else {
      V.stop();
      run.paused = Date.now(); run.pauseBtn.textContent = 'להמשיך'; run.word.textContent = 'בהשהיה';
      const now = getComputedStyle(run.ring).transform; run.ring.style.transition = 'none'; run.ring.style.transform = now;
      wake(false);
    }
  }

  function stop() { if (run) { clearInterval(run.tick); run = null; } wake(false); V.stop(); }

  /** a session ticks the habit: the matching step in the person's goals (Breath.habit), or a way to add one */
  async function tickHabit(box) {
    try {
      const h = B.habit((await H.api('/api/goals')).goals);
      if (!h) {
        box.replaceChildren(el('a', { href: '/tools/tasks/' }, 'להוסיף נשימה כהרגל קבוע'), ' במטרות, וכל תרגול יסומן שם.');
        return;
      }
      await H.api(`/api/goals/steps/${h.step}`, { method: 'PUT', body: { done: true } });
      box.replaceChildren('✓ סומן בהרגל: ', el('b', {}, h.title), h.text && h.text !== h.title ? ` (${h.text})` : '', ' ',
        el('button', { type: 'button', class: 'btn ghost small', onclick: async () => {
          try { await H.api(`/api/goals/steps/${h.step}`, { method: 'PUT', body: { done: false } }); box.textContent = 'הסימון בוטל.'; } catch { H.toast('לא הצלחנו לבטל. נסו מהמטרות.'); }
        } }, 'לבטל'));
    } catch { box.textContent = ''; }
  }

  /** the end screen */
  function done(early) {
    const sec = run ? Math.min(elapsed(), run.total) : 0;   // (a phone asleep in the middle: never more than the session)
    stop();
    const m = Math.max(1, Math.round(sec / 60));
    // a session counts for the habit when it ran to the end, or for at least a minute
    const habitBox = el('p', { 'aria-live': 'polite', style: 'margin:0 0 16px' });
    if (!early || sec >= 60) tickHabit(habitBox);
    root.replaceChildren(el('section', { class: 'card', style: 'padding:24px 16px;margin:12px 0;text-align:center' },
      el('h2', { style: 'margin:0 0 8px' }, early && sec < 60 ? 'עצרתם באמצע' : `סיימתם ${minsText(m)}`),
      el('p', { class: 'muted', style: 'margin:0 0 16px' }, early ? 'גם כמה נשימות עושות טוב.' : 'קחו עוד רגע בשקט לפני שחוזרים.'),
      habitBox,
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center' },
        el('button', { type: 'button', class: 'btn primary', onclick: begin }, 'עוד פעם'),
        el('button', { type: 'button', class: 'btn ghost', onclick: choose }, 'לבחור אחרת'))));
  }

  document.addEventListener('keydown', (e) => { if (run && e.key === ' ' && e.target === document.body) { e.preventDefault(); pause(); } });
  choose();
})();
