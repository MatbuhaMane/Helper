/* When the AI says no because an account's credit ran out (402 ai_credit_needed, server/credits.ts): not a broken button
   but an invitation – connect your own AI, or get credits, in הגדרות ← חיבור לשירותים. H.aiInvite() shows it once per
   page; common.js can call it from api() on that error, and any page may call it itself. */
(() => {
  if (!window.H || window.H.aiInvite) return;
  let shown = false;
  window.H.aiInvite = () => {
    if (shown) return;
    shown = true;
    const { el } = window.H;
    window.H.modal(el('div', { class: 'ai-invite' },
      el('h2', {}, 'העוזר החכם רוצה להמשיך'),
      el('p', {}, 'כדי להמשיך להשתמש ב־AI, חברו את השירות שלכם (Claude או Gemini), או הוסיפו קרדיט.'),
      el('div', { class: 'sky-acts' },
        el('a', { class: 'btn primary', href: '/settings/#services' }, 'לחיבור שירות'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { window.H.closeModal(); shown = false; } }, 'לא עכשיו'))));
  };
})();
