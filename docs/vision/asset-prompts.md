# פרומפטים למנועי תמונה, לרשימה ב-assets.md

**איך משתמשים:**
1. מצרפים לכל בקשה את `public/assets/tent.webp` כתמונת סגנון.
2. בעץ (1–2) מצרפים גם את העץ המקורי השלם: `M:\Claude Code\Helper\docs\design\source\tree-canopy-gemini.jpg`, בתיקייה הראשית ולא בענף vision. ארבע השכבות שבאתר (crown, boughs, trunk, ground) נחתכו ממנו בסקריפט `docs/design/cut-tree-canopy.mjs`. לכן מבקשים עץ שלם לכל עונה, והעיצוב חותך אותו לשכבות.
3. מדביקים את בלוק הסגנון, ואחריו את הפרומפט של הפריט.

הרקע לבן ואחיד ולא שקוף, כי מנועי תמונה לא מייצרים שקיפות טוב. העיצוב מסיר את הרקע וחותך. בלוק הסגנון הוא הנוסח של העיצוב מ-`docs/design/family-tree-art.md`.

## בלוק הסגנון: נכנס לכל פרומפט

```
Style: hand-drawn cartoon illustration exactly like the attached reference (the Bedouin tent): bold, even, dark brown-black
ink outlines, flat warm earthy colours with painted texture, soft hand-drawn shading, no realistic lighting, no gradients
in the background. Plain flat pure white background (#ffffff), nothing else on it, no shadow on the background, no text,
no letters, no people, no animals, no frame.
```

## א. עץ המשפחה

**0. עצי השורשים: ערכות לבחירה.** האורן הוא ברירת המחדל, והזית הוא העץ השני. האדר והערער האפריקאי יגיעו בעתיד.

- **מה מצרפים:** רק את `tent.webp`.
- **מה מדביקים:** את בלוק הסגנון, אחריו את בלוק המבנה, ובסוף את השורה של העץ.
- **אחר כך:** מכל עץ שנבחר מייצרים את שלוש העונות בפרומפט של 1–2.
- **העיצוב** חותך כל עץ לשכבות ומודד את מקומות העלים (`slots.json`) לכל ערכה.

בלוק המבנה זהה בכל העצים, כדי שהמשפחה תשב באותם מקומות בכל ערכה:
```
A single tree drawn as a family tree of roots: portrait 2:3, centred, the whole tree from the roots to the top of the
crown filling the image, a calm, warm, dignified symbol of a family across generations.
The crown is broad and rounded, nearly as wide as the image; the tree is not tall and narrow.
From bottom to top, five clear bands of equal height, each with FOUR open, empty spaces spread evenly across the width
(at about 15%, 35%, 65% and 85% of the width), where small round portraits will be placed later; nothing important is
drawn in those spaces:
1. Roots: wide visible roots spreading left and right over a low mound of warm earth with a few stones and tufts of
   grass; the roots curve around the four open pockets. A small flat open spot of earth at the very bottom centre.
2. The trunk: a thick, characterful trunk with a broad root flare, one low bough on each side.
3. The boughs: two strong boughs reaching left and right, with a little foliage at their tips.
4. The lower crown: foliage in soft clusters with open gaps between them.
5. The top of the crown: lighter, airier foliage with open gaps across the top.
Balanced but organic, not mirrored. No birds, no swings, no ornaments, nothing hanging on the tree.
```

שורת העץ, אחת לכל בקשה:
```
PINE (default): an old Aleppo pine, the pine of the hills of Jerusalem: a rugged reddish-grey bark with deep plates,
the crown in broad flat layered clouds of dark green needles, a few brown pine cones.
OLIVE: an ancient olive tree: a gnarled, twisting, hollowed grey-brown trunk, silver-green foliage in soft rounded
clusters, a few small olives.
MAPLE (later): an old broad maple: smooth grey-brown bark, a dense rounded crown of five-pointed leaves, a few winged seeds.
AFRICAN JUNIPER (later): an old African juniper (Juniperus procera): a tall fluted, fibrous reddish-brown trunk, the
crown in dense blue-green scaly tufts, a few small blue-black berries.
```

**1–2. העץ השלם בשלוש עונות:** הצמרת, הענפים, הגזע והקרקע. אותו יחס ואותו גודל כמו המקור. שלוש בקשות, ובכל אחת משנים רק את העונה.

צריך את כל העץ ולא רק את הצמרת והקרקע, כי גם בענפים ובראש הגזע יש עלים ירוקים.
```
The same tree as the second attached image: exactly the same trunk, branches, crown outline, ground, size, position
and composition, same canvas size. Only the season changes:
[AUTUMN: all foliage, including the leafy tips of the side branches, in amber, rust and ochre, a few leaves falling;
fallen leaves on the ground | WINTER: bare dark branches with a light dusting of snow on top, no leaves on the side
branches, a few small evergreen tufts; soft patches of snow on the ground | SPRING: fresh light-green leaves with small
white and pink blossoms, also on the side branches; green grass with small wildflowers on the ground].
Keep every branch and every empty space between the branches exactly where it is in the original.
```

**3. העלה בשלוש עונות.** יחס 1:1, ובקשה נפרדת לכל עונה.
```
A single leaf, centred, seen from above, filling most of the image:
[AUTUMN: an amber-rust leaf | WINTER: a small closed bud on a twig with a touch of frost | SPRING: a green leaf with one small white blossom].
```

**4. העלה הריק.** יחס 1:1.
```
A single leaf, centred, drawn only as a pale outline with faint dotted veins, almost empty inside, very light warm grey,
as if waiting to be filled in.
```

**5. רקע לבאנר.** יחס 4:1.
```
A wide horizontal banner of old parchment or rough woven cloth, gently curled at both short ends, warm sand colour,
empty in the middle.
```

**6. רקע לראש הפרופיל.** יחס 16:5.
```
A wide calm landscape strip: soft hills at dusk, an olive tree on one side, warm sky, lots of empty calm space in the
middle for text to be placed over it later.
```

## ג. לכלים העתידיים

כל פריט קטן מצויר לבד, ממורכז, ביחס 1:1. אם מבקשים "a set", המנוע מצייר את הפריטים בשורה, והעיצוב חותך אותם.

**15. ע ב-ע.**
```
(a) A wide wall of pale limestone blocks, warm cream, flat front view, no writing on it. Aspect 2:1.
(b) A small stone mason's chisel, centred.
```

**16. עוזר מטבח.**
```
A set of kitchen measuring tools, each separate with space between them, in one row: a measuring cup, a tablespoon,
a teaspoon, a small kitchen scale, a wind-up kitchen timer.
```

**17. הגינה.**
```
A set of eight house plants in clay pots, each separate, in two rows: monstera, pothos, snake plant, cactus,
basil, mint, a tomato plant, an olive sapling.
```

**18. תחזוקת הבית.**
```
A set of home appliances, each separate, in one row: a wall air conditioner, an electric water heater (boiler),
a rooftop solar water heater with its panel, a ceiling smoke detector, an under-sink water filter.
```

**19. המוסך.**
```
A set of smart-home devices, each separate, in two rows: a round robot vacuum, a small modern electric hatchback car
with no logo or badge, a wall EV charging station with its cable, a floor-heating panel section, a flat TV,
a set-top box, a TV remote control.
```

**20. מדיטציה.** יחס 16:9.
```
A quiet night scene beside a small Bedouin tent: a low glowing campfire, a starry deep-blue sky, a crescent moon,
soft hills, a calm and peaceful mood. Here the background is part of the scene (ignore the white-background rule).
```

**21. שיתוף הישגים.** שלוש מסגרות, ולכל אחת שני יחסים: 9:16 ו-1:1.
```
A decorative frame border only, empty in the middle, for a celebration card:
[1: olive branches and small leaves | 2: embroidered woven pattern in warm reds and ochre | 3: gentle confetti of small stars and leaves].
```

**22. עיצוב העץ שנפתח בשימוש.**
```
(a) Six small round portrait frames, each separate, empty in the middle: carved wood, gold, a ring of flowers,
carved stone, rope, embroidery.
(b) Four wide background scenes for a family tree, aspect 3:2, background is part of the scene:
sunset over hills, mountains, the sea, a starry night.
```

**23. קישוט מדיה.**
```
A sticker sheet of about twenty small separate stickers, each with a thin white outline: a tent, a campfire, an olive
branch, a heart, stars, a candle, an umbrella, a flower, a sun, a crescent moon, a coffee cup, a pomegranate,
a music note, a book, a house, a balloon, a gift, a decorative hand-drawn swirl, a leaf, a cloud.
```
