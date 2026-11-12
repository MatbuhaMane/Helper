# A tool without AI is a whole tool; the AI is an upgrade inside it

The owner's rule (vision, batch 3): every tool that uses AI has a useful version that is not smart, for people with no AI
connection; the invitation to connect an AI or buy credits comes **in addition**, never **instead**. This is how the two
versions look, so that the plain one is never "a tool with a hole in it".

## The four rules

1. **The plain version is designed first.** The page is laid out for it: its main action, its list, its result. Someone
   with no AI must not meet an empty box, a greyed-out button, or a "requires AI" message in the middle of the page.
2. **The AI is one quiet, recognisable upgrade, beside the plain action – never in its place.** It is a secondary
   button with the mark ✨ and a verb ("✨ להציע בשבילי", "✨ לתרגם", "✨ לסדר לפי נושאים"), in the olive field the hub
   uses for "extra" (`--accent`), next to the plain button (`.btn primary`), never larger than it.
3. **Without AI, the upgrade still shows – as an offer, not as a lock.** The same ✨ button, with a small "חדש" or a
   short line under it; a tap opens the friendly invitation (`H.aiInvite()`, `.ai-invite`), and the plain result stays
   on the screen behind it. Once a person said "לא עכשיו", the button stays but the invitation is not pushed again that day.
4. **What the AI added is marked.** A result the AI made or changed carries a small ✨ and a line "הוצע בעזרת העוזר
   החכם", so the person always knows what came from where, and can undo it.

## The pattern, in markup and classes (for ai-features)

```
<div class="ai-pair">                         ← the plain action and its upgrade, side by side (they wrap on a phone)
  <button class="btn primary">חיפוש</button>  ← the plain version: always works
  <button class="btn ai-up">✨ חיפוש חכם</button>   ← the upgrade; class "ai-up"; with no AI: also "offer"
</div>
<p class="ai-note">✨ הוצע בעזרת העוזר החכם · <button>ביטול</button></p>   ← under a result the AI made
```
`.ai-pair`, `.ai-up`, `.ai-up.offer` and `.ai-note` are styled in `base.css` by design.

## Examples (to check against ai-features' map of the tools)

| Tool | The plain version (whole on its own) | ✨ The upgrade |
|---|---|---|
| ספר המתכונים | the family's recipes, search by name and ingredient, the shared cache of recommended recipes | ✨ "מתכון ממה שיש לי", translating a recipe from abroad |
| רשימת קניות | the list, the fridge, the categories, the automatic list | ✨ completing a list from a recipe, a guess of the category |
| בידור | the cached recommendations, the viral feed | ✨ a fresh choice made for you now |
| מחשבון | a full calculator | ✨ "הסבר לי את התרגיל" |
| סידור המייל | rules the person writes (from, subject, label) | ✨ a plan proposed from the mailbox |
| הדמות המלווה | its tips and its shortcuts | ✨ a real conversation |
