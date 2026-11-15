/* The celebration at the back door's entrance (owner, 2026-11-15): fireworks from both sides, confetti from the top and a
   soft sound – thick outlined lines, a bit Adventure Time. The first time ever (prefs 'door' { egg: true }, per user on the
   server) a surprise egg too, cracking like the eggs of the back door's menu. Motion is transform and opacity only.
   Reduced motion: no fireworks or confetti, only a short calm sign (and the sound, if sounds are on).
     DoorParty.play().then(go)   resolves when it is over (the caller goes on to /admin/) */
(() => {
  const H = window.H;
  const reduce = () => (H?.reducedMotion ? H.reducedMotion() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  const soundOn = () => !(H?.soundsOn && !H.soundsOn());
  const COL = ['#f2c14e', '#e0702a', '#8fc7d4', '#e8668a', '#8fcf7a'];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function css() {
    if (document.querySelector('link[href*="/assets/door-party.css"]')) return Promise.resolve();
    return new Promise((res) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/door-party.css'; l.onload = l.onerror = () => res(); document.head.append(l); });
  }

  /* the sound: two soft pops and a rising little tune, all made here (no file) */
  function sound() {
    if (!soundOn()) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ac = new C(); if (ac.state === 'suspended') ac.resume();
      const out = ac.createGain(); out.gain.value = 0.16; out.connect(ac.destination);
      const tone = (f, t, d, type = 'triangle', v = 1) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(v, ac.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + d);
        o.connect(g).connect(out); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + d + 0.05);
      };
      const pop = (t) => {                       // a soft pop: a short filtered noise
        const n = ac.sampleRate * 0.12, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
        const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        s.buffer = b; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0.9;
        s.connect(f).connect(g).connect(out); s.start(ac.currentTime + t);
      };
      pop(0.05); pop(0.45); pop(0.95);
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.3 + i * 0.16, 0.4));
      tone(1318.5, 1.1, 0.7, 'sine', 0.7);
      setTimeout(() => ac.close?.(), 3000);
    } catch (_) { /* no sound */ }
  }

  function firework(L, side, delay) {
    const x0 = side === 'l' ? 8 : 92, x1 = side === 'l' ? rnd(20, 38) : rnd(62, 80), y1 = rnd(18, 42);   // percent of the screen
    const r = document.createElement('i'); r.className = 'dp-rocket';
    r.style.cssText = `--x0:${x0}vw;--x1:${x1}vw;--y1:${y1}vh;animation-delay:${delay}ms`;
    L.append(r);
    setTimeout(() => {
      r.remove();
      const c = COL[Math.floor(Math.random() * COL.length)], n = 14, R = rnd(70, 110);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, s = document.createElement('i');
        s.className = 'dp-spark';
        s.style.cssText = `left:${x1}vw;top:${y1}vh;--a:${a}rad;--d:${R}px;--c:${c}`;
        L.append(s); setTimeout(() => s.remove(), 1100);
      }
      const ring = document.createElement('i'); ring.className = 'dp-ring'; ring.style.cssText = `left:${x1}vw;top:${y1}vh;--c:${c}`;
      L.append(ring); setTimeout(() => ring.remove(), 900);
    }, delay + 650);
  }

  function confetti(L) {
    for (let i = 0; i < 44; i++) {
      const p = document.createElement('i');
      p.className = 'dp-conf' + (i % 3 === 0 ? ' dot' : '');
      p.style.cssText = `left:${rnd(2, 98)}vw;--c:${COL[i % COL.length]};--sway:${rnd(-40, 40)}px;--rot:${rnd(-540, 540)}deg;animation-duration:${rnd(1.9, 3)}s;animation-delay:${rnd(0, 900)}ms`;
      L.append(p);
    }
  }

  async function egg(L) {
    const b = H.el('button', { type: 'button', class: 'egg float dp-egg', 'aria-label': 'ביצת הפתעה' });
    L.append(b); L.style.pointerEvents = 'none'; b.style.pointerEvents = 'auto';
    await new Promise((res) => {
      const t = setTimeout(res, 9000);                       // not tapped: it goes on anyway
      b.addEventListener('click', () => {
        clearTimeout(t); b.classList.add('found');
        const note = H.el('div', { class: 'egg-note', role: 'status' }, 'מצאתם את הדלת האחורית! זה נשאר בינינו.');
        document.body.append(note);
        setTimeout(() => { b.remove(); note.remove(); res(); }, 2600);
      }, { once: true });
    });
  }

  async function play() {
    await css();
    const L = document.createElement('div'); L.className = 'dp-layer'; L.setAttribute('aria-hidden', 'true'); document.body.append(L);
    sound();
    navigator.vibrate?.([30, 60, 30]);
    // the first time ever: a surprise egg (kept per user on the server, so it is once across devices)
    let first = false;
    try { const d = H.prefs('door', {}); if (!d.egg) { first = true; d.egg = true; H.savePrefs('door'); } } catch (_) { /* no prefs: no egg */ }
    if (reduce()) {
      const sign = document.createElement('div'); sign.className = 'dp-calm'; L.append(sign);
      await wait(1800);
    } else {
      for (let i = 0; i < 3; i++) { firework(L, 'l', i * 520); firework(L, 'r', i * 520 + 260); }
      confetti(L);
      await wait(3200);
    }
    if (first) await egg(L);
    L.remove();
  }

  window.DoorParty = { play };
})();
