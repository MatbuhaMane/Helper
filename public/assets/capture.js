/* "שמירה כפתק": mark text anywhere on the site – a news article, a recipe, a song, the smart calculator's answer – and a
   small button by the selection saves it to פתקים (with a title the helper writes, the date, and a link back here). */
(() => {
  const { el, api, toast } = H;
  const btn = el('button', { class: 'cap-btn', type: 'button', hidden: true, 'aria-label': 'שמירת הטקסט המסומן כפתק' }, '📝 שמירה כפתק');
  document.body.append(btn);
  let text = '', t = 0;
  /** The selection as text; a typeset formula (KaTeX) is kept as its LaTeX source, $…$, not as the screen's letters. */
  function selectionText(sel) {
    const frag = sel.getRangeAt(0).cloneContents();
    if (!frag.querySelector('.katex')) return sel.toString().trim();
    frag.querySelectorAll('.katex-display, .katex').forEach((k) => {
      if (!frag.contains(k)) return;   // (already replaced inside a display block)
      const src = k.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      if (src == null) return;
      const display = k.classList.contains('katex-display');
      k.replaceWith(document.createTextNode(display ? `\n$$${src}$$\n` : `$${src}$`));
    });
    const box = document.createElement('div'); box.append(frag);
    box.querySelectorAll('p, li, br').forEach((n) => n.append('\n'));
    return box.textContent.replace(/\n{3,}/g, '\n\n').trim();
  }
  const editable = (n) => !!(n && (n.nodeType === 1 ? n : n.parentElement)?.closest('input, textarea, [contenteditable=""], [contenteditable="true"], .cap-btn'));
  function place() {
    const sel = document.getSelection();
    const s = sel && !sel.isCollapsed ? selectionText(sel) : '';
    if (s.length < 3 || editable(sel.anchorNode) || editable(sel.focusNode)) { btn.hidden = true; text = ''; return; }
    text = s;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r.width && !r.height) { btn.hidden = true; return; }
    btn.hidden = false;
    const bw = btn.offsetWidth || 130, bh = btn.offsetHeight || 34;
    // above the selection (below it if there is no room), kept on screen; screen coordinates
    let x = r.left + r.width / 2 - bw / 2, y = r.top - bh - 8;
    if (y < 8) y = r.bottom + 8;
    btn.style.left = Math.max(8, Math.min(innerWidth - bw - 8, x)) + 'px';
    btn.style.top = Math.max(8, Math.min(innerHeight - bh - 8, y)) + 'px';
  }
  document.addEventListener('selectionchange', () => { clearTimeout(t); t = setTimeout(place, 220); });
  addEventListener('scroll', () => { if (!btn.hidden) place(); }, { passive: true });
  btn.addEventListener('pointerdown', (e) => e.preventDefault());   // keep the selection
  btn.addEventListener('click', async () => {
    if (!text) return;
    const body = text.slice(0, 50000);
    btn.disabled = true; btn.textContent = 'שומר…';
    // where it came from: the page, or (inside the songbook window) the songbook
    const top = (() => { try { return window.top.location.href; } catch (_) { return location.href; } })();
    const src = { url: location.href.replace(/([?&])embed=1&?/, '$1').replace(/[?&]$/, ''), title: document.title || '' };
    if (top !== location.href && !src.title) src.title = 'העוזר';
    try {
      const r = await api('/api/notes', { body: { body, source: src } });
      toast(`נשמר בפתקים: "${r.note.title}"`, 'לפתק', () => { (window.top || window).location.href = '/tools/notes/?open=' + r.note.id; });
      document.getSelection()?.removeAllRanges();
    } catch (_) { toast('לא הצלחתי לשמור את הפתק'); }
    btn.disabled = false; btn.textContent = '📝 שמירה כפתק'; btn.hidden = true;
  });
  H.saveNote = (body, source) => api('/api/notes', { body: { body, source: source || { url: location.href, title: document.title } } });
})();
