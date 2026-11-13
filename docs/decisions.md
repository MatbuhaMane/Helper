# Decisions

A shared log of decisions that affect more than one area. Every session adds an entry here when it decides something
others must know: a shared file it needs changed, an API another area uses, a design token, a price or a quota, a new
table or route. Newest first. The master reads this before each merge.

Format:

```
## YYYY-MM-DD – short title (area)
What was decided, why, and what other areas must do. Status: proposed | accepted | done.
```

## 2026-11-14 – תיבת פניות: reports from any page, the owner's inbox, private answers (ai-features → master, design)

- **Appended:** the tables `reports` and `report_messages` at the end of `schema.sql`. Nine routes at the end of
  `functions/api/[[path]].ts` (`/api/reports`, `/mine`, `/:id`, `/:id/shot`; `/api/admin/reports`, `/:id`, PUT `/:id`,
  `/:id/reply`, `/:id/shot`) and one import line. No existing line edited; no new column.
- **Privacy:** only the reporter sees a report, its screenshot and its answers; anyone else gets 404, the owner included,
  outside the back door. The team's side is behind `requireAdmin(ctx, 'own')`. `server/test-reports.mjs` (61 tests)
  checks this, and that every team handler opens with the gate.
- **The older feedback joins the inbox.** `admin.addFeedback` (the companion's send_feedback) now writes a report, and
  the old `feedback` rows are copied in once. The settings button became the two report entries.
- **For the master:**
  1. the one-line hook in `public/assets/common.js` that loads `/assets/reports.js` after sign-in, next to `messages.js`
     (the patch is in the hand-over note);
  2. `node server/test-reports.mjs` added to `npm test`;
  3. perhaps `/assets/reports.js` in `sw.js`'s precache.
  Until the hook lands, shaking and the dot work only in settings and the back door.
- **For design:**
  1. `.navmenu-reports`, a new wrapper for the two `.rp-entry` buttons at the foot of the tools menu (no CSS yet);
  2. in dark mode `.rx-filters` / `.rx-state` `button[aria-pressed="true"]` is white on the light `--primary` (contrast 2.0).
  The other class names are as in the contract (bff1c28), except `.rx[data-view="thread"]`, which follows admin.css.
Status: done (on `ai-features`), waiting for the hook and the merge.

## 2026-11-14 – The tree batch: חיפוש ביער, the member card, keys and backups in settings (ai-features → master, design)

- Appended routes in `functions/api/[[path]].ts` (with one import): `GET /api/family/find?q=&kin=1&users=1` and
  `GET /api/family/card?id=` (`server/family-find.ts`). Appended to `server/vault/index.ts`: `forestFor`; to
  `server/vault/access.ts`: `forestFor: 'tree'` (the forest's own level, so `test-access.mjs` keeps every guarded entry
  in the table). No change to the vault's security code, its routes or its levels.
- Privacy: both read only the forest `/api/vault/forest` already shows (kin `view` per card, `outside` for other
  households). The search drops anonymous and identity-hidden cards, needs 2 letters, returns at most 20, never an email,
  and is rate-limited (40 a minute per person; the card 90). People outside the viewer's tribe never show (`sees` gives
  `none`), so "all users of the app" means the users of one's forest. Outside the household, no photo (files never leave).
  Searches and cards that touch another household are written in its activity log.
- New test `server/test-family-find.mjs` (26): the master adds it to `npm test`.
- The passkeys and backups moved from the tree's bar to settings → privacy (`public/settings/vault-keys.js`, loaded by
  `settings.js`); the same routes, each still asking for a fresh unlock. The first passkey offered when the vault opens
  stays on the tree page.
- Design: the page uses design's classes: `.fs*` for the search and `.mc*` for the member card (design 497eea2), plus
  `.fv-gliding`, `.fv-pick`, `.fv-chosen`, `.st-vault`, and the `.tree.moving` and `.tree.off` hooks (design e8568f6).
- The member card links to `/family/story/?person=<id>` for your own household's people (the story session's page).
Status: on `ai-features`, waiting for the CEO's review and design's CSS.
## 2026-11-13 – The family story, v1: a table, routes, the view filter (ai-features)

**Built** (branch `claude/story-4cc985`, from `ai-features`): the page `/family/story/` (timeline, by person, by place,
search; the recorder and the guided interview), `server/story.ts`, the rules in `server/story-rules.ts` with
`server/test-story.mjs`.
- **Appended:** the table `story_items` in `schema.sql`; six route lines `/api/story…` in `functions/api/[[path]].ts`.
- **Privacy:** an item is `household` by default. `private` means only the one who added it, and `tribe` means the linked
  households too. Only the one who added an item changes its level. Outside the household there are no people tags
  (each is an empty spot), no uploader email and no file, because files never leave their household (kin.sees). An
  unknown level opens to nobody.
- **Sealed** with the vault key like `vault_items`. Files are stored as ciphertext at `story/<household>/<id>` in the
  vault's store, using crypto.ts and store.ts as they are. The household's own story opens like its tree (the tree lock).
- **Storage:** 2 GB a household, counted from `size`. Over it only uploads with a file stop; a written story still goes in.
  Recordings are Opus at 40 kbps and photos WebP up to 2560 px, made on the device.

**For the master:** patches in the CEO notes folder: `ai-story-common-nav-2026-11-13.patch` (the top-menu entry, PC
only) and `ai-story-package-test-2026-11-13.patch` (the test in `npm test`). The backup is a proposal that needs the owner.
**For design:** `public/family/story/story.css` (the page links it; the class contract is in the message to design).
**For the tree session:** a "הסיפור של…" link on a person's card to `/family/story/?person=<id>`.

**Status:** Done on the branch (v1); waiting for the master's review of the privacy filter.

## 2026-11-14 – הרגלי אכילה: one tool for every way of eating (ai-features → master, design)

`/food/diet/habits/` (the owner's words, through the CEO): ketosis, Atkins, paleo, low-carb, low sugar and fasting, each
with the big switch ketosis has. On shows that diet's tab, pies and stamps; off, none of it. All off at first; the state
is the person's on the server (ketosis in `keto_settings`, the others in `user_prefs` ns `diets`). The six diet tiles in
תנועה ותזונה became one tile; `/groceries/#<diet>` of a diet that is off leads to its switch (`habits/#<id>`). The
daemon's `open_app` gained `habits`.
- **design**: `public/food/diet/habits/habits.css` is a first look written by ai-features, yours from now (it uses
  groceries' `.switch` from `style.css`). Its tile in the folder borrows the `keto` icon until you draw one. Proposed:
  a `/food/diet/habits/` entry in the catalogue in `apps.js`, so it can be pinned.
- **master**: proposed: add `/food/diet/habits/` (and `/groceries/diets.js`, missing today) to `ASSETS` in `public/sw.js`.
Status: proposed.

## 2026-11-13 – The family tree: עץ ב׳ (canopy) is the default (the owner → master, design, ai-features)

The owner chose עץ ב׳. `public/assets/tree/sets.json` lists canopy first, so it is the default for everyone who has not
picked a tree; the olive, renamed עץ א׳ by the owner, stays as the second choice in the tree's settings (pref `family.treeSet`). Status: done (v96).

## 2026-11-13 – Recurring goals: a fresh round each period (ai-features → master, design)

The owner: "בניהול מטרות, אפשר הגדרת מטרות מחזוריות".
- A goal may repeat every day, week (from Sunday), month (from the 1st) or every n days (2–60, counted from the goal's
  first day). New column `goals.repeat` (JSON `{every, n?}`, appended to `COLUMNS` in `server/schema.ts`); `null` is a
  plain goal, as before.
- Its steps count as done only within the running period, so each period opens a fresh round of the same steps.
  New table `goal_rounds (email, goal_id, period, done, total, updated_at)` (appended to `schema.sql`) keeps each round's
  count, written whenever a step is ticked or unticked; it feeds the history (the last 8 rounds) and the streak of whole
  rounds. An open round never breaks the streak. The logic and its tests are in `server/goals-logic.ts` / `test-goals.mjs`.
- `PUT /api/goals/steps/:id` returns `roundDone`; a recurring goal never returns `goalDone` (it is ended by hand).
- For design: the page draws `.gl-rounds` and its dots `.gl-round-dot` (`.whole`, `.part`, `.now`) with small inline
  styles for now; they are free to be replaced in `tasks.css`.
Status: done (on `ai-features`).

## 2026-11-14 – Groceries: the automatic list from the fridge (ai-features → master, design)

docs/vision/batch.md 8: "רשימה אוטומטית" is a fixed list built from the fridge. It only suggests, and nothing is ever added by itself.
- `GET /api/groceries/auto` (one route appended; `server/grocery-auto.ts`, logic and 11 tests in `grocery-auto-logic.ts` /
  `test-grocery-auto.mjs`). It looks at the person's own fridge (the fridge preferences' `mine`), or all the household's.
  It suggests what came in at least twice and is now gone, expired, or down to one. It leaves out what waits on the main
  list and what the person put off.
- The groceries page shows the chip "🤖 אוטומטית" with a count. Its dialog has "＋ לרשימה" per item, "＋ הכל" and "לא הפעם".
  "לא הפעם" puts an item off for a week, kept in the person's `groceries` preferences (`autoSkip`). An item is added
  through the page's own add, so it goes to the list on show, skips duplicates and works offline.
- For the master: please add `node server/test-grocery-auto.mjs` to `npm test` in `package.json`.
- For design: the classes are `.list-auto`, `.list-auto-n`, `.auto-list`, `.auto-rows`, `.auto-row` (`.gone`, `.expired`,
  `.low`, `.listed`), `.auto-name`, `.auto-acts`. There is no CSS for them yet.
Status: done (on `ai-features`).

## 2026-11-14 – The family tree: the drawn tree, from a set chosen by a pref (ai-features → master, design)
The family page opens on a new first view, "העץ": the people as leaves on a drawing (vision `docs/vision/tree.md`,
markup `public/assets/tree.css`). No code knows any one drawing: the set is `/assets/tree/<set>/` with its layers and
`slots.json`; the list of sets is `/assets/tree/sets.json`; the person's choice is the pref `family.treeSet`.
- **design:** please add `public/assets/tree/sets.json`, `[{ "id": "olive", "name": "זית" }, …]`; until it exists the page
  falls back to one constant (`FIRST_SET` in `family.js`). With two sets or more, a picker appears above the tree (class
  `.fv-views.tr-sets`, buttons with `role=radio` and `aria-checked`). Optional keys `slots.json` may add: `self` (the
  tier name of "me"; default: the second from the top), `layers` (default ground, boughs, trunk, crown), `candle` ([x, y];
  default under the trunk pivot), `perRow` (default 6) and `rowGap` (in %, default 7).
- **master (vault, read only):** `GET /api/vault/tree` now sends each person's `life` (born, died, after sunset, birthday
  by), taken from the details after the privacy filter (`K.view`), so a viewer sees only what they could see on the card.
  It feeds the birthday glow, the quiet leaf of the passed and the yahrzeit candle (by the Hebrew date).
- Leaves that would touch make the tree wider (up to about three screens); the board scrolls sideways, centred on me.

## 2026-11-14 – One fridge per person; the shared fridge is "בקרוב" (the owner → ai-features → master, design)
The owner: "אפשר מקרר אחד לכל משתמש וקשר אותו לממשקים האחרים, שמור את הפונקציה של מקרר משותף למאוחר יותר תחת 'בקרוב'".
- **Column (appended to `COLUMNS` in `server/schema.ts`):** `fridges.owner TEXT`, the person's email. Every fridge query
  is now scoped to it (`ownFridge`, rename, the list): someone else's fridge, or an old shared one, answers 404.
- **Migration (in code, on each person's first visit, `myFridge` in `server/fridge.ts`):** the fridge they had called
  "המקרר שלי" (the pref `fridge.mine`), if it is in their household and no one owns it yet, becomes theirs (one atomic
  UPDATE). If someone already took it, they get a new "המקרר שלי" with a copy of its items and history. With no such
  pref, a new empty fridge. The household's other fridges stay in the database with `owner` empty: hidden, never deleted.
- `POST /api/fridges` and `DELETE /api/fridges/:id` answer 409 (one per person); rename works on one's own fridge.
- Read by: the fridge page, the automatic shopping list (`grocery-auto.ts`, no household fallback any more) and the food
  portal's highlights (`food.ts`). Recipes ("what can I cook") read the page's own items. Keto, diets and the daemon do
  not read the fridge today.
- **design:** the fridge page drops the fridge chips and the "איזה מקרר הוא שלך?" chooser; it gains a card
  "מקרר משותף – בקרוב" (markup in the page commit). Classes like the other "בקרוב" cards are welcome.
- When the shared fridge comes: a `fridge_members` table (fridge, email), and `ownFridge` checks membership.
## 2026-11-14 – Family story storage: for now, on what we have, with no extra spending (business, the owner)

**Decided (the owner):** "התבסס כרגע על מה שיש לנו בלי השקעה נוספת" (for now, build on what we have, with no extra
investment). Business read this as:
- **Storage:** the story's media goes in the existing R2 bucket. The account's free 10 GB a month covers the family stage.
- **Quota:** 2 GB per household. Uploads are compressed: voice as Opus at 32–48 kbps; photos as WebP, at most 2560 px.
- **No paid extra storage for now:** no purchase flow is built. The prices in `docs/business/story-storage.md`
  (+10 GB for ₪3/month, +50 GB for ₪10/month) stay a proposal until a payment provider is live.
- **Content is never deleted** for going over the quota or for non-payment. Only new uploads stop.
- **Flag to the owner** when total R2 storage nears 8 GB above today's base.

**Affects:**
- **ai-features:** the quota check, upload compression, and the "storage full" state, in which content can still be
  viewed and downloaded.
- **design:** the storage meter and the "full" message.
- **vision:** `docs/vision/story.md`.

**Status:** Decided (the owner).

## 2026-11-14 – The owner's answers on the business plan: level titles, fundraising, the payment provider (business, the owner)

**Decided (the owner):**
1. **The founding members' levels are named by number only, with no metaphor:**
   - "מהעשרה הראשונים" (the first 10);
   - "מהחמישים הראשונים" (11–50);
   - "מהמאה הראשונים" (51–100);
   - and "חבר/ה מייסד/ת" for the rest in the window.
   - The draft names עמוד / יתד / חבל are dropped.
2. **Fundraising:** self-funded, and outside money only after the metrics. This is the roadmap in
   `docs/business/business-plan.md`, section 9.3:
   - no equity before the beta passes;
   - a founding-supporters campaign at the public launch;
   - then Tnufa or a small friends-and-family SAFE at about 1,000 families;
   - a community round at about 10,000 families.
3. **The payment provider:** quotes from many providers, not only three, plus a web comparison of their published
   prices. Then choose before the public launch.

**Affects:**
- **design:** the founders page and the title pills use the number titles.
- **ai-features:** the title strings.
- **The owner:** asking for quotes. The business department does the web comparison.

**Status:** Decided (the owner).

## 2026-11-14 – Colour palettes are never sold; free users choose a basic palette too (business, the owner)

**Decided:** palettes are not a paid item. The owner's words: "זה גרידי".
- **Every user, free ones included,** can choose a basic colour palette, both for the app and for the free figures.
- **The paid special figures** keep their own included palettes (five for קוסם הלילה and קוסמת היער).
- **What is sold** is a skin, meaning a new picture of a figure, never a recolouring.

**Why:** a palette is a code-only change that costs nothing, and free personalization is one of the owner's principles
(`docs/business/vision.md`, section 1, answer 8).

**Affects:**
- **design:** a small basic palette set for the free figures (for example 3–5 colourways), drawn the way the wizards'
  palettes are.
- **ai-features:** the palette choice for free figures, kept per user in prefs.

**Status:** Decided (the owner).
## 2026-11-14 – Groceries: saved lists, templates and an archive (ai-features → master, design)

- A template ("קניות שבועיות", "שבת") or a finished list is a `grocery_lists` row of kind `template` or `archive`. Its items
  are ordinary `grocery_items` rows with `list` set to its id, so they sync like the rest and never touch the main list. No new table or column.
- Routes (appended): `POST /api/groceries/lists/:id/save {kind, name?}` (`:id` may be `main`) and
  `POST /api/groceries/lists/:id/use {into: 'new' | 'main' | <list id>}`. The code is in `server/grocery-lists.ts`.
- Finishing the main list moves only the checked items into a new archive entry. A named list moves to the archive whole.
  The archive keeps the last 30. Any member may save, finish or use; deleting one keeps the rule (the opener or an admin).
- Copying back adds the items unchecked and skips a name already waiting on the target list.
- Design: in the lists bar, `.chip.list-saved` "📚 שמורות" opens `.saved-lists`. Inside: `.modal-acts`, then `h3` headings,
  then `ul.saved-list > li.saved-row` rows, each with `span.saved-name` (`small` count) and `span.saved-acts` (three small buttons).
  The template form adds `.list-suggest` (name chips).

## 2026-11-14 – Groceries: named lists, and deleting one with undo (ai-features → master, design)
The owner asked to delete a list; the groceries had one list per household, so named lists come first.
- **Data.** A new table `grocery_lists` (appended to `schema.sql`) and a column `grocery_items.list` (appended to `COLUMNS`).
  An item with no list is on the household's main list, as before; the daemon, the fridge and the recipes still read
  and add only there (`currentGroceries` now filters `list IS NULL`).
- **Routes** (appended): `POST /api/groceries/lists`, `DELETE /api/groceries/lists/:id`, `POST /api/groceries/lists/:id/restore`.
  `GET /api/groceries` also returns `lists`, each with `canDelete`. Ops accept `item.list`.
- **Who may delete:** the one who opened the list, or a household admin (the site's owner, or a head of that household
  in `family_roles`), checked on the server (403 otherwise). The delete is soft; the page offers "בטל" for 6 seconds.
  The main list cannot be deleted.
- `kind` is `list` now; saved lists (template, archive) and the fridge's automatic list come next on the same table.
- **Design:** `.lists-bar` (a row of `.chip.list-chip[aria-pressed]`, `.chip.list-new`, `.chip.list-del`) above the add
  form, and `.list-form` in the modal (a label with an input, `.modal-acts`). It wraps at 375 px today; a horizontal
  scroll row may look better.
Status: done (ai-features), the CSS pending (design).

## 2026-11-13 – Rich notes: formatting stored as allowlist HTML (ai-features → master, design)
The owner asked for bold, italic, underline, strikethrough, a text colour and a font in notes.
- **Storage.** A new column `notes.rich` (appended to `COLUMNS` in `server/schema.ts`). It holds the note's formatting as
  allowlist HTML, and only when the note has formatting; otherwise it is null and the note is plain text as before.
  `body` is always the plain text (derived on the server), so search, tags, titles and the research are unchanged.
- **The allowlist** (`server/notes-rich.ts`, tests in `server/test-notes-rich.mjs`): b, i, u, s, p, br, and span with
  a class from `c-def|vine|olive|soil|red|blue` or `f-rubik|heebo|round|serif`. No other tag or attribute, no inline
  style, no links or images. The server cleans on every save; the page cleans again on render and on every paste.
- **Paste** is plain text, unless it is the notes' own copy (marked `data-ohel-rich`), which is cleaned too.
- **API.** `POST /api/notes` and `PUT /api/notes/:id` accept `rich`; a plain `body` alone (the calculator's pad, an
  older page) replaces the formatting. Notes now return `rich`.
- **Master:** please add `node server/test-notes-rich.mjs` to `npm test`. This touches user input that is rendered as
  HTML, so the master reviews `server/notes-rich.ts` before merging.
- **Design:** the toolbar `.nt-tools` (sticky above the phone keyboard: `inset-block-end: var(--nt-kb)`), the buttons
  `.nt-tool[aria-pressed]`, the pops `.nt-pop` with `.nt-swatch.c-*` and `.nt-font-b.f-*`, the colour classes
  `.c-*` (readable in light and dark), the font classes `.f-*`, the placeholder `.nt-rich[data-placeholder]:empty::before`
  and `.nt-rich p { margin: 0 }`. Details in the design contract note.
Status: done (ai-features), the CSS pending (design).

## 2026-11-13 – Shared goals and encouragement (ai-features → master, design)
Vision batch 8, slice C; the owner chose it after the badges.
- **What it does:**
  - a goal the person shares ("לשתף עם המשפחה", per goal) makes progress posts: one a day for each goal, and one when it
    is achieved;
  - the household sees them in "מהמשפחה" on the goals page, with hearts (a tap or a double tap) and short advice;
  - the one advised can mark advice good: "יועץ" for its author. Five hearts given earn "כתף תומכת"; a goal that was
    advised on and then achieved earns "מלאך דרך".
- **The audience:** the household (friends come with slice B). A child under 12 gets advice only from the family; no heart
  or advice on one's own post. A deleted or unshared goal leaves the feed.
- **Appended:**
  - the tables `goal_posts`, `post_hearts` and `post_advice` in `schema.sql`;
  - the column `goals.shared` in the `COLUMNS` list of `server/schema.ts`;
  - four routes: `GET /api/goals/feed`, `POST /api/goals/posts/:id/heart`, `POST /api/goals/posts/:id/advice`,
    `POST /api/goals/advice/:id/heart`;
  - the code: `server/goal-social.ts` and `goal-social-logic.ts`, with tests in `server/test-goal-social.mjs`.
- **Next:** "שבט" (relatives in the family tree only) waits for the family goal (slice D).
- **For the master:** add the test to `npm test`.
- **For design:** the look of `.gl-feed`, `.gl-post`, `.gl-heart`, `.gl-advice` and `.gl-share`.
Status: done (ai-features).

## 2026-11-13 – The owner's room: usage and the feedback inbox; a feedback button (ai-features → master, design)
The family batch, approved by the owner. **Critical: the owner's room, to the master for review.**
- **In the room** (from the owner's own account only, `requireAdmin('own')`):
  - "שימוש": who comes in and which tools, from `tool_visits` (which tool and when, never what is in it);
  - "פניות": the family's feedback, with read and done.
- **Feedback:**
  - `H.feedback()` (`public/assets/feedback.js`) opens a short form; the first button is in settings ("החשבון");
  - the companion has a `send_feedback` tool (PROMPT_VERSION 13);
  - at most 20 a day per person; no alert, as the owner asked.
- **Appended:**
  - the table `feedback` in `schema.sql`;
  - the routes `GET /api/admin/usage`, `GET`/`PUT /api/admin/feedback`, `POST /api/feedback`;
  - the code in `server/admin.ts`.
- **For the master:** a feedback button in the header or the menu, for every page (it calls `H.feedback()`).
- **For design:** the look of the two room sections, and of the form (inline on the tokens for now).
Status: done (ai-features), waiting for the master's review.

## 2026-11-13 – Discovery: the tools a person has found (ai-features → master, design)
Vision batch 8, the first minute; slice A of `docs/ai/social-plan.md`.
- **What it does:** each page notes its tool once a day on each device (`public/settings/apply.js`). The home page can show
  "גילית 6 מתוך 19 כלים" (`GET /api/discover`), and finding 10 tools earns the "סייר" badge (kept with the goals' badges).
- **Appended:**
  - the table `tool_visits` in `schema.sql`: who, which tool, when, how many times – never what is in it;
  - the routes `POST /api/visits` and `GET /api/discover`, with an import line;
  - the code: `server/discover.ts` and `server/discover-logic.ts`, with tests in `server/test-discover.mjs`.
- **For the master:** add `node server/test-discover.mjs` to `npm test`. The same table can feed the owner's usage dashboard.
- **For design:** the event `helper:discovered` ({tool, found, total, badge}) is raised on a first find, for the
  celebration; today the page shows a toast.
Status: done (ai-features).

## 2026-11-13 – The weather, and no "בקרוב" on show (ai-features → master, design)
The owner's answer on `docs/ai/ready-soon.md` (via vision): the weather is finished, the ChatGPT card and the four
family badges in goals are hidden, and the language chips (Arabic, English) stay "בקרוב".
Appended for the weather: the route `GET /api/weather` in `functions/api/[[path]].ts` (and its import line), served by
`server/weather.ts` (Open-Meteo through the server: the CSP keeps `connect-src 'self'`, and the person's address stays
here), with `server/weather-logic.ts` and its tests in `server/test-weather.mjs`.
For the master: add `node server/test-weather.mjs` to `npm test` in `package.json`; the sun card's link in `index.html`
can drop "– בקרוב" (the page is live); `H.soonPage` is no longer used by any page.
For design: the weather page's look is inline on the tokens for now (`public/tools/weather/weather.js`); a `weather.css`
with `.wx-*` classes is welcome. Status: done (ai-features).
## 2026-11-13 – The family profile, spec 1 (vision → ai-features, design, master)
The owner's idea, through the CEO; the owner chose who sees it. The full spec: `docs/vision/family-profile.md`. Status: Decided (the owner).

**What is on it**
- A cover: an uploaded photo, or a drawing in the tent's style.
- The family name and a short line about themselves.
- "Where we come from": places and communities, possibly on a map.
- Traditions, in free text.
- Picked family recipes.
- A small window onto the drawn tree.
- Later, a picked exhibition from the museum.
- The members' pictures.

**The rule:** the profile shows things, it never widens them. Each item keeps its own privacy level; an item the viewer may not see shows as an empty spot.

**Who edits:** the household's heads. Other members suggest, and a head approves.

**Who sees it:** the household only, by default. A head can open it to the whole tribe (the linked families), or to specific people by an invitation link.

**How it ties in**
- The person's profile shows "member of the ... family".
- A button at the top of the tree opens it.
- Each tree in the forest leads to its family's profile.
- A gathering invitation shows the host family's cover.

**When:** not before 16:00 (the weekly reset); the CEO schedules it.

## 2026-11-14 – The family profile, built (ai-features → master)

- **Shared files (appended only):** two tables at the end of `schema.sql` (`family_profiles`, `family_profile_suggestions`,
  and an index on the link hash); one import and six route lines (`/api/family/profile…`) in `functions/api/[[path]].ts`.
- **The view filter** is `server/family-profile-rules.ts`, tested by `server/test-family-profile.mjs` (31 checks).
  It needs one line in `package.json`'s `test` (master's file): `&& node server/test-family-profile.mjs`.
  - Opens: the household always; the tribe (linked or further) only when a head opened it; a link holder only when a link exists.
    Anyone else gets the same 404 as a household with no profile.
  - Shows: the profile's own words (cover, line, origins, traditions) to whoever may open it. A person outside the household
    only by their card's identity level (kin.outside over all their records; never anonymous, never a member with no card,
    never by link); outside, by the card's name and never an email. Recipes and the tree window stay household only.
    Every hidden item arrives as `{gap: true}`, nothing in it.
- **Invitation link:** a random token, only its HMAC hash kept (`fingerprint`, vault/crypto); shown once; a new one
  replaces the old. It works for a signed-in user of the app. An outsider's view is written in that household's vault log.
- **Own cover photo:** shrunk on the page, kept in `MEDIA` at `profile/<household>/cover`, served through the same filter.
- **The name** is still `family_households.title`; a head's save writes it there.
- Not done yet: "member of the ... family" on the person's profile; the forest and gathering doors; the museum exhibit.
Status: on `ai-features`, waiting for the master's review of the filter.

## 2026-11-13 – The family story, spec 1: a living museum (vision → ai-features, design, business, master)
The owner's decision. The full spec: `docs/vision/story.md`. Status: Decided (the owner).

**The items**
- Stories (text), recordings, readings aloud, documents and photos.
- Each item can be tagged with people from the tree, a date (approximate allowed) and a place.

**Where it lives**
- In each person's card in the tree: "הסיפור של...".
- In a museum hall of its own, drawn in the tent's style. It can be browsed four ways:
  - a timeline;
  - by person;
  - exhibitions that family members curate;
  - by place, on a map.

**Collecting**
- A guided interview ("ראיון עם סבתא"): ready questions, each answer recorded separately, saved as items tagged with the person.
  - Without AI: a fixed list of questions.
  - With AI (proposed): the companion suggests a follow-up question.
- Free upload of any item.
- Recordings are transcribed to searchable Hebrew text. Without AI, the recording is kept with its title.

**The feel**
- No quests and no badges.
- A pleasant recorder: a big mic, a haptic at the start and at the end, a live waveform.
- Quiet and respectful for those who passed away, as in the tree.

**Privacy**
- A new item is seen by the household by default.
- The uploader can widen it to the whole tribe, or narrow it to themselves.
- Restricted documents need a passkey, per "Locks and privacy".
- The items are part of the vault backup.

**Storage**
- A free quota, and paid extra storage. Business sets the size and the price.

**When**
- After the family launch. The new tree is the priority before it.

## 2026-11-13 – Tigrinya joins Russian and Amharic (vision → master, design, ai-features, business)
The owner's decision, through the CEO. The full notes: `docs/vision/languages-ru-am.md`, section "טיגרית". Status: Decided (the owner).
- **The slot:** the same as Russian and Amharic, after the family launch and before the closed beta.
- **Shared with Amharic:** the same Ge'ez (Ethiopic) script and the same left-to-right layout, so design's Ethiopic font (Noto Sans Ethiopic covers both) and the LTR checks are done once.
- **What differs:**
  - Tigrinya is a separate language: it gets its own term glossary and its own native-speaker reviewer (business recruits separately).
  - The speech voices and speech-to-text are to be checked; they are likely weaker than Amharic's. With no support, the app shows text only.
  - Whether Claude and Gemini handle it well is to be checked: ai-features runs a short test that a speaker judges. If the assistant is weak in it, the interface is in Tigrinya and the assistant answers in a language the user picks, said openly.
- **The language choice:** a third chip next to Russian and Amharic; the browser guess is `ti`.

## 2026-11-13 – The family tree, spec 1: a drawn tree, play in the interface (vision → ai-features, design, master)
The owner's decision. The full spec: `docs/vision/tree.md`. Status: Decided (the owner).

**The look**
- One fixed, detailed tree in the tent's style. Each person is a leaf or a tag on their branch: grandparents near the roots, children in the crown.
- The drawing is in layers (roots, boughs, crown, leaves) and is assembled in code, so it can move.
- Later: animated trees whose roots and branches join, for linked families. That is the forest, stage 3.

**The play**
- There are no quests and no badges in the tree. The play is the interface itself, in the spirit of Not Boring's apps:
  - drag up the trunk to the generations before;
  - pinch to zoom;
  - tap a leaf to open the person's card;
  - momentum, a soft stop on a branch, a short haptic, a soft sound.
- The tree opens with the viewer in the centre. Today's event shows on the tree: a glowing leaf for a birthday, a candle by the roots for a yahrzeit.
- Adding a person: a "+" bud next to each person ("אמא של דנה?", the relation already filled in). Only a name is required.
- With reduced motion, there is no movement. Everything stays within the readiness bar.

**Those who passed away**
- By default, quiet and respectful: no confetti or cheerful sounds, a candle on the yahrzeit.
- Each user chooses in their own settings how they will be shown after their death.

**When**
- Before the family launch, as a priority. The master schedules it against the readiness bar.

**Next**
- The family story (recordings, readings, documents, photos, tagging people), "a living museum". It gets its own spec.

## 2026-11-14 – Locks and privacy: a simple entry to the tree, an app lock like Telegram's, fingerprint sign-in (master → ai-features, design)
The owner's design. It replaces "the trusted device" for the tree.

**Signing in**
- Sign-in stays Google only. The account is a Google account.
- Once a person has a passkey (fingerprint, face, Windows Hello), they can also sign in with it, without Google: "כניסה בטביעת אצבע".

**The family tree**
- Open by default to a signed-in member of the household. There is no unlock and no trusted device.
- The person can lock it, with a 4-digit code or a passkey. This is an option in the privacy settings.
- On the first entry to the tree, a small warning window recommends turning on protection, with three buttons:
  - "להגדיר עכשיו";
  - "אחר כך" (closes for now);
  - "לא להציג שוב".
- When someone creates a private document, the app recommends setting a code.

**Always behind a passkey**
- Restricted documents and files, privacy changes, deletes, linking trees, backups and the owner's room. This is level 'fresh', unchanged.
- No privacy setting opens these.

**The app lock (like Telegram)**
- Each person may lock the whole app, with a 4-digit code or a passkey, and choose when it locks itself: after 1, 5, 15 or 60 minutes away.
- With a lock on, an open padlock appears in the menu. Pressing it plays a locking animation and locks the app.
- The lock is enforced on the server, not just drawn over the page: a locked session gets 423 app_locked from every route except the lock's own, /api/me and signing in and out.

**The code**
- 4 digits. Stored as PBKDF2-SHA256 (100,000 rounds, the most Workers allow) with a salt per person and a pepper derived from VAULT_KEY, so the database alone cannot be guessed through.
- Wrong codes:
  - 5 wrong codes: a 15-minute pause;
  - 10 wrong codes: the code is closed until the person signs in with Google again.
- Changing the code, or turning a lock off, needs the current code, or a code/passkey/Google proof from the last 5 minutes.
- **Forgotten code:** "שכחתי את הקוד" signs the person out. A new sign-in with the Google account they use is the proof, and then they set a new code. Recovery goes through the email they signed in with, and no mail is sent.

**Privacy level**
- Low ("הכל פתוח"): no app lock and no tree lock. Not recommended, and the settings say so.
- Even at low, documents, credentials and personal details stay behind a passkey.

**The server (master)**
- server/lock.ts and lock-rules.ts, table `user_locks`, and session columns.
- The routes:
  - `GET/PUT /api/lock`
  - `PUT /api/lock/pin`
  - `POST /api/lock/lock`
  - `POST /api/lock/unlock`
  - `POST /api/lock/passkey/options`
  - `POST /api/lock/passkey`
  - `POST /api/auth/passkey/options`
  - `POST /api/auth/passkey`
- The details are in server/lock.ts.

**ai-features: the pages**
- A "פרטיות ואבטחה" section in /settings/: the app lock (off / code / passkey) with its timer, the tree lock, the code (set or change, "שכחתי את הקוד"), and the low level with its warning.
- The lock screen: 4 dots and a keypad, plus a passkey button.
- The padlock in the menu. When 423 app_locked comes back, show the lock screen.
- The warning window on the tree.
- "כניסה בטביעת אצבע" on the sign-in screen.

**design**
- The lock screen, the keypad, the padlock and its locking animation (open → closed), and the warning window.

Status: accepted; the server is being built.

## 2026-11-14 – The payments switch, and the family's first sign-in (master)
The owner asked for two things.

**The payments switch**
- A switch in the owner's room hides every payment option for now: `money.shop_open`, off by default.
- While it is off:
  - `/api/me` and `/api/daemon/figures` return `shop: false`;
  - a limited account cannot buy (403 shop_closed);
  - the family still takes any paid figure for nothing (`/api/daemon/figures` returns `family: true` for them).

**The family's first sign-in**
- A member the owner added has full access from their first sign-in.
- At that first sign-in the owner gets a message only the owner sees, with a link to /admin/#members (core.ts firstSignIn, `members.first_seen`).
- People who used the tent before this change are only marked, and the owner gets no message about them.
- The owner then approves them with `POST /api/members/:email/approve` (owner only, room open). Approving:
  - sets `approved_at`;
  - lifts any AI limit;
  - turns on every special feature (admin.FEATURES).
- `/api/members` returns `first_seen` and `approved_at`.

**ai-features, please**
- When `shop` is false, hide prices, buy buttons, credit packs and the links to the purchase page.
- When `family` is true, show every paid figure as theirs to take, with no price.
- In the room, next to each member: "התחבר/ה לראשונה" and an "אישור" button.

Status: done (server).

## 2026-11-14 – The locks' look (design → ai-features, master)

For "Locks and privacy": `/assets/lock.js` + `lock.css` (design) give the padlock and its locking move, the lock screen
(dots, keypad, passkey key, wrong code / pause / unlocked states, keyboard digits, the page made inert) and the window
for the first visit to the tree; `settings.css` gains `.st-code`, `.st-warn`, `.st-safe` and the low level's chip for the
"פרטיות ואבטחה" section. ai-features wires them to the routes (the API in `docs/design/locks.md`, the markup in
`docs/design/prototype/lock.html`). Status: done (design); waiting for ai-features to build the pages.

## 2026-11-14 – Dracula drawn again, younger (design → master, business)

The owner: Dracula younger and more attractive, Cleopatra's counterpart. Redrawn as a handsome young count (black swept
hair, a red-lined cape, a red waistcoat), elegant rather than frightening. Same id `dracula`, same name, still paid,
no longer tagged `horror` (the owner: remove the tag – he is not scary now, so he is never hidden by that filter). His
palette tints the lining and the waistcoat. Status: done (design).

## 2026-11-14 – A basic palette for every free figure (design → ai-features, master, business)

Following the owner's decision that palettes are never sold: the 12 free figures (fennec, owl, lamb, hedgehog, Ibn Sina,
the Rambam, Newton, Juha, Hershele, Scheherazade, Ali Baba, Peter Pan) have 5 colourways each, the first as drawn.
`Figure2D.list()` → `palettes` for them too; the same `mount(…, { palette })` / `f.setPalette(i)` and the same swatch row
as for the wizards, saved per person (`H.prefs('daemon').palette`). Free for everyone. Then business's rule, the same day: **every figure gets its
palettes, included** – the paid ones too (Shelley, Leonardo, Cleopatra, Dracula, the magician, the seer, the little
pair), all but the doll, whose patches are her look. Status: done (design).

## 2026-11-14 – הקוסם, הרואה, palettes and pranks (design → master, ai-features, business)

The owner's word (2026-11-13):
- **Names:** `magician` is now **הקוסם** (was הקוסם מהשוק), `astronomer` is now **הרואה** (was האסטרונומית). The ids stay.
  The master: please update the names wherever the server keeps them (e.g. `server/figures-rules.ts`).
- **The magician** drawn again, taller and stronger, still old and warm. **The seer and the little witch** swapped skin
  tones. **The night wizard's eyes** lowered to the right height.
- **Palettes:** the night wizard and the forest witch can be dressed in other colours (5 each, the first as drawn):
  `list()` → `palettes`, `mount(…, { palette })`, `f.setPalette(i)`. Part of the figure, no extra price (business may
  decide otherwise).
- **Pranks:** the gimmick of the little wizard and the little witch – small harmless tricks on the page while the app is
  used, a feature the person can switch off. `/assets/pranks.js` (design); wiring and the switch are ai-features'
  (`Pranks.start(f, { id })`, `H.prefs('daemon').pranks`, on by default). Details in `docs/design/figures-2d.md`.
Status: done (design); waiting for ai-features (palette swatches, the pranks switch) and the master (the names).

## 2026-11-14 – Four more paid wizards, the magician redrawn, the astronomer's hair chosen (design → master, ai-features, business)

The owner's word (2026-11-13), after the owner's pictures: the doll and the astronomer approved; **the magician redrawn**
as a kind old desert wizard (white turban and beard; same id `magician`, same name and dove); **four new paid figures**
in Figure2D, `kind: 'special'`, `tier: 'paid'`: `nightwizard` קוסם הלילה, `forestwitch` קוסמת היער, `littlewizard`
הקוסם הקטן, `littlewitch` הקוסמת הקטנה (their staffs glow; when glad, sparks). **The astronomer's hair** is chosen by
the person, white by default: `Figure2D.list()` gives `hair` and `hairDefault`, `mount(el, 'astronomer', { hair })`,
`f.setHair(color)`. Details in `docs/design/figures-2d.md`.
- ai-features: the four in the "מיוחדות" group; under the astronomer, a row of hair swatches, saved per person
  (e.g. `H.prefs('daemon').hair`).
- business and the master: the paid list now has 7 special figures (magician, astronomer, doll and the four wizards)
  besides the four paid people; prices are business's.
Status: done (design).

## 2026-11-14 – The founders page and the purchase page: their look (design → business, ai-features, master)

At business's request (`docs/business/founders.md` §4–5, `docs/business/monetization.md` §4.3). CSS only, plus two
prototypes with the markup in `docs/design/prototype/founders.html` and `buy.html` (serve them from the dev server by
copying them into `public/` for a moment).

- **`/founders/`**: link `/founders/founders.css` after base.css. `main.fd` > `header.fd-head` (the tent, h1, a line on
  how a name gets in), then one `section.fd-tier` per tier with `header` (a badge img + h2 + small):
  1–10 עמודי האוהל `ol.fd-poles` > `li.fd-pole` (`.fd-num`, `b` name, `small` place · month), 5 columns, 2 on phones;
  11–50 יתדות `ol.fd-pegs` > `li.fd-peg` (`.fd-num`, `b`); 51–100 חבלים `ol.fd-ropes` > `li` (`.fd-num` + name);
  then `ul.fd-supporters` > `li`, `.fd-million` (with `.who-title.gold`), `p.fd-note`, and `.fd-empty` for a tier not
  filled yet. The badges used are pole, peg, tribe and shoulder from `/assets/badges/`.
- **`/buy/`**: link `/buy/buy.css`. `main.by` > `.by-head`, `.by-main` (two columns, stacked under 760 px):
  `figure.by-item` (a Figure2D stage, or a picture for credits or support) and `section.by-offer` with, in this order,
  `.by-plans` (`role="radiogroup"`, `button.by-plan[role=radio][aria-checked]`, `.by-cancel` on the monthly one),
  `.by-price`, `ul.by-gets`, `.by-terms` (the cancellation terms, always before the button), `label.by-agree` with a
  checkbox, `button.btn.primary.by-buy` (disabled until the box is ticked) and `.by-pay-note`. Below it
  `.by-seller` with the dealer's details; `.ph` marks a placeholder until the owner opens a tax file.
- **Corrected after business's review (same day):** a figure is paid **in credits** – `.by-price` "₪10 בקרדיטים",
  `.by-balance` (the balance and what is left; `.low` when short), one confirmation; short of credits, `.by-short` and
  then `section.by-topup` with `.by-packs` > `button.by-pack[role=radio]` (₪5/10/20/50). The card, the receipt, the
  terms for credits and `.by-seller` belong to the pack purchase only. `.by-plans` (monthly support) is kept for the
  packs/support page, not a figure's page. The tithe line reads "מעשר: 10% מההכנסה מכל רכישה הולכים לצדקה". Founders:
  opt-in ("להופיע בדף מי הקים את האוהל?", the city optional), "בתקופת הבטא" in the intro, `.fd-million[hidden]`
  until it happens; proposed for signed-in users only.
- Wiring the pages, the routes and the payment provider is ai-features' and the master's. Checked at 375 px and desktop,
  in light and dark (no overflow, contrast clear).
Status: done (design); waiting for the pages to be wired.

## 2026-11-14 – Founding members: the moment a gathering has five confirmed invitees is recorded (ai-features → business, master)

Business's urgent item (the owner's decision of 2026-11-13, docs/business/founders.md on `business`): before the first real
gathering goes out, record when each gathering first has five invitees who confirmed, and its organiser.
- Table `gathering_milestones` (appended to schema.sql): `seq` (AUTOINCREMENT, runs forever – "the millionth"),
  `gathering` (unique), `host_email`, `household`, `reached_at`, `confirmed`, `dev`. Written once (INSERT OR IGNORE),
  never rewritten: a later "no" does not move it.
- The rule (`server/gather-rules.ts` `confirmedGuests` / `reachedFounding`, tests in test-gather.mjs): answers "yes",
  each answer once, not heads, and not the organiser's own answer.
- Recorded in `rsvp()` (server/gather.ts) on every "yes"; a failure is logged and never fails the answer.
- Test gatherings: `dev = 1` on a dev server. On the live site a test gathering is a real row; the owner's approval of the
  list in the room (founders.md) filters it, or a "test" mark when a gathering is created – business/the owner to decide.
- For the founders' order: a person's first moment is `MIN(reached_at)` by `host_email` (the room's list, the master's).
Status: done on `ai-features`.

## 2026-11-14 – Paid figures bought with credits; a private birth year; figures everyone agrees on (master)
The owner's decisions, built by the master.

**Buying a paid figure**
- Paid figures can now be bought with credits (server/figures.ts, rules and 29 tests in figures-rules.ts and test-figures.mjs).
- The owner's family gets a paid figure for nothing, at the owner's cost, like the AI.
- A limited account pays the setting `figures.price_ils` (default ₪10, a draft until business decides) from its credits.
- The purchase counts as spent in credits.balance().
- Every purchase needs `{ confirm: true }`. Buying twice charges nothing.
- The routes:
  - `GET /api/daemon/figures` → { owned, paid, priceIls }
  - `POST /api/daemon/figures/:id/buy` { confirm: true } → { ok, how, owned }, or 400 not_paid | confirm_needed, or 402 not_enough_credit
- Table `figure_owned`.
- The list of paid figures lives on the server (`figures-rules.ts` PAID). Design tells the master when a figure becomes paid.

**A private birth year**
- Column `members.birth_year`. Only the owner sets and sees it, in the room: `PUT /api/members/:email/birth-year`, and `/api/members` returns it.
- Everyone else gets only `child` (under 12) from `/api/me`.
- On the server, `childOf(env, email)` in server/members.ts gives the same answer.

**ai-features, please**
- The figure picker: a buy button with a confirmation that shows the price, `/api/daemon/figures` for what is owned (in place of `owned: []` in /api/daemon), and a 402 that leads to "חיבור לשירותים".
- Hide horror figures when `child` is true (the person's switch stays for adults).
- Pass `childOf` into research-share's mayJoin (inviteeChild / ownerChild).
- In the owner's room, a birth-year field per member.

**Figures everyone agrees on (design, vision)**
- Prophets appear only in a representation everyone accepts. If one might hurt anyone, leave it out.
- The same goes for the library as a whole: prefer figures nobody objects to over hiding them by religion.

**Approved as they are:** Open Food Facts in the shared foods table (ODbL, credited), and TheMealDB's test key until a public product.

Status: done (server); the client side is ai-features'.

## 2026-11-14 – Vision batch 5, ai-features' part: the companion's name, figure, voice and tab; themes of one's own (ai-features → master, design, vision)

- **The name is ראב"ע only** (9b8893c): "אזי" was saved by the companion's `rename` tool in `daemons.name`. The tool is
  gone (prompt version 10: stored conversations start over, memory notes carry over), a saved name is ignored on load.
  No data was changed.
- **Figures** (75883e5): `/api/daemon` returns `ibnEzra` (the owner's household, by `OWNER_EMAIL`). Settings has a figure
  picker (ראב"ע for the family; design's Figure2D figures by `kind`: simple, generic, badge – unlocked by `unlock`, a badge
  id from the goals engine – and holiday), all free. The choice is prefs `daemon.figure` (server, per person). daemon.js
  draws a 2D figure in place of the 3D one (three.js not loaded); anyone outside the family who has not chosen gets the
  first 2D figure. Until design's `figure2d.js` and figures reach main, everyone keeps ראב"ע. The engine does not load
  `figure2d.css` itself; the callers add it (design may prefer the engine to).
- **Voice** prefs `daemon.voice`: `always` · `mirror` (aloud when spoken to, in writing when written to) · `silent`
  (`speak` kept in step for older code). **The chat's head** shows the figure, prefs `daemon.header`: `icon` · `animated`.
- **The side tab** (be7a676, 8878c5b) is dragged: docked at the start or the end, or free; design's `.dock-start`,
  `.free`, `.dragging`, `.dm-dock-hint`. Its place is the device's: localStorage `helper.daemon.tab`.
- **Themes** (4f809bc): prefs `look.font` (`heebo` · `round` · `serif`; accessibility's readable font wins) and
  `look.palette: 'custom'` with `look.custom: { primary, field, ground }`; apply.js sets the tokens from design's
  `H.palette.derive()`, by day or by night.
- **For the master:** common.js's early copy of the settings could set `data-font` from `look.font` too, so the font does
  not flash in. A custom theme comes in once apply.js and palette.js load (a short flash of the default); if that shows,
  apply.js can keep the derived tokens in the prefs for the early copy to set.
- "דרוזים" is "התווחיד" (التوحيد for the Arabic version; the value stays `druze`).
Status: done on `ai-features`; the looks come with design's 31f8ed0 and its figures.

## 2026-11-14 – Shared research: within the household only, for now (master)
The owner decided that a research is shared only within its household for now, and later with others too. The reason is
that members have no age yet, so the "under 12 only with the family" rule cannot be enforced.

ai-features does the following before step 3 (b24e1c1, 9376809, 46d5e59) is merged:
- invite() refuses an invitee from another household (403 not_same_household).
- An invitation does not reveal whether an address is registered: it gives the same answer for "not a member" and
  "another household".
- Members are shown by name, not by email address. The owner of the research still sees addresses.

Opening sharing to other households waits for a child marker or a birth year on members (the master owns members), and
then for the owner's OK. Status: accepted.

## 2026-11-14 – The research assistant, step 3: shared research (ai-features → master for a security review, design)

The owner's go-ahead ("כן, שלב 3"), from vision's spec (`docs/vision/research.md`):
- **Roles** (`server/research-share.ts`, 24 tests in `server/test-research-share.mjs`): owner (everything: invite,
  roles, remove, delete, settings, the goal), editor (anyone's notes, questions, sources and drafts; restores from the
  history; invites readers), contributor (adds, and changes only what they wrote), reader (sees and comments). The server
  checks every write through `access()` in `server/researches.ts`; someone not in a research gets 404, as if it were not
  there. The page offers only what the role allows.
- **Joining (after the master's review, a47e3c5):** within the owner's household only, for now (the master's entry
  above). The owner (or an editor, for readers) invites someone of the household who is already in הָאֹהֶל; whoever is
  not – not registered, or of another household – gets the very same 403 `not_same_household` (`inviteCheck`), so an
  invitation never tells whether an address exists. No mail goes out; it counts only once accepted. Members are shown
  by name; their addresses go only to the research's owner (`memberView`). The children's rule waits in `mayJoin()`
  for when sharing opens beyond the household.
- **Private notes:** a note keeps living in its author's פתקים (`research_notes.note_email`). When a note of mine joins a
  research that is shared (or one that isn't mine), the server answers 409 `ask_share` and the page asks each time
  whether to share it. If not, the others see "a private note of X": no title, no text, not in drafts, ✨ or exports. Only
  its author can open it later, and a restore cannot reopen it.
- **History and restore:** each add, change and removal is kept with how it was before (`research_history`); a draft is
  kept at most once every ten minutes per person (it saves as one types), and at once when someone else writes. An
  editor restores a removed thread, source, note link or draft, or an earlier text.
- **Comments** on the research or on a note, question or source (`research_comments`); the writer or an editor deletes.
- **The journal** stays personal: each member keeps their own lines about a shared research. The goal and "done" are the
  owner's. A draft saved to Drive by someone else goes to their own Drive, as a new Doc.
- **Appended:** tables `research_members`, `research_history`, `research_comments` (`schema.sql`); `COLUMNS` →
  `research_notes.note_email`, `research_notes.shared`, `created_by` on `research_threads`, `research_sources` and
  `research_drafts`; nine routes (`/api/research/r/:id/members|join|comments`, `…/notes/:noteId` PUT and `/share`,
  `/api/research/comments/:id`, `/api/research/history/:id/restore`).
- **For the master (a security review):** this lets one member read another member's rows for the first time, outside the
  vault. Worth a look: `access()` and `item()` in `researches.ts` (rows keyed by the owner, the member found through
  `research_members` with `status = 'active'`), `visibleNotes()` (the hidden note's body never leaves the server), and the
  `invite()` checks (only existing members, the household compared on the server).
- **For design:** new classes `.rx-invites`, `.rx-sharing`, `.rx-role` (a role pill), `.rx-shared` (on a research card),
  `.rx-private` (a note that wasn't shared), `.rx-comments`, `.rx-comment`, `.rx-history`. Inline rules hold the layout for
  now. Also fixed: `.rx-preview` no longer has an inline `display`, so the `[hidden]` guard in research.css can go.
Status: done on `ai-features`; reviewed by the master, with the three changes in a47e3c5.

## 2026-11-14 – The research assistant, step 2 completed: the academic pack, docx and slides, and the ✨ tools (ai-features → master, design)

The owner's scope for step 2 (vision): beyond 6d9a822, now also
- **The academic formatting and writing pack** (`server/research-pack.ts`, 20 tests in `server/test-research-pack.mjs`):
  draft templates (IMRaD, a seminar paper, an essay, a talk, a post) with their sections and a length to aim for;
  numbered headings and cross-references (`{#label}` on a heading, `[ref:label]` → "סעיף 2.1"); footnotes `^[…]` (with
  citations inside them; LaTeX `\footnote`); a word count against the target; a checklist before handing in (the
  template's sections, the length, citations that point nowhere, places still to complete, the abstract, broken
  references); Hebrew and English kept in order in HTML (`dir="auto"` paragraphs, `<bdi>` for English runs).
- **Export:** a real **.docx** written here with no library (a stored zip with its CRC; checked with a zip reader and an
  XML parser), right to left, headings styled, notes and bibliography; **slides** as one HTML page (a slide per `##`).
- **✨ (own AI or credit):** focused search (the AI writes 2–3 OpenAlex searches), a source's summary and a comparison of
  2–5 sources – both from abstracts read live from OpenAlex and never stored (a work without an open abstract is said so)
  – and language editing (the citation, link and footnote marks must come back unchanged, or it is not offered).
- Columns in the new table `research_drafts` (not yet live, so in its CREATE): `template`, `target`, `numbered`.
  Routes: `/api/research/r/:id/ai/{search,compare}`, `/api/research/sources/:id/ai/summary`, `/api/research/drafts/:id/ai/edit`.
  `searchOpenAlex` and `abstractOf` are exported from researches.ts.
- **For the master:** `test:research-pack` in `npm test`.
- **For design:** `.rx-format` (numbering, the target, the template, ✨ editing), `.rx-words`, `.rx-checks` (a `<details>`,
  `li.ok` / `li.todo`); the docx and slides have their own styles inside them.
Status: done (on `ai-features`).

## 2026-11-14 – The research assistant, step 2: persistence and writing (ai-features → master, design)

- **One engine with the goals:** "🎯 להפוך למטרה" makes a goal from a research (the new "מחקר" template; `insertGoal`
  in goals.ts is shared), so its steps come to "היום", the weekly review, "נתקעתי" and the badges; "היום" also shows one
  open research thread a day (`threadOfDay`); "🏁 סיימתי" finishes the research (and its goal) and earns "גשש" (no longer
  "soon"). A research journal of a few lines a day.
- **Writing:** drafts – an outline from the notes (no AI), an empty one, or ✨ a draft from the notes; citations as
  `[@source]` (with a page), written out in the research's style with the bibliography of what is cited; a formatted
  preview; export to Markdown, HTML (to print or save as PDF), Word (an HTML .doc; a real .docx would need a library –
  I would ask first), LaTeX with `references.bib`, and a Google Doc (`saveToDrive` in notes.ts, now shared by notes and
  drafts: the same drive.file grant, a folder "האוהל · מחקרים").
- **✨ (the person's own AI or credit):** directions (questions worth asking, small next steps – to the threads or the
  goal) and a first draft; without AI, guided questions and the outline.
- Tables appended: `research_journal`, `research_drafts`; COLUMNS: `researches.goal_id`, `researches.done_at`. Routes:
  `/api/research/r/:id/{goal,done,journal,drafts,ai/directions,ai/draft}`, `/api/research/drafts/:id` (+ `/export`, `/drive`).
  Tests: research 24 (drafts, LaTeX, HTML), goals 40.
- **For the master:** a review of `saveToDrive` (moved out of `toDrive`, the same calls; HTML now converts to a formatted
  Doc). Nothing else of yours.
- **For design:** `.rx-persist`, `.rx-directions`, `.rx-dir-out`, `.rx-drafts`, `.rx-draft-item`, the draft screen
  `.rx-draft` (`.rx-toolbar`, `.rx-preview` with an iframe of the export, `.rx-export`), `.rx-journal`
  (`.rx-journal-entry`); in goals, `.gl-thread` (the thread of the day under "היום").
Status: done (on `ai-features`).

## 2026-11-14 – The research assistant, step 1: the core (ai-features → master, design, vision)

Vision's spec v1 (`docs/vision/research.md`), step 1 of 4. In `/tools/research/` ("עוזר מחקר", a new tile in the tools box):
- **Researches** with a purpose and a citation style (APA, MLA, Chicago); **notes** are the hub's own notes, linked by
  `research_notes`, so one note is in several researches (the same note); `[[title]]` links and backlinks among all of
  a person's notes; **questions and threads** (open, answered, parked) and one list of every open one; **sources** by a DOI
  (Crossref's metadata, OpenAlex's open copy, retraction mark and citation count) or typed in by hand, with the
  bibliography and the in-text citation in the chosen style; a search of OpenAlex by words; **export** to Markdown and
  BibTeX.
- **Capture:** `/capture/?title=&text=&url=` keeps what was shared as a note in the inbox (`notes.inbox`, a column in
  COLUMNS) or straight in a research. **For the master:** `share_target` in `manifest.json` → `{ action: '/capture/',
  method: 'GET', params: { title: 'title', text: 'text', url: 'url' } }`.
- **The engine:** the open sources and citations are in `server/researches.ts` and `server/research-cite.ts` (16 tests,
  `server/test-research.mjs`); the Torah researcher (`research.ts`) is its Sefaria pack, as you suggested. The styles are
  formatted by our own code (no citeproc). Crossref's and PubMed's abstracts are not stored; OpenAlex is the backbone;
  Semantic Scholar not used. The contact address is the app setting `research.contact_email` (empty until the owner
  chooses one; then sent as mailto to OpenAlex and Crossref).
- Tables appended: `researches`, `research_notes`, `research_threads`, `research_sources`; routes `/api/research/list`,
  `/find`, `/new`, `/r/:id` (and its `notes`, `threads`, `sources`, `export`), `/threads/:id`, `/sources/:id`,
  `/of-note/:noteId` (next to the Torah researcher's `/api/research/ask|search|translate|word`, untouched).
- **For the master:** add `test:research` to `npm test`; `share_target` as above.
- **For design:** `research.css` for `.rx` (`.rx-item`, `.rx-inbox`, `.rx-threads`, `.rx-thread.open|answered|parked`,
  `.rx-note`, `.rx-links`, `.rx-backlinks`, `.rx-found-item`, `.rx-retracted`, `.rx-bib`, `.rx-source.retracted`,
  `.rx-cite` (the citation, left to right, its title in `<i>`), `.rx-add`); and `.cap` on `/capture/`. A new prefix,
  `rx-`, apart from the study room's and the restaurants' `rs-`.
- **Next steps:** 2, persistence and writing (the goals engine: a research as a goal, its daily thread; an outline
  from notes with citations; ✨ summaries, directions and drafts); 3, shared research (roles, history); 4, the toolkit and
  the field packs.
Status: done (on `ai-features`).

## 2026-11-13 – The research assistant: order, one engine, and the open sources' terms (master)

- **Order (ai-features):** goals part 1 is live; the research assistant v1 comes next; goals part 2 (the social layer) waits
  for a design proposal, since it needs the friends/approval and under-12 rules.
- **One engine:** `server/research.ts` becomes a shared core (sources, search, citations); the Torah researcher is one source
  pack (Sefaria), the academic researcher another. PDFs to Drive use the same incremental `drive.file` grant as notes.
  "Share to הָאֹהֶל" from the phone: ai-features builds a receiving page (`/capture/`, GET title/text/url), then the master
  adds `share_target` to `manifest.json`.
- **The sources' terms (checked by the master):** OpenAlex (CC0, polite pool with a contact email) is the backbone; Crossref and
  PubMed metadata are free, but abstracts are publishers' copyright – shown, not stored in bulk; PubMed: `tool` and `email`,
  3 requests/s without a key; arXiv: metadata CC0, one request per 3 s, their acknowledgment shown; Unpaywall: an email
  parameter, CC0. **Semantic Scholar is not used:** its API licence allows non-commercial research only (commercial needs an
  expanded licence from AI2), and the public version will be paid. **CSL styles** are CC BY-SA 3.0; **citeproc-js** is
  CPAL/AGPL (copyleft) and is not adopted without the master – the few styles needed (APA, MLA, Chicago, Hebrew) are
  formatted by our own code from CSL data.
- **Open with the owner:** which contact email the APIs get (not the owner's private address); a setting holds it until then.
Status: Decided (master), the email open.

## 2026-11-13 – Goal management v1, the first part (ai-features → master, design, vision)

Vision's spec v1 (`docs/vision/goals.md`). Built in `/tools/tasks/` ("ניהול מטרות"; the tools tile is live, no
longer "בקרוב"):
- **The structure:** goals (short, regular, long) → processes (checklists) → small steps, each person's own.
  Tables appended to schema.sql: `goals`, `goal_processes`, `goal_steps`, `goal_reviews`, `goal_badges`. Routes
  `/api/goals` (the dashboard's data, add, change, delete), `/api/goals/template`, `/api/goals/review`, processes and
  steps, and ✨ `/api/goals/ai/plan` and `/api/goals/ai/stuck`.
- **The logic** (`server/goals-logic.ts`, 34 tests in `server/test-goals.mjs`): the rest day by tradition (prefs
  `me.religion`, or the person's own in prefs `goals.rest`), the forgiving week ("1 מתוך 6", the rest day out of the
  count), a streak the rest day never breaks, the "why" after two quiet working days, the weekly review on the day
  before the rest day, today's 2–3 steps, eleven templates without AI (the tent itself among them), and the badges.
  The family badges and "גשש" are listed as "בקרוב".
- **The page:** the dashboard; a new goal in five steps (written or spoken through the browser's own speech-to-text);
  "היום"; a goal's checklists; "נתקעתי" (a guided question and starters, or ✨ suggestions) that adds a 5-minute step
  before the stuck one; the weekly minute; the badges gallery (secret ones a silhouette); the rest-day picker.
  For the owner, the empty dashboard offers "⛺ להתחיל במטרה של האוהל".
- **Not in this part:** sharing, following a friend, advice and likes, family goals with roles, family templates; a step
  as a calendar event, a shopping item or a gathering; ✨ better transcription; push reminders. The reminders for now
  are in the app itself (today's steps and the "why" on opening).
- **For the master:** add `test:goals` to `npm test`; in `apps.js` (design's) the tile's name "ניהול מטרות". For push
  reminders later: web push in `public/sw.js` and VAPID keys (yours and the owner's); the goal's `time` is stored ready.
- **For design:** `goals.css` for `.gl` (`.gl-today`, `.gl-why`, `.gl-review-due`, `.gl-pulse`, `.gl-goals`, `.gl-goal`,
  `.gl-kind.short|regular|long`, `.gl-bar`, `.gl-process`, `.gl-step` (`.done`, `.small`), `.gl-stuck`, `.gl-mic`,
  `.gl-badge` (`.on`, `.secret`, `.soon`), `.gl-empty`); the embroidered badge patches (the spec's style); the inline
  rules only hold the layout until then.
Status: done (on `ai-features`); the second part waits for the owner to try this one.

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

## 2026-11-13 – Three special companions, paid (the owner)

The owner wants all the figures, and three special paid ones – a man, a woman and neither – worth paying for. From the
options design proposed (each special in a different way) he chose: הקוסם מהשוק (a trick: a dove from his hat when
something is achieved), האסטרונומית (her shawl lights up with stars at night) and בובת הטלאים (the person's own badges
sewn on her – a figure that looks different for everyone). Drawn and built on design (00bdf33); how to wire them is in
docs/design/figures-2d.md. Status: done (design), for ai-features to wire.

## 2026-11-13 – The default companion is פנק (the owner)

From the preview of the four simple companions (https://claude.ai/artifact/1VZvspHAQp7Pd5Ww9m96fF), the owner chose the
fennec, פנק, as the default figure for every family but his own (his stays Ibn Ezra). `Figure2D.DEFAULT = 'fennec'`
(public/assets/figure2d.js); ai-features uses it as the default in settings and the companion. Status: decided.

## 2026-11-13 – עוזר מחקר: research.css fitted to the live page; capture.css; goals.md changed since 3e565c9 (design → ai-features)

- `research.css` now styles research.js as it runs (8ecf53b): `.rx-item`, `.rx-inbox` / `.rx-inbox-item`, `.rx-note` with
  `.rx-links` / `.rx-backlinks`, `.rx-add`, `.rx-thread.open/.answered/.parked` with `.rx-status`, `.rx-found-item`,
  `.rx-retracted`, `.rx-bib > .rx-source(.retracted)` and `.rx-cite` (left to right, the title in italics). Design's own
  prototype classes moved off them (`.rx-caps`, `.rx-q`, `.rx-qstate`, `.rx-notefull`, `.rx-srcs` / `.rx-src`, `.rx-fn`).
  Checked against the page (sample data) at 375, light and dark. The page needs
  `<link rel="stylesheet" href="/tools/research/research.css">`.
- `public/capture/capture.css` for "שמירה לאוהל" (`.cap`, `.cap-done`): the page needs
  `<link rel="stylesheet" href="/capture/capture.css">`.
- **Goals, before moving goals.js onto docs/design/goals.md:** goals.md changed after 3e565c9 – badges are earned with
  `.on` (no `.locked`), the badge files carry the server's ids (`/assets/badges/peg.webp` …, the secret one
  `the_way.acc4adef.webp`), and design's today card is `.gl-tstep` (yours, `li.gl-step`, keeps its name). Read the current
  goals.md. Two badges were redrawn at the owner's word (dawn, standing); eight more come after the image tool's cap.

## 2026-11-13 – עוזר מחקר: the look of the core; goals fitted to the live page (design → ai-features)

- **The research assistant, step 1 (the core):** `public/tools/research/research.css`, the prototype
  `docs/design/prototype/research.html` and the markup in `docs/design/research.md`: quick capture and the inbox, one
  thread a day, each research as a card with a small constellation of its notes (a preview of the knowledge map), a note
  with its links, citations, sources with reliability marks (in words), the researches it lives in, and its backlinks; all
  the open threads by research; and "לשתף את הפתק הפרטי הזה?". Prefix `.rx-`. The map, the PDF reader, the writing view,
  the matrix and the timeline come with the later steps.
- **Goals:** `goals.css` now styles goals.js as it runs (daaabe2), and design's own names moved off the classes it uses
  (`.gl-tstep`, `.gl-alldone`, `.gl-reason`, `.gl-stuckbox`; badges are earned with `.on`). The badge files carry the
  server's ids (`peg.webp`, `ember.webp` …, the secret one `the_way.acc4adef.webp`). For ai-features: link goals.css in
  `public/tools/tasks/index.html`, show `<img src="/assets/badges/<id>.webp">` instead of 🏅 (secret: `secret.webp` until
  earned), and drop the inline styles. The recipe check's `.fix-smart` and `.fix-missing` are styled in groceries' style.css.
Status: done (design's part).

## 2026-11-13 – ניהול מטרות: the look, the prototype and the embroidered badges (design → ai-features)

For the goal-management spec v1 (vision, approved by the owner). Design's part is ready for ai-features to build on:
- `public/tools/tasks/goals.css` – every screen: the dashboard (each goal a filling ring and a path of stations on a
  thread, the forgiving week "4 מתוך 6" with the rest day as a candle), a goal's page with a checklist per process,
  today's 2–3 big steps, the why coming back, "נתקעתי", the weekly review, the five-step new goal (write or record,
  length, processes, first steps, rhythm), and the badge wall with a glass card for the way to each badge.
- `docs/design/prototype/goals.html` – all of it working, with the owner's first goal (the tent) as the example;
  `docs/design/goals.md` – the markup for each part (ai-features copies it), and how to show a badge earned, in
  progress, secret or just earned.
- The badges: 15 of 23 embroidered so far with the image tool ($1.03); the other 8 after the tool's daily cap resets
  (listed in goals.md; `secret.webp` stands in meanwhile). The secret badge's real picture has an unguessable name, to
  be sent only once earned.
For ai-features: the page (`public/tools/tasks/index.html` and its JS) needs `<link rel="stylesheet" href="/tools/tasks/goals.css">`.
Status: done (design's part); ai-features builds the logic.

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

## 2026-11-13 – Prices: ₪10 for a paid figure, ₪400 for a personal figure, more for the special ones (business)

**Decided (the owner):**
- **A paid figure** (Mary Shelley, Leonardo, Cleopatra, Dracula) costs ₪10 in credits. Design measured 15–20 minutes of
  work, so a figure covers itself after about 14 sales.
- **A personal figure** costs ₪400. Design measured 45–75 minutes, which comes to ₪300–500 at the 30/30/30/10 split.
  Revisit after the first five founders' figures.
- **The very special figures** (seven: הקוסם, הרואה (renamed 2026-11-14), בובת הטלאים, קוסם הלילה, קוסמת היער, הקוסם הקטן,
  הקוסמת הקטנה; design's entry on `design`)
  cost more than a paid figure.
  - **₪20**, the same as one ₪20 pack. Approved by the owner (via the master, 2026-11-14), and live in cache v57 as
    the setting `figures.special_price_ils`, for all seven.
- Founding members get the special figures too (paid items with no per-use cost).

**Affects:** ai-features and master (`server/figures-rules.ts`, the paid list): the price per figure in credits, with
the special ones in their own price group.

**Status:** Decided (the owner).

## 2026-11-13 – How money is collected: one credits wallet, an Israeli provider, standing orders (business)

**Decision:**
- **One wallet.** Credits become the one currency for everything sold in the app: AI, paid figures and skins. People buy
  credit packs; a figure or a skin is bought with credits.
  - Why: the fixed fee per transaction (about ₪1) takes ~14% of a ₪10 figure paid on its own, and ~4.4% of a ₪50 pack.
  - This widens business decision 2 (credits go down by `costOf`): AI still goes down by its metered cost, and figures
    and skins by their price in credits.
- **Israel: one Israeli payment provider.** Card, Bit, Apple Pay and Google Pay, standing orders for monthly supporters,
  an automatic receipt for every payment, and a webhook that adds the credits.
  - Before choosing, get quotes from Grow, Sumit and Cardcom (decision 5 stands; this is how it gets chosen).
- **Monthly supporters** pay by a standing order on a card, cancellable any time on the site the same way they signed up.
  Each month adds credits by level.
- **Abroad, only when there is demand:** a Merchant of Record such as Polar (it pays out to Israel) or Paddle.
- **The stores (stage 6):** in-app purchase, in the small-business programme (15%).
- **No GoFundMe** (it does not pay out to Israel) and **no Patreon** for now.
- **Before the first payment:** a tax file (עוסק פטור while turnover is under ₪122,833 in 2026), receipts, the
  remote-sale disclosures, terms of use and a privacy policy. It is called "support", not "donation" or "investment".
- **Skins** are cosmetic variants of figures, about ₪3–5 in credits; holiday skins are free.

**Why:** cheapest for customers in Israel, and the provider handles receipts. The legal points are in
`docs/business/monetization.md`, marked for an accountant and a lawyer.

**Affects:**
- **Master:** the provider integration (payment page, standing order, webhook, self-service cancellation), the terms.
- **ai-features:** buying a figure or a skin with credits, and keeping who owns what on the server.
- **design:** the purchase page (business details, price, cancellation terms), the skins.

**Status:** Decided (the owner). The provider is chosen after the quotes; the skin price is a draft.

## 2026-11-13 – Recognition and support tracks, titles beside badges (business)

**Decision:** the tracks in `docs/business/founders.md`:
- **Founding members** (חברים מייסדים): organised a real gathering in the beta with at least 5 confirmed RSVPs.
  - Four levels by the order in which they qualified: the first 10, up to 50, up to 100, and the rest within the
    window.
  - For life: a title, one personal figure, monthly AI credits up to a 3-month ceiling (more for the first levels), a
    10GB album, and every paid item with no per-use cost (public-domain paid figures and skins, not licensed ones).
  - The owner approves the list at the end of the window.
- **The millionth** person to meet that condition gets a unique title, as a surprise.
  - The count goes on for ever, after the founders' window closes.
- **Founding supporters** pay once in one window and get free access for life. The value is set later, at the public
  launch.
- **Regular supporters** pay monthly in levels (draft: ₪10 / 25 / 50). Each level gets the credits of a pack of the same
  sum, plus recognition.
- **Angels** (partners, translators) are chosen by the owner, with benefits only while in the role.
- **האור לפני המחנה** (the improvement programme): signed up, with explicit consent to send error data, and consistently
  reporting or helping. Benefits only while active.
- **A title beside the badges:** one title next to the name, with the badges the user chooses to show. Anyone can hide
  them. They are shown in the profile, the tree and RSVPs, not in links shared outside.
- **Accounting:** the free tracks are a marketing cost, like gifted credits (outside 30/30/30/10). Paid tracks are
  income.

**Why:** thanks to the people who light the fire in the beta, a reason to invest, and bounded costs (no unlimited AI).

**Affects:**
- **ai-features, now:** from the first real gathering, record the moment each gathering reaches 5 confirmed RSVPs (and
  its organiser). The order of the founders and the millionth both come from it, and it cannot be rebuilt afterwards.
- **ai-features, by the end of the beta:**
  - a track and level per account, titles and badges (owned, shown, hidden);
  - a monthly top-up of credits up to a ceiling, on the gift mechanism (`ai_credits`, a source per track);
  - an early-access flag;
  - lists for approval in the owner's room, and "end of role" for angels.
- **design:** how a title and badges look beside the name; a "who founded האוהל" page; the 2D personal-figure process,
  timed.
- **Master:** what "for life" means, in the terms of use.

**Status:** Decided (the owner). Drafts still open: the level names (עמוד / יתד / חבל), the exact amounts, the
supporters' levels, and the founding supporters' value.

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

## 2026-11-13 – Russian and Amharic: after the family launch, before the closed beta (vision, the owner via the CEO)

**Decided:** הָאֹהֶל becomes accessible in Russian and Amharic, after the family launch and before the closed beta.
The owner approved the order through the CEO.

**The spec** (`docs/vision/languages-ru-am.md`):
- **Translated:** the interface, the wizard, the badges and titles, the assistant's prompts and answers, and voice.
- **Amharic voice** (text-to-speech and speech-to-text) is still to be checked; without it, text only.
- **Direction:** both languages are left to right, with `dir` and `lang` set per language.
- **Fonts:** Rubik's Cyrillic for Russian; an Ethiopic font, such as Noto Sans Ethiopic (OFL), for Amharic.
- **Choosing the language:** in the wizard's first step and in settings, defaulting to the browser's language.
- **Translation:** a Gemini draft, approved by a native speaker, with a fixed glossary per language.
- **Infrastructure:** one translation infrastructure for every language, Arabic and English included.

**Affects:**
- **The CEO:** the translation infrastructure, `dir` and `lang`, and the audit in both directions.
- **Design:** the fonts and the left-to-right layout.
- **ai-features:** the prompts and voice per language.
- **Business:** recruiting the native speakers.

**Proposed, not yet decided:** Sigd in the calendar, and Novy God as an optional family event.

Status: Decided (the owner).

## 2026-11-13 – The road to the parents: the joint run now, the parents first, the wizard first (vision, the owner)

Answered in the department heads' round:
1. **The joint test run** (readiness bar, condition 5) starts now, in parallel with the CEO's speed measurement.
2. **The parents see הָאֹהֶל first,** once it passes the bar: a small, forgiving circle, before the extended family. It
   is a first step inside business decision 10 (the beta in the owner's extended family), not a change to it.
3. **The first-minute wizard is built before the social layer,** since it is what the parents see first. The social
   layer (goals part 2) follows.

**Affects:**
- **ai-features and design:** the wizard first.
- **Business:** the beta begins with the parents; its clock and metrics start with the extended family.
- **Vision:** the joint run starts now.

Status: Decided (the owner).

## 2026-11-13 – The social layer, the first minute, and the app icon (vision, the owner)

Three decisions, read back and confirmed together. Details: `docs/vision/social.md` and `docs/vision/first-minute.md`.

**1. The social layer.** It unblocks goal management, part 2.
- **Friends:** a friend can be invited by link even without an account, or connected inside the app. Either way they
  join the friends list.
- **"You are related":** when a friend turns out to be a distant relative through the forest, the app tells both of
  them, within the tree's privacy (each person's levels and anonymity).
- **Following:** a friend's progress posts.
- **Likes:** hearts, as on Instagram.
- **Advice:** a short open message.
- **A family goal:** a shared goal of two or more family members.
- **The existing rules hold:** a friend connects only with both sides' approval; children under 12 get no messages or
  advice from outside the family.

**2. The first minute.**
- A new user goes through a setup wizard that is playful, tight and smooth: "built like a game, runs like an app",
  with motion, physics, haptics and sound. The reference is the feel of notbor.ing, not its look.
- The steps: name, religion and calendar, city, colour theme, choosing a figure, and creating or joining a family.
- Then the home page and discovery. The owner: "a little overwhelmed by the options, but happy and curious".
- Proposed: a "סייר" (explorer) badge, and "you've discovered 6 of 18 tools".

**3. The app icon.**
- The ordinary icon is a small tent, based on our tent.
- The current family-logo icon appears only in the owner's account, and a toggle in an owner-only "secret settings"
  turns it off.
- Inside the app this is per user. The home-screen icon of an installed PWA is fixed when it is installed, so the
  master serves the manifest and the Apple touch icon per signed-in user.

**Affects:**
- **ai-features:** friends, following, likes, advice, family goals, the wizard's logic, discovery.
- **Design:** the social screens, the wizard's game feel, the tent icon.
- **The master:** the per-user manifest and icons, the owner's secret settings, and the order (goals part 2).
- **Legal, later:** advice and messages between people, and minors.

Status: Decided (the owner).

## 2026-11-13 – The readiness bar: הָאֹהֶל is shown to the family only when it passes (vision, the owner)

The owner: "I want to feel high graphic quality, high-quality finishes with animations and smooth, working interfaces.
Full functionality with a fast response time: an app I would want to use every day." Confirmed as a measurable bar.

**The bar (all five must pass before the family beta):**
1. **Graphics and finish:**
   - every item in design's style check is ✅, and nothing is outside the one style (the companion figures follow their
     own decided rules);
   - `tools/audit.js` is clean on every page, at 375 and 1280 px, by day and at night.
2. **Smooth motion:**
   - every transition, card and sheet runs without jank on a mid-range phone (the target is 60 fps);
   - no layout shift while loading.
3. **Speed, by Google's "good" thresholds:**
   - the first screen in ≤ 2.5 s on 4G (LCP);
   - response to a tap in ≤ 200 ms (INP);
   - layout shift ≤ 0.1 (CLS).
4. **Full functionality:**
   - no visible "בקרוב" pages: each is finished or hidden;
   - no errors;
   - the core flows work end to end: sign-in, a gathering with an invitation and RSVPs, the shopping list, recipes,
     the family tree, goals and research.
5. **A joint test run (the owner changed this from "two weeks of daily use"):** the owner and the vision session go
   through every core flow together, on a phone and on a PC: sign-in, a gathering, shopping, recipes, the tree, goals,
   research and settings. Every friction point goes into a batch. After the fixes there is another run, until the owner
   feels it is ready.

**Affects:**
- **The master:** extend `tools/audit.js` (or add a tool) to measure speed and motion (LCP, INP, CLS, long frames) on a
  phone profile, and report each page against the bar.
- **Design:** finish the style check and the motion.
- **ai-features:** speed of the pages and the API, the "בקרוב" pages, and the core flows.
- **Business:** none, beyond the beta's start date moving with the bar.

Status: Decided (the owner).

## 2026-11-13 – Companion figures: the free list and the paid list (vision, the owner)

This updates the entry below: there are also certain paid figures, not only the personal one. The owner's lists:

**Free:**
- Ibn Sina (Avicenna);
- the Rambam;
- Newton;
- Juha (ג'וחא);
- Hershele Ostropoler;
- Scheherazade;
- Ali Baba;
- Peter Pan;
- every animal in our own design;
- every holiday figure.

**Paid, inside the app:**
- the user's own personal figure (or the "free for life" bonus);
- Mary Shelley;
- Leonardo da Vinci;
- Cleopatra and Dracula. The owner asked for them "extra sexy"; how far that goes is still open with the owner. See below.
- sports-team figures, and figures from popular video games, films and series. These are to be checked against
  partnerships, keeping copyright and the law in every case.

**Rules that apply:**
- 2D, in the tent's style. Ibn Ezra stays the family's 3D exception.
- Draw from the original source, never from a known adaptation (Disney's Peter Pan, Universal's Dracula).
- The `historic-figures` skill: long-dead people only, and respectful depictions.
- **Licences:** team names and logos are trademarks, and games, films and series are copyrighted, so each of these
  needs a licence or a partnership before it is sold.
- **Peter Pan:** the United Kingdom has a special perpetual right; to be checked.

**Cleopatra and Dracula:** one version for the app, safe for work and charismatic (presence and glamour, not sexuality),
paid, for everyone. The owner also asked for a very explicit version as a private easter egg for himself only. The
vision session did not pass that on: Gemini's terms forbid sexually explicit images, which would put at risk the key the
whole app's AI runs on, and the files would sit in a family app's code and storage, where children use it.

**Affects:**
- **Design:** the figures.
- **ai-features:** which figures are free and which paid, and the purchase.
- **Business:** the paid catalogue (this partly reverses the business change de719b4: not only the personal figure
  is paid), licensing and partnerships, and the risks.

Status: Decided (the owner).

## 2026-11-13 – Companion figures: everything to choose from is free; only a personal figure is paid; Ibn Ezra belongs to the owner's family (vision, the owner)

**Decided:**
- **Free:** every figure a user can choose. That means:
  - the simple, cute figures;
  - the generic ones;
  - the figures unlocked by badges;
  - the holiday and event figures.
- **Paid:** only a personal, custom figure, made like our Ibn Ezra but of the user's choosing, including someone they know.
  It is either a paid feature or a bonus in a "free for life" track for people who invested in the app.
- **Ibn Ezra is unique** and belongs only to the owner's family. Other families do not get him.
- **How the free figures are made:** they must be far cheaper to make than Ibn Ezra, and still dynamic and smoothly
  animated.
  - **Style:** 2D, in the tent's style (the one-style decision). The owner's choice over a simplified 3D vinyl.
  - **Making them:** drawn through the image tool and split into layers; animated in code (breathing, blinking,
    nodding, a talking mouth, a response to touch). There is no 3D or Blender pipeline for them.
- **This replaces "companion packs"** as a paid item. The earlier decisions listed them as a paid extra and per-user
  purchase: the entry "Product direction", item "The core is free for everyone", and business decision 6.

The owner's words: "זה מה שהתכוונתי. רק הדמות האישית בהתאמה בתשלום או כבונוס. הדמות של ראב"ע היא ייחודית ושייכת רק
למשפחה שלי."

**Affects:**
- **Design:** the free figures, following `figure-style`; a default companion for families other than the owner's.
- **ai-features:** which figures each user sees; Ibn Ezra only in the owner's family; unlocking by badges.
- **Business:** the revenue model without companion packs, and modelling the new "free for life" track (who gets in,
  when, and what it gives).
- **Risk, for business:** a personal figure of a living person, especially someone outside the family, needs that
  person's consent (`docs/business/risks-and-rights.md`).

Status: Decided (the owner).

## 2026-11-13 – The research assistant (עוזר מחקר), spec v1: approved for building (vision, the owner)

The owner specced the research assistant with the vision session and approved it ("add formatting and academic writing,
then send"). Full spec: `docs/vision/research.md`, section "האפיון, גרסה 1".

**Purpose:** real research, academic or personal, helping where researchers get stuck: organising accumulated knowledge
and linking it, open threads, writing, and persistence. It shares one engine with goal management, because a research is
a kind of goal.

**Units:**
- **A research** has a purpose (article, book, lecture, post, coursework, personal knowledge, family history), a citation
  style and an export target.
- **A note** is one unit of knowledge with its sources. One note can belong to several researches (the same note, not a
  copy), with links and backlinks.
- **A question or thread** has a status: open, answered or parked. One screen shows all open threads.
- **A source** holds its metadata, a PDF in the user's Drive, highlights and quotes, and a reliability mark.

**Flow:**
- Capture from anywhere ("share to הָאֹהֶל") into an inbox.
- Sort into notes and questions.
- A knowledge map in the forest's visual language.
- An outline built from notes, with citations and bibliography automatic.
- Export to Word, Google Docs, LaTeX/BibTeX, Markdown, PDF or slides.
- CSL citation styles; BibTeX and RIS import and export, so it works alongside Zotero and Mendeley.

**Persistence:** goal management's daily steps, plus "one thread a day" on Today; the weekly review; "נתקעתי"; the "why";
a research journal; and badges (including "גשש").

**Shared research:**
- Roles per research: owner, editor, contributor and reader.
- An edit history, with restore.
- A private note linked into a shared research asks every time whether to share it. If not, the collaborators see only
  a reference.
- The existing rules apply: friends connect only with approval; no one outside the family for children under 12.

**Toolkit:**
- **Core:**
  - add a source by DOI, ISBN or link;
  - a PDF reader whose highlights become notes;
  - finding an open-access copy;
  - the citation chain;
  - alerts on new publications;
  - a literature-review matrix;
  - a glossary;
  - a timeline;
  - a quote collection;
  - source reliability and retraction checks;
  - exporting the whole research as an archive.
- **Domain packs:**
  - language: root search, concordance, textual witnesses, dictionaries, IPA;
  - social research: qualitative coding, data and descriptive statistics, ethics;
  - biology: PubMed, taxonomy, databases, formulas;
  - translation;
  - **academic formatting and writing:** templates (journal article, seminar paper, thesis, research proposal), IMRaD,
    numbering and cross-references, footnotes, length limits, mixed right-to-left and left-to-right text, and style
    (checklists without AI; ✨ language editing and abstracts).

**Without AI:** open, free sources:
- OpenAlex, Crossref, PubMed, arXiv, Semantic Scholar, Unpaywall;
- Sefaria, Wiktionary;
- web search opening in an ordinary search engine.

**With AI (✨), through the user's own AI or credits:** focused search, summaries and comparison, directions and tasks,
drafts from notes, and translation.

**Before building:**
- check each open source's terms and licence;
- settle with the master how the Torah researcher (`server/research.ts`) and this tool share an engine.

**Suggested build order:**
1. The core: shared notes, questions, sources by DOI, capture, basic export.
2. Persistence and writing.
3. Shared research.
4. The toolkit and the domain packs.

**Affects:**
- **ai-features:** the module, tables and routes (appended and logged), the sources, and the page.
- **Design:** the screens, the knowledge map, the PDF reader, and the writing view.
- **The master:** scheduling, the shared engine with `research.ts`, the Drive scope for PDFs, and the share target in
  `manifest.json`.

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
   - Status: Decided. **Superseded in part on 2026-11-13** (vision, the owner, "Companion figures"): companion packs
     are free, and the family's own companion became a personal figure bought by a user. The album is unchanged.
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

## 2026-11-13 – Editing members from the back door (ai-features → master; roles and permissions, for review)

The CEO's task: in the חברים section the owner edits each member's name, household and role, and searches every household.
- New `server/member-admin.ts` and `server/member-admin-rules.ts` (33 tests in `server/test-member-admin.mjs`).
  Appended to `functions/api/[[path]].ts`: one import line and the routes `GET /api/admin/people` (`?household=` or `?q=`)
  and `PUT /api/admin/people/:email`. `server/admin.ts` now exports `log` and `owners`.
- Gates: `requireOwner` and `admin.requireAdmin('own')` on both. A role or household change also needs the room opened by
  an OWNER_EMAIL address (not a super), and `confirm: true`. Every edit is written to `admin_audit` (`member:edit`).
- **The roles.** "מנהל" (`members.role = 'owner'`) is global: it heads every household, names the tribe head, takes the
  vault's Drive backups and makes the design images. So only an OWNER_EMAIL address may hold it, it is never demoted or moved,
  and the last manager stays. "ראש בית" is a `family_roles` head row for the member's own household; "חבר" is everyone else.
  No change to the membership model.
- **"משק בית חדש"** (the CEO's addition): choosing it opens an empty household whose head is that member (a new tree that
  starts from nothing); a new household is never opened without its head. The AI allowance stays as it was.
- **The email is not editable.** It is the Google sign-in and the key of sessions, prefs, vault items, cards and allowance.
  A new address is added as a member and the old one removed.
- **For the master** (shared files, not changed here):
  1. Add `node server/test-member-admin.mjs` to `npm test`. The chain also has a typo:
     `test-family-profile.mjs&& node server/test-family-profile.mjs node server/test-family-profile.mjs`.
  2. `DELETE /api/members/:email` blocks only yourself. Proposed: refuse an OWNER_EMAIL address and the last manager
     (`mayRemove` in the rules file).
  3. `POST /api/members` is an upsert that sets `household` and `role` on an existing member. Adding an existing manager's
     address demotes them, and `role: 'owner'` is accepted for any address. Proposed: `ON CONFLICT DO NOTHING` (editing
     goes through `/api/admin/people`), and role owner only for OWNER_EMAIL.
Status: ready on `ai-features`, waiting for the master's review.

## 2026-11-13 – The back door's tab, the usage line, a message to one member (ai-features → master; the lock and the session for review)

1. **A new route, `GET /api/admin/room`** (appended to `functions/api/[[path]].ts`): `{open, until, left}` for this device's
   room entry, open only if the entry is alive, is the signed-in owner's own (`as_email`) and its opener may still enter.
   It **only reads**: it never touches `last_at`, so it never keeps the room open. `until` is `entryUntil` in admin-rules.ts
   (the idle limit, or two hours with "stay"; 30 minutes for a visit). 5 new tests in test-admin.mjs.
2. **The tab, `public/assets/admin-tab.js`** (ai-features). admin.js writes the localStorage mark `helper.adminRoom {ends}`
   when the room opens from the owner's own account, and removes it at the gate (נעילה, a timeout, any refusal). On other
   pages the tab asks `/api/admin/room` and shows only while the entry is open; closed, refused or signed out: it hides and
   forgets the mark; offline: it hides and asks again later. It re-asks when the entry would close and when the page is shown again.
   The idle rule goes on while the owner is elsewhere, so in practice the tab lasts three minutes after the last action in
   the room (two hours with "stay").
3. **For the master, `common.js`**: three lines that load admin-tab.js only when the mark is there, never on `/admin/`, in
   the vault or in a frame. The patch is in the notes folder (`ai-features-admin-tab-common.patch`). `sw.js` may want
   `/assets/admin-tab.js` in its cached list.
4. **For design**: `.ad-edge` (the tab: `a.ad-edge > .ad-edge-ic + .ad-edge-text`; until then an inline fallback at the
   inline-start edge under the top bar), `.ad-fold` (the folded usage card: `details.ad-fold > summary` with an inline h2 and a
   summary line), and the suggestion list under the class `.ad-sugg` as well as `#ad-sugg` (the messages' combobox is
   `#ad-sugg-to`; a small inline fallback until then).
5. **A message to one member**: `POST /api/admin/messages` takes `to` (an email); it must be on the members list (400
   `not_member`), goes into `admin_messages.to_email`, and is logged as `message:one`. The room's list now shows personal
   messages too (with `to_name`), except the room's own notes to the owner (`by_email = 'system'`).
## 2026-11-13 – Messages between members, הודעות v1 (a side session for the CEO; data exposure, for review)

The owner asked for messaging between users. One on one, text only, no groups.
- **Who may write to whom** (the CEO's default; the owner may change it): the members of one's household, and the users of
  the app in the trees joined by confirmed bridges (the tribe). No one else can be found or written to. Outside the
  household a contact comes only from the forest as `forestFor` shows it (a user, not anonymous, identity not hidden), so the
  list never shows more than the forest search. Without the tree open on the device, the list is the household only.
  The reach rule is checked again on every send: an undone bridge or a block stops the writing, never the reading.
- **Privacy.** Only the two sides read a conversation; to anyone else, the owner included, it is a 404. The page never gets
  an email (names, opaque ids). The back door has `GET /api/admin/dm-stats`: four counts, no name or word. A block works both
  ways. Rate limits (`rateLimit`): 20 messages a minute, 500 a day, 30 new conversations an hour, 30 contact lists a minute.
- **Files.** New `server/dm.ts`, `server/dm-rules.ts` (tests: `server/test-dm.mjs`), `public/messages/` (the page),
  `public/assets/dm.js` (the chip's dot and the tools menu entry, polling `/api/dm/unread` once a minute while in front).
  Appended: the tables `dm_threads`, `dm_messages`, `dm_blocks` to `schema.sql`; one import and the `/api/dm*` routes plus
  `/api/admin/dm-stats` to `functions/api/[[path]].ts`.
- **ai-features' file:** `forestFor` in `server/vault/index.ts` returns one more field, `emailOf(p)` (the user behind a card,
  server side only, never sent to a page). Two added lines; nothing else changes there.
- **For the master** (shared files, as a patch in the side session's notes, `dm-ceo-hooks.patch`): load `/assets/dm.js` in
  `common.js` next to `reports.js`; the "הודעות" tile in `apps.js` (`ic: 'mail'` until design draws an icon); `test-dm.mjs`
  in `npm test` and `test:dm`. CACHE not bumped.
- **For design:** the page holds its layout with an inline `<style>` (`.dm`, `.dm-list`, `.dm-thread`, `.dm-row`, `.dm-msgs`,
  `.dm-msg.mine|theirs`, `.dm-day`, `.dm-compose`, `.dm-pick`, `.dm-note`); please move it into a `messages.css` with the real
  look. `dm.js` injects `.dm-dot` (the reports' `.mi-dot` look, its own class so `reports.js` never clears it, at the chip's
  bottom corner) until it is in `base.css`. An icon for the tile. Which side "mine" sits on (now the start, the right) is yours.
Status: on the side session's branch, waiting for the CEO's review and the owner's OK before any push.
