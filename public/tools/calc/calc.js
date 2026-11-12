/* מחשבון – two tools in one:
   - the calculator: a keypad, functions, degrees/radians, complex numbers, matrices (det, inv, eigs), units and physical
     constants, derivatives (derivative), integrals (integrate), equations (solve), and a graph for anything with x;
     the expression is shown typeset as you type (mathjs + KaTeX);
   - the smart calculator: a problem typed, in LaTeX or as a photo/screenshot → solved step by step, proved or disproved
     (with a counterexample), explained, or a solution checked – with formula bubbles by course.
   Without AI (docs/ai/without-ai.md #2): the calculator also reads percentages ("15% מ-80"), currencies at today's rates
   ("100 דולר בשקלים") and shows a simple fraction; the smart tab's "🧮 חישוב" solves equations and expressions on the
   device (plain.js), and "✨ פתרון" is the AI – an invitation when there is none. */
(async () => {
  const { el, api, toast } = H;
  await H.requireLogin();
  H.header('מחשבון');
  const P = H.prefs('calc', { tab: 'calc', deg: false, history: [], problems: [], subject: 'auto', mode: 'solve' });
  const save = () => H.savePrefs('calc');
  const root = document.querySelector('main');

  /* ---------- libraries (loaded once) ---------- */
  const load = (src) => new Promise((ok, no) => { const s = el('script', { src }); s.onload = ok; s.onerror = no; document.head.append(s); });
  document.head.append(el('link', { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css' }));
  const libs = Promise.all([
    load('https://cdnjs.cloudflare.com/ajax/libs/mathjs/13.2.0/math.min.js'),
    load('/tools/calc/plain.js'),
    load('https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js').then(() => load('https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js')),
  ]);
  const tex = (node) => { try { window.renderMathInElement?.(node, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); } catch (_) { /* leave the text */ } return node; };
  /** Text with **bold**, lines and bullets, and $LaTeX$ – as nodes. */
  function rich(s) {
    const esc = String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = esc.split(/\n{2,}/).map((para) => {
      const lines = para.split('\n');
      if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) return '<ul>' + lines.map((l) => '<li>' + l.replace(/^\s*[-•*]\s+/, '') + '</li>').join('') + '</ul>';
      return '<p>' + lines.join('<br>') + '</p>';
    }).join('').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    return tex(el('div', { class: 'cx-rich', dir: 'auto', html }));
  }

  /* ===================== the calculator ===================== */
  let ans = 0;
  const exprIn = el('input', { class: 'cx-expr', type: 'text', dir: 'ltr', spellcheck: 'false', autocomplete: 'off', placeholder: '2*sin(pi/4) + 3^2', 'aria-label': 'ביטוי לחישוב' });
  const pretty = el('div', { class: 'cx-pretty', dir: 'ltr', 'aria-hidden': 'true' });
  const result = el('div', { class: 'cx-result', dir: 'ltr', 'aria-live': 'polite' });
  const hint = el('div', { class: 'cx-pretty', dir: 'auto' });     // a simple fraction, or where the rate comes from
  const plotBox = el('div', { class: 'cx-plot', hidden: true });
  const degBtn = el('button', { class: 'cx-key fn mode', type: 'button', onclick: () => { P.deg = !P.deg; save(); degBtn.textContent = P.deg ? 'DEG' : 'RAD'; live(); } }, P.deg ? 'DEG' : 'RAD');

  const clean = (s) => (window.CalcPlain ? CalcPlain.prepare(s) : s).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√\(/g, 'sqrt(').replace(/√/g, 'sqrt').replace(/²/g, '^2');
  function setupMath() {
    const m = window.math;
    const k = Math.PI / 180;
    m.import({
      // degrees: the trig functions read and give degrees
      sind: (x) => m.sin(m.multiply(x, k)), cosd: (x) => m.cos(m.multiply(x, k)), tand: (x) => m.tan(m.multiply(x, k)),
      asind: (x) => m.divide(m.asin(x), k), acosd: (x) => m.divide(m.acos(x), k), atand: (x) => m.divide(m.atan(x), k),
      /** integrate("x^2", "x", 0, 1): Simpson's rule */
      integrate: (f, v, a, b) => {
        const c = m.compile(String(f)), n = 2000, h = (b - a) / n; let s = 0;
        for (let i = 0; i <= n; i++) { const x = a + i * h, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; s += w * c.evaluate({ [v]: x }); }
        return (s * h) / 3;
      },
      /** solve("x^2-2", "x", 1): Newton's method from a guess */
      solve: (f, v, x0 = 1) => {
        const c = m.compile(String(f)); let x = x0;
        for (let i = 0; i < 100; i++) { const fx = c.evaluate({ [v]: x }), d = (c.evaluate({ [v]: x + 1e-7 }) - fx) / 1e-7; if (!d) break; const nx = x - fx / d; if (Math.abs(nx - x) < 1e-12) return nx; x = nx; }
        return x;
      },
    }, { override: true });
  }
  /* currencies: today's rates (the European Central Bank's) as units, so "100 USD to ILS" and "50 EUR + 20 USD" work */
  const SYM = { ILS: '₪', USD: '$', EUR: '€', GBP: '£' };
  let money = null;
  async function setupMoney() {
    try {
      const r = await api('/api/calc/rates');
      const m = window.math;
      m.createUnit('ILS');
      for (const [code, per] of Object.entries(r.rates)) { try { m.createUnit(code, { definition: `${1 / per} ILS` }); } catch (_) { /* a name mathjs already has */ } }
      money = { date: r.date, codes: new Set(['ILS', ...Object.keys(r.rates)]) };
      live();
    } catch (_) { /* offline: no currencies, the rest works */ }
  }
  const currencyOf = (v) => (money && v && v.isUnit && v.units.length === 1 && money.codes.has(v.units[0].unit.name) ? v.units[0].unit.name : null);
  const amount = (n, code) => `${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })} ${SYM[code] || code}`;
  /** the line under the result: "= 3/4", or the shekels and the rate's date */
  function hintOf(v) {
    if (typeof v === 'number') { const f = CalcPlain.asFraction(v); return f ? '= ' + f : ''; }
    const code = currencyOf(v);
    if (!code) return '';
    const day = new Date(money.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
    return (code === 'ILS' ? '' : `≈ ${amount(v.toNumber('ILS'), 'ILS')} · `) + `שער הבנק המרכזי האירופי, ${day}`;
  }
  const withDeg = (s) => (P.deg ? s.replace(/\b(a?)(sin|cos|tan)\(/g, (_, a, f) => `${a}${f}d(`) : s);
  const fmt = (v) => {
    const m = window.math;
    if (v && typeof v === 'object' && v.isNode) return v.toString();
    if (typeof v === 'function') return 'פונקציה';
    const code = currencyOf(v);
    if (code) return amount(v.toNumber(code), code);
    return m.format(v, { precision: 12, lowerExp: -9, upperExp: 12 });
  };
  function live() {
    const m = window.math; if (!m) return;
    const s = clean(exprIn.value.trim());
    plotBox.hidden = true;
    hint.textContent = '';
    if (!s) { pretty.replaceChildren(); result.textContent = ''; result.className = 'cx-result'; return; }
    try { window.katex.render(m.parse(s).toTex({ parenthesis: 'auto' }), pretty, { throwOnError: false }); } catch (_) { pretty.textContent = ''; }
    try {
      const v = m.evaluate(withDeg(s), { ans });
      result.textContent = '= ' + fmt(v); result.className = 'cx-result';
      hint.textContent = hintOf(v);
    } catch (e) {
      // a function of x: draw it
      if (/\bx\b/.test(s) && /Undefined symbol x/.test(e.message)) { result.textContent = 'f(x) – הגרף למטה'; result.className = 'cx-result fx'; plot(s); }
      else { result.textContent = ''; result.className = 'cx-result'; }
    }
  }
  function run() {
    const m = window.math, s = clean(exprIn.value.trim()); if (!s) return;
    try {
      const v = m.evaluate(withDeg(s), { ans });
      if (typeof v === 'number' || (v && (v.isComplex || v.isBigNumber || v.isFraction))) ans = v;
      addHistory(s, fmt(v));
      if (pad.auto !== false) padAdd(`${s} = ${fmt(v)}`);
      result.textContent = '= ' + fmt(v); result.className = 'cx-result done';
      hint.textContent = hintOf(v);
    } catch (e) {
      if (/\bx\b/.test(s)) { plot(s); return; }
      result.textContent = 'לא הבנתי: ' + e.message.replace(/\(char \d+\)/, ''); result.className = 'cx-result err';
    }
  }
  let range = 10;
  function plot(s) {
    const m = window.math; let c; try { c = m.compile(withDeg(s)); } catch (_) { return; }
    const W = 600, Hh = 300, N = 400, xs = [], ys = [];
    for (let i = 0; i <= N; i++) { const x = -range + (2 * range * i) / N; let y; try { y = c.evaluate({ x, ans }); } catch (_) { y = NaN; } y = typeof y === 'number' ? y : y?.re ?? NaN; xs.push(x); ys.push(y); }
    const ok = ys.filter(Number.isFinite).sort((a, b) => a - b);
    if (!ok.length) { plotBox.hidden = true; return; }
    let lo = ok[Math.floor(ok.length * 0.03)], hi = ok[Math.ceil(ok.length * 0.97) - 1];
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; } const padY = (hi - lo) * 0.12; lo -= padY; hi += padY;
    const X = (x) => ((x + range) / (2 * range)) * W, Y = (y) => Hh - ((y - lo) / (hi - lo)) * Hh;
    let d = '', pen = false;
    ys.forEach((y, i) => { if (!Number.isFinite(y) || y < lo - (hi - lo) * 2 || y > hi + (hi - lo) * 2) { pen = false; return; } d += (pen ? 'L' : 'M') + X(xs[i]).toFixed(1) + ',' + Y(y).toFixed(1); pen = true; });
    const ax = lo < 0 && hi > 0 ? `<line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="axis"/>` : '';
    const ay = `<line y1="0" y2="${Hh}" x1="${X(0)}" x2="${X(0)}" class="axis"/>`;
    plotBox.hidden = false;
    plotBox.replaceChildren(
      el('div', { class: 'cx-plot-head' }, el('b', {}, 'f(x) = ', el('span', { dir: 'ltr' }, s)), el('span', { class: 'spacer' }),
        el('button', { class: 'btn ghost small', type: 'button', onclick: () => { range = Math.max(0.5, range / 2); plot(s); } }, 'קירוב +'),
        el('button', { class: 'btn ghost small', type: 'button', onclick: () => { range = Math.min(1e4, range * 2); plot(s); } }, 'התרחקות −')),
      el('span', { dir: 'ltr', html: `<svg viewBox="0 0 ${W} ${Hh}" class="cx-svg" preserveAspectRatio="none">${ax}${ay}<path d="${d}" class="curve"/></svg>` }),
      el('div', { class: 'cx-plot-axis', dir: 'ltr' }, el('span', {}, String(-range)), el('span', {}, 'x'), el('span', {}, String(range))));
  }
  /* ---------- the history: every calculation, scrolled back to and brought back with a tap ---------- */
  const histBox = el('div', { class: 'cx-hist', role: 'list' });
  const when = (t) => { const d = new Date(t), today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }); };
  function addHistory(e, r) {
    P.history = [{ e, r, at: Date.now() }, ...(P.history || [])].slice(0, 200); save();
    drawHist();
  }
  function drawHist() {
    const list = P.history || [];
    if (!list.length) { histBox.replaceChildren(el('p', { class: 'muted cx-hist-empty' }, 'החישובים שלכם יופיעו כאן.')); return; }
    histBox.replaceChildren(...list.map((h) => el('div', { class: 'cx-h', role: 'listitem' },
      el('button', { type: 'button', class: 'cx-h-main', dir: 'ltr', title: 'לשחזר את החישוב', onclick: () => { exprIn.value = h.e; live(); exprIn.focus(); } },
        el('span', { class: 'e' }, h.e), el('b', {}, '= ' + h.r)),
      el('small', { class: 'cx-h-at' }, when(h.at || Date.now())),
      el('button', { type: 'button', class: 'cx-h-up', title: 'להוסיף לפתק החישובים', 'aria-label': 'להוסיף לפתק החישובים', onclick: () => padAdd(`${h.e} = ${h.r}`, true) }, '↑ לפתק'))));
  }
  const histCard = el('section', { class: 'card cx-histcard', 'aria-label': 'היסטוריית החישובים' },
    el('div', { class: 'cx-card-head' }, el('b', {}, '🕘 היסטוריה'), el('span', { class: 'spacer' }),
      el('button', { class: 'btn small ghost', type: 'button', onclick: () => { if ((P.history || []).length && confirm('לנקות את כל ההיסטוריה?')) { P.history = []; save(); drawHist(); } } }, 'ניקוי')),
    histBox);

  /* ---------- the calculation note: a floating card above the history ----------
     While it's open, every calculation is written into it (or one from the history, with "↑ לפתק"). Edit it freely, save
     it to פתקים (again and again – it updates the same note), or delete it when done. Closing it with changes that weren't
     saved asks first, and so does leaving the page; until then the draft stays on this device. */
  const PAD = 'helper.calc.pad';
  let pad = { text: '', saved: '', noteId: null, open: true, auto: true };
  try { pad = { ...pad, ...JSON.parse(localStorage.getItem(PAD) || '{}') }; } catch (_) { /* a fresh note */ }
  const keepPad = () => { try { localStorage.setItem(PAD, JSON.stringify(pad)); } catch (_) { /* ignore */ } };
  const dirty = () => !!pad.text.trim() && pad.text !== pad.saved;
  const padText = el('textarea', { class: 'cx-pad-text', dir: 'auto', spellcheck: 'false', 'aria-label': 'פתק החישובים', placeholder: 'החישובים נרשמים כאן. אפשר גם לכתוב הערות ביניהם.' });
  const padState = el('small', { class: 'cx-pad-state' });
  const autoIn = el('input', { type: 'checkbox', checked: pad.auto !== false });
  autoIn.addEventListener('change', () => { pad.auto = autoIn.checked; keepPad(); });
  const padEl = el('section', { class: 'card cx-pad', 'aria-label': 'פתק החישובים' },
    el('div', { class: 'cx-card-head' }, el('b', {}, '📝 פתק החישובים'), padState, el('span', { class: 'spacer' }),
      el('button', { class: 'btn small primary', type: 'button', onclick: () => padSave() }, 'שמירה לפתקים'),
      el('button', { class: 'btn small ghost', type: 'button', onclick: () => padDelete() }, 'מחיקה'),
      el('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'סגירת הפתק', title: 'סגירה', onclick: () => padClose() }, '✕')),
    padText,
    el('label', { class: 'cx-pad-auto' }, autoIn, el('span', {}, 'לרשום כל חישוב לפתק')));
  const padBtn = el('button', { class: 'btn small cx-padbtn', type: 'button', onclick: () => { pad.open = true; keepPad(); padPaint(); padText.focus(); } }, '📝 לפתוח פתק חישובים');
  function padPaint() {
    if (padText.value !== pad.text) padText.value = pad.text;
    padState.textContent = !pad.text.trim() ? '' : dirty() ? (pad.noteId ? 'יש שינויים שלא נשמרו' : 'לא נשמר') : '✓ נשמר בפתקים';
    padState.className = 'cx-pad-state' + (dirty() ? ' warn' : '');
    padEl.hidden = !pad.open; padBtn.hidden = pad.open;
  }
  /** A line into the note (from a calculation, or from the history: then the note opens if it was closed). */
  function padAdd(line, open) {
    if (!pad.open && !open) return;
    pad.open = true;
    pad.text = (pad.text.trim() ? pad.text.replace(/\s+$/, '') + '\n' : '') + line;
    keepPad(); padPaint();
    padText.scrollTop = padText.scrollHeight;
  }
  padText.addEventListener('input', () => { pad.text = padText.value; keepPad(); padPaint(); });
  async function padSave() {
    if (!pad.text.trim()) { toast('הפתק ריק'); return false; }
    try {
      const r = pad.noteId
        ? await api(`/api/notes/${pad.noteId}`, { method: 'PUT', body: { body: pad.text } }).catch((e) => (/404/.test(e.message) ? null : Promise.reject(e)))
        : null;
      const note = r?.note || (await api('/api/notes', { body: { body: pad.text, source: { url: '/tools/calc/', title: 'מחשבון' } } })).note;
      pad.noteId = note.id; pad.saved = pad.text; keepPad(); padPaint();
      toast(`נשמר בפתקים: "${note.title}"`, 'לפתק', () => { location.href = '/tools/notes/?open=' + note.id; });
      return true;
    } catch (_) { toast('לא הצלחתי לשמור – בדקו את החיבור'); return false; }
  }
  function padClear(open = true) { pad = { text: '', saved: '', noteId: null, open, auto: pad.auto }; keepPad(); padPaint(); }
  function padDelete() {
    if (!pad.text.trim()) return;
    const msg = pad.noteId && !dirty() ? 'למחוק את פתק החישובים? (מה שנשמר בפתקים יישאר שם)' : 'למחוק את פתק החישובים? מה שלא נשמר יאבד.';
    if (confirm(msg)) { padClear(); toast('הפתק נמחק'); }
  }
  /** Closing ends this note; with changes that weren't saved, it asks first. */
  function padClose() {
    if (!dirty()) { padClear(false); return; }
    H.modal(el('h2', {}, 'הפתק לא נשמר'), el('p', {}, pad.noteId ? 'יש בפתק החישובים שינויים שלא נשמרו בפתקים.' : 'פתק החישובים לא נשמר בפתקים. אם תסגרו אותו עכשיו, הוא יימחק.'),
      el('div', { class: 'cx-modal-acts' },
        el('button', { class: 'btn primary', type: 'button', onclick: async () => { if (await padSave()) { H.closeModal(); padClear(false); } } }, 'לשמור ולסגור'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => { H.closeModal(); padClear(false); } }, 'לסגור בלי לשמור'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => H.closeModal() }, 'ביטול')));
  }
  // leaving the page with a note that wasn't saved: the browser asks (the draft also stays on this device)
  addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
  function ins(t, back = 0) {
    const a = exprIn.selectionStart ?? exprIn.value.length, b = exprIn.selectionEnd ?? a;
    exprIn.value = exprIn.value.slice(0, a) + t + exprIn.value.slice(b);
    const pos = a + t.length - back; exprIn.focus(); exprIn.setSelectionRange(pos, pos); live();
  }
  exprIn.addEventListener('input', live);
  exprIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  const KEYS = [
    ['sin', () => ins('sin()', 1), 'fn'], ['cos', () => ins('cos()', 1), 'fn'], ['tan', () => ins('tan()', 1), 'fn'], ['π', () => ins('pi'), 'fn'], ['e', () => ins('e'), 'fn'],
    ['ln', () => ins('log()', 1), 'fn'], ['log', () => ins('log10()', 1), 'fn'], ['√', () => ins('sqrt()', 1), 'fn'], ['xʸ', () => ins('^'), 'fn'], ['n!', () => ins('!'), 'fn'],
    ['7', () => ins('7')], ['8', () => ins('8')], ['9', () => ins('9')], ['÷', () => ins('/'), 'op'], ['(', () => ins('('), 'op'],
    ['4', () => ins('4')], ['5', () => ins('5')], ['6', () => ins('6')], ['×', () => ins('*'), 'op'], [')', () => ins(')'), 'op'],
    ['1', () => ins('1')], ['2', () => ins('2')], ['3', () => ins('3')], ['−', () => ins('-'), 'op'], ['x', () => ins('x'), 'fn'],
    ['0', () => ins('0')], ['.', () => ins('.')], ['ans', () => ins('ans'), 'fn'], ['+', () => ins('+'), 'op'], ['=', run, 'eq'],
  ];
  const keypad = el('div', { class: 'cx-keys', dir: 'ltr' },
    el('div', { class: 'cx-row' }, el('button', { class: 'cx-key fn', type: 'button', onclick: () => { exprIn.value = ''; live(); exprIn.focus(); } }, 'C'),
      el('button', { class: 'cx-key fn', type: 'button', onclick: () => { exprIn.value = exprIn.value.slice(0, -1); live(); } }, '⌫'), degBtn, el('button', { class: 'cx-key fn', type: 'button', onclick: () => ins('i') }, 'i'), el('button', { class: 'cx-key fn', type: 'button', onclick: () => ins(', ') }, ',')),
    el('div', { class: 'cx-grid' }, KEYS.map(([t, f, c]) => el('button', { class: 'cx-key ' + (c || ''), type: 'button', onclick: f }, t))));
  const TOOLS = [
    ['נגזרת', 'derivative("x^3*sin(x)", "x")'], ['אינטגרל', 'integrate("x^2", "x", 0, 1)'], ['פתרון משוואה', 'solve("x^3-2x-5", "x", 2)'],
    ['פישוט', 'simplify("2x + 3x - x^2/x")'], ['מטריצה ודטרמיננטה', 'det([[2, 1], [1, 3]])'], ['הופכית', 'inv([[2, 1], [1, 3]])'],
    ['ערכים עצמיים', 'eigs([[2, 1], [1, 2]]).values'], ['מערכת משוואות', 'lusolve([[2, 1], [1, 3]], [3, 5])'], ['מספרים מרוכבים', '(2 + 3i) * (1 - i)'],
    ['אחוזים', '15% מ-80'], ['מטבע', '100 דולר בשקלים'], ['יחידות', '9.81 m/s^2 * 2 s to km/h'], ['קבועים', 'planckConstant * speedOfLight / (500 nm) to eV'], ['גרף', 'sin(x)/x'],
  ];
  const tools = el('div', { class: 'cx-tools' }, el('small', {}, 'כלים – לחצו לדוגמה, ושנו כרצונכם:'),
    el('div', { class: 'cx-chips' }, TOOLS.map(([t, ex]) => el('button', { type: 'button', class: 'cx-chip', onclick: () => { exprIn.value = ex; live(); if (!/\bx\b/.test(ex) || /"x"/.test(ex)) run(); exprIn.focus(); } }, t))));
  const calcView = el('section', { class: 'cx-calc' },
    el('div', { class: 'card cx-screen' }, exprIn, pretty, result, hint),
    el('div', { class: 'cx-calc-cols' }, el('div', {}, keypad), el('div', { class: 'cx-side' }, tools, plotBox, el('div', { class: 'cx-stack' }, padEl, padBtn, histCard))));

  /* ===================== the smart calculator ===================== */
  let image = null, convo = [], last = null;
  const problem = el('textarea', { class: 'cx-problem', dir: 'auto', rows: 5, placeholder: 'כתבו את השאלה במילים או ב־LaTeX – למשל: הוכח או הפרך: כל מטריצה סימטרית ממשית לכסינה. או הדביקו / העלו צילום מסך של התרגיל.' });
  const preview = el('div', { class: 'cx-preview', dir: 'auto' });
  const imgBox = el('div', { class: 'cx-img', hidden: true });
  const file = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const out = el('div', { class: 'cx-out' });
  const subjectRow = el('div', { class: 'cx-subjects', role: 'tablist', 'aria-label': 'הנושא' });
  const bubbles = el('div', { class: 'cx-bubbles' });
  const modeRow = el('div', { class: 'cx-modes', role: 'radiogroup', 'aria-label': 'מה לעשות' });
  const MODES = [['solve', 'לפתור'], ['prove', 'להוכיח או להפריך'], ['explain', 'להסביר'], ['check', 'לבדוק את הפתרון שלי']];
  const go = el('button', { class: 'btn ai-up cx-go', type: 'button', onclick: () => ask() }, '✨ פתרון');
  const plainGo = el('button', { class: 'btn primary', type: 'button', title: 'משוואות, ביטויים ונגזרות – במכשיר, בלי AI', onclick: () => plainSolve() }, '🧮 חישוב');
  // no AI left (a limited account out of credit, with no key of its own): ✨ invites instead of failing
  let noAi = false;
  api('/api/me/ai').then((me) => { noAi = !!me.out && !Object.keys(me.keys || {}).length; go.classList.toggle('offer', noAi); }).catch(() => {});
  const invite = () => (H.aiInvite ? Promise.resolve() : load('/assets/ai-invite.js')).then(() => H.aiInvite?.()).catch(() => toast('אפשר לחבר AI בהגדרות ← חיבור לשירותים'));

  let prevT = 0;
  problem.addEventListener('input', () => { clearTimeout(prevT); prevT = setTimeout(() => { preview.replaceChildren(...(/\$/.test(problem.value) ? [rich(problem.value)] : [])); }, 250); });
  problem.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (noAi ? plainSolve() : ask()); });
  file.addEventListener('change', () => { if (file.files[0]) takeImage(file.files[0]); file.value = ''; });
  // a screenshot pasted, or a picture dropped
  document.addEventListener('paste', (e) => { if (P.tab !== 'smart') return; const f = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))?.getAsFile(); if (f) { e.preventDefault(); takeImage(f); } });
  problem.addEventListener('dragover', (e) => e.preventDefault());
  problem.addEventListener('drop', (e) => { const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); takeImage(f); } });
  async function takeImage(f) {
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const cv = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      image = cv.toDataURL('image/jpeg', 0.88);
      imgBox.hidden = false;
      imgBox.replaceChildren(el('img', { src: image, alt: 'התרגיל' }), el('button', { class: 'btn ghost small', type: 'button', onclick: () => { image = null; imgBox.hidden = true; } }, 'להסיר את התמונה'));
    } catch (_) { toast('לא הצלחתי לקרוא את התמונה'); }
  }
  function drawSubjects() {
    subjectRow.replaceChildren(...CALC_SUBJECTS.map(([id, name]) => el('button', { type: 'button', role: 'tab', class: 'cx-subj', 'aria-selected': String(P.subject === id), onclick: () => { P.subject = id; save(); drawSubjects(); } }, name)));
    const list = P.subject === 'auto' ? Object.values(CALC_FORMULAS).map((l) => l[0]) : CALC_FORMULAS[P.subject] || [];
    bubbles.replaceChildren(...list.map(([name, f]) => {
      const b = el('button', { type: 'button', class: 'cx-bubble', title: 'להוסיף לשאלה', onclick: () => {
        const a = problem.selectionStart ?? problem.value.length;
        problem.value = problem.value.slice(0, a) + ` $${f}$ ` + problem.value.slice(a);
        problem.dispatchEvent(new Event('input')); problem.focus();
      } }, el('small', {}, name), el('span', { class: 'f', dir: 'ltr' }));
      try { window.katex.render(f, b.querySelector('.f'), { throwOnError: false }); } catch (_) { b.querySelector('.f').textContent = f; }
      return b;
    }));
    modeRow.replaceChildren(...MODES.map(([id, name]) => el('button', { type: 'button', role: 'radio', class: 'cx-mode', 'aria-checked': String(P.mode === id), onclick: () => { P.mode = id; save(); drawSubjects(); } }, name)));
  }
  /** followUp: a question about the last answer; asMode: a mode for this one question (the intuitive explanation). */
  async function ask(followUp, asMode) {
    const text = followUp ?? problem.value.trim();
    const mode = asMode || P.mode;
    if (noAi) return invite();
    if (!text && !image) { toast('כתבו את השאלה או צרפו תמונה'); return; }
    go.disabled = true; go.textContent = 'חושב…';
    if (!followUp) { convo = []; out.replaceChildren(); }
    const wait = el('div', { class: 'card cx-wait' }, el('span', { class: 'dots' }), el('span', {}, asMode === 'intuition' ? 'מחפש את הדרך הכי ברורה להסביר…' : followUp ? 'חושב על שאלת ההמשך…' : 'קורא את השאלה, פותר ובודק – זה יכול לקחת עד דקה.'));
    out.append(wait); wait.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    try {
      const r = await api('/api/calc/solve', { body: { text, image: followUp ? null : image, mode, subject: P.subject, history: convo.slice(-4) } });
      r.mode = mode;
      wait.remove();
      last = r;
      convo.push({ q: text || '(תמונה)', a: JSON.stringify({ title: r.title, answer: r.answer, steps: r.steps.map((s) => s.title + ': ' + s.body).join('\n') }).slice(0, 7000) });
      out.append(answerCard(r, followUp));
      if (!followUp) { P.problems = [{ t: r.title || text.slice(0, 60), q: text, mode: P.mode, at: Date.now() }, ...(P.problems || [])].slice(0, 15); save(); drawPast(); }
    } catch (e) {
      wait.remove();
      if (e.code === 'ai_credit_needed') { noAi = true; go.classList.add('offer'); }
      const noAiNow = e.code === 'ai_credit_needed' || /ai_not_configured/.test(e.message);
      out.append(el('div', { class: 'card cx-err' }, el('b', {}, 'לא הצלחתי לפתור כרגע. '),
        el('span', {}, noAiNow ? 'בינתיים "🧮 חישוב" פותר משוואות וביטויים גם בלי AI.' : 'נסו שוב בעוד רגע.')));
    }
    go.disabled = false; go.textContent = '✨ פתרון';
  }
  function answerCard(r, followUp) {
    const verdict = r.verdict === 'true' ? el('span', { class: 'cx-verdict yes' }, '✓ הטענה נכונה') : r.verdict === 'false' ? el('span', { class: 'cx-verdict no' }, '✗ הטענה לא נכונה') : r.verdict === 'unclear' ? el('span', { class: 'cx-verdict maybe' }, '? תלוי בהנחות') : null;
    const asText = () => [r.title, r.problem, ...r.steps.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`), 'תשובה: ' + r.answer, r.check ? 'בדיקה: ' + r.check : ''].filter(Boolean).join('\n\n');
    const more = el('input', { type: 'text', class: 'cx-more', dir: 'auto', placeholder: 'שאלת המשך – "למה המעבר בשלב 2?", "תן דוגמה נגדית אחרת"…' });
    more.addEventListener('keydown', (e) => { if (e.key === 'Enter' && more.value.trim()) { ask(more.value.trim()); more.value = ''; } });
    const intuitive = r.mode === 'intuition';
    return el('article', { class: 'card cx-answer' + (intuitive ? ' intuition' : '') },
      el('div', { class: 'cx-ans-head' }, intuitive ? el('span', { class: 'cx-bulb', 'aria-hidden': 'true' }, '💡') : null, tex(el('h3', {}, intuitive ? (/אינטואיטיב/.test(r.title || '') ? r.title : 'הסבר אינטואיטיבי' + (r.title ? ' · ' + r.title : '')) : r.title || (followUp ? 'המשך' : 'הפתרון'))), verdict, el('span', { class: 'spacer' }),
        el('small', { class: 'by' }, r.by === 'claude' ? 'Claude' : 'Gemini')),
      r.problem && !followUp ? el('div', { class: 'cx-problem-shown' }, el('small', {}, 'השאלה'), rich(r.problem)) : null,
      el('ol', { class: 'cx-steps' }, r.steps.map((s) => el('li', {}, s.title ? el('b', {}, s.title) : null, rich(s.body)))),
      r.answer ? el('div', { class: 'cx-final' }, el('small', {}, intuitive ? 'לזכור' : r.mode === 'prove' ? 'המסקנה' : 'התשובה'), rich(r.answer)) : null,
      r.check ? el('details', { class: 'cx-check' }, el('summary', {}, 'בדיקה'), rich(r.check)) : null,
      r.formulas?.length ? el('div', { class: 'cx-used' }, el('small', {}, 'נוסחאות ומשפטים:'), ...r.formulas.map((f) => rich(/\$/.test(f) ? f : `$${f}$`))) : null,
      el('div', { class: 'cx-ans-acts' },
        intuitive ? null : el('button', { class: 'btn small primary cx-intu', type: 'button', title: 'הרעיון, התמונה, למה זה עובד, איך מזהים ומלכודות נפוצות', onclick: (e) => { e.currentTarget.disabled = true; ask('הסבר לי את הפתרון הזה באופן אינטואיטיבי', 'intuition'); } }, '💡 הסבר אינטואיטיבי'),
        el('button', { class: 'btn small', type: 'button', onclick: async () => { try { await api('/api/notes', { body: { body: asText(), source: { url: location.href, title: 'מחשבון חכם' } } }); toast('נשמר בפתקים', 'לפתקים', () => { location.href = '/tools/notes/'; }); } catch (_) { toast('לא נשמר'); } } }, '📝 שמירה כפתק'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => { navigator.clipboard?.writeText(asText()); toast('הועתק (עם ה־LaTeX)'); } }, 'העתקה')),
      more);
  }
  /* ---------- 🧮 חישוב: the smart tab without AI ----------
     An equation → its real roots (between −100 and 100); a function of one letter → its derivative and zeros, and a
     graph in the calculator; a plain expression → its value. A word problem or a proof stays with ✨. */
  const num = (r) => {
    const f = CalcPlain.asFraction(r);
    if (f) return f;
    // a simple multiple of π (the roots of sin and cos): π/6, 5π/6, −2π/3
    for (let d = 1; d <= 12; d++) {
      const k = Math.round((r / Math.PI) * d);
      if (k && Math.abs((r / Math.PI) * d - k) < 1e-8) { const g = (a, b) => (b ? g(b, a % b) : a), c = g(Math.abs(k), d); const n = k / c, dd = d / c; return `${n < 0 ? '−' : ''}${Math.abs(n) === 1 ? '' : Math.abs(n)}π${dd === 1 ? '' : '/' + dd}`; }
    }
    return window.math.format(r, { precision: 10 });
  };
  /** the roots as a line (left to right), and a Hebrew note under it: none found, or (a periodic equation) how many more */
  const rootList = (v, rs, none) => {
    if (!rs.length) return { note: none };
    const near = rs.length > 8 ? [...rs].sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, 6).sort((a, b) => a - b) : rs;
    return { math: near.map((r) => `${v} = ${num(r)}`).join(',   '),
      note: rs.length > near.length ? `ועוד ${rs.length - near.length} פתרונות בין 100− ל־100. נראה שהמשוואה מחזורית.` : '' };
  };
  function plainSolve() {
    const m = window.math;
    if (!m || !window.CalcPlain) { toast('ספריות החישוב עוד נטענות'); return; }
    const raw = problem.value.trim();
    if (!raw) { toast(image ? 'את התמונה קורא רק ✨ העוזר החכם. אפשר להקליד את התרגיל.' : 'כתבו תרגיל או משוואה'); return; }
    const s = clean(CalcPlain.fromLatex(raw));
    const rows = [];
    let title = 'חישוב', toCalc = null;
    try {
      const eqn = CalcPlain.equation(s);
      if (eqn) {
        title = 'פתרון המשוואה';
        const c = m.compile(withDeg(eqn.expr));
        const rs = CalcPlain.roots((x) => { const y = c.evaluate({ [eqn.v]: x, ans }); return typeof y === 'number' ? y : NaN; });
        rows.push(['הפתרונות', rootList(eqn.v, rs, 'לא מצאתי פתרון ממשי בין 100− ל־100')]);
        if (eqn.v === 'x') toCalc = eqn.expr;
      } else {
        const node = m.parse(withDeg(s));
        const free = [...new Set(node.filter((n) => n.isSymbolNode && !(n.name in m) && n.name !== 'ans' && !(money?.codes.has(n.name))).map((n) => n.name))];
        if (free.length === 1) {
          const v = free[0];
          title = `פונקציה של ${v}`;
          rows.push(['הנגזרת', m.simplify(m.derivative(node, v)).toString()]);
          const c = node.compile();
          const rs = CalcPlain.roots((x) => { const y = c.evaluate({ [v]: x, ans }); return typeof y === 'number' ? y : NaN; });
          rows.push(['האפסים', rootList(v, rs, 'אין אפסים בין 100− ל־100')]);
          if (v === 'x') toCalc = s;
        } else if (free.length) {
          throw new Error('more than one letter');
        } else {
          const val = node.evaluate({ ans });
          rows.push(['התוצאה', fmt(val)]);
          const h = hintOf(val);
          if (h) rows.push(['', { note: h }]);
        }
      }
    } catch (_) {
      out.replaceChildren(el('div', { class: 'card cx-err' }, el('b', {}, 'החישוב בלי AI מבין ביטויים ומשוואות. '),
        el('span', {}, 'למשל x^2 - 5x + 6 = 0, או \\frac{1}{2} + \\sqrt{2}. שאלה במילים, הוכחה או הסבר – "✨ פתרון".')));
      return;
    }
    const shown = el('div', { class: 'cx-problem-shown', dir: 'ltr' });
    try { window.katex.render(m.parse(s.replace(/(?<![<>!=])=(?!=)/, '==')).toTex({ parenthesis: 'auto' }).replace('==', '='), shown, { throwOnError: false }); } catch (_) { shown.textContent = s; }
    out.replaceChildren(el('article', { class: 'card cx-answer' },
      el('div', { class: 'cx-ans-head' }, el('h3', {}, title), el('span', { class: 'spacer' }), el('small', { class: 'by' }, 'בלי AI')),
      shown,
      ...rows.map(([k, v]) => {
        const { math, note } = typeof v === 'string' ? { math: v, note: '' } : v;
        return el('div', { class: 'cx-final' }, k ? el('small', {}, k) : null, math ? el('div', { dir: 'ltr' }, math) : null, note ? el('div', { class: 'muted' }, note) : null);
      }),
      el('div', { class: 'cx-ans-acts' },
        toCalc ? el('button', { class: 'btn small', type: 'button', onclick: () => { exprIn.value = toCalc; show('calc'); live(); } }, '📈 גרף במחשבון') : null,
        el('small', { class: 'muted' }, 'הסבר שלב אחר שלב – "✨ פתרון".'))));
  }
  const pastBox = el('div', { class: 'cx-past' });
  function drawPast() {
    const list = P.problems || [];
    pastBox.replaceChildren(...(list.length ? [el('small', {}, 'שאלות קודמות'), ...list.slice(0, 8).map((p) => el('button', { type: 'button', class: 'cx-chip', title: p.q, onclick: () => { problem.value = p.q; P.mode = p.mode || P.mode; save(); drawSubjects(); problem.dispatchEvent(new Event('input')); problem.focus(); } }, p.t))] : []));
  }
  const smartView = el('section', { class: 'cx-smart' },
    el('div', { class: 'card cx-ask' },
      el('div', { class: 'cx-ask-top' }, el('b', {}, 'מה לעשות?'), modeRow),
      subjectRow, bubbles,
      problem, preview, imgBox,
      el('div', { class: 'cx-ask-acts' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => file.click() }, '📷 תמונה או צילום מסך'), file,
        el('small', { class: 'muted' }, 'אפשר גם להדביק צילום מסך (Ctrl+V)'), el('span', { class: 'spacer' }), el('div', { class: 'ai-pair' }, plainGo, go))),
    out, pastBox);

  /* ===================== the page ===================== */
  const tabs = el('div', { class: 'cx-tabs', role: 'tablist' });
  const views = { calc: calcView, smart: smartView };
  function show(t) {
    P.tab = t; save();
    tabs.replaceChildren(...[['calc', '🧮 מחשבון'], ['smart', '✨ מחשבון חכם']].map(([id, n]) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(t === id), onclick: () => show(id) }, n)));
    calcView.hidden = t !== 'calc'; smartView.hidden = t !== 'smart';
    (t === 'calc' ? exprIn : problem).focus({ preventScroll: true });
  }
  root.append(el('div', { class: 'cx' }, el('a', { class: 'folder-back', href: '/tools/' }, '‹ כלים'), el('div', { class: 'cx-head' }, el('h1', {}, 'מחשבון'), tabs), calcView, smartView));
  show(P.tab || 'calc');
  padPaint(); drawHist(); drawPast();
  try { await libs; setupMath(); drawSubjects(); live(); setupMoney(); } catch (_) { toast('ספריות החישוב לא נטענו – בדקו את החיבור'); }
})();
