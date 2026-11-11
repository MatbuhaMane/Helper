/* כשרות וקטו במתכון
 * - בדיקה אחת לכל מתכון (נשמרת): אילו מצרכים לא כשרים או לא מתאימים לקטו, למה, ותחליפים לכל אחד
 * - מצרך בעייתי מסומן בקו של עיפרון, ומתחתיו שורה עם תחליף לבחירה
 * - אזהרות למעלה (לחיצה פותחת חלונית תיקון), וחותמת כשרות / קטו כשהמתכון מתאים
 * זו הערכה לפי שמות המצרכים בלבד, לא תחליף להשגחה: את ההכשר של המוצרים עצמם בודקים על האריזה.
 */
(() => {
  'use strict';
  const { el, api } = H;

  // Its own small window, above the full-page recipe, so the search results underneath stay as they were.
  let dlg = null;
  function closeDialog() { if (dlg) { dlg.remove(); dlg = null; document.removeEventListener('keydown', onKey, true); } }
  function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); closeDialog(); } }
  function dialog(...content) {
    closeDialog();
    dlg = el('div', { class: 'fix-dialog', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'modal-backdrop', onclick: closeDialog }),
      el('div', { class: 'modal-glass' }, el('button', { class: 'modal-close', 'aria-label': 'סגור', onclick: closeDialog }, '✕'), el('div', { class: 'fix-body' }, ...content)));
    document.body.append(dlg);
    document.addEventListener('keydown', onKey, true);
    dlg.querySelector('button:not(.modal-close)')?.focus();
  }
  const modal = dialog;
  const closeModal = closeDialog;

  const checks = new Map(); // names key -> Promise
  /** The check for a recipe's ingredients (cached for the visit; the server keeps it too). */
  function check(recipe) {
    const ings = (recipe.ingredients || []).map((i) => ({ name: (i.name || '').trim(), measure: i.measure || '' }));
    if (!ings.some((i) => i.name)) return Promise.resolve({ kosher: [], keto: [] });
    const key = JSON.stringify(ings.map((i) => i.name));
    if (!checks.has(key)) {
      const p = api('/api/recipes/check', { body: { title: recipe.title || '', ingredients: ings } });
      p.catch(() => checks.delete(key));
      checks.set(key, p);
    }
    return checks.get(key);
  }

  /** Where the recipe stands, given the substitutes chosen so far (Map index -> name, or null to keep the original). */
  function kosherStatus(result, subs) {
    const open = (result?.kosher || []).filter((x) => !subs.get(x.index));
    if (!open.length) return 'ok';
    return open.some((x) => x.kind !== 'shrimp') ? 'not' : 'shrimp';
  }

  /* ---------- stamps ---------- */
  function stamp(kind) {
    const label = kind === 'kosher' ? 'כשר' : 'קטו';
    const sub = kind === 'kosher' ? 'לפי המצרכים' : 'מתאים ✓';
    const t = document.createElement('template');
    t.innerHTML = `<svg class="stamp stamp-${kind}" viewBox="0 0 64 64" role="img" aria-label="${label} – ${sub}">
      <title>${kind === 'kosher' ? 'כשר לפי המצרכים (לא תחליף להשגחה)' : 'מתאים לדיאטה הקטוגנית שלנו'}</title>
      <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="2.4"/>
      <circle cx="32" cy="32" r="24.5" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2.2"/>
      <text x="32" y="34" text-anchor="middle" font-size="17" font-weight="600" fill="currentColor">${label}</text>
      <text x="32" y="46" text-anchor="middle" font-size="6.6" fill="currentColor">${sub}</text>
    </svg>`;
    return t.content.firstChild;
  }

  /* ---------- the chips at the top of a recipe ---------- */
  function kosherChip(status, onClick) {
    if (status === 'checking') return el('span', { class: 'r-chip quiet' }, el('span', { class: 'spinner tiny' }), ' בודק כשרות…');
    if (status === 'error') return null;
    if (status === 'ok') return el('button', { class: 'stamp-btn', title: 'כשר לפי המצרכים – לחיצה לפרטים', onclick: onClick }, stamp('kosher'));
    const text = status === 'shrimp' ? 'זה סבבה לפי חלק מהקהילות 🤔' : 'זה לא כשר זה 🫪';
    return el('button', { class: 'r-chip ' + (status === 'shrimp' ? 'maybe' : 'warn'), onclick: onClick, 'aria-haspopup': 'dialog' }, status === 'shrimp' ? '' : '⚠️ ', text);
  }

  /** The keto chip fills itself in once the values per serving are known. */
  function ketoChip(recipe, onClick) {
    if (!Keto.enabled) return null;
    const box = el('span', { class: 'r-chip quiet' }, el('span', { class: 'spinner tiny' }), ' בודק קטו…');
    Keto.recipeValues(recipe).then(({ verdict: [level] }) => {
      if (level === 'ok') box.replaceWith(el('button', { class: 'stamp-btn', title: 'מתאים לקטו – לחיצה לפרטים', onclick: onClick }, stamp('keto')));
      else box.replaceWith(el('button', { class: 'r-chip ' + (level === 'warn' ? 'maybe' : 'warn'), onclick: onClick, 'aria-haspopup': 'dialog' }, level === 'warn' ? '⚠️ גבולי לקטו' : '⚠️ לא מתאים לקטו'));
    }).catch(() => box.remove());
    return box;
  }

  /* ---------- the line under a problem ingredient ---------- */
  function subSelect(issue, original, chosen, onChange) {
    const sel = el('select', { class: 'sub-select', 'aria-label': `תחליף ל${original}` },
      issue.subs.map((s) => el('option', { value: s, selected: s === chosen }, s)),
      el('option', { value: '', selected: !chosen }, `להשאיר: ${original}`));
    sel.addEventListener('change', () => onChange(sel.value || null));
    sel.addEventListener('click', (e) => e.stopPropagation());
    return sel;
  }
  function subLine(issue, original, chosen, onChange, kind) {
    return el('div', { class: 'sub-line ' + kind },
      el('span', { class: 'sub-arrow', 'aria-hidden': 'true' }, '↳'),
      el('span', { class: 'sub-label' }, kind === 'kosher' ? 'במקום, כשר:' : 'במקום, לקטו:'),
      subSelect(issue, original, chosen, onChange),
      el('small', { class: 'sub-why' }, issue.reason_he));
  }

  /* ---------- the fix window ---------- */
  /** subs: current Map; apply(newSubs) is called with the whole new map. */
  function openFix({ focus, recipe, result, subs, apply }) {
    const next = new Map(subs);
    const names = recipe.ingredients.map((i) => i.name);
    const ketoIssues = Keto.enabled ? (result.keto || []).filter((k) => !(result.kosher || []).some((x) => x.index === k.index)) : [];
    const section = (kind, issues) => {
      if (!issues.length) return el('p', { class: 'muted' }, kind === 'kosher' ? '✓ כל המצרכים כשרים.' : '✓ אין מצרכים שצריך להחליף בשביל קטו.');
      return el('ul', { class: 'fix-list' }, issues.map((x) => el('li', {},
        el('div', { class: 'fix-orig' }, el('s', { class: 'pencil' }, names[x.index]), el('small', { class: 'sub-why' }, x.reason_he)),
        subSelect(x, names[x.index], next.get(x.index) || null, (v) => next.set(x.index, v)))));
    };
    const kosherIssues = result.kosher || [];
    const preset = (kinds) => {
      for (const x of kosherIssues) next.set(x.index, kinds.includes('kosher') ? x.subs[0] : (subs.get(x.index) || null));
      for (const x of ketoIssues) next.set(x.index, kinds.includes('keto') ? x.subs[0] : (subs.get(x.index) || null));
      draw();
    };
    const body = el('div');
    const draw = () => body.replaceChildren(
      el('div', { class: 'row fix-presets' },
        kosherIssues.length ? el('button', { class: 'btn ghost small', onclick: () => preset(['kosher']) }, '✡ להפוך לכשר') : null,
        ketoIssues.length ? el('button', { class: 'btn ghost small', onclick: () => preset(['keto']) }, '🥑 להפוך לקטו') : null,
        kosherIssues.length && ketoIssues.length ? el('button', { class: 'btn ghost small', onclick: () => preset(['kosher', 'keto']) }, 'גם וגם') : null),
      ...(focus === 'keto' ? [['keto', ketoIssues], ['kosher', kosherIssues]] : [['kosher', kosherIssues], ['keto', ketoIssues]])
        .filter(([k]) => k === 'kosher' || Keto.enabled)
        .flatMap(([k, issues]) => [el('h4', {}, k === 'kosher' ? 'כשרות' : 'קטו'), section(k, issues)]));
    draw();
    modal(
      el('h3', {}, focus === 'keto' ? 'להתאים את המתכון לקטו' : 'להתאים את המתכון לכשרות'),
      el('p', { class: 'muted' }, 'בחרו תחליף לכל מצרך. אפשר גם להשאיר את המקורי.'),
      body,
      el('div', { class: 'row', style: 'margin-top:14px' },
        el('button', { class: 'btn primary', onclick: () => { closeModal(); apply(next); } }, 'להחיל על המתכון'),
        el('button', { class: 'btn ghost', onclick: closeModal }, 'ביטול')),
      el('p', { class: 'fine' }, 'הבדיקה לפי שמות המצרכים בלבד ואינה תחליף להשגחה; את ההכשר של כל מוצר בודקים על האריזה.'));
  }

  window.RecipeFix = { check, kosherStatus, kosherChip, ketoChip, subLine, openFix, stamp };
})();
