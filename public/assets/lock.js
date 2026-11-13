/* The locks' look (docs/decisions.md, "Locks and privacy"; design). It draws and moves; the server decides.
   Loads its own lock.css.

     Lock.padlock('open')                  → <span class="pl">: the padlock drawing, open or closed
     await Lock.close(pl)                  → the shackle drops with a small bounce (~300 ms; none with reduced motion)
     const s = Lock.screen({               → the lock screen over everything; the page behind is blurred and made inert
       who: 'שם',                          //   optional line under the title
       passkey: true,                      //   show the passkey key
       onCode: async (code) => ({ ok }),   //   4 digits typed: ask the server; { ok: false, msg, wait } on a wrong code
       onPasskey: async () => ({ ok }),    //   the passkey key; same answer
       onForgot: () => {} });              //   "שכחתי את הקוד"
     await s.done                          → resolved once unlocked (the screen fades and is gone)
     s.say('…', true) / s.pause('…') / s.resume() / s.destroy()
     Setting a code uses the same screen: Lock.screen({ title: 'קוד חדש', hint: '4 ספרות', onCode, onCancel }), then again
     with hint 'עוד פעם, לאישור' (onCode answers { ok: false, msg: 'הקודים לא זהים' } when they differ).
     Lock.warnCard({ onSetup, onLater, onNever }) → the first-visit window's content, for H.modal(…)

   The menu button with its move, as ai-features wires it:
     const pl = Lock.padlock('open'); btn.className = 'pl-btn'; btn.append(pl);
     btn.onclick = async () => { await Lock.close(pl); await H.api('/api/lock/lock', { method: 'POST' }); showLockScreen(); };
*/
(() => {
  const reduce = () => (window.H?.reducedMotion ? H.reducedMotion() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  const wait = (ms) => new Promise((ok) => setTimeout(ok, reduce() ? 0 : ms));
  function ensureCss() {
    if (document.querySelector('link[href*="/assets/lock.css"]')) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/lock.css'; document.head.append(l);
  }
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (inner, vb = '0 0 24 24') => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', vb); s.setAttribute('aria-hidden', 'true'); s.innerHTML = inner; return s; };
  // the padlock: a rounded body with a keyhole, and the shackle on its own so it can swing open
  const PADLOCK = '<path class="pl-shackle" d="M8 11V7.6a4 4 0 0 1 8 0V11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<g class="pl-body"><rect x="4.5" y="10.5" width="15" height="10.5" rx="3" fill="currentColor"/>'
    + '<circle cx="12" cy="15.2" r="1.6" style="fill:var(--card,#fff)"/><rect x="11.25" y="15.6" width="1.5" height="2.8" rx=".75" style="fill:var(--card,#fff)"/></g>';
  const FINGER = '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6.5 8.5a6.5 6.5 0 0 1 11 0"/><path d="M5 12.5c0-3.9 3.1-7 7-7s7 3.1 7 7v1"/>'
    + '<path d="M8.5 19.5c-.6-1.5-1-3.2-1-5a4.5 4.5 0 0 1 9 0v1.5"/><path d="M12 14.5v1.5c0 2 .6 3.8 1.6 5.2"/><path d="M10 13.5a2 2 0 0 1 4 0V16c0 1.4.4 2.7 1 3.8"/><path d="M16.5 18.5c.3-.8.5-1.6.5-2.5"/></g>';
  const BACK = '<path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M11.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>';

  function padlock(state = 'open') {
    ensureCss();
    const s = document.createElement('span'); s.className = 'pl'; s.dataset.state = state; s.append(svg(PADLOCK)); return s;
  }
  async function close(pl) {
    pl.dataset.state = 'closed'; pl.classList.remove('snap'); void pl.offsetWidth; pl.classList.add('snap');
    await wait(320);
  }

  function screen(opts = {}) {
    ensureCss();
    const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (v == null) continue; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else e.setAttribute(k, v); } e.append(...kids.filter((k) => k != null)); return e; };
    let code = '', busy = false, paused = false, finished = false, resolveDone;
    const done = new Promise((ok) => { resolveDone = ok; });
    const dots = el('div', { class: 'lk-dots', role: 'img', 'aria-label': 'הוקלדו 0 מתוך 4 ספרות' }, ...[0, 1, 2, 3].map(() => el('i')));
    const msg = el('p', { class: 'lk-msg', 'aria-live': 'polite' });
    const key = (label, props, ...kids) => el('button', { type: 'button', class: 'lk-key', ...props }, ...(kids.length ? kids : [label]));
    const keys = el('div', { class: 'lk-keys' });
    for (const d of '123456789') keys.append(key(d, { 'data-d': d }));
    keys.append(opts.passkey ? key('', { class: 'lk-key ghost bio', 'aria-label': 'פתיחה בטביעת אצבע', 'data-bio': '1' }, svg(FINGER)) : el('span'));
    keys.append(key('0', { 'data-d': '0' }));
    keys.append(key('', { class: 'lk-key ghost', 'aria-label': 'מחיקה', 'data-back': '1' }, svg(BACK)));
    const mark = el('div', { class: 'lk-mark' }, padlock('closed'));
    const box = el('div', { class: 'lk-box', tabindex: '-1' },
      mark, el('h2', { id: 'lk-title' }, opts.title || 'האוהל נעול'), opts.who ? el('p', { class: 'lk-who' }, opts.who) : null,
      el('p', { class: 'lk-msg', style: 'margin:0' }, opts.hint || 'הקוד שלך'), dots, msg, keys,
      opts.onForgot ? el('button', { type: 'button', class: 'lk-forgot', onclick: () => opts.onForgot() }, 'שכחתי את הקוד') : null,
      opts.onCancel ? el('button', { type: 'button', class: 'lk-forgot', onclick: () => { destroy(); opts.onCancel(); resolveDone(false); } }, 'ביטול') : null);
    const root = el('div', { class: 'lk-screen', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lk-title' }, box);
    // the page behind: out of reach of the pointer, the keyboard and screen readers while locked
    const others = [...document.body.children].filter((c) => !c.inert);
    others.forEach((c) => { c.inert = true; });
    document.body.append(root);
    box.focus({ preventScroll: true });

    const paint = () => {
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i < code.length));
      dots.setAttribute('aria-label', `הוקלדו ${code.length} מתוך 4 ספרות`);
    };
    const say = (text, warn = false) => { msg.textContent = text || ''; msg.classList.toggle('warn', !!warn); };
    const answer = async (r) => {
      if (r && r.ok) {
        dots.classList.add('right'); [...dots.children].forEach((d) => d.classList.add('on'));
        await wait(220); root.classList.add('opening'); await wait(320); destroy(); resolveDone(true); return;
      }
      dots.classList.remove('wrong'); void dots.offsetWidth; dots.classList.add('wrong');
      navigator.vibrate?.([30, 40, 30]);
      await wait(420);
      dots.classList.remove('wrong'); code = ''; paint();
      say(r?.msg || 'הקוד לא נכון', true);
      if (r?.wait) pause(r.msg);
    };
    const submit = async () => {
      busy = true;
      try { await answer(await opts.onCode?.(code)); } catch { await answer({ ok: false, msg: 'משהו השתבש. אפשר לנסות שוב.' }); }
      busy = false;
    };
    const press = (d) => {
      if (busy || paused || finished) return;
      if (d === 'back') { code = code.slice(0, -1); paint(); return; }
      if (code.length >= 4) return;
      code += d; paint(); if (code.length === 1) say('');
      if (code.length === 4) submit();
    };
    keys.addEventListener('click', async (e) => {
      const b = e.target.closest('.lk-key'); if (!b || b.disabled) return;
      if (b.dataset.d) press(b.dataset.d);
      else if (b.dataset.back) press('back');
      else if (b.dataset.bio && !busy && !finished) { busy = true; try { await answer(await opts.onPasskey?.()); } catch { say('טביעת האצבע לא הצליחה. אפשר להקליד את הקוד.', true); } busy = false; }
    });
    // the keyboard: digits and Backspace, and the key lights up as if pressed
    const onKey = (e) => {
      if (finished) return;
      const d = /^[0-9]$/.test(e.key) ? e.key : e.code?.startsWith('Numpad') && /^[0-9]$/.test(e.code.slice(6)) ? e.code.slice(6) : null;
      if (d || e.key === 'Backspace') {
        e.preventDefault();
        const b = d ? keys.querySelector(`[data-d="${d}"]`) : keys.querySelector('[data-back]');
        b?.classList.add('press'); setTimeout(() => b?.classList.remove('press'), 110);
        press(d || 'back');
      }
    };
    document.addEventListener('keydown', onKey, true);
    function pause(text) { paused = true; keys.classList.add('paused'); if (text) say(text, true); }
    function resume() { paused = false; keys.classList.remove('paused'); say(''); }
    function destroy() {
      if (finished) return; finished = true;
      document.removeEventListener('keydown', onKey, true);
      others.forEach((c) => { c.inert = false; });
      root.remove();
    }
    return { el: root, done, say, pause, resume, destroy };
  }

  function warnCard({ onSetup, onLater, onNever } = {}) {
    ensureCss();
    const box = document.createElement('div'); box.className = 'lk-warn';
    const mark = document.createElement('div'); mark.className = 'lk-mark'; mark.append(padlock('closed'));
    const h = document.createElement('h2'); h.textContent = 'כדאי לנעול את העץ';
    const p = document.createElement('p');
    p.textContent = 'עץ המשפחה פתוח לכל מי שמחובר לחשבון שלך במכשיר הזה. אפשר לנעול אותו בקוד של 4 ספרות או בטביעת אצבע, ולבחור גם נעילה לכל האפליקציה.';
    const acts = document.createElement('div'); acts.className = 'lk-warn-acts';
    const b = (cls, text, fn) => { const x = document.createElement('button'); x.type = 'button'; x.className = cls; x.textContent = text; x.addEventListener('click', () => fn?.()); return x; };
    acts.append(b('btn primary', 'להגדיר עכשיו', onSetup), b('btn', 'אחר כך', onLater), b('lk-never', 'לא להציג שוב', onNever));
    box.append(mark, h, p, acts);
    return box;
  }

  window.Lock = { padlock, close, screen, warnCard };
})();
