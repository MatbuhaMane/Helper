"""Fetch the Shabbat zemirot (public-domain piyutim; Hebrew text of the Metsudah Siddur, 1981, CC-BY via Sefaria)
into public/songbook/zemirot.json. Run once: python3 tools/fetch_zemirot.py"""
import json, re, urllib.parse, urllib.request

BASE = 'Siddur Ashkenaz, Shabbat, '
ITEMS = [  # (section, sefaria path, Hebrew title)
    ('kabbalat', 'Kabbalat Shabbat, Yedid Nefesh', 'ידיד נפש'),
    ('kabbalat', 'Kabbalat Shabbat, Lekha Dodi', 'לכה דודי'),
    ('evening', 'Shabbat Evening, Shalom Aleichem', 'שלום עליכם'),
    ('evening', 'Shabbat Evening, Eshet Chayil', 'אשת חיל'),
    ('evening', 'Shabbat Evening, Zemirot for Shabbat Evening, Kol Mekadesh', 'כל מקדש'),
    ('evening', 'Shabbat Evening, Zemirot for Shabbat Evening, Menucha VeSimcha', 'מנוחה ושמחה'),
    ('evening', 'Shabbat Evening, Zemirot for Shabbat Evening, Ma Yedidut', 'מה ידידות'),
    ('evening', "Shabbat Evening, Zemirot for Shabbat Evening, Yom zeh L'yisrael", 'יום זה לישראל'),
    ('evening', 'Shabbat Evening, Zemirot for Shabbat Evening, Yah Ribon', 'יה ריבון'),
    ('evening', 'Shabbat Evening, Zemirot for Shabbat Evening, Tzamah Nafshi', 'צמאה נפשי'),
    ('evening', 'Shabbat Evening, Zemirot for Shabbat Evening, Tzur Mishelo', 'צור משלו'),
    ('day', 'Daytime Meal, Zemirot for Second Meal, Baruch Kel Elyon', 'ברוך אל עליון'),
    ('day', 'Daytime Meal, Zemirot for Second Meal, Yom Zeh Mechubad', 'יום זה מכובד'),
    ('day', 'Daytime Meal, Zemirot for Second Meal, Yom Shabbaton', 'יום שבתון'),
    ('day', 'Daytime Meal, Zemirot for Second Meal, Shimru Shabtotai', 'שמרו שבתותי'),
    ('day', 'Daytime Meal, Zemirot for Second Meal, Ki Eshmera', 'כי אשמרה'),
    ('day', 'Daytime Meal, Zemirot for Second Meal, Dror Yikrah', 'דרור יקרא'),
    ('third', 'Third Meal, Mizmor LeDavid', 'מזמור לדוד'),
    ('third', 'Third Meal, Yedid Nefesh', 'ידיד נפש'),
]

def flat(t):
    if isinstance(t, str): return [t]
    out = []
    for x in t: out += flat(x)
    return out

def clean(line):
    refrain = '<small>' in line
    line = re.sub(r'<[^>]+>', '', line).replace(' ', ' ').strip()
    return {'t': line, 'r': True} if refrain else {'t': line}

songs = []
for section, path, he in ITEMS:
    ref = BASE + path
    url = 'https://www.sefaria.org/api/v3/texts/' + urllib.parse.quote(ref.replace(' ', '_')) + '?version=hebrew'
    d = json.load(urllib.request.urlopen(url, timeout=30))
    v = d['versions'][0]
    lines = [clean(l) for l in flat(v['text']) if l and l.strip()]
    lines = [l for l in lines if l['t']]
    songs.append({'id': re.sub(r'[^a-z0-9]+', '-', path.split(', ')[-1].lower()).strip('-') + ('-3' if section == 'third' and 'Yedid' in path else ''),
                  'section': section, 'title': he, 'lines': lines, 'ref': d.get('heRef'),
                  'source': f"https://www.sefaria.org/{urllib.parse.quote(ref.replace(' ', '_'))}",
                  'version': v.get('versionTitle'), 'license': v.get('license')})
    print(section, he, len(lines), 'lines', v.get('license'))

out = {
    'sections': {'kabbalat': 'קבלת שבת', 'evening': 'ליל שבת', 'day': 'סעודת היום', 'third': 'סעודה שלישית'},
    'credit': 'הנוסח: סידור מצודה (1981), באדיבות ספריא, ברישיון CC-BY',
    'songs': songs,
}
json.dump(out, open('public/songbook/zemirot.json', 'w'), ensure_ascii=False, indent=1)
