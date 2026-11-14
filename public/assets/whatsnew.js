/* "האוהל התעדכן" (the owner, 2026-11-13): one small notice when something new went out.
   - The text is the master's /whats-new.json { "v": "<any id>", "text": "…" }. The owner approves every text before it
     goes out, so an empty text (or no file) shows nothing. v is only compared for equality.
   - Shown once per person: the last v they saw is kept in their own settings (H.prefs('whatsnew').seen, on the server),
     so closing it on the phone also hides it on the PC.
   - Never inside the welcome wizard, and never to someone who has not been through it yet (no me.welcomed): the welcome's
     end marks the current v as seen (welcome.js), so a brand-new person does not get news about a place they just met.
   - Shown once the notice is drawn (seen is saved then), not only when closed: it is a one-time word, not a task.
   Loaded by common.js after sign-in (not in the vault, a frame or offline). The look is design's (.wn-note in base.css):
   <div class="wn-note" role="status"><span class="wn-ico" aria-hidden="true"></span>
     <p class="wn-text"><b>האוהל התעדכן:</b> text</p><button class="wn-close" aria-label="סגירה">✕</button></div> */
(() => {
  const H = window.H;
  if (!H || window.__haohelWhatsNew || document.body?.dataset.vault === '1' || location.pathname.startsWith('/welcome')) return;
  window.__haohelWhatsNew = true;
  if (!H.prefs('me').welcomed) return;                                     // not through the welcome yet: it marks it seen
  const wn = H.prefs('whatsnew', { seen: '' });

  async function show() {
    let r;
    try { const res = await fetch('/whats-new.json', { cache: 'no-store', credentials: 'same-origin' }); if (!res.ok) return; r = await res.json(); }
    catch (_) { return; }
    const v = typeof r?.v === 'string' ? r.v.trim().slice(0, 100) : '';
    const text = typeof r?.text === 'string' ? r.text.trim().slice(0, 400) : '';
    if (!v || !text || v === wn.seen || document.querySelector('.wn-note')) return;
    wn.seen = v; H.savePrefs('whatsnew');
    const box = H.el('div', { class: 'wn-note', role: 'status' },
      H.el('span', { class: 'wn-ico', 'aria-hidden': 'true' }),
      H.el('p', { class: 'wn-text' }, H.el('b', {}, 'האוהל התעדכן:'), ' ' + text),
      H.el('button', { class: 'wn-close', type: 'button', title: 'סגירה', 'aria-label': 'סגירת ההודעה', onclick: () => box.remove() }, '✕'));
    document.body.append(box);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      box.animate?.([{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, easing: 'ease-out', fill: 'backwards' });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
