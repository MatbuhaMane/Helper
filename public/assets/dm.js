/* Messages between members (server/dm.ts), on every page: the inbox in the top bar and the "הודעות" entry with its count
   in the tools menu, when a conversation waits. Polls /api/dm/unread once a minute while the page is in front (no sockets).
   Loaded by the shell once someone is signed in (common.js), like reports.js.   H.dmUnread(n): the messages page tells it at once.
   The inbox (the owner, 2026-11-13): an empty link, a.dm-inbox, next to the red triangle and the user chip (inbox, triangle,
   chip, whichever loads first); it opens /messages/. The unread count is data-count on it (none when there is nothing),
   and the aria-label says it. The look is design's (.dm-inbox, 44×44, the icon and the count drawn in CSS). It took over
   the dot on the user chip: one sign, in one place. */
(() => {
  if (!window.H || window.H.dmUnread) return;
  const H = window.H, { el, api } = H;
  let unread = 0;

  /** the inbox in the top bar, before the triangle (or the chip); null when the page has no top bar */
  function inbox() {
    const there = document.querySelector('.dm-inbox');
    if (there) return there;
    const chip = document.getElementById('userchip');
    if (!chip) return null;
    const a = el('a', { class: 'dm-inbox', href: '/messages/', title: 'הודעות', 'aria-label': 'הודעות' });
    if (location.pathname.startsWith('/messages')) a.setAttribute('aria-current', 'page');
    (document.querySelector('.rp-alert') || chip).before(a);
    return a;
  }
  function set(n) {
    unread = Math.max(0, Number(n) || 0);
    const a = inbox();
    if (a) {
      if (unread) a.dataset.count = unread > 99 ? '99+' : String(unread); else delete a.dataset.count;
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
