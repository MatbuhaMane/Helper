/* H.sheet – the hub's full-page sheet: a card (a recipe, an article) flips over and grows to fill the page,
 * and closing flips it back into the card. Needs sheet.css.
 *   H.sheet.open(cardElement | null, content, { onLeave, className, size })   // open, or swap the content if already open
 *   H.sheet.resize('panel' | 'large' | 'full');  H.sheet.close();  H.sheet.isOpen
 * size: 'full' (the whole page, the default), 'panel' (a reading panel) or 'large' (a bigger panel).
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
    let origin = null, onLeave = null, closing = false, extra = '', size = 'full';
    /** Where the open sheet sits: the whole page, a reading panel, or a large panel (on a phone both panels rise from the bottom). */
    const target = (s) => {
      const vw = document.documentElement.clientWidth, vh = innerHeight, phone = vw < 700;
      if (s === 'full') return { x: 0, y: 0, w: vw, h: vh };
      const w = phone ? vw : Math.min(s === 'large' ? 980 : 680, vw - 48);
      const h = phone ? Math.round(vh * (s === 'large' ? 0.94 : 0.84)) : Math.min(s === 'large' ? vh - 48 : Math.round(vh * 0.82), s === 'large' ? 1200 : 760);
      return { x: Math.round((vw - w) / 2), y: phone ? vh - h : Math.round((vh - h) / 2), w, h };
    };
    const aim = (s) => {
      size = s;
      const t = target(s);
      flip.style.setProperty('--tx', t.x + 'px'); flip.style.setProperty('--ty', t.y + 'px');
      flip.style.setProperty('--tw', t.w + 'px'); flip.style.setProperty('--th', t.h + 'px');
      root.classList.toggle('sized', s !== 'full');
      root.dataset.size = s;
    };
    addEventListener('resize', () => { if (!root.hidden) aim(size); });
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
      if (!root.hidden && !closing) { aim(opts.size || size); return; } // already open: new content (and maybe a new size), animated
      closing = false;
      aim(opts.size || 'full');
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
    return { open, close, body, resize: (s) => { if (!root.hidden) aim(s); }, get size() { return size; }, get isOpen() { return !root.hidden && !closing; } };
  }

  const get = () => (made = made || make());
  H.sheet = {
    open: (...a) => get().open(...a),
    close: () => made && made.close(),
    resize: (s) => made && made.resize(s),
    get size() { return made ? made.size : 'full'; },
    get isOpen() { return !!made && made.isOpen; },
    get body() { return get().body; },
  };
})();
