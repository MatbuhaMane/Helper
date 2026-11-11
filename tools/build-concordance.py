"""Builds the Hebrew Bible concordance of פרשת השבוע (public/concordance/) from the Open Scriptures Hebrew Bible.

Sources (kept in data/witnesses/sources/, downloaded once):
  morphhb.zip                    https://github.com/openscriptures/morphhb  – the Westminster Leningrad Codex (public domain)
                                 with a lemma (Strong's number) and morphology for every word (CC BY 4.0, credit the OSHB)
  strongs-hebrew-dictionary.js   https://github.com/openscriptures/strongs  – Strong's dictionary, 1894 (JSON: CC BY-SA)

Output (static files the browser fetches only when it needs them):
  books.json        [[osis, sefaria name, hebrew name, chapters], ...] in the order of the Tanakh
  lex.json          { lemma: [headword, transliteration, short English gloss, occurrences, verses] }
  forms.json        { bare form: { lemma: count } }  – the word without vowels, with and without its prefixes
  occ/<n>.json      { lemma: [[book, chapter, verse, word], ...] }  – every occurrence; n = Strong's number // 100
  text/<osis>.json  { chapter: [[word, ...] per verse] }  – vocalised, no cantillation, for the lines of the concordance

Run:  python tools/build-concordance.py
"""
import json, os, re, sys, zipfile, collections
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'witnesses', 'sources')
OUT = os.path.join(ROOT, 'public', 'concordance')

BOOKS = [  # osis, Sefaria, Hebrew – in the order of the Tanakh
    ('Gen', 'Genesis', 'בראשית'), ('Exod', 'Exodus', 'שמות'), ('Lev', 'Leviticus', 'ויקרא'), ('Num', 'Numbers', 'במדבר'), ('Deut', 'Deuteronomy', 'דברים'),
    ('Josh', 'Joshua', 'יהושע'), ('Judg', 'Judges', 'שופטים'), ('1Sam', 'I Samuel', 'שמואל א'), ('2Sam', 'II Samuel', 'שמואל ב'), ('1Kgs', 'I Kings', 'מלכים א'),
    ('2Kgs', 'II Kings', 'מלכים ב'), ('Isa', 'Isaiah', 'ישעיהו'), ('Jer', 'Jeremiah', 'ירמיהו'), ('Ezek', 'Ezekiel', 'יחזקאל'), ('Hos', 'Hosea', 'הושע'),
    ('Joel', 'Joel', 'יואל'), ('Amos', 'Amos', 'עמוס'), ('Obad', 'Obadiah', 'עובדיה'), ('Jonah', 'Jonah', 'יונה'), ('Mic', 'Micah', 'מיכה'), ('Nah', 'Nahum', 'נחום'),
    ('Hab', 'Habakkuk', 'חבקוק'), ('Zeph', 'Zephaniah', 'צפניה'), ('Hag', 'Haggai', 'חגי'), ('Zech', 'Zechariah', 'זכריה'), ('Mal', 'Malachi', 'מלאכי'),
    ('Ps', 'Psalms', 'תהילים'), ('Prov', 'Proverbs', 'משלי'), ('Job', 'Job', 'איוב'), ('Song', 'Song of Songs', 'שיר השירים'), ('Ruth', 'Ruth', 'רות'),
    ('Lam', 'Lamentations', 'איכה'), ('Eccl', 'Ecclesiastes', 'קהלת'), ('Esth', 'Esther', 'אסתר'), ('Dan', 'Daniel', 'דניאל'), ('Ezra', 'Ezra', 'עזרא'),
    ('Neh', 'Nehemiah', 'נחמיה'), ('1Chr', 'I Chronicles', 'דברי הימים א'), ('2Chr', 'II Chronicles', 'דברי הימים ב'),
]
NS = '{http://www.bibletechnologies.net/2003/OSIS/namespace}'
TEAMIM = re.compile('[֑-ֽ֯׀׃-׆]')   # cantillation, meteg, paseq, sof pasuq…
VOWELS = re.compile('[֑-ׇ]')                               # every mark: what is left is the letters
FINALS = str.maketrans('ךםןףץ', 'כמנפצ')

def bare(s):
    """the letters only, final forms as ordinary letters (so a form with a suffix and without one compare)"""
    return VOWELS.sub('', s).replace('/', '').replace('־', '').strip().translate(FINALS)

def lemma_key(lemma):
    """'c/7218 a' → '7218a' (the content word; prefixes are letters before the slash)"""
    main = [p for p in lemma.split('/') if re.match(r'^\d', p.strip())]
    return main[-1].replace(' ', '') if main else None

def main():
    z = zipfile.ZipFile(os.path.join(SRC, 'morphhb.zip'))
    strongs_js = open(os.path.join(SRC, 'strongs-hebrew-dictionary.js'), encoding='utf-8').read()
    strongs = json.loads(strongs_js[strongs_js.index('{'):strongs_js.rindex('}') + 1])
    os.makedirs(os.path.join(OUT, 'occ'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'text'), exist_ok=True)

    occ = collections.defaultdict(list)
    forms = collections.defaultdict(collections.Counter)
    verses_of = collections.defaultdict(set)
    first_form = collections.defaultdict(collections.Counter)
    books_out = []
    for bi, (osis, sef, he) in enumerate(BOOKS):
        root = ET.fromstring(z.read(f'morphhb-master/wlc/{osis}.xml'))
        text = {}
        for ch in root.iter(NS + 'chapter'):
            c = int(ch.get('osisID').split('.')[1])
            rows = []
            for v in ch.iter(NS + 'verse'):
                vn = int(v.get('osisID').split('.')[2])
                while len(rows) < vn - 1: rows.append([])
                words = []
                for el in v:
                    tag = el.tag.replace(NS, '')
                    if tag == 'w':
                        surface = (el.text or '')
                        words.append(TEAMIM.sub('', surface).replace('/', ''))
                        key = lemma_key(el.get('lemma', ''))
                        if not key: continue
                        wi = len(words) - 1
                        occ[key].append([bi, c, vn, wi])
                        verses_of[key].add((bi, c, vn))
                        parts = surface.split('/')
                        full = bare(surface)
                        forms[full][key] += 1
                        # the word without its prefixes (ו, ה, ב, כ, ל, מ, ש): the segments from the content word on
                        lem_parts = el.get('lemma', '').split('/')
                        idx = next((i for i, p in enumerate(lem_parts) if re.match(r'^\d', p.strip())), 0)
                        stem = bare('/'.join(parts[idx:])) if idx < len(parts) else full
                        if stem and stem != full: forms[stem][key] += 1
                        core = bare(parts[idx]) if idx < len(parts) else full
                        if core: first_form[key][core] += 1
                    elif tag == 'seg' and el.get('type') == 'x-maqqef' and words:
                        words[-1] += '־'
                rows.append(words)
            text[str(c)] = rows
        json.dump(text, open(os.path.join(OUT, 'text', f'{osis}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        books_out.append([osis, sef, he, len(text)])
        print(osis, len(text), file=sys.stderr)

    lex = {}
    for key, lst in occ.items():
        num = re.match(r'\d+', key).group(0)
        s = strongs.get('H' + num, {})
        head = s.get('lemma') or (first_form[key].most_common(1)[0][0] if first_form[key] else '')
        gloss = (s.get('kjv_def') or s.get('strongs_def') or '').strip().rstrip('.')
        lex[key] = [head, s.get('xlit', ''), gloss[:80], len(lst), len(verses_of[key])]
    shards = collections.defaultdict(dict)
    for key, lst in occ.items():
        shards[int(re.match(r'\d+', key).group(0)) // 100][key] = lst
    for n, d in shards.items():
        json.dump(d, open(os.path.join(OUT, 'occ', f'{n}.json'), 'w', encoding='utf-8'), separators=(',', ':'))
    json.dump(books_out, open(os.path.join(OUT, 'books.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(lex, open(os.path.join(OUT, 'lex.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump({f: dict(c) for f, c in forms.items()}, open(os.path.join(OUT, 'forms.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'source': 'Open Scriptures Hebrew Bible (WLC 4.20, public domain; lemmas and morphology CC BY 4.0)', 'lexicon': "Strong's Hebrew Dictionary (1894), JSON by Open Scriptures (CC BY-SA)",
               'words': sum(len(v) for v in occ.values()), 'lemmas': len(lex), 'forms': len(forms)},
              open(os.path.join(OUT, 'about.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('words', sum(len(v) for v in occ.values()), 'lemmas', len(lex), 'forms', len(forms), file=sys.stderr)

if __name__ == '__main__':
    main()
