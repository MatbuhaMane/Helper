/* Messages between members (server/dm.ts), on every page: the dot on the user chip and the "הודעות" entry with its count
   in the tools menu, when a conversation waits. Polls /api/dm/unread once a minute while the page is in front (no sockets).
   Loaded by the shell once someone is signed in (common.js), like reports.js. Its own dot (.dm-dot), so reports.js,
   which clears .mi-dot, never takes it away.   H.dmUnread(n): the messages page tells it at once. */
(() => {
  if (!window.H || window.H.dmUnread) return;
  const H = window.H, { el, api } = H;
  let unread = 0;

  function set(n) {
    unread = n || 0;
    const chip = document.getElementById('userchip');
    if (chip) {
      let dot = chip.querySelector('.dm-dot');
      if (unread && !dot) chip.append(dot = el('span', { class: 'dm-dot', 'aria-hidden': 'true' }));
      if (!unread && dot) dot.remove();
      chip.toggleAttribute('data-dm', !!unread);
      if (unread) chip.title = 'הודעה חדשה';
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

  refresh();
  setInterval(refresh, 60_000);
  document.addEventListener('visibilitychange', refresh);
})();
