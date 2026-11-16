/* The owner's preview mode (2026-11-16): a button in the top bar that opens a panel, and a constant label while a view is active.
   Loaded by common.js only for the real owner with the back door's switch on (prefs.admin.preview).
   PRESENTATION ONLY: the state is in this tab's sessionStorage ('helper.preview'), never in the server prefs; the server checks the
   owner's real session as always. "Experimental off" only hides. The roles are the real ones (owner, ראש בית 'head', member);
   the app has no paid-plan field yet, so "משלם" means: a member with the shop open. Role changes reload the page (the pages read
   who you are when they open); the light and the experimental switch apply at once.
   The look uses the tokens of base.css; the few new rules are in a <style> here and go to design as a note. */
(() => {
  const H = window.H, el = H.el, KEY = 'helper.preview';
  const VIEWS = [['me', 'אני (בעל האוהל)'], ['free', 'משתמש חינמי חדש'], ['member', 'חבר משק בית'], ['head', 'עורך (ראש בית)'], ['paid', 'משתמש משלם']];
  const LIGHTS = [['system', 'לפי המערכת'], ['light', 'בהיר'], ['dark', 'כהה']];
  const read = () => H.previewState() || { as: 'me', theme: 'system', exp: 'on' };
  const write = (s) => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (_) { /* no storage */ } };
  const isOn = (s) => s.as !== 'me' || s.theme !== 'system' || s.exp === 'off';

  const css = el('style', {}, `
    .pv-btn { display: inline-flex; align-items: center; justify-content: center; inline-size: 40px; block-size: 40px; border: 0; background: transparent; color: inherit; border-radius: 50%; cursor: pointer; }
    .pv-btn:hover, .pv-btn:focus-visible { background: color-mix(in srgb, var(--primary) 12%, transparent); }
    .pv-btn svg { inline-size: 22px; block-size: 22px; stroke: currentColor; fill: none; stroke-width: 1.8; }
    .pv-label { position: fixed; inset-block-end: calc(var(--tabbar-h, 0px) + 10px); inset-inline-start: 12px; z-index: var(--z-float); display: inline-flex; gap: 8px; align-items: center;
      padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--card); color: var(--text); font: inherit; font-size: .85rem; cursor: pointer; box-shadow: var(--lift); }
    .pv-label b { color: var(--exp); }
    .pv-panel { display: grid; gap: 14px; }
    .pv-panel fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; }
    .pv-panel legend { font-weight: 600; padding: 0; margin-block-end: 4px; }
    .pv-opts { display: flex; flex-wrap: wrap; gap: 8px; }
    .pv-opts button { padding: 8px 12px; min-block-size: 40px; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); background: var(--card); color: var(--text); font: inherit; cursor: pointer; }
    .pv-opts button[aria-checked="true"] { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); }
    .pv-note { color: var(--muted); font-size: .85rem; margin: 0; }
  `);
  document.head.append(css);

  let label;
  function drawLabel() {
    const s = read();
    label?.remove(); label = null;
    if (!isOn(s)) return;
    const parts = [];
    if (s.as !== 'me') parts.push('תצוגה: ' + VIEWS.find((v) => v[0] === s.as)[1]);
    if (s.theme !== 'system') parts.push(s.theme === 'dark' ? 'כהה' : 'בהיר');
    if (s.exp === 'off') parts.push('בלי חומרים בניסוי');
    label = el('button', { type: 'button', class: 'pv-label', title: 'לחיצה: חזרה לתצוגה הרגילה', 'aria-label': parts.join(', ') + '. לחיצה מחזירה לתצוגה הרגילה',
      onclick: () => reset() }, el('b', {}, parts.join(' · ')), el('span', { 'aria-hidden': 'true' }, '✕'));
    document.body.append(label);
  }

  function set(patch, reload) {
    write({ ...read(), ...patch });
    if (reload) return location.reload();
    H.previewRefresh();   // the light and the switchboard, at once
    drawLabel();
    paint();
  }
  function reset() { try { sessionStorage.removeItem(KEY); } catch (_) { /* no storage */ } location.reload(); }

  let box;
  const group = (title, opts, current, onPick) => el('fieldset', {}, el('legend', {}, title),
    el('div', { class: 'pv-opts', role: 'radiogroup', 'aria-label': title }, opts.map(([v, t]) =>
      el('button', { type: 'button', role: 'radio', 'aria-checked': String(current === v), onclick: () => onPick(v) }, t))));
  function paint() {
    if (!box) return;
    const s = read();
    box.replaceChildren(
      group('צפה בתור', VIEWS, s.as, (v) => set({ as: v }, true)),
      group('תאורה', LIGHTS, s.theme, (v) => set({ theme: v })),
      group('חומרים בניסוי (כלים בפיתוח, "בקרוב", מתגים שממתינים לאישור)', [['on', 'מוצגים'], ['off', 'מוסתרים']], s.exp, (v) => set({ exp: v }, true)),
      el('button', { type: 'button', class: 'btn small', onclick: reset }, 'איפוס'),
      el('p', { class: 'pv-note' }, 'רק תצוגה בדפדפן הזה. מה שהשרת מחליט (הרשאות, מתגים כבויים, מה שנשמר) נשאר כמו שלך.'));
  }
  function open() { box = el('div', { class: 'pv-panel' }, el('h2', {}, 'מצב תצוגה מקדימה')); const h = box.firstChild; paint(); box.prepend(h); H.modal(box); }

  function mount() {
    if (document.querySelector('.pv-btn')) return;
    const chip = document.getElementById('userchip');
    if (!chip) return;
    const b = el('button', { type: 'button', class: 'pv-btn', title: 'מצב תצוגה מקדימה', 'aria-label': 'מצב תצוגה מקדימה', onclick: open });
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    chip.before(b);
  }
  mount();
  new MutationObserver(mount).observe(document.body, { childList: true });
  drawLabel();
})();
