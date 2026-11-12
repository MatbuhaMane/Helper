/* Messages from the owner to everyone (sent from the owner's room, server/admin.ts): shown at the top of any page for a
   signed-in member, until they close it or it ends. Loaded once per page (common.js can load it after sign-in). */
(() => {
  if (window.__haohelMessages || document.body?.dataset.vault === '1') return;      // once; never next to the vault
  window.__haohelMessages = true;
  const LEVEL = { info: '💬', party: '🎉', warn: '⚠️' };
  async function show() {
    let list = [];
    try { const r = await fetch('/api/messages', { credentials: 'same-origin' }); if (!r.ok) return; list = (await r.json()).messages || []; } catch (_) { return; }
    if (!list.length) return;
    const { el } = window.H || {};
    if (!el) return;
    const main = document.querySelector('main') || document.body;
    for (const m of list.slice().reverse()) {
      const box = el('div', { class: 'notice owner-msg ' + (m.level === 'warn' ? 'warn' : ''), role: 'status' },
        el('span', { 'aria-hidden': 'true' }, (LEVEL[m.level] || LEVEL.info) + ' '),
        m.link ? el('a', { href: m.link }, m.text) : el('span', {}, m.text),
        el('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'סגירת ההודעה', style: 'margin-inline-start:8px',
          onclick: () => { box.remove(); fetch(`/api/messages/${encodeURIComponent(m.id)}/read`, { method: 'POST', credentials: 'same-origin' }).catch(() => {}); } }, '✕'));
      box.style.marginBlock = '10px';
      main.prepend(box);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
