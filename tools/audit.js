/* The page audit: every page in an iframe of a given size, in light and in dark.
   It reports sideways overflow, broken images, buttons and links with no name, and text whose contrast is under 3:1.
   Motion (batch 16, "motion must feel premium"): it also lists animations and transitions that move layout properties
   (width, height, top, margin, inline-size…) instead of transform and opacity. Those stutter on a phone; each one is a defect.
   Run it in the browser on the dev server (npm run dev): paste this file into the console of any page there, then

     await __auditDesk(['/', '/food/', '/news/', ...], 375, 812)    // a phone
     await __auditDesk([...], 1280, 800)                             // a desktop

   The Telegram test (batch 30, docs/design/motion.md T1–T12) is in each page's result as telegram (defects) and telegramWarn.
   Run it with the pane shown: a hidden pane runs no frames, so T9 is then skipped.
   Known false alarms: text over pictures and gradients is skipped; colours in oklab/oklch are skipped. */
// Desktop audit: each page in a 1280x800 iframe, in light and in dark.
// Checks sideways overflow, broken images, nameless controls, and text that is hard to read (contrast < 3).
// Overlap (vision batch 17): two controls you can press that cover each other on screen are a defect too.
window.__auditDesk = async function (pages, W = 1280, H = 800) {
  const lum = (c) => { if (/^(oklab|oklch|lab|lch)\(/.test(c)) return null; const m = c.match(/[\d.]+/g); if (!m) return null; let [r, g, b, a = 1] = m.map(Number); if (c.startsWith('color(')) { r *= 255; g *= 255; b *= 255; } const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return { L: 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b), a }; };
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const out = {};
  for (const p of pages) {
    const fr = document.createElement('iframe');
    fr.style.cssText = `position:fixed;top:0;left:0;width:${W}px;height:${H}px;opacity:0;pointer-events:none;z-index:-1;border:0`;
    document.body.append(fr);
    await new Promise((res) => { fr.onload = res; fr.src = p; setTimeout(res, 8000); });
    await new Promise((r) => setTimeout(r, 2500));
    const w = fr.contentWindow, d = fr.contentDocument;
    const res = {};
    // motion: keyframes and transitions on properties that re-run the layout every frame
    const LAYOUT = /^(width|height|top|left|right|bottom|inset(-.+)?|margin(-.+)?|padding(-.+)?|inline-size|block-size|(min|max)-(width|height|inline-size|block-size)|font-size|line-height|letter-spacing|border(-.+)?-width|flex-basis|grid-template-(rows|columns))$/;
    const motion = new Set();
    const walk = (rules, file) => {
      for (const r of rules) {
        if (r.type === 7) {                              // @keyframes
          const props = new Set();
          for (const k of r.cssRules) for (let i = 0; i < k.style.length; i++) if (LAYOUT.test(k.style[i])) props.add(k.style[i].replace(/-(top|bottom|left|right|block-start|block-end|inline-start|inline-end)$/, ''));
          if (props.size) motion.add(`@keyframes ${r.name} (${file}): ${[...props].join(', ')}`);
        } else if (r.cssRules) walk(r.cssRules, file);   // @media, @supports, @layer
        else if (r.style?.transitionProperty) {
          const bad = r.style.transitionProperty.split(',').map((x) => x.trim()).filter((x) => LAYOUT.test(x));
          if (bad.length) motion.add(`transition ${bad.join(', ')} on ${(r.selectorText || '').slice(0, 60)} (${file})`);
        }
      }
    };
    for (const sh of d.styleSheets) { try { walk(sh.cssRules, (sh.href || 'inline').split('/').pop()); } catch (_) { /* another origin */ } }
    if (motion.size) res.motion = [...motion];
    const tg = await telegram(fr, w, d, W, H);
    if (tg.must.length) res.telegram = tg.must;
    if (tg.should.length) res.telegramWarn = tg.should;
    for (const theme of ['light', 'dark']) {
      if (!d.getElementById('__nt')) { const st = d.createElement('style'); st.id = '__nt'; st.textContent = '*,*::before,*::after{transition:none!important;animation-duration:0s!important}'; d.head.append(st); }
      d.documentElement.dataset.theme = theme;
      d.documentElement.classList.remove('theme-fade');
      await new Promise((r) => setTimeout(r, 600));
      const issues = [];
      if (d.documentElement.scrollWidth > W + 1) issues.push('overflow ' + (d.documentElement.scrollWidth - W) + 'px');
      d.querySelectorAll('img').forEach((im) => { if (im.complete && im.src && !im.naturalWidth && im.getBoundingClientRect().width) issues.push('broken img ' + im.src.slice(-40)); });
      d.querySelectorAll('button, a[href], [role=button]').forEach((b) => { const r = b.getBoundingClientRect(); if (!r.width) return; if (!(b.textContent.trim() || b.getAttribute('aria-label') || b.title || b.querySelector('img[alt]:not([alt=""])'))) issues.push('nameless ' + b.outerHTML.slice(0, 70)); });
      // contrast: text-bearing elements against their nearest opaque background
      let low = 0; const samples = [];
      const walker = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      while (walker.nextNode()) {
        const t = walker.currentNode; const e = t.parentElement;
        if (!e || seen.has(e) || !t.textContent.trim()) continue; seen.add(e);
        const r = e.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > H * 3) continue;
        const cs = w.getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        const fg = lum(cs.color); if (!fg || fg.a < 0.5) continue;
        let bg = null, n = e;
        while (n && n.nodeType === 1) { const s = w.getComputedStyle(n); if (s.backgroundImage !== 'none') { bg = 'image'; break; } const c = lum(s.backgroundColor); if (c && c.a > 0.85) { bg = c; break; } n = n.parentElement; }
        if (!bg || bg === 'image') continue;
        const k = ratio(fg.L, bg.L);
        if (k < 3) { low++; if (samples.length < 4) samples.push(`${k.toFixed(1)} "${t.textContent.trim().slice(0, 24)}" <${e.tagName.toLowerCase()} class="${e.className}">`); }
      }
      if (low) issues.push(`low contrast ×${low}: ` + samples.join(' | '));
      // overlapping controls: visible, pressable, on the first screen, neither inside the other, sharing at least 6×6 px where the top one
      // is one of the two (so a control covered by a sheet or a backdrop is not counted)
      if (theme === 'light') {
        const name = (b) => (b.getAttribute('aria-label') || b.textContent || b.title || b.tagName).trim().replace(/s+/g, ' ').slice(0, 20);
        const hits = [...d.querySelectorAll('button, a[href], [role=button], input:not([type=hidden]), select, textarea, summary')].map((b) => [b, b.getBoundingClientRect()])
          .filter(([b, r]) => r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W && !b.disabled
            && (b.checkVisibility ? b.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true) && w.getComputedStyle(b).pointerEvents !== 'none');
        // a (nearly) full-width bar that stays put (the tab bar, a sticky header): what scrolls under it is not an overlap
        const bar = (b) => { for (let n = b; n && n !== d.body; n = n.parentElement) { const ps = w.getComputedStyle(n).position; if ((ps === 'fixed' || ps === 'sticky') && n.getBoundingClientRect().width >= W * 0.8) return n; } return null; };
        const pairs = [];
        for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
          const [a, ra] = hits[i], [b, rb] = hits[j];
          if (a.contains(b) || b.contains(a) || bar(a) !== bar(b)) continue;
          const x0 = Math.max(ra.left, rb.left), x1 = Math.min(ra.right, rb.right), y0 = Math.max(ra.top, rb.top), y1 = Math.min(ra.bottom, rb.bottom);
          if (x1 - x0 < 6 || y1 - y0 < 6) continue;
          // both must really be under that point (not clipped away by a scrolling box), and one of them on top
          const at = d.elementsFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
          if (at.length && (a.contains(at[0]) || b.contains(at[0])) && at.some((e) => a.contains(e)) && at.some((e) => b.contains(e))) pairs.push(`"${name(a)}" × "${name(b)}"`);
        }
        if (pairs.length) issues.push(`overlap ×${pairs.length}: ` + pairs.slice(0, 4).join(' | '));
      }
      res[theme] = issues;
    }
    out[p] = res;
    fr.remove();
  }
  return out;
};

/* The Telegram test (design, docs/design/motion.md, T1–T12), on a page that is loaded and still has its own motion.
   "must" is a defect, "should" a warning. T1 is the `motion` list above, and T12's contrast is the light/dark pass.
   Not measured here: T5's "the DOM answers within 100 ms" (it needs the page's own actions), and T9 in a pane that runs no frames
   (it then says so instead of passing). */
async function telegram(fr, w, d, W, H) {
  const must = new Set(), should = new Set();
  const ms = (s) => s.split(',').map((x) => (x = x.trim(), x.endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000));
  const at = (list, i) => list[i % list.length];
  const tag = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const PAINT = /^(color|background(-color)?|border(-.+)?-color|box-shadow|filter|outline-color|fill|stroke)$/;
  const MOVE = /^(transform|opacity|translate|scale|rotate|all)$/;
  // T4: the allowlist in docs/design/motion.md (waiting, live, edit mode, scenery); a new one goes there first
  const ENDLESS = new Set(["spin","rec-spin","rs-spin","fun-spin","fun-pull-spin","mu-spin","ga-calc-wait","cx-dots","gl-dot","skel-sheen","shimmer","pb-sheen","gl-rec","mu-listen","mu-eq","gp-wave","sos-pulse","st-ring","dm-z","dm-flow","app-wiggle","arr-wiggle","sky-twinkle","twinkle","sun-breathe","glow","breath","shb-breathe","strip-breathe","rp-breathe","wz-breathe","wz-tri","cf-spark","cf-roar","cf-chosen","plump","tr-fall","tr-drift","tr-sway","tr-sway-low","tr-hang","tr-glow","tr-flicker","tr-candle-glow","f2-glow","f2-tw","f2-z","fe-flick","mood-flicker","egg-live","egg-rock"]);
  const frame = (n = 1) => new Promise((r) => { const go = (k) => (k ? w.requestAnimationFrame(() => go(k - 1)) : r()); go(n); setTimeout(r, 60 * n); });   // a hidden pane runs no frames
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H * 2; };
  const els = [...d.querySelectorAll('body *')].filter(vis);
  // T2–T4: what each visible element really transitions and animates (pseudo-elements too: the sky, the moods)
  // art, not UI (the master's call, 2026-11-14): a scene nobody presses (pointer-events none, or inside aria-hidden) may breathe slowly; T3/T4 hold for every control
  const art = (e) => w.getComputedStyle(e).pointerEvents === 'none' || !!e.closest('[aria-hidden="true"]');
  for (const e of els) for (const pseudo of [null, '::before', '::after']) {
    if (art(e)) continue;
    const cs = w.getComputedStyle(e, pseudo);
    if (pseudo && cs.content === 'none') continue;
    const props = cs.transitionProperty.split(',').map((x) => x.trim()), dur = ms(cs.transitionDuration);
    props.forEach((p, i) => {
      const t = at(dur, i); if (!t) return;
      if (PAINT.test(p) && t > 200) should.add(`T2 ${p} ${t}ms on ${tag(e)}${pseudo || ''}`);
      else if (MOVE.test(p) && t > 340) must.add(`T3 transition ${p} ${t}ms on ${tag(e)}${pseudo || ''}`);
    });
    if (cs.animationName === 'none') continue;
    const names = cs.animationName.split(',').map((x) => x.trim()), adur = ms(cs.animationDuration), it = cs.animationIterationCount.split(',').map((x) => x.trim());
    names.forEach((n, i) => {
      if (at(it, i) === 'infinite') { if (!ENDLESS.has(n)) must.add(`T4 endless @keyframes ${n} on ${tag(e)}${pseudo || ''}`); }
      else if (at(adur, i) > 2600) must.add(`T3 ${n} ${at(adur, i)}ms on ${tag(e)}${pseudo || ''}`);
      else if (at(adur, i) > 400) should.add(`T3 one-time ${n} ${at(adur, i)}ms on ${tag(e)}${pseudo || ''} (fine only for a mood, the egg or gk-ok)`);
    });
  }
  // T6: no 300 ms wait on a tap
  for (const b of d.querySelectorAll('button, a[href], [role=button], [role=switch], [role=radio], [role=tab], summary, label')) {
    if (!vis(b)) continue;
    const ta = w.getComputedStyle(b).touchAction;
    if (!/manipulation|none|pan-y/.test(ta)) must.add(`T6 touch-action ${ta} on ${tag(b)}`);
  }
  // T7: every picture and video keeps its box before it loads; the page's layout shifts so far
  for (const m of d.querySelectorAll('img, video')) {
    if (!vis(m)) continue;
    if (/absolute|fixed/.test(w.getComputedStyle(m).position)) continue;   // fills a sized box: it cannot push anything
    if (!(m.getAttribute('width') && m.getAttribute('height')) && w.getComputedStyle(m).aspectRatio === 'auto') should.add(`T7 no size on ${tag(m)} ${(m.currentSrc || m.src || '').split('/').pop().slice(0, 30)}`);
  }
  const cls = await new Promise((res) => { let s = 0; try { new w.PerformanceObserver((l) => { for (const x of l.getEntries()) if (!x.hadRecentInput) s += x.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (_) { return res(null); } setTimeout(() => res(s), 100); });
  if (cls != null && cls > 0.02) must.add(`T7 CLS ${cls.toFixed(3)} (over 0.02)`);
  // T8: a spinner stays silent for its first 400 ms
  if (w.H) {
    const sp = d.createElement('span'); sp.className = 'spinner'; d.body.append(sp);
    await frame();
    if (+w.getComputedStyle(sp).opacity > 0.05) must.add('T8 a .spinner shows before 400 ms');
    sp.remove();
  }
  // T10: a scroll pane with real content keeps the page still behind it
  for (const e of els) {
    const cs = w.getComputedStyle(e);
    if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight - e.clientHeight > 300 && cs.overscrollBehaviorY !== 'contain' && e !== d.documentElement && e !== d.body) should.add(`T10 overscroll ${cs.overscrollBehaviorY} on ${tag(e)}`);
  }
  // T9: frames while scrolling and while a sheet opens and closes
  const frames = [], longs = [];
  let lo; try { lo = new w.PerformanceObserver((l) => l.getEntries().forEach((x) => x.duration > 50 && longs.push(Math.round(x.duration)))); lo.observe({ type: 'longtask' }); } catch (_) { /* not in this browser */ }
  let last = 0, run = true;
  const tick = (t) => { if (last) frames.push(t - last); last = t; if (run) w.requestAnimationFrame(tick); };
  w.requestAnimationFrame(tick);
  w.scrollBy({ top: 1200, behavior: 'smooth' });
  await new Promise((r) => setTimeout(r, 700));
  if (w.H?.modal) { w.H.modal(d.createTextNode('בדיקה')); await new Promise((r) => setTimeout(r, 450)); w.H.closeModal?.(); await new Promise((r) => setTimeout(r, 350)); }
  run = false; lo?.disconnect(); w.scrollTo(0, 0);
  if (frames.length < 10) should.add('T9 not measured: the frame ran no frames (a hidden pane)');
  else { const slow = frames.filter((x) => x > 32).length / frames.length; if (slow > 0.05) should.add(`T9 ${Math.round(slow * 100)}% of frames over 32 ms`); }
  if (longs.length) should.add(`T9 long tasks: ${longs.slice(0, 5).join(', ')} ms`);
  // T11: with reduced motion, an open sheet moves nothing
  if (w.H?.modal) {
    const html = d.documentElement, was = html.dataset.motion;
    html.dataset.motion = 'reduce';
    w.H.modal(d.createTextNode('בדיקה'));
    await frame(2);
    const moving = d.getAnimations().filter((a) => a.playState === 'running' && (a.effect?.getComputedTiming?.().duration ?? 1) >= 1 && a.effect?.getKeyframes?.().some((k) => k.transform && k.transform !== 'none' || k.translate || k.scale || k.rotate));
    if (moving.length) must.add(`T11 reduced motion still moves: ${moving.slice(0, 4).map((a) => a.animationName || a.transitionProperty || 'script').join(', ')}`);
    w.H.closeModal?.();
    if (was == null) delete html.dataset.motion; else html.dataset.motion = was;
  }
  // T12: no pure black page in dark
  const bgWas = d.documentElement.dataset.theme; d.documentElement.dataset.theme = 'dark';
  for (const e of [d.documentElement, d.body]) if (/^rgba?\(0, 0, 0(, 1)?\)$/.test(w.getComputedStyle(e).backgroundColor)) must.add(`T12 pure black background on ${e.tagName.toLowerCase()}`);
  if (bgWas == null) delete d.documentElement.dataset.theme; else d.documentElement.dataset.theme = bgWas;
  return { must: [...must].slice(0, 25), should: [...should].slice(0, 25) };
}
