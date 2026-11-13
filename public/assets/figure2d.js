/* Figure2D – the hub's simple companion figures (vision batch 5): drawn in 2D in the tent's style with the image tool,
   one picture per figure, and brought to life in code, as the campfire is. The picture is drawn with an empty face;
   the eyes, brows and mouth are vector, so they blink, look, talk and smile cleanly at any size. The head and the body are
   the same picture cut at the neck (a clip line), so the head can nod and lag behind the body's breathing.

     const f = await Figure2D.mount(element, 'fennec' | config, { size?: 160, look?: true, still?: false })   (still: an icon)
     f.talk(true | false)   the mouth moves while the companion speaks
     f.nod()  f.happy()  f.think(on)  f.sleep(on)
     f.destroy()
     Figure2D.list()  → the catalogue (id, name, kind, unlock?, season?)

   A figure's folder, /figures/2d/<id>/: figure.webp (transparent, the face empty) and its entry in Figure2D.FIGURES below:
     neck   the cut, as a fraction of the height from the top (the head is everything above it)
     pivot  where the head turns, [x, y] fractions
     eyes   [[x, y], [x, y]] the eye centres; eyeR the eye radius (fraction of the width); eyeColor; gap between brows
     mouth  [x, y] its centre; mouthW its width (fraction of the width)
     cheek  a colour for the blush, or null
   Reduced motion (the device's or the person's, H.reducedMotion): it stands still, blinks rarely and talks with its mouth only. */
(() => {
  if (window.Figure2D) return;
  const BASE = '/figures/2d/';
  const FIGURES = {
    // the generic ones: free for everyone (docs/design/figures-2d.md; drawn with the image tool, 2026-11-13)
    fennec: { name: 'פנק', kind: 'generic', neck: 0.6, pivot: [0.5, 0.58], eyes: [[0.39, 0.47], [0.61, 0.47]], eyeR: 0.055, mouth: [0.5, 0.535], mouthW: 0.1, cheek: '#e89a7a' },
    owl: { name: 'ינשוף', kind: 'generic', neck: 0.57, pivot: [0.5, 0.55], eyes: [[0.33, 0.33], [0.67, 0.33]], eyeR: 0.085, mouth: [0.5, 0.435], mouthW: 0.07, mouthFill: '#c8862a', cheek: null },
    hedgehog: { name: 'קיפוד', kind: 'generic', neck: 0.53, pivot: [0.5, 0.5], eyes: [[0.4, 0.38], [0.6, 0.38]], eyeR: 0.05, mouth: [0.5, 0.465], mouthW: 0.09, cheek: '#eaa092' },
    lamb: { name: 'טלה', kind: 'generic', neck: 0.53, pivot: [0.515, 0.5], eyes: [[0.42, 0.385], [0.61, 0.385]], eyeR: 0.05, mouth: [0.515, 0.465], mouthW: 0.09, cheek: '#eaa092' },
    // people and characters (vision batch 6; likeness notes in the historic-figures skill), kind 'person'. paid: true for a
    // paid one (tier too); hideFor: the religion settings it is hidden for (the owner's call); tags: what settings may leave
    // out (horror). sway < 1: a gentler nod where a beard, a prop or a friend crosses the neck.
    ibnsina: { name: 'אבן סינא', kind: 'person', tier: 'free', neck: 0.56, pivot: [0.5, 0.54], eyes: [[0.38, 0.305], [0.62, 0.305]], eyeR: 0.042, mouth: [0.51, 0.43], mouthW: 0.06, cheek: null, sway: 0.7 },
    rambam: { name: 'הרמב"ם', kind: 'person', tier: 'free', neck: 0.57, pivot: [0.52, 0.55], eyes: [[0.41, 0.33], [0.63, 0.33]], eyeR: 0.042, mouth: [0.52, 0.47], mouthW: 0.06, cheek: null, sway: 0.7 },
    newton: { name: 'ניוטון', kind: 'person', tier: 'free', neck: 0.53, pivot: [0.53, 0.5], eyes: [[0.42, 0.32], [0.64, 0.32]], eyeR: 0.042, mouth: [0.53, 0.46], mouthW: 0.08, cheek: '#e8a08a', sway: 0.8 },
    juha: { name: "ג'וחא", kind: 'person', tier: 'free', neck: 0.55, pivot: [0.57, 0.53], eyes: [[0.46, 0.33], [0.68, 0.33]], eyeR: 0.042, mouth: [0.58, 0.44], mouthW: 0.06, cheek: '#e8a08a', sway: 0.5 },
    hershele: { name: 'הרשל׳ה', kind: 'person', tier: 'free', neck: 0.56, pivot: [0.49, 0.54], eyes: [[0.38, 0.335], [0.6, 0.335]], eyeR: 0.042, mouth: [0.495, 0.445], mouthW: 0.06, cheek: '#e8a08a', sway: 0.6 },
    scheherazade: { name: 'שחרזאדה', kind: 'person', tier: 'free', neck: 0.43, pivot: [0.48, 0.41], eyes: [[0.385, 0.285], [0.575, 0.285]], eyeR: 0.04, mouth: [0.48, 0.37], mouthW: 0.07, cheek: '#e89a86', sway: 0.6 },
    alibaba: { name: 'עלי באבא', kind: 'person', tier: 'free', neck: 0.57, pivot: [0.52, 0.55], eyes: [[0.4, 0.38], [0.63, 0.38]], eyeR: 0.042, mouth: [0.52, 0.52], mouthW: 0.06, cheek: null, sway: 0.6 },
    peterpan: { name: 'פיטר פן', kind: 'person', tier: 'free', neck: 0.55, pivot: [0.46, 0.53], eyes: [[0.36, 0.37], [0.56, 0.37]], eyeR: 0.048, mouth: [0.46, 0.47], mouthW: 0.08, cheek: '#ea9a86' },
    maryshelley: { name: 'מרי שלי', kind: 'person', tier: 'paid', paid: true, hideFor: [], neck: 0.46, pivot: [0.5, 0.44], eyes: [[0.39, 0.3], [0.61, 0.3]], eyeR: 0.042, mouth: [0.5, 0.4], mouthW: 0.07, cheek: '#e89a86', sway: 0.7 },
    leonardo: { name: 'לאונרדו דה וינצ׳י', kind: 'person', tier: 'paid', paid: true, hideFor: [], neck: 0.5, pivot: [0.52, 0.48], eyes: [[0.41, 0.335], [0.63, 0.335]], eyeR: 0.04, mouth: [0.52, 0.465], mouthW: 0.06, cheek: null, sway: 0.35 },
    cleopatra: { name: 'קליאופטרה', kind: 'person', tier: 'paid', paid: true, hideFor: [], neck: 0.44, pivot: [0.52, 0.42], eyes: [[0.42, 0.3], [0.62, 0.3]], eyeR: 0.042, mouth: [0.52, 0.39], mouthW: 0.07, cheek: '#d98a7a', sway: 0.7 },
    dracula: { name: 'דרקולה', kind: 'person', tier: 'paid', paid: true, hideFor: [], tags: ['horror'], neck: 0.52, pivot: [0.51, 0.5], eyes: [[0.405, 0.29], [0.62, 0.29]], eyeR: 0.04, mouth: [0.51, 0.455], mouthW: 0.06, cheek: null, eyeColor: '#3a1c1c', sway: 0.35 },
  };
  const reduce = () => (window.H?.reducedMotion ? H.reducedMotion() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // the engine brings its own look: figure2d.css, once per page (a page may still link it itself)
  function ensureCss() {
    if (document.querySelector('link[href*="figure2d.css"]')) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/figure2d.css'; document.head.append(l);
  }
  async function mount(host, which, opts = {}) {
    ensureCss();
    const cfg = typeof which === 'string' ? { id: which, ...FIGURES[which] } : which;
    if (!cfg || !cfg.neck) throw new Error('Figure2D: no such figure ' + which);
    const src = cfg.src || `${BASE}${cfg.id}/figure.webp`;
    const img = new Image(); img.decoding = 'async'; img.src = src;
    await img.decode().catch(() => {});
    const ratio = (img.naturalHeight || 1) / (img.naturalWidth || 1);
    const W = 100, Hh = 100 * ratio;                       // the figure's own units: 100 wide
    const box = document.createElement('div');
    box.className = 'f2';
    box.style.setProperty('--f2-size', (opts.size || 160) + 'px');
    box.style.setProperty('--f2-ratio', ratio);
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', cfg.name || 'הדמות');
    // the two cuts of the same picture
    const body = document.createElement('div'); body.className = 'f2-body';
    const head = document.createElement('div'); head.className = 'f2-head';
    for (const [layer, clip] of [[body, `inset(${(cfg.neck * 100 - 1.5).toFixed(2)}% 0 0 0)`], [head, `inset(0 0 ${((1 - cfg.neck) * 100 - 1.5).toFixed(2)}% 0)`]]) {
      const i = img.cloneNode(); i.alt = ''; i.draggable = false; i.className = 'f2-pic'; i.style.clipPath = clip;
      layer.append(i);
    }
    head.style.transformOrigin = `${cfg.pivot[0] * 100}% ${cfg.pivot[1] * 100}%`;
    // the face: vector eyes, brows and mouth, inside the head so they move with it
    const face = svgEl('svg', { class: 'f2-face', viewBox: `0 0 ${W} ${Hh}`, 'aria-hidden': 'true' });
    const ink = cfg.eyeColor || '#2e2a1e';
    const er = (cfg.eyeR || 0.07) * W;
    const eyes = cfg.eyes.map(([x, y]) => {
      const g = svgEl('g', { class: 'f2-eye', transform: `translate(${x * W} ${y * Hh})` });
      const lid = svgEl('g', { class: 'f2-lid' });
      lid.append(svgEl('ellipse', { rx: er, ry: er * 1.12, fill: ink }));
      const look = svgEl('g', { class: 'f2-look' });
      look.append(svgEl('circle', { cx: er * 0.32, cy: -er * 0.38, r: er * 0.34, fill: '#fff' }), svgEl('circle', { cx: -er * 0.3, cy: er * 0.34, r: er * 0.13, fill: '#fff', opacity: '.8' }));
      lid.append(look);
      // the happy eye (^): shown instead of the round one when it is glad
      const glad = svgEl('path', { class: 'f2-glad', d: `M ${-er} ${er * 0.35} Q 0 ${-er * 1.1} ${er} ${er * 0.35}`, fill: 'none', stroke: ink, 'stroke-width': er * 0.42, 'stroke-linecap': 'round' });
      g.append(lid, glad);
      face.append(g);
      return { g, lid, look };
    });
    if (cfg.cheek) for (const [x, y] of cfg.eyes) face.append(svgEl('ellipse', { class: 'f2-cheek', cx: x * W + (x < 0.5 ? -er * 0.4 : er * 0.4), cy: y * Hh + er * 1.9, rx: er * 0.95, ry: er * 0.55, fill: cfg.cheek }));
    const [mx, my] = cfg.mouth, mw = (cfg.mouthW || 0.12) * W;
    const mouth = svgEl('path', { class: 'f2-mouth', fill: cfg.mouthFill || '#7a2a22', stroke: ink, 'stroke-width': er * 0.32, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    face.append(mouth);
    head.append(face);
    box.append(body, head);
    host.append(box);

    /* ---------- the mouth: a smile that opens (o: 0 closed … 1 open) ---------- */
    let o = 0, smile = 1;
    const drawMouth = () => {
      const x0 = mx * W - mw / 2, x1 = mx * W + mw / 2, y = my * Hh;
      const curve = mw * 0.28 * smile, open = mw * 0.55 * o;
      mouth.setAttribute('d', o < 0.04
        ? `M ${x0} ${y} Q ${mx * W} ${y + curve} ${x1} ${y}`
        : `M ${x0} ${y} Q ${mx * W} ${y + curve * 0.4} ${x1} ${y} Q ${mx * W} ${y + curve + open * 1.6} ${x0} ${y} Z`);
      mouth.setAttribute('fill', o < 0.04 ? 'none' : (cfg.mouthFill || '#7a2a22'));
    };
    drawMouth();

    /* ---------- the life: one loop for breathing, the head's spring, the eyes and the mouth ---------- */
    let raf = 0, last = 0, t0 = performance.now(), talking = false, mood = 'idle', nodUntil = 0, hop = 0;
    let headA = 0, headV = 0, lookX = 0, lookY = 0, lx = 0, ly = 0, nextBlink = t0 + rnd(1800, 4200), blinkT = -1, talkPhase = 0;
    const still = () => reduce();
    function frame(now) {
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      const t = (now - t0) / 1000;
      // breathing: the body rises a little; the head follows on a spring (it lags and overshoots)
      const breath = still() ? 0 : Math.sin(t * 2 * Math.PI / 3.6);
      const lift = hop > 0 ? Math.sin(Math.min(1, hop) * Math.PI) * 10 : 0;
      if (hop > 0) hop = Math.max(0, hop - dt * 2.2);
      body.style.transform = `translateY(${-lift}%) scale(${1 + breath * 0.012}, ${1 - breath * 0.012 + (hop > 0.85 ? -0.06 : 0)})`;
      let target = still() ? 0 : breath * 1.6 + (now < nodUntil ? Math.sin((nodUntil - now) / 1000 * 2 * Math.PI * 2.2) * 9 : 0) + (mood === 'think' ? 7 : 0) + (mood === 'sleep' ? 12 : 0);
      target *= (cfg.sway ?? 1);   // a long beard, a prop or a friend across the neck: a gentler nod, so the cut never shows
      headV += ((target - headA) * 90 - headV * 11) * dt; headA += headV * dt;
      head.style.transform = `translateY(${(-lift - breath * 0.6).toFixed(2)}%) rotate(${headA.toFixed(2)}deg)`;
      // the eyes: blink now and then; look toward the pointer (or wander a little)
      if (now >= nextBlink && blinkT < 0 && mood !== 'sleep') blinkT = 0;
      let lidS = mood === 'sleep' ? 0.08 : 1;
      if (blinkT >= 0) { blinkT += dt; const k = blinkT / 0.16; lidS = k < 1 ? 1 - Math.sin(k * Math.PI) * 0.92 : 1; if (k >= 1) { blinkT = -1; nextBlink = now + (still() ? rnd(5000, 9000) : rnd(1800, 5200)) * (Math.random() < 0.15 ? 0.2 : 1); } }
      lx += (lookX - lx) * Math.min(1, dt * 6); ly += (lookY - ly) * Math.min(1, dt * 6);
      for (const e of eyes) { e.lid.setAttribute('transform', `scale(1 ${lidS.toFixed(3)})`); e.look.setAttribute('transform', `translate(${(lx * er * 0.32).toFixed(2)} ${(ly * er * 0.28).toFixed(2)})`); }
      // the mouth: while talking, it opens and closes in syllables
      if (talking) { talkPhase += dt * rnd(7, 11); o = Math.max(0, Math.sin(talkPhase)) * rnd(0.55, 1); }
      else o += (0 - o) * Math.min(1, dt * 12);
      drawMouth();
      raf = requestAnimationFrame(frame);
    }
    const run = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    // as an icon (opts.still): drawn once, no life of its own
    if (opts.still) {
      box.classList.add('still');
      const noop = () => {};
      return { el: box, talk: noop, nod: noop, happy: noop, think: noop, sleep: noop, destroy() { box.remove(); } };
    }
    // pause when off screen or in a hidden tab
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? run() : stop()));
    io.observe(box);
    const vis = () => (document.hidden ? stop() : run());
    document.addEventListener('visibilitychange', vis);
    // the pointer: the eyes follow it
    const onMove = (e) => {
      if (opts.look === false) return;
      const r = box.getBoundingClientRect();
      lookX = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 2)));
      lookY = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.35)) / (r.height * 2)));
    };
    addEventListener('pointermove', onMove, { passive: true });
    // a touch: it squashes, hops and is glad
    const happy = (ms = 1100) => {
      box.classList.add('glad'); smile = 1.5; if (!still()) hop = 1;
      clearTimeout(happy.t); happy.t = setTimeout(() => { box.classList.remove('glad'); smile = 1; }, ms);
    };
    box.addEventListener('pointerdown', () => { happy(); navigator.vibrate?.(8); });

    return {
      el: box,
      talk(on) { talking = !!on; if (on) talkPhase = 0; },
      nod() { if (!still()) nodUntil = performance.now() + 900; },
      happy,
      think(on) { mood = on ? 'think' : 'idle'; box.classList.toggle('thinking', !!on); },
      sleep(on) { mood = on ? 'sleep' : 'idle'; box.classList.toggle('sleeping', !!on); },
      destroy() { stop(); io.disconnect(); document.removeEventListener('visibilitychange', vis); removeEventListener('pointermove', onMove); box.remove(); },
    };
  }
  const list = () => Object.entries(FIGURES).map(([id, f]) => ({ id, name: f.name, kind: f.kind, tier: f.tier || 'free', paid: !!f.paid, hideFor: f.hideFor || [], tags: f.tags || [], unlock: f.unlock || null, season: f.season || null }));
  // the default companion for every family but the owner's (who has Ibn Ezra): the owner's choice, 2026-11-13
  const DEFAULT = 'fennec';
  window.Figure2D = { mount, list, FIGURES, DEFAULT };
})();
