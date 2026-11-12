/* The campfire in the middle of the home page's ring: still drawings in the tent's style (the stones and logs; a few flame
   tongues), with all of the motion in code, on every frame the screen draws (docs/design/campfire.md).
     Campfire.mount(box, { base, flames: [{ src, x, h, z }], anchor })   → { stop() }
   base    the stones, logs and embers (one picture);
   flames  each tongue: its picture, where it stands (x: −50…50, % of the base's width from the centre), how tall (h: % of
           the base's width), and its depth (z: 0 at the back … 1 in front, for its liveliness and its warmth);
   anchor  where the flames stand, in % of the base's height from its top (the embers between the logs).
   A copy of the base's front half lies over the flames, so their feet hide behind the near logs and stones.
   The motion: sway from the foot, stretch and narrow, a small flicker – each tongue on its own smooth noise (a few sines
   of unrelated speeds, so no loop shows); a soft flowing distortion (an SVG filter) where the device keeps up; the warm
   glow breathes with the fire. It stops when the page is hidden or the fire is off screen, and with reduced motion it
   stands still. */
(() => {
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noise = (t, s) => (Math.sin(t * 1.13 + s) * 0.5 + Math.sin(t * 2.71 + s * 1.7) * 0.3 + Math.sin(t * 5.37 + s * 2.3) * 0.2);
  let uid = 0;

  function mount(box, cfg) {
    const anchor = cfg.anchor ?? 58;
    const id = 'cf-flow-' + (++uid);
    box.classList.add('cf');
    box.style.setProperty('--cf-anchor', anchor + '%');
    // the flowing heat: a slow turbulence displacing the flames a little
    box.insertAdjacentHTML('beforeend', `<svg class="cf-defs" aria-hidden="true" focusable="false"><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.045" numOctaves="2" seed="3" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
    const turb = box.querySelector('feTurbulence');
    const glow = document.createElement('span'); glow.className = 'cf-glow';
    const base = new Image(); base.className = 'cf-base'; base.src = cfg.base; base.alt = ''; base.decoding = 'async';
    base.addEventListener('load', () => { if (base.naturalWidth) box.style.aspectRatio = `${base.naturalWidth} / ${base.naturalHeight}`; });
    const flames = document.createElement('div'); flames.className = 'cf-flames';
    const front = new Image(); front.className = 'cf-front'; front.src = cfg.base; front.alt = ''; front.decoding = 'async';
    const tongues = cfg.flames.map((f, i) => {
      const im = new Image(); im.className = 'cf-tongue'; im.src = f.src; im.alt = ''; im.decoding = 'async';
      im.style.setProperty('--x', f.x + '%'); im.style.setProperty('--h', String(f.h)); im.style.zIndex = String(Math.round((f.z ?? 0.5) * 10));
      flames.append(im);
      return { im, z: f.z ?? 0.5, seed: i * 2.39 + 0.7, speed: 1.6 + (1 - (f.z ?? 0.5)) * 0.9 + (i % 3) * 0.17 };
    });
    const sparks = document.createElement('div'); sparks.className = 'cf-sparks';
    for (let i = 0; i < 4; i++) { const s = document.createElement('i'); s.style.setProperty('--sx', (i * 23 - 34) + '%'); s.style.setProperty('--sd', (i * 1.3).toFixed(1) + 's'); sparks.append(s); }
    box.append(glow, base, flames, front, sparks);
    if (reduce()) { box.classList.add('still'); return { stop() {} }; }

    let raf = 0, on = true, seen = true, flow = true, frames = 0, slow = 0, last = 0;
    flames.style.filter = `url(#${id})`;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const t = now / 1000;
      // a device that cannot keep up loses the distortion, and keeps the sway
      if (last && flow) { const dt = now - last; frames++; if (dt > 26) slow++; if (frames === 90 && slow > 30) { flow = false; flames.style.filter = 'none'; } }
      last = now;
      let heat = 0;
      for (const g of tongues) {
        const a = noise(t * g.speed, g.seed), b = noise(t * g.speed * 1.4, g.seed + 9), c = noise(t * g.speed * 2.2, g.seed + 21);
        const live = 0.6 + (1 - g.z) * 0.5;
        const sy = 1 + 0.11 * b * live, sx = 1 - 0.06 * b * live;
        g.im.style.transform = `translateX(-50%) rotate(${(a * 5 * live).toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
        g.im.style.opacity = (0.9 + 0.1 * c).toFixed(3);
        heat += b;
      }
      heat /= tongues.length;
      box.style.setProperty('--cf-heat', (0.5 + heat * 0.5).toFixed(3));
      if (flow) turb.setAttribute('baseFrequency', `0.018 ${(0.045 + 0.006 * Math.sin(t * 0.9)).toFixed(4)}`);
    };
    const run = () => { cancelAnimationFrame(raf); if (on && seen) { last = 0; raf = requestAnimationFrame(tick); } };
    const vis = () => { on = document.visibilityState === 'visible'; run(); };
    document.addEventListener('visibilitychange', vis);
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { seen = es.some((e) => e.isIntersecting); run(); }) : null;
    io?.observe(box);
    run();
    return { stop() { cancelAnimationFrame(raf); io?.disconnect(); document.removeEventListener('visibilitychange', vis); } };
  }
  window.Campfire = { mount };
})();
