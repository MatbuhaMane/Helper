/* A small celebration when something is finished (the owner, 2026-11-14): stars and a ring from where it happened, a
   short "+1" (or any word), one light buzz – and nothing at all with reduced motion. The sound is the caller's (only for
   people who turned success sounds on). Loads /assets/game.css itself.
     Celebrate.at(el)                       from the middle of an element (a checkbox, a button, a card)
     Celebrate.at({ x, y }, { label: 'כל הכבוד!', stars: 14 })   */
(() => {
  const reduce = () => (window.H?.reducedMotion ? H.reducedMotion() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  function css() { if (!document.querySelector('link[href*="/assets/game.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/game.css'; document.head.append(l); } }
  let layer;
  const fx = () => { if (layer?.isConnected) return layer; layer = document.createElement('div'); layer.className = 'cel-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.append(layer); return layer; };
  function at(where, opts = {}) {
    css();
    navigator.vibrate?.(12);
    if (reduce()) return;
    let x, y;
    if (where instanceof Element) { const r = where.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; } else ({ x, y } = where);
    const L = fx(), n = opts.stars ?? 12, colours = ['#f2c14e', '#e0702a', 'var(--primary)', '#8fc7d4'];
    const ring = document.createElement('i'); ring.className = 'cel-ring'; ring.style.cssText = `left:${x}px;top:${y}px`; L.append(ring); setTimeout(() => ring.remove(), 800);
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i'), a = (i / n) * Math.PI * 2 + Math.random() * 0.4, r = 46 + Math.random() * 46;
      s.className = 'cel-star'; s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r - 14}px;--c:${colours[i % 4]};animation-delay:${(i % 4) * 25}ms`;
      L.append(s); setTimeout(() => s.remove(), 1100);
    }
    if (opts.label !== false) { const p = document.createElement('b'); p.className = 'cel-plus'; p.textContent = opts.label || '+1'; p.style.cssText = `left:${x}px;top:${y}px`; L.append(p); setTimeout(() => p.remove(), 1200); }
  }
  window.Celebrate = { at };
})();
