---
name: historic-figures
description: Rules and likeness notes for the historic figures the companion can become (bobblehead style). Read before adding, changing or choosing a historic figure, or when the companion is asked to turn into a person.
---

# Historic figures

## Who may be a figure
- **Only people who died long ago** (as a rule, more than 50 years). Never a living person.
- Respectful, warm depictions. No mockery, no figures associated with atrocities, no figures whose depiction is
  forbidden or deeply offensive to their community.
- Biblical and ancient figures have no portraits: depict them from tradition and classic art, modestly, without
  claiming accuracy.
- Personal family use. If the app is ever offered publicly, check likeness rights (some estates license famous faces).

## The owner's two principles for the library (2026-11-13)
1. **Prophets only in an agreed depiction.** If a depiction might hurt anyone, it is not added at all.
2. **Choose figures nobody objects to, rather than hiding figures by religion.** The library is built so that every
   figure can be shown to everyone; a figure that would need hiding for some tradition is better left out.
And: a figure that becomes paid is announced to the master (the paid list lives on the server, `server/figures-rules.ts`).

## Likeness: what makes each one recognisable
Write the defining features before modelling, then exaggerate them gently.

### Rabbi Avraham ibn Ezra (ראב"ע), 1089-1167, Spain and wanderer
- No contemporary portrait. Traditional depiction: a medieval Sephardi sage, a full grey beard, a turban or a soft
  rounded cap, a long robe (deep blue or burgundy) with a sash, a cloak.
- Props: an astrolabe (astronomer, mathematician), a book or scroll (commentator, poet, grammarian). A traveller's staff
  hints at his wanderings.
- Expression: wise, a little wry (he was famous for his wit).

- **Introduction:** he presents himself simply as "אבי", "אבן עזרא" or "ראב"ע" – no quips in the introduction (owner's
  instruction). His wit is only for when it is invited (a joke asked for, questions about him, his luck, banter).
- **Personality (the helper speaks in his voice when it takes his form; top priority, the owner's favourite):**
  quick wit and short epigrams; wordplay on Hebrew roots and grammar; playful teasing of rival opinions; deep wisdom
  said lightly; a love of numbers and stars (astronomy and mathematics asides); and above all **self-deprecation about
  his luck**, blaming the stars of his birth.
- **His real lines (quote only these, or others verified):** the poem on his bad luck ("גלגל ומזלות במעמדם נטו
  במולדתי" – if he sold candles the sun would not set until he died; if he dealt in shrouds no one would die in his
  lifetime); coming to the nobleman's house: in the morning "he has ridden off", in the evening "he has gone to bed",
  "אוי לאיש נולד בלי כוכב"; the garment full of holes like a sieve for wheat and barley; ending a hint with
  "והמשכיל יבין". **Never invent quotations attributed to him**; new quips in his spirit are fine as the helper's own.
- The persona text lives in `server/daemon.ts` (SYSTEM, "PERSONA ibn_ezra"). Changing it means bumping PROMPT_VERSION.

### Job (איוב)
- Biblical; depict from tradition: an elder of the land of Uz, a long white beard, a simple woollen robe and head cloth.
- Show him in the end of his story, restored and at peace, not in suffering: a gentle smile, a shepherd's staff, a
  small sheep beside him.

### Sir Moses Montefiore, 1784-1885
- Many portraits. Very tall. Signature: **a white chin-curtain beard / long sideburns framing a clean-shaven chin and
  upper lip**, a high forehead, a long straight nose; often a black top hat or a kippah; a black frock coat, a white high
  collar and a black cravat; a cane.
- Props: the Mishkenot Sha'ananim windmill (Jerusalem) as a tiny model, or a cane.
- Expression: kind, dignified, generous.

## The 2D figures (vision batch 6, the owner's lists; 2026-11-13)
Drawn in 2D in the tent's style with Figure2D (`public/assets/figure2d.js`), from **the original source, never a known
adaptation**. The picture is drawn with no eyes and no mouth (the engine adds them); the nose, hair, beards, moustaches,
headwear and clothes carry the likeness. Modest clothing for everyone; glamour is presence, never sexuality.

**Free**
- **Ibn Sina (Avicenna), 980-1037, Persia.** No contemporary portrait; the traditional Persian depiction: a full dark
  beard, a white turban, a long robe in deep green or blue with a sash. Props: a thick book (the Canon of Medicine), a small
  glass flask or a sprig of herbs. Calm and attentive: the physician who listens.
- **The Rambam (Maimonides), 1138-1204, Córdoba, Fez, Fustat.** No contemporary portrait; the traditional image (the
  later engraving): a turban, a full rounded beard, a long robe and a cloak. Props: a book or a scroll (the Mishneh
  Torah, the Guide), a physician's satchel. Serene and clear. Never a caricature: a rabbi revered in every community.
- **Isaac Newton, 1642-1727, England.** Many portraits (Kneller): long shoulder-length grey hair, clean-shaven, a long
  straight nose, a dark coat and a white cravat. Props: an apple, a small glass prism with a rainbow. Thoughtful.
- **Juha (ג'וחא, Nasreddin), folk hero of the Middle East.** A folk figure, no likeness: a round jolly man, a short round
  grey beard, a big white turban, a long striped robe and a sash, beside his little donkey (his signature, often ridden
  backwards). Warm, sly, kind.
- **Hershele Ostropoler, c. 1757-1810, Podolia (folk jester).** No portrait: an Eastern European Jew of the shtetl, a
  scruffy short beard, a worn black wide-brimmed hat, a long patched coat (poor but proud), a walking stick. Mischievous
  and warm, never mocking his people.
- **Scheherazade (One Thousand and One Nights).** A young storyteller, wise and brave: modest Persian dress, a long
  headscarf over dark hair, an embroidered robe; props: an open book of tales or an oil lamp. Dignified, never sexualised.
- **Ali Baba (One Thousand and One Nights).** A poor, honest woodcutter: a simple turban, a striped vest over a long shirt,
  a sash, a bundle of wood on his back or a small sack of gold coins. Cheerful and surprised.
- **Peter Pan (J. M. Barrie, 1904/1911).** From the book, not Disney: a boy dressed in skeleton leaves and the juices of
  trees, tousled hair, barefoot, his pan pipes; still has his first teeth (a grin). No green felt cap with a feather.
  Note: the United Kingdom keeps a perpetual right for Great Ormond Street Hospital (to be checked before any sale).

**Paid**
- **Mary Shelley, 1797-1851, England.** Portrait (Rothwell, 1840): auburn hair parted in the middle with soft ringlets, a
  pale oval face, a dark high-waisted dress with a shawl over the shoulders. Props: a quill and a manuscript, a candle in a
  holder. Thoughtful, a little mysterious.
- **Leonardo da Vinci, 1452-1519, Florence and Milan.** The traditional image (the red-chalk old man): long flowing white
  hair and a long white beard, a soft red cap, a long robe. Props: a notebook with mirror-writing sketches, a small model
  of a flying machine. Curious, gentle.
- **Cleopatra VII, 69-30 BCE, Egypt.** Coins and busts: the "melon" hairstyle drawn back into a bun under a royal diadem
  band; Egyptian royal imagery: a cobra (uraeus) on the brow, a broad gold collar, a white pleated linen gown. Props: a
  small papyrus scroll (she was a scholar of many languages). Regal, charismatic, poised – glamour, not sexuality.
- **Count Dracula (Bram Stoker, 1897).** From the novel, not Universal or Lugosi: a tall old aristocrat, clean-shaven
  except a long white moustache, a high domed forehead, bushy eyebrows, pointed ears, dressed in black from head to foot
  with a long cloak; prop: an old silver candelabrum. Charismatic and courtly, a little eerie; no blood, no fangs shown.
  Tagged `horror`: settings can leave him out (children, and anyone who prefers).

## Adding a new figure
1. Check the rules above. 2. Write its likeness notes here (dates, features, clothing, props, expression).
3. For a 2D figure: draw it with the image tool (no eyes, no mouth), cut it, and add its face to `Figure2D.FIGURES`
(docs/design/figures-2d.md). For a 3D one (Ibn Ezra's kind): model with the `blender-figures` skill in the
`figure-style` look and export to `public/figures/<slug>.glb` (and `public/figures/index.json`).
4. Show the owner a preview before it goes into the app.
