/* Messages from the owner to everyone (sent from the owner's room, server/admin.ts): shown on any page for a signed-in
   member, until they close it or it ends. Loaded once per page (common.js loads it after sign-in).
   They float at the bottom, above the tab bar, rather than at the top of the page: arriving after the page is drawn,
   a banner at the top pushed everything down – a layout shift of ~0.21 on every page, twice the readiness bar's 0.1
   (docs/vision/ready.md). A floating card moves nothing. The look is design's (.owner-msgs, .owner-msg.<level>, in base.css). */
(() => {
  if (window.__haohelMessages || document.body?.dataset.vault === '1') return;      // once; never next to the vault
  window.__haohelMessages = true;
  const LEVELS = new Set(['info', 'party', 'warn']);   // (each drawn in CSS: no emoji, the owner's decision)
  async function show() {
    let list = [];
    try { const r = await fetch('/api/messages', { credentials: 'same-origin' }); if (!r.ok) return; list = (await r.json()).messages || []; } catch (_) { return; }
    if (!list.length) return;
    const { el } = window.H || {};
    if (!el) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // (the look, the place above the tab bar or the cart button, and each level's drawn mark are design's, in base.css)
    const stack = el('div', { class: 'owner-msgs', role: 'region', 'aria-label': 'הודעות מהאוהל' });
    const gone = () => { if (!stack.childElementCount) stack.remove(); };
    for (const m of list) {
      const box = el('div', { class: 'notice owner-msg ' + (LEVELS.has(m.level) ? m.level : 'info'), role: 'status' },
        el('span', { class: 'owner-msg-ico', 'aria-hidden': 'true' }),
        el('span', {}, m.link ? el('a', { href: m.link }, m.text) : m.text),
        el('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'סגירת ההודעה',
          onclick: () => { box.remove(); gone(); fetch(`/api/messages/${encodeURIComponent(m.id)}/read`, { method: 'POST', credentials: 'same-origin' }).catch(() => {}); } }, '✕'));
      stack.append(box);
    }
    document.body.append(stack);
    // in from below (a transform: nothing on the page moves; should it not run, the card is simply there)
    if (!still) stack.querySelectorAll('.owner-msg').forEach((b, i) => b.animate?.([{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, delay: i * 60, easing: 'ease-out', fill: 'backwards' }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
