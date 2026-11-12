/* The campfire in the middle of the home page's ring: still drawings in the tent's style (the stones and logs; a few flame
   tongues), with all of the motion in code, on every frame the screen draws (docs/design/campfire.md).
     Campfire.mount(box, { base, flames: [{ src, x, h, z }], anchor })   → { stop() }
   base    the stones, logs and embers (one picture);
   flames  each tongue: its picture, where it stands (x: −50…50, % of the base's width from the centre), how tall (h: % of
           the base's width), and its depth (z: 0 at the back … 1 in front: the front ones are calmer);
   anchor  where the flames stand, in % of the base's height from its top (the embers between the logs).
   A copy of the base's front half lies over the flames, so their feet hide behind the near logs and stones.

   The motion. A tongue is not turned as one stiff piece: it is drawn on a canvas in thin horizontal strips, each moved
   sideways by a bend that grows toward the tip – the foot stays on the embers, the body sways, the tip swings most:
   - a slow sway of the whole tongue, and a wave that runs up it from the foot to the tip;
   - now and then (every 1.5–4 s, each tongue on its own) the tip flicks: a quick snap to one side that springs back
     with a wobble, while the tongue stretches up for a moment – the playful flick;
   - a small stretch and flicker of the whole tongue, a soft flowing distortion where the device keeps up, and the warm
     glow breathing with the fire.
   It stops when the page is hidden or the fire is off screen; with reduced motion the tongues stand still. */
(() => {
  const reduce = () => (window.H?.reducedMotion ? H.reducedMotion() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  /** smooth noise: a few sines of unrelated speeds, so no loop shows */
  const noise = (t, s) => (Math.sin(t * 1.13 + s) * 0.5 + Math.sin(t * 2.71 + s * 1.7) * 0.3 + Math.sin(t * 5.37 + s * 2.3) * 0.2);
  const STRIPS = 56, PAD = 0.32;   // strips per tongue; room on each side for the bend (a share of the tongue's width)
  let uid = 0;

  function mount(box, cfg) {
    const anchor = cfg.anchor ?? 58;
    const id = 'cf-flow-' + (++uid);
    box.classList.add('cf');
    box.style.setProperty('--cf-anchor', anchor + '%');
    box.insertAdjacentHTML('beforeend', `<svg class="cf-defs" aria-hidden="true" focusable="false"><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.045" numOctaves="2" seed="3" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
    const turb = box.querySelector('feTurbulence');
    const glow = document.createElement('span'); glow.className = 'cf-glow';
    const base = new Image(); base.className = 'cf-base'; base.src = cfg.base; base.alt = ''; base.decoding = 'async';
    base.addEventListener('load', () => { if (base.naturalWidth) box.style.aspectRatio = `${base.naturalWidth} / ${base.naturalHeight}`; });
    const flames = document.createElement('div'); flames.className = 'cf-flames';
    const front = new Image(); front.className = 'cf-front'; front.src = cfg.base; front.alt = ''; front.decoding = 'async';
    const still = reduce();
    const tongues = cfg.flames.map((f, i) => {
      const z = f.z ?? 0.5;
      const cv = document.createElement('canvas'); cv.className = 'cf-tongue';
      cv.style.setProperty('--x', f.x + '%'); cv.style.setProperty('--h', String(f.h)); cv.style.zIndex = String(Math.round(z * 10));
      flames.append(cv);
      const img = new Image(); img.decoding = 'async'; img.src = f.src;
      const g = { cv, ctx: cv.getContext('2d'), img, z, ready: false, seed: i * 2.39 + 0.7, speed: 1.5 + (1 - z) * 0.8 + (i % 3) * 0.17,
        live: 0.55 + (1 - z) * 0.55, flickAt: -9, flickDir: 1, flickAmp: 0, next: 0.8 + Math.random() * 2.2 };
      img.addEventListener('load', () => { g.ready = true; cv.style.aspectRatio = `${img.naturalWidth * (1 + 2 * PAD)} / ${img.naturalHeight}`; size(g); draw(g, 0); });
      return g;
    });
    const sparks = document.createElement('div'); sparks.className = 'cf-sparks';
    for (let i = 0; i < 4; i++) { const s = document.createElement('i'); s.style.setProperty('--sx', (i * 23 - 34) + '%'); s.style.setProperty('--sd', (i * 1.3).toFixed(1) + 's'); sparks.append(s); }
    box.append(glow, base, flames, front, sparks);

    /** the canvas at the screen's own resolution */
    function size(g) {
      const r = g.cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (g.cv.width !== w || g.cv.height !== h) { g.cv.width = w; g.cv.height = h; }
    }
    /** one frame of a tongue: strips moved by the bend (sway + rising wave + the tip's flick) */
    function draw(g, t) {
      if (!g.ready) return;
      const { ctx, cv, img } = g, W = cv.width, H = cv.height, iw = img.naturalWidth, ih = img.naturalHeight;
      const fw = W / (1 + 2 * PAD), pad = fw * PAD, k = H / ih;   // the tongue's own width on the canvas, and the scale
      ctx.clearRect(0, 0, W, H);
      const sway = still ? 0 : noise(t * g.speed * 0.55, g.seed) * 0.07 * g.live;
      const dt = t - g.flickAt, flick = still || dt > 2 ? 0 : g.flickDir * g.flickAmp * Math.exp(-dt * 4.2) * Math.sin(dt * 16);
      const sh = ih / STRIPS;
      for (let s = 0; s < STRIPS; s++) {
        const sy = s * sh, y = 1 - (sy + sh / 2) / ih;          // 0 at the foot … 1 at the tip
        const wave = still ? 0 : Math.sin(t * 4.4 * (0.8 + g.speed * 0.15) - y * 3.4 + g.seed) * 0.045 * g.live;
        const bend = sway * y * y + wave * y * y + flick * y * y * y;   // the higher, the freer
        ctx.drawImage(img, 0, sy, iw, sh + 1.2, pad + bend * fw, sy * k, fw, (sh + 1.2) * k);
      }
    }

    if (still) { box.classList.add('still'); return { stop() {} }; }

    let raf = 0, on = true, seen = true, flow = true, frames = 0, slow = 0, last = 0;
    flames.style.filter = `url(#${id})`;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const t = now / 1000;
      // a device that cannot keep up loses the distortion, and keeps the rest
      if (last && flow) { frames++; if (now - last > 26) slow++; if (frames === 90 && slow > 30) { flow = false; flames.style.filter = 'none'; } }
      last = now;
      let heat = 0;
      for (const g of tongues) {
        // the flick: now and then, the tip snaps to one side and springs back
        if (t >= g.next) {
          g.flickAt = t; g.flickDir = Math.random() < 0.5 ? -1 : 1; g.flickAmp = (0.14 + Math.random() * 0.14) * g.live;
          g.next = t + 1.5 + Math.random() * 2.5 + g.z * 1.2;
        }
        const b = noise(t * g.speed * 1.4, g.seed + 9), c = noise(t * g.speed * 2.2, g.seed + 21);
        const lift = Math.max(0, Math.exp(-(t - g.flickAt) * 5) * 0.08);   // it stretches up as it flicks
        const sy = 1 + 0.08 * b * g.live + lift, sx = 1 - 0.05 * b * g.live - lift * 0.4;
        g.cv.style.transform = `translateX(-50%) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
        g.cv.style.opacity = (0.92 + 0.08 * c).toFixed(3);
        draw(g, t);
        heat += b + lift * 4;
      }
      heat /= tongues.length;
      box.style.setProperty('--cf-heat', Math.min(1, 0.5 + heat * 0.5).toFixed(3));
      if (flow) turb.setAttribute('baseFrequency', `0.018 ${(0.045 + 0.006 * Math.sin(t * 0.9)).toFixed(4)}`);
    };
    const run = () => { cancelAnimationFrame(raf); if (on && seen) { last = 0; raf = requestAnimationFrame(tick); } };
    const vis = () => { on = document.visibilityState === 'visible'; run(); };
    document.addEventListener('visibilitychange', vis);
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { seen = es.some((e) => e.isIntersecting); run(); }) : null;
    io?.observe(box);
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => tongues.forEach((g) => { size(g); draw(g, performance.now() / 1000); })) : null;
    ro?.observe(box);
    run();
    return { stop() { cancelAnimationFrame(raf); io?.disconnect(); ro?.disconnect(); document.removeEventListener('visibilitychange', vis); } };
  }
  window.Campfire = { mount };
})();
