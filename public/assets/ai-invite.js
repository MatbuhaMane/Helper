/* When the AI says no because an account's credit ran out (402 ai_credit_needed, server/credits.ts): not a broken button
   but an invitation – connect a free helper from Google (Gemini), in three steps, right here. H.aiInvite() shows it once
   per page; common.js calls it from api() on that error, and any page may call it itself.
   H.geminiGuide(onDone) is the guide itself (settings ← חיבור לשירותים opens it too): Google's page opens in a new tab,
   and when the person comes back we offer to paste what they copied, check it with Google (PUT /api/me/ai/keys) and
   connect. If the browser will not let us read the clipboard, one paste field. Claude stays the advanced option, in
   settings. The look is design's: .gm-guide, .gm-steps > li.gm-step (.gm-art, .gm-text), .gm-paste, .gm-done. */
(() => {
  if (!window.H || window.H.aiInvite) return;
  const H = window.H, { el } = H;
  const GOOGLE = 'https://aistudio.google.com/apikey';
  const ERR = { bad_key: 'זה לא נראה כמו המפתח. העתיקו אותו שוב, את כולו.', key_refused: 'Google לא קיבלה את המפתח. נסו ליצור מפתח חדש.',
    too_many_tries: 'יותר מדי ניסיונות. נסו שוב בעוד שעה.' };
  const looksRight = (s) => /^AIza[\w-]{30,}$/.test(s);

  // three small drawings (currentColor, so they follow the theme): a sign-in, the button to press, copy and come back
  const ART = [
    '<svg viewBox="0 0 96 64" width="96" height="64" aria-hidden="true"><rect x="4" y="6" width="88" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M4 16h88" stroke="currentColor" stroke-width="2.5"/><circle cx="12" cy="11" r="1.8" fill="currentColor"/><circle cx="19" cy="11" r="1.8" fill="currentColor"/><circle cx="48" cy="31" r="7" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M35 50c2-7 8-10 13-10s11 3 13 10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
    '<svg viewBox="0 0 96 64" width="96" height="64" aria-hidden="true"><rect x="4" y="6" width="88" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M4 16h88" stroke="currentColor" stroke-width="2.5"/><path d="M14 26h34M14 34h24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity=".45"/><rect x="54" y="38" width="30" height="11" rx="5.5" fill="currentColor"/><path d="M70 44l6 12 2-5 5-2z" fill="var(--paper, #fff)" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    '<svg viewBox="0 0 96 64" width="96" height="64" aria-hidden="true"><rect x="10" y="14" width="26" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/><rect x="17" y="8" width="26" height="32" rx="4" fill="var(--paper, #fff)" stroke="currentColor" stroke-width="2.5"/><path d="M50 30h26m0 0l-7-7m7 7l-7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" transform="rotate(180 63 30)"/><path d="M70 50l10-14 10 14z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  ];
  const art = (i) => el('span', { class: 'gm-art', html: ART[i] });

  /** the three steps; onDone runs once Gemini is connected */
  H.geminiGuide = (onDone) => {
    let left = false;   // the person went to Google's page (so their coming back is the moment to offer the paste)
    const body = el('div', { class: 'gm-body' });
    const box = el('section', { class: 'gm-guide', 'aria-labelledby': 'gm-h' }, el('h2', { id: 'gm-h' }, 'חיבור עוזר חינמי'), body);
    const close = () => { document.removeEventListener('visibilitychange', back); H.closeModal(); };

    const connect = async (key, btn) => {
      key = (key || '').trim();
      if (!looksRight(key)) throw Object.assign(new Error(ERR.bad_key), { code: 'bad_key' });
      if (btn) btn.disabled = true;
      try { await H.api('/api/me/ai/keys', { method: 'PUT', body: { provider: 'gemini', key } }); } finally { if (btn) btn.disabled = false; }
      done();
    };
    const done = () => {
      document.removeEventListener('visibilitychange', back);
      body.replaceChildren(el('div', { class: 'gm-done', role: 'status' },
        el('p', { class: 'gm-ok' }, 'Gemini מחובר ✓'),
        el('p', {}, 'העוזר החכם ממשיך לעבוד, בחינם, דרך החשבון שלך ב־Google.'),
        el('div', { class: 'sky-acts' }, el('button', { class: 'btn primary', type: 'button', onclick: () => { close(); onDone?.(); } }, 'מעולה'))));
    };
    /** one field to paste into, when the browser keeps the clipboard to itself (or what was copied was something else) */
    const field = (why) => {
      const input = el('input', { type: 'text', dir: 'ltr', autocomplete: 'off', spellcheck: 'false', placeholder: 'AIza…', 'aria-label': 'הדביקו כאן את מה שהעתקתם' });
      const msg = el('p', { class: 'muted small', role: 'alert' }, why || '');
      const form = el('form', { class: 'gm-paste', onsubmit: async (e) => {
        e.preventDefault();
        try { await connect(input.value, e.target.querySelector('button')); } catch (err) { msg.textContent = ERR[err.code] || err.message || 'זה לא הצליח. נסו שוב.'; }
      } }, el('label', {}, 'הדביקו כאן את מה שהעתקתם', input), el('button', { class: 'btn primary' }, 'חיבור'), msg);
      return form;
    };
    /** back from Google: "להדביק את המפתח?" – a tap reads the clipboard (a tap is what lets the browser allow it) */
    const offer = () => {
      const msg = el('p', { class: 'muted small', role: 'alert' });
      const slot = el('div', {});
      const yes = el('button', { class: 'btn primary', type: 'button', onclick: async () => {
        let text = '';
        try { text = await navigator.clipboard.readText(); } catch (_) { return slot.replaceChildren(field('הדפדפן לא נתן לי לקרוא את ההעתקה. הדביקו כאן (לחיצה ארוכה ← הדבק).')); }
        if (!looksRight(text.trim())) return slot.replaceChildren(field('לא מצאתי מפתח במה שהועתק. העתיקו אותו שוב ב־Google, או הדביקו כאן.'));
        try { await connect(text, yes); } catch (err) { msg.textContent = ERR[err.code] || err.message || 'זה לא הצליח. נסו שוב.'; }
      } }, 'כן, להדביק');
      body.replaceChildren(el('div', { class: 'gm-back' },
        el('p', { class: 'gm-q' }, 'חזרת. להדביק את המפתח?'),
        el('p', { class: 'muted small' }, 'נבדוק אותו מול Google, והוא יישמר מוצפן, רק לבקשות שלך.'),
        el('div', { class: 'sky-acts' }, yes,
          el('button', { class: 'btn ghost', type: 'button', onclick: () => slot.replaceChildren(field()) }, 'אדביק בעצמי'),
          el('a', { class: 'btn ghost', href: GOOGLE, target: '_blank', rel: 'noopener', onclick: () => { left = true; } }, 'חזרה ל־Google')),
        msg, slot));
    };
    function back() { if (left && document.visibilityState === 'visible' && document.body.contains(box)) { left = false; offer(); } }
    document.addEventListener('visibilitychange', back);

    body.replaceChildren(
      el('p', {}, 'Google נותנת עוזר חכם בחינם (Gemini). מחברים אותו פעם אחת, בדקה:'),
      el('ol', { class: 'gm-steps' },
        el('li', { class: 'gm-step' }, art(0), el('div', { class: 'gm-text' }, el('b', {}, 'נכנסים ל־Google'), el('span', {}, 'עם החשבון הרגיל שלכם. הדף נפתח בלשונית חדשה.'))),
        el('li', { class: 'gm-step' }, art(1), el('div', { class: 'gm-text' }, el('b', {}, 'לוחצים על הכפתור הכחול ליצירת מפתח'), el('span', {}, 'אם שואלים על פרויקט, בוחרים את מה שמוצע.'))),
        el('li', { class: 'gm-step' }, art(2), el('div', { class: 'gm-text' }, el('b', {}, 'מעתיקים וחוזרים לכאן'), el('span', {}, 'לוחצים "העתק" ליד הקוד שנוצר, וחוזרים לאוהל. אנחנו נדביק.')))),
      el('div', { class: 'sky-acts' },
        el('a', { class: 'btn primary', href: GOOGLE, target: '_blank', rel: 'noopener', onclick: () => { left = true; } }, 'קבל מפתח חינמי מ־Google'),
        el('button', { class: 'btn ghost', type: 'button', onclick: offer }, 'כבר העתקתי'),
        el('button', { class: 'btn ghost', type: 'button', onclick: close }, 'לא עכשיו')));
    H.modal(box);
  };

  let shown = false;
  H.aiInvite = () => {
    if (shown) return;
    shown = true;
    // (credit is offered only while the shop is open: the owner's switch, money.shop_open, from /api/me)
    const more = el('p', { class: 'muted small' }, 'למתקדמים: אפשר לחבר גם Claude, בהגדרות ← חיבור לשירותים.');
    H.me?.().then((r) => { if (r?.shop) more.textContent = 'למתקדמים: אפשר לחבר Claude, או להוסיף קרדיט, בהגדרות ← חיבור לשירותים.'; }).catch(() => {});
    H.modal(el('div', { class: 'ai-invite' },
      el('h2', {}, 'העוזר החכם רוצה להמשיך'),
      el('p', {}, 'מתנת הפתיחה נגמרה. אפשר להמשיך בחינם: מחברים עוזר חינמי מ־Google, בשלושה צעדים קטנים.'),
      el('div', { class: 'sky-acts' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => { H.closeModal(); H.geminiGuide(); } }, 'חבר עוזר חינמי'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { H.closeModal(); shown = false; } }, 'לא עכשיו')),
      more,
      el('a', { class: 'small', href: '/settings/#services' }, 'להגדרות')));
  };
})();
