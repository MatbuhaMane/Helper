/* חדר העיון of פרשת השבוע: a passage to study closely.
   The verses (Miqra according to the Masorah, with or without the cantillation marks, an English translation on request);
   tap a verse for its commentaries, targumim and midrash, and its textual notes (מנחת שי) and the Leningrad Codex page;
   tap a word for the dictionary; and "החוקר" – a critical scholar who answers from the sources, citing them in SBL style.
   Texts are fetched from Sefaria's public API (open CORS); the researcher is /api/research/ask.
   The tools stay closed until the reader taps a verse or a word (or asks the researcher), and can be minimised again.
   H.study(ref, label, { select }) opens it (select: a verse to mark, e.g. "Genesis 28:12"); /parasha/?study=<ref> opens it straight away. */
(() => {
  const { el, toast } = H;
  const API = '/api/sefaria';   // Sefaria through our own lasting copy (server/sefaria.ts)
  const P = H.prefs('study', { teamim: true, en: false });
  const enc = (ref) => encodeURIComponent(ref);
  const sefariaUrl = (ref) => `https://www.sefaria.org.il/${ref.replace(/ /g, '_').replace(/:/g, '.').replace(/_(\d)/, '.$1')}?lang=he`;
  const TEAMIM = /[֑-ֽ֯׀׃-׆]/g;   // cantillation, meteg, paseq, sof pasuq and the like
  const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').trim();
  const cache = new Map();
  async function get(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then((r) => { if (!r.ok) throw new Error('sefaria ' + r.status); return r.json(); });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
  }

  /** 28 → "כח" (Hebrew numerals, with 15 and 16 written טו and טז) */
  function heNum(n) {
    const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], hund = ['', 'ק', 'ר', 'ש', 'ת'];
    let s = '';
    if (n >= 100) { s += hund[Math.floor(n / 100)] || ''; n %= 100; }
    if (n === 15) return s + 'טו';
    if (n === 16) return s + 'טז';
    return s + tens[Math.floor(n / 10)] + ones[n % 10];
  }

  const CATS = [
    ['Commentary', 'פרשנים'], ['Targum', 'תרגומים'], ['Midrash', 'מדרש'], ['Talmud', 'תלמוד'], ['Second Temple', 'ספרות בית שני'],
    ['Tanakh', 'מקבילות במקרא'], ['Reference', 'מילונים ועיון'], ['Halakhah', 'הלכה'], ['Jewish Thought', 'מחשבה'],
    ['Kabbalah', 'קבלה'], ['Chasidut', 'חסידות'], ['Musar', 'מוסר'], ['Liturgy', 'תפילה'], ['Mishnah', 'משנה'], ['Tosefta', 'תוספתא'],
  ];
  // the tabs that list sources: מדרש and משנה ותלמוד have tabs of their own, מפרשים has the rest
  const TAB_CATS = { midrash: ['Midrash'], talmud: ['Mishnah', 'Tosefta', 'Talmud'] };
  TAB_CATS.links = CATS.map(([c]) => c).filter((c) => !TAB_CATS.midrash.includes(c) && !TAB_CATS.talmud.includes(c));
  const NONE = { links: 'לא מצאתי פרשנים שמקושרים לפסוק הזה.', midrash: 'לא מצאתי מדרש על הפסוק הזה.', talmud: 'הפסוק הזה לא מובא במשנה או בתלמוד (לפי הקישורים בספריא).' };
  const spin = () => el('span', { class: 'rs-spin', 'aria-hidden': 'true' });

  const FIRST = ['Rashi', 'Ramban', 'Ibn Ezra', 'Rashbam', 'Sforno', 'Radak', 'Or HaChaim', 'Abarbanel on Torah', 'Shadal', 'Malbim', 'Minchat Shai',
    'Onkelos', 'Targum Jonathan', 'Targum Jerusalem', 'Bereshit Rabbah', 'Shemot Rabbah', 'Vayikra Rabbah', 'Bamidbar Rabbah', 'Devarim Rabbah'];

  async function study(ref, label, opts = {}) {
    document.querySelector('.rs')?.remove();
    const S = { ref, verses: [], sel: -1, word: null, tab: 'links', talk: [] };
    const url = new URL(location.href); url.searchParams.set('study', ref); history.replaceState(null, '', url);

    const textBox = el('div', { class: 'rs-text', 'aria-live': 'polite' }, el('p', { class: 'muted' }, 'טוען את הפסוקים…'));
    const tabsBar = el('div', { class: 'rs-tabs', role: 'tablist' });
    const pane = el('div', { class: 'rs-pane' });
    const minimize = () => { root.classList.remove('open'); drawFab(); };
    const tools = el('aside', { class: 'rs-tools', 'aria-label': 'כלי העיון' },
      el('div', { class: 'rs-tools-head' }, tabsBar,
        el('button', { class: 'rs-min', 'aria-label': 'מזעור הכלים', title: 'מזעור', onclick: minimize }, el('span', { 'aria-hidden': 'true' }, '–'))),
      pane);
    const close = () => { root.remove(); document.body.classList.remove('modal-open'); const u = new URL(location.href); u.searchParams.delete('study'); history.replaceState(null, '', u); };
    const root = el('div', { class: 'rs', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'עיון ב' + (label || ref) },
      el('header', { class: 'rs-head' },
        el('button', { class: 'rs-back', onclick: close }, '‹ לפרשה'),
        el('div', { class: 'rs-title' }, el('small', {}, 'עיון'), el('h2', {}, label || ref), el('span', { class: 'rs-ref', dir: 'auto' }, '')),
        el('div', { class: 'rs-opts' },
          el('label', { class: 'rs-opt' }, el('input', { type: 'checkbox', checked: P.teamim, onchange: (e) => { P.teamim = e.target.checked; H.savePrefs('study'); drawText(); } }), 'טעמים'),
          el('label', { class: 'rs-opt' }, el('input', { type: 'checkbox', checked: P.en, onchange: (e) => { P.en = e.target.checked; H.savePrefs('study'); drawText(); } }), 'English'),
          el('a', { class: 'rs-ext', href: sefariaUrl(ref), target: '_blank', rel: 'noopener' }, 'בספריא ↗'))),
      el('div', { class: 'rs-body' }, el('div', { class: 'rs-page' }, textBox), tools),
      el('div', { class: 'rs-fab' }));
    // the floating buttons: the researcher always; "the tools" when they were minimised over a chosen verse
    function drawFab() {
      const fab = (ic, name, tint, go) => el('button', { class: 'rs-fab-i', style: `--tint:${tint}`, onclick: go }, el('span', { class: 'ic' }, H.icon(ic)), el('span', { class: 'lbl' }, name));
      root.querySelector('.rs-fab').replaceChildren(
        S.sel >= 0 ? fab('tools', 'כלי עיון', '#d4f2dc', () => openTab(S.tab)) : '',
        fab('lens', 'שאלו את החוקר', '#ffe7a8', () => openTab('ask')));
    }
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (root.classList.contains('open')) minimize(); else close(); } });
    document.body.append(root);
    document.body.classList.add('modal-open');
    root.querySelector('.rs-back').focus();

    /* the verses */
    try {
      const d = await get(`${API}/v3/texts/${enc(ref)}?version=hebrew&version=english&return_format=text_only`);
      root.querySelector('.rs-ref').textContent = d.heRef || ref;
      if (!label && d.heRef) root.querySelector('.rs-title h2').textContent = d.heRef.replace(/[׳״]/g, (c) => c);   // no name given: the passage's own
      const he = d.versions.find((v) => v.language === 'he') || d.versions[0], en = d.versions.find((v) => v.language === 'en');
      const book = d.book || ref.split(' ')[0];
      const [c0, v0 = 1] = (d.sections || []).map(Number);   // a whole chapter ("Genesis 25") has no verse in its sections
      const nested = Array.isArray(he.text[0]);
      const chapters = nested ? he.text : [he.text], enCh = en ? (nested ? en.text : [en.text]) : [];
      chapters.forEach((arr, ci) => arr.forEach((t, vi) => {
        const ch = c0 + ci, v = (ci === 0 ? v0 : 1) + vi;
        S.verses.push({ ch, v, ref: `${book} ${ch}:${v}`, he: strip(t).replace(/\s*\{[פס]\}\s*/g, ' ').trim(), en: strip(enCh[ci]?.[vi] || '') });
      }));
      drawText();
      drawFab();
      drawChapters(book, d.heRef || '');
      // a verse to mark (from the search): mark it and bring it into view, the tools still closed
      const at = opts.select ? S.verses.findIndex((v) => v.ref === opts.select) : -1;
      if (at >= 0) { S.sel = at; mark(true); drawFab(); }
    } catch (_) {
      textBox.replaceChildren(el('p', {}, 'לא הצלחתי לטעון את הפסוקים מספריא. נסו שוב בעוד רגע.'));
    }

    /** every chapter of the book, in Hebrew letters: the open ones marked, a tap opens another */
    /** the chapters of the book at the top (every chapter in letters, or – in a long book – a list to pick from), and the
        previous and next chapter at the end of the text */
    async function drawChapters(book, heRefText) {
      await H.concord?.ready;
      const b = H.concord?.books.find((x) => x[1] === book);
      if (!b) return;
      const open = new Set(S.verses.map((v) => v.ch));
      const first = Math.min(...open), last = Math.max(...open), n = b[3];
      const go = (c) => H.study(`${book} ${c}`, `${b[2]} ${heNum(c)}`);
      const arrow = (c, sign, labelText) => el('button', { class: 'rs-charr', disabled: c < 1 || c > n, 'aria-label': labelText, title: labelText, onclick: () => go(c) }, sign);
      const picker = n > 30
        ? el('select', { class: 'rs-chsel', 'aria-label': 'בחירת פרק', onchange: (e) => go(+e.target.value) },
            Array.from({ length: n }, (_, k) => el('option', { value: k + 1, selected: k + 1 === first }, 'פרק ' + heNum(k + 1))))
        : el('span', { class: 'rs-chlist' }, Array.from({ length: n }, (_, k) => k + 1).map((c) =>
            el('button', { class: 'rs-chn' + (open.has(c) ? ' on' : ''), 'aria-current': open.has(c) ? 'true' : null, onclick: () => go(c) }, heNum(c))));
      const page = root.querySelector('.rs-page');
      page.prepend(el('nav', { class: 'rs-chs', 'aria-label': 'פרקי ' + b[2] },
        el('b', {}, b[2]), arrow(first - 1, '›', 'הפרק הקודם'), picker, arrow(last + 1, '‹', 'הפרק הבא')));
      page.append(el('nav', { class: 'rs-next', 'aria-label': 'פרק קודם ופרק הבא' },
        first > 1 ? el('button', { class: 'rs-next-b', onclick: () => go(first - 1) }, el('small', {}, '› הפרק הקודם'), el('b', {}, `${b[2]} ${heNum(first - 1)}`)) : el('span'),
        last < n ? el('button', { class: 'rs-next-b end', onclick: () => go(last + 1) }, el('small', {}, 'הפרק הבא ‹'), el('b', {}, `${b[2]} ${heNum(last + 1)}`)) : el('span')));
    }

    function drawText() {
      const out = [];
      let ch = null;
      S.verses.forEach((v, i) => {
        if (v.ch !== ch) { ch = v.ch; out.push(el('h3', { class: 'rs-ch' }, 'פרק ' + heNum(ch))); }
        // words split on spaces and after a maqaf (אֲשֶׁר־שַׂמְתִּי is two words for the dictionary)
        const words = (P.teamim ? v.he : v.he.replace(TEAMIM, '')).split(/\s+/).flatMap((w) => w.split(/(?<=־)/)).filter(Boolean);
        out.push(el('p', { class: 'rs-v' + (i === S.sel ? ' on' : ''), 'data-i': i },
          el('button', { class: 'rs-n', 'aria-label': `פסוק ${heNum(v.v)}`, 'data-i': i }, heNum(v.v)),
          el('span', { class: 'rs-he', lang: 'he' }, words.flatMap((w, wi) => [el('span', { class: 'w' + (S.word && S.word.i === i && S.word.wi === wi ? ' on' : ''), 'data-i': i, 'data-wi': wi, tabindex: 0, role: 'button' }, w), w.endsWith('־') ? '' : ' '])),
          P.en && v.en ? el('span', { class: 'rs-en', lang: 'en', dir: 'ltr' }, v.en) : null));
      });
      textBox.replaceChildren(...out);
    }
    textBox.addEventListener('click', (e) => {
      const w = e.target.closest('.w');
      if (w) { pickWord(+w.dataset.i, +w.dataset.wi, w.textContent); return; }
      const v = e.target.closest('[data-i]');
      if (v) pickVerse(+v.dataset.i);
    });
    textBox.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('w')) { e.preventDefault(); e.target.click(); } });

    function mark(force) {
      textBox.querySelectorAll('.rs-v.on, .w.on').forEach((n) => n.classList.remove('on'));
      textBox.querySelector(`.rs-v[data-i="${S.sel}"]`)?.classList.add('on');
      if (S.word) textBox.querySelector(`.w[data-i="${S.word.i}"][data-wi="${S.word.wi}"]`)?.classList.add('on');
      // on a phone the tools sheet covers the lower part of the screen: bring the chosen verse to the top
      if (force || matchMedia('(max-width: 820px)').matches) textBox.querySelector('.rs-v.on')?.scrollIntoView({ block: force ? 'center' : 'start', behavior: 'smooth' });
    }
    /** show a verse the researcher cites (a short glow), without changing what the reader chose */
    function flash(i) {
      const n = textBox.querySelector(`.rs-v[data-i="${i}"]`);
      if (!n) return;
      n.scrollIntoView({ block: 'center', behavior: 'smooth' });
      n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash');
    }
    function pickVerse(i) { S.sel = i; S.word = null; mark(); openTab(S.tab === 'word' ? 'links' : S.tab); }
    // the word as the dictionary wants it: letters and vowels only (no cantillation, maqaf or sof pasuq)
    function pickWord(i, wi, text) { S.sel = i; S.word = { i, wi, text: text.replace(TEAMIM, '').replace(/[^ְ-ׇּׁׂא-ת]/g, '') }; mark(); openTab('word'); }

    /* the tools, by tab */
    const TABS = [['word', 'מילה'], ['links', 'מפרשים'], ['midrash', 'מדרש'], ['talmud', 'משנה ותלמוד'], ['nusach', 'נוסח'], ['tr', 'תרגום'], ['ask', 'החוקר']];
    function openTab(tab) {
      S.tab = tab;
      tabsBar.replaceChildren(...TABS.map(([k, n]) => el('button', { role: 'tab', class: 'rs-tab' + (k === tab ? ' on' : ''), 'aria-selected': String(k === tab), onclick: () => openTab(k) }, n)));
      root.classList.add('open');
      drawFab();
      const verse = S.verses[S.sel];
      if (tab === 'ask') return drawAsk();
      if (tab === 'tr') return drawTr();
      if (!verse) return pane.replaceChildren(el('p', { class: 'rs-hint' }, tab === 'word' ? 'הקישו על מילה בפסוק כדי לראות את פירושה במילון.' : 'הקישו על פסוק (או על המספר שלו) כדי לראות כאן את מה שנכתב עליו.'));
      if (tab === 'word') return S.word ? drawWord(verse, S.word.text) : pane.replaceChildren(el('p', { class: 'rs-hint' }, 'הקישו על מילה בפסוק.'));
      if (TAB_CATS[tab]) return drawLinks(verse, tab);
      if (tab === 'nusach') return drawNusach(verse);
    }
    const verseHead = (verse) => el('p', { class: 'rs-at' }, `${root.querySelector('.rs-ref').textContent.split(' ')[0]} ${heNum(verse.ch)}, ${heNum(verse.v)}`);
    const loading = (t) => el('p', { class: 'muted rs-loading' }, spin(), t || 'טוען…');

    async function drawWord(verse, word) {
      // in Hebrew first: what the word means here, its root and its form (Gemini, kept for a month)
      const heBox = el('section', { class: 'rs-he-word' }, loading('מפרש בעברית…'));
      H.api('/api/research/word', { body: { word, verse: verse.he.replace(TEAMIM, ''), ref: verse.ref } }).then((x) => {
        heBox.replaceChildren(el('h4', {}, 'פירוש בעברית'), el('p', { class: 'rs-he-mean' }, x.meaning),
          el('div', { class: 'rs-he-facts' }, x.root ? el('span', {}, el('small', {}, 'שורש '), el('b', {}, x.root)) : '', x.grammar ? el('span', {}, el('small', {}, 'צורה '), x.grammar) : '',
            x.lang && x.lang !== 'עברית' ? el('span', {}, el('small', {}, 'לשון '), x.lang) : ''),
          x.note ? el('p', { class: 'rs-fine' }, x.note) : '',
          el('button', { class: 'rs-tr-b rs-word-save', onclick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            const lines = [`${word} (${root.querySelector('.rs-ref').textContent.split(' ')[0]} ${heNum(verse.ch)}:${heNum(verse.v)})`, '', x.meaning,
              x.root ? 'שורש: ' + x.root : '', x.grammar ? 'צורה: ' + x.grammar : '', x.lang && x.lang !== 'עברית' ? 'לשון: ' + x.lang : '', x.note || '',
              concBox.textContent ? concBox.textContent.replace(' · לכל המופעים', '') : '', '', 'הפסוק: ' + verse.he.replace(TEAMIM, '')].filter((l, i, a) => l || a[i - 1]);
            try {
              await H.api('/api/notes', { body: { title: `${word} – פירוש מילה`, body: lines.join('\n'), source: { url: location.href, title: 'עיון: ' + verse.ref } } });
              btn.textContent = '✓ נשמר בפתקים';
              toast('נשמר בפתקים', 'לפתקים', () => { location.href = '/tools/notes/'; });
            } catch (_) { btn.disabled = false; toast('השמירה לא הצליחה'); }
          } }, '📝 שמירה כפתק'));
      }).catch(() => heBox.replaceChildren(el('p', { class: 'muted' }, 'לא הצלחתי לפרש בעברית כרגע.')));
      // the word in the whole Tanakh, from our concordance
      const concBox = el('div', { class: 'rs-conc' });
      H.concord?.lookup(word).then((info) => {
        const l = info.lemmas[0];
        if (!l) return;
        concBox.replaceChildren(el('span', {}, 'הערך ', el('b', { lang: 'he' }, l.head), ` מופיע בתנ"ך ${l.n.toLocaleString('he-IL')} פעמים`),
          H.concordanceOf ? el('button', { class: 'rs-link', onclick: () => H.concordanceOf(word) }, ' · לכל המופעים') : '');
      }).catch(() => {});
      pane.replaceChildren(verseHead(verse), el('h3', { class: 'rs-word', lang: 'he' }, word), heBox, concBox, loading('מחפש במילונים…'));
      let list = [];
      try { list = await get(`${API}/words/${enc(word)}?lookup_ref=${enc(verse.ref)}&never_split=1`); } catch (_) { /* shown below */ }
      if (S.tab !== 'word' || S.word?.text !== word) return;
      const entries = (Array.isArray(list) ? list : []).filter((x) => x.content).slice(0, 6);
      pane.replaceChildren(verseHead(verse), el('h3', { class: 'rs-word', lang: 'he' }, word), heBox, concBox,
        entries.length ? el('h4', { class: 'rs-lex-h' }, 'במילונים (באנגלית)') : '',
        entries.length ? el('div', { class: 'rs-lex' }, entries.map((x) => {
          const senses = []; const walk = (ss, depth) => (ss || []).forEach((s) => { if (s.definition && senses.length < 8) senses.push([depth, strip(s.definition)]); walk(s.senses, depth + 1); });
          walk(x.content.senses, 0);
          return el('section', { class: 'rs-entry' },
            el('div', { class: 'rs-entry-h' }, el('b', { lang: 'he' }, x.headword || ''), x.content.morphology ? el('span', { class: 'rs-morph', dir: 'ltr' }, x.content.morphology) : null, el('small', {}, x.parent_lexicon || '')),
            x.transliteration ? el('div', { class: 'rs-translit', dir: 'ltr' }, x.transliteration) : null,
            el('ol', { class: 'rs-senses', dir: 'ltr' }, senses.map(([dep, t]) => el('li', { style: `margin-inline-start:${dep * 12}px` }, t))));
        })) : el('p', {}, 'לא מצאתי את המילה במילונים של ספריא.'),
        el('button', { class: 'btn rs-askword', onclick: () => { openTab('ask'); askBox.value = `מה משמעות המילה «${word}» בפסוק הזה? מה השורש שלה, ומה המקבילות שלה בשפות שמיות קרובות (אכדית, אוגריתית, ארמית)?`; askBox.focus(); } }, '🔎 לשאול את החוקר על המילה'));
    }

    /* תרגום: under a text in Aramaic, Greek, Latin or Syriac, a button that puts it into Hebrew (with the key words) */
    const NONHE = /[\u0370-\u03FF\u1F00-\u1FFF\u0700-\u074F]|[A-Za-z]{3,}/;
    const ARAMAIC = /(?:^|\s)(?:דין|ליה|ביה|תנא|תניא|הכא|התם|מאי|קא|אית|לית|יתיה|ית|וית|דהוא|ארי|ואמר|אנא|אתון|אנון|דא|דנא|כדין|הדין|בגין|דילמא|אמאי)(?=\s|$|[.,:])/g;
    function looksForeign(text, cat) { return ['Targum', 'Talmud', 'Kabbalah'].includes(cat) || NONHE.test(text) || (text.match(ARAMAIC) || []).length >= 3; }
    function translateBtn(text, { lang, ref: src } = {}) {
      const out = el('div', { class: 'rs-tr' });
      const label = '🔤 תרגום לעברית';
      const btn = el('button', { class: 'rs-tr-b', onclick: async () => {
        if (out.childElementCount) { out.replaceChildren(); btn.textContent = label; return; }
        btn.disabled = true; btn.replaceChildren(spin(), 'מתרגם…');
        try {
          const t = await H.api('/api/research/translate', { body: { text: text.slice(0, 6000), lang: lang || null, ref: src || null } });
          out.replaceChildren(el('p', { class: 'rs-tr-t', lang: 'he' }, t.translation),
            t.words.length ? el('div', { class: 'rs-terms' }, t.words.map((w) => el('span', { class: 'rs-term' }, el('b', { dir: 'auto' }, w.word), w.translit ? el('i', { dir: 'ltr' }, ' ' + w.translit) : '', ' – ' + w.gloss))) : '',
            t.note ? el('p', { class: 'rs-fine' }, t.note) : '',
            el('p', { class: 'rs-fine' }, 'תרגום ממוכן מ' + (t.lang || 'המקור') + ' – כדאי לבדוק מול המקור.'));
          btn.textContent = 'הסתרת התרגום';
        } catch (_) { btn.textContent = label; toast('התרגום לא הצליח כרגע'); }
        btn.disabled = false;
      } }, label);
      return el('div', { class: 'rs-tr-wrap' }, btn, out);
    }

    async function verseLinks(verse) { return get(`${API}/links/${enc(verse.ref)}?with_text=0`); }

    async function drawLinks(verse, tab = 'links') {
      pane.replaceChildren(verseHead(verse), loading({ links: 'אוסף את המפרשים…', midrash: 'אוסף את המדרשים…', talmud: 'מחפש במשנה ובתלמוד…' }[tab]));
      let links = [];
      try { links = await verseLinks(verse); } catch (_) { /* shown below */ }
      if (S.tab !== tab || S.verses[S.sel] !== verse) return;
      const groups = CATS.filter(([cat]) => TAB_CATS[tab].includes(cat)).map(([cat, name]) => {
        const by = new Map();
        links.filter((l) => l.category === cat).forEach((l) => { const t = l.collectiveTitle?.he || l.index_title; if (!by.has(t)) by.set(t, []); by.get(t).push(l); });
        // the best-known first (רש"י, רמב"ן, אבן עזרא…), then the rest by when they wrote
        const rank = ([, ls]) => { const k = FIRST.indexOf(ls[0].collectiveTitle?.en || ls[0].index_title); return k < 0 ? 100 + ((ls[0].compDate || [3000])[0] / 10000) : k; };
        return by.size ? el('section', { class: 'rs-group' }, el('h4', {}, name, el('small', {}, ' ' + by.size)),
          el('div', { class: 'rs-chips' }, [...by].sort((a, b) => rank(a) - rank(b)).map(([t, ls]) => el('button', { class: 'rs-chip', onclick: (e) => showSource(e.currentTarget, ls) }, t)))) : null;
      }).filter(Boolean);
      pane.replaceChildren(verseHead(verse), groups.length ? el('div', { class: 'rs-groups' }, groups) : el('p', {}, NONE[tab]));
    }
    async function showSource(chip, ls) {
      const open = chip.classList.toggle('on');
      chip.nextElementSibling?.classList.contains('rs-src') && chip.nextElementSibling.remove();
      if (!open) return;
      const box = el('div', { class: 'rs-src' }, loading());
      chip.after(box);
      const parts = await Promise.all(ls.slice(0, 4).map(async (l) => {
        try {
          const d = await get(`${API}/v3/texts/${enc(l.ref)}?version=hebrew&return_format=text_only`);
          const flat = (t) => (Array.isArray(t) ? t.flatMap(flat) : [t]);
          const txt = flat(d.versions?.[0]?.text || []).map(strip).join(' ').slice(0, 1600);
          return el('div', { class: 'rs-src-part' }, el('p', { lang: 'he' }, txt || '—'),
            el('a', { href: sefariaUrl(l.ref), target: '_blank', rel: 'noopener' }, (l.sourceHeRef || l.ref) + ' ↗'),
            txt && looksForeign(txt, l.category) ? translateBtn(txt, { lang: l.category === 'Targum' ? 'Aramaic' : null, ref: l.ref }) : '');
        } catch (_) { return el('p', { class: 'muted' }, 'לא נטען'); }
      }));
      box.replaceChildren(...parts, ls.length > 4 ? el('p', { class: 'muted' }, `ועוד ${ls.length - 4} בספריא`) : '');
    }

    async function drawNusach(verse) {
      // our own witnesses come at once; what Sefaria has (מנחת שי, Onkelos, the codex) follows when it arrives
      const witBox = el('div', {}, loading('טוען את עדי הנוסח…'));
      const restBox = el('div', { class: 'rs-groups' }, loading('מחפש הערות נוסח וכתבי יד בספריא…'));
      pane.replaceChildren(verseHead(verse), witBox, restBox);
      witnesses(verse).catch(() => null).then((w) => { if (S.verses[S.sel] === verse) witBox.replaceChildren(w || ''); });
      let links = [], mss = [];
      try { [links, mss] = await Promise.all([verseLinks(verse).catch(() => []), get(`${API}/manuscripts/${enc(verse.ref)}`).catch(() => [])]); } catch (_) { /* below */ }
      if (S.tab !== 'nusach' || S.verses[S.sel] !== verse) return;
      const shai = links.filter((l) => /Minchat Shai/i.test(l.index_title || ''));
      const onk = links.filter((l) => /Onkelos/i.test(l.index_title || ''));
      const block = async (title, ls) => {
        if (!ls.length) return null;
        const texts = await Promise.all(ls.slice(0, 3).map((l) => get(`${API}/v3/texts/${enc(l.ref)}?version=hebrew&return_format=text_only`).then((d) => { const f = (t) => (Array.isArray(t) ? t.flatMap(f) : [t]); return f(d.versions?.[0]?.text || []).map(strip).join(' '); }).catch(() => '')));
        return el('section', { class: 'rs-group' }, el('h4', {}, title), ...texts.map((t, i) => (t ? el('div', {}, el('p', { class: 'rs-quote', lang: 'he' }, t, ' ', el('a', { href: sefariaUrl(ls[i].ref), target: '_blank', rel: 'noopener' }, '↗')),
          /Onkelos/i.test(ls[i].index_title || '') ? translateBtn(t, { lang: 'Aramaic', ref: ls[i].ref }) : '') : '')).filter(Boolean));
      };
      const parts = await Promise.all([block('מנחת שי – הערות על נוסח המסורה', shai), block('תרגום אונקלוס', onk)]);
      if (S.tab !== 'nusach' || S.verses[S.sel] !== verse) return;
      restBox.replaceChildren(...parts.filter(Boolean),
        !shai.length ? el('p', { class: 'muted' }, 'אין למנחת שי הערה על הפסוק הזה.') : '',
        mss.length ? el('section', { class: 'rs-group' }, el('h4', {}, 'כתבי יד'),
          el('div', { class: 'rs-mss' }, mss.slice(0, 4).map((m) => el('a', { class: 'rs-ms', href: m.image_url, target: '_blank', rel: 'noopener' },
            el('img', { src: m.thumbnail_url, alt: '', loading: 'lazy' }), el('span', {}, (m.manuscript?.he_title || m.manuscript?.title || 'כתב יד') + (m.page_id ? ' · ' + m.page_id.replace(/_/g, ' ') : '')))))) : '',
        el('section', { class: 'rs-group' }, el('h4', {}, 'לפרש את ההבדלים'),
          el('p', { class: 'muted' }, 'החוקר יכול להסביר את חילופי הנוסח ואת משמעותם, עם מקורות מהמחקר.'),
          el('button', { class: 'btn', onclick: () => { openTab('ask'); askBox.value = 'מה חילופי הנוסח בפסוק הזה בין נוסח המסורה, התורה השומרונית, מגילות קומראן ותרגום השבעים? מה המשמעות של ההבדלים, ומה המחקר אומר עליהם?'; askBox.focus(); } }, '🔎 להשוות נוסחים עם החוקר')));
    }

    /* עדי נוסח: the Samaritan Pentateuch, the Dead Sea Scrolls, the Septuagint, the Vulgate and the Peshitta for this verse,
       from our own copies (/witnesses/, built by tools/build-witnesses.py). In the Hebrew witnesses the words that differ from
       the Masoretic text (by their letters) are marked. */
    async function witnesses(verse) {
      const index = await get('/witnesses/index.json');
      await H.concord.ready;
      const osis = H.concord.books.find((b) => b[1] === verse.ref.replace(/ \d+:\d+$/, ''))?.[0];
      if (!osis) return null;
      const rows = await Promise.all(index.filter((w) => w.books.includes(osis)).map(async (w) => {
        const t = (await get(`/witnesses/${w.id}/${osis}.json`).catch(() => ({})))?.[verse.ch]?.[verse.v];
        return t ? [w, t] : null;
      }));
      const mt = verse.he.replace(/\u05BE/g, ' ').replace(/[\u0591-\u05C7]/g, '').split(/\s+/).filter(Boolean);   // the maqaf first: it joins two words
      const found = rows.filter(Boolean);
      if (!found.length) return el('section', { class: 'rs-group' }, el('h4', {}, 'עדי נוסח'), el('p', { class: 'muted' }, 'אין עדי נוסח לפסוק הזה בעותקים שלנו.'));
      const row = (w, text, sub) => {
        const isHe = w.lang === 'he';
        const body = el('p', { class: 'rs-wit-t', lang: w.lang, dir: isHe || w.lang === 'syc' ? 'rtl' : 'ltr' });
        let differs = false;
        if (isHe) {
          // a word wholly inside [brackets] was filled in by the editors (the scroll is damaged there): faint, and never "different"
          let open = false;
          const toks = text.split(/\s+/).filter(Boolean).map((t) => {
            const startsIn = open;
            for (const ch of t) { if (ch === '[') open = true; else if (ch === ']') open = false; }
            return { t, recon: (startsIn || t.startsWith('[')) && (open || t.endsWith(']')) && !/^[^[]*\][^\]]+$/.test(t) };
          });
          const marks = diffWords(mt, toks.map((x) => x.t));
          marks.forEach((m, i) => { if (toks[i].recon) m[1] = false; });
          differs = marks.some((m) => m[1]);
          marks.forEach(([wd, d], i) => { body.append(d ? el('mark', {}, wd) : toks[i].recon ? el('span', { class: 'rs-recon', title: 'השלמת העורכים' }, wd) : wd, i < marks.length - 1 ? ' ' : ''); });
        } else body.textContent = text.normalize('NFC');   // the Greek comes with its accents as separate marks
        return el('div', { class: 'rs-wit-row' + (differs ? ' diff' : '') },
          el('div', { class: 'rs-wit-h' }, el('b', {}, w.name), sub ? el('span', { class: 'muted', dir: 'ltr' }, sub) : '',
            isHe ? el('small', {}, differs ? 'שונה מנוסח המסורה' : 'זהה בעיצורים') : '', el('a', { class: 'rs-wit-src', href: w.url, target: '_blank', rel: 'noopener', title: w.credit }, 'מקור ↗')),
          body, !isHe && w.kind !== 'aid' ? translateBtn(text, { lang: { grc: 'Greek', la: 'Latin', syc: 'Syriac' }[w.lang], ref: `${w.name} ${verse.ref}` }) : '');
      };
      const out = [];
      for (const [w, t] of found) {
        if (w.kind === 'dss') t.forEach(([scroll, text]) => out.push(row(w, text, scroll)));
        else if (w.kind === 'aid') out.push(el('details', { class: 'rs-wit-aid' }, el('summary', {}, w.name), el('p', { class: 'rs-wit-tr', dir: 'ltr', lang: 'en' }, t)));
        else out.push(row(w, t));
      }
      return el('section', { class: 'rs-group rs-wit' }, el('h4', {}, 'עדי נוסח'), ...out,
        el('p', { class: 'rs-fine' }, 'מילים מסומנות: שונות באותיותיהן מנוסח המסורה (כולל כתיב מלא וחסר). המספור לפי כל מהדורה – בתהלים ובירמיהו של השבעים הפסוק המקביל עשוי להיות במקום אחר.'));
    }
    /** which words of b are not in a (by letters, final letters as ordinary ones): a longest-common-subsequence */
    function diffWords(a, b) {
      const norm = (w) => H.concord.bare(w);
      const A = a.map(norm), B = b.map(norm);
      const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
      for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      const keep = new Set();
      for (let i = 0, j = 0; i < A.length && j < B.length;) { if (A[i] === B[j]) { keep.add(j); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
      return b.map((w, j) => [w, !keep.has(j) && norm(w) !== '']);
    }

    /* a translator for any text: Aramaic, Greek, Latin or Syriac into Hebrew */
    const trBox = el('textarea', { class: 'rs-q', rows: 5, dir: 'auto', placeholder: 'הדביקו כאן טקסט בארמית, ביוונית, בלטינית או בסורית…', 'aria-label': 'טקסט לתרגום' });
    const trLang = el('select', { class: 'rs-sel', 'aria-label': 'שפת המקור' }, [['', 'זיהוי אוטומטי'], ['Aramaic', 'ארמית'], ['Greek', 'יוונית'], ['Latin', 'לטינית'], ['Syriac', 'סורית']].map(([v, n]) => el('option', { value: v }, n)));
    const trOut = el('div', { class: 'rs-tr' });
    function drawTr() {
      pane.replaceChildren(el('p', { class: 'rs-at' }, 'תרגום לעברית'), trBox,
        el('div', { class: 'rs-askrow' }, trLang, el('button', { class: 'btn primary', onclick: () => {
          const text = trBox.value.trim();
          if (!text) return;
          const holder = translateBtn(text, { lang: trLang.value || null, ref: S.ref });
          trOut.replaceChildren(holder);
          holder.querySelector('.rs-tr-b').click();
        } }, 'תרגום')), trOut,
        el('p', { class: 'rs-fine' }, 'מתאים לתרגומים הארמיים, לתלמוד ולזוהר, לתרגום השבעים, לוולגטה ולפשיטתא. תרגום ממוכן – כדאי לבדוק מול המקור.'));
    }

    /* the researcher */
    const askBox = el('textarea', { class: 'rs-q', rows: 3, placeholder: 'שאלה על הקטע, על פסוק או על מילה…', 'aria-label': 'השאלה לחוקר',
      onkeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } } });
    const talkBox = el('div', { class: 'rs-talk' });
    function suggestions() {
      const v = S.verses[S.sel];
      return [
        v ? 'מה אומרים הפרשנים והמחקר הביקורתי על הפסוק הזה?' : 'מה אומר המחקר הביקורתי על הקטע הזה – מקורות, עריכה ורקע?',
        'מה הרקע המזרח־קדמוני של הקטע? יש מקבילות בספרות של שכנות ישראל?',
        v ? 'האם יש חילופי נוסח בפסוק הזה (השבעים, קומראן, השומרוני)?' : 'איך נקרא הקטע בספרות בית שני ובברית החדשה?',
        S.word ? `מה משמעות המילה «${S.word.text}» כאן?` : 'אילו מילים קשות יש בקטע, ומה פירושן?',
      ];
    }
    function drawAsk() {
      const v = S.verses[S.sel];
      pane.replaceChildren(
        el('p', { class: 'rs-at' }, v ? `על ${root.querySelector('.rs-ref').textContent.split(' ')[0]} ${heNum(v.ch)}, ${heNum(v.v)}` : 'על הקטע כולו', v ? el('button', { class: 'rs-link', onclick: () => { S.sel = -1; S.word = null; mark(); drawAsk(); } }, ' · לקטע כולו') : ''),
        talkBox,
        el('div', { class: 'rs-sugg' }, suggestions().map((s) => el('button', { class: 'rs-chip', onclick: () => { askBox.value = s; send(); } }, s))),
        el('div', { class: 'rs-askrow' }, askBox, el('button', { class: 'btn primary', onclick: () => send() }, 'שאלה')),
        el('p', { class: 'rs-fine' }, 'החוקר שולף את הטקסטים מספריא ובודק מחקר וסימוכין (DOI) ברשת, ומצטט בסגנון SBL. תשובה לוקחת עד דקה או שתיים. בכל זאת כדאי לבדוק את המקורות.'));
    }
    let busy = false;
    async function send(fresh) {
      const q = askBox.value.trim();
      if (!q || busy) return;
      busy = true;
      const v = S.verses[S.sel];
      const focus = S.word ? `${v.ref}, the word ${S.word.text}` : v ? v.ref : null;
      const steps = el('ol', { class: 'rs-steps', 'aria-live': 'polite' }, el('li', {}, 'מתחיל לבדוק…'));
      const card = el('article', { class: 'rs-a card' }, el('p', { class: 'rs-a-q' }, q), el('p', { class: 'muted rs-loading' }, spin(), 'החוקר בודק במקורות – כאן רואים מה הוא קורא:'), steps);
      talkBox.append(card);
      askBox.value = '';
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      try {
        const a = await askStream({ ref: S.ref, focus, question: q, history: S.talk.slice(-4), fresh: !!fresh, stream: true }, (t) => {
          steps.append(el('li', {}, t));
          if (steps.children.length > 8) steps.firstElementChild.remove();
        });
        S.talk.push({ q, a: a.answer });
        drawAnswer(card, q, a, focus);
      } catch (e) {
        card.querySelector('.rs-loading').textContent = e?.message === 'refused' ? 'החוקר לא יכול לענות על השאלה הזו.' : 'לא הצלחתי לקבל תשובה כרגע. נסו שוב בעוד רגע.';
      } finally { busy = false; }
    }
    /** the researcher's answer as a stream of events: "step" while it works, then "answer" (or "error") */
    async function askStream(payload, onStep) {
      const r = await fetch('/api/research/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.status === 401) { location.href = '/?next=' + encodeURIComponent(location.pathname + location.search); throw new Error('login'); }
      if (!r.ok || !r.body) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'ai_failed'); }
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let cut;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, cut); buf = buf.slice(cut + 2);
          const ev = /^event: (.+)$/m.exec(chunk)?.[1], data = /^data: (.+)$/m.exec(chunk)?.[1];
          if (!ev || !data) continue;
          const d = JSON.parse(data);
          if (ev === 'step') onStep(d.text);
          if (ev === 'answer') return d;
          if (ev === 'error') throw new Error(d.error);
        }
      }
      throw new Error('ai_failed');
    }
    /** a source that is a verse of this passage (a Sefaria link like …/Genesis.25.8) → its index in the verses */
    function verseOf(url) {
      const m = /sefaria\.org(?:\.il)?\/([A-Za-z_ ]+?)\.(\d+)\.(\d+)(?![.\d])/.exec(decodeURIComponent(url || ''));
      if (!m) return -1;
      const ref = `${m[1].replace(/_/g, ' ')} ${m[2]}:${m[3]}`;
      return S.verses.findIndex((v) => v.ref === ref);
    }
    function cite(text, sources) {
      // "[1]" → a link to source 1; paragraphs on blank lines
      const byN = new Map(sources.map((s, i) => [s.n || i + 1, s]));
      return text.split(/\n\s*\n/).map((para) => el('p', { lang: 'he' }, para.split(/(\[\d+(?:[,–-]\s*\d+)*\])/).map((part) => {
        const m = /^\[(.+)\]$/.exec(part);
        if (!m) return part;
        return el('sup', { class: 'rs-cite' }, m[1].split(/[,–-]\s*/).map((n, k) => {
          const s = byN.get(+n);
          const vi = verseOf(s?.url);
          if (vi >= 0) return [k ? ',' : '', el('a', { href: s.url, class: 'verse', title: s.sbl + ' – הקישו כדי לראות את הפסוק', onclick: (e) => { e.preventDefault(); flash(vi); } }, n)];
          return [k ? ',' : '', s?.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener', title: s.sbl }, n) : n];
        }).flat());
      })));
    }
    function drawAnswer(card, q, a, focus) {
      const srcList = el('ol', { class: 'rs-sources', dir: 'ltr' }, a.sources.map((s) => el('li', { value: s.n || undefined, dir: 'auto' },
        s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.sbl || s.url) : s.sbl,
        verseOf(s.url) >= 0 ? el('button', { class: 'rs-tov', onclick: () => flash(verseOf(s.url)) }, ' ⟵ בטקסט') : '', s.kind ? el('small', {}, ' · ' + ({ primary: 'מקור', commentary: 'פרשנות', scholarship: 'מחקר' }[s.kind] || s.kind)) : '')));
      card.replaceChildren(
        el('p', { class: 'rs-a-q' }, q),
        a.title ? el('h3', {}, a.title) : '',
        el('div', { class: 'rs-a-body' }, cite(a.answer, a.sources)),
        a.terms.length ? el('div', { class: 'rs-terms' }, a.terms.map((t) => el('span', { class: 'rs-term' }, el('b', { dir: 'auto' }, t.word), t.translit ? el('i', { dir: 'ltr' }, ' ' + t.translit) : '', t.gloss ? ' – ' + t.gloss : '', t.lang ? el('small', {}, ' (' + t.lang + ')') : ''))) : '',
        a.sources.length ? el('details', { class: 'rs-src-list', open: true }, el('summary', {}, `מקורות (${a.sources.length})`), srcList) : el('p', { class: 'muted' }, 'לא צוינו מקורות.'),
        el('div', { class: 'rs-a-acts' },
          el('button', { class: 'btn', onclick: (e) => saveNote(e.currentTarget, q, a, focus) }, '📝 שמירה כפתק'),
          el('button', { class: 'btn ghost', onclick: () => { askBox.value = q; card.remove(); S.talk = S.talk.filter((t) => t.q !== q); send(true); } }, '↻ תשובה חדשה'),
          el('small', { class: 'muted' }, a.cached ? 'מהזיכרון' : a.by === 'gemini' ? 'Gemini' : '')),
        a.followups.length ? el('div', { class: 'rs-sugg' }, a.followups.map((f) => el('button', { class: 'rs-chip', onclick: () => { askBox.value = f; send(); } }, f))) : '');
    }
    async function saveNote(btn, q, a, focus) {
      btn.disabled = true;
      const lines = [q, '', a.title, '', a.answer, '', ...a.terms.map((t) => `${t.word} (${t.lang}${t.translit ? ', ' + t.translit : ''}) – ${t.gloss}`), '', 'מקורות:', ...a.sources.map((s, i) => `[${s.n || i + 1}] ${s.sbl}${s.url ? ' ' + s.url : ''}`)];
      try {
        await H.api('/api/notes', { body: { title: a.title || q.slice(0, 80), body: lines.join('\n').replace(/\n{3,}/g, '\n\n'), source: { url: location.href, title: 'עיון: ' + (label || ref) + (focus ? ' · ' + focus : '') } } });
        toast('נשמר בפתקים', 'לפתקים', () => { location.href = '/tools/notes/'; });
        btn.textContent = '✓ נשמר';
      } catch (_) { btn.disabled = false; toast('השמירה לא הצליחה'); }
    }

    S.tab = 'links';
  }

  H.study = study;
})();
