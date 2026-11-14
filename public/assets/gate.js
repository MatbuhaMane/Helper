/* The page of a beta or secret app (apps.js: access 'beta' | 'secret'): a person the back door has not opened it to
   gets a polite page instead of a broken one. The server refuses the app's API anyway (server/app-access.ts); this is only the face.
     if (!(await H.gate('/mail/'))) return;    // before drawing anything */
(() => {
  H.gate = async function gate(href) {
    const r = await H.me();
    if (!r.user) return true;                     // not signed in: the page's own sign-in takes over
    try { await H.loadOnce('/assets/apps.js'); } catch (_) { return true; }   // offline: the server still judges
    // the code's own catalogue: an app the owner's layout hides is still gated
    const app = (H.layout?.().code || H.APPS || []).find((a) => a.href === href);
    if (!app || H.mayOpen(app, r)) return true;
    const main = document.querySelector('main') || document.body.appendChild(document.createElement('main'));
    main.replaceChildren(H.el('section', { class: 'card gate-closed', style: 'max-inline-size:34rem;margin:48px auto;text-align:center' },
      H.el('h1', {}, app.name),
      H.el('p', { class: 'lead' }, app.access === 'beta' ? 'הכלי עדיין בבדיקה.' : 'הכלי הזה עוד לא פתוח לך.'),
      H.el('p', { class: 'muted' }, app.access === 'beta'
        ? 'כמה בני משפחה בודקים אותו עכשיו, וכשיהיה מוכן הוא ייפתח לכולם. רוצים לבדוק גם? אפשר לבקש ממנהל האוהל.'
        : 'אם צריך אותו, אפשר לבקש ממנהל האוהל לפתוח אותו.'),
      H.el('p', {}, H.el('a', { class: 'btn', href: '/tools/' }, 'לכל הכלים'))));
    return false;
  };
})();
