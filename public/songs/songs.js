/* שירון: one search over Shironet (lyrics), Tab4u (chords), the Shabbat zemirot and the family's own songbook, shown
   as cards (in the style of Inoreader's card view); a song opens in a reader inside the app: full lyrics, or chords
   with transpose and guitar / piano diagrams. Shironet and Tab4u songs are fetched live from their sites when opened
   and credited there; the family's songbook keeps links and its own chord sheets. */
(async () => {
  'use strict';
  const { el, api, toast } = H;
  H.header('שירון', '🎵');
  await H.requireLogin();
  const $ = (s) => document.querySelector(s);
  const C = window.Chords;

  const PREFS_KEY = 'helper.songs.prefs';
  let prefs = { size: 1, instrument: 'guitar' };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch (_) { /* ignore */ }
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) { /* ignore */ } };

  const TABS = [
    ['all', 'הכל'], ['lyrics', 'מילים'], ['chords', 'אקורדים'], ['zemirot', 'זמירות שבת'], ['mine', 'השירון שלנו'], ['dict', 'מילון אקורדים'],
  ];
  let tab = (location.hash.slice(1) || 'all');
  if (!TABS.some((t) => t[0] === tab)) tab = 'all';
  let query = '';
  let zemirot = null, mine = [], results = { lyrics: [], chords: [], errors: [] };

  const SOURCES = {
    shironet: { label: 'שירונט', site: 'https://shironet.mako.co.il' },
    tab4u: { label: 'Tab4u', site: 'https://www.tab4u.com' },
    google: { label: 'Google' },
    zemirot: { label: 'זמירות שבת' },
    mine: { label: 'השירון שלנו' },
  };

  /* ---------- data ---------- */
  async function loadZemirot() { zemirot ||= await fetch('/songbook/zemirot.json').then((r) => r.json()); return zemirot; }
  async function loadMine() { mine = (await api('/api/songs')).songs || []; return mine; }
  const norm = (s) => String(s || '').replace(/[֑-ׇ]/g, '').toLowerCase();   // ignore nikud when matching
  const matches = (q, ...fields) => !q || fields.some((f) => norm(f).includes(norm(q)));

  async function search(q) {
    results = { lyrics: [], chords: [], errors: [], loading: true };
    render();
    const enc = encodeURIComponent(q);
    const [a, b] = await Promise.all([
      api(`/api/songs/search?kind=lyrics&q=${enc}`).catch(() => ({ results: [], error: 'שירונט לא ענה' })),
      api(`/api/songs/search?kind=chords&q=${enc}`).catch(() => ({ results: [], error: 'Tab4u לא ענה' })),
    ]);
    if (q !== query) return;
    results = { lyrics: a.results || [], chords: b.results || [], errors: [a.error, b.error].filter(Boolean) };
    render();
  }

  /* ---------- cards ---------- */
  const COVER_COLORS = ['#55622f', '#9c7a55', '#7a8a45', '#6b5a3e', '#4f6a5c', '#8a6a4a'];
  function cover(title, image, source) {
    const c = el('div', { class: 'cover' });
    if (image) {
      const img = el('img', { src: image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      img.onerror = () => { img.remove(); c.append(letter()); };
      c.append(img);
    } else c.append(letter());
    c.append(el('span', { class: 'badge ' + source }, SOURCES[source]?.label || ''));
    return c;
    function letter() {
      const ch = norm(title).replace(/[^א-תa-z0-9]/g, '')[0] || '♪';
      const color = COVER_COLORS[[...String(title)].reduce((a, x) => a + x.charCodeAt(0), 0) % COVER_COLORS.length];
      return el('div', { class: 'letter', style: `background: linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 60%, #2e2a1e))` }, ch);
    }
  }
  function card({ title, artist, snippet, image, source, onOpen, saved, onSave, extra }) {
    const node = el('article', { class: 'scard', tabindex: '0', role: 'button', 'aria-label': `${title}${artist ? ' – ' + artist : ''}` },
      cover(source === 'shironet' || source === 'tab4u' ? (artist || title) : title, image, source),
      el('div', { class: 'cbody' },
        el('h3', {}, title),
        artist ? el('div', { class: 'artist' }, artist) : null,
        snippet ? el('p', { class: 'snip' }, snippet) : null),
      el('div', { class: 'cfoot' },
        extra || el('span', { class: 'src' }, SOURCES[source]?.label || ''),
        el('span', { class: 'spacer' }),
        onSave ? el('button', { class: 'mini star', title: saved ? 'בשירון שלנו' : 'שמירה לשירון שלנו', 'aria-label': 'שמירה', 'aria-pressed': String(!!saved),
          onclick: (e) => { e.stopPropagation(); onSave(e.currentTarget); } }, saved ? '★' : '☆') : null));
    node.addEventListener('click', onOpen);
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter') onOpen(); });
    return node;
  }
  const savedUrl = (url) => mine.some((s) => s.url === url);
  async function saveLink(hit, btn) {
    if (savedUrl(hit.url)) { toast('כבר בשירון שלנו'); return; }
    await api('/api/songs', { body: { title: hit.title, artist: hit.artist, kind: hit.source === 'tab4u' ? 'chords' : 'lyrics', url: hit.url } });
    await loadMine();
    if (btn) { btn.textContent = '★'; btn.setAttribute('aria-pressed', 'true'); }
    toast('נשמר בשירון שלנו');
  }
  const hitCard = (h) => card({
    title: h.title, artist: h.artist, snippet: h.snippet, image: h.image, source: h.source,
    extra: el('span', { class: 'src' }, h.source === 'tab4u' ? 'אקורדים · Tab4u' : 'מילים · שירונט', h.rating ? el('span', { class: 'rate' }, ' ★' + h.rating) : null),
    saved: savedUrl(h.url), onSave: (b) => saveLink(h, b), onOpen: () => openRemote(h),
  });
  const googleCard = (kind) => card({
    title: `${query} – ${kind === 'chords' ? 'אקורדים' : 'מילים'}`, artist: 'חיפוש בגוגל', source: 'google',
    snippet: 'פותח את גוגל בלשונית חדשה עם אותו חיפוש',
    onOpen: () => window.open(`https://www.google.com/search?q=${encodeURIComponent(query + (kind === 'chords' ? ' אקורדים' : ' מילים לשיר'))}`, '_blank', 'noopener'),
  });
  const zemerCard = (z) => card({
    title: z.title, artist: zemirot.sections[z.section], source: 'zemirot',
    snippet: z.lines.slice(0, 2).map((l) => l.t).join(' '), onOpen: () => openZemer(z),
  });
  const mineCard = (s) => card({
    title: s.title, artist: s.artist, source: s.url ? (/tab4u/.test(s.url) ? 'tab4u' : 'shironet') : 'mine',
    snippet: s.body ? s.body.split('\n').filter((l) => l.trim() && !C.isChordLine(l)).slice(0, 2).join(' ') : (s.url ? 'נשמר מ' + (/tab4u/.test(s.url) ? 'Tab4u' : 'שירונט') : ''),
    extra: el('span', { class: 'src' }, s.body ? (s.kind === 'chords' ? 'אקורדים שלנו' : 'מילים שלנו') : 'קישור שמור'),
    saved: true, onSave: () => removeMine(s), onOpen: () => (s.body ? openOwn(s) : openRemote({ ...s, source: /tab4u/.test(s.url) ? 'tab4u' : 'shironet' })),
  });
  async function removeMine(s) {
    if (!confirm(`להסיר את "${s.title}" מהשירון שלנו?`)) return;
    await api(`/api/songs/${s.id}`, { method: 'DELETE' });
    await loadMine(); render();
    toast('הוסר');
  }

  function section(title, nodes, more) {
    if (!nodes.length && !more) return null;
    return el('section', { class: 'csec' }, el('h2', {}, title), more || null, el('div', { class: 'cards' }, nodes));
  }

  /* ---------- the page ---------- */
  function renderTabs() {
    $('#tabs').replaceChildren(...TABS.map(([k, label]) => el('button', { class: 'chip', 'aria-pressed': String(k === tab), onclick: () => { tab = k; history.replaceState(null, '', '#' + k); render(); } }, label)));
  }
  function render() {
    renderTabs();
    const out = $('#content');
    out.replaceChildren();
    const q = query;
    if (tab === 'dict') { out.append(dictionary()); return; }
    if (tab === 'zemirot' || (tab === 'all' && !q)) {
      if (!zemirot) { out.append(el('p', { class: 'muted' }, 'טוען…')); return; }
      if (tab === 'all') {
        out.append(section('השירון שלנו', mine.slice(0, 8).map(mineCard), el('div', { class: 'secacts' }, el('button', { class: 'btn small', onclick: () => editOwn() }, '+ שיר חדש עם אקורדים'))));
      }
      for (const [k, name] of Object.entries(zemirot.sections)) {
        const zs = zemirot.songs.filter((z) => z.section === k && matches(q, z.title));
        const sec = section((tab === 'all' ? 'זמירות שבת · ' : '') + name, zs.map(zemerCard));
        if (sec) out.append(sec);
      }
      out.append(el('p', { class: 'credit' }, zemirot.credit));
      return;
    }
    if (tab === 'mine') {
      out.append(section('השירון שלנו', mine.filter((s) => matches(q, s.title, s.artist, s.body)).map(mineCard),
        el('div', { class: 'secacts' }, el('button', { class: 'btn primary small', onclick: () => editOwn() }, '+ שיר חדש עם אקורדים'))));
      if (!mine.length) out.append(el('p', { class: 'muted empty' }, 'עוד אין כאן שירים. שמרו שיר מהחיפוש (☆), או הוסיפו שיר משלכם עם אקורדים.'));
      return;
    }
    if (!q) { out.append(el('p', { class: 'muted empty' }, 'כתבו בחיפוש שם של שיר, זמר או שורה מהשיר.')); return; }
    if (results.loading) out.append(el('div', { class: 'cards' }, Array.from({ length: 6 }, () => el('div', { class: 'scard ghost' }))));
    for (const e of results.errors) out.append(el('p', { class: 'warn' }, e));
    const own = mine.filter((s) => matches(q, s.title, s.artist, s.body)).map(mineCard);
    const zs = (zemirot?.songs || []).filter((z) => matches(q, z.title, z.lines.map((l) => l.t).join(' '))).map(zemerCard);
    if (tab === 'all' || tab === 'lyrics') {
      const s = section('מילים', [...results.lyrics.map(hitCard), googleCard('lyrics')]);
      if (s && !results.loading) out.append(s);
    }
    if (tab === 'all' || tab === 'chords') {
      const s = section('אקורדים', [...results.chords.map(hitCard), googleCard('chords')]);
      if (s && !results.loading) out.append(s);
    }
    if (tab === 'all') {
      const s1 = section('בשירון שלנו', own); if (s1) out.append(s1);
      const s2 = section('בזמירות שבת', zs); if (s2) out.append(s2);
    }
  }

  /* ---------- the reader ---------- */
  const reader = $('#reader');
  function openReader(head, body, tools = []) {
    reader.replaceChildren(
      el('div', { class: 'rbar' },
        el('button', { class: 'mini', 'aria-label': 'חזרה', title: 'חזרה', onclick: closeReader }, '→'),
        el('div', { class: 'rtitle' }, head),
        el('span', { class: 'spacer' }),
        ...tools,
        el('button', { class: 'mini', title: 'הקטנת הכתב', 'aria-label': 'הקטנת הכתב', onclick: () => size(-1) }, 'א-'),
        el('button', { class: 'mini', title: 'הגדלת הכתב', 'aria-label': 'הגדלת הכתב', onclick: () => size(1) }, 'א+')),
      el('div', { class: 'rbody', style: `--fs:${prefs.size}` }, body));
    reader.hidden = false;
    document.body.classList.add('reading');
    reader.querySelector('.rbody').scrollTop = 0;
    if (!history.state?.reader) history.pushState({ reader: true }, '');
  }
  function size(d) {
    prefs.size = Math.max(0.8, Math.min(2, Math.round((prefs.size + d * 0.15) * 100) / 100)); savePrefs();
    reader.querySelector('.rbody')?.style.setProperty('--fs', prefs.size);
  }
  function closeReader() { reader.hidden = true; document.body.classList.remove('reading'); if (history.state?.reader) history.back(); }
  window.addEventListener('popstate', () => { if (!reader.hidden) { reader.hidden = true; document.body.classList.remove('reading'); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !reader.hidden) closeReader(); });
  const head = (title, sub) => el('div', {}, el('b', {}, title), sub ? el('small', {}, sub) : null);

  async function openRemote(hit) {
    openReader(head(hit.title, hit.artist), el('p', { class: 'muted' }, 'טוען את השיר…'));
    let song;
    try { song = await api(`/api/songs/page?url=${encodeURIComponent(hit.url)}`); }
    catch (e) {
      openReader(head(hit.title, hit.artist), el('div', {}, el('p', {}, 'לא הצלחנו לטעון את השיר כרגע.'), el('a', { class: 'btn', href: hit.url, target: '_blank', rel: 'noopener' }, 'פתיחה באתר')));
      return;
    }
    const src = SOURCES[song.source];
    const credit = el('p', { class: 'credit' }, (song.credits || []).join(' · '), (song.credits || []).length ? el('br') : null,
      'המקור: ', el('a', { href: song.url, target: '_blank', rel: 'noopener' }, src.label), ' · © כל הזכויות שמורות ליוצרים');
    const star = el('button', { class: 'mini', title: 'שמירה לשירון שלנו', 'aria-label': 'שמירה לשירון שלנו', onclick: () => saveLink({ ...hit, title: song.title || hit.title, artist: song.artist || hit.artist }, star) }, savedUrl(hit.url) ? '★' : '☆');
    if (song.kind === 'chords') {
      showSheet(head(song.title || hit.title, song.artist || hit.artist), song.text, [star], credit);
    } else {
      openReader(head(song.title || hit.title, song.artist || hit.artist), el('div', {}, lyricsView(song.text), credit), [star]);
    }
  }
  function lyricsView(text) {
    return el('div', { class: 'lyrics' }, text.split(/\n{2,}/).map((st) => el('p', { class: 'stanza' }, st.split('\n').flatMap((l, i) => (i ? [el('br'), l] : [l])))));
  }

  function openZemer(z) {
    const body = el('div', { class: 'zemer' },
      z.lines.map((l) => el('p', { class: l.r ? 'refrain' : '' }, l.t)),
      el('p', { class: 'credit' }, zemirot.credit, ' · ', el('a', { href: z.source, target: '_blank', rel: 'noopener' }, 'בספריא')));
    openReader(head(z.title, zemirot.sections[z.section]), body);
  }

  /* chord sheets: chords over lyrics (or [Am] inline), transpose, and the chords' diagrams */
  function chordPro(text) {
    return text.split('\n').flatMap((line) => {
      if (!/\[[A-G][^\]]*\]/.test(line)) return [line];
      let chords = '', lyric = '';
      for (const part of line.split(/(\[[^\]]+\])/)) {
        if (/^\[[^\]]+\]$/.test(part)) {
          const ch = part.slice(1, -1);
          if (chords.length > lyric.length) lyric += ' '.repeat(chords.length - lyric.length + 1);
          chords += ' '.repeat(Math.max(0, lyric.length - chords.length)) + ch + ' ';
        } else lyric += part;
      }
      return [chords.replace(/\s+$/, ''), lyric];
    });
  }
  const isTab = (l) => /^\s*[eBGDAEbgda]?\s*[|:]?[-0-9hpbrx/\\~|() ]{8,}$/.test(l) && (l.match(/-/g) || []).length > l.length * 0.4;
  function showSheet(headNode, text, extraTools = [], footer = null) {
    let steps = 0;
    const lines = chordPro(text);
    const used = () => {
      const set = [];
      for (const l of lines) if (C.isChordLine(l)) for (const t of l.trim().split(/\s+/)) if (C.isChord(t)) { const n = C.transpose(t, steps); if (!set.includes(n)) set.push(n); }
      return set;
    };
    const sheet = el('div', { class: 'sheet' });
    const diagrams = el('div', { class: 'diagrams' });
    const keyLabel = el('span', { class: 'key' });
    const draw = () => {
      sheet.replaceChildren(...lines.map((l) => {
        if (!l.trim()) return el('div', { class: 'gap' });
        if (C.isChordLine(l)) return el('div', { class: 'cl', dir: 'rtl' }, ...C.transposeLine(l, steps).split(/(\S+)/).map((p) => (C.isChord(p) ? el('b', { dir: 'ltr' }, p) : p)));
        if (isTab(l)) return el('pre', { class: 'tab', dir: 'ltr' }, l);
        if (/^\[.+\]$|^[^\s].{0,24}:\s*$/.test(l.trim())) return el('div', { class: 'sec' }, l.replace(/^\[|\]$/g, ''));
        if (/^[A-G][#b]?[^\s:]*:\s+[x0-9]{6}$/.test(l.trim())) return el('div', { class: 'cdef', dir: 'ltr' }, l.trim());
        return el('div', { class: 'ly' }, l);
      }));
      diagrams.replaceChildren(...used().map((n) => (prefs.instrument === 'piano' ? C.pianoSvg(n) : C.guitarSvg(n))));
      keyLabel.textContent = steps ? (steps > 0 ? '+' : '') + steps : '0';
    };
    const t = (d) => { steps = Math.max(-11, Math.min(11, steps + d)); draw(); };
    const inst = el('button', { class: 'mini wide', title: 'גיטרה / פסנתר', onclick: () => { prefs.instrument = prefs.instrument === 'piano' ? 'guitar' : 'piano'; savePrefs(); inst.textContent = prefs.instrument === 'piano' ? '🎹 פסנתר' : '🎸 גיטרה'; draw(); } }, prefs.instrument === 'piano' ? '🎹 פסנתר' : '🎸 גיטרה');
    const tools = [
      el('span', { class: 'transpose', role: 'group', 'aria-label': 'שינוי סולם' },
        el('button', { class: 'mini', title: 'חצי טון למטה', 'aria-label': 'חצי טון למטה', onclick: () => t(-1) }, '♭'),
        keyLabel,
        el('button', { class: 'mini', title: 'חצי טון למעלה', 'aria-label': 'חצי טון למעלה', onclick: () => t(1) }, '♯')),
      inst, ...extraTools,
    ];
    draw();
    openReader(headNode, el('div', {}, diagrams, sheet, footer), tools);
  }
  function openOwn(s) {
    const edit = el('button', { class: 'mini wide', onclick: () => editOwn(s) }, '✎ עריכה');
    if (s.kind === 'chords') showSheet(head(s.title, s.artist), s.body || '', [edit]);
    else openReader(head(s.title, s.artist), lyricsView(s.body || ''), [edit]);
  }
  function editOwn(s = null) {
    const title = el('input', { type: 'text', value: s?.title || '', placeholder: 'שם השיר', required: true });
    const artist = el('input', { type: 'text', value: s?.artist || '', placeholder: 'מבצע (לא חובה)' });
    const kind = el('select', {}, el('option', { value: 'chords' }, 'אקורדים ומילים'), el('option', { value: 'lyrics' }, 'מילים בלבד'));
    kind.value = s?.kind === 'lyrics' ? 'lyrics' : 'chords';
    const text = el('textarea', { rows: 16, dir: 'auto', class: 'sheet-edit', placeholder: 'הדביקו כאן את השיר.\nאקורדים בשורה מעל המילים, או בתוך השורה: [Am]שלום [G]עליכם\nאפשר גם טאבים (e|---0---).' });
    text.value = s?.body || '';
    H.modal(el('h2', {}, s ? 'עריכת שיר' : 'שיר חדש'),
      el('form', { class: 'form', onsubmit: async (e) => {
        e.preventDefault();
        const body = { title: title.value, artist: artist.value, kind: kind.value, body: text.value };
        const r = await api(s ? `/api/songs/${s.id}` : '/api/songs', { method: s ? 'PUT' : 'POST', body });
        H.closeModal(); await loadMine(); render(); toast('נשמר');
        const saved = mine.find((m) => m.id === (s?.id || r.id));
        if (saved) openOwn(saved);
      } },
      el('label', {}, 'שם', title), el('label', {}, 'מבצע', artist), el('label', {}, 'סוג', kind), el('label', {}, 'השיר', text),
      el('div', { class: 'row' }, el('button', { class: 'btn primary', type: 'submit' }, 'שמירה'),
        s ? el('button', { class: 'btn', type: 'button', onclick: async () => { H.closeModal(); closeReader(); await removeMine(s); } }, 'מחיקה') : null)));
  }

  /* ---------- the chord dictionary ---------- */
  function dictionary() {
    let root = 0, qual = '';
    const QNAMES = { '': 'מז׳ור', m: 'מינור', 7: '7', m7: 'm7', maj7: 'maj7', 6: '6', m6: 'm6', 9: '9', add9: 'add9', sus2: 'sus2', sus4: 'sus4', '7sus4': '7sus4', dim: 'dim', dim7: 'dim7', m7b5: 'm7b5', aug: 'aug' };
    const roots = el('div', { class: 'chips' });
    const quals = el('div', { class: 'chips' });
    const show = el('div', { class: 'dict-show' });
    const draw = () => {
      roots.replaceChildren(...C.SHARP.map((_, pc) => el('button', { class: 'chip', 'aria-pressed': String(pc === root), onclick: () => { root = pc; draw(); } }, C.noteName(pc))));
      quals.replaceChildren(...Object.entries(QNAMES).map(([q, n]) => el('button', { class: 'chip', 'aria-pressed': String(q === qual), onclick: () => { qual = q; draw(); } }, n)));
      const name = C.noteName(root) + qual;
      show.replaceChildren(el('div', { class: 'big' }, C.guitarSvg(name), el('span', {}, 'גיטרה')), el('div', { class: 'big' }, C.pianoSvg(name), el('span', {}, 'פסנתר')),
        el('p', { class: 'muted' }, 'הצלילים: ', C.tones(C.parse(name)).map((pc) => C.noteName(pc)).join(' · ')));
    };
    draw();
    return el('section', { class: 'csec dict' }, el('h2', {}, 'מילון אקורדים'), el('h3', {}, 'תו'), roots, el('h3', {}, 'סוג'), quals, show);
  }

  /* ---------- go ---------- */
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    query = $('#q').value.trim();
    if (['zemirot', 'mine', 'dict'].includes(tab) && query) { if (tab === 'dict') tab = 'all'; }
    if (query.length >= 2 && tab !== 'zemirot' && tab !== 'mine') search(query); else render();
  });
  render();
  await Promise.all([loadZemirot().catch(() => null), loadMine().catch(() => [])]);
  render();
})();
