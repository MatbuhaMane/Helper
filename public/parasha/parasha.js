/* פרשת השבוע: this Shabbat's parasha – its summary, the reading (each aliyah and the haftarah, opening in Sefaria),
   and candle lighting and havdalah for the family's city. From Hebcal (public, no account). */
(async () => {
  const { el, toast } = H;
  await H.requireLogin();
  H.header('פרשת השבוע');
  const P = H.prefs('parasha', { city: '281184' });
  const CITIES = [['281184', 'ירושלים'], ['293397', 'תל אביב'], ['294801', 'חיפה'], ['295530', 'באר שבע']];
  const root = document.querySelector('main');
  const box = el('div', { class: 'pr' }, el('p', { class: 'muted' }, 'טוען את הפרשה…'));
  root.append(box);

  const BOOKS = { Genesis: 'בראשית', Exodus: 'שמות', Leviticus: 'ויקרא', Numbers: 'במדבר', Deuteronomy: 'דברים' };
  /** "Genesis 25:19-28:9" → a link to Sefaria in Hebrew, and a Hebrew label */
  const sefaria = (ref) => `https://www.sefaria.org.il/${ref.replace(/ /g, '_').replace(/:/g, '.').replace(/_(\d)/, '.$1')}?lang=he`;
  /** "Genesis 25:19-28:9" → "בראשית כה:יט–כח:ט" (the book in Hebrew, the numbers in Hebrew letters; several parts with ";") */
  const heRef = (ref) => String(ref).split(/;\s*/).map((part) => {
    const m = /^(.*?)\s*(\d+):(\d+)(?:-(\d+)(?::(\d+))?)?$/.exec(part.trim());
    if (!m) return part;
    const [, book, c1, v1, x, y] = m;
    const he = book ? (H.concord?.books.find((b) => b[1] === book)?.[2] || BOOKS[book] || book) + ' ' : '';
    const to = x ? (y ? `${heNum(+x)}:${heNum(+y)}` : heNum(+x)) : '';
    return `${he}${heNum(+c1)}:${heNum(+v1)}${to ? '–' + to : ''}`;
  }).join('; ');
  const time = (iso) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

  async function load() {
    const r = await fetch(`https://www.hebcal.com/shabbat?cfg=json&geonameid=${P.city}&M=on&lg=he&leyning=on`);
    if (!r.ok) throw new Error('hebcal ' + r.status);
    return r.json();
  }
  /* חיפוש בתנ"ך – a concordance.
     One word: our own concordance (H.concord, the Leningrad Codex with a lemma for every word) – every occurrence in all its forms,
     with or without prefixes; the reader can choose the dictionary entry, or only the exact form typed.
     Several words: Sefaria's full-text search (through /api/research/search). A reference ("בראשית כח יב") opens straight away.
     Each line opens in חדר העיון, the verse marked. */
  const TANAKH_PARTS = [['Tanakh/', 'כל התנ"ך'], ['Tanakh/Torah', 'תורה'], ['Tanakh/Prophets', 'נביאים'], ['Tanakh/Writings', 'כתובים']];
  const MORE_PARTS = [['Mishnah', 'משנה'], ['Tosefta', 'תוספתא'], ['Talmud/Bavli', 'בבלי'], ['Talmud/Yerushalmi', 'ירושלמי'], ['Midrash', 'מדרש'], ['Halakhah', 'הלכה'],
    ['Tanakh/Targum', 'תרגומים'], ['Second Temple', 'בית שני'], ['Kabbalah', 'קבלה'], ['Jewish Thought', 'מחשבה'], ['', 'כל הספרייה']];
  const PARTS = [...TANAKH_PARTS, ...MORE_PARTS];
  const isTanakh = (p) => TANAKH_PARTS.some(([f]) => f === p);
  const adv = { lang: 'all', exact: false };   // חיפוש מתקדם: the language of the texts, and the words exactly as written
  const unit = () => (isTanakh(part) ? ['פסוק', 'פסוקים'] : ['מקום', 'מקומות']);
  let part = 'Tanakh/';
  const fmt = (n) => n.toLocaleString('he-IL');
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
  function heNum(n) {
    const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], hund = ['', 'ק', 'ר', 'ש', 'ת'];
    let s = '', h = Math.floor(n / 100); n %= 100;
    while (h >= 4) { s += 'ת'; h -= 4; }   // 700 = תש
    s += hund[h];
    if (n === 15) return s + 'טו';
    if (n === 16) return s + 'טז';
    return s + tens[Math.floor(n / 10)] + ones[n % 10];
  }
  /** a day as a Hebrew date in letters: "ד׳ בכסלו תשפ״ז" */
  function heDate(d) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', year: 'numeric' }).formatToParts(d).map((p) => [p.type, p.value]));
    const mark = (s) => (s.length > 1 ? s.slice(0, -1) + '״' + s.slice(-1) : s + '׳');
    return `${mark(heNum(+parts.day))} ב${new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long' }).format(d)} ${mark(heNum(+parts.year % 1000))}`;
  }
  const openHit = (h) => (/ \d+:\d+$/.test(h.ref) && !/\d+[ab]:/.test(h.ref)
    ? H.study(h.ref.replace(/:\d+$/, ''), h.heRef.replace(/:[^:]+$/, ''), { select: h.ref })
    : window.open(`https://www.sefaria.org.il/${encodeURIComponent(h.ref.replace(/ /g, '_'))}?lang=${h.lang === 'en' ? 'en' : 'he'}`, '_blank', 'noopener'));

  /* lines from Sefaria's search (several words) */
  function snipOf(h, cls = 'pr-snip') {
    const n = el('span', { class: cls, lang: h.lang || 'he', dir: h.lang === 'en' ? 'ltr' : 'rtl' });
    n.innerHTML = h.snip.replace(/<(?!\/?b>)[^>]*>/g, '');   // only the <b> marks of the words found
    return n;
  }
  const hitRow = (h) => el('button', { class: 'pr-hit', 'data-ref': h.ref, onclick: () => openHit(h) }, el('b', {}, h.heRef), snipOf(h));

  /* lines from our concordance: [book, chapter, verse, word] */
  const C = () => H.concord;
  const refEn = (o) => `${C().books[o[0]][1]} ${o[1]}:${o[2]}`;
  const refHe = (o) => `${C().books[o[0]][2]} ${heNum(o[1])}:${heNum(o[2])}`;
  /** the verse around the word, the word marked (a window of words on each side, the whole verse when it is short) */
  function kwic(o, cls, span = 9) {
    const words = C().verse(o[0], o[1], o[2]);
    const a = Math.max(0, o[3] - span), z = Math.min(words.length, o[3] + span + 1);
    const out = el('span', { class: cls, lang: 'he' });
    if (a > 0) out.append('… ');
    words.slice(a, z).forEach((w, i) => { out.append(a + i === o[3] ? el('b', {}, w) : w, w.endsWith('־') ? '' : ' '); });
    if (z < words.length) out.append('…');
    return out;
  }
  const occRow = (o, onOpen) => el('button', { class: 'pr-hit', onclick: () => { onOpen?.(); openHit({ ref: refEn(o), heRef: refHe(o) }); } }, el('b', {}, refHe(o)), kwic(o, 'pr-snip'));
  /** only the form typed (with its prefixes), not every form of the entry */
  const sameForm = (o, b) => C().bare(C().verse(o[0], o[1], o[2])[o[3]]) === b;
  async function pick(state) {
    let list = await C().occurrences(state.keys, part);
    if (state.exact) { await C().loadBooks(list.map((o) => o[0])); list = list.filter((o) => sameForm(o, state.info.bare)); }
    return list;
  }
  function stats(list) {
    const verses = new Set(list.map((o) => `${o[0]}.${o[1]}.${o[2]}`)).size;
    const books = [];
    for (const o of list) { const last = books[books.length - 1]; if (last && last.i === o[0]) last.n++; else books.push({ i: o[0], he: C().books[o[0]][2], n: 1 }); }
    return { verses, books };
  }

  /** קונקורדנציה: everything, book by book – a count per book, the reference and the words in context */
  let ccStep = 0;   // the back gesture closes the concordance (H.back in common.js)
  function sheet(title, sub) {
    document.querySelector('.cc')?.remove();
    const list = el('div', { class: 'cc-list' }, el('p', { class: 'muted' }, 'אוסף את כל המופעים…'));
    const booksBar = el('nav', { class: 'cc-books', 'aria-label': 'ספרים' });
    const subEl = el('p', { class: 'muted cc-sub' }, sub || '');
    const shut = () => { root.remove(); if (!document.querySelector('.rs')) document.body.classList.remove('modal-open'); };
    const close = () => { shut(); if (ccStep) { const s = ccStep; ccStep = 0; H.back.done(s); } };
    if (!ccStep && H.back) ccStep = H.back.push(() => { ccStep = 0; document.querySelector('.cc')?.remove(); if (!document.querySelector('.rs')) document.body.classList.remove('modal-open'); });
    const root = el('div', { class: 'cc', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'קונקורדנציה: ' + title },
      el('header', { class: 'cc-head' }, el('button', { class: 'rs-back', onclick: close }, '‹ חזרה'),
        el('div', { class: 'cc-title' }, el('small', {}, 'קונקורדנציה'), el('h2', {}, title), subEl),
        el('button', { class: 'btn ghost', onclick: () => print() }, 'הדפסה')),
      el('div', { class: 'cc-body' }, booksBar, list));
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.append(root);
    document.body.classList.add('modal-open');
    root.querySelector('.rs-back').focus();
    const fill = (books, rowsOf) => {
      booksBar.replaceChildren(...books.map((b, k) => el('a', { class: 'cc-book', href: '#cc-' + k }, b.he, el('small', {}, ' ' + fmt(b.n)))));
      list.replaceChildren(...books.map((b, k) => el('section', { class: 'cc-group', id: 'cc-' + k }, el('h3', {}, b.he, el('small', {}, ' ' + fmt(b.n))),
        el('ol', { class: 'cc-rows' }, rowsOf(b).map((r) => el('li', {}, r))))));
    };
    return { close, list, subEl, fill };
  }
  async function concordanceLocal(state) {
    const lem = state.info.lemmas.filter((l) => state.keys.includes(l.key));
    const s = sheet(state.exact ? state.info.word : lem.map((l) => l.head).join(' · '), '');
    try {
      const list = await pick(state);
      await C().loadBooks(list.map((o) => o[0]));
      const st = stats(list);
      s.subEl.textContent = `${plural(list.length, 'מופע', 'מופעים')} ב־${plural(st.verses, 'פסוק', 'פסוקים')} ב־${plural(st.books.length, 'ספר', 'ספרים')} · ${PARTS.find(([f]) => f === part)[1]}${state.exact ? ' · הצורה ' + state.info.word + ' בלבד' : ''}`;
      s.fill(st.books, (b) => list.filter((o) => o[0] === b.i).map((o) => el('button', { class: 'cc-row', onclick: () => { s.close(); openHit({ ref: refEn(o), heRef: refHe(o) }); } },
        el('span', { class: 'cc-ref' }, `${heNum(o[1])}:${heNum(o[2])}`), kwic(o, 'cc-snip', 12))));
    } catch (_) { s.list.replaceChildren(el('p', {}, 'לא הצלחתי לאסוף את המופעים. נסו שוב בעוד רגע.')); }
  }
  /** the whole concordance of one word (the word tab of חדר העיון opens it) */
  H.concordanceOf = async (word) => {
    await C().ready;
    const info = await C().lookup(word);
    if (!info.lemmas.length) return toast('לא מצאתי את המילה בקונקורדנציה');
    concordanceLocal({ info, keys: info.lemmas.filter((l, i) => i === 0 || l.share >= 0.2).map((l) => l.key), exact: false });
  };

  /** every book of the Tanakh: three folded parts (תורה, נביאים, כתובים) in a row, like the aliyot; one opens at a time and
      shows its books; a tap on a book opens its chapter 1 (the chapters are listed at the top there) */
  function booksNav() {
    const books = C().books;
    const PARTS3 = [['תורה', 0, 4], ['נביאים', 5, 25], ['כתובים', 26, 38]];
    const panel = el('div', { class: 'pr-tn-books', hidden: true });
    const tabs = PARTS3.map(([n, a, z], k) => el('button', { type: 'button', class: 'pr-tn-part', 'aria-expanded': 'false', onclick: (e) => {
      const btn = e.currentTarget, opening = btn.getAttribute('aria-expanded') !== 'true';
      tabs.forEach((t) => t.setAttribute('aria-expanded', 'false'));
      panel.hidden = !opening;
      if (!opening) return;
      btn.setAttribute('aria-expanded', 'true');
      panel.replaceChildren(...books.slice(a, z + 1).map((b) =>
        el('a', { href: `?study=${encodeURIComponent(b[1] + ' 1')}`, onclick: (ev) => { ev.preventDefault(); H.study(`${b[1]} 1`, `${b[2]} א`); } }, b[2], el('small', {}, `${b[3]} פרקים`))));
    } }, el('span', {}, n), el('small', {}, `${z - a + 1} ספרים`), el('i', { 'aria-hidden': 'true' }, '▾')));
    return el('nav', { class: 'pr-tanakh', 'aria-label': 'ספרי התנ"ך' }, el('h2', {}, 'ספרי התנ"ך'), el('div', { class: 'pr-tn-row' }, tabs), panel);
  }

  async function concordanceSefaria(text) {
    const s = sheet(text, '');
    let d;
    try { d = await H.api('/api/research/search', { body: { q: text, part, lang: adv.lang, exact: adv.exact, from: 0, size: 10000 } }); }
    catch (_) { s.list.replaceChildren(el('p', {}, 'לא הצלחתי לאסוף את התוצאות. נסו שוב בעוד רגע.')); return; }
    s.subEl.textContent = `${d.capped ? 'יותר מ־' : ''}${plural(d.count, ...unit())} ב־${plural(d.books.length, 'ספר', 'ספרים')} · ${PARTS.find(([f]) => f === part)[1]}${adv.lang === 'en' ? ' · לע״ז' : adv.lang === 'he' ? ' · עברית' : ''}${adv.exact ? ' · צירוף מדויק' : ''}`;
    s.fill(d.books, (b) => d.hits.filter((h) => h.book === b.book).map((h) => el('button', { class: 'cc-row', onclick: () => { s.close(); openHit(h); } },
      el('span', { class: 'cc-ref' }, h.heRef.replace(b.he + ' ', '')), snipOf(h, 'cc-snip'))));
  }

  function searchCard() {
    const q = el('input', { type: 'search', class: 'pr-q', placeholder: 'מילה, צירוף, או מקום: בראשית כח יב', 'aria-label': 'חיפוש במקורות', enterkeyhint: 'search', dir: 'auto' });
    const res = el('div', { class: 'pr-results', 'aria-live': 'polite' });
    const chips = el('div', { class: 'pr-parts', role: 'radiogroup', 'aria-label': 'היכן לחפש' });
    const chip = ([f, n]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(f === part), class: 'pr-part' + (f === part ? ' on' : ''), onclick: () => { part = f; drawChips(); if (q.value.trim()) go(); } }, n);
    const drawChips = () => chips.replaceChildren(
      el('div', { class: 'pr-parts-row' }, el('small', {}, 'תנ"ך'), ...TANAKH_PARTS.map(chip)),
      el('div', { class: 'pr-parts-row' }, el('small', {}, 'מקורות'), ...MORE_PARTS.map(chip)));
    drawChips();
    // חיפוש מתקדם: the language, and the words exactly as written
    const langChip = ([v, n]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(adv.lang === v), class: 'pr-part' + (adv.lang === v ? ' on' : ''), onclick: () => { adv.lang = v; drawAdv(); if (q.value.trim()) go(); } }, n);
    const advBox = el('div', { class: 'pr-adv-body' });
    const drawAdv = () => advBox.replaceChildren(
      el('div', { class: 'pr-parts-row', role: 'radiogroup', 'aria-label': 'שפת הטקסטים' }, el('small', {}, 'שפה'), ...[['all', 'הכל'], ['he', 'עברית וארמית'], ['en', 'לע״ז (אנגלית)']].map(langChip)),
      el('label', { class: 'pr-exact' }, el('input', { type: 'checkbox', checked: adv.exact, onchange: (e) => { adv.exact = e.target.checked; if (q.value.trim()) go(); } }), 'צירוף מדויק – המילים כפי שנכתבו, זו ליד זו (בלי נטיות)'));
    drawAdv();
    const advanced = el('details', { class: 'pr-adv' }, el('summary', {}, 'חיפוש מתקדם'), advBox);
    let state = null;   // the one-word search: { info, keys, exact, list, shown }

    async function asReference(text) {
      const n = await fetch(`/api/sefaria/name/${encodeURIComponent(text)}?limit=0`).then((r) => r.json()).catch(() => null);
      if (!(n?.is_ref && /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I |II |Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah)/.test(n.ref))) return false;
      const chapter = n.ref.replace(/:\d+(-\d+)?$/, '');
      const t = await fetch(`/api/sefaria/v3/texts/${encodeURIComponent(n.ref)}?version=hebrew&return_format=text_only`).then((r) => r.json()).catch(() => ({}));
      const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : [x]);
      const he = t.heRef || n.ref, verse = flat(t.versions?.[0]?.text || []).join(' ').replace(/[֑-ֽ֯]/g, '');
      res.replaceChildren(el('button', { class: 'pr-hit ref', onclick: () => H.study(n.is_segment ? chapter : n.ref, he.replace(/:[^:]+$/, ''), { select: n.is_segment ? n.ref : null }) },
        el('b', {}, 'פתיחה לעיון: ', he), verse ? el('span', { class: 'pr-snip', lang: 'he' }, verse.length > 260 ? verse.slice(0, 260) + '…' : verse) : '',
        el('span', { class: 'muted' }, n.is_segment ? 'הפרק כולו, הפסוק מסומן' : '')));
      return true;
    }

    /* one word: the concordance */
    async function drawWord() {
      res.replaceChildren(el('p', { class: 'muted' }, 'סופר…'));
      state.list = await pick(state);
      const first = state.list.slice(0, 20);
      await C().loadBooks(first.map((o) => o[0]));
      const st = stats(state.list);
      const lemmaChips = state.info.lemmas.length > 1 ? el('div', { class: 'pr-lemmas', role: 'group', 'aria-label': 'ערכים מילוניים' },
        state.info.lemmas.slice(0, 8).map((l) => el('button', { type: 'button', class: 'pr-lemma' + (state.keys.includes(l.key) ? ' on' : ''), 'aria-pressed': String(state.keys.includes(l.key)),
          onclick: () => { state.keys = state.keys.includes(l.key) ? state.keys.filter((k) => k !== l.key) : [...state.keys, l.key]; if (!state.keys.length) state.keys = [l.key]; drawWord(); } },
          el('b', { lang: 'he' }, l.head), l.gloss ? el('small', { dir: 'ltr' }, ' ' + l.gloss) : '', el('small', {}, ' · ' + fmt(l.n))))) : '';
      const lem = state.info.lemmas.filter((l) => state.keys.includes(l.key));
      res.replaceChildren(
        el('div', { class: 'pr-sum' },
          el('p', { class: 'pr-count' }, el('b', {}, fmt(state.list.length)), state.list.length === 1 ? ' מופע' : ' מופעים',
            ` ב־${plural(st.verses, 'פסוק', 'פסוקים')} ב־${plural(st.books.length, 'ספר', 'ספרים')}`),
          el('p', { class: 'pr-books muted' }, (state.exact ? `הצורה ${state.info.word} בלבד` : lem.map((l) => `${l.head}${l.gloss ? ' – ' + l.gloss : ''}`).join(' · ')), ' · ',
            st.books.slice(0, 5).map((b) => `${b.he} ${fmt(b.n)}`).join(' · ') + (st.books.length > 5 ? ' · …' : '')),
          lemmaChips,
          el('label', { class: 'pr-exact' }, el('input', { type: 'checkbox', checked: state.exact, onchange: (e) => { state.exact = e.target.checked; drawWord(); } }), `רק הצורה ${state.info.word}`)),
        ...first.map((o) => occRow(o)));
      state.shown = first.length;
      moreRow();
    }
    function moreRow() {
      res.querySelector('.pr-more-row')?.remove();
      res.append(el('div', { class: 'pr-more-row' },
        state.shown < state.list.length ? el('button', { class: 'btn ghost pr-more', onclick: async () => {
          const next = state.list.slice(state.shown, state.shown + 20);
          await C().loadBooks(next.map((o) => o[0]));
          res.querySelector('.pr-more-row').before(...next.map((o) => occRow(o)));
          state.shown += next.length;
          moreRow();
        } }, 'עוד תוצאות') : '',
        state.list.length > 1 ? el('button', { class: 'btn pr-more', onclick: () => concordanceLocal(state) }, `כל ${fmt(state.list.length)} המופעים – קונקורדנציה`) : ''));
    }

    /* several words: Sefaria's search */
    let from = 0, last = '';
    async function drawPhrase(more) {
      const d = await H.api('/api/research/search', { body: { q: last, part, lang: adv.lang, exact: adv.exact, from } });
      if (!more) res.replaceChildren();
      res.querySelector('.pr-more-row')?.remove();
      if (!d.count) { res.append(el('p', { class: 'muted' }, `לא נמצאו ${unit()[1]}. נסו פחות מילים, בלי ניקוד, או חלק אחר של הספרייה.`)); return; }
      if (!more) res.append(el('div', { class: 'pr-sum' },
        el('p', { class: 'pr-count' }, el('b', {}, (d.capped ? 'יותר מ־' : '') + fmt(d.count)), ' ' + (d.count === 1 ? unit()[0] : unit()[1]), ` ב־${plural(d.books.length, 'ספר', 'ספרים')}`),
        el('p', { class: 'pr-books muted' }, d.books.slice(0, 6).map((b) => `${b.he} ${fmt(b.n)}`).join(' · ') + (d.books.length > 6 ? ' · …' : ''))));
      for (const h of d.hits) res.append(hitRow(h));
      from = d.next;
      res.append(el('div', { class: 'pr-more-row' },
        from < d.count ? el('button', { class: 'btn ghost pr-more', onclick: () => drawPhrase(true) }, 'עוד תוצאות') : '',
        d.count > 1 ? el('button', { class: 'btn pr-more', onclick: () => concordanceSefaria(last) }, `כל ${fmt(d.count)} התוצאות – קונקורדנציה`) : ''));
    }

    async function go() {
      const text = q.value.trim();
      if (!text) return;
      res.replaceChildren(el('p', { class: 'muted' }, 'מחפש…'));
      try {
        if (/\d|[a-z]/i.test(text) || /\s/.test(text)) { if (await asReference(text)) return; }
        if (isTanakh(part) && !adv.exact && adv.lang !== 'en' && /[\u05D0-\u05EA]/.test(text) && !/\s/.test(text.replace(/[־]/g, ''))) {
          await C().ready;
          const info = await C().lookup(text);
          if (info.lemmas.length) {
            // the likely entries: the first, and any other that accounts for a good part of the form
            state = { info, keys: info.lemmas.filter((l, i) => i === 0 || l.share >= 0.2).map((l) => l.key), exact: false };
            return drawWord();
          }
        }
        if (await asReference(text)) return;
        from = 0; last = text; state = null;
        await drawPhrase();
      } catch (_) { res.replaceChildren(el('p', {}, 'החיפוש לא הצליח כרגע. נסו שוב בעוד רגע.')); }
    }
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    return el('section', { class: 'card pr-search' }, el('h2', {}, 'חיפוש במקורות'),
      el('div', { class: 'pr-qrow' }, q, el('button', { class: 'btn primary', onclick: () => go() }, 'חיפוש')), chips, advanced, res,
      el('p', { class: 'pr-fine' }, 'מילה אחת בתנ"ך: קונקורדנציה מלאה – כל הצורות והנטיות, לפי ערך מילוני (נוסח לנינגרד, Open Scriptures Hebrew Bible). צירופים, המשנה, התלמוד ושאר הספרייה, בעברית ובלע״ז: החיפוש של ספריא. כל תוצאה נשמרת אצלנו לחודש.'));
  }

  async function draw() {
    let d;
    await H.concord.ready.catch(() => {});   // the names of the books in Hebrew
    try { d = await load(); } catch (_) { box.replaceChildren(el('p', {}, 'לא הצלחתי לטעון את הפרשה כרגע. נסו שוב בעוד רגע.')); return; }
    const par = d.items.find((i) => i.category === 'parashat');
    const candles = d.items.find((i) => i.category === 'candles');
    const havdalah = d.items.find((i) => i.category === 'havdalah');
    const holidays = d.items.filter((i) => i.category === 'holiday' || i.category === 'roshchodesh');
    const ley = par?.leyning || {};
    const name = par ? par.hebrew || par.title : 'פרשת השבוע';
    /** a click on a reading opens it in חדר העיון (a middle-click or ctrl-click still opens Sefaria) */
    const studyIt = (ref, label) => (e) => { if (e.ctrlKey || e.metaKey || e.button === 1) return; e.preventDefault(); H.study(ref, label); };
    const city = el('select', { class: 'pr-city', 'aria-label': 'העיר לזמני השבת', onchange: (e) => { P.city = e.target.value; H.savePrefs('parasha'); draw(); } },
      CITIES.map(([id, n]) => el('option', { value: id, selected: id === P.city }, n)));
    box.replaceChildren(
      el('a', { class: 'folder-back', href: '/' }, '‹ בית'),
      el('header', { class: 'pr-head' },
        el('span', { class: 'pr-logo', 'aria-hidden': 'true' }, H.icon('torah')),
        el('div', {}, el('small', {}, 'פרשת השבוע'), el('h1', {}, par ? par.hebrew || par.title : 'אין קריאה רגילה השבת'),
          par?.hdate ? el('p', { class: 'muted' }, 'שבת ' + heDate(new Date(par.date + 'T12:00'))) : null)),
      par?.memo ? el('section', { class: 'card pr-memo' }, el('h2', {}, 'על הפרשה'), el('p', { dir: 'auto' }, par.memo)) : null,
      el('div', { class: 'pr-cols' },
        el('div', { class: 'pr-col' },
        el('section', { class: 'card pr-times' }, el('div', { class: 'pr-times-head' }, el('h2', {}, 'זמני השבת'), city),
          el('div', { class: 'pr-time' }, el('span', {}, '🕯️ הדלקת נרות'), el('b', {}, candles ? time(candles.date) : '—'), el('small', {}, candles ? new Date(candles.date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }) : '')),
          el('div', { class: 'pr-time' }, el('span', {}, '✨ הבדלה'), el('b', {}, havdalah ? time(havdalah.date) : '—'), el('small', {}, havdalah ? new Date(havdalah.date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }) : '')),
          holidays.length ? el('p', { class: 'pr-hol' }, holidays.map((h) => h.hebrew || h.title).filter((v, i, a) => a.indexOf(v) === i).join(' · ')) : null,
          el('a', { class: 'pr-cal', href: '/tools/calendar/' }, H.icon('calendar'), 'לוח השנה העברי והלועזי ›')),
        searchCard()),
        el('section', { class: 'card pr-read' }, C().books.length ? booksNav() : '', el('h2', {}, 'הקריאה'),
          ley.torah ? el('a', { class: 'pr-ref main', href: sefaria(ley.torah), onclick: studyIt(ley.torah, name + ' – הפרשה כולה') }, el('b', {}, 'הפרשה כולה'), el('span', {}, heRef(ley.torah))) : null,
          el('ol', { class: 'pr-aliyot' }, ['1', '2', '3', '4', '5', '6', '7'].filter((k) => ley[k]).map((k) => {
            const n = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי'][+k - 1];
            return el('li', {}, el('a', { href: sefaria(ley[k]), onclick: studyIt(ley[k], `${name} – ${n}`) }, el('span', {}, n), el('small', {}, heRef(ley[k]))));
          })),
          ley.haftarah ? el('a', { class: 'pr-ref', href: sefaria(ley.haftarah.split(';')[0].trim()), onclick: studyIt(ley.haftarah.split(';')[0].trim(), name + ' – הפטרה') }, el('b', {}, 'הפטרה'), el('span', {}, heRef(ley.haftarah))) : null,
          el('p', { class: 'pr-fine' }, 'הקישו על עלייה כדי לפתוח אותה לעיון: מפרשים, מילון, נוסח, ושאלות לחוקר. הזמנים והקריאה מ־Hebcal, הטקסטים מספריא.'))));
    const deep = new URLSearchParams(location.search).get('study');
    if (deep && !document.querySelector('.rs')) H.study(deep, deep === ley.torah ? name : null);   // another passage gets its own name (from Sefaria)
  }
  draw();
})();
