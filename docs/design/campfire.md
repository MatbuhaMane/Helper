# המדורה החדשה – ציורים ותנועה

לפי ההחלטה של הבעלים (2026-11-12, `docs/vision/style.md`): המדורה במרכז הטבעת בדף הבית תצויר מחדש בסגנון האוהל, והתנועה
שלה תתוקן. היום היא `campfire-strip.webp`: 16 פריימים בשנייה וחצי, ולכן היא מקפצת, והציור פשוט מהאוהל.

## התוכנית

**אין סרט פריימים.** ציורים סטטיים בשכבות, והתנועה כולה בקוד, רציפה בכל פריים שהמסך מצייר:

1. **הבסיס** (`fire-base`): טבעת אבנים, עצים מוצלבים וגחלים לוחשות. בלי להבות. שכבה אחת, לא זזה.
2. **ארבע לשונות להבה** (`flame-1` עד `flame-4`): כל אחת בציור נפרד, גבוהה וצרה, בסגנון האוהל. הן עומדות זו לפני זו על
   הבסיס: האחורית הגבוהה, והקדמיות נמוכות וחמות.
3. **התנועה, בכל פריים** (`requestAnimationFrame`, לפי הזמן ולא לפי מונה פריימים):
   - כל להבה מתנדנדת מבסיסה (`rotate`), נמתחת ומתכווצת (`scaleY` גדל, `scaleX` קטן מעט), ומהבהבת קלות (`opacity`).
   - המהירויות נלקחות מ"רעש" חלק: סכום של שלוש־ארבע גלי סינוס בתדרים לא שלמים. כך אין מחזור שהעין מזהה.
   - לכל להבה קצב ושלב משלה. הקדמית שקטה, האחורית חיה יותר.
   - **צבע שזורם:** מסנן SVG של עיוות עדין (`feTurbulence` עם `feDisplacementMap`), שה־`seed` או ה־`baseFrequency` שלו
     משתנים לאט, רק על שכבת הלהבות. במכשיר חלש (מעט ליבות, או קצב פריימים נמוך שנמדד) המסנן כבוי, והנדנוד נשאר.
   - **גצים:** שלוש עד חמש נקודות כתומות שעולות ונכבות מדי פעם. מעט, לא זיקוקים.
   - **ההילה החמה** שכבר קיימת (`.glow`, `.ground`, `.core`) נשארת, ועוצמתה עוקבת אחרי אותו רעש. כך האור "נושם" עם האש.
4. **עצירה:** כשהדף מוסתר, או כשהמדורה מחוץ למסך (IntersectionObserver), הלולאה עוצרת.
   עם `prefers-reduced-motion` מוצגים הבסיס והלהבות בתנוחה שקטה אחת, בלי תנועה.
5. **הצעה שעוד לא אושרה (לבעלים להחליט):** בלילה האש היא מקור האור של הסצנה. הילה כתומה רכה נופלת על החלק הקרוב של
   האוהל ועל הכריות, ומתעצמת ונחלשת עם הלהבות. זו שכבת `radial-gradient` עם `mix-blend-mode`, בלי ציור נוסף.

**הבעלות:** הסימון וה־CSS של המדורה נמצאים ב־`public/index.html`, שהוא קובץ של המאסטר. מוצע ש־design יכתוב את
`public/assets/campfire.js` ו־`campfire.css` (הבסיס, הלהבות והלולאה), וב־`index.html` יוחלף רק הסימון של `.fire`, בתיאום
עם המאסטר.

## ההנחיות לציורים (Gemini, עם `tent.webp` כתמונת סגנון)

כמו ב־`family-tree-art.md`: רקע לבן נקי ושטוח, בלי טקסט. אני חותך את הרקע.

**הסגנון המשותף** (נכנס לכל הנחיה):
```
Style: hand-drawn cartoon illustration exactly like the attached reference (the Bedouin tent): bold, even, dark brown-black
ink outlines, flat warm earthy colours with painted texture, soft hand-drawn shading, no realistic lighting, no glow
effects, no gradients in the background. Plain flat pure white background (#ffffff), nothing else on it, no shadow on the
background, no text, no people, no animals, no frame.
```

### fire-base (יחס 3:2)
```
A small desert campfire seen slightly from above, WITHOUT any flames: a neat ring of eight to ten rounded grey-brown field
stones, inside it three or four short split logs crossed in a low pyramid, their ends charred black, a bed of glowing
embers between them painted in deep orange and red with tiny bright yellow specks, a little grey ash. Centred, filling
two thirds of the picture width. Landscape 3:2. [Style]
```

### flame-1 … flame-4 (יחס 9:16, אחת בכל פעם)
```
A single tongue of campfire flame, standing upright, painted in the same hand-drawn style: a teardrop that rises into a
soft curling tip {SHAPE}, an outer layer of deep orange-red, a middle layer of warm orange, and a small pale yellow
core near the bottom, bold dark ink outline around the whole flame only, no glow, no sparks, no smoke. The flat bottom
of the flame touches the bottom edge of the picture, centred. Portrait 9:16. [Style]
```
מחליפים את `{SHAPE}` בכל פעם:
1. `tall and slender, the tip curling to the left`
2. `medium height, wide at the base, the tip splitting into two small tongues`
3. `short and round, the tip leaning to the right`
4. `tall, with a wavy outline and a separate small flame flicker rising beside its tip`

### מה לבקש מכל הנחיה
ארבע גרסאות לכל הנחיה. אני אבחר שתיים־שלוש מועמדות ואציג לבעלים. הבעלים בוחר.

## איך זה מוצג לבחירה

דף טיוטה (artifact או דף פיתוח מקומי) עם המדורה החיה. בו אפשר להחליף בין גרסאות הבסיס והלהבות, ולראות אותן בתנועה, ביום
ובלילה, בגודל של הטלפון ושל המחשב. כך הבחירה נעשית על המדורה כמו שהיא תיראה, ולא על תמונות סטטיות.

## הסבב הראשון (2026-11-12)

- **ייצור:** בכלי של ai-features (`/api/design/images`), בשרת הפיתוח: בסיס אחד לבדיקה, ואחריו עוד 3 בסיסים (עם בקשה
  מפורשת לטקסטורה באבנים) ו־3 גרסאות לכל אחת מ־4 הלהבות. בסך הכול 16 תמונות, בלי כשלונות, כ־25 שניות לכל קבוצה של 3.
- **עלות:** 0.068 דולר לתמונה (נמדד על הקריאה הראשונה), כ־1.1 דולר לכל הסבב. העלות שהכלי מציג לכל batch מצטברת לא נכון,
  ודווח ל־ai-features.
- **מה חזר:** JPEG על רקע לבן. הבסיס הראשון (אבנים אפורות וחלקות) היה "נקי" מדי. שלושת הבסיסים שביקשו בהם טקסטורה (אבנים
  חמות עם סדקים) מתאימים לאוהל. הלהבות מתאימות לסגנון. הקצה המסולסל של הנחיה 1 "מאויר" יותר.
- **חיתוך:** `figures/art/cut-white.py` מוחק את הלבן שמחובר לשולי התמונה, מפריד את הלבן מצבע השוליים (בלי הילה לבנה על
  רקע כהה), חותך ומקטין. המקור והחיתוכים ב־`data/art/campfire/` (מחוץ ל־git).
- **מנוע התנועה:** `public/assets/campfire.js` ו־`campfire.css`, מוכנים ועוד לא מחוברים לדף הבית.
- **לבחירה:** שלוש מדורות (א, ב, ג) בדף artifact, בתנועה, ביום ובלילה.
