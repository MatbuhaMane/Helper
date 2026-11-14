/* The switchboard's moods (server/switches.ts; set in /admin/, common.js loads this when a mood is on).
     חגיגה (mood 'party'): confetti and balloons once per opening of the app (this tab's session).
     אבל (mood 'mourning'): two candles resting in the corner on every page; the faded palette is design's, on
       html[data-mood="mourning"].
   Motion moves only transform and opacity (the Web Animations API), and none at all when the person asked for less motion.
   The shapes are design's (base.css): .mood-fx, .mood-confetti, .mood-balloon, .mood-string, .mood-candles, .mood-candle,
   .mood-flame; here only the place (--x) and the colour (--c) of each piece. */
(() => {
  if (window.HMood) return;
  const el = (tag, cls, style) => { const n = document.createElement(tag); n.className = cls; if (style) n.setAttribute('style', style); return n; };
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce';
  const COLORS = ['#c8553d', '#e0a526', '#5b8c5a', '#3d7ea6', '#9a5fa8', '#d97a9b'];
  const rnd = (a, b) => a + Math.random() * (b - a);
  let layer = null;

  function clear() { layer?.remove(); layer = null; }
  function fx() { clear(); layer = el('div', 'mood-fx'); layer.setAttribute('aria-hidden', 'true'); document.body.append(layer); return layer; }

  function party() {
    let seen = null; try { seen = sessionStorage.getItem('helper.moodShown'); } catch (_) { /* no storage */ }
    if (seen === 'party' || still()) return;
    try { sessionStorage.setItem('helper.moodShown', 'party'); } catch (_) { /* shown again next page */ }
    const box = fx(), h = innerHeight, runs = [];
    for (let i = 0; i < 48; i++) {
      const p = el('i', 'mood-confetti', `--x:${rnd(0, 100).toFixed(1)}%;--c:${COLORS[i % COLORS.length]}`);
      box.append(p);
      const drift = rnd(-60, 60), turn = rnd(-540, 540), d = rnd(2400, 4200);
      runs.push(p.animate([
        { transform: 'translate(0, -20px) rotate(0deg)', opacity: 1 },
        { transform: `translate(${drift}px, ${h * 0.8}px) rotate(${turn}deg)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${drift * 1.2}px, ${h + 20}px) rotate(${turn * 1.2}deg)`, opacity: 0 },
      ], { duration: d, delay: rnd(0, 700), easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'both' }));
    }
    for (let i = 0; i < 7; i++) {
      const b = el('i', 'mood-balloon', `--x:${(8 + i * 13 + rnd(-4, 4)).toFixed(1)}%;--c:${COLORS[(i * 2) % COLORS.length]}`);
      b.append(el('i', 'mood-string'));
      box.append(b);
      const sway = rnd(-40, 40);
      runs.push(b.animate([
        { transform: 'translate(0, 0)', opacity: 0 },
        { transform: `translate(${sway / 2}px, ${-h * 0.45}px)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${sway}px, ${-h - 120}px)`, opacity: 1 },
      ], { duration: rnd(5000, 7000), delay: rnd(200, 1400), easing: 'ease-in', fill: 'both' }));
    }
    Promise.all(runs.map((r) => r.finished.catch(() => {}))).then(() => { if (layer === box) clear(); });
  }

  function mourning() {
    const box = fx(), row = el('div', 'mood-candles');
    for (let i = 0; i < 2; i++) {
      const c = el('span', 'mood-candle'), f = el('i', 'mood-flame');
      c.append(f); row.append(c);
      if (!still()) f.animate([{ transform: 'scale(1, 1)', opacity: 1 }, { transform: 'scale(.92, 1.08)', opacity: 0.85 }, { transform: 'scale(1.04, .96)', opacity: 1 }],
        { duration: 1400 + i * 230, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    }
    box.append(row);
  }

  function apply() {
    const mood = window.H?.switches?.mood;
    if (mood === 'mourning') mourning();
    else if (mood === 'party') { if (layer?.querySelector('.mood-candles')) clear(); if (!layer) party(); }
    else clear();
  }
  window.HMood = { apply, party, mourning, clear };
  addEventListener('h:switches', apply);
  if (document.body) apply(); else addEventListener('DOMContentLoaded', apply, { once: true });
})();
