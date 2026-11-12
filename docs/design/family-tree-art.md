# הציורים לעץ המשפחה וליער – הנחיות לייצור

הציורים צריכים להיראות כמו האוהל והכריות בדף הבית: איור בסגנון קומיקס, קו דיו כהה ואחיד, צבעי אדמה חמים,
טקסטורה מצוירת ובלי צללים ריאליסטיים. העץ בנוי מחלקים שנערמים זה על זה, כדי שיתאים לכל מספר דורות.

## איך מייצרים

1. בכל הנחיה מצרפים את `public/assets/tent.webp` כתמונת סגנון (ואם אפשר גם כרית, למשל `public/assets/pillows/p13.webp`).
2. מעתיקים את ההנחיה באנגלית כמו שהיא. רוב המחוללים מבינים אנגלית טוב יותר.
3. **רקע לבן נקי ושטוח.** בלי משבצות של "שקיפות" ובלי צל על הרקע. את הרקע אני חותך בעצמי.
4. מייצרים בגודל הגדול ביותר שהכלי נותן, ושומרים כ־PNG בתיקייה הזו (אין צורך להעלות אותה ל־git, היא מוחרגת):
   `M:\Claude Code\Helper-design\data\art\family\` בשמות שבטבלה.
5. אם יצאו כמה גרסאות טובות, אפשר לשמור את כולן (`-2`, `-3`) ואבחר ביחד איתך.

| קובץ | מה | יחס |
|---|---|---|
| `tree-roots.png` | בסיס העץ: שורשים, אדמה ודשא, תחילת הגזע | 3:4 |
| `tree-bough-a.png` | קטע גזע עם שני ענפים גדולים לצדדים (לדור אחד) | 3:4 |
| `tree-bough-b.png` | אותו דבר בצורה אחרת, כדי שהדורות לא ייראו זהים | 3:4 |
| `tree-crown.png` | צמרת העץ מלמעלה, הגזע נכנס מלמטה | 4:3 |
| `tag.png` | שלט עץ ריק שתלוי על חבל (עליו יופיע השם) | 4:3 |
| `forest-olive.png`, `forest-oak.png`, `forest-carob.png`, `forest-fig.png`, `forest-terebinth.png` | עצים בודדים ליער, כל אחד מין אחר | 3:4 |
| `forest-ground.png` | רצועת קרקע רחבה ליער: גבעות נמוכות ושביל | 21:9 (או 16:9) |

## הסגנון המשותף (נכנס לכל הנחיה)

```
Style: hand-drawn cartoon illustration exactly like the attached reference (the Bedouin tent): bold, even, dark brown-black
ink outlines, flat warm earthy colours with painted texture, soft hand-drawn shading, no realistic lighting, no gradients
in the background. Plain flat pure white background (#ffffff), nothing else on it, no shadow on the background, no text,
no letters, no people, no animals, no frame.
```

## ההנחיות

### tree-roots.png
```
The base of one big old olive-oak tree, seen from the front: a thick gnarled trunk rising straight up and leaving the
picture through the exact centre of the TOP edge (the trunk is cut flat by the top edge, about one fifth of the picture
wide), wide roots spreading over a small round mound of earth with tufts of grass, a few stones and a small flowering
plant. The mound sits in the lower third, centred. Portrait 3:4. [Style]
```

### tree-bough-a.png
```
A section of the same tree trunk, seen from the front: the trunk enters through the exact centre of the BOTTOM edge and
leaves through the exact centre of the TOP edge, cut flat by both edges, the same width at both (about one fifth of the
picture wide). From the middle of the trunk two big branches grow out, one to the left and one to the right, almost
horizontal and slightly rising, reaching close to the side edges, each with a few small twigs and clusters of olive-green
leaves. Under each branch, near its outer end, there is a clear empty space (where a sign will hang). Portrait 3:4. [Style]
```

### tree-bough-b.png
```
Same as before, but the two branches leave the trunk at slightly different heights (the left one a little higher), are
more curved, with knots in the bark and different leaf clusters. The trunk still enters at the exact centre of the bottom
edge and leaves at the exact centre of the top edge, same width at both. Portrait 3:4. [Style]
```

### tree-crown.png
```
The top of the same tree: a broad, rounded, lush crown of olive-green leaves with a few small branches showing, a couple
of tiny birds' nests or blossoms as details; the trunk enters through the exact centre of the BOTTOM edge, cut flat by
it, about one seventh of the picture wide. Landscape 4:3. [Style]
```

### tag.png
```
A single blank wooden sign hanging from a short loop of rope: a rounded rectangular plank of light warm wood with a thin
darker rim and visible grain, the rope tied at the top centre. The plank face is completely blank (text will be added
later). Centred, filling most of the picture. Landscape 4:3. [Style]
```

### forest-*.png (חמישה עצים, אחד בכל פעם)
```
One whole free-standing {TREE} tree, seen from the front, with its trunk, its full crown and a small patch of ground with
grass at its foot, centred, filling most of the picture height. Portrait 3:4. [Style]
```
להחליף את `{TREE}` ב: `old olive`, `Tabor oak`, `carob`, `fig`, `Atlantic terebinth (pistacia)`.

### forest-ground.png
```
A wide strip of gentle rolling hills of the Judean mountains: soft terraces, limestone rocks, dry grass and a narrow
winding dirt path running across from right to left; the hills fill the lower half, the upper half is plain white.
Wide landscape 21:9. [Style]
```

## מה קורה אחר כך

אני חותך את הרקע, מיישר את הגזעים כך שהקטעים יתחברו בלי תפר, מקטין ושומר כ־WebP תחת
`public/assets/family/`, ומחליף בהם את ציורי הביניים שבאב הטיפוס. בלילה משתמשים באותם ציורים, מעומעמים מעט.
