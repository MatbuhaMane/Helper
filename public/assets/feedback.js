/* Feedback to the owner (the family batch): H.feedback() opens a short form; what is written lands in the inbox in the
   owner's room (POST /api/feedback, server/admin.ts). The companion can pass feedback on too (its send_feedback tool).
   Any button may call it: await H.loadOnce('/assets/feedback.js'); H.feedback(); */
(() => {
  if (!window.H || window.H.feedback) return;
  const { el } = window.H;
  function feedback() {
    const text = el('textarea', { id: 'fb-text', rows: 4, maxlength: 2000, dir: 'auto', 'aria-labelledby': 'fb-h',
      placeholder: 'משהו לא עובד? רעיון? משהו שאהבת? אפשר לכתוב הכל.', style: 'inline-size:100%;font:inherit;padding:10px 12px;border-radius:12px;border:1px solid var(--line-strong);background:var(--bg);color:var(--text)' });
    const send = el('button', { class: 'btn primary', type: 'button', onclick: async () => {
      const t = text.value.trim();
      if (!t) return text.focus();
      send.disabled = true;
      try {
        await window.H.api('/api/feedback', { body: { text: t, page: location.pathname }, noRedirect: true });
        window.H.closeModal();
        window.H.toast('תודה! זה הגיע לבעלים של האוהל.');
      } catch (e) {
        send.disabled = false;
        window.H.toast(e.status === 429 ? 'נשלחו היום הרבה פניות. אפשר לשלוח שוב מחר.' : 'לא הצלחתי לשלוח. נסו שוב בעוד רגע.');
      }
    } }, 'שליחה');
    window.H.modal(el('h2', { id: 'fb-h' }, 'משוב לאוהל'),
      el('p', { class: 'muted small' }, 'מגיע ישר לבעלים של האוהל. אפשר גם לספר לעוזר, והוא יעביר.'),
      text, el('div', { class: 'row' }, send, el('button', { class: 'btn ghost', type: 'button', onclick: () => window.H.closeModal() }, 'ביטול')));
    setTimeout(() => text.focus(), 30);
  }
  Object.assign(window.H, { feedback });
})();
