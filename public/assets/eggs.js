/* The owner's surprise eggs on this page (server/layout.ts; managed in the back door's עץ מבנה), and the bar of the
   owner's preview of a new structure. Loaded by common.js on every page of a signed-in person.
   - the eggs: GET /api/eggs?page= gives only where the live ones sit (what is inside stays a surprise); a tap opens it
     (POST /api/eggs/:id/found), cracks the shell (.egg.found) and shows the note (.egg-note), both gone after 2.6s.
     A link egg goes to its link after the note; a surprise egg throws stars (celebrate.js).
   - the preview: while sessionStorage 'helper.layoutPreview' holds a structure (set by the back door), apps.js shows it
     on this tab only, and this bar says so, with a way out. */
(() => {
  const H = window.H;
  if (!H || window.__eggs) return;
  window.__eggs = true;
  const pageOf = (p) => (/\.[a-z]+$/i.test(p) || p.endsWith('/') ? p : p + '/');

  // x and y are 8..92 (percent of the screen); the 44px egg stays whole on any screen
  const at = (n) => `calc((100% - 44px) * ${(+n || 50) / 100})`;

  async function eggs() {
    let d;
    try { d = await H.api('/api/eggs?page=' + encodeURIComponent(pageOf(location.pathname)), { noRedirect: true }); } catch (_) { return; }
    for (const e of d.eggs || []) {
      const b = H.el('button', { type: 'button', class: 'egg float', 'aria-label': 'ביצת הפתעה', style: `--x:${at(e.x)};--y:${at(e.y)}` });
      b.addEventListener('click', () => open(b, e.id), { once: true });
      document.body.append(b);
    }
  }

  async function open(b, id) {
    let r;
    try { r = await H.api(`/api/eggs/${encodeURIComponent(id)}/found`, { method: 'POST', noRedirect: true }); } catch (_) { b.remove(); return; }
    b.classList.add('found');
    const note = H.el('div', { class: 'egg-note', role: 'status' }, r.text || 'מצאתם ביצת הפתעה!');
    document.body.append(note);
    if (r.kind === 'surprise') H.loadOnce('/assets/celebrate.js').then(() => window.Celebrate?.at(b, { label: 'הפתעה!' })).catch(() => {});
    setTimeout(() => {
      b.remove(); note.remove();
      if (r.kind === 'link' && r.link) location.href = r.link;
    }, 2600);
  }

  function previewBar() {
    let pv = null;
    try { pv = sessionStorage.getItem('helper.layoutPreview'); } catch (_) { /* no storage */ }
    if (!pv || document.querySelector('.layout-pv')) return;
    const end = H.el('button', { type: 'button', class: 'btn' }, 'סיום התצוגה');
    end.addEventListener('click', () => { try { sessionStorage.removeItem('helper.layoutPreview'); } catch (_) { /* no storage */ } location.reload(); });
    const back = H.el('a', { class: 'btn primary', href: '/admin/#structure' }, 'חזרה לעץ המבנה');
    document.body.append(H.el('div', { class: 'layout-pv', role: 'status' },
      H.el('b', {}, 'תצוגה מקדימה'), H.el('span', {}, 'המבנה החדש מוצג רק בלשונית הזו, ועוד לא פורסם.'), back, end));
  }

  H.layoutPreviewBar = previewBar;
  const go = () => { previewBar(); if (!location.pathname.startsWith('/admin/')) eggs(); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', go, { once: true }); else go();
})();
