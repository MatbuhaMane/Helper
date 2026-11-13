/* The page audit: every page in an iframe of a given size, in light and in dark.
   It reports sideways overflow, broken images, buttons and links with no name, and text whose contrast is under 3:1.
   Motion (batch 16, "motion must feel premium"): it also lists animations and transitions that move layout properties
   (width, height, top, margin, inline-size…) instead of transform and opacity. Those stutter on a phone; each one is a defect.
   Run it in the browser on the dev server (npm run dev): paste this file into the console of any page there, then

     await __auditDesk(['/', '/food/', '/news/', ...], 375, 812)    // a phone
     await __auditDesk([...], 1280, 800)                             // a desktop

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
