/* The back door's tab (ai-features). After the room (/admin/) was opened on this device from the owner's own account, a
   tab at the screen's edge on every other page leads back to it, like the music player's and the companion's tabs.
   - It shows only while the room's entry is still open on the server. GET /api/admin/room only reads: it never keeps the
     room open, so the three idle minutes go on as the owner's lock rule says ("stay unlocked": two hours at most).
   - It hides itself when the entry runs out, or when the room was locked (נעילה, which ends the entry on the server).
   - The mark that this device opened it is local only: localStorage 'helper.adminRoom' {ends}, written by admin.js. The
     shell (common.js) loads this file only when that mark is there, never on /admin/ itself, in the vault or in a frame.
   The look is design's (.ad-edge in base.css, which also hides it while [hidden]). */
(() => {
  const H = window.H;
  if (!H || document.querySelector('.ad-edge')) return;
  const KEY = 'helper.adminRoom';
  const forget = () => { try { localStorage.removeItem(KEY); } catch (_) { /* nothing kept */ } };
  let mark = null;
  try { mark = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { /* no mark */ }
  if (!mark || !(Number(mark.ends) > Date.now())) { forget(); return; }

  const tab = H.el('a', { class: 'ad-edge', href: '/admin/', hidden: true, title: 'הדלת האחורית פתוחה', 'aria-label': 'חזרה לדלת האחורית (פתוחה)' },
    H.el('span', { class: 'ad-edge-ic', 'aria-hidden': 'true' }, '🚪'), H.el('span', { class: 'ad-edge-text' }, 'דלת אחורית'));
  document.body.append(tab);
  /* the tab moves like the companion's and the music player's (the owner, 2026-11-15): drag it up or down, and let go near
     the other side to dock it there. Where it stands belongs to this device (localStorage). */
  const POS = 'helper.adminEdge';
  const rtl = () => getComputedStyle(document.documentElement).direction === 'rtl';
  const place = (s) => {
    tab.classList.toggle('end', s?.side === 'end');
    if (s && Number.isFinite(s.y)) tab.style.insetBlockStart = Math.max(60, Math.min(innerHeight - 90, s.y * innerHeight)) + 'px';
  };
  try { place(JSON.parse(localStorage.getItem(POS) || 'null')); } catch (_) { /* its own place */ }
  let dragged = false;
  tab.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const x0 = e.clientX, y0 = e.clientY, r = tab.getBoundingClientRect(), oy = e.clientY - r.top;
    let moved = false, spot = null;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
      if (!moved) { moved = true; tab.classList.add('dragging'); try { tab.setPointerCapture(ev.pointerId); } catch (_) { /* the moves still come */ } }
      const right = ev.clientX > innerWidth / 2;               // the screen's right half: that edge
      spot = { side: right === rtl() ? 'start' : 'end', y: (ev.clientY - oy) / innerHeight };
      place(spot);
    };
    const up = () => {
      tab.removeEventListener('pointermove', move); tab.removeEventListener('pointerup', up); tab.removeEventListener('pointercancel', up);
      tab.classList.remove('dragging');
      if (!moved) return;
      dragged = true; setTimeout(() => { dragged = false; }, 0);   // the click that follows a drag does not follow the link
      try { localStorage.setItem(POS, JSON.stringify(spot)); } catch (_) { /* it stays for now */ }
    };
    tab.addEventListener('pointermove', move); tab.addEventListener('pointerup', up); tab.addEventListener('pointercancel', up);
  });
  tab.addEventListener('click', (e) => { if (dragged) e.preventDefault(); });

  let timer = 0;
  async function check() {
    clearTimeout(timer);
    let r;
    try { r = await H.api('/api/admin/room', { noRedirect: true }); }
    catch (e) { tab.hidden = true; if (!e?.offline) forget(); return; }          // signed out or refused: no tab; offline: ask again later
    if (!r.open) { tab.hidden = true; forget(); return; }
    tab.hidden = false;
    timer = setTimeout(check, Math.max(5e3, Number(r.left) + 1e3));                // when it would close, ask again (an action there may have kept it)
  }
  check();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
