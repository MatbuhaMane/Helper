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
`kind: 'person'`:

| tier | figures |
|---|---|
| free | ibnsina (אבן סינא), rambam (הרמב"ם), newton (ניוטון), juha (ג'וחא), hershele (הרשל׳ה), scheherazade (שחרזאדה), alibaba (עלי באבא), peterpan (פיטר פן) |
| paid | maryshelley (מרי שלי), leonardo (לאונרדו דה וינצ׳י), cleopatra (קליאופטרה), dracula (דרקולה) |

`Figure2D.list()` gives each one's `tier` and `tags`. **Traditions:** none of them is a prophet or a sacred figure, and
every one is drawn modestly and respectfully. The one to filter is Dracula (`tags: ['horror']`, undead): leave him out for
children under 12, and offer him only on request (or hide him for anyone who prefers no horror). Whether a tradition
setting should hide anyone else is the owner's call (vision). Peter Pan: the UK's perpetual right (Great Ormond Street)
is to be checked by business before anything around him is sold; he is free in the app.

## For ai-features

- **Settings › העוזר האישי › הדמות:** a choice of figures (tiles with `Figure2D.mount(tile, id, { size: 96 })`, live, or
  `still: true` for a long list), saved per person in `H.prefs('daemon').figure` (as it went into main with batch 5); with no choice, `Figure2D.DEFAULT`; Ibn Ezra listed only
  for the owner's family.
- **The companion (daemon.js):** when the chosen figure is a 2D one, mount it instead of the three.js stage, and drive
  it from the companion's states (talk while speaking, think while waiting, happy on success, sleep when idle).
- **The chat's head:** `.dm-head` takes the figure small (`size: 44`), alive or `still: true` by the settings toggle,
  with the name kept in `.dm-name-sr` for screen readers (daemon.css has the rules).
- **The tab:** its picture can be the still icon of the chosen figure.
