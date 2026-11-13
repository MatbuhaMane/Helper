/* Messages between members (server/dm.ts), on every page: the inbox in the top bar and the "הודעות" entry with its count
   in the tools menu, when a conversation waits. Polls /api/dm/unread once a minute while the page is in front (no sockets).
   Loaded by the shell once someone is signed in (common.js), like reports.js.   H.dmUnread(n): the messages page tells it at once.
   The inbox (the owner, 2026-11-13): an empty button, button.dm-inbox, between the red triangle and the user chip
   (triangle, inbox, chip, whichever loads first: reports.js puts the triangle before it); it opens /messages/. When a
   conversation waits, span.dm-dot is inside it and the aria-label says how many; aria-current="page" on /messages/.
   The look is design's (base.css, 114e603: the envelope, 44×44, paired with the triangle; the dot on its corner). */
(() => {
  if (!window.H || window.H.dmUnread) return;
  const H = window.H, { el, api } = H;
  let unread = 0;

  /** the inbox in the top bar, before the chip (and before the music pill): triangle, inbox, pill, chip; null with no top bar */
  function inbox() {
    const there = document.querySelector('.dm-inbox');
    if (there) return there;
    const chip = document.getElementById('userchip');
    if (!chip) return null;
    const a = el('button', { class: 'dm-inbox', type: 'button', title: 'הודעות', 'aria-label': 'הודעות', onclick: () => { location.href = '/messages/'; } });
    if (location.pathname.startsWith('/messages')) a.setAttribute('aria-current', 'page');
    (document.querySelector('.mu-menu') || chip).before(a);           // (the music pill, when it is there, stays by the chip)
    return a;
  }
  function set(n) {
    unread = Math.max(0, Number(n) || 0);
    const a = inbox();
    if (a) {
      let dot = a.querySelector('.dm-dot');
      if (unread && !dot) a.append(el('span', { class: 'dm-dot', 'aria-hidden': 'true' }));
      if (!unread && dot) dot.remove();
      const label = unread ? `הודעות, ${unread === 1 ? 'שיחה אחת מחכה' : `${unread} שיחות מחכות`}` : 'הודעות';
      a.setAttribute('aria-label', label); a.title = label;
    }
    for (const c of document.querySelectorAll('.dm-entry .mi-count')) { c.textContent = unread || ''; c.hidden = !unread; }
  }
  async function refresh() {
    if (document.visibilityState !== 'visible') return;
    try { set((await api('/api/dm/unread', { noRedirect: true })).unread); } catch (_) { /* offline or locked: the dot waits */ }
  }
  H.dmUnread = set;
  H.dmRefresh = refresh;

  // the tools menu: an entry at its foot (common.js draws the menu when it opens)
  const entry = () => el('a', { class: 'rp-entry dm-entry', href: '/messages/' }, el('span', { class: 'rp-entry-ic', 'aria-hidden': 'true' }),
    el('span', {}, el('b', {}, 'הודעות'), el('small', {}, 'שיחה עם בני המשפחה')), el('span', { class: 'mi-count', hidden: !unread }, unread || ''));
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.id === 'navmenu-tools' && !n.querySelector('.dm-entry')) n.prepend(el('div', { class: 'navmenu-reports' }, entry()));
    }
  }).observe(document.body, { childList: true });

  inbox();
  refresh();
  setInterval(refresh, 60_000);
  document.addEventListener('visibilitychange', refresh);
})();
