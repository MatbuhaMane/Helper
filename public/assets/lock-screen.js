/* The lock screen (docs/decisions.md, "Locks and privacy"): the app, or the family tree, locked with a 4-digit code or a
   passkey, like Telegram's. The server enforces it (423 app_locked / tree_locked from every route but the lock's own);
   this only asks for the code and opens it again.
     H.lockScreen({ scope: 'app' | 'tree', animate }) → a Promise, resolved once it is open (one screen at a time)
     H.passkeySignIn(next)   "כניסה בטביעת אצבע" on the sign-in screen: a passkey instead of Google
     H.passkeysWork()        whether this device can use a passkey at all
   The look is design's Lock.screen (/assets/lock.js: the keypad, the shake, a pause, the page behind made inert); this
   file is the server's side of it. Should lock.js not load, a plain screen of its own stands in. */
(() => {
  if (!window.H || window.H.lockScreen) return;
  const { el } = window.H;
  const api = (path, opts = {}) => window.H.api(path, { noRedirect: true, ...opts });
  const toBuf = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)).buffer;
  const toB64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const passkeysWork = () => !!window.PublicKeyCredential && !!navigator.credentials;
  /** a passkey's assertion, in the shape the server's routes take */
  async function assertion(optionsPath, body = {}) {
    const o = await api(optionsPath, { body });
    const pk = o.publicKey;
    const a = await navigator.credentials.get({ publicKey: { ...pk, challenge: toBuf(pk.challenge), allowCredentials: (pk.allowCredentials || []).map((c) => ({ ...c, id: toBuf(c.id) })) } });
    return { challengeId: o.challengeId, id: toB64(a.rawId), response: { clientDataJSON: toB64(a.response.clientDataJSON), authenticatorData: toB64(a.response.authenticatorData), signature: toB64(a.response.signature), userHandle: a.response.userHandle ? toB64(a.response.userHandle) : null } };
  }

  /** "שכחתי את הקוד": out, and back in with Google – that is the proof; then a new code is set in the settings */
  async function forgot() {
    if (!confirm('כדי לקבוע קוד חדש צריך להיכנס שוב עם חשבון Google שלך. לצאת עכשיו?')) return;
    try { await window.H.api('/api/auth/logout', { method: 'POST', noRedirect: true }); } catch (_) { /* out anyway */ }
    location.href = '/api/auth/login?next=' + encodeURIComponent('/settings/#privacy');
  }

  const WHY = { pin_wrong: 'קוד שגוי. נסו שוב.', pin_paused: 'יותר מדי ניסיונות. אפשר לנסות שוב בעוד רבע שעה.', pin_closed: 'הקוד נסגר אחרי הרבה ניסיונות. צריך להיכנס שוב עם Google.',
    no_pin: 'עוד לא נקבע קוד. אפשר להיכנס שוב עם Google.', passkey_unknown: 'טביעת האצבע הזו לא מוכרת כאן. אפשר להקליד את הקוד.' };
  let showing = null;
  /** the lock screen: design's Lock.screen, answered by the server (one code or passkey opens the app and the tree) */
  function lockScreen({ scope = 'app', animate = false } = {}) {
    if (showing) return showing;
    showing = (async () => {
      let l = {};
      try { l = await api('/api/lock'); } catch (_) { /* the keypad still works */ }
      try { await window.H.loadOnce('/assets/lock.js'); } catch (_) { /* the plain screen below */ }
      if (!window.Lock?.screen) { showing = null; return plainScreen({ scope, animate }); }
      const no = (e) => ({ ok: false, msg: WHY[e?.code] || (e?.offline ? 'אין חיבור לאינטרנט.' : 'לא הצלחתי לפתוח. נסו שוב.'), wait: e?.code === 'pin_paused' || e?.code === 'pin_closed' });
      const bio = !!l.hasPasskey && passkeysWork();
      const s = window.Lock.screen({
        title: scope === 'tree' ? 'עץ המשפחה נעול' : 'האוהל נעול',
        hint: (scope === 'tree' ? l.tree : l.app) === 'bio' && bio ? 'פותחים בטביעת אצבע, פנים או Windows Hello' : 'הקוד שלך',
        passkey: bio,
        onCode: async (pin) => { try { await api('/api/lock/unlock', { body: { pin } }); return { ok: true }; } catch (e) { return no(e); } },
        onPasskey: async () => {
          try { await api('/api/lock/passkey', { body: await assertion('/api/lock/passkey/options') }); return { ok: true }; }
          catch (e) { return e?.name === 'NotAllowedError' ? { ok: false, msg: '' } : no(e); }   // (a cancelled prompt is not a failure)
        },
        onForgot: forgot,
      });
      if (l.closed) s.pause(WHY.pin_closed);
      else if (l.pauseUntil) s.pause(WHY.pin_paused);
      // a passkey-only lock asks for the passkey at once
      else if ((scope === 'tree' ? l.tree : l.app) === 'bio' && bio) s.el.querySelector('[data-bio]')?.click();
      await s.done;
      showing = null;
      return true;
    })();
    return showing;
  }
  /** the plain screen (lock.js did not load) */
  function plainScreen({ scope = 'app', animate = false } = {}) {
    if (showing) return showing;
    showing = new Promise((resolve) => {
      let pin = '', busy = false, mode = { app: 'pin', tree: 'pin' }, hasPasskey = false;   // (modes: off | pin | bio)
      const title = scope === 'tree' ? 'עץ המשפחה נעול' : 'האוהל נעול';
      const dots = el('div', { class: 'lk-dots', 'aria-hidden': 'true', style: 'display:flex;gap:14px;justify-content:center' }, [0, 1, 2, 3].map(() => el('i', { style: 'inline-size:14px;block-size:14px;border-radius:50%;border:2px solid currentColor' })));
      const say = el('p', { class: 'lk-say', role: 'status', 'aria-live': 'polite', style: 'min-block-size:1.5em;margin:0' });
      const paint = () => dots.querySelectorAll('i').forEach((d, i) => { d.classList.toggle('on', i < pin.length); d.style.background = i < pin.length ? 'currentColor' : 'transparent'; });
      const done = () => { document.removeEventListener('keydown', keys, true); root.classList.add('opening'); setTimeout(() => root.remove(), 220); showing = null; resolve(true); };
      const fail = (e) => {
        pin = ''; paint();
        root.classList.add('shake'); setTimeout(() => root.classList.remove('shake'), 420);
        navigator.vibrate?.(60);
        say.textContent = WHY[e?.code] || (e?.offline ? 'אין חיבור לאינטרנט.' : 'לא הצלחתי לפתוח. נסו שוב.');
        if (e?.code === 'pin_closed' || e?.code === 'no_pin') say.append(' ', el('button', { type: 'button', class: 'linklike', onclick: forgot }, 'להיכנס שוב'));
      };
      const submit = async () => {
        busy = true; say.textContent = '';
        try { await api('/api/lock/unlock', { body: { pin } }); done(); } catch (e) { fail(e); }   // (one code opens the app and the tree)
        busy = false;
      };
      const press = (d) => { if (busy || pin.length >= 4) return; pin += d; paint(); if (pin.length === 4) submit(); };
      const back = () => { if (!busy) { pin = pin.slice(0, -1); paint(); } };
      const keys = (e) => {
        if (/^\d$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); press(e.key); }
        else if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); back(); }
      };
      const usePasskey = async () => {
        if (busy) return;
        busy = true; say.textContent = '';
        try { await api('/api/lock/passkey', { body: await assertion('/api/lock/passkey/options') }); done(); }
        catch (e) { if (e?.name !== 'NotAllowedError') fail(e); }   // (a cancelled prompt is not a failure)
        busy = false;
      };
      const KEY = 'font:inherit;font-size:1.5rem;inline-size:68px;block-size:68px;border-radius:50%;border:1px solid var(--line-strong);background:var(--card);color:var(--text);cursor:pointer';
      const key = (d) => el('button', { type: 'button', class: 'lk-key', style: KEY, onclick: () => press(d) }, d);
      const bio = el('button', { type: 'button', class: 'lk-key lk-bio', style: KEY, 'aria-label': 'פתיחה בטביעת אצבע', title: 'טביעת אצבע, פנים או Windows Hello', onclick: usePasskey }, '👆');
      // (its place in the pad stays when there is no passkey, so 0 stays under 8)
      const showBio = (on) => { bio.style.visibility = on ? 'visible' : 'hidden'; bio.disabled = !on; };
      showBio(false);
      const pad = el('div', { class: 'lk-pad', style: 'display:grid;grid-template-columns:repeat(3,68px);gap:14px;justify-content:center;direction:ltr' },
        ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key), bio, key('0'),
        el('button', { type: 'button', class: 'lk-key lk-back', style: KEY + ';border-color:transparent;background:none', 'aria-label': 'מחיקה', onclick: back }, '⌫'));
      const root = el('div', { class: 'lk' + (animate ? ' locking' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
        style: 'position:fixed;inset:0;z-index:2000;background:var(--bg);color:var(--text);display:grid;place-content:center;justify-items:center;gap:18px;text-align:center;padding:24px' },
        el('div', { class: 'lk-padlock', 'aria-hidden': 'true', style: 'font-size:2.6rem' }, '🔒'),
        el('h2', { style: 'margin:0' }, title),
        el('p', { class: 'lk-hint muted', style: 'margin:0' }, 'הקוד בן 4 ספרות'),
        dots, say, pad,
        el('button', { type: 'button', class: 'linklike lk-forgot', style: 'background:none;border:0;color:var(--muted);cursor:pointer;font:inherit;text-decoration:underline', onclick: forgot }, 'שכחתי את הקוד'));
      document.body.append(root);
      document.addEventListener('keydown', keys, true);
      paint();
      // how this one is locked: a passkey-only lock asks for the passkey at once
      api('/api/lock').then((l) => {
        mode = { app: l.app, tree: l.tree }; hasPasskey = !!l.hasPasskey;
        showBio(hasPasskey && passkeysWork());
        if (mode[scope] === 'bio') {
          pad.hidden = true; dots.hidden = true; root.querySelector('.lk-hint').textContent = 'פותחים בטביעת אצבע, פנים או Windows Hello';
          root.insertBefore(el('button', { type: 'button', class: 'btn primary', onclick: usePasskey }, '👆 לפתוח'), say.nextSibling);
          if (passkeysWork()) usePasskey();
        }
        if (l.closed) fail({ code: 'pin_closed' });
        else if (l.pauseUntil) fail({ code: 'pin_paused' });
      }).catch(() => { /* the pad still works */ });
    });
    return showing;
  }

  /** "כניסה בטביעת אצבע": a passkey made in הָאֹהֶל signs in without Google */
  async function passkeySignIn(next = location.pathname) {
    await api('/api/auth/passkey', { body: await assertion('/api/auth/passkey/options') });
    location.href = next;
  }

  Object.assign(window.H, { lockScreen, passkeySignIn, passkeysWork });
})();
