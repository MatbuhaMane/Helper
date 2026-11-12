"""Builds the textual witnesses (עדי נוסח) of חדר העיון into public/witnesses/, from free sources kept in data/witnesses/sources/.

  id        witness                                   source                                                   licence
  sp        Samaritan Pentateuch (Hebrew, consonants)  github.com/DT-UCPH/sp (Text-Fabric 7.4.0; MS Dublin CBL 751)   CC BY-NC 4.0
  dss       Dead Sea Scrolls, biblical scrolls        github.com/ETCBC/dss (Text-Fabric 2.0.5; Abegg's data)        CC BY-NC 4.0
  lxx       Septuagint (Greek)                        ebible.org grcbrent – the Greek text of Brenton's edition      public domain
  lxx_en    Septuagint in English (Brenton, 1844)     ebible.org eng-Brenton                                       public domain
  vulgate   Vulgate (Latin, Clementine 1598)          ebible.org latVUC                                            public domain
  peshitta  Peshitta (Syriac)                         github.com/ETCBC/peshitta (Text-Fabric 0.2)                    MIT (see the repository)

Output: public/witnesses/index.json (what there is, with the credit line of each), and public/witnesses/<id>/<osis>.json:
  { "chapter": { "verse": "text" } }   (dss: { "chapter": { "verse": [["scroll", "text"], ...] } })
Verses are numbered as each edition numbers them; where an edition numbers differently from the Masoretic text
(the Septuagint's Psalms or Jeremiah, for example) the verse shown may not be the parallel one.

Run:  python tools/build-witnesses.py        (downloads what is missing, then builds)
"""
import io, json, os, re, sys, zipfile, collections, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'witnesses', 'sources')
OUT = os.path.join(ROOT, 'public', 'witnesses')

OSIS = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', '1Sam', '2Sam', '1Kgs', '2Kgs', 'Isa', 'Jer', 'Ezek', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah',
        'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Ps', 'Prov', 'Job', 'Song', 'Ruth', 'Lam', 'Eccl', 'Esth', 'Dan', 'Ezra', 'Neh', '1Chr', '2Chr']
# the book codes each source uses → OSIS
USFM = dict(zip(['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', '1SA', '2SA', '1KI', '2KI', 'ISA', 'JER', 'EZK', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM',
                 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'PSA', 'PRO', 'JOB', 'SNG', 'RUT', 'LAM', 'ECC', 'EST', 'DAN', 'EZR', 'NEH', '1CH', '2CH'], OSIS))
ETCBC = dict(zip(['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', '1_Samuel', '2_Samuel', '1_Kings', '2_Kings', 'Isaiah', 'Jeremiah', 'Ezekiel',
                  'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Psalms', 'Proverbs', 'Job',
                  'Song_of_songs', 'Ruth', 'Lamentations', 'Ecclesiastes', 'Esther', 'Daniel', 'Ezra', 'Nehemiah', '1_Chronicles', '2_Chronicles'], OSIS))
DSS_ALIASES = {'Is': 'Isa', 'Ex': 'Exod'}
USFM.update({'EZE': 'Ezek', 'JOE': 'Joel', 'NAH': 'Nah', 'SOL': 'Song', 'ESG': 'Esth', 'DNG': 'Dan'})   # eBible's other spellings
PESHITTA = dict(zip(['Gn', 'Ex', 'Lv', 'Nm', 'Dt', 'Jos', 'Jd', 'Sm1', 'Sm2', 'Rg1', 'Rg2', 'Is', 'Jr', 'Ez', 'Hs', 'Jl', 'Am', 'Ob', 'Jon', 'Mi', 'Na', 'Hb', 'Zf', 'Hg', 'Sa', 'Ml',
                     'Ps', 'Pr', 'Jb', 'Ct', 'Ru', 'Thr', 'Ec', 'Est', 'Dn', 'Ezr', 'Neh', 'Chr1', 'Chr2'], OSIS))
DSS_BOOKS = dict(zip(['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', '1Sam', '2Sam', '1Kgs', '2Kgs', 'Isa', 'Jer', 'Ezek', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah',
                      'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Ps', 'Prov', 'Job', 'Song', 'Ruth', 'Lam', 'Eccl', 'Esth', 'Dan', 'Ezra', 'Neh', '1Chr', '2Chr'], OSIS))

TF = {
    'sp': ('https://raw.githubusercontent.com/DT-UCPH/sp/main/tf/7.4.0/', ['otype', 'oslots', 'book', 'chapter', 'verse', 'g_cons_utf8', 'trailer']),
    'dss': ('https://raw.githubusercontent.com/ETCBC/dss/master/tf/2.0.5/', ['otype', 'oslots', 'scroll', 'book', 'chapter', 'verse', 'biblical', 'full', 'after']),
    'peshitta': ('https://raw.githubusercontent.com/ETCBC/peshitta/master/tf/0.2/', ['otype', 'oslots', 'book', 'chapter', 'verse', 'word', 'trailer']),
}
EBIBLE = {'lxx': 'grcbrent_vpl.zip', 'lxx_en': 'eng-Brenton_vpl.zip', 'vulgate': 'latVUC_vpl.zip'}

def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print('download', url, file=sys.stderr)
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'user-agent': 'HelperFamilyApp/1.0'}), timeout=600).read()
    open(path, 'wb').write(data)

def tf_feature(path):
    """a Text-Fabric node feature: {node: value} (lines are values for consecutive nodes, or "n\tvalue", "a-b\tvalue", "a,b\tvalue")"""
    out, node, header = {}, 1, True
    for line in open(path, encoding='utf-8').read().split('\n'):
        if header:
            if line.startswith('@'): continue
            header = False
            if line == '': continue
        if line == '' and not out and node == 1: continue
        if '\t' in line:
            spec, val = line.split('\t', 1)
            nodes = []
            for part in spec.split(','):
                if '-' in part: a, b = part.split('-'); nodes += range(int(a), int(b) + 1)
                elif part: nodes.append(int(part))
            for n in nodes: out[n] = val
            node = (nodes[-1] if nodes else node) + 1
        else:
            out[node] = line
            node += 1
    return out

def tf_oslots(path):
    """{node: [slots]} for the non-slot nodes"""
    out, node, header = {}, None, True
    lines = open(path, encoding='utf-8').read().split('\n')
    for line in lines:
        if header:
            if line.startswith('@'): continue
            header = False
            if line == '': continue
        if not line: continue
        if '\t' in line:
            spec, val = line.split('\t', 1); node = int(spec)
        else:
            val = line; node = (node + 1) if node is not None else None
        slots = []
        for part in val.split(','):
            if '-' in part: a, b = part.split('-'); slots += range(int(a), int(b) + 1)
            elif part: slots.append(int(part))
        out[node] = slots
    return out

def tf_otype(path):
    """[(first, last, type)]"""
    spans, header = [], True
    for line in open(path, encoding='utf-8').read().split('\n'):
        if header:
            if line.startswith('@'): continue
            header = False
            if line == '': continue
        if not line: continue
        spec, typ = line.split('\t') if '\t' in line else (None, line)
        a, b = (spec.split('-') + [spec])[:2] if spec and '-' in spec else (spec, spec)
        spans.append((int(a), int(b), typ))
    return spans

def verses_from_tf(d, word_feature, trailer_feature, book_map):
    """{osis: {ch: {v: text}}} from the verse nodes of a Text-Fabric corpus (the book and the chapter of a verse are the nodes that contain it)"""
    import bisect
    otype = tf_otype(os.path.join(d, 'otype.tf'))
    span = {t: (a, b) for a, b, t in otype}
    oslots = tf_oslots(os.path.join(d, 'oslots.tf'))
    book, chapter, verse = (tf_feature(os.path.join(d, f + '.tf')) for f in ('book', 'chapter', 'verse'))
    word = tf_feature(os.path.join(d, word_feature + '.tf'))
    trailer = tf_feature(os.path.join(d, trailer_feature + '.tf')) if trailer_feature else {}
    def container(typ, feat):
        a, b = span[typ]
        rows = sorted((oslots[n][0], oslots[n][-1], feat.get(n, '')) for n in range(a, b + 1) if n in oslots)
        firsts = [r[0] for r in rows]
        def find(slot):
            i = bisect.bisect_right(firsts, slot) - 1
            return rows[i][2] if i >= 0 and rows[i][0] <= slot <= rows[i][1] else None
        return find
    book_of, chapter_of = container('book', book), container('chapter', chapter)
    out = collections.defaultdict(lambda: collections.defaultdict(dict))
    # the words of a verse: the slots themselves, or (where the slots are letters, as in the Samaritan Pentateuch) the word nodes on them
    slot_type = min(otype)[2]
    if slot_type != 'word' and 'word' in span:
        wa, wb = span['word']
        words = sorted((oslots[n][0], n) for n in range(wa, wb + 1) if n in oslots)
        wfirst = [w[0] for w in words]
        words_in = lambda a, b: [n for _, n in words[bisect.bisect_left(wfirst, a):bisect.bisect_right(wfirst, b)]]
    else:
        words_in = lambda a, b: list(range(a, b + 1))
    va, vb = span['verse']
    for n in range(va, vb + 1):
        if n not in oslots: continue
        first = oslots[n][0]
        osis = book_map.get(book_of(first) or '')
        ch, vs = chapter_of(first), verse.get(n)
        if not osis or not ch or not vs: continue
        text = ''.join(word.get(w, '') + trailer.get(w, '') for w in words_in(oslots[n][0], oslots[n][-1])).strip()
        out[osis][str(int(ch))][str(int(vs))] = re.sub(r'\s+', ' ', text)
    return out

def vpl(zip_path):
    """eBible's VPL: one verse a line, "GEN 1:1 text" → {osis: {ch: {v: text}}}"""
    z = zipfile.ZipFile(zip_path)
    name = next(n for n in z.namelist() if n.endswith('_vpl.txt'))
    out = collections.defaultdict(lambda: collections.defaultdict(dict))
    for line in z.read(name).decode('utf-8-sig').splitlines():
        m = re.match(r'^(\w{3}) (\d+):(\d+) (.*)$', line)
        if not m or m.group(1) not in USFM: continue
        out[USFM[m.group(1)]][str(int(m.group(2)))][str(int(m.group(3)))] = m.group(4).strip()
    return out

def write(wid, data):
    for osis, chapters in data.items():
        os.makedirs(os.path.join(OUT, wid), exist_ok=True)
        json.dump(chapters, open(os.path.join(OUT, wid, osis + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return sorted(data, key=OSIS.index)

def main():
    for wid, (base, feats) in TF.items():
        for f in feats: fetch(base + f + '.tf', os.path.join(SRC, wid, f + '.tf'))
    for wid, zname in EBIBLE.items(): fetch('https://ebible.org/Scriptures/' + zname, os.path.join(SRC, zname))
    index = []
    def add(wid, data, **meta):
        index.append({'id': wid, 'books': write(wid, data), **meta})
        print(wid, len(data), 'books', file=sys.stderr)

    # the Samaritan Pentateuch
    sp_books = {k: v for k, v in ETCBC.items() if v in OSIS[:5]}
    sp_books.update({v: v for v in OSIS[:5]})
    add('sp', verses_from_tf(os.path.join(SRC, 'sp'), 'g_cons_utf8', 'trailer', {**sp_books, **{k.lower(): v for k, v in sp_books.items()}}),
        name='התורה השומרונית', lang='he', script='hebrew', kind='hebrew',
        credit='Samaritan Pentateuch, Text-Fabric dataset (DT-UCPH/sp 7.4.0), based on MS Dublin, Chester Beatty Library 751. CC BY-NC 4.0.',
        url='https://github.com/DT-UCPH/sp')

    # the Dead Sea Scrolls: the biblical scrolls, verse by verse, each scroll on its own line
    d = os.path.join(SRC, 'dss')
    otype = tf_otype(os.path.join(d, 'otype.tf'))
    wspan = next((a, b) for a, b, t in otype if t == 'word')
    scroll_span = next((a, b) for a, b, t in otype if t == 'scroll')
    oslots = tf_oslots(os.path.join(d, 'oslots.tf'))
    feats = {f: tf_feature(os.path.join(d, f + '.tf')) for f in ('scroll', 'book', 'chapter', 'verse', 'biblical', 'full', 'after')}
    sign_word = {}
    for w in range(wspan[0], wspan[1] + 1):
        for s in oslots.get(w, []): sign_word.setdefault(s, w)
    dss = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(list)))
    for sc in range(scroll_span[0], scroll_span[1] + 1):
        name = feats['scroll'].get(sc, '')
        words = sorted({sign_word[s] for s in oslots.get(sc, []) if s in sign_word})
        cur = None
        for w in words:
            bk, ch, vs = feats['book'].get(w), feats['chapter'].get(w), feats['verse'].get(w)
            osis = DSS_BOOKS.get(DSS_ALIASES.get(bk, bk) or '')
            if not osis or not ch or not vs or not feats['biblical'].get(w): continue
            key = (osis, ch, vs)
            txt = feats['full'].get(w, '') + feats['after'].get(w, '')
            if cur and cur[0] == key: cur[1].append(txt)
            else:
                if cur: dss[cur[0][0]][cur[0][1]][cur[0][2]].append([name, ''.join(cur[1]).strip()])
                cur = (key, [txt])
        if cur: dss[cur[0][0]][cur[0][1]][cur[0][2]].append([name, ''.join(cur[1]).strip()])
    # tidy Abegg's signs for reading: damaged letters (#) and suffix marks (׳) go, letters written above the line (^ ^) join the word; reconstructions stay in [brackets]
    for bk in dss.values():
        for chv in bk.values():
            for v, lst in chv.items():
                chv[v] = [[n, re.sub(r'\s+', ' ', re.sub(r'\(\^\s*(.*?)\s*\^\)', lambda m: m.group(1), re.sub(r'\{\{[^}]*\}\}|[#׳ε]', '', t))).replace('[ ', '[').replace(' ]', ']').strip()] for n, t in lst]
    add('dss', dss, name='מגילות קומראן', lang='he', script='hebrew', kind='dss',
        credit="Dead Sea Scrolls, biblical scrolls: ETCBC/dss Text-Fabric 2.0.5, based on Martin Abegg's transcriptions. CC BY-NC 4.0.", url='https://github.com/ETCBC/dss')

    add('lxx', vpl(os.path.join(SRC, EBIBLE['lxx'])), name='תרגום השבעים', lang='grc', script='greek', kind='translation',
        credit="The Greek Septuagint, from the edition of Sir Lancelot C. L. Brenton (London, 1851), eBible.org. Public domain.", url='https://ebible.org/details.php?id=grcbrent')
    add('lxx_en', vpl(os.path.join(SRC, EBIBLE['lxx_en'])), name='השבעים באנגלית (ברנטון)', lang='en', script='latin', kind='aid',
        credit="The Septuagint in English, translated by Sir Lancelot C. L. Brenton (1844), eBible.org. Public domain.", url='https://ebible.org/details.php?id=eng-Brenton')
    add('vulgate', vpl(os.path.join(SRC, EBIBLE['vulgate'])), name='הוולגטה', lang='la', script='latin', kind='translation',
        credit='Biblia Sacra Vulgata, Clementine edition (1598), eBible.org. Public domain.', url='https://ebible.org/details.php?id=latVUC')
    add('peshitta', verses_from_tf(os.path.join(SRC, 'peshitta'), 'word', 'trailer', PESHITTA),
        name='הפשיטתא', lang='syc', script='syriac', kind='translation',
        credit='The Old Testament Peshitta, ETCBC/peshitta Text-Fabric 0.2 (Peshitta Institute, Leiden). MIT licence for the dataset; see the repository.', url='https://github.com/ETCBC/peshitta')

    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
