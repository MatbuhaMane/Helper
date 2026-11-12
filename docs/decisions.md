# Decisions

A shared log of decisions that affect more than one area. Every session adds an entry here when it decides something
others must know: a shared file it needs changed, an API another area uses, a design token, a price or a quota, a new
table or route. Newest first. The master reads this before each merge.

Format:

```
## YYYY-MM-DD – short title (area)
What was decided, why, and what other areas must do. Status: proposed | accepted | done.
```

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
      than two members of an average family are active each week.
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
- Open with the owner: whether the calendar link includes the tree by default (today it does), and the Workers plan (CPU per request).
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
