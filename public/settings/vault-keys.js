// The family vault's keys and backups, in the settings (moved from the tree page: the owner, 2026-11-14).
// Only the entry moved: the same server routes (/api/vault/passkeys…, /api/vault/backups…), each still asking for a
// fresh unlock (a passkey, or a Google sign-in from the last minutes) exactly as on the tree page.
(() => {
  const { el, api, toast } = H;
  const ERR = {
    vault_locked: 'צריך לאשר שזה אתה', too_many_tries: 'יותר מדי ניסיונות. נסו שוב בעוד רבע שעה.', sign_in_again: 'צריך להיכנס שוב עם Google.',
    only_the_owner: 'רק בעל האוהל רואה את הגיבויים.',
  };
  const say = (e) => { if (e?.code !== 'step_cancelled') toast(ERR[e?.code] || e?.message || 'משהו השתבש'); };
  const BACK = '/settings/?fresh=1#privacy';
  const toBuf = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)).buffer;
  const toB64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const passkeysWork = () => !!window.PublicKeyCredential && !!navigator.credentials;

  /** a call that may need a fresh unlock: ask once, then the same call again */
  const call = async (path, opts = {}) => {
    try { return await api(path, { ...opts, noRedirect: true }); } catch (e) {
      if (e.code !== 'vault_locked' || opts.again) throw e;
      await stepUp();
      return call(path, { ...opts, again: true });
    }
  };
  function stepUp() {
    return new Promise((resolve, reject) => {
      let done = false;
      H.modal(el('div', { class: 'fv-form' },
        el('h2', {}, 'צריך לאשר שזה אתה'),
        el('p', { class: 'muted' }, 'מפתחות הגישה והגיבויים של הכספת מבקשים אישור בכל פעם (ואחריו רבע שעה בלי לשאול שוב).'),
        el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
          passkeysWork() ? el('button', { class: 'btn primary', type: 'button', onclick: async (e) => {
            e.target.disabled = true;
            try { await unlockWithPasskey(); done = true; H.closeModal(); resolve(); } catch (err) { if (err?.name !== 'NotAllowedError') say(err); e.target.disabled = false; }
          } }, 'אישור בטביעת אצבע, בפנים או ב־Windows Hello') : null,
          el('button', { class: 'btn ghost', type: 'button', onclick: () => { location.href = '/api/auth/login?reauth=1&next=' + encodeURIComponent(BACK); } }, 'כניסה מחדש עם Google'))));
      const m = document.getElementById('modal');
      const watch = new MutationObserver(() => { if (m.hidden) { watch.disconnect(); if (!done) { const err = new Error('לא אושר'); err.code = 'step_cancelled'; reject(err); } } });
      watch.observe(m, { attributes: true, attributeFilter: ['hidden'] });
    });
  }
  async function unlockWithPasskey() {
    const o = await api('/api/vault/unlock/options', { method: 'POST', noRedirect: true });
    const pk = o.publicKey;
    const a = await navigator.credentials.get({ publicKey: { ...pk, challenge: toBuf(pk.challenge), allowCredentials: pk.allowCredentials.map((c) => ({ ...c, id: toBuf(c.id) })) } });
    await api('/api/vault/unlock', { noRedirect: true, body: { challengeId: o.challengeId, id: toB64(a.rawId), response: {
      clientDataJSON: toB64(a.response.clientDataJSON), authenticatorData: toB64(a.response.authenticatorData), signature: toB64(a.response.signature) } } });
  }
  async function addPasskey() {
    const o = await call('/api/vault/passkeys/options', { method: 'POST' });
    const pk = o.publicKey;
    const cred = await navigator.credentials.create({ publicKey: {
      ...pk, challenge: toBuf(pk.challenge), user: { ...pk.user, id: toBuf(pk.user.id) },
      excludeCredentials: pk.excludeCredentials.map((c) => ({ ...c, id: toBuf(c.id) })),
    } });
    const ua = navigator.userAgent;
    const label = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'מכשיר';
    await call('/api/vault/passkeys', { body: { challengeId: o.challengeId, label, response: { clientDataJSON: toB64(cred.response.clientDataJSON), attestationObject: toB64(cred.response.attestationObject) } } });
  }

  async function keys() {
    let passkeys;
    try { ({ passkeys } = await call('/api/vault/passkeys')); } catch (e) { return say(e); }
    const day = (t) => new Date(t).toLocaleDateString('he-IL');
    H.modal(el('div', { class: 'fv-form' }, el('h2', {}, 'מפתחות הגישה שלי'),
      el('p', { class: 'muted small' }, 'כל מכשיר שיכול לפתוח את הכספת בטביעת אצבע, בפנים או ב־Windows Hello. מכשיר שאבד – הסירו אותו כאן.'),
      passkeys.length ? el('ul', { class: 'fv-list' }, passkeys.map((k) => el('li', { class: 'fv-item' }, el('b', {}, k.label || 'מכשיר'),
        el('small', { class: 'muted' }, ` נוסף ${day(k.created_at)}${k.last_used ? ' · בשימוש ' + day(k.last_used) : ''}`),
        el('button', { class: 'btn small ghost danger', type: 'button', 'aria-label': 'הסרת המפתח ' + (k.label || 'מכשיר'), onclick: async () => {
          if (!confirm('להסיר את המפתח הזה?')) return;
          try { await call(`/api/vault/passkeys/${encodeURIComponent(k.id)}`, { method: 'DELETE' }); H.closeModal(); keys(); } catch (e) { say(e); }
        } }, 'הסרה')))) : el('p', { class: 'muted' }, 'עוד אין מפתחות.'),
      passkeysWork()
        ? el('button', { class: 'btn primary', type: 'button', onclick: async () => { try { await addPasskey(); toast('המפתח נשמר'); H.closeModal(); keys(); } catch (err) { if (err?.name !== 'NotAllowedError') say(err); } } }, '+ המכשיר הזה')
        : el('p', { class: 'muted' }, 'המכשיר הזה לא תומך במפתחות גישה.')));
  }

  /** the owner: Cloudflare first, an encrypted copy on Drive, the NAS pulls its own */
  async function backups() {
    let b;
    try { b = await call('/api/vault/backups'); } catch (e) { return say(e); }
    const when = (t) => (t ? new Date(t).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : 'עוד לא');
    const run = el('button', { class: 'btn small primary', type: 'button', onclick: async () => {
      run.disabled = true; run.textContent = 'מגבה…';
      try { const r = await call('/api/vault/backups/run', { method: 'POST' }); toast(`הגיבוי הסתיים: ${r.copied} עותקים חדשים${r.failed ? `, ${r.failed} נכשלו` : ''}`); H.closeModal(); backups(); }
      catch (e) { say(e); run.disabled = false; run.textContent = 'גיבוי עכשיו'; }
    } }, 'גיבוי עכשיו');
    H.modal(el('div', { class: 'fv-form' },
      el('h2', {}, 'גיבויים'),
      el('p', { class: 'muted small' }, 'הקבצים נשמרים ב־Cloudflare. מכל קובץ נשמר עותק מוצפן גם ב־Google Drive, וה־NAS מושך לעצמו את כל העותקים. בלי מפתח הכספת אי אפשר לקרוא אף אחד מהם.'),
      el('div', { class: 'fv-item' }, el('b', {}, 'Google Drive'),
        b.drive.email
          ? [el('span', { dir: 'ltr', class: 'muted small' }, b.drive.email), el('span', {}, `${b.drive.copies} מתוך ${b.drive.files} קבצים מגובים`),
             el('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
               if (!confirm('לנתק את Google Drive מהגיבויים? העותקים שכבר שם נשארים.')) return;
               try { await call('/api/vault/backups/drive/disconnect', { method: 'POST' }); H.closeModal(); backups(); } catch (e) { say(e); }
             } }, 'ניתוק')]
          : [el('span', { class: 'muted small' }, 'לא מחובר'), el('button', { class: 'btn small primary', type: 'button', onclick: () => { location.href = '/api/auth/login?drive=1&next=' + encodeURIComponent(BACK); } }, 'חיבור Google Drive')]),
      el('div', { class: 'fv-item' }, el('b', {}, 'NAS'), el('span', { class: 'muted small' }, 'ה־NAS מושך את הגיבויים מ־Cloudflare בעצמו (Cloud Sync). כך שום דבר בבית לא פתוח לאינטרנט. ההגדרה מתוארת ב־docs/security.md.')),
      el('div', { class: 'fv-item' }, el('b', {}, 'עותק לילי של האילן'), el('span', { class: 'muted small' }, `האחרון: ${when(b.lastSnapshot)}`),
        b.lastRun ? el('span', { class: 'muted small' }, `הגיבוי האחרון: ${when(b.lastRun.at)} · ${b.lastRun.copied} עותקים חדשים${b.lastRun.failed ? ` · ${b.lastRun.failed} נכשלו` : ''}`) : null),
      el('div', { class: 'fv-acts' }, run)));
  }

  /** back from a Google sign-in (?fresh=1): that sign-in opens the vault for the next steps, and the address is cleaned */
  async function back() {
    const u = new URL(location.href);
    if (!u.searchParams.has('fresh')) return;
    u.searchParams.delete('fresh');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    try { await api('/api/vault/unlock/fresh', { method: 'POST', noRedirect: true }); toast('אושר. אפשר להמשיך.'); } catch (e) { say(e); }
  }

  H.vaultKeys = keys;
  H.vaultBackups = backups;
  H.vaultBack = back;
})();
