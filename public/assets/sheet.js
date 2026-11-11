/* H.sheet – the hub's full-page sheet: a card (a recipe, an article) flips over and grows to fill the page,
 * and closing flips it back into the card. Needs sheet.css.
 *   H.sheet.open(cardElement | null, content, { onLeave, className })   // open, or swap the content if already open
 *   H.sheet.close();  H.sheet.isOpen
 * onLeave runs when the sheet closes or its content is replaced (e.g. to save an editor).
 */
(() => {
  'use strict';
  const { el } = H;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let made = null;

  function make() {
    const front = el('div', { class: 'rs-face rs-front', 'aria-hidden': 'true' });
    const body = el('div', { class: 'rs-body' });
    const closeBtn = el('button', { class: 'modal-close rs-close', 'aria-label': 'סגור' }, '✕');
    const back = el('div', { class: 'rs-face rs-back' }, closeBtn, body);
    const flip = el('div', { class: 'rs-flip' }, front, back);
    const root = el('div', { class: 'rsheet', hidden: true, role: 'dialog', 'aria-modal': 'true' }, el('div', { class: 'rs-shade' }), flip);
    document.body.append(root);
    let origin = null, onLeave = null, closing = false, extra = '';
    // Where the card is, in logical terms: --x is its distance from the start edge (the right, in Hebrew).
    const place = (r) => {
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
      flip.style.setProperty('--x', (rtl ? document.documentElement.clientWidth - r.right : r.left) + 'px');
      flip.style.setProperty('--y', r.top + 'px');
      flip.style.setProperty('--w', r.width + 'px'); flip.style.setProperty('--h', r.height + 'px');
    };
    const leave = () => { const f = onLeave; onLeave = null; if (f) f(); };
    function open(from, content, opts = {}) {
      leave();
      onLeave = opts.onLeave || null;
      if (extra) root.classList.remove(...extra.split(' '));
      extra = opts.className || '';
      if (extra) root.classList.add(...extra.split(' '));
      body.replaceChildren(...[].concat(content).filter(Boolean));
      body.scrollTop = 0;
      if (!root.hidden && !closing) return; // already open: just show the new content
      closing = false;
      origin = from && document.body.contains(from) ? from : null;
      root.hidden = false;
      document.body.classList.add('sheet-open');
      if (!origin || reduceMotion()) { root.classList.add('open', 'instant'); return; }
      front.replaceChildren(origin.cloneNode(true));
      place(origin.getBoundingClientRect());
      root.classList.remove('open', 'instant');
      void flip.offsetWidth; // start from the card, then animate to the full page
      requestAnimationFrame(() => root.classList.add('open'));
    }
    function close() {
      if (root.hidden || closing) return;
      leave();
      closing = true;
      const done = () => { if (!closing) return; closing = false; root.hidden = true; root.classList.remove('open', 'instant'); document.body.classList.remove('sheet-open'); body.replaceChildren(); };
      if (origin && document.body.contains(origin) && !reduceMotion() && !root.classList.contains('instant')) {
        front.replaceChildren(origin.cloneNode(true));
        place(origin.getBoundingClientRect());
        root.classList.remove('open');
        const onEnd = (e) => { if (e.target === flip && e.propertyName === 'transform') { flip.removeEventListener('transitionend', onEnd); done(); } };
        flip.addEventListener('transitionend', onEnd);
        setTimeout(() => { flip.removeEventListener('transitionend', onEnd); done(); }, 1300);
      } else done();
    }
    closeBtn.addEventListener('click', close);
    root.querySelector('.rs-shade').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) { e.stopImmediatePropagation(); close(); } }, true);
    return { open, close, body, get isOpen() { return !root.hidden && !closing; } };
  }

  const get = () => (made = made || make());
  H.sheet = {
    open: (...a) => get().open(...a),
    close: () => made && made.close(),
    get isOpen() { return !!made && made.isOpen; },
    get body() { return get().body; },
  };
})();
