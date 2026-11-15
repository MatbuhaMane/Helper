/* "רמת הניג'וס" (vision batch 31, docs/design/nag-level.md): the notification level of a tool, and of one item inside it.
   Four levels: off, quiet (only the daily summary), normal, nag (repeats until handled). The specific setting wins over the general.
   Kept per person on the server in the prefs namespace "nag" (so it follows them between devices): { lv: { tool: level }, it: { "tool:id": level } }.
   The server reads the same prefs to decide (server/nag-rules.ts, server/push.ts); the rules here mirror it, for the screen only.
   Loaded on its own where needed (the settings screen, a tool's bell): <script src="/assets/nag.js"></script> after common.js.

     Nag.level(tool, item?)           → 'off' | 'quiet' | 'normal' | 'nag'
     Nag.set(tool, level, item?)      → save it; level null on an item goes back to the tool's level
     Nag.picker(tool, item?, onchange?) → fieldset.nag with the four radios (and "כמו הממשק" for an item)
     Nag.bell(tool, item?, label?)    → button.nag-bell that opens the picker in H.modal
     Nag.mark(tool, item)             → span.nag-mark when the item differs from its tool, else null
     Nag.done(tool, item?)            → "טופל": the repeats stop */
(() => {
  if (!window.H || window.Nag) return;
  const H = window.H, { el } = H;
  const LEVELS = ['off', 'quiet', 'normal', 'nag'];
  const NAME = { off: 'כבוי', quiet: 'שקט', normal: 'רגיל', nag: 'נודניק' };
  const NOTE = { off: 'בלי התראות.', quiet: 'רק בסיכום היומי.', normal: 'התראה בזמן הנכון.', nag: 'התראה, וחוזרת עד שמסמנים שטופל.' };
  /** the tools that send phone notifications; the same list and defaults as server/nag-rules.ts */
  const TOOLS = [
    ['family', 'הודעות מהמשפחה', 'הודעה אישית', 'normal'], ['gather', 'מפגשים', 'מפגש שהוזמנת אליו', 'normal'],
    ['familyday', 'ימי הולדת ואזכרות', 'היום המיוחד של מישהו במשפחה', 'normal'], ['home', 'הבית', 'תזכורת שקבעת לטיפול בבית', 'normal'],
    ['kitchen', 'טיימרים במטבח', 'טיימר שהפעלת מצלצל גם בשעות השקט', 'normal'], ['garden', 'הגינה', 'צמח שצריך מים', 'quiet'],
    ['goals', 'מטרות', 'תזכורת לצעד הבא', 'quiet'], ['coach', 'המאמן בהקפדה', 'אימון ותזכורת', 'quiet'],
  ];
  const def = (tool) => (TOOLS.find((t) => t[0] === tool) || [])[3] || 'quiet';
  const get = () => { const p = H.prefs('nag', { lv: {}, it: {} }); p.lv ||= {}; p.it ||= {}; return p; };
  const ok = (v) => LEVELS.includes(v);
  let n = 0;

  const toolLevel = (tool) => { const v = get().lv[tool]; return ok(v) ? v : def(tool); };
  const level = (tool, item) => { const v = item ? get().it[tool + ':' + item] : null; return ok(v) ? v : toolLevel(tool); };
  const own = (tool, item) => (item ? ok(get().it[tool + ':' + item]) : false);
  const set = (tool, lv, item) => {
    const p = get();
    if (item) { if (ok(lv)) p.it[tool + ':' + item] = lv; else delete p.it[tool + ':' + item]; }
    else p.lv[tool] = lv;
    H.savePrefs('nag');
    dispatchEvent(new CustomEvent('helper:nag', { detail: { tool, item } }));
    // the first level above "quiet" is the moment to ask this device for permission (a phone asks only on a tap)
    if ((lv === 'normal' || lv === 'nag') && H.push) H.push.state().then((s) => { if (s === 'off') H.push.enable().catch(() => {}); }).catch(() => {});
  };
  const done = (tool, item) => H.api('/api/nag/done', { method: 'POST', body: { tool, item: item || '' } }).catch(() => {});

  /** the four radios; onchange(level) after a save */
  function picker(tool, item, onchange) {
    const name = 'nag' + ++n + '-' + tool + (item || '');
    const cur = level(tool, item);
    const label = (TOOLS.find((t) => t[0] === tool) || [])[1] || '';
    const note = el('p', { class: 'nag-note' }, NOTE[cur]);
    const box = el('fieldset', { class: 'nag', 'data-nag': cur },
      el('legend', {}, 'רמת הניג׳וס: ' + label),
      LEVELS.map((l) => el('label', { class: 'nag-opt', 'data-nag': l },
        el('input', { type: 'radio', name, value: l, checked: l === cur,
          onchange: () => { set(tool, l, item); note.textContent = NOTE[l]; box.dataset.nag = l; if (inherit) inherit.querySelector('input').checked = false; onchange?.(l); } }),
        el('span', { class: 'nag-ic', 'aria-hidden': 'true' }), el('span', {}, NAME[l]))));
    let inherit = null;
    const wrap = el('div', {}, box, note);
    if (item) {
      inherit = el('label', { class: 'nag-inherit' },
        el('input', { type: 'checkbox', checked: !own(tool, item), onchange: (e) => {
          if (!e.target.checked) { e.target.checked = true; return; }              // "like the tool" is only ever switched on; choosing a level switches it off
          set(tool, null, item); const l = level(tool); note.textContent = NOTE[l]; box.dataset.nag = l;
          box.querySelectorAll('input').forEach((r) => { r.checked = r.value === l; }); onchange?.(l);
        } }),
        el('span', {}, `כמו הממשק (${NAME[toolLevel(tool)]})`));
      wrap.append(inherit);
    }
    return wrap;
  }

  function bell(tool, item, label) {
    const b = el('button', { class: 'nag-bell', type: 'button' }, el('span', { class: 'nag-ic', 'aria-hidden': 'true' }));
    const paint = () => {
      const l = level(tool, item), differs = item ? own(tool, item) : toolLevel(tool) !== def(tool);
      b.dataset.nag = l; b.classList.toggle('own', differs);
      b.setAttribute('aria-label', 'רמת הניג׳וס: ' + NAME[l] + (differs ? ', שונה מהכללי' : ''));
    };
    b.onclick = () => H.modal(el('h2', {}, 'רמת הניג׳וס' + (label ? ': ' + label : '')), picker(tool, item, paint));
    addEventListener('helper:nag', paint); addEventListener('helper:prefs', paint);
    paint();
    return b;
  }

  const mark = (tool, item) => (!item || !own(tool, item) || level(tool, item) === toolLevel(tool) ? null
    : el('span', { class: 'nag-mark', 'data-nag': level(tool, item) }, el('span', { class: 'nag-ic', 'aria-hidden': 'true' }), NAME[level(tool, item)]));

  window.Nag = { TOOLS, LEVELS, NAME, NOTE, level, toolLevel, own, set, done, picker, bell, mark };
})();
