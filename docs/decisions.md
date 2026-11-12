# Decisions

A shared log of decisions that affect more than one area. Every session adds an entry here when it decides something
others must know: a shared file it needs changed, an API another area uses, a design token, a price or a quota, a new
table or route. Newest first. The master reads this before each merge.

Format:

```
## YYYY-MM-DD – short title (area)
What was decided, why, and what other areas must do. Status: proposed | accepted | done.
```

## 2026-11-13 – The recipe check without AI (docs/ai/without-ai.md #4) (ai-features → master, design)

`POST /api/recipes/check` now checks by word lists first (`server/recipe-rules.ts`, 17 tests in
`server/test-recipe-rules.mjs`): non-kosher foods, seafood, shrimp, meat with dairy (the dairy marked, with its
substitutes), high-carb foods for keto, and the ingredients with no amount (`missing`). The answer has the same shape
plus `method: 'rules' | 'ai'`. The AI checks by itself only when it is free for the person (the family, or their own
key), as before; otherwise on request (`{ai: true}`, "✨ בדיקה חכמה" in the fix window, an invitation when no AI is
left). An AI answer already cached for the same ingredients is used for anyone at no cost.
- **For the master:** add `test:recipe-rules` to `npm test`. No route or table.
- **For design:** `.fix-smart` (an `.ai-pair` with ✨ and a short note), `.fix-missing` (the ingredients with no amount).
Status: done (on `ai-features`).

## 2026-11-13 – The study room without AI (docs/ai/without-ai.md #7) (ai-features → master, design)

The dictionaries, the concordance and the commentaries already worked without AI. Now:
- **The researcher:** "🔎 חיפוש בספריא" (primary) searches all of Sefaria's sources by the question's key words
  (`public/parasha/plain.js`, 13 tests in `server/test-parasha-plain.mjs`; through the existing `/api/research/search`),
  beside "✨ שאלה לחוקר" (`.ai-up`, `offer` when no AI is left); a link to the verse's commentaries.
- **A word:** the Hebrew explanation (AI) comes by itself only when the AI is free for this person (the family, or their
  own key); a limited account gets "✨ פירוש בעברית" and spends nothing on a tap.
- **Translation:** "📖 התרגום של ספריא" (Sefaria's own translation of a Sefaria source, e.g. the Metsudah Onkelos) and
  "📚 מילון למילים" (each word in Sefaria's dictionaries) beside "✨ תרגום לעברית". AI results carry `.ai-note`.
- **For the master:** `public/parasha/index.html` loads `plain.js` before `study.js`; add `test:parasha-plain` to
  `npm test`. No route or table.
- **For design:** `.rs-ask-acts` (the researcher's two buttons, on their own row), `.rs-plain` and `.rs-plain-hit`
  (the search results; an inline rule holds them until then), `.rs-tr-plain`, `.rs-tr-gloss`, `.rs-tr-sef`.
Status: done (on `ai-features`).

## 2026-11-12 – Restaurants: the family's list (A) and Google Places (C) (ai-features → master, design)

The owner chose A, then C (docs/ai/restaurants.md); for C, the place is both the city in the settings and the device's
location, and Google is open to everyone with a monthly limit.
- **A, מסעדות שלנו** (`/food/restaurants/`): table `restaurants` (appended to schema.sql), routes `/api/restaurants`
  (list, add, change, delete, `/:id/fav`, `/:id/visit`), 5 tests (`server/test-restaurants.mjs`). In the food
  portal: a tile, and in the slider the favourites not visited for 30 days and the new ones.
- **C, Google Places** (`server/places.ts`, 14 tests in `server/test-places.mjs`): `GET/POST /api/restaurants/search`,
  on request only. A text search around the city (`prefs me.city`, a new "המקום שלי" in the settings) or a nearby
  search around the device's point (asked with its permission, used for that one call, not kept). Only the "Pro"
  fields. Nothing of Google's answer is stored; a restaurant added from it keeps Google's place ID
  (`restaurants.place_id`, allowed indefinitely). Results are marked "Google Maps". Limits: 20 searches a month for a
  limited person, none for the family (`ai_allowance.limited`), and 4,500 a month for the whole site (Google's free
  tier is 5,000), counted in the new table `places_usage`.
- **For the owner:** a Google Maps Platform API key restricted to "Places API (New)", with a daily quota cap in Google
  Cloud, entered as the secret `GOOGLE_MAPS_API_KEY`. Until then the page says the search is not set up.
- **For the master:** add `GOOGLE_MAPS_API_KEY?: string` to `Env` in core.ts (places.ts reads it through a local type
  until then); add `test:restaurants` and `test:places` to `npm test`. Google's terms (the master's answer): only the
  place ID is kept. "Add to our list" shows Google's name and address for reference, and the person types the name in
  their own words; the link saved is `https://www.google.com/maps/place/?q=place_id:<id>` (a URL, no API call).
- **For design:** `.rs`, `.rs-card`, `.rs-fav`, `.rs-filters`, `.rs-tags`, `.rs-kosher` (`kosher`, `mehadrin`, `no`),
  `.rs-near`, `.rs-place`, `.rs-attrib` (Google's attribution: keep it visible), `.fs-restaurant`; and a restaurant
  icon for the portal tile (it uses `food` now).
Status: done (on `ai-features`); C waits for the key.

## 2026-11-12 – Vision batch 4 on ai-features: what was built, and what others are asked (ai-features → master, design)

Built on `ai-features` (each commit names its item):
- **(1, 8) תנועה ותזונה**: the folder "דיאטה" is renamed (its address `/food/diet/` stays), with הקפדה first; הקפדה
  is in the tools box too; the food portal's subtitle follows. **For the master:** `public/assets/apps.js` still says
  `name: 'דיאטה', sub: 'קטוזיס, הקפדה, ומה מתאים'` (and `'… דיאטה והמקרר'` for אוכל). Proposed: `'תנועה ותזונה'` /
  `'הקפדה, קטוזיס, ומה מתאים'` / `'רשימת קניות, ספר מתכונים, תנועה ותזונה והמקרר'`, and a הקפדה entry
  (`/food/diet/hakpada/`, ic `target`) so it can be pinned to the ring.
- **(5) Notes**: saved only on "שמירה" (or Ctrl+S); closing with changes asks "לבטל את השינויים?"; a ✕; a star.
  Column `notes.starred`. **Drive**: "☁ ל־Drive" makes a Google Doc in "האוהל · פתקים" through the existing
  `/api/auth/login?drive=1` (drive.file, sealed in `google_tokens`). Routes appended: `GET /api/notes/drive`,
  `POST /api/notes/:id/drive`; columns `notes.drive_id`, `notes.drive_at`. `mail.mailStatus` now counts Gmail as
  connected only with the Gmail scope, since a Drive-only grant shares the row. **For the master:** a review of the
  token use. It was not tried against Google (sign-in needs port 8788), and the Drive upload needs a test on a preview.
- **(6) Settings**: in the owner's order, kept per person (prefs `ui`, `access`, `look`, `me`, `daemon`).
  **For the master:** `public/settings/apply.js` defines `H.applySettings()`, `H.reducedMotion()`, `H.vibrate()`,
  `H.soundsOn()`; please run it from `common.js` right after the prefs load (inline it, or `loadOnce` it early), so
  every page gets the text size and the marks before it paints. **For design:** CSS for `:root[data-spacing="wide"]`,
  `[data-font="readable"]`, `[data-contrast="high"]`, `[data-motion="reduce"]`, `[data-palette="…"]` (the palettes'
  ids go in `PALETTES` in settings.js); in `settings.css`, `.st-sec`, `.st-choices` / `.st-jump` (rows of `.chip`, the
  chosen one `aria-checked="true"`), `.st-services-grid`, `.st-field`, `.st-skins`, `.st-soon`. The inline rules in
  settings.js only hold the layout until then.
- **(10) Songbook**: the reader is the hub's flip sheet (`H.sheet`, so `/songs/` loads `sheet.css` and `sheet.js`; the
  old `#reader` section is gone, and the guide's `song-reader` mark moved to the sheet's content); ❤ on a double tap or
  ♡ (prefs `songs.favs`, links only); "🎸 אני מנגן" (prefs `songs.plays`); delete from the reader. In
  `public/assets/music.js`, "the words are in the songbook" is a side popup `.mu-peek` that slides in and out (inline
  styles until design). **For design:** `.scard .fav`, `.chip.plays`, `.heart-burst`, `.mu-peek`, `.songs-sheet`.
  Shared songbooks are not built: they need a sharing model (between households, by link?), which goes to the master
  first.
- **(11) The food portal's slider**: `GET /api/food/highlights` (route appended, `server/food.ts`, 11 tests in
  `server/test-food.mjs`): what goes off within three days in the household's fridges, then its own recipes that use
  it, then recent ones. `public/food/slider.js` puts it under the header. **For design:** `.food-slider`, `.fs-track`,
  `.fs-item` (`.fs-fridge.soon`, `.gone`, `.fs-recipe`). **For the master:** add `node server/test-food.mjs` to
  `npm test`. Restaurants: a proposal for the owner in `docs/ai/restaurants.md`; nothing built.
- **(7)** The gathering's card motion is design's sheet work; nothing of ai-features changed for it.
Status: done (on `ai-features`), except the items marked for others.

## 2026-11-12 – Vision batch 4, design's part: done; what ai-features can now drop or switch (design → ai-features, master)

Done on `design` (each checked at 375 px and on desktop, light and dark, with the page audit): the calculator redesigned
(2); the light of the sun and the moon on the tent and the cushions farther from the fire (3, 4 – in `public/index.html`,
the master's); "עץ המשפחה" on two lines in the bar (9 – base.css only, NAV unchanged); the food header and `H.strip` (11);
smoother card motion (7: transform-only lifts everywhere, the gathering's whole card opens it, and the list and a gathering
crossfade with `@view-transition` in gather.css); the palettes and the reading marks (6); styles for the notes, the
settings, the songbook's heart and the song popup (5, 6, 10), written against ai-features' branch at 62b7751.
For ai-features – the looks are in place, so the stopgaps can go:
- **The food slider** (`public/food/slider.js`): hand the slides to `H.strip` instead of building the row, e.g.
  `H.strip({ title: 'עכשיו במטבח', items: api('/api/food/highlights').then((r) => r.slides.map(card)) })`, placed with
  `H.folder({ ..., under: thatStrip })`, where a fridge slide is `{ kind: 'fridge', emoji: '🧊', kicker: 'מהמקרר · ' + fridgeName,
  title: name, sub: when(days), tone: days < 0 ? 'gone' : days <= 1 ? 'soon' : null, href: '/food/fridge/' }` and a recipe is
  `{ kind: 'recipe', img: image, kicker: '🍳 כדאי לבשל עכשיו' | '📖 מהספר שלנו', title, sub: 'משתמש ב…', href }` (a broken
  picture falls back to the title's first letter by itself). No inline styles are needed.
- **Settings**: the palettes are `[['', 'אבן ובזלת'], ['sea', 'ים התיכון'], ['desert', 'מדבר'], ['vineyard', 'כרם'], ['dusk', 'בין הערביים']]`
  (drop the "בקרוב" one); give each palette chip `data-swatch="<id>"` and it shows its two colours. The inline `style`s on
  `.st-choices`, the chosen chip (it painted `--vine`; settings.css fills the chosen one with `--primary`), `.st-jump`
  and the grids can go.
- **Notes** (`.nt-row`, `.nt-ed-head`), **the heart** (`.heart-burst`: keep the `animate()`, drop the style) and **the
  song popup** (`.mu-peek` in music.css: keep the slide, drop the style): the inline styles can go.
- **The gathering**: for the real flip, open a gathering from its card in `H.sheet.open(card, content)` as the recipe
  book does; until then the crossfade carries it.
- `H.reducedMotion()` (apply.js) is used by the fire, the sheet and the arranging when it is there.
For the master: `public/index.html` changed (the tent's light, the ring's depth), and `common.js` should call
`H.applySettings()` (ai-features' note in apply.js). Status: done (design); the switches above are ai-features'.

## 2026-11-12 – The food window: a full-width header, and `H.strip` for the slider under it (design → ai-features)

Vision batch 4, item 11. The food folder's picture (`H.folder({ hero })`) is now a header from edge to edge that fades
into the page's background, with the title in the fade; nothing changes in `public/food/index.html` for it.
The slider under it is a ready component in `public/assets/launcher.js`; its look is design's, what goes in it is
ai-features':
```
H.folder({ ..., hero: {...}, under: H.strip({
  title: 'מה מבשלים היום', more: { href: '/groceries/#book', label: 'לספר המתכונים' },   // more: optional
  items: api('/api/...').then(toCards),    // an array, or a promise of one: three placeholder cards wait meanwhile
}) })
// a card: { href? | onclick?, kind: 'recipe' | 'place' | 'fridge', kicker: 'מתכון מומלץ', title, sub?, img? (4:3), emoji? }
```
`kind: 'fridge'` is a small paper note with no picture (its emoji goes before the kicker): "החלב פג מחר", "נשארו 2
ביצים". An empty list (or a failed promise) hides the strip. The calculator was also redesigned (batch 4, item 2), in
`calc.css` only, with every class calc.js uses kept. Status: done (design), waiting for ai-features' content.

## 2026-11-12 – The calculator without AI: percentages, currencies, fractions, equations (ai-features → master, design)

The second tool of `docs/ai/without-ai.md`. The calculator reads "15% מ-80", "100 דולר בשקלים" / "$50 + 20 €" (today's
European Central Bank rates as mathjs units) and shows a simple fraction under a decimal. The smart tab has "🧮 חישוב"
(primary): an equation's real roots (π/6 for trig), a function's derivative and zeros, or an expression's value, on the
device; "✨ פתרון" is `.ai-up` (`offer` → the AI invitation when a limited account has no credit and no key of its own).
The pure helpers are in `public/tools/calc/plain.js` (loaded by calc.js, so `index.html` is unchanged).
- Route appended: `GET /api/calc/rates` → `calc.currencyRates` (Frankfurter, `api.frankfurter.dev`; no key, nothing about
  the person is sent; six hours in memory and in Cloudflare's cache). No table.
- For the master: add `node server/test-calc-plain.mjs` to `npm test` (and `"test:calc-plain"`) in `package.json`.
- For design (it was there before this change): at phone width the smart tab's formula bubbles (`.cx-bubbles`) widen the
  page to about 2200 px; a KaTeX `\sqrt` path inside a bubble is 7000 px wide and only its own `svg` clips it. Something
  like `.cx-bubble { overflow: hidden; }` or `contain: paint` in `calc.css` should fix it.
Status: done (on `ai-features`); the bubbles: proposed to design.

## 2026-11-12 – Recipe import works without AI; the AI only on ✨ (ai-features → master)

The first tool of `docs/ai/without-ai.md`. `POST /api/recipes/import {url}` now reads the page without AI
(`server/recipe-parse.ts`): its schema.org JSON-LD, its microdata, or the lists under headings like "מצרכים" and
"אופן ההכנה" (Hebrew and English). Nothing found: `method: 'draft'`, the page's title and picture, to complete by hand.
The AI reads the page only with `{url, ai: true}`. The import dialog in `public/groceries/app.js` follows design's
markup: "ייבוא" (plain) and "✨ ייבוא ותרגום" (`.ai-up`, `offer` → the AI invitation when a limited account has no
credit and no key of its own); a recipe the AI read is marked with `.ai-note` and its "ביטול" removes it.
The translate path (`/api/recipes/world/open`) also hands the AI the plain reader's lists when the page has them.
For the master: add `node server/test-recipe-parse.mjs` to `npm test` (and `"test:recipe-parse"`) in `package.json`.
No route, table or shared file changed. Status: done (on `ai-features`).

## 2026-11-12 – The food menu's window: א2, the set table; all six pictures kept (design, the owner's choice; vision item 11)

The owner chose א2 · השולחן הערוך and asked to keep all six for later. `H.folder({ hero: { src, small, alt } })` in
`public/assets/launcher.js` gives a folder a window on top (the picture in a rounded frame, the title and its line on it;
`launcher.css`), and `public/food/index.html` uses it with `public/assets/food/portal.webp` (`portal-800.webp` on a phone).
The six originals, with the idea, the version and the full prompt of each, are in `figures/art/library/food/` (README).
For the master: `/assets/food/portal.webp` and `portal-800.webp` could join the sw pre-cache with `/food/`. Status: done (on `design`).

## 2026-11-12 – The family tree on a trusted device: built (ai-features, to the master's spec below)

- `server/vault/access.ts`: the one table of each vault route's level – 'tree' (open on a trusted device, no idle lock)
  or 'fresh' (a fresh unlock every time, then the 15-minute window) – and the device's coarse name ("Chrome · Windows",
  never the User-Agent). Every handler in `server/vault/index.ts` calls `need(ctx, ACCESS.<name>)`; the tests check the
  table route by route and that no handler bypasses it (`server/vault/test-access.mjs`, 165 tests).
- An unlock makes the session trusted for 30 days, renewed on every tree use (`sessions.vault_trust_until`, `…_since`,
  `…_used`, `…_label`, COLUMNS); trusting and revoking are written to the vault's activity log.
- Beyond the spec, both to the safe side – please confirm: **appointing household heads** (`roleSave`, a change of rights)
  and **viewing the activity log** (`auditLog`) need a fresh unlock; the **"נעילה" button ends this device's trust**
  (an explicit lock), while the page's own lock after five minutes away (`/api/vault/lock?keep=1`) closes only the
  documents' unlock and keeps the device trusted.
- The page: a trusted device opens straight into the tree ("מכשיר מוכר" in place of the countdown); a person's documents
  wait behind "פתיחת המסמכים"; any special step asks there and then (a passkey, or Google again) and carries on; a picture
  on a card that needs the unlock stays initials. Settings: "מכשירים מוכרים" – each device, since when, last used, "this
  device", remove, or remove and sign out. Routes `GET /api/vault/devices`, `DELETE /api/vault/devices/:id`.
- **For the master**: `test:access` (node server/vault/test-access.mjs) in `npm test`.
Status: done on `ai-features`, for the master's security review.

## 2026-11-12 – The family tree on a trusted device; special actions still ask (master, the owner approved)

Vision's batch 2 item 4 ("the family tree opens freely after the first sign-in"), made safe and approved by the owner.
The vault's encryption does not change (the key is a Worker secret; a passkey never decrypted anything – it is a gate).
A session that unlocks the vault becomes a **trusted device for 30 days**, renewed on each use: the tree (people,
relationships, roles, the forest), editing people and links, and non-private details open there without a touch.
**Every time** a fresh unlock (passkey, or a Google sign-in from the last 10 minutes): documents and files, private items,
changing privacy, linking trees, any delete, export. Settings get a "מכשירים מוכרים" list to revoke a device at once.
Untrusted sessions are as before. Built by ai-features in `server/vault/index.ts`, reviewed by the master. Status: Decided (the owner), assigned.

## 2026-11-12 – The tools menu's arrange mode, and the ring's three fixed items plus pins (design, vision batch 2, items 6 and 12)

As the master assigned:
- `public/assets/apps.js` (new): the catalogue of every menu (each with its cushion and glow colour for the ring),
  `H.ringApps()` – עץ המשפחה, the person's pins, כלים, הגדרות – and `H.isPinned` / `H.togglePin`. Pins are
  `H.prefs('home').pins`; until someone changes them they are the five parts the ring always had (אוכל, חדשות, בידור,
  שירון, פרשת השבוע), so nothing disappears for anyone. Also `H.appIcon(name)`: `H.icon` with a gear for `settings`.
- `public/assets/launcher.js`: `H.folder({ …, arrange: 'tools' })` – the person's order (`H.prefs('tools').order`); a long
  press, a right click, or the "סידור" button opens the arrange mode: tiles wiggle, a finger or the mouse drags them (the
  others glide aside on transform only), the arrows move a focused tile, Escape or "סיום" ends it; each tile that can go
  on the ring has a 📌. `H.prefs('tools').locked` turns the long press, the right click and the button off. Styles in
  `launcher.css`.
- `public/tools/index.html`: arrangeable, loads `apps.js`, and holds every part of the tent too (אוכל, חדשות, בידור, שירון).
- `public/index.html` (the ring's part only): the ring is built from `H.ringApps()` after the sign-in; badges via `H.appIcon`.
**For ai-features:** the switch "נעילת סידור התפריט" in הגדרות sets `H.prefs('tools').locked` (and `H.savePrefs('tools')`).
**For the master:** a `settings` (gear) icon in the shared icons would replace the fallback in `apps.js`; the new top bar can use
it too. Checked at 375 and 1280 px, by day and at night, the audit clean (the tools page also in the arrange mode).
Status: done (on `design`).

## 2026-11-12 – The new campfire on the home page: fire ג, with flicking tips (design, the owner's choice)

The owner chose fire ג (curling tongues) and asked for a playful flick at the tips. The tongues are now drawn on canvases in
thin strips with a bend that grows toward the tip – a sway, a wave rising up the flame, and every 1.5–4 s a quick flick of
the tip that springs back, with a stretch upward (`public/assets/campfire.js`). In `public/index.html` (the master's file,
its fire part only, as approved): `campfire.css` and `campfire.js` are linked; the `.fire` rules now hold only its size,
place and the warm light on the ground (the strip's `.flames`, `.glow` and `.core` rules are gone); `campfire()` mounts the
fire with its five pictures in `public/assets/campfire/`. **For the master:** `public/sw.js` pre-caches
`/assets/campfire-strip.webp` – please replace it in `ASSETS` with `/assets/campfire.css`, `/assets/campfire.js`,
`/assets/campfire/base.webp` and `/assets/campfire/flame-1…4.webp`; design deletes the strip once that is live.
Checked at 375 and 1185 px, by day and at night. Status: done (on `design`), the sw.js line proposed.

## 2026-11-12 – The beta's three months start at the first real gathering (business)

**Decision:** the clock for the three-month beta check (business decision 10) starts on the day the owner sends the first
real gathering to the family. Test gatherings don't count. The check is three months after that day.

**Why:** the beta measures real family use. The loop has been complete since today, but nothing real has been sent
yet.

**Affects:** none. When the first real gathering goes out, the owner tells the business session (or it reads the date
from `gatherings`), and the check date is recorded here and in `docs/business/plan.md`.

**Status:** Decided (the owner). The start date is still to come.

## 2026-11-12 – Credit gifts in the room (ai-features, the owner's decisions via business and the master)

The owner gives AI credit to chosen people from the room: the owner only (not a super), from the owner's own account,
written to the room's log. A gift is a grant of the source "gift" in `ai_credits` – shekels of real AI cost turned into
dollars at the room's rate, spent before any other credit, never expiring, never refunded or moved. Above ₪20 the server
answers `409 {confirm: true}` and the room asks again. The recipient gets a personal note for a month ("🎁 קיבלת מתנה
מהאוהל: קרדיט בשווי ₪…", with the owner's word if any, linking to הגדרות) – a gift's recipient is one of those who see
amounts (`credits-rules.showsAmounts`), so nobody on the trial alone sees one. The room shows this month's gifts, what they
come to, and how much of each person's gifts was really used (gifts go first, so it is what they spent, up to the gifts).
- **Appended**: column `admin_messages.to_email` (COLUMNS: a message for one person; the list of messages to everyone
  leaves those out); routes `GET/POST /api/admin/gifts`. Rules in `server/credits-rules.ts` (`giftIls`, `needsConfirm`,
  `ilsToUsd`, `giftUsed`), 8 more tests (46).
Status: done on `ai-features`.

## 2026-11-12 – Guests join from an invitation, into a household of their own (master)

The owner's decision (business's entry "Guests can join once new accounts are AI-limited"), now that the allowance exists:
"כניסה עם Google" on an open invitation admits a new email into a new household of its own, with the trial credits
(`startTrial`), silently. Built by the master in `server/join.ts` and `server/join-rules.ts` (17 tests, `npm run test:join`),
`server/core.ts` (admitMember asks join.ts through a hook the router registers), a table `invite_joins` and a route
`POST /api/gather/invite/:token/join`. In ai-features' files, small and marked: `inviteInfo` exported from `server/gather.ts`;
the setting `gather.guest_signup` (on by default) in `server/settings.ts`; the join button in `public/gather/invite/invite.js`
(the invitation's key stays in sessionStorage through the sign-in). For business: real sign-ups from invitations are now
counted in `gathering_stats` as `signup` (alongside the click count `signin`), so the viral coefficient can return to the
beta's check. Next, ai-features: the credit gifts in the room. Status: done.

## 2026-11-12 – Design's image tool, through Gemini (ai-features, design's request, assigned by the master)

For the owner's decision "one visual style for everything; images are made through the Gemini API" (vision), as design
asked: `POST /api/design/images {prompt, refs, aspect, n}` sends the prompt with our own pictures as inline references to
`GEMINI_IMAGE_MODEL`, n times (1–4), keeps each result in `MEDIA` under `design/<batch>/<i>.<png|jpg|webp>`, and returns
`{batch, images: [{i, url}], failed, left}`; `GET /api/design/images/<batch>/<i>` gives the picture; `GET /api/design/images`
lists the batches (prompt, references, aspect, when, how many, and their cost from the meter, give or take batches made
within a minute of each other) with today's count and the cap.
- The owner only (`requireOwner`, not the room's passkey, so design can use it with the dev sign-in on its dev server).
- References: only paths of our own public pictures (`/assets/…`, `/figures/…`; png, jpg, webp; no `..`, no outside
  address), read through the Worker's own `ASSETS`, at most 6, 7 MB each.
- Each image is metered as its own feature, `design-image`; a daily cap, the setting `design.images_per_day` (40).
- **Appended**: table `design_images`; three routes; the setting. New files: `server/design-images.ts`,
  `server/design-images-rules.ts` and `server/test-design-images.mjs` (28 tests).
- **Not tried for real** (it spends the key): the call to Gemini itself and the picture it returns. Everything before the
  call is checked on the local dev server. Design's first batch is the first real try.
- **For the master** (proposed): `test:design-images` in `npm test`.
Status: done on `ai-features`.

## 2026-11-12 – The companion stays as it is: the one deliberate exception to one style (design, the owner)

Asked in `docs/design/style-check.md`, the owner chose to leave the companion figures (Ibn Ezra, Montefiore, the elephant)
as they are: 3D figures in the vinyl-collectible style of the `figure-style` skill, the "toy" that lives on the screen.
No outline, no redraw; their faces (`ibn-ezra-face.webp`) stay too. Everything else keeps to the tent's style. Status: done.

## 2026-11-12 – What design needs to make images through Gemini (design → master)

For the owner's decision "one visual style; images through the Gemini API" (vision). Design writes the prompts and
chooses; the mechanism is the master's to build or assign. What design needs, as small as it can be:
1. `POST /api/design/images` (the owner only): `{ prompt, refs: ["/assets/tent.webp", …], aspect: "3:2" | "9:16" | …,
   n: 1–4 }`. It sends the prompt with the reference pictures as inline image parts to `GEMINI_IMAGE_MODEL`, n times, stores
   each picture in `MEDIA` under `design/<batch>/<i>.png`, records each call on the AI meter (kind `design-image`), and
   returns `{ batch, images: [{ i, url }] }`. A daily cap (say 40 pictures) so a bad loop cannot run up the bill.
2. `GET /api/design/images/<batch>/<i>` (the owner only): the picture itself, so design can save it to `data/art/…` on the
   dev server (signed in with the dev sign-in; design never sees the key) and cut it.
3. `GET /api/design/images` (the owner only): the batches – prompt, references, date, cost – so nothing is made twice.
On the dev server this spends the key in `.dev.vars`; design will run it locally only, a batch at a time, and say what each
batch cost. First batches: the campfire (`docs/design/campfire.md`, 5 prompts × 4) and then what the owner picks from
`docs/design/style-check.md`. Status: proposed.

## 2026-11-12 – The look of הגדרות, the AI invitation and the room (design)

- `public/settings/settings.css` (new, linked from `public/settings/index.html`): the account card (the name big, the email
  under it, the logout at the end) and one card per service; a connected one shows a green "✓ מחובר" pill, one still to
  come (ChatGPT, credit) stands back with a dashed edge; the key's field and its button on one line.
- `.ai-invite` in `public/assets/base.css` (it can open on any page): Ibn Ezra's face on a warm round field, a kind
  sentence, the two ways on as even buttons – an invitation, not an error.
- The room: its styles moved from the `<style>` in `public/admin/index.html` to `public/admin/admin.css` (design's now; the
  page links it), unchanged, plus the members' AI column as a small switch. Whoever adds styles to the room: put them there.
Checked at 375 and 1280 px, by day and at night; audit clean. The room's inside is behind biometrics, so its switch was
checked on the room's own markup, not on live data. Status: done (on `design`).

## 2026-11-12 – The owner's room locks itself (master, the owner's decision)

The owner's words: "make an open/locked lock interface on the owner's room to lock it again when inside. if it stays open for
more than 3 idle minutes close it. after 30 idle seconds send a floating message warning, leave a stay unlocked switch for
work for now." So: a visible lock in the room that locks it at once; every entry closes after 3 idle minutes (a visit from
someone else's account also after 30 minutes at most, the owner's own after 2 hours); a floating warning with a countdown
after 30 idle seconds; a "stay unlocked" switch that lifts the idle limit, offered only from the owner's own account.
The master's addition: messages to everyone only from the owner's own account (a visit cannot send them). Built by
ai-features in the room (`server/admin.ts`, `server/admin-rules.ts`, `public/admin/`). Status: Decided (the owner), in progress.

## 2026-11-12 – The room's lock (ai-features, the owner's words; one point the master's)

The owner: an open/locked lock in the room that locks it again at once; three idle minutes close it; a floating warning
after 30 idle seconds; a "stay unlocked" switch for working sessions. So: `admin-rules.entryAlive` – 3 idle minutes for
every entry, 2 hours at most from the owner's own account and 30 minutes on someone else's; "stay unlocked"
(`admin_entries.stay`, COLUMNS) lifts only the idle limit, and only from the owner's own account (the master's
suggestion: never on someone else's device). The page pings the server on any action (at most every 20 seconds), shows
the warning with a countdown after 30 seconds (any action hides it), and a lock button (🔓 פתוח · נעילה) that ends the
entry at once. Messages to everyone stay own-account only (the master's addition). Routes: `/api/admin/ping`,
`/api/admin/stay`. Status: done on `ai-features`.

## 2026-11-12 – The AI allowance: the family free, new accounts on an opening gift, own keys (ai-features, the owner's decision)

The owner: new users simply use the app on the credit they were given, with no notice; they connect their own
service or buy credit in the app's settings, "חיבור לשירותים"; the owner's family has no limit at all, on the owner.
- **Who is limited**: only a row in `ai_allowance` with `limited = 1`. A member with no row – everyone invited until now,
  and everyone the owner invites – is family. The room's members table has a switch per member (the owners cannot be
  limited). A new account from an invitation is started with `startTrial(env, email)` (`server/credits.ts`): limited, with
  a one-time trial grant of `credits.trial_ils` (a setting, ₪1.5) in dollars of real AI cost.
- **Grants** (`ai_credits`): a source each – trial, purchase, gift; none expire; spent gift first, then trial, then purchase
  (`server/credits-rules.ts`, 24 tests in `server/test-credits.mjs`). The balance is the grants less the real cost
  (`costOf`) of what the account used since it started, not counting what went with its own key.
- **Enforcement, in the master's files (small; please review every line)**: `server/meter.ts` – before each request to
  Claude or Gemini, `gate()`: a limited account with nothing left gets `402 ai_credit_needed`; whoever connected their
  own key has the request sent with it (`x-api-key`, `x-goog-api-key`) and the row marked `own_key`. `server/ai.ts` –
  `aiJson` returns that 402 when any provider was refused for credit (the Anthropic SDK wraps it in its own error).
- **Own keys** (`user_ai_keys`, sealed with the vault key): Claude and Gemini are real – checked with the provider (listing
  the models, free) before they are kept. ChatGPT and buying credit are placeholders ("בקרוב"): no OpenAI path, no payments.
- **Appended**: tables `ai_allowance`, `ai_credits`, `user_ai_keys`; column `ai_usage.own_key` (COLUMNS); five routes
  (`/api/me/ai`, `/api/me/ai/keys`, `/api/admin/allowances`); a setting `credits.trial_ils`. The cost report and the room
  leave out own-key rows (they cost the owner nothing).
- New pages and files: `public/settings/` (הגדרות: the account, and "חיבור לשירותים", `#services`), `public/assets/ai-invite.js`
  (`H.aiInvite()`: the invitation when the AI says no for credit).
- **For the master** (proposed): `common.js` – in `api()`, on `402 ai_credit_needed` call `H.aiInvite()` (load
  `/assets/ai-invite.js`), so every AI button invites instead of erroring; the user menu could open `/settings/` (it has
  logout too); `admitMember` for invitation guests calls `startTrial`; `test:credits` in `npm test`.
- **For design**: `.st`, `.st-account`, `.st-services`, `.st-service`, `.st-key`, and `.ai-invite` (the modal) – unstyled.
- **Who sees amounts** (the owner, via business): only an account that bought credit or got a gift sees its balance, a
  cost estimate, or a gift's note (`credits-rules.showsAmounts`); on the trial alone the settings page says nothing until
  it runs out, and then only invites. The estimate and the gift's note follow this rule when they are built.
Status: done on `ai-features`; the gifts in the room come after guest sign-up opens.

## 2026-11-12 – החדר של האוהל: the owner's room, entered with the owner's biometric (ai-features, at the owner's request)

The owner's easter egg behind the moon (`/admin/`), rebuilt as the back door to the app's settings:
- **Entering**: on any device, with whoever is signed in there, the owner proves who they are with their own passkey
  (fingerprint, face, Windows Hello; on someone else's device the browser offers the owner's phone through a QR code).
  The entry is bound to that device's session: 15 minutes from the last action, 2 hours at most. The owners are the
  emails in `OWNER_EMAIL` (never written in code). The moon's written word (moon-secret branch) is replaced by this.
- **From the owner's own account**: a dashboard on top (income, expenses with the metered AI, net, a month now; the app's
  numbers), money (income and expenses by hand, once or monthly, in ₪ or $), the app's settings, members, messages to
  everyone, special features per person, הרשאת־על (a member who may enter with their own passkey: all but naming
  supers), the AI's cost and the room's own log. **From someone else's account**: only that person's special features,
  a message to everyone, and the app's numbers – no money, settings or members.
- **Appended**: tables `admin_entries`, `admin_audit`, `admin_ledger`, `app_settings`, `admin_supers`, `admin_messages`,
  `message_reads`, `user_features`; 21 routes (`/api/admin/…`, `/api/messages…`, `/api/me/features`).
- New files: `server/admin.ts`, `server/admin-rules.ts` + `server/test-admin.mjs` (24 tests), `server/settings.ts`
  (`setting(env, key)`: any module may read one), `public/admin/admin.js`, `public/assets/messages.js`. `public/admin/index.html`
  is rewritten (a page with no owner in the table; its inline styles stay until design gives it a stylesheet).
  `server/vault/index.ts` exports `newChallenge` and `takeChallenge`. Settings already wired: whether gatherings may be
  made and how long their link lives, whether calendar links answer, an AI monthly budget (a warning), the dollar's rate.
- **For the master** (proposed):
  1. `common.js`: load `/assets/messages.js` after sign-in, so the owner's messages show on every page;
  2. an entry "from any page": e.g. a long press on the logo in the app bar opens `/admin/` (the room asks for the
     biometric itself) – in `common.js`;
  3. `/api/members` and `/api/usage` still need only `requireOwner`; they could also require the room to be open
     (`requireAdmin` from `server/admin.ts`);
  4. `server/ai.ts` could read `setting()` – the models (`ai.claude_model`, `ai.gemini_model`) and a hard stop at the
     monthly budget – I will add those settings when you agree;
  5. `test:admin` in `npm test`; the moon-secret branch is updated (no written word; straight to the room).
- **For design**: the room's styles are inline in `public/admin/index.html` (`.ad*`); it is checked at 375 px and desktop.
Status: done on `ai-features`.

## 2026-11-12 – The AI limit's scope: new accounts only, trial credits used silently, today's family unlimited (business)

**Decision** (the owner, relayed by the master):
- The AI limit applies to new accounts only.
- A new account simply starts using AI on its trial credits, with no message that it is working on credit.
- Connecting one's own AI service, or buying credits, lives in the app's settings under "חיבור לשירותים".
- Today's family members, the first users, have no limit at all, at the owner's expense.

The owner's words: "אני רוצה שמשתמשים חדשים באפליקציה פשוט יתחילו להשתמש בה על חשבון הקרדיט שקיבלו מתנה באופן
streamline בלי הודעה שהם עובדים על קרדיט ... לגבי בני המשפחה שלי ... איני רוצה שתהיה הגבלת שימוש כלל, על חשבוני."

**Why:**
- New users get a smooth start.
- The family is the beta, and the owner funds it.

**Affects:**
- ai-features: the allowance applies only to accounts created from now on, and nothing is shown while trial credits
  last. When they run out, the inviting AI buttons (an earlier decision) point to "חיבור לשירותים".
- design: the "חיבור לשירותים" section in settings.
- master: the order of the work, which the master set as: the room merge, then the allowance and ledger, then guest
  sign-up, then gifts.

**Status:** Decided (the owner).

**Refined by the owner (relayed by the master, same day):**
1. **Nobody is marked "unlimited" yet.**
   - A per-member "unlimited" switch in the owner's room lets the owner mark people later.
   - The limit applies only to accounts created from now on. Accounts that exist today are not limited.
2. **"חיבור לשירותים" in this round:**
   - Connecting one's own Claude or Gemini API key works for real. This is pricing.md's option ב, BYOK.
   - Buying credits stays a placeholder.

   The MCP connector (`docs/business/integrations.md`) is still the later path for people who have a subscription but
   no API key.

**Settled by the owner (same day):** business decision 2 shows a cost estimate before an expensive AI action, and the
gift decision sends the recipient a note.
- Both show only to users who have bought credits or received a gift.
- Trial users see neither, until their trial credits run out and the inviting AI buttons appear.
- Affects ai-features.
- Status: Decided (the owner).

## 2026-11-12 – The owner can gift credits to chosen users from the admin page (business)

**Decision:** an owner-only action on the admin page (the moon's secret, an easter egg) gives credits to a chosen user,
at the owner's expense.
- They are ordinary credits marked with the source "gift", spent before purchased ones. They never expire and cannot be
  refunded or transferred.
- The recipient gets a note, for example "קיבלת 200 קרדיטים מתנה מהאוהל".
- A grant above ₪20 of AI cost asks for a second confirmation. The admin page shows this month's gifts and what they
  really cost.
- A gift costs the owner only the real AI cost. It is not revenue and stays outside 30/30/30/10 and the tithe.

**Why:** the owner wants to treat chosen people; the confirmation and the monthly total protect against a typo.

**Affects:**
- ai-features: a credits ledger with a source on each grant (trial, purchase, gift), gift spent first, and the
  recipient's note.
- master: the owner-only admin action, written to the audit log.
- design: only if the easter egg gets a look of its own.

**Status:** Decided (the owner). It comes after the AI limit for new accounts, which creates the ledger. Details:
`docs/business/pricing.md` 6a, "קרדיטים במתנה מהבעלים".

## 2026-11-12 – Guests can join once new accounts are AI-limited; the beta's stop condition is updated (business)

**What changed:** the owner decided that an invitation does not admit guests until AI limits or credits exist (master's
entry below). That makes the viral coefficient in business decision 10 unmeasurable for now.

1. **New accounts get no server AI beyond the one-time trial credits (about ₪1–2 of AI cost). Once that limit exists,
   an invitation may admit guests.**
   - Why: it is the fastest way to open the viral loop without waiting for purchases and packs. The free core has no
     server AI anyway (the vision), so this only brings it forward.
   - Affects:
     - ai-features: a per-account AI allowance and trial credits, with no purchase flow needed yet; AI buttons invite
       the user to connect their own AI or use credits.
     - master: admitting invited guests when the limit is in place.
   - Status: Decided (the owner). The order of the work is the master's call.
2. **Update to business decision 10: until guests can join, the three-month check uses the RSVP rate and gatherings
   per family instead of the viral coefficient.**
   - The interim targets: at least 50% of opened links RSVP, and at least one gathering a month per active family.
     Both are already counted in `gathering_stats`.
   - Why: the original condition cannot be measured while guests have no accounts.
   - Affects: none (measurement only).
   - Status: Provisional. The viral coefficient (0.3 or more) returns to the condition once guests can join.
     **Condition met 2026-11-12 (c892af5):** guests can now join from an invitation, and real sign-ups are counted in
     `gathering_stats` as kind "signup". The viral coefficient is back in decision 10's check, alongside the RSVP rate and
     gatherings per family.

Details: `docs/business/gathering.md` section 7, `docs/business/plan.md` stage 4.

## 2026-11-12 – The family gathering's look (design)

`public/gather/gather.css` (new, design's), linked from `public/gather/index.html` and `public/gather/invite/index.html` (one
line each). The invitation, phone first: a card you could hold – the tent drawn on top, the day and the place as chips,
who is coming on a soft olive field – then one clear answer (a round − n + stepper, "מגיע/ה" full width), what each one
brings as rows with their own button, a reminder, and the comments as speech bubbles; on a PC the same column in the
middle. The host's page: the same cards, the share buttons, the invitees as chips (✓ for those who answered), the form
with labels above even fields. Only the hub's tokens; checked at 375 and 1280 px, by day and at night, audit clean.
For ai-features (optional): a `data-kind` on `.ga-kind` would let meat, dairy and parve each have their own colour.
Status: done (on `design`).

## 2026-11-12 – The family gathering merged and live; guests stay without accounts (master)

Merged ai-features' gathering (07c4511) after review: the invitation routes answer without a session, keyed by the link
(see `docs/security.md`). Done for its proposals: `test:gather` in `npm test`; a מפגש משפחתי tile in `public/tools/index.html`
(next to לוח שנה, with the family icon; design may give it its own). The owner's decision on the third proposal: **an
invitation does not admit guests into the app yet** – they keep answering without an account, because each new account
would use AI on the owner's keys; revisit when AI limits or credits exist (business's sign-up metric waits until then).
Status: Decided (the owner).

## 2026-11-13 – Goal management, spec v1: approved for building (vision, the owner)

The owner specced the goal-management tool (ניהול מטרות, `public/tools/tasks/`) with the vision session, answer by answer, and
said "summarize and send". The full spec is in `docs/vision/goals.md`, section "האפיון, גרסה 1".

**Purpose:** consistency and motivation, not just planning. The test is whether people come back to it tomorrow.

**Structure:**
- A goal (the "why"), then processes (each with a checklist), then small daily steps.
- Goals by length: short (under a day), regular, and long-term (over a year).

**Screens:**
- A dashboard of goals and their path is the entry point.
- **New goal:**
  1. Write or record the goal and its "why".
  2. Choose the length and an optional deadline.
  3. The tool analyses the goal into processes, from a template by goal type, or with AI (✨). It can be edited.
  4. The first three steps of the first process.
  5. The rhythm: days and time, including the rest day.
- **Today:** two or three small steps.

**Motivation:**
- Visible progress: a checklist per process, and the whole goal filling up.
- Forgiving consistency ("4 of 7 this week").
- A rest day by each user's tradition, which never breaks a streak and is rewarded.
- A one-minute weekly review on the day before the rest day.
- A "נתקעתי" button that breaks a step down to a 5-minute version.
- The "why" comes back after two days with no step, with no scolding.

**Badges:** the owner's list, in the spec.
- Embroidered patches in the tent's style.
- How to earn each one shows on hover or tap; secret badges show only a silhouette.
- Each tradition gets a parallel rest-day badge with its own name.

**Family and friends:**
- Goals are private by default, and sharing is always a choice.
- Following a friend's journey; advice with likes.
- Shared family goals with roles.
- Family templates: a finished goal's path is shared as a template.
- The existing rules apply: friends connect only with approval; no messages outside the family under 12.

**Hub links:** a step can become a calendar event, a shopping item, a research or a gathering.

**Without AI:** templates, guided questions, and speech-to-text in the browser.
**With AI (✨):** analysis, better transcription, "stuck" suggestions and adjusting the plan.

**Data and first use:**
- Goals are stored per user on the server.
- The first goal is הָאֹהֶל itself (dogfooding).

**Affects:**
- **ai-features:** the server module, the tables and routes, appended and logged here, and the page's JavaScript.
- **Design:** the dashboard, Today, the new-goal flow, the badges' art (through the image tool), the patches, the silhouettes.
- **The master:** schedules the work; notifications or push, if they need the shell.

Not in v1: the research assistant, specced next in vision.

Status: Decided (the owner).

## 2026-11-12 – A new tool, "עוזר מחקר", alongside goal management (vision, the owner)

**Decided:** a new tool, the research assistant (עוזר מחקר). It offers:
- focused web search;
- saved notes;
- research projects that are kept in progress;
- suggestions for directions to continue and help with tasks.

It goes alongside goal management, and the owner and the vision session spec both tools together (`docs/vision/goals.md`).
Nothing is built before the owner confirms the spec.

It is a general tool, unlike the Torah researcher (`server/research.ts`), but the two may share an engine.

By the rule "Every AI tool also has a useful version without AI", its plain version is a research folder (notes, saved
links, progress, and search that opens in an ordinary search engine). Focused search and suggestions are the ✨ upgrade,
through the user's own AI or credits.

**Affects:** vision (the spec) now; ai-features and design once the spec is confirmed.

Status: Decided (the owner).

## 2026-11-12 – Every AI tool also has a useful version without AI (vision, the owner)

**Decided:**
- Every tool that uses AI also has a version that is not smart but still useful, for users with no AI connection and no
  credits. It can be built from templates, search, rules or forms.
- The invitation to connect an AI or buy credits comes in addition to that version, never instead of it.

This extends the earlier decisions: "The app works without AI, in a simpler version" and "A button for an AI ability
never looks broken" (the entry "Product direction").

**Affects:**
- ai-features: every AI tool, existing and new, including the recipe book, the diets and the weather.
- Design: how the two versions look side by side.
- Vision: the goal-management spec.

Status: Decided (the owner).

## 2026-11-12 – The PC guide and the mail organizer: the simple path, through the user's own AI (vision, the owner)

**Decided:**
- Both tools are developed on the simple path that ai-features assessed, about half a day each.
  - **The PC guide:** a copy button for the rules, a checklist with progress, a Mac variant, and a "how did it go" step.
  - **A public mail organizer:** like the PC guide, it runs on the user's own Claude with its Gmail connector, under our
    safety rules: label instead of delete, preview first, and an undo list.
- The family's current mail tool (`server/mail.ts`, on the owner's keys) stays as it is.
- Our own public Gmail tool is put off: it needs the restricted `gmail.modify` scope, Google's paid security assessment,
  and our AI.

**Why:** the owner's condition: "if it is simple, develop it; if it is very complex, keep it for later". It fits
`closed-questions.md` 12 (in the public version, only through the user's own agent).

**Affects:** ai-features.

Status: Decided (the owner).

## 2026-11-12 – The family tree opens freely after the first sign-in; the ring and the top bar are rebuilt (vision, the owner)

Three decisions, confirmed by the owner one sentence at a time. The rest of the owner's notes from the same list are
instructions, sent in the vision session's batch 2 (`docs/vision/batch.md`).

1. **The family tree opens without asking again.** After the first sign-in on a device, the family tree opens without a
   passkey. Only special actions ask each time: opening sealed vault documents, changing privacy, linking trees, deleting
   and exporting.
   - Affects: the master (the vault's security: where the key lives, and the trade-off; explain it to the owner and
     propose a safe way) and ai-features (`family.js`, `server/vault/index.ts`).
2. **The home page's ring around the campfire has only three fixed items:** the family tree, tools and settings.
   Everything else is pinned to the ring by each user with a long press in the tools box, which holds every menu. The
   choice is saved per user (`H.prefs`).
   - Affects: ai-features (pinning and saving), design, the master (`public/index.html`).
3. **The top bar keeps five items:**
   - בית;
   - עץ המשפחה;
   - ניווט: a dropdown to the site's parts;
   - כלים: a dropdown to every tool;
   - הגדרות: a gear icon.
   - The phone's bottom tab bar has the same five items (the owner).
   - Affects: the master (`NAV` in `common.js`) and design.

Status: Decided (the owner).

## 2026-11-12 – One visual style for everything; images are made through the Gemini API (vision, the owner)

**Decided:**
- All of the app's graphics keep one style: the hand-drawn illustration of the tent (bold dark ink outlines, warm earthy
  colours, painted texture, no realistic lighting), as in `docs/design/family-tree-art.md`.
- Anything that departs from it is redrawn in that style. The first case is the campfire in the middle of the home
  page's ring: both its drawing and its motion fall short (`campfire-strip.webp` has 16 frames in 1.5 s and looks jumpy).
- The owner approved that design may make images itself through the Gemini API (the project's key, a few cents per
  image), with `public/assets/tent.webp` as the style reference, instead of the owner generating them by hand.
  The owner chooses between the versions.
- Split, at the master's note: design writes the prompts and owns the style and the choice of versions. The
  mechanism that calls Gemini's image API spends AI on the owner's key and touches the server (an endpoint, the meter),
  so it is built by ai-features or the master, as the master assigns.

**Why:** the app is shown to the family only when it is ready and looks good. A photographed fire or a flat line drawing
would clash with the painted scene.

**Affects:** design (the art, the image pipeline, the fire's animation). The master: the fire's markup and CSS are in
`public/index.html`.

Details: `docs/vision/style.md`. Status: Decided (the owner). Handed over in the vision session's batch.

## 2026-11-12 – A fifth area: Vision & conversation, חזון ודיבור (master, at the owner's request)

A session for flowing conversation with the owner about the project. When a decision takes shape, it confirms it with the
owner in one sentence, records it here, and messages the areas that act on it (copying the master). Worktree
`M:\Claude Code\Helper-vision`, branch `vision`, owns `docs/vision/`; brief: `docs/areas/vision.md`. Status: done.

## 2026-11-12 – Fifteen business decisions, approved by the owner (business)

The owner approved all fifteen recommendations from the business session's self-check. Details:
`docs/business/closed-questions.md` (round two). Each item lists which areas it affects.

1. **Credit packs ₪5 / 10 / 20 / 50, with the same credits per shekel in every pack.**
   - Why: ₪5 is the safe no-loss minimum. An equal rate stops people buying many small packs.
   - Affects: ai-features (the credits ledger), design (the pack picker).
   - Status: Decided.
2. **Credits are deducted by each action's metered cost (`costOf`), with an estimate before an expensive action.**
   - Why: every use stays inside 30/30/30/10, and nobody is surprised.
   - Affects: ai-features, master (`server/prices.ts`, `server/meter.ts`).
   - Status: Decided.
3. **App store vs web: the same price everywhere, with bonus credits on the web.**
   - Why: it is simple to explain and steers buyers to the cheaper channel.
   - Affects: none until the store stage.
   - Status: Decided.
4. **Free download from the stores, with in-app purchases.**
   - Why: this is the standard model in both stores.
   - Affects: master (store packaging, later).
   - Status: Decided.
5. **At launch, the web and PWA only, through an Israeli payment provider with cards and Bit; the stores come later.**
   - Why: no store commission, and Bit suits small sums.
   - Affects: master (the payment integration).
   - Status: Provisional. The provider is chosen after comparing fees, the fixed fee per transaction above all.
6. **Purchases per user (credits, companion packs) or per family (the family's own companion, the album).**
   - Why: every user is an endpoint, and shared things belong to the family.
   - Affects: ai-features, design.
   - Status: Decided.
7. **Storage: files in the user's Drive or iCloud, small encrypted family text on our server.**
   - Why: no storage cost for the owner, and family sharing stays simple.
   - Affects: master, ai-features.
   - Status: Decided.
8. **The gathering is built on the current Worker; local-first comes later.**
   - Why: it is the fastest way to a beta.
   - Affects: master, ai-features.
   - Status: Decided.
9. **The gathering's first version contains what `docs/business/gathering.md` section 3 lists.**
   - Why: it is the smallest scope that delivers the first minute.
   - Affects: ai-features, design.
   - Status: Decided.
10. **The beta is in Hebrew, in the owner's extended family; Arabic follows as a second wave with a partner from Arab
    society.**
    - Why: prove the viral loop first, and earn trust in the second community properly.
    - Affects: master (translation timing), design.
    - Status: Provisional. Revisit after three months: stop and rethink if the viral coefficient is below 0.3 and fewer
      than two members of an average family are active each week. **Updated 2026-11-12:** until guests can join, the
      RSVP rate and gatherings per family stand in for the viral coefficient (see the entry at the top).
11. **The north-star metric is family members active each week, per family; the secondary one is gatherings
    coordinated.**
    - Why: it measures daily use and the owner's goal of meeting.
    - Affects: ai-features (anonymous counts).
    - Status: Decided.
12. **Every price is based on the providers' 2027 prices.**
    - Why: Gemini 3.8 Flash and its TTS double in price on 2027-01-01.
    - Affects: master (`server/prices.ts` already holds them).
    - Status: Decided.
13. **A relative may add a relative without approval, with a name and a relation only; the added person can hide or
    block.**
    - Why: it keeps adding easy while protecting people who have not joined.
    - Affects: ai-features (tree privacy).
    - Status: Decided.
14. **Matrix, on an Apache-2.0 homeserver, is the messaging base once the full network comes.**
    - Why: it is mature and end-to-end encrypted, and its licence does not force us to publish our code.
    - Affects: master, ai-features (later).
    - Status: Provisional. Re-checked when the full network is started.
15. **No business is registered during the beta; there is an accountant meeting before the first sale.**
    - Why: the beta has no revenue.
    - Affects: none.
    - Status: Provisional. Exempt dealer, licensed dealer or a company is decided at the meeting.

Also decided: store ratings and download counts are not researched for now (the owner).

## 2026-11-12 – The family gathering, version one (ai-features)

Built from business's brief (`docs/business/gathering.md`, the owner's answers 8–11 in `closed-questions.md`): a member
makes a gathering (date, hour, place and map link, a note, the food rule: kosher or halal); one link goes to WhatsApp;
whoever opens it, with no sign-in, sees only the gathering, the first names of who is coming, what they bring, and the
comments. They answer (yes, maybe, no, with how many), take or add something to bring – a member finds it in their own
grocery list (`kitchen.addGroceries`, source "מפגש: …", taken off again if they give it back) – and add it to Google, Apple
or Outlook (a link, or an .ics with reminders a day and two hours before). The page warns of Shabbat, a holiday or a fast
(Hebcal for that day, with the host's city's times) and of meat and dairy together at a kosher gathering. The host can
draw the invitees from the tree (with the vault open; the tree's privacy applies; the list stays the host's), sees
ideas from the family's round days, and the beta's anonymous counts (opened, answered, signed in from an invitation).
The link ends the day after the gathering, or when the host closes it; gatherings show in the family calendar.
- **Appended**: tables `gatherings`, `gathering_rsvps`, `gathering_items`, `gathering_comments`, `gathering_stats` in
  `schema.sql`; eighteen routes `/api/gather…` at the end of `functions/api/[[path]].ts` (the `/api/gather/invite/:token…`
  ones answer without a session: the link is a 32-character key, after the `#` so it stays out of logs; only its hash and a
  sealed copy for the host are stored; guests' writes are rate-limited by a fingerprint of their address).
- New files: `server/gather.ts`, `server/gather-rules.ts` and its tests `server/test-gather.mjs` (37 tests), pages
  `public/gather/` (the host) and `public/gather/invite/` (the guest; no app bar, no companion).
- **For the master** (proposed):
  1. a `test:gather` script in `npm test`;
  2. a tile for מפגש משפחתי in the hub (the tools folder, `public/tools/index.html`, or the home page's ring) – for now it
     is reached from לוח השנה ("🎉 מפגש משפחתי ביום הזה") and `/gather/`;
  3. **sign-up from an invitation does not work yet**: `admitMember` lets in only invited members, so a guest who taps
     "כניסה עם Google" is turned away. Business counts sign-ups from invitations as the viral metric – the owner should
     decide whether an invitation admits its guests (e.g. as members of a new household of their own).
- **For design**: the pages use `.card`, `.btn`, `.notice` and new unstyled classes – `.ga`, `.ga-head`, `.ga-row`, `.ga-list`,
  `.ga-ideas`, `.ga-share`, `.ga-coming`, `.ga-invitees`, `.ga-chips` (`li.on` = answered), `.ga-items`, `.ga-list-items`,
  `.ga-kind`, `.ga-comments`, `.ga-inline`, `.ga-acts`, `.ga-two`, `.ga-form`, `.ga-pick`, `.ga-check`, `.ga-notes`,
  `.ga-invite`, `.ga-rsvp`, `.ga-count`, `.ga-total`, `.ga-cal`, `.ga-join`, `.ga-fine`, `.ga-stats`. Checked at 375 px and
  desktop, light and dark: no overflow, no nameless controls, no text under 3:1 – but it looks plain.
Status: done on `ai-features`.

## 2026-11-12 – Merged into main: ai-features (stage 2, the calendar link) and design (master)

Merged with the owner's approval; the master's part of the proposals below is done:
- `package.json`: `test:forest`, `test:calendar`, and `npm test` running all four suites; `CLAUDE.md` names `kin.ts` and `hebdate.ts`
  (and their tests) as ai-features' files, and the merge checks are `npm run typecheck`, `npm test` and the page audit.
- `server/vault/backup.ts`: the nightly snapshot (version 2) also holds `family_links`, `family_bridges`, `family_roles` and
  `family_households`; `tools/vault-restore.mjs` writes the relationships into `people.json`.
- `docs/security.md`: linked trees, and the calendar link that answers without a session.
- `public/index.html`: the sun and the moon behind the tent's picture take their taps again (ai-features found it: the picture's
  rectangle covered them).
- Kept design's line in `common.js` (the tree in the main menu) and the rename in the master's files; `CLAUDE.md`'s title says הָאֹהֶל.
- The owner's answers: the calendar link includes the family tree **only when the person ticks it** (the box starts unticked, and
  the server takes the tree only on `tree: true`; changed in `calendar.js` and `calendar.ts` by the master); the account is on the
  **paid Workers plan**, so a feed's 6–10 ms of CPU is fine; `business` goes into main with this push.
Status: done.

## 2026-11-12 – The calendar as a live link for Google Calendar (ai-features)

At the owner's request (chosen over a two-way sync through Google's calendar API, which would need a new Google
permission): each person can make a private link to their לוח שנה, which Google Calendar (or Apple's, or Outlook)
subscribes to "from URL" and keeps up to date by itself. It holds the holidays (Hebcal, by the person's choices in the
page), the family's days, and – if they choose – the birthdays and memorial days from the tree, with the tree's privacy
for that person. Only a hash of the link is stored; a new link replaces the old one, and either can be cancelled.
- **Appended**: table `calendar_feeds` in `schema.sql`; four routes at the end of `functions/api/[[path]].ts`:
  `GET/POST/DELETE /api/calendar/feed` and `GET /api/calendar/feed/:token` (no sign-in: the link is the key; rate-limited).
- New files: `server/hebdate.ts` (the Hebrew-date rules on the server, the same days as the page) and its tests
  `server/test-hebdate.mjs` (36 tests, `node server/test-hebdate.mjs`, including a day-by-day check against the page's algorithm).
- **For the master** (proposed): a `test:calendar` script and the merge checks; `docs/security.md` could note that
  `/api/calendar/feed/:token` answers without a session (a 32-character random key, hashed in the database).
  Building a feed takes about 6–10 ms of CPU, then it is cached until the data changes: fine on the paid Workers plan;
  on the free plan (10 ms) the first build after a change could be cut off – which plan is the account on?
- **For design**: `.cal-link` (the new card, after `.cal-sync`), `.cal-link-url` (the read-only link field), `.cal-check` – no styles yet.
Status: done on `ai-features`.

## 2026-11-12 – The family tree, stage 2: heads, links between trees, privacy (ai-features)

The owner's decisions are in `docs/family-forest.md` ("Stage 2"). What other areas need to know:

- **Appended** (no existing line changed): tables `family_bridges`, `family_roles`, `family_households` in `schema.sql`;
  columns `family_people.privacy` (TEXT, JSON) and `family_people.anonymous` (INTEGER) in `COLUMNS`; twelve routes at
  the end of `functions/api/[[path]].ts`: `/api/vault/roles`, `/api/vault/household`, `/api/vault/people/:id/privacy`,
  `/api/vault/bridges` (+ `/:id/approve`, `/:id/consent`, `/:id/decline`, `DELETE /:id`), `/api/vault/forest`, `/api/vault/related`.
  The household's name is in `family_households`, not in `households`: a row there makes the kitchen skip seeding the groceries.
- New files: `server/vault/kin.ts` (the pure rules) and its tests `server/vault/test-kin.mjs` (71 tests, `node server/vault/test-kin.mjs`).
- **For the master** (proposed):
  1. add `"test:forest": "node server/vault/test-kin.mjs"` to `package.json` and to the checks before a merge (or move the
     test to `tools/` if you prefer it there);
  2. `server/vault/backup.ts` snapshots only `family_people` and `vault_items`: the nightly copy should also hold
     `family_links` (already missing since stage 1), `family_bridges`, `family_roles` and `family_households`;
  3. the "Who owns what" table could name `server/vault/kin.ts` and `server/vault/test-kin.mjs` as ai-features'.
- **For design**: new parts of the tree page with no styles of their own yet – `.fv-privacy` (four selects and the
  anonymous switch, in `.fv-two`), `.fv-trees` (a person's links to other trees), `.fv-links` / `.fv-links-part` (the
  "עצים מקושרים" window), `.fv-user` (user / not a user, under the name). For stage 3 the forest view can be drawn from
  `GET /api/vault/forest`: `{households: [{id, title, distance}], people: [{id, household, name, sex, anonymous, details, hidden}],
  links: [{type, a, b, kind, status}], same: [[id, id]]}` – ids outside the viewer's household are opaque; `same` pairs are
  one person in two trees; a hidden person is named "קרוב/ת משפחה" and still has their links.
Status: done on `ai-features` (proposals 1–3 for the master: proposed).

## 2026-11-12 – The home page's sky: a horizon across the tent, and the sky's own room (design, at the owner's request)

In `public/index.html` (master's file), as the owner asked: the greeting stands alone on top; under it the sky has its own
room (`--sky-room`: 132 px on a PC, 108 on a tablet, 84 on a phone) and then the tent, at its old size (the page is a
little longer). The horizon is now across the tent at the height of its eaves (46.5% of the picture): the sky ends there
with a short soft edge, the stars are only above it and thin out toward it, and the sun and the moon sink into it instead
of sliding down behind the tent. The orbit reaches 12% of the tent's width beyond each side, and its top is just under the
greeting, so at noon the sun passes over the tent's peak. The old "greet-under" layout (the greeting moved under the tent
when the arc could not pass it) is gone. Status: done (on `design`).

## 2026-11-12 – Night is a deeper blue, almost black (design, at the owner's request)

The owner did not like the night colours and asked for a darker blue, nearly black, like the night. The night tokens in
`public/assets/base.css` changed (both dark blocks): `--bg` #111a2c → #070b14, `--card` #18233a → #0e1422, `--line`
#25314a → #1a2335, `--line-strong` #34415e → #28344c, `--primary-ink` → #070b14, `--glass` → rgba(14, 20, 34, .88),
`--tint` #22344f → #14203a, and `--text` #e7e1d3 → #dfd9cb (a touch softer, so the deeper ground does not glare).
The two hard-coded copies follow: the night paper in `public/news/news.css`, and the browser bar's colour (`theme-color`)
in `public/assets/common.js` (master's file). Any area that hard-codes the old night navy should use the tokens. The page
audit at night (9 main pages, 375 and 1280 px) is clean. Status: done (on `design`).

## 2026-11-12 – בידור: a recommendation flips open into the whole page (design, at the owner's request)

The owner asked for the בידור cards to flip and grow into a large window, as the recipe book's cards do. Design used the
shared sheet (`/assets/sheet.js`, `sheet.css`, now loaded by `public/fun/index.html`). In `public/fun/fun.js` (ai-features):
`card(p, tint, cat)` takes the tab; a tap anywhere on a recommendation (not on a link) or on its title (a button, for the
keyboard) calls `openPick`, which opens the sheet with the big picture, the tags, what it is, "למה כדאי", where to find
it, a YouTube search (trailer, listening or live clips by tab) and the full review. The picture on the card is no longer a
link out. In the viral tab (מצחיק) a picture (not a video) is a button too and opens large in the sheet's `large` panel;
its videos still play in the card. Styles in `fun.css`. Status: done (on `design`).

## 2026-11-12 – The app is called הָאֹ֔הֶל (design, at the owner's request)

The owner renamed the app from העוזר המשפחתי to **הָאֹ֔הֶל**, everywhere in the app. Design made the change across areas:
- The name itself, with its vowels: the top bar and its label, the home page's title and heading, `manifest.json` (`name`
  and `short_name`), the privacy page, the overlay's title, the desktop tray's tooltip, the passkey's display name
  (`NAME` in `server/vault/index.ts`; existing passkeys are not affected, only the name shown when one is made).
- In running text, plain **האוהל** with its prepositions (מהאוהל, באוהל, לאוהל): logout, the theme toast, the desktop
  menu, "connected" page in `server/core.ts`, music, mail, calendar, notes, admin, the family tree's "משתמש באוהל".
- In other apps (the Spotify device, the exported calendar's name) also plain **האוהל**: vowel marks may not show there.
- Not renamed: העוזר החכם (the AI), the companion ("לחצו על העוזר"), and the docs (`CLAUDE.md`, `README.md`: master's call).
ai-features: your stage 2 strings on `ai-features` (e.g. "משתמש/ת בעוזר" in `.fv-user`) need the same change. Master: the
Google sign-in screen shows the name set in the Google Cloud console – the owner changes it there. Status: done (on `design`).

## 2026-11-12 – עץ המשפחה in the main menu (design, at the owner's request)

The owner asked design directly to put the family tree in the main menu. One line in `public/assets/common.js` (the
master's file): `{ href: '/family/', label: 'עץ המשפחה', short: 'משפחה', icon: 'family' }` in `NAV`, right after בית,
so it is in the PC's top menu and in the phone's tab bar (now eight tabs; all fit at 375 px). `base.css`: the top menu's
names never wrap, and between 900 and 1099 px the gaps and the type are a little smaller so nine entries fit on one line.
Master: please keep the line when you merge `design`. Status: done (on `design`).

## 2026-11-12 – The owner's answers on money, privacy, media, the gathering, the product's limits and its name (business)

All thirteen answers are in `docs/business/closed-questions.md`. These are the ones the code will need.

**Working name: הָאֹהֶל ("the tent")**
- It is also a play on Arabic أَهْل, "family, kin". It is provisional until the owner has tried the product with
  their family.
- The business docs use it from now on.
- The master decides when and whether it replaces "העוזר המשפחתי" in `CLAUDE.md`, `public/manifest.json` and the UI.

**Money**
- VAT and the payment fee come off first; the rest is split 30/30/30/10.
- Trial: a one-time free credit per Google account, worth about ₪1–2 of AI cost.
- The smallest credit pack is the cheapest one that makes no loss, about ₪3 under current assumptions; ₪5 is
  proposed. Every pack gives the same number of credits per shekel.

**Privacy and the family**
- A relative who has not joined appears in the tree with a name and a relation only, until they join and approve.
- What part of the tree is visible outside the vault follows each user's privacy setting.
- Relatives can add each other. Friends send requests, and the receiving side must approve them.
- Links between families in the forest need both sides' approval. Users can block and hide.
- Children under 12 join only through a parent. They have no network of their own and no messages with anyone outside
  the family.

**Messages and media**
- No Matrix yet. Version one of the gathering has a comment thread and WhatsApp links.
- On the free tier, media stays on the server for 30 days, or until every recipient has downloaded it.

**The gathering**
- An invitation link shows the name, the date, the place and the first names of those coming. It expires after the
  gathering.
- Any registered user can create a gathering.

**Limits of the public version**
- Mail sorting and the PC guide work only through the user's own agent.
- Links instead of the Spotify player.
- The songbook holds only songs the family types in, or links to songs that are free online (no copying).
- Sefaria texts only where the licence allows commercial use.

Status: Decided (the owner, 2026-11-12). How and when each item reaches the code is the master's call.

## 2026-11-12 – The family gathering is the first tool to perfect and launch with (business)

The owner chose the family gathering as the tool that opens the door; everything else waits behind it. Brief:
`docs/business/gathering.md`.

**What it does:** an event with a date and place, an invitation by WhatsApp link, and RSVP with a headcount, with no
sign-in. It also has a "who brings what" list that feeds each person's own grocery list, an ICS add-to-calendar link, a
reminder, invitees suggested from the tree, and culture-aware notes (Shabbat and holidays, fasts, kosher or halal). The
gathering itself is always free.

**What the master and ai-features need to look at:**
- **A gathering crosses households.** Today everything is per `household`, so this needs guest access by link and an
  extended family.
- **Suggesting invitees needs part of the tree.** Names and relations would have to be available outside the vault,
  without unlocking it. Which parts is the master's decision, since it owns the vault's security.
- **Anonymous counts for the beta metrics:** link opened, RSVP, and sign-up from an invitation.

**The proposed order:** build it on the current Worker, and move to local-first later (`docs/business/plan.md`,
stage 3). The design of the invitation and the RSVP page belongs to design.

Status: Decided (the owner, 2026-11-12). The code gaps listed above are proposals for the master and ai-features.

## 2026-11-12 – Product direction: a free core, a family social network, a culture per user (business)

The owner set the direction (details in `docs/business/vision.md`):
- **Every user is an endpoint.** The goal is daily use by each person.
- **The social network is the family tree.** People connect as relatives, and the forest links families by marriage.
- **The culture follows each user's settings.** Jewish, Muslim or Christian: the calendar, holidays, content and food rules.
  The choice is independent of the language.
- **The interface is in Arabic, Hebrew and English.** Two right-to-left languages and one left-to-right, so the master
  needs to plan the translation infrastructure (UI strings and AI prompts).
- **Sharing covers everything:** messages, events, greetings, photos and media. The owner prefers to build on reliable
  open source rather than from scratch. The business proposal is Matrix with an Apache-2.0 homeserver, our own UI, and
  federation off (`docs/business/social-and-growth.md`); the technical choice belongs to the master and ai-features.
- **Personalization is free:** each user or family picks a palette, keeps its own recipe and song books, has a personal
  companion and a personal feed. Design owns the palettes.
- **The helper sits on top of the services people already use: Google, WhatsApp and their own paid AI.**
  - **For one person:** everyday tools, highly accessible, in the person's own language.
  - **For the family:** a meeting point to set and coordinate events, settle who brings what, and keep and share the
    family story.
  - **Proposals** (`docs/business/integrations.md`) for the master and ai-features: a remote MCP connector so the
    user's own Claude, ChatGPT or Gemini works on the family's data at no AI cost to the owner; an ICS calendar feed;
    WhatsApp share links; Google Photos Picker; Gmail only through the user's own agent, which may avoid CASA.
- **The app works without AI, in a simpler version.** Connecting the services a user subscribes to unlocks the rest.
  Most everyday tools already work without AI today (checked in `server/`, see `docs/business/integrations.md` 3a).
- **A button for an AI ability never looks broken when no AI is connected.** It invites the user instead, for example
  "Connect your Claude, ChatGPT or Gemini to import a recipe from a link", and also offers credits. For ai-features
  and design.
- **Credits on our server for users who do not want their own AI.** Credits never expire (the owner). The proposed
  mechanism (`docs/business/pricing.md` 6a–6d):
  - one credit is a fixed amount of real AI cost;
  - each action deducts credits by its metered cost (`costOf` in `server/prices.ts`), with an estimate shown before
    an expensive action.
- **The owner's pricing model for everything paid: 30% materials, 30% labour, 30% profit, 10% tithe.** This is a
  working assumption.
  - **Proposed:** VAT and the payment fee come off first, and only what remains is split.
  - **For credits:** the shopper's price is about 4.1× the AI cost on the web and 4.6–5.6× in an app store.
- **A free trial and packs from a few shekels.**
  - **Trial:** a one-time free credit per Google account, proposed at about ₪1–2 of AI cost.
  - **Packs:** for example ₪5 / 10 / 20 / 50, priced in shekels.
  - **Store vs web:** the same price everywhere, with bonus credits on the web; relevant only once the app is in the
    stores.

  Still to be set: the trial amount, the pack sizes, and the payment provider (Bit for small sums?).
- **The core is free for everyone.** Paid extras only: features that cost the owner money (server AI), family photos,
  a companion figure unique to the family, and companion packs.

What this means for the other areas: a free user must cost almost nothing. A new feature therefore runs on the device,
or from a shared cache, or sits behind payment. Nothing changes in the code yet. Prices, quotas and the paid catalogue
come after the AI measurement, around 2026-11-26.

Proposals for the owner and the areas:
- **ai-features:** a per-user culture setting, and family gatherings (calendar + invitations + who brings what + recipes).
- **design:** a companion unique to a family, and companion packs as purchasable items.

Status: Decided (the owner, 2026-11-12). The work for each area is a proposal until the master schedules it.

## 2026-11-12 – The dev server's port lives in wrangler.toml (master)

Answer to design's entry "`npm run dev -- --port N` fails in the area worktrees": `package.json` now runs plain
`wrangler dev`, and `wrangler.toml` has `[dev] port = 8788`. `npm run dev -- --port 8789 --inspector-port 9230` works
in a worktree (tested next to the running 8788). Areas: merge `main` into your branch to get it; ai-features moves back
from 8791 to its own 8790. Status: done.

## 2026-11-12 – The family tree's lines after a move: two small fixes in family.js (design → ai-features)

Seen in the tree (`public/family/family.js`, owned by ai-features), not fixable in CSS:
1. After a tap moves the centre to someone, the lines are measured in the next frame, while the FLIP glide is still
   running, so they stay where the cards *were* (a line ends on a card's corner, or in the air). Proposed: in `focusOn`,
   redraw the lines when the glides end, e.g. `Promise.all(anims.map((a) => a.finished)).then(() => connect(board, board.querySelector('.fv-lines')))`
   (and draw them at once with reduced motion).
2. The `ResizeObserver` is set up once, with the first drawing's `<svg>`; every later `draw()` makes a new one, so after the
   first move a resize no longer redraws anything. Proposed: let the observer look the layer up each time:
   `new ResizeObserver(() => { const s = board.querySelector('.fv-lines'); if (s) connect(board, s); })`.
3. Optional, styled already: give the path from the person in the centre up to their parents and grandparents its own
   `<path class="lineage">`; `family.css` draws it a little stronger in `--primary`.
Status: accepted – all three done by ai-features in 079b046 (branch `ai-features`); complete when the master merges
`ai-features` and `design`, which together draw the line of descent.

## 2026-11-12 – Design batch 1: the tree's look, the tools rack, the forest sketch (design)

- `family.css`: the tree's lines and card edges use two local properties, `--fv-line` and `--fv-edge` (mixed from
  `--primary` and `--line-strong`, so they read by day and at night); no shared token changed. Phone: the title with the
  clock, the two everyday actions side by side, the vault's actions as one row of small chips, the view switch and the
  search on one line. Wide screens (≥ 1024 px): bigger cards, more air between generations.
- `launcher.css`: the tool silhouettes in `/assets/tool-icons/` hang on a rail over the title of the כלים folder, CSS only.
  It finds the folder by `.folder:has(> .apps-grid[aria-label="כלים"])`, so whoever changes the tools folder's title in
  `public/tools/index.html` or the markup in `launcher.js` should keep that label (or tell design).
- `docs/design/forest.md` and `forest-sketch.svg`: first sketches for stage 3, and what the page will need from stage 2.
Status: done (on `design`).

## 2026-11-12 – `npm run dev -- --port N` fails in the area worktrees (design → master)

`package.json` has `"dev": "wrangler dev --port 8788"`, so passing another `--port` gives wrangler two ports and it exits.
Proposed: `"dev": "wrangler dev"` with `[dev] port = 8788` in `wrangler.toml` (the command line overrides it), or change
the documented command and the worktrees' `launch.json` to `npx wrangler dev --port 8789 --inspector-port 9230`.
Status: done (master, 104fb5b).

## 2026-11-12 – The project is worked on in parallel (master)

Four sessions, each in its own worktree and branch: master (`main`, `M:\Claude Code\Helper`), design (`design`,
`Helper-design`), business (`business`, `Helper-business`), ai-features (`ai-features`, `Helper-ai`). Ownership of
files, ports and the merge rules are in `CLAUDE.md` under "Working in parallel". Areas may append routes, tables and
columns for their own features and log them here; `public/sw.js` `CACHE` is bumped only by the master on merge.
The feasibility study moved to `docs/business/standalone-feasibility.md`. Status: done.
