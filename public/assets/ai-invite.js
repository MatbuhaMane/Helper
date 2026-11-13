/* When the AI says no because an account's credit ran out (402 ai_credit_needed, server/credits.ts): not a broken button
   but an invitation – connect a free helper from Google (Gemini), in three steps, right here. H.aiInvite() shows it once
   per page; common.js calls it from api() on that error, and any page may call it itself.
   H.geminiGuide(onDone) is the guide itself (settings ← חיבור לשירותים opens it too): Google's page opens in a new tab,
   and when the person comes back we offer to paste what they copied, check it with Google (PUT /api/me/ai/keys) and
   connect. If the browser will not let us read the clipboard, one paste field. Claude stays the advanced option, in
   settings. The look is design's .gk (base.css, db03b95); the paste field is form.gk-paste, between the steps and .gk-err. */
(() => {
  if (!window.H || window.H.aiInvite) return;
  const H = window.H, { el } = H;
  const GOOGLE = 'https://aistudio.google.com/apikey';
  const ERR = { bad_key: 'זה לא נראה כמו המפתח. העתיקו אותו שוב, את כולו.', key_refused: 'Google לא קיבלה את המפתח. נסו ליצור מפתח חדש.',
    too_many_tries: 'יותר מדי ניסיונות. נסו שוב בעוד שעה.' };
  const looksRight = (s) => /^AIza[\w-]{30,}$/.test(s);

  /** the three steps, in design's .gk (db03b95: the drawings and numbers come from the CSS, by data-pic; only the
      current step, aria-current="step", shows its button; a finished one has data-done); onDone runs once connected */
  H.geminiGuide = (onDone) => {
    let left = false;   // the person went to Google's page (so their coming back is the moment to offer the paste)
    const err = el('p', { class: 'gk-err', role: 'alert', hidden: true });
    const fail = (e) => { err.textContent = ERR[e?.code] || e?.message || 'המפתח לא עבד. נסו להעתיק שוב.'; err.hidden = false; };
    const steps = [];
    const at = (n) => {   // step n is the current one; the ones before it are done
      steps.forEach((li, i) => {
        if (i + 1 === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        if (i + 1 < n) li.setAttribute('data-done', ''); else li.removeAttribute('data-done');
      });
      steps[n - 1]?.querySelector('.gk-go')?.focus({ preventScroll: true });
    };
    const step = (pic, title, small, go) => {
      const li = el('li', { class: 'gk-step', 'data-pic': pic }, el('span', { class: 'gk-pic', 'aria-hidden': 'true' }),
        el('div', { class: 'gk-txt' }, el('b', {}, title), el('small', {}, small)), go);
      steps.push(li);
      return li;
    };
    const connect = async (key, btn) => {
      key = (key || '').trim();
      if (!looksRight(key)) throw Object.assign(new Error(ERR.bad_key), { code: 'bad_key' });
      err.hidden = true;
      if (btn) btn.disabled = true;
      try { await H.api('/api/me/ai/keys', { method: 'PUT', body: { provider: 'gemini', key } }); } finally { if (btn) btn.disabled = false; }
      document.removeEventListener('visibilitychange', back);
      box.dataset.state = 'done';
      box.querySelector('.gk-done .gk-go').focus({ preventScroll: true });
    };
    /** one field to paste into, when the browser keeps the clipboard to itself (or what was copied was something else) */
    const field = (why) => {
      box.querySelector('.gk-paste')?.remove();
      const input = el('input', { type: 'text', dir: 'ltr', autocomplete: 'off', spellcheck: 'false', placeholder: 'AIza…', 'aria-label': 'הדביקו כאן את מה שהעתקתם' });
      const form = el('form', { class: 'gk-paste', onsubmit: async (e) => {
        e.preventDefault();
        try { await connect(input.value, e.target.querySelector('button')); } catch (x) { fail(x); }
      } }, el('label', {}, 'הדביקו כאן את מה שהעתקתם', input), el('button', { class: 'btn primary' }, 'חיבור'));
      err.before(form);   // under the steps, full width (inside a step it would sit in one grid cell)
      if (why) fail({ message: why });
      input.focus();
    };
    // a tap on "הדבק" reads the clipboard (a tap is what lets the browser allow it)
    const paste = async (e) => {
      let text = '';
      try { text = await navigator.clipboard.readText(); } catch (_) { return field('הדפדפן לא נתן לי לקרוא את ההעתקה. הדביקו כאן (לחיצה ארוכה ← הדבק).'); }
      if (!looksRight(text.trim())) return field('לא מצאתי מפתח במה שהועתק. העתיקו אותו שוב ב־Google, או הדביקו כאן.');
      try { await connect(text, e.currentTarget); } catch (x) { fail(x); }
    };
    const toGoogle = () => { left = true; at(2); };
    const box = el('div', { class: 'gk', 'data-state': 'steps' },
      el('header', { class: 'gk-head' }, el('span', { class: 'gk-free' }, 'חינם'), el('h2', {}, 'חבר עוזר חינמי'), el('p', {}, 'שלושה צעדים, בערך דקה')),
      el('ol', { class: 'gk-steps' },
        step('signin', 'נכנסים ל־Google', 'עם החשבון הרגיל שלכם. הדף נפתח בלשונית חדשה.',
          el('a', { class: 'btn primary gk-go', href: GOOGLE, target: '_blank', rel: 'noopener', onclick: toGoogle }, 'קבל מפתח חינמי מ־Google')),
        step('key', 'לוחצים על הכפתור הכחול ליצירת מפתח', 'ואז "Copy" ליד הקוד שנוצר. אם שואלים על פרויקט, בוחרים את מה שמוצע.',
          el('button', { class: 'btn primary gk-go', type: 'button', onclick: () => at(3) }, 'העתקתי')),
        step('paste', 'חוזרים לאוהל ולוחצים „הדבק”', 'נבדוק את המפתח מול Google. הוא נשמר מוצפן, רק לבקשות שלך.',
          el('button', { class: 'btn primary gk-go', type: 'button', onclick: paste }, 'הדבק'))),
      err,
      el('div', { class: 'gk-done', role: 'status' }, el('span', { class: 'gk-ok' }, 'Gemini מחובר ✓'),
        el('p', {}, 'העוזר החכם עובד עכשיו על החשבון שלכם ב־Google, בחינם.'),
        el('button', { class: 'btn primary gk-go', type: 'button', onclick: () => { close(); onDone?.(); } }, 'סיום')),
      el('button', { class: 'btn ghost gk-later', type: 'button', onclick: () => close() }, 'לא עכשיו'));
    const close = () => { document.removeEventListener('visibilitychange', back); H.closeModal(); };
    /** back from Google: "להדביק את המפתח?" on the last step */
    function back() {
      if (!left || document.visibilityState !== 'visible' || !document.body.contains(box)) return;
      left = false;
      steps[2].querySelector('b').textContent = 'חזרת. להדביק את המפתח?';
      at(3);
    }
    document.addEventListener('visibilitychange', back);
    at(1);
    H.modal(box);
    at(1);   // (again, once it is on the page, for the focus)
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
