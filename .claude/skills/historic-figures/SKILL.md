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

## Likeness: what makes each one recognisable
Write the defining features before modelling, then exaggerate them gently.

### Rabbi Avraham ibn Ezra (ראב"ע), 1089-1167, Spain and wanderer
- No contemporary portrait. Traditional depiction: a medieval Sephardi sage, a full grey beard, a turban or a soft
  rounded cap, a long robe (deep blue or burgundy) with a sash, a cloak.
- Props: an astrolabe (astronomer, mathematician), a book or scroll (commentator, poet, grammarian). A traveller's staff
  hints at his wanderings.
- Expression: wise, a little wry (he was famous for his wit).

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

## Adding a new figure
1. Check the rules above. 2. Write its likeness notes here (dates, features, clothing, props, expression).
3. Model with the `blender-figures` skill in the `figure-style` look. 4. Show the owner the renders. 5. Export to
`public/figures/<slug>.glb` and add it to `public/figures/index.json`.
