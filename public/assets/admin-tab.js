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
