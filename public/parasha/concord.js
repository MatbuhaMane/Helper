/* The Hebrew Bible concordance: every occurrence of a word – in all its forms, with or without the prefixes ו, ה, ב, כ, ל, מ, ש –
   from our own index of the Open Scriptures Hebrew Bible (the Leningrad Codex, with a lemma for every word; built by
   tools/build-concordance.py into /concordance/). The files are static and fetched only when needed.
   H.concord.lookup(word)              → { word, bare, lemmas: [{ key, head, translit, gloss, n, verses, share }] } (most likely first)
   H.concord.occurrences(keys, part)   → [[book, chapter, verse, word], …] in the order of the Tanakh
   H.concord.verse(book, ch, v)        → the words of that verse (await H.concord.loadBooks([book]) first)
   H.concord.books                     → [[osis, sefaria, hebrew, chapters], …] */
(() => {
  const BASE = '/concordance/';
  const cache = new Map();
  const get = (path) => {
    if (!cache.has(path)) cache.set(path, fetch(BASE + path).then((r) => { if (!r.ok) throw new Error(path); return r.json(); }).catch((e) => { cache.delete(path); throw e; }));
    return cache.get(path);
  };
  const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  /** letters only, final letters as ordinary ones – the way the index keeps every form */
  const bare = (s) => String(s || '').normalize('NFD').replace(/[֑-ׇ]/g, '').replace(/[^א-ת]/g, '').replace(/[ךםןףץ]/g, (c) => FINALS[c]);
  const PREFIXES = ['וכש', 'ומה', 'ושה', 'וה', 'וב', 'ול', 'ומ', 'וכ', 'וש', 'שה', 'שב', 'של', 'שמ', 'מה', 'כש', 'לכ', 'ו', 'ה', 'ב', 'כ', 'ל', 'מ', 'ש'];
  const PARTS = { 'Tanakh/': [0, 38], 'Tanakh/Torah': [0, 4], 'Tanakh/Prophets': [5, 25], 'Tanakh/Writings': [26, 38] };
  const texts = new Map();
  const api = { books: [], bare, PARTS };

  api.ready = (async () => { api.books = await get('books.json'); })();

  api.lookup = async (word) => {
    const [forms, lex] = await Promise.all([get('forms.json'), get('lex.json')]);
    const b = bare(word);
    const found = new Map();
    const add = (m, weight) => { for (const [k, n] of Object.entries(m || {})) found.set(k, (found.get(k) || 0) + n * weight); };
    add(forms[b], 2);
    if (!found.size) for (const p of PREFIXES) if (b.startsWith(p) && b.length - p.length >= 2) add(forms[b.slice(p.length)], 1);
    const total = [...found.values()].reduce((a, n) => a + n, 0) || 1;
    const lemmas = [...found].map(([key, n]) => {
      const [head, translit, gloss, occ, verses] = lex[key] || [key, '', '', 0, 0];
      return { key, head: head.replace(/[͏‌‍]/g, ''), translit, gloss, n: occ, verses, share: n / total };
    }).sort((a, z) => z.share - a.share);
    return { word, bare: b, lemmas };
  };

  api.occurrences = async (keys, part = 'Tanakh/') => {
    const shards = [...new Set(keys.map((k) => Math.floor(parseInt(k, 10) / 100)))];
    const data = await Promise.all(shards.map((n) => get(`occ/${n}.json`)));
    const [lo, hi] = PARTS[part] || PARTS['Tanakh/'];
    const all = keys.flatMap((k) => data.flatMap((d) => d[k] || [])).filter((o) => o[0] >= lo && o[0] <= hi);
    return all.sort((a, z) => a[0] - z[0] || a[1] - z[1] || a[2] - z[2] || a[3] - z[3]);
  };

  api.loadBooks = async (idxs) => {
    await api.ready;
    await Promise.all([...new Set(idxs)].map(async (i) => { if (!texts.has(i)) texts.set(i, await get(`text/${api.books[i][0]}.json`)); }));
  };
  api.verse = (bi, c, v) => texts.get(bi)?.[String(c)]?.[v - 1] || [];

  H.concord = api;
})();
