# רַאבַּ"ע introduces himself (the look)

_Design, 2026-11-14. The owner's ask, through the CEO. The JS and the text are ai-features'. The CSS is `public/assets/raba-intro.css`. The JS links it the way common.js links daemon.css, before it opens the cards._

**When:** the first time a person picks רַאבַּ"ע, 4–5 cards, like signing up for an app.
**Where he lives:** "תור הזהב הנצחי", an eternal golden hour:
- **By day:** a warm dusk sky.
- **In dark mode:** a deep night with a gold glow.
- **Both:** cards of parchment with the faint ruled lines of a manuscript, and his words in Frank Ruhl Libre (already loaded).

**Sizes:** on a phone it fills the screen. From 720 px it is a parchment card, 560 px wide, in the middle of the sky. The audit is clean at 375 and 1280 px, in light and dark mode. Every control is 44 px or more.

## The markup

```html
<div class="rb-intro" role="dialog" aria-modal="true" aria-label="רַאבַּ״ע מציג את עצמו">
  <div class="rb-box">
    <div class="rb-top">
      <button class="rb-mute" type="button" aria-pressed="false" aria-label="השתקה"></button>   <!-- the icon is CSS: true = muted -->
      <button class="rb-skip" type="button">דלג</button>
    </div>
    <div>
      <div class="rb-fig speaking"><img src="/assets/ibn-ezra-face.webp" alt="" width="148" height="148"></div>   <!-- or his 3D canvas -->
      <p class="rb-name">רַאבַּ"ע<small>מתור הזהב הנצחי</small></p>
    </div>
    <div class="rb-cards">
      <section class="rb-card past" aria-hidden="true" inert>…</section>   <!-- a card already read -->
      <section class="rb-card on">
        <h2>the title</h2>
        <p class="rb-say"><span class="said">each</span> <span>word</span> …</p>
        <ul class="rb-can"><li><b>תזכורות</b> בזמן הנכון</li>…</ul>          <!-- optional: what he or the Ohel can do -->
        <blockquote class="rb-quote">a line from the sources<cite>its source</cite></blockquote>   <!-- optional -->
      </section>
      <section class="rb-card" aria-hidden="true" inert>…</section>        <!-- a card still to come -->
    </div>
    <div class="rb-dots"><button type="button" aria-label="כרטיס 1"></button><button type="button" aria-label="כרטיס 2" aria-current="step"></button>…</div>
    <div class="rb-acts">
      <button class="rb-back" type="button" aria-label="הקודם" hidden></button>   <!-- from the second card on; the chevron is CSS -->
      <button class="rb-next" type="button">הבא</button>                          <!-- on the last card: "בואו נתחיל", with .last -->
    </div>
  </div>
</div>
```

## What the JS sets

| State | Where | What it does |
|---|---|---|
| `.on` | the card shown | it fades in and slides into place (200 ms). The RTL flow: the next card comes from the left. |
| `.past` | the cards already read | they leave to the right. A card with neither class waits on the left. |
| `aria-hidden` + `inert` | every card but `.on` | — |
| `.speaking` | `.rb-fig`, while the voice plays | the gold halo breathes (`rb-speak`, on the allowlist as "Live"). Remove it when he stops. |
| `.said` | each word span in `.rb-say`, as the voice passes it | the text he says is the subtitle: the words not said yet are dim. |
| `.done` | `.rb-say` | every word is lit at once. Use it when muted, with no voice, or when the card is shown again. |
| `aria-pressed="true"` | `.rb-mute` | the icon changes to "muted", and the words light at once (`.done`). |
| `aria-current="step"` | the dot of the card shown | it turns gold and grows. A dot can be tapped to go to its card. |

- **Nothing jumps.** All the cards sit in one grid cell, so the box keeps the tallest card's height. A long card scrolls inside `.rb-cards`.
- **The figure:** 148 px on a phone, 184 px on a desktop, and 112 px on a short screen. An `img` gets a gold rim. A canvas or `.dm-headfig` fills the box as it is.
- **Reduced motion:** the cards only fade, and the halo stands still.
- **Closing:** "דלג", "בואו נתחיל" and Esc close it. A short fade out is enough. Return the focus to where it was.
