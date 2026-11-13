/* שירון: one search over Shironet (lyrics), Tab4u (chords), the Shabbat zemirot and the family's own songbook, shown
   as cards (in the style of Inoreader's card view); a song opens in a reader inside the app: full lyrics, or chords
   with transpose and guitar / piano diagrams. Shironet and Tab4u songs are fetched live from their sites when opened
   and credited there; the family's songbook keeps links and its own chord sheets.
   Vision batch 4, item 10: a song opens in the hub's flip sheet (H.sheet); a double tap on a card is a heart (❤ אהובים,
   each person's own, H.prefs); "🎸 אני מנגן" puts first the songs that have chords as well as words; a song we added can
   be deleted from its reader. Outside songs stay links (decided 2026-11-12): nothing of theirs is copied. */
(async () => {
  'use strict';
  const { el, api, toast } = H;
  H.header('שירון', '🎵');
  await H.requireLogin();
  const $ = (s) => document.querySelector(s);
  const C = window.Chords;

  // Per person, synced through the server (the old per-device copy is carried over once).
  const prefs = H.prefs('songs', { size: 1, instrument: 'guitar', plays: false, favs: [] }, 'helper.songs.prefs');
  if (!Array.isArray(prefs.favs)) prefs.favs = [];
  const savePrefs = () => H.savePrefs('songs');

  const TABS = [
    ['all', 'הכל'], ['lyrics', 'מילים'], ['chords', 'אקורדים'], ['zemirot', 'זמירות שבת'], ['mine', 'השירון שלנו'], ['favs', '❤ אהובים'], ['dict', 'מילון אקורדים'],
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

  /* ---------- favourites (❤): each person's own, a link and a name – never the song itself ---------- */
  const favKey = (f) => f.url || (f.zemer ? 'z:' + f.zemer : f.own ? 'own:' + f.own : '');
  const isFav = (f) => prefs.favs.some((x) => favKey(x) === favKey(f));
  function setFav(f, on) {
    const k = favKey(f);
    if (!k) return;
    prefs.favs = prefs.favs.filter((x) => favKey(x) !== k);
    if (on) prefs.favs.unshift({ title: f.title, artist: f.artist || '', url: f.url || null, source: f.source || null, zemer: f.zemer || null, own: f.own || null, at: Date.now() });
    prefs.favs = prefs.favs.slice(0, 300);
    savePrefs();
  }
  /** the heart's burst over a card (the same gesture as the recipe book) */
  function burst(node) {
    const h = el('span', { class: 'heart-burst', 'aria-hidden': 'true' }, '❤');
    if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
    node.append(h);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setTimeout(() => h.remove(), 500); return; }
    h.animate([{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: 0.35 }, { transform: 'scale(1)', opacity: 1, offset: 0.6 }, { transform: 'scale(1.25)', opacity: 0 }],
      { duration: 800, easing: 'ease-out' }).onfinish = () => h.remove();
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
  function card({ title, artist, snippet, image, source, onOpen, saved, onSave, extra, fav }) {
    const heartBtn = fav ? el('button', { class: 'mini fav', type: 'button', 'aria-pressed': String(isFav(fav)), title: isFav(fav) ? 'באהובים' : 'לאהובים', 'aria-label': 'לאהובים',
      onclick: (e) => { e.stopPropagation(); const on = !isFav(fav); setFav(fav, on); heartBtn.textContent = on ? '❤' : '♡'; heartBtn.setAttribute('aria-pressed', String(on)); if (on) burst(node); if (tab === 'favs') render(); } }, isFav(fav) ? '❤' : '♡') : null;
    const node = el('article', { class: 'scard', tabindex: '0', role: 'button', 'aria-label': `${title}${artist ? ' – ' + artist : ''}` },
      cover(source === 'shironet' || source === 'tab4u' ? (artist || title) : title, image, source),
      el('div', { class: 'cbody' },
        el('h3', {}, title),
        artist ? el('div', { class: 'artist' }, artist) : null,
        snippet ? el('p', { class: 'snip' }, snippet) : null),
      el('div', { class: 'cfoot' },
        extra || el('span', { class: 'src' }, SOURCES[source]?.label || ''),
        el('span', { class: 'spacer' }),
        heartBtn,
        onSave ? el('button', { class: 'mini star', title: saved ? 'בשירון שלנו' : 'שמירה לשירון שלנו', 'aria-label': 'שמירה', 'aria-pressed': String(!!saved),
          onclick: (e) => { e.stopPropagation(); onSave(e.currentTarget); } }, saved ? '★' : '☆') : null));
    // one tap opens (the card flips into the sheet); a quick second tap is a heart, as on Instagram
    let tapTimer = 0;
    node.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (tapTimer && fav) {
        clearTimeout(tapTimer); tapTimer = 0;
        burst(node);
        if (!isFav(fav)) { setFav(fav, true); if (heartBtn) { heartBtn.textContent = '❤'; heartBtn.setAttribute('aria-pressed', 'true'); } toast('נשמר באהובים'); }
        return;
      }
      if (!fav) { onOpen(node); return; }
      tapTimer = setTimeout(() => { tapTimer = 0; onOpen(node); }, 260);
    });
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === node) onOpen(node); });
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
  /** Songs with the same name (different artists or versions) become one card. */
  function groupHits(list) {
    const groups = new Map();
    for (const h of list) {
      const k = norm(h.title).replace(/[^א-תa-z0-9]+/g, ' ').trim();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(h);
    }
    return [...groups.values()];
  }
  const groupCard = (vs) => {
    if (vs.length === 1) return hitCard(vs[0]);
    const h = vs.find((v) => v.image) || vs[0];
    const artists = [...new Set(vs.map((v) => v.artist).filter(Boolean))];
    return card({
      title: vs[0].title, artist: artists.slice(0, 2).join(', ') + (artists.length > 2 ? ` ועוד ${artists.length - 2}` : ''),
      snippet: vs[0].snippet, image: h.image, source: vs[0].source,
      extra: el('span', { class: 'src' }, el('span', { class: 'vers' }, `${vs.length} ביצועים`), ' · ', vs[0].source === 'tab4u' ? 'Tab4u' : 'שירונט'),
      fav: { url: vs[0].url, title: vs[0].title, artist: vs[0].artist, source: vs[0].source },
      onOpen: (from) => openRemote(vs[0], vs, from),
    });
  };
  const hitCard = (h) => card({
    title: h.title, artist: h.artist, snippet: h.snippet, image: h.image, source: h.source,
    extra: el('span', { class: 'src' }, h.source === 'tab4u' ? 'אקורדים · Tab4u' : 'מילים · שירונט', h.rating ? el('span', { class: 'rate' }, ' ★' + h.rating) : null),
    saved: savedUrl(h.url), onSave: (b) => saveLink(h, b), onOpen: (from) => openRemote(h, null, from),
    fav: { url: h.url, title: h.title, artist: h.artist, source: h.source },
  });
  const googleCard = (kind) => card({
    title: `${query} – ${kind === 'chords' ? 'אקורדים' : 'מילים'}`, artist: 'חיפוש בגוגל', source: 'google',
    snippet: 'פותח את גוגל בלשונית חדשה עם אותו חיפוש',
    onOpen: () => window.open(`https://www.google.com/search?q=${encodeURIComponent(query + (kind === 'chords' ? ' אקורדים' : ' מילים לשיר'))}`, '_blank', 'noopener'),
  });
  const zemerCard = (z) => card({
    title: z.title, artist: zemirot.sections[z.section], source: 'zemirot',
    snippet: z.lines.slice(0, 2).map((l) => l.t).join(' '), onOpen: (from) => openZemer(z, from),
    fav: { zemer: z.title, title: z.title, artist: zemirot.sections[z.section], source: 'zemirot' },
  });
  const mineCard = (s) => card({
    title: s.title, artist: s.artist, source: s.url ? (/tab4u/.test(s.url) ? 'tab4u' : 'shironet') : 'mine',
    snippet: s.body ? s.body.split('\n').filter((l) => l.trim() && !C.isChordLine(l)).slice(0, 2).join(' ') : (s.url ? 'נשמר מ' + (/tab4u/.test(s.url) ? 'Tab4u' : 'שירונט') : ''),
    extra: el('span', { class: 'src' }, s.body ? (s.kind === 'chords' ? 'אקורדים שלנו' : 'מילים שלנו') : 'קישור שמור'),
    saved: true, onSave: () => removeMine(s), onOpen: (from) => (s.body ? openOwn(s, from) : openRemote({ ...s, source: /tab4u/.test(s.url) ? 'tab4u' : 'shironet' }, null, from)),
    fav: s.url ? { url: s.url, title: s.title, artist: s.artist, source: /tab4u/.test(s.url) ? 'tab4u' : 'shironet' } : { own: s.id, title: s.title, artist: s.artist, source: 'mine' },
  });
  /** a favourite's card: opened by where it lives (a site, the zemirot, our songbook) */
  const favCard = (f) => {
    if (f.zemer) { const z = zemirot?.songs.find((x) => x.title === f.zemer); if (z) return zemerCard(z); }
    if (f.own) { const s = mine.find((x) => x.id === f.own); if (s) return mineCard(s); return null; }
    if (!f.url) return null;
    const source = f.source || (/tab4u/.test(f.url) ? 'tab4u' : 'shironet');
    return card({ title: f.title, artist: f.artist, source, fav: f,
      extra: el('span', { class: 'src' }, source === 'tab4u' ? 'אקורדים · Tab4u' : 'מילים · שירונט'),
      saved: savedUrl(f.url), onSave: (b) => saveLink({ ...f, source }, b), onOpen: (from) => openRemote({ ...f, source }, null, from) });
  };
  async function removeMine(s) {
    if (!confirm(`להסיר את "${s.title}" מהשירון שלנו?`)) return;
    await api(`/api/songs/${s.id}`, { method: 'DELETE' });
    if (s.id) setFav({ own: s.id }, false);
    await loadMine(); render();
    toast('הוסר');
  }

  function section(title, nodes, more) {
    if (!nodes.length && !more) return null;
    return el('section', { class: 'csec' }, el('h2', {}, title), more || null, el('div', { class: 'cards' }, nodes));
  }

  /* ---------- the page ---------- */
  function renderTabs() {
    $('#tabs').replaceChildren(...TABS.map(([k, label]) => el('button', { class: 'chip', 'aria-pressed': String(k === tab), onclick: () => { tab = k; history.replaceState(null, '', '#' + k); render(); } }, label)),
      el('button', { class: 'chip plays', 'aria-pressed': String(!!prefs.plays), title: 'כשמסומן, החיפוש מקדים שירים שיש להם גם מילים וגם אקורדים',
        onclick: () => { prefs.plays = !prefs.plays; savePrefs(); render(); toast(prefs.plays ? 'מעכשיו שירים עם אקורדים קודמים' : 'החיפוש חזר לסדר הרגיל'); } }, '🎸 אני מנגן'));
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
    if (tab === 'favs') {
      const cards = prefs.favs.filter((f) => matches(q, f.title, f.artist)).map(favCard).filter(Boolean);
      out.append(section('❤ אהובים', cards));
      if (!cards.length) out.append(el('p', { class: 'muted empty' }, 'עוד אין כאן שירים. הקישו פעמיים על שיר (או על ♡) כדי לשמור אותו באהובים.'));
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
    const key = (h) => norm(h.title).replace(/[^א-תa-z0-9]+/g, ' ').trim();
    const withChords = new Set(results.chords.map(key));
    let lyricGroups = groupHits(results.lyrics);
    if (prefs.plays) lyricGroups = [...lyricGroups.filter((g) => withChords.has(key(g[0]))), ...lyricGroups.filter((g) => !withChords.has(key(g[0])))];
    const lyricsSec = (tab === 'all' || tab === 'lyrics') ? section(prefs.plays ? 'מילים · קודם אלה שיש להם גם אקורדים' : 'מילים', [...lyricGroups.map(groupCard), googleCard('lyrics')]) : null;
    const chordsSec = (tab === 'all' || tab === 'chords') ? section('אקורדים', [...groupHits(results.chords).map(groupCard), googleCard('chords')]) : null;
    if (!results.loading) for (const sec of prefs.plays ? [chordsSec, lyricsSec] : [lyricsSec, chordsSec]) if (sec) out.append(sec);
    if (tab === 'all') {
      const s1 = section('בשירון שלנו', own); if (s1) out.append(s1);
      const s2 = section('בזמירות שבת', zs); if (s2) out.append(s2);
    }
  }

  /* ---------- the reader: the hub's flip sheet (the card turns over into it, and back when it closes) ---------- */
  const sheet = H.sheet;
  let readerFrom = null;
  const bodyOf = () => sheet.body.querySelector('.rbody');
  function openReader(head, body, tools = [], from) {
    if (from) readerFrom = from;
    const content = el('div', { class: 'sreader-in', 'data-guide': 'song-reader', 'data-guide-label': 'השיר הפתוח' },
      el('div', { class: 'rbar' },
        el('div', { class: 'rtitle' }, head),
        el('span', { class: 'spacer' }),
        ...tools,
        el('button', { class: 'mini', title: 'הקטנת הכתב', 'aria-label': 'הקטנת הכתב', onclick: () => size(-1) }, 'א-'),
        el('button', { class: 'mini', title: 'הגדלת הכתב', 'aria-label': 'הגדלת הכתב', onclick: () => size(1) }, 'א+')),
      el('div', { class: 'rbody', style: `--fs:${prefs.size}` }, body));
    sheet.open(readerFrom, content, { size: 'large', className: 'songs-sheet', onLeave: () => setTimeout(() => {
      // closed (not just a new song in it): the back button's step goes too
      if (!sheet.isOpen) { readerFrom = null; document.body.classList.remove('reading'); if (history.state?.reader) history.back(); }
    }) });
    document.body.classList.add('reading');
    if (!history.state?.reader) history.pushState({ reader: true }, '');
  }
  function size(d) {
    prefs.size = Math.max(0.8, Math.min(2, Math.round((prefs.size + d * 0.15) * 100) / 100)); savePrefs();
    bodyOf()?.style.setProperty('--fs', prefs.size);
  }
  function closeReader() { sheet.close(); }
  window.addEventListener('popstate', () => { if (sheet.isOpen) sheet.close(); });
  const head = (title, sub) => el('div', {}, el('b', {}, title), sub ? el('small', {}, sub) : null);

  async function openRemote(hit, versions = null, from) {
    openReader(head(hit.title, hit.artist), el('p', { class: 'muted' }, 'טוען את השיר…'), [], from);
    let song;
    try { song = await api(`/api/songs/page?url=${encodeURIComponent(hit.url)}`); }
    catch (e) {
      openReader(head(hit.title, hit.artist), el('div', {}, el('p', {}, 'לא הצלחנו לטעון את השיר כרגע.'), el('a', { class: 'btn', href: hit.url, target: '_blank', rel: 'noopener' }, 'פתיחה באתר')));
      return;
    }
    const src = SOURCES[song.source];
    const credit = el('p', { class: 'credit' }, (song.credits || []).join(' · '), (song.credits || []).length ? el('br') : null,
      'המקור: ', el('a', { href: song.url, target: '_blank', rel: 'noopener' }, src.label), ' · © כל הזכויות שמורות ליוצרים');
    const picker = versions && versions.length > 1 ? el('select', { class: 'vpick', 'aria-label': 'ביצוע / גרסה', onchange: (e) => openRemote(versions[Number(e.target.value)], versions) },
      versions.map((v, i) => el('option', { value: String(i), selected: v.url === hit.url }, (v.artist || 'גרסה ' + (i + 1)) + (v.rating ? ` ★${v.rating}` : '')))) : null;
    const star = el('button', { class: 'mini', title: 'שמירה לשירון שלנו', 'aria-label': 'שמירה לשירון שלנו', onclick: () => saveLink({ ...hit, title: song.title || hit.title, artist: song.artist || hit.artist }, star) }, savedUrl(hit.url) ? '★' : '☆');
    const fav = { url: hit.url, title: song.title || hit.title, artist: song.artist || hit.artist, source: song.source };
    const heart = el('button', { class: 'mini fav', 'aria-pressed': String(isFav(fav)), title: 'לאהובים', 'aria-label': 'לאהובים',
      onclick: () => { const on = !isFav(fav); setFav(fav, on); heart.textContent = on ? '❤' : '♡'; heart.setAttribute('aria-pressed', String(on)); } }, isFav(fav) ? '❤' : '♡');
    // a link we saved can be removed from here too
    const ours = mine.find((m) => m.url === hit.url);
    const del = ours ? el('button', { class: 'mini wide', title: 'הסרה מהשירון שלנו', onclick: async () => { closeReader(); await removeMine(ours); } }, '🗑 הסרה') : null;
    const tools = [picker, heart, star, del].filter(Boolean);
    if (song.kind === 'chords') {
      showSheet(head(song.title || hit.title, song.artist || hit.artist), song.text, tools, credit);
    } else {
      openReader(head(song.title || hit.title, song.artist || hit.artist), el('div', {}, lyricsView(song.text), credit), tools);
    }
  }
  function lyricsView(text) {
    return el('div', { class: 'lyrics', dir: dirOf(text) }, text.split(/\n{2,}/).map((st) => el('p', { class: 'stanza' }, st.split('\n').flatMap((l, i) => (i ? [el('br'), l] : [l])))));
  }

  function openZemer(z, from) {
    const body = el('div', { class: 'zemer' },
      z.lines.map((l) => el('p', { class: l.r ? 'refrain' : '' }, l.t)),
      el('p', { class: 'credit' }, zemirot.credit, ' · ', el('a', { href: z.source, target: '_blank', rel: 'noopener' }, 'בספריא')));
    openReader(head(z.title, zemirot.sections[z.section]), body, [], from);
  }

  /** Which way a song reads: left to right when its words are mostly Latin letters (English and the like). */
  function dirOf(text) {
    let he = 0, lat = 0;
    for (const l of String(text).split('\n')) {
      if (C.isChordLine(l)) continue;
      const w = l.replace(/\[[^\]]*\]/g, '');
      he += (w.match(/[\u0590-\u05FF\u0600-\u06FF]/g) || []).length;
      lat += (w.match(/[A-Za-z\u00C0-\u024F\u0400-\u04FF]/g) || []).length;
    }
    return lat > he ? 'ltr' : 'rtl';
  }

  /* chord sheets: each chord is pinned to the letter it is played on (from a chord line over the words, or [Am]
     inline), so it stays exactly over its syllable in any font, either direction, and when lines wrap. */
  const isTab = (l) => /^\s*[eBGDAEbgda]?\s*[|:]?[-0-9hpbrx/\\~|() ]{8,}$/.test(l) && (l.match(/-/g) || []).length > l.length * 0.4;
  const isSec = (l) => /^\[[^\]]+\]$/.test(l.trim()) && !C.isChord(l.trim().slice(1, -1)) || /^[^\s\[].{0,24}:\s*$/.test(l.trim());
  const isDef = (l) => /^[A-G][#b]?[^\s:]*:\s+[x0-9]{6}$/.test(l.trim());
  const isLyric = (l) => l != null && l.trim() && !C.isChordLine(l) && !isTab(l) && !isSec(l) && !isDef(l);
  function parseSheet(text) {
    const L = String(text).replace(/\r/g, '').split('\n');
    const out = [];
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (!l.trim()) { out.push({ t: 'gap' }); continue; }
      if (isTab(l)) { out.push({ t: 'tab', l }); continue; }
      if (isDef(l)) { out.push({ t: 'def', l: l.trim() }); continue; }
      if (isSec(l)) { out.push({ t: 'sec', l: l.trim().replace(/^\[|\]$/g, '') }); continue; }
      if (/\[[A-G][^\]]*\]/.test(l) && !C.isChordLine(l)) {          // ChordPro: [Am]words
        const segs = [];
        const parts = l.split(/\[([^\]]+)\]/);
        if (parts[0]) segs.push({ ch: null, tx: parts[0] });
        for (let k = 1; k < parts.length; k += 2) segs.push({ ch: parts[k], tx: parts[k + 1] || '' });
        out.push({ t: 'pair', segs });
        continue;
      }
      if (C.isChordLine(l)) {
        const toks = [...l.matchAll(/\S+/g)].map((m) => ({ ch: m[0], at: m.index }));
        const next = L[i + 1];
        if (isLyric(next)) {                                          // chords over words: pin each to its letter
          const segs = [];
          let lyr = next;
          const last = toks[toks.length - 1];
          if (last.at >= lyr.length) lyr = lyr + ' '.repeat(last.at - lyr.length + 1);
          if (toks[0].at > 0) segs.push({ ch: null, tx: lyr.slice(0, toks[0].at) });
          toks.forEach((tk, k) => segs.push({ ch: tk.ch, tx: lyr.slice(tk.at, k + 1 < toks.length ? toks[k + 1].at : undefined) }));
          out.push({ t: 'pair', segs });
          i++;
        } else out.push({ t: 'chords', l });
        continue;
      }
      out.push({ t: 'ly', l });
    }
    return out;
  }
  function showSheet(headNode, text, extraTools = [], footer = null, from) {
    let steps = 0;
    const items = parseSheet(text);
    const dir = dirOf(text);
    const tr = (ch) => (C.isChord(ch) ? C.transpose(ch, steps) : ch);
    const used = () => {
      const set = [];
      const add = (t) => { if (C.isChord(t)) { const n = C.transpose(t, steps); if (!set.includes(n)) set.push(n); } };
      for (const it of items) {
        if (it.t === 'pair') it.segs.forEach((g) => g.ch && add(g.ch));
        if (it.t === 'chords') it.l.trim().split(/\s+/).forEach(add);
      }
      return set;
    };
    const sheetEl = el('div', { class: 'sheet', dir });
    const diagrams = el('div', { class: 'diagrams' });
    const keyLabel = el('span', { class: 'key' });
    const draw = () => {
      sheetEl.replaceChildren(...items.map((it) => {
        if (it.t === 'gap') return el('div', { class: 'gap' });
        if (it.t === 'tab') return el('pre', { class: 'tab', dir: 'ltr' }, it.l);
        if (it.t === 'def') return el('div', { class: 'cdef', dir: 'ltr' }, it.l);
        if (it.t === 'sec') return el('div', { class: 'sec' }, it.l);
        if (it.t === 'ly') return el('div', { class: 'ly' }, it.l);
        if (it.t === 'chords') return el('div', { class: 'crow' }, ...it.l.trim().split(/\s+/).map((c) => el(C.isChord(c) ? 'b' : 'span', { dir: 'ltr' }, tr(c))));
        // a chord name may hang over the next letters (so words aren't torn apart); it keeps its width only when
        // the next chord comes right after it, so two names never overlap
        return el('div', { class: 'pl' }, ...it.segs.map((g, k) => {
          const name = g.ch ? tr(g.ch) : '';
          const crowded = name && it.segs[k + 1]?.ch;
          return el('span', { class: 'sg', style: crowded ? `min-inline-size:${(name.length * 0.62 + 0.5).toFixed(2)}em` : null },
            name ? el('b', { class: 'ch', dir: 'ltr' }, name) : null,
            el('span', { class: 'tx' }, g.tx || '\u00a0'));
        }));
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
    openReader(headNode, el('div', {}, diagrams, sheetEl, footer), tools, from);
  }
  function openOwn(s, from) {
    const edit = el('button', { class: 'mini wide', onclick: () => editOwn(s) }, '✎ עריכה');
    // a song we added: deleted from its own reader (vision batch 4, item 10)
    const del = el('button', { class: 'mini wide', title: 'מחיקת השיר מהשירון שלנו', onclick: async () => { closeReader(); await removeMine(s); } }, '🗑 מחיקה');
    if (s.kind === 'chords') showSheet(head(s.title, s.artist), s.body || '', [edit, del], null, from);
    else openReader(head(s.title, s.artist), lyricsView(s.body || ''), [edit, del], from);
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
  // opened with a song (the music player's "lyrics" button): ?open=<its page>&title=&artist=, or ?q=<what to search>
  const qs = new URLSearchParams(location.search);
  if (qs.get('open')) openRemote({ url: qs.get('open'), title: qs.get('title') || '', artist: qs.get('artist') || '' });
  else if (qs.get('q')) { $('#q').value = qs.get('q'); query = qs.get('q').trim(); if (query.length >= 2) search(query); }
  await Promise.all([loadZemirot().catch(() => null), loadMine().catch(() => [])]);
  render();
})();
