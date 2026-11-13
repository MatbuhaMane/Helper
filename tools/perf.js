/* The speed audit (docs/vision/ready.md, the readiness bar, conditions 2 and 3): every page in an iframe of a given size,
   measured against the bar – LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms, 60 frames a second.
   Run it in the browser on the dev server (npm run dev), like tools/audit.js: paste this file into the console of any
   page there (the Browser pane or the window must be visible: a hidden page's frames are throttled), then

     await __perf(['/', '/food/', '/news/', ...], 375, 812)    // a phone
     await __perf([...], 1280, 800)                             // a desktop
     __perfTable(result)                                        // the same as a table, ✓ / ✗ against the bar
     await __perfHere()                                         // this page itself, as it loaded

   For each page:
     lcp     the largest contentful paint, ms from the start of the navigation (the frame's own, buffered)
     fcp     the first contentful paint, ms;  ttfb  the server's first byte, ms
     cls     the layout shift: the largest session window (1 s gap, 5 s cap), shifts after input left out
     tbt     the blocking time of the long animation frames during load (the part over 50 ms of each, summed): a stand-in
             for INP, which needs a real person's input
     loaf    the longest animation frame during load, ms
     fps     frames a second while the page scrolls smoothly for 2 seconds, and drop – the share of frames over 25 ms
   INP itself: __perfWatch() on a page, then use it by hand (clicks, typing); __perfWatch.report() gives the INP of
   what you did. That is the measure for the joint test run (condition 5).

   What this cannot do: slow the network to 4G or the processor to a mid-range phone. A page cannot throttle itself; the
   numbers here are a fast computer's on localhost. See docs/areas/ai-features/status.md for the proposal (Lighthouse or
   the Chrome DevTools Protocol). */
(() => {
  const BAR = { lcp: 2500, cls: 0.1, inp: 200, tbt: 200, fps: 55 };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** the buffered entries of one type in a window (an empty list where the browser does not know the type) */
  function entries(w, type) {
    return new Promise((resolve) => {
      let got = [];
      try {
        const po = new w.PerformanceObserver((l) => { got = got.concat(l.getEntries()); });
        po.observe({ type, buffered: true });
        setTimeout(() => { po.disconnect(); resolve(got); }, 50);
      } catch (_) { resolve([]); }
    });
  }

  /** the largest session window of layout shifts (the CLS of web-vitals) */
  function cls(shifts) {
    let max = 0, cur = 0, first = 0, last = 0;
    for (const s of shifts) {
      if (s.hadRecentInput) continue;
      if (cur && s.startTime - last < 1000 && s.startTime - first < 5000) cur += s.value;
      else { cur = s.value; first = s.startTime; }
      last = s.startTime; max = Math.max(max, cur);
    }
    return +max.toFixed(3);
  }

  /** frames while the page scrolls smoothly: a fps figure, and the share of frames that took over 25 ms */
  async function frames(w, d, ms = 2000) {
    const el = d.scrollingElement || d.documentElement;
    const room = el.scrollHeight - w.innerHeight;
    const times = [];
    let t0 = 0, raf;
    await new Promise((resolve) => {
      const tick = (t) => {
        if (!t0) t0 = t;
        times.push(t);
        // a smooth scroll down (up to 60% of the page) and back up
        const k = Math.min(1, (t - t0) / ms);
        if (room > 0) w.scrollTo(0, Math.round(room * 0.6 * Math.sin(Math.PI * k)));
        if (t - t0 < ms) raf = w.requestAnimationFrame(tick); else resolve();
      };
      raf = w.requestAnimationFrame(tick);
      setTimeout(resolve, ms + 1500);   // (a page that stops drawing does not hang the audit)
    });
    w.cancelAnimationFrame(raf);
    w.scrollTo(0, 0);
    if (times.length < 3) return { fps: 0, drop: 1, scrolled: room > 0 };
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const span = times[times.length - 1] - times[0];
    return { fps: Math.round((gaps.length / span) * 1000), drop: +(gaps.filter((g) => g > 25).length / gaps.length).toFixed(2), scrolled: room > 0 };
  }

  /** one page, in an iframe of W × H that is drawn (an invisible frame is not painted, and has no LCP) */
  async function one(path, W, H, settle) {
    const fr = document.createElement('iframe');
    fr.style.cssText = `position:fixed;top:0;left:0;width:${W}px;height:${H}px;border:0;z-index:2147483647;background:#fff`;
    fr.src = path;
    document.body.append(fr);
    await new Promise((res) => { fr.onload = res; setTimeout(res, 15000); });
    await wait(settle);
    try { return await measure(fr.contentWindow, fr.contentDocument); } finally { fr.remove(); }
  }

  /** the numbers of a loaded page (its window and document) */
  async function measure(w, d) {
    try {
      const nav = w.performance.getEntriesByType('navigation')[0] || {};
      const [lcpE, shifts, loafs] = await Promise.all([entries(w, 'largest-contentful-paint'), entries(w, 'layout-shift'), entries(w, 'long-animation-frame')]);
      const fcp = w.performance.getEntriesByName('first-contentful-paint')[0];
      const lcp = lcpE.length ? lcpE[lcpE.length - 1] : null;
      const tbt = loafs.reduce((s, f) => s + Math.max(0, (f.blockingDuration ?? f.duration - 50)), 0);
      const fr2 = await frames(w, d);
      const what = lcp?.element ? (lcp.element.tagName.toLowerCase() + (lcp.element.className && typeof lcp.element.className === 'string' ? '.' + lcp.element.className.split(' ')[0] : '')) : null;
      return {
        status: nav.responseStatus, at: w.location.pathname,
        ttfb: Math.round(nav.responseStart || 0), fcp: fcp ? Math.round(fcp.startTime) : null,
        lcp: lcp ? Math.round(lcp.startTime) : null, lcpOf: what,
        cls: cls(shifts), tbt: Math.round(tbt), loaf: loafs.length ? Math.round(Math.max(...loafs.map((f) => f.duration))) : 0,
        fps: fr2.fps, drop: fr2.drop, scrolled: fr2.scrolled,
        hidden: document.visibilityState !== 'visible',
      };
    } catch (e) {
      return { error: String(e).slice(0, 120) };
    }
  }

  /** this page itself, as it loaded (for a driver that navigates the top window: a real navigation, cold or throttled) */
  window.__perfHere = () => measure(window, document);

  /** every page at one size; settle is how long a page gets after its load event (its data, its pictures) */
  window.__perf = async function (pages, W = 1280, H = 800, settle = 3000) {
    if (document.visibilityState !== 'visible') console.warn('perf: this page is hidden – its frames are throttled, so fps and timings are off');
    const out = {};
    for (const p of pages) out[p] = await one(p, W, H, settle);
    return out;
  };

  /** the results against the bar, as console.table rows (and returned) */
  window.__perfTable = function (res) {
    const ok = (v, max) => (v == null ? '–' : (v <= max ? '✓ ' : '✗ ') + v);
    const rows = Object.entries(res).map(([p, r]) => r.error ? { page: p, error: r.error } : {
      page: p, lcp: ok(r.lcp, BAR.lcp), cls: ok(r.cls, BAR.cls), tbt: ok(r.tbt, BAR.tbt),
      fps: r.scrolled ? (r.fps >= BAR.fps ? '✓ ' : '✗ ') + r.fps + (r.drop ? ` (${Math.round(r.drop * 100)}% slow)` : '') : '– (no scroll)',
      fcp: r.fcp, ttfb: r.ttfb, loaf: r.loaf, 'lcp of': r.lcpOf,
    });
    console.table(rows);
    return rows;
  };

  /** INP on this page while a person uses it: __perfWatch(), use the page, then __perfWatch.report() */
  window.__perfWatch = function () {
    const seen = new Map();
    const po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (!e.interactionId) continue;
        const was = seen.get(e.interactionId);
        if (!was || e.duration > was.duration) seen.set(e.interactionId, { duration: e.duration, name: e.name, target: e.target?.tagName?.toLowerCase() + (e.target?.className ? '.' + String(e.target.className).split(' ')[0] : '') });
      }
    });
    po.observe({ type: 'event', durationThreshold: 16, buffered: true });
    window.__perfWatch.report = () => {
      const all = [...seen.values()].sort((a, b) => b.duration - a.duration);
      // INP: the worst interaction, or near it (one in fifty is forgiven once there are many)
      const inp = all.length ? all[Math.min(all.length - 1, Math.floor(all.length / 50))].duration : null;
      return { inp, ok: inp == null ? null : inp <= BAR.inp, interactions: all.length, worst: all.slice(0, 5) };
    };
    window.__perfWatch.stop = () => po.disconnect();
    return 'watching: use the page, then __perfWatch.report()';
  };
})();
