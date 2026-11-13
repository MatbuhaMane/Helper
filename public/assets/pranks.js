/* Pranks – the little wizard and the little witch play small harmless tricks on the page while it is used
   (the owner, 2026-11-13). Every trick is only a look: a card wobbles like jelly, an icon floats up and settles, a trail
   of sparks flies from the staff to a heading, a coin-flip spin, the figure vanishes in a puff and comes back, ducks and
   peeks, shrinks under its own spell, a few stars drift down. Nothing on the page changes, nothing blocks a click
   (overlays never take the pointer; page elements only get a short Web Animation that undoes itself).

   Manners: never while typing, scrolling, in a dialog, or in a hidden tab; never on what is focused or under the pointer;
   the first trick only after a quiet minute, then one every few minutes, and a few per visit at most; nothing at all with
   reduced motion. Whether pranks are on is the person's choice (a setting, on by default) – the caller decides:

     const p = Pranks.start(f, { id: 'littlewizard' });   // f: a Figure2D figure (Figure2D.mount's result)
     p.stop();                                            // when it is switched off or the figure changes
     p.play('wobble');                                    // one now (for a settings preview)
     Pranks.names                                         // the tricks
     Pranks.FOR                                           // the figures that prank: ['littlewizard', 'littlewitch']
*/
(() => {
  const FOR = ['littlewizard', 'littlewitch'];
  const reduce = () => (window.H?.reducedMotion ? H.reducedMotion() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function ensureCss() {
    if (document.querySelector('link[href*="pranks.css"]')) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/pranks.css'; document.head.append(l);
  }
  // an overlay for sparks and stars: fixed, over everything, never takes the pointer
  let layer = null;
  const fx = () => {
    if (layer?.isConnected) return layer;
    layer = document.createElement('div'); layer.className = 'pk-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.append(layer); return layer;
  };
  const spark = (x, y, cls = '', life = 1200) => { const i = document.createElement('i'); i.className = 'pk-spark ' + cls; i.style.left = x + 'px'; i.style.top = y + 'px'; fx().append(i); setTimeout(() => i.remove(), life); return i; };

  // something on the page to play with: visible, a fair size, not a field, not focused or hovered, not the companion
  function target(sel, maxArea = 0.35) {
    const vw = innerWidth, vh = innerHeight;
    const all = [...document.querySelectorAll(sel)].filter((e) => {
      if (e.closest('.f2, .dm-tab, .dm-panel, dialog, [role="dialog"], input, textarea, select, [contenteditable="true"], .pk-layer')) return false;
      if (e.matches(':focus-within, :hover')) return false;
      const r = e.getBoundingClientRect();
      if (r.width < 18 || r.height < 14 || r.bottom < 40 || r.top > vh - 40 || r.right < 0 || r.left > vw) return false;
      return (r.width * r.height) / (vw * vh) < maxArea;
    });
    return all.length ? pick(all) : null;
  }
  const staff = (f, id) => {
    const r = f.el.getBoundingClientRect(), [sx, sy] = window.Figure2D?.FIGURES[id]?.sparkFrom || [0.15, 0.4];
    return [r.left + sx * r.width, r.top + sy * r.height];
  };
  const giggle = (f) => { f.talk?.(true); setTimeout(() => f.talk?.(false), 650); };

  const TRICKS = {
    // a card wobbles like jelly
    wobble(f) {
      const e = target('.card, .tile, .app, .apps-grid > *, .folder-hero, .chip, .btn, li'); if (!e) return false;
      e.animate([{ transform: 'none' }, { transform: 'scale(1.06, .94)' }, { transform: 'scale(.95, 1.05)' }, { transform: 'scale(1.03, .97)' }, { transform: 'scale(.99, 1.01)' }, { transform: 'none' }],
        { duration: 750, easing: 'ease-in-out' });
      f.special?.(); setTimeout(() => giggle(f), 500); return true;
    },
    // an icon or a picture floats up, turns a little, and settles back
    float(f, id) {
      const e = target('img:not(.f2-pic), svg, .icon, h1, h2, h3', 0.12); if (!e) return false;
      const r = e.getBoundingClientRect(); const [sx, sy] = staff(f, id);
      trail(sx, sy, r.left + r.width / 2, r.bottom);
      setTimeout(() => {
        e.animate([{ transform: 'none' }, { transform: 'translateY(-14px) rotate(-4deg)', offset: 0.35 }, { transform: 'translateY(-12px) rotate(3deg)', offset: 0.7 }, { transform: 'none' }],
          { duration: 1700, easing: 'cubic-bezier(.4,0,.3,1)' });
        for (let i = 0; i < 5; i++) setTimeout(() => spark(r.left + rnd(0, r.width), r.bottom + rnd(-2, 6), 'small'), i * 140);
      }, 520);
      setTimeout(() => giggle(f), 1700); return true;
    },
    // a trail of sparks from the staff bursts over a heading or a button
    sprinkle(f, id) {
      const e = target('h1, h2, h3, .btn, .chip'); if (!e) return false;
      const r = e.getBoundingClientRect(); const [sx, sy] = staff(f, id);
      f.special?.(); trail(sx, sy, r.left + r.width / 2, r.top + r.height / 2);
      setTimeout(() => { for (let i = 0; i < 14; i++) setTimeout(() => spark(r.left + rnd(0, r.width), r.top + rnd(-6, r.height + 6), 'twinkle', 1400), i * 45); }, 560);
      setTimeout(() => giggle(f), 900); return true;
    },
    // a small thing spins once, like a flipped coin
    flip(f) {
      const e = target('.chip, .btn, img:not(.f2-pic), svg, .icon', 0.05); if (!e) return false;
      e.animate([{ transform: 'none' }, { transform: 'perspective(400px) rotateY(180deg) scale(1.08)', offset: 0.5 }, { transform: 'perspective(400px) rotateY(360deg)' }],
        { duration: 900, easing: 'cubic-bezier(.5,0,.3,1)' });
      setTimeout(() => giggle(f), 700); return true;
    },
    // the figure vanishes in a puff and comes back
    poof(f) {
      const r = f.el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.55;
      for (let i = 0; i < 10; i++) { const k = spark(cx + Math.cos(i / 10 * 6.28) * 12, cy + Math.sin(i / 10 * 6.28) * 12, 'puff', 900); k.style.setProperty('--dx', Math.cos(i / 10 * 6.28) * 46 + 'px'); k.style.setProperty('--dy', Math.sin(i / 10 * 6.28) * 46 + 'px'); }
      f.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.4)', offset: 0.18 }, { opacity: 0, transform: 'scale(.4)', offset: 0.8 }, { opacity: 1, transform: 'scale(1.08)', offset: 0.92 }, { opacity: 1, transform: 'none' }],
        { duration: 2200, easing: 'ease-out' });
      setTimeout(() => { f.happy?.(); }, 2050); return true;
    },
    // it ducks down out of sight, then peeks back up
    peek(f) {
      f.el.animate([{ transform: 'none' }, { transform: 'translateY(70%)', offset: 0.2 }, { transform: 'translateY(70%)', offset: 0.55 }, { transform: 'translateY(35%) rotate(-6deg)', offset: 0.68 },
        { transform: 'translateY(35%) rotate(-6deg)', offset: 0.82 }, { transform: 'none' }], { duration: 2600, easing: 'ease-in-out' });
      setTimeout(() => giggle(f), 1900); return true;
    },
    // its own spell goes wrong: it shrinks, then pops back
    shrink(f, id) {
      const [sx, sy] = staff(f, id); for (let i = 0; i < 8; i++) spark(sx + rnd(-10, 10), sy + rnd(-10, 10), 'small');
      f.el.animate([{ transform: 'none' }, { transform: 'scale(.45)', offset: 0.25 }, { transform: 'scale(.45) rotate(8deg)', offset: 0.45 }, { transform: 'scale(.45) rotate(-8deg)', offset: 0.6 },
        { transform: 'scale(1.12)', offset: 0.85 }, { transform: 'none' }].map((k) => ({ ...k, transformOrigin: '50% 100%' })), { duration: 2000, easing: 'ease-in-out' });
      setTimeout(() => giggle(f), 1700); return true;
    },
    // a few stars drift down across the screen
    stars(f, id) {
      f.special?.();
      for (let i = 0; i < 14; i++) setTimeout(() => { const k = spark(rnd(20, innerWidth - 20), rnd(-20, 30), 'fall', 3600); k.style.setProperty('--fall', rnd(innerHeight * 0.45, innerHeight * 0.9) + 'px'); k.style.setProperty('--sway', rnd(-40, 40) + 'px'); }, i * 160);
      setTimeout(() => giggle(f), 600); return true;
    },
  };
  // a curving trail of little sparks from (x0,y0) to (x1,y1)
  function trail(x0, y0, x1, y1) {
    const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 60;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1, y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1;
      setTimeout(() => spark(x, y, 'small', 700), i * 45);
    }
  }

  function start(f, opts = {}) {
    ensureCss();
    const id = opts.id || '';
    const every = opts.every || [120000, 300000];     // one trick every 2–5 minutes
    const most = opts.most ?? 8;                       // and a few per visit at most
    let timer = 0, done = 0, lastBusy = performance.now(), stopped = false, last = '';
    const busy = () => { lastBusy = performance.now(); };
    addEventListener('keydown', busy, true); addEventListener('scroll', busy, { passive: true, capture: true }); addEventListener('input', busy, true);
    const calm = () => !document.hidden && !reduce() && performance.now() - lastBusy > 4000 && f.el?.isConnected &&
      !document.activeElement?.closest?.('input, textarea, select, [contenteditable="true"]') && !document.querySelector('dialog[open], [role="dialog"]:not([hidden])');
    const play = (name) => {
      if (reduce() || !f.el?.isConnected) return false;
      const names = Object.keys(TRICKS).filter((n) => n !== last);
      const n = name && TRICKS[name] ? name : pick(names);
      const ok = TRICKS[n](f, id) || (!name && TRICKS.poof(f, id));
      if (ok) last = n;
      return ok;
    };
    const next = (ms) => { clearTimeout(timer); if (!stopped && done < most) timer = setTimeout(tick, ms); };
    const tick = () => { if (calm()) { if (play()) done++; next(rnd(...every)); } else next(rnd(8000, 20000)); };
    next(opts.first ?? rnd(60000, 90000));
    return {
      play,
      stop() { stopped = true; clearTimeout(timer); removeEventListener('keydown', busy, true); removeEventListener('scroll', busy, { capture: true }); removeEventListener('input', busy, true); },
    };
  }
  window.Pranks = { start, names: Object.keys(TRICKS), FOR };
})();
