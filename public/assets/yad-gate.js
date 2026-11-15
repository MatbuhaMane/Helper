/* "יד ביד" is locked behind the owner switch "yad". The server answers 404 to everyone but the owner while it is off; this is the
   same answer for the app: the tile, the links, the approval count and the pushes appear only when YadGate.on() is true.
   Use:  if (await YadGate.on()) { show the tile }   (one cheap call per page load, remembered for the session). */
(() => {
  let p = null;
  /* While the switch is off, everyone but the owner meets this instead of "not found": a small transparent panel in the glass of the
     tent panel on the home page, with what יד ביד is and "בקרוב!". Nothing is sent to the server. */
  const CSS = '.yd-soon{position:fixed;z-index:var(--z-float,60);inset-inline:0;margin-inline:auto;inset-block-start:34%;inline-size:min(320px,86vw);box-sizing:border-box;padding:18px 18px 16px;border-radius:22px;text-align:center;'
    + 'background:color-mix(in srgb,var(--card,#fff) 55%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid color-mix(in srgb,var(--line-strong,#8886) 60%,transparent);'
    + 'box-shadow:var(--lift,0 10px 30px #0003);color:var(--text,inherit);opacity:0;transform:translateY(8px);transition:opacity .25s ease-out,transform .25s ease-out}'
    + '.yd-soon.on{opacity:1;transform:none}.yd-soon h2{margin:0 0 8px;font-size:1.1rem}.yd-soon p{margin:0 0 12px;line-height:1.6}.yd-soon .yd-soon-b{font-weight:700;margin-block-end:14px}'
    + '.yd-soon button{min-block-size:44px;padding:0 22px;border-radius:999px;border:1px solid var(--line-strong,#8886);background:var(--primary,#4a6b3a);color:var(--primary-ink,#fff);font:inherit;font-weight:600;cursor:pointer}'
    + '@media (prefers-reduced-motion:reduce){.yd-soon{transition:none;transform:none}}';
  function soon() {
    if (document.querySelector('.yd-soon')) return;
    if (!document.getElementById('yd-soon-css')) { const s = document.createElement('style'); s.id = 'yd-soon-css'; s.textContent = CSS; document.head.append(s); }
    const d = document.createElement('div');
    d.className = 'yd-soon'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'יד ביד');
    const h = document.createElement('h2'); h.textContent = 'יד ביד';
    const a = document.createElement('p'); a.textContent = 'משפחה וחברים עוזרים זה לזה: נותנים יד, ומקבלים יד בחזרה. כל יד שניתנה חוזרת.';
    const b = document.createElement('p'); b.className = 'yd-soon-b'; b.textContent = 'בקרוב!';
    const x = document.createElement('button'); x.type = 'button'; x.textContent = 'סגירה';
    const esc = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { d.classList.remove('on'); document.removeEventListener('keydown', esc); setTimeout(() => d.remove(), 260); };
    x.onclick = close; document.addEventListener('keydown', esc);
    d.append(h, a, b, x); document.body.append(d); void d.offsetWidth; d.classList.add('on'); x.focus();
  }
  // a tap on any link to the tool: the owner (switch on) goes through, everyone else gets the panel
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="/tools/yad"]');
    if (!a || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.YadGate.on().then((on) => { if (on) location.href = a.getAttribute('href'); else soon(); });
  }, true);
  window.YadGate = {
    soon,
    on() {
      if (!p) p = fetch('/api/yad/status').then((r) => (r.ok ? r.json() : { on: false })).then((j) => j.on === true).catch(() => false);
      return p;
    },
  };
})();
