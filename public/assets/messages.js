/* Messages from the owner to everyone (sent from the owner's room, server/admin.ts): shown on any page for a signed-in
   member, until they close it or it ends. Loaded once per page (common.js loads it after sign-in).
   They float at the bottom, above the tab bar, rather than at the top of the page: arriving after the page is drawn,
   a banner at the top pushed everything down – a layout shift of ~0.21 on every page, twice the readiness bar's 0.1
   (docs/vision/ready.md). A floating card moves nothing. The look is design's to refine (.owner-msgs, .owner-msg). */
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
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stack = el('div', { class: 'owner-msgs', role: 'region', 'aria-label': 'הודעות מהאוהל',
      style: 'position:fixed;z-index:900;inset-inline:12px;inset-block-end:calc(var(--tabbar-h, 0px) + env(safe-area-inset-bottom) + 12px);max-inline-size:560px;margin-inline:auto;display:grid;gap:8px;pointer-events:none' });
    const gone = () => { if (!stack.childElementCount) stack.remove(); };
    for (const m of list) {
      const box = el('div', { class: 'notice owner-msg ' + (m.level === 'warn' ? 'warn' : ''), role: 'status',
        style: 'pointer-events:auto;display:flex;align-items:center;gap:8px;box-shadow:0 8px 28px rgb(0 0 0 / .18)' },
        el('span', { 'aria-hidden': 'true' }, LEVEL[m.level] || LEVEL.info),
        el('span', { style: 'flex:1;min-inline-size:0' }, m.link ? el('a', { href: m.link }, m.text) : m.text),
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
