/* סידור המייל: מסבירים במילים מה רוצים, העוזר מציע תוכנית, מראה דוגמאות ומבקש אישור לפני כל שינוי.
 * שום מייל לא נמחק אף פעם. כל שינוי נרשם וניתן לביטול. */
(async () => {
  'use strict';
  const { el, api, toast } = H;
  H.header('סידור המייל', '📬');
  await H.requireLogin();
  const root = document.getElementById('root');
  const ACTION_HE = { label: 'תווית', unlabel: 'הסרת תווית', archive: 'ארכיון', mark_read: 'סימון כנקרא', star: 'כוכב', review_delete: 'לבדיקה לפני מחיקה' };
  const IDEAS = [
    'תסדר לי את כל החשבונות (חשמל, מים, ארנונה, טלפון) בתיקייה אחת',
    'תעביר לארכיון את כל הפרסומות מלפני חצי שנה',
    'מה הכי ממלא לי את תיבת הדואר?',
    'תסמן כנקרא את כל הניוזלטרים',
    'אני רוצה למחוק מיילים ישנים של חנויות',
  ];
  let history = [];

  const status = await api('/api/mail/status');
  if (!status.connected) return renderConnect();
  renderMain();

  function renderConnect() {
    root.textContent = '';
    root.append(el('div', { class: 'card', style: 'padding:22px' },
      el('h2', { style: 'margin-top:0' }, 'לחבר את הג׳ימייל'),
      el('p', {}, 'העוזר יוכל לקרוא את רשימת המיילים שלך ולסדר אותם – רק אחרי שתראי מה הוא מציע ותאשרי.'),
      el('ul', {},
        el('li', {}, '🛡 שום מייל לא נמחק אף פעם. כשמבקשים למחוק – המיילים עוברים לתווית "לבדיקה לפני מחיקה".'),
        el('li', {}, '↩️ כל שינוי נשמר, ואפשר לבטל אותו בלחיצה.'),
        el('li', {}, '🔒 אפשר לנתק את החיבור בכל רגע.')),
      el('a', { class: 'btn primary big', href: '/api/auth/login?gmail=1&next=/mail/' }, 'חיבור ג׳ימייל')));
  }

  function renderMain() {
    root.textContent = '';
    const chat = el('div', { class: 'chat', id: 'chat' });
    const input = el('textarea', { rows: 3, placeholder: 'כתבי במילים שלך מה לסדר… למשל: "תעשה סדר בכל המיילים מהבנק"' });
    const send = el('button', { class: 'btn primary big', onclick: () => ask(input.value) }, 'שלחי ✨');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask(input.value); });
    root.append(
      el('div', { class: 'notice', style: 'margin-top:14px' }, '🛡 העוזר אף פעם לא מוחק מיילים, ושום דבר לא משתנה בלי האישור שלך. כל שינוי אפשר לבטל.'),
      chat,
      el('div', { class: 'card ask', 'data-guide': 'mail-request', 'data-guide-label': 'כאן כותבים מה לסדר במייל' }, input,
        el('div', { class: 'ideas' }, IDEAS.map((t) => el('button', { class: 'chip', onclick: () => { input.value = t; input.focus(); } }, t))),
        el('div', { class: 'row' }, send, el('span', { class: 'spacer' }),
          el('button', { class: 'btn ghost small', onclick: showHistory }, '🕘 שינויים קודמים וביטול'),
          el('a', { class: 'btn ghost small', href: 'https://takeout.google.com/settings/takeout/custom/gmail', target: '_blank', rel: 'noopener' }, '💾 גיבוי מלא של הג׳ימייל'),
          el('button', { class: 'btn ghost small', onclick: async () => {
            if (!confirm('לנתק את הג׳ימייל מהעוזר?')) return;
            await api('/api/mail/disconnect', { method: 'POST' });
            renderConnect();
          } }, 'ניתוק'))));
    bubble('ai', 'שלום! אני כאן כדי לעשות סדר בתיבת הדואר. ספרי לי מה מפריע לך או מה תרצי לסדר, ואני אראה לך בדיוק מה אני מציע לפני שאני נוגע במשהו.');
    input.focus();
    // A plan the daemon prepared: show it here for approval.
    const fromDaemon = /plan=([\w-]+)/.exec(location.hash)?.[1];
    if (fromDaemon) {
      api('/api/mail/plans/' + fromDaemon).then((p) => {
        if (p.status !== 'proposed') return;
        bubble('me', p.request);
        bubble('ai', p.reply);
        chat.append(planCard(p));
        history.push({ role: 'user', text: p.request }, { role: 'assistant', text: p.reply });
      }).catch(() => {});
    }

    async function ask(text) {
      text = text.trim();
      if (!text) return;
      input.value = '';
      bubble('me', text);
      const wait = bubble('ai', '⏳ מסתכל על תיבת הדואר וחושב…');
      send.disabled = true;
      try {
        const plan = await api('/api/mail/plan', { body: { request: text, history } });
        history.push({ role: 'user', text }, { role: 'assistant', text: plan.reply });
        wait.remove();
        bubble('ai', plan.reply);
        if (plan.operations.length) chat.append(planCard(plan));
      } catch (e) {
        wait.remove();
        if (e.code === 'gmail_not_connected') return renderConnect();
        bubble('ai', '😕 ' + e.message);
      } finally {
        send.disabled = false;
        chat.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function bubble(who, text) {
      const b = el('div', { class: 'bubble ' + who, dir: 'auto' }, text);
      chat.append(b);
      return b;
    }
  }

  function planCard(plan) {
    const boxes = [];
    const card = el('div', { class: 'card', style: 'padding:14px' }, el('h3', { style: 'margin:0 0 4px' }, '📝 מה אני מציע לעשות'),
      el('p', { class: 'muted', style: 'margin:0' }, 'סמני רק את מה שמתאים לך. אפשר לבטל אחר כך.'));
    plan.operations.forEach((op, i) => {
      const cb = el('input', { type: 'checkbox', checked: op.estimatedChanges > 0 });
      boxes.push(cb);
      const count = op.estimatedChanges === 0 ? 'אין מה לשנות – כבר מסודר' : `בערך ${op.estimatedChanges}${op.more ? '+' : ''} מיילים`;
      card.append(el('div', { class: 'op' },
        el('label', { class: 'head' }, cb, el('span', {}, op.title, el('br'), el('span', { class: 'count' }, `${ACTION_HE[op.action]}${op.label ? ` "${op.label}"` : ''} · ${count}`))),
        op.samples.length ? el('ul', {}, op.samples.map((s) => el('li', { dir: 'auto' }, `${shortFrom(s.from)} — ${s.subject || '(ללא נושא)'}`))) : null,
        el('details', {}, el('summary', {}, 'פרטים טכניים'), 'חיפוש: ', el('code', {}, op.query))));
    });
    const bar = el('div', { class: 'progress', hidden: true }, el('i'));
    const msg = el('p', { class: 'muted', style: 'margin:6px 0' });
    const go = el('button', { class: 'btn primary big', onclick: () => apply() }, '✅ מאשרת, תסדר');
    const no = el('button', { class: 'btn ghost', onclick: async () => { await api(`/api/mail/plans/${plan.id}/cancel`, { method: 'POST' }); card.remove(); toast('בוטל – לא שיניתי כלום'); } }, 'לא עכשיו');
    card.append(bar, msg, el('div', { class: 'row' }, go, no));

    async function apply() {
      const enabled = boxes.map((b, i) => (b.checked ? i : -1)).filter((i) => i >= 0);
      if (!enabled.length) return toast('לא נבחר שום שלב');
      go.disabled = no.disabled = true;
      boxes.forEach((b) => { b.disabled = true; });
      bar.hidden = false;
      let cursor;
      let total = 0;
      const planned = enabled.reduce((s, i) => s + Math.max(1, plan.operations[i].estimatedChanges), 0);
      try {
        for (;;) {
          const r = await api(`/api/mail/plans/${plan.id}/step`, { body: { enabled, cursor } });
          if (r.done) break;
          total += r.changed;
          cursor = r.cursor;
          bar.firstChild.style.width = Math.min(98, (total / planned) * 100) + '%';
          msg.textContent = `מסדר… ${total} מיילים עד עכשיו (שלב ${Math.min(cursor.op + 1, enabled.length)} מתוך ${enabled.length})`;
        }
        bar.firstChild.style.width = '100%';
        msg.textContent = `✓ סיימתי! סידרתי ${total} מיילים.`;
        go.replaceWith(el('button', { class: 'btn ghost', onclick: () => undo(plan.id, msg) }, '↩️ בטל את השינויים האלה'));
        no.remove();
      } catch (e) {
        msg.textContent = `נעצרתי באמצע (${total} מיילים סודרו). ${e.message} אפשר ללחוץ שוב כדי להמשיך, או לבטל מההיסטוריה.`;
        go.disabled = false;
        go.textContent = 'להמשיך';
        go.onclick = null;
        go.addEventListener('click', () => apply(), { once: true });
      }
    }
    return card;
  }

  async function undo(id, msgEl) {
    if (!confirm('להחזיר את המיילים בדיוק למצב שהיו בו לפני השינוי?')) return;
    try {
      const r = await api(`/api/mail/plans/${id}/undo`, { method: 'POST' });
      (msgEl || {}).textContent = `↩️ בוטל – ${r.restored} מיילים חזרו למקום.`;
      toast(`בוטל – ${r.restored} מיילים חזרו למקום`);
    } catch (e) { toast(e.message); }
  }

  async function showHistory() {
    H.modal(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), 'טוען…'));
    const { plans } = await api('/api/mail/history');
    H.modal(el('h3', {}, '🕘 שינויים קודמים'),
      plans.length ? el('ul', { class: 'hist' }, plans.map((p) => el('li', {},
        el('div', { dir: 'auto' }, el('b', {}, `"${p.request}"`)),
        el('small', { class: 'muted' }, new Date(p.applied_at || p.created_at).toLocaleString('he-IL'), ' · ', p.status === 'undone' ? 'בוטל' : 'בוצע'),
        el('div', { class: 'muted', style: 'font-size:.85rem' }, p.titles.join(' · ')),
        p.status !== 'undone' ? el('button', { class: 'btn ghost small', onclick: async () => { await undo(p.id); showHistory(); } }, '↩️ ביטול') : null)))
        : el('p', {}, 'עוד לא בוצעו שינויים.'));
  }

  function shortFrom(from) {
    const m = /^"?([^"<]+)"?\s*</.exec(from || '');
    return (m ? m[1] : from || '').trim();
  }
})();
