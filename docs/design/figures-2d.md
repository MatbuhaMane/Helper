# The simple companions (2D) – design → ai-features

Vision batch 5, item 3: simple, cute figures far cheaper than Ibn Ezra's 3D vinyl, drawn in 2D in the tent's style and
brought to life in code. Ibn Ezra stays (3D, the owner's family only); every other family gets one of these by default.
Preview for the owner: https://claude.ai/artifact/1VZvspHAQp7Pd5Ww9m96fF

## The engine: `public/assets/figure2d.js` + `public/assets/figure2d.css`

```js
const f = await Figure2D.mount(element, 'fennec', { size: 160 });   // a live figure, 160 px wide
f.talk(true) / f.talk(false)   // while the companion speaks (with the voice, or while text streams in)
f.nod()                        // agreeing, "got it"
f.happy()                      // a task done, a badge earned (also on a touch, by itself)
f.think(true|false)            // while waiting for the AI
f.sleep(true|false)            // idle for a long while, or the rest day
f.destroy()
Figure2D.list()                // [{ id, name, kind, unlock, season }]
await Figure2D.mount(el, id, { size: 44, still: true })   // an icon: drawn once, no motion (the chat's head, a settings tile)
```

It needs `figure2d.css` on the page. It pauses when off screen or in a hidden tab, and keeps still under reduced motion
(the device's or the person's, `H.reducedMotion`). One picture per figure: `/figures/2d/<id>/figure.webp`, drawn with an
empty face; the eyes, brows and mouth are vector, placed by each figure's entry in `Figure2D.FIGURES` (neck, pivot, eyes,
mouth, cheek).

## The four (all free, kind "generic")

| id | name | its character (for the settings card) |
|---|---|---|
| fennec | פנק | a small desert fox with huge ears and an embroidered scarf: hears everything, quick to help |
| owl | ינשוף | a round owl with an embroidered sash: wise and quiet |
| hedgehog | קיפוד | a soft hedgehog: small, loyal, glad of every small step |
| lamb | טלה | a woolly lamb in an embroidered vest: calm and warm, reminds you to rest |

The default for families other than the owner's: **fennec (פנק)** – the owner's choice from the preview, 2026-11-13 (`Figure2D.DEFAULT`).
Badge-unlocked and holiday figures come next, the same way (`kind: 'badge'` with `unlock: '<badge id>'`, `kind: 'season'`
with `season: 'purim' | 'hanukkah' | …`); each is one more picture and an entry.

## People and characters (vision batch 6)

Twelve, from the owner's lists, drawn from the original sources (likeness notes in the `historic-figures` skill),
`kind: 'person'` (`tier: 'paid'` and `paid: true` on the paid ones, `hideFor: []` until the owner decides the traditions):

| tier | figures |
|---|---|
| free | ibnsina (אבן סינא), rambam (הרמב"ם), newton (ניוטון), juha (ג'וחא), hershele (הרשל׳ה), scheherazade (שחרזאדה), alibaba (עלי באבא), peterpan (פיטר פן) |
| paid | maryshelley (מרי שלי), leonardo (לאונרדו דה וינצ׳י), cleopatra (קליאופטרה), dracula (דרקולה) |

`Figure2D.list()` gives each one's `tier`, `paid`, `hideFor` and `tags`. **Traditions:** none of them is a prophet or a sacred figure, and
every one is drawn modestly and respectfully. The one to filter is Dracula (`tags: ['horror']`, undead): leave him out for
children under 12, and offer him only on request (or hide him for anyone who prefers no horror). Whether a tradition
setting should hide anyone else is the owner's call (vision). Peter Pan: the UK's perpetual right (Great Ormond Street)
is to be checked by business before anything around him is sold; he is free in the app.

## The special ones (paid; the owner's choice, 2026-11-13)

`kind: 'special'`, `tier: 'paid'`, `paid: true`. Each has its own move, `f.special()`, which also plays inside
`f.happy()`, so the companion's existing "glad when something worked" already shows it:

| id | name | its move |
|---|---|---|
| magician | הקוסם מהשוק (a man) | redrawn 2026-11-13 after the owner's picture: a kind old desert wizard, white turban and beard, a blue light over his staff; a dove (with an olive sprig) flies out of his turban in a burst of sparks |
| astronomer | האסטרונומית (a woman) | at night the stars of her shawl wake and twinkle, and she glows faintly; when glad, a shooting star. **Her hair is chosen by the person**, white by default (below) |
| doll | בובת הטלאים (neither) | wears the person's own badges, sewn on: `mount(el, 'doll', { patches: earnedBadgeIds })` (up to 8, newest last); `f.sew(id)` stitches a newly earned one in |
| nightwizard | קוסם הלילה (a man) | a young wizard, a black cloak with golden flowers, a crescent staff with a pearl that glows; when glad, pale gold sparks from the pearl |
| forestwitch | קוסמת היער (a woman) | a young wizard of the forest, curly hair, a purple hat, a crystal staff and an old book; when glad, violet sparks from the crystals |
| littlewizard | הקוסם הקטן (a man) | short and round, a big blue starry hat hiding his eyes, a white beard; a golden orb that glows; a mouth shows only while he talks |
| littlewitch | הקוסמת הקטנה (a woman) | his counterpart: the same hat over her eyes, silver braids, rosy cheeks; a golden orb that glows; a mouth only while she talks |

The four wizards were added at the owner's word (2026-11-13), after the owner's pictures, toned for everyone: moons and
stars instead of a pentagram and runes, a crescent instead of snakes, a closed robe. Any figure may glow where its
light is (`glowAt`, `glowColor`) and spark from there (`special: 'spark'`, `sparkFrom`, `sparkColor`); a figure with
`eyes: []` has none drawn (the hat hides them), and `mouthQuiet` shows the mouth only while it talks.

**The astronomer's hair:** her hair is its own layer (`/figures/2d/astronomer/hair.webp`), tinted with multiply so its
shading stays. `Figure2D.list()` gives `hair: [{ color, name }]` (לבן, כסוף, שחור, חום, ערמוני, ג'ינג'י, בלונד) and
`hairDefault: '#ffffff'`; mount with `{ hair: color }` and change it live with `f.setHair(color)`. For ai-features: a
row of colour swatches under the figure when she is chosen, saved per person (e.g. `H.prefs('daemon').hair`).

For ai-features: show them as their own group ("מיוחדות"), paid; for the doll pass the person's earned badge ids
(`D.badges.earned` in goals) as `patches`, and call `f.sew(id)` when a badge is earned while it is on screen.

## For ai-features

- **Settings › העוזר האישי › הדמות:** a choice of figures (tiles with `Figure2D.mount(tile, id, { size: 96 })`, live, or
  `still: true` for a long list), saved per person in `H.prefs('daemon').figure` (as it went into main with batch 5); with no choice, `Figure2D.DEFAULT`; Ibn Ezra listed only
  for the owner's family.
- **The companion (daemon.js):** when the chosen figure is a 2D one, mount it instead of the three.js stage, and drive
  it from the companion's states (talk while speaking, think while waiting, happy on success, sleep when idle).
- **The chat's head:** `.dm-head` takes the figure small (`size: 44`), alive or `still: true` by the settings toggle,
  with the name kept in `.dm-name-sr` for screen readers (daemon.css has the rules).
- **The tab:** its picture can be the still icon of the chosen figure.
