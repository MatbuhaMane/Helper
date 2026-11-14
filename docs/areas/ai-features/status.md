# Status – ai-features

Updated by the department at the end of every meaningful round of work. Short: the master reads it for the board meeting.
Last update: 2026-11-14 (פרנסה phase 1, ready for the CEO's server review).

## Done

- **פרנסה, phase 1 (2026-11-14), on `ai-features`, ready for the CEO's review of the server:** 41e5af3 server (6 tables, 14 routes, rules + test-parnasa 68),
  ed6d47d prices from Yahoo + fixes, 249b577 the page (dashboard, one-tap entry with a guessed category, recurring, the shared קופה
  by invitation within the household, bank/card import with review, investments, Claude-only tips on sums by category), 945198f decisions,
  and the master's apps.js entry (patch in the shared notes). Checked: isolation by API with three users (another household 404 everywhere,
  no emails reach the page), import of a card file, the audit at 375 and 1280 in light and dark (clean). Needs: test-parnasa in npm test
  (master), and design's styles for .pr-invite, .pr-foot, the review's flip toggle and the manage lists' rows.
- 2026-11-14: family tree documents open on a phone (saved, so the phone opens them in its own viewer; on a computer the window opens in the tap); the welcome wizard change reverted (the owner: not a bug, רַאבַּ"ע stays in the settings).
- **עץ מבנה (2026-11-13), on `ai-features`, ready to merge:** e5547a8 server (site_layout versions, eggs, egg_finds, routes,
  pure layout-rules + test-layout 74), 6acb646 the back door's tab (tree drag by pointer/touch and keyboard, edit panel,
  the fire, versions, preview) + eggs.js (eggs on pages, the preview bar), and 6144659 the master's commit (apps.js merge layer,
  common.js H.PARTS + eggs.js load, test-layout in npm test; patch in the shared notes). Checked: API end to end, the tab
  at 375 and desktop, light and dark, the preview on /food/, an egg found and gone. Needs design's styles (decisions.md).
- **The free helper (2026-11-13), on `ai-features`, ready to merge:** 80daff4 the three-step Gemini guide (402 invitation +
  settings, paste on coming back, one field if the clipboard is blocked); 2f31551 the welcome's gift line + a test that
  invite joiners start limited (test-credits 54). Checked at 375 and desktop with a stubbed "connected" (a real key
  was not tried). c3518e1 moves it to design's `.gk` (db03b95); needs a style for `form.gk-paste`.
- **Third round (2026-11-13): the family tree (Ivri could not delete), on `ai-features`, ready to merge:**
  faa5744 rules + tests, 5f9f12d `vault/access.ts` (the master's, patch in the shared notes), b59e54b server/table/routes,
  c0151e5 the pages. A non-user goes at once with "בטל" (10 s); another user's card or relationship waits for their
  "אשר"/"דחה" (a message is sent; the proposer sees "ממתין לאישור"); the owner restores from the back door
  ("שחזור מהעץ"). Delete and edit are now also on the tree's own card. Tests: kin 95, access 204, e2e 30. Checked at
  375 and desktop. de3f97e moves it to design's `fv-*` markup (f35a140), with whom a request waits for.
- **Second round (2026-11-13), on `ai-features`, ready to merge:**
  - **The record** (6f7760b, `music.js`): on the home page it is on the stump from the start, with no player connected,
    also for someone whose saved place is the menu or whose prefs arrive late; a tap with nothing loaded opens the player.
  - **Invitations + access requests** (09c214b panel in design's `.bd-inv`; 778aec5 "נפתחה" and 285e61a `access.decide`,
    both the master's files, for review): pending requests on top with "הזמן" / "דחה"; filters with counts. Tests: join 48.
  - **Design's classes**: study's marked verses carry `.mk` (+ `data-mk` verse/rest/chapter); fun's remembered tab
    scrolls into the row. The look needs design's 2802a9f merged too.
- **The first user feedback, 4 tasks (the CEO, 2026-11-13), on `ai-features`, ready to merge:**
  - **בידור** (68468e7): a "מצחיק ואמיתי" filter (real clips from Reddit/Lemmy, AI and staged words filtered out), infinite
    scroll; a load or refresh brings only what this device has not seen (3 days). Tests: test-fun 17.
  - **הקפדה** (a4da0a6): weight and height can be changed from the weight card ("עריכה"); a new weight is logged for today.
  - **פרשת השבוע** (0accd99): the chapter bar follows the reading; a tap on a verse's number marks it, then to the
    chapter's end, then the whole chapter, then clears; a tap on the text marks nothing (a word still opens the dictionary).
  - **הזמנות מבחוץ** (d35cf2b server, for the master's review – sign-in; 8642513 the panel and /join/): the owner makes a
    personal link, used once, into a household of its own; status, cancel, search in invitations and members. Tests:
    test-join 44 (27 new). The whole flow was checked locally with the dev sign-in (wrong address 403, one use, a replayed
    cookie 403, a guest cannot reach the back door).
  - **"האוהל התעדכן"** (9377b3a): public/assets/whatsnew.js; needs the master's loader line in common.js.
- **"איפה הבית?" from Google (2026-11-13):** while typing in the welcome's city step, up to 5 towns in Israel (Places
  Autocomplete, key on the server); a pick saves me.city and me.place {id, name, lat, lng, at}; the weather uses the point
  (30 days, then again by the ID); free text when not found or with no key. Tests: test-places 37. Checked at 375 with a
  stubbed answer (no key locally); a real Google call is not checked yet.

- **דיווח על תקלה, הצעה לשיפור, המשולש, שתי שקופיות** (the CEO for the owner, 2026-11-13), on `ai-features`:
  - shake works where `requestPermission` exists (iOS, newer Chrome): asked on load, else on the first tap; a seismic-style
    detector (13 m/s², 3/4 of half a second) instead of the jerk of 28;
  - `button.rp-alert` next to the chip (design 2d27099 in the same merge); the sheet's kind `bug | idea` (`reports.kind`);
  - the welcome wizard: the companion slide and the triangle slide after the name (the look is design's).
  - Not tested on a real phone: the iOS prompt, the threshold's feel, Android's answer, the vibration.
- **לשונית הדלת האחורית, שימוש מקופל, הודעה לחבר אחד** (the CEO, 2026-11-13), on `ai-features`, waiting for the master:
  - `GET /api/admin/room` (read only, never keeps the room open) and `public/assets/admin-tab.js`; the mark `helper.adminRoom`
    written by admin.js from the owner's own account only; נעילה ends the entry and the tab; the common.js lines are a patch
    for the master (notes folder); the CSS (`.ad-edge`, `.ad-fold`, `.ad-sugg`) asked of design, inline fallbacks until then;
  - usage folded to one line ("3 מתוך 6 נכנסו השבוע · הכי בשימוש: …"), the choice kept in `H.prefs('admin').usageOpen`;
  - messages: "כל המשתמשים / למשתמש אחד", the members combobox (now one shared `combo()` in admin.js, used by both), `to` checked
    on the server (`not_member`), the list shows "ל: שם" and "נקראה / עוד לא";
  - checked on 8790: the tab on /settings/, hidden after נעילה and with a stale mark; the fold remembered; Dana alone gets her
    message; the members search after the refactor; 375 dark and 1024. test-admin 35, test-member-admin 62, typecheck clean.
- **החיפוש בכל הבתים** (the owner through the CEO, 2026-11-13), on `ai-features`, waiting for the master's merge:
  - every word must appear in the email, the Google name, the Hebrew name, the household's id or its title ("משפחת כהן");
  - suggestions under the box while typing (a combobox: arrows, Enter, Escape, Home/End), each with name, email and household;
    choosing one shows that member's row, Enter with none chosen shows every result (30 at most, built server-side);
  - "חיפוש מתקדם" (folded): household, role, signed in or not yet; the search comes back after an edit redraws the section;
  - the gate is unchanged (requireOwner + the room opened from the owner's own account);
  - `searchSql` in member-admin-rules.ts, 62 tests (25 new, run on a real in-memory SQLite);
  - checked on 8790: the suggestions, the keys, the filters, a role change keeping the search; 375 and 1280, light and dark.
  - for design: the list's look is inline in admin.js for now; please move it to admin.css (.ad-combo, #ad-sugg li).
  Not checked: a screen reader.
- **עריכת חברים** (the CEO, 2026-11-13), on `ai-features`, waiting for the master's review (roles and permissions):
  1. In חברים, the table shows my household. Each row has the Hebrew name, the display name, the household (a list, with
     "בית חדש…") and the role (a list: חבר / ראש בית / מנהל). A change of role or household asks first.
  2. A search across every household, by name or email, edits the same fields.
  3. The email stays read-only. The section explains why: it is the Google sign-in and the key of everything the member keeps.
  4. "מנהל" is global (members.role owner), so it is only for OWNER_EMAIL. The brother gets "ראש בית" of a new household instead.
  5. "משק בית חדש" in the household list opens an empty household with that member as its head; the AI allowance is unchanged.
  Server `server/member-admin.ts`; the rules `server/member-admin-rules.ts`, with 33 tests in `server/test-member-admin.mjs`.
  Every change is written to the audit log.
  Checked on the dev server (8790), with the back door and the vault opened in the local database:
  - the guards: no confirm, מנהל for another address, demoting the owner and changing an email are each refused;
  - the brother, end to end: moved to his own household as its head, with members.role still member;
    - a card with his email in our tree, and the bridge asked from our tree;
    - he signed in, saw the request, approved it with his own card, and it was confirmed with no consent step;
    - the forest shows both trees;
  - the audit log lines;
  - 375 (the card now stays inside the screen and the table scrolls) and 1280, light and dark: no overflow, the inputs have names.
  Not checked: a real passkey entry, and the live database.

- **תיבת פניות** (the CEO, 2026-11-14), on `ai-features`:
  1. A report from any page, by shaking the phone or from the menu ("דווח על בעיה" in the tools menu and in settings).
     The shake has a threshold of 3 sharp peaks in 0.9 s and a 4 s debounce. It is switched by "נענוע לדיווח" in
     settings, a per-user pref `reports.shake`: on by default where no permission is needed, and on iOS asked on the tap.
  2. The sheet says it goes to "צוות האוהל". It keeps the page, the time, the device, the theme, the width and the text.
     A screenshot is kept only when the person ticks it: on a PC a picture of the tab, on a phone an image from the gallery.
     The limit is 12 reports a day.
  3. In the back door, the tile "תיבת פניות" shows threads with the states חדשה / בטיפול / טופלה, filters, and a count
     on the tile. The answer is private.
  4. The person's inbox "התיבה שלי" has a red dot on the user chip and a count on the entry.
  Server `server/reports.ts`; the rules `server/reports-rules.ts`, with 61 tests in `server/test-reports.mjs`. The tests
  cover privacy (404 to anyone but the reporter) and the admin gate on every team handler. The companion's feedback
  lands here too.
  Checked on the dev server (8791):
  - send, list and screenshot;
  - another member gets 404 on the thread and on the picture, and so does a back-door user on the member route;
  - a reply sets בטיפול, the dot appears and clears after reading, and a bad state gets 400;
  - at 375 (list ↔ thread, the back button) and at 1280 (two columns), in light and dark: no overflow, contrast fine;
  - typecheck and `npm test` pass.
  The back door was opened in the local database as a test super (no passkey in dev).
  Not checked: a real shake on a phone and iOS's permission prompt, the tab capture's picker (it needs a real tap), and
  R2 on the live site (locally it ran on the local bucket).
  Waiting: the master's common.js hook (the dot and the shake on every page), and test-reports in `npm test`.
  For design: `.navmenu-reports`, and the pressed `.rx-*` buttons in dark mode.

- **The tree batch** (the CEO, 2026-11-14), on `ai-features`:
  1. no sounds in the tree;
  2. a softer glide (shorter, no bounce, none under reduced motion; `.fv-gliding` on the board while it runs);
  3. the passkeys and backups moved to settings → privacy;
  4. "איך אנחנו קשורים" picks people by a forest search;
  5. a tap on a name opens the member card in view mode (a pencil on your own card opens its editing);
  6. "חיפוש ביער" with "קרובי משפחה בלבד".
  Server `server/family-find.ts` and a pure filter with 26 tests (`server/test-family-find.mjs`, for `npm test`).
  It shows only the forest the tree already shows: no anonymous or hidden cards, no emails, 2 letters, rate-limited.
  Checked on the dev server: search, kin filter, related, own and outside cards (outside: name only, no dates), 429 after
  40 searches, no page overflow at 375, the card at 1280 dark, no nameless controls, typecheck and `npm test` clean.
  Then (a57efaf): design's markup (`.fs*` for the search, `.mc*` for the card, rechecked at 375 dark and 1280), the story
  link "הסיפור של …" on the card, and the scrolling the owner found jumpy: the scroll only toggles `.moving` once and settles
  after 550 ms, `.off` while the tree is off screen, the lines redrawn once a frame and never during a glide.
  For design: `.fv-tools` does not wrap at 375, so `.fs` is squeezed to about 105 px. Not checked: a real scroll on a
  phone (the preview pane draws no frames, so only the logic was checked). Not checked: a real phone; the owner's
  backups from settings (dev user not the owner's own Drive); a tribe with a family path across households.
  Open: no personal logo or banner exists, so the card uses the tree photo and, at home, the family profile's cover;
  should users outside one's forest ever be findable (a new opt-in level)? The owner's question, through the CEO.

- **פרופיל המשפחה** (the CEO's queue, item 2): `/family/profile.html` on design's markup, a door at the top of the tree.
  Server `server/family-profile.ts`, the view filter `server/family-profile-rules.ts` with 31 tests
  (`server/test-family-profile.mjs`; the master adds it to `npm test`). Default household only; a head opens it to the
  tribe or makes an invitation link (hash kept, shown once); it never widens: people outside only by their card's identity
  level, recipes and the tree household only, each hidden item an empty spot. Heads edit; members' changes become
  suggestions a head approves. Checked on the dev server: member, head and link-holder flows; audit at 375 and 1280, light
  and dark: no overflow, no nameless controls; one finding for design (the initial in `.fp-face` is 2.9:1 in light).
  Not checked: an own cover upload on a real phone; the tribe view (no confirmed links in the local DB); `?h=` is accepted
  but nothing links to it yet (the forest will).
  Merged into main as v98 (89d236a); the push waits for the owner. Open: "חבר/ה במשפחת…" on the person's profile; the
  forest and gathering doors; the museum exhibit; members' photos instead of initials; whether recipes may be shared
  outside the household (the owner's question, through the CEO).

- **הרגלי אכילה** (the CEO's queue, item 1): `/food/diet/habits/`, one card per way of eating (ketosis and the five in
  `diets.js`), each with ketosis's big switch, what it shows when on, the rules in short, and a link to its tab while on.
  The six tiles in תנועה ותזונה became one. An old `/groceries/#<diet>` of a diet that is off leads to its switch, with
  its card marked. The daemon can open it (`open_app: habits`). Checked at 375 and 1280, light and dark: no overflow, no
  nameless controls, no low contrast; the switches save (keto to `/api/keto/settings`, the others to prefs).
  Not checked: a real phone; two devices at once (another device's change redraws the page through `helper:prefs`).

- **The CEO's quick queue (2026-11-14)**:
  - toolbox long press (78e73e2);
  - groceries named lists with delete and undo (a69ba3d);
  - rich notes (0dd842d);
  - save-as-note only in the parasha, as a bottom bar for marked text with a link back to the verse (281e711);
  - groceries templates and an archive (bfbc416);
  - easier parasha marking: a tap on a verse number marks it, another tap stretches it (c1a59de);
  - a badge with no picture yet: a stitched patch with an emoji instead of a broken image (693efd8);
  - recurring goals: a fresh round each day / week / month / n days, a history and a streak of whole rounds (d7d34c3);
  - the automatic shopping list from the fridge, suggestions only with one-tap approval (server 90715d3, page a3a6f02).
  - the drawn family tree: the first view of the family page, from a set chosen by a pref (no code knows "olive"),
    birthday glow, the passed, a yahrzeit candle, a bud to add a relative; crowded leaves widen the tree (c38d7d9).
    Waiting on design for `sets.json` and the second set; on the master for the vault read (the `life` dates).
  - one fridge per person, scoped by email; the person's old "המקרר שלי" becomes theirs on the first visit, the other
    shared fridges stay hidden (server 43a7523, waiting on the master's review). The automatic list, the food portal and
    the daemon (a read-only `fridge_list`) read only that fridge (d66cc1a). The page lost its picker and gained a
    "מקרר משותף – בקרוב" card (80d640c). For design: `.fr-fridges`, `.fr-views` and `.fr-chip` are unused now.
  - choosing the tree on the family page (8f6c395): the prefs `family.treeSet` (זית / עץ ב׳) and `family.treeLook`
    (עלים / מסגרות), plus slots.json `ext` and `candleY`. For design: `sets.json` is still missing (a fallback list stands
    in), and `.fv-views` styles only `[aria-selected]`, so the radios carry an inline stopgap until `[aria-checked="true"]` joins that rule.
  - design's keto patch applied (cab7c5a): diet stamps and one pie by a grocery item, windows grow out of them
    (`H.modalFrom`); also fixed a stray "null" in the totals window.
  - back on the phone, one step at a time (a79525b): panels, menus and tab changes on every page each take one back
    step; a note closed by back is saved. Waiting on the master's common.js patch (notes folder,
    `common-back-2026-11-14.patch`: `H.back.watch`, the ניווט/כלים menus, the guard at the app's first page).

- **Locks and privacy, aligned to design** (4d7c7c3, in main, v61): the lock screen on `Lock.screen`, the tree tip on
  `Lock.warnCard`, settings in design's classes. Tested end to end locally (code, wrong code, the tree, the tip).
- **Readiness bar, condition 4 (nothing "בקרוב" on show)**: the list with a proposal for each item went to the owner in
  `docs/ai/ready-soon.md` (0b5de69). The owner approved it, keeping the language chips as "בקרוב". Done in 580dc1a:
  - **the weather is live**: `/api/weather`, Open-Meteo through the server (no key, the city from the settings, cached),
    and the page with now, a line of advice, 24 hours and the week (tests: `server/test-weather.mjs`, 24);
  - the ChatGPT card is hidden, and so are the four family badges in goals (until the shared goals);
  - the passkey chip and the fun board's end are worded truthfully.
- **Errors**: 23 pages load with no errors. Gathering + invitation + RSVPs, shopping, recipes, the tree, goals and research
  were checked end to end through the API.
- **Readiness bar, condition 3 (speed): the measuring tool** `tools/perf.js` (the master's approval). It measures LCP, FCP,
  CLS, TBT (blocking time, standing in for INP), the longest frame and fps during a scroll; it also gives `__perfHere()`
  for a single page and `__perfWatch()` for real INP during the joint run.
- **The first measurement** (below), and **two fixes for layout shift** (b1f51a2):
  - the owner's messages float above the tab bar instead of pushing the page: 0.21 → 0.005 **on every page**;
  - the calendar comes in whole: 0.6 → 0.005.
- **The 3D companion** (three.js and a ~3 MB model) loads after the page has loaded, not alongside it.
- **Design's smooth-motion pass**: the music bar and the mail progress bar grow by transform, not by width.
- **The name רַאבַּ"ע, with its niqqud everywhere** (the owner's request):
  - where it changed: the companion, settings, the owner's room, and the prompt (PROMPT_VERSION 11, "always with its
    niqqud"); names already stored in the database are corrected when loaded;
  - **the voice**: only the text sent to speech changes to one word, "רַאבַּע", without gershayim
    (`server/speech-text.ts`, 10 tests). The screen keeps showing רַאבַּ"ע. The browser's fallback voice gets the same.
  - Checked in the log: the text sent was "שלום, אני רַאבַּע. במה אפשר לעזור?".
  - One real voice test was made, and the audio came back. **Not checked by ear yet**: there is no transcription in the app.
    The recording was sent to the owner to listen to.

## The first measurement (2026-11-13, before the fixes)

Headless Chrome on this computer, a first visit (no cache, no service worker), signed in, at 375 and at 1280.
"4G" is Lighthouse's mobile setting: 150 ms RTT, 1.6 Mbps, a processor 4× slower.

| Run | Median LCP | Median FCP | Worst TBT | Lowest fps | Over the bar |
|---|---|---|---|---|---|
| 375, 4G | 1.4 s | 1.0 s | 675 ms | 68 | LCP: home 5.5 s, news 5.5 s, songs 3.5 s, tree 3.1 s · TBT: groceries 675, calculator 315, news 231 · CLS: 22 of 25 pages (fixed, see above) |
| 1280, 4G | 1.2 s | 0.9 s | 278 ms | 99 | LCP: home 5.5 s, news 5.1 s, songs 3.6 s, tree 3.1 s · TBT: calculator 278 · CLS: 18 of 25 (fixed) |
| 375, fast | 0.18 s | 0.13 s | 11 ms | 113 | none |
| 1280, fast | 0.16 s | 0.13 s | 13 ms | 114 | CLS on 2 pages (fixed) |

After the fixes, on 4G: CLS is 0.001–0.04 on the pages measured again (news at 1280: 0.13, still to check).
LCP has not moved yet. The causes:
- **the home page (5.5 s)**: about 1 MB of its own images on the first visit. The tent is downloaded twice (a CSS
  background and an `<img>`, 167 KB each, 1400 px shown at 333 px), and the pillows, the stump and the campfire load before
  the tent finishes. For the master (`index.html`) and design (images):
  - one tent, in a size per screen (`srcset`);
  - `loading="lazy"` / `fetchpriority="low"` on everything but the tent.
- **news (5 s)**: the titles arrive only with `/api/news`. Mine: draw the last list from this device at once.
- **the tree (3.1 s)** and **songs (3.5 s)**: mine, to look into.
- **groceries' TBT (675 ms)**, **the calculator (300 ms)**: long JS at load. Mine, to look into.
- **fps**: fine everywhere. Headless Chrome is not a mid-range phone, though: the joint run on a real phone is the real test.

- **On design's look** (design 0cc65ad): the weather page on `weather.css` (.wx-*); the owner's messages on base.css's
  `.owner-msgs` / `.owner-msg.<level>` with drawn marks instead of emoji. Checked with design's CSS brought in for the test
  (375 light, 1280 dark, no overflow). **Merge design's 0cc65ad with it or before it**: without that CSS the messages lose
  their floating place.

- **`tools/perf-cdp.mjs`, the 4G measuring tool** (the owner's choice: CDP, no install). It uses the local Chrome or Edge
  and Node's WebSocket, loads `tools/perf.js` into every page, and prints a table against the bar.
  - Options: `--pages`, `--runs`, `--out`, and `--shifts` to see which elements shift.
  - It refuses any address that is not a local dev server.
- **The voice**: the owner heard the recording, and רַאבַּ"ע sounds right; the voice prompt (STYLE in `voice.ts`) stays as it is.

- **The family batch (2026-11-13), the first items**:
  - **niqqud for the voice**: every line read aloud gets full niqqud first, from Gemini, only on a cache miss.
    - The approved name is put aside before the niqqud and put back after.
    - The answer is used only if its letters match the line; vav and yod may come and go, as in pointed spelling.
    - On any doubt, the line is read as it was.
    - 23 tests, including Gemini's real answer for one line. The screen is not touched.
  - **neutral language**: a "איך לפנות אליי" field in settings: neutral by default, female or male. The companion addresses
    the person by it; the UI is mostly neutral plural already, and the gendered wording in the rest of the UI is still to do.
  - **quiet companions**:
    - No introduction unasked: a small mark instead, and the first tap offers "נעים להכיר! מה אפשר לעשות איתך?".
    - A persona per figure: the four animals introduce themselves in a sentence or two, רַאבַּ"ע at more length.
    - A conversation held with another figure starts fresh, keeping the memory notes (PROMPT_VERSION 12).
    - A new person (the owner's family too) starts with a random one of the four animals; those who already have רַאבַּ"ע
      keep him.
    - Tested as a test user: the lamb was given, no AI call before the tap, and the lamb introduced itself in one sentence.

- **Vision batch 8 (the social layer, the first minute)**: the plan is in `docs/ai/social-plan.md`, with seven slices.
  - **Slice A, discovery, is done**: `tool_visits`, `/api/visits` and `/api/discover`; "גילית N מתוך 19 כלים", and the
    "סייר" badge at 10 tools; 15 tests.
  - Checked as a test user: the badge came exactly at the 10th tool, and a page load notes the visit by itself.

- **Settings in folding categories** (design's look, a8cb316): closed at first, with a line in each of what is set now.
- **The owner's room**:
  - "שימוש": who comes in and which tools;
  - "פניות": the feedback inbox;
  - the feedback form `H.feedback()`, with its first button in settings, and the companion's `send_feedback`.
  - Checked: a family member's feedback arrives, and the room's routes refuse while the room is locked. The usage queries
    were run on the local database. Not checked: the room's screens (the room opens only with the owner's biometric), and
    the companion tool live (an AI call).
  - Waiting for the master's review.

- **Block 1 (2026-11-13)**:
  - the owner's room is live (v71);
  - the recognized devices are inside "פרטיות ואבטחה" (bc463f3);
  - food and the parasha are within the bar on 4G;
  - the shopping list went from 409 menu options to 46 (TBT 264 → 186 ms; 748da50);
  - `perf-cdp --loaf` names the scripts in the long frames.

- **Block 2 (2026-11-13)**:
  - the setup wizard is live (v73);
  - gamification: a badge for every tool, with the owner's 19 names (bb93510), and "נטית את האוהל";
  - shared goals and encouragement, slice C (d38b43f): the household's feed, hearts, advice, and יועץ / כתף תומכת /
    מלאך דרך. Checked end to end with three test users;
  - the home page is within the bar on 4G (LCP 2.1 s).

- **Block 3 (2026-11-13): "הדלת האחורית"** (the owner's room renamed, in the UI too):
  - on top, the board: how the tent is doing, "שימוש" and "פניות";
  - below it, every other part is an app tile in design's contract (`main.bd`, `.bd-head`, `.bd-dash`,
    `nav.apps-grid.bd-apps > a.app[data-bd]`, `section.bd-panel[hidden]`). A tap opens the part, loads it the first
    time, and keeps it in the address (`#members`); a second tap closes it.
  - Access did not change, and neither did the server. A visit from someone else's account shows the board's state
    and that person's features.
  - Checked with fake data in the page alone (the server stayed locked): the tiles, open and close, the address, and
    375 px with no overflow. The real screens wait for the owner's biometric.
  - Fitted to design's final markup (design 489f08b: `section.ad.bd`, an empty `.ic` with the icon from `data-bd`, `.bd-back` in each panel, `.bd-state`). Checked with design's CSS brought in for the test. **Merge design 489f08b with it.**

- **The companions' voices (the owner's request, 2026-11-13)**: רַאבַּ"ע alone keeps Algenib and the old sage's directions; each
  default animal has its own light, playful, warm voice (`server/voice-figures.ts`, 36 tests):
  - פנק (fennec): Fenrir · ינשוף (owl): Achird · קיפוד (hedgehog): Sadachbia · טלה (lamb): Puck; any other figure: Puck.
  - The picker offers Algenib only for רַאבַּ"ע, and the choice is kept per figure (`prefs.voices`). The old saved choice
    (`voice_prefs`) counts for רַאבַּ"ע alone, so an animal never speaks in Algenib.
  - The cache key holds the voice and the directions, so no old audio is replayed. רַאבַּ"ע's cache stays valid.
  - Checked: the lists, the refusal of Algenib for the owl, and one real sample in the owl's voice. Not heard by ear.

- **The owner's food tour (2026-11-13)**:
  - ketosis is the person's choice: its tab shows only once it is on (0f24f89);
  - the recipe book opens with six home recipes (שקשוקה, מג'דרה, סלט קצוץ, עוף בתנור, אורז כרובית, עוגיות טחינה) from
    `public/groceries/starter.json`, once per person (`prefs.groceries.starters`); a book emptied on purpose stays empty.
    Checked at 375 as a new household: six cards, no second seeding on reload.
  - the list: one small titled pie per diet beside each item, instead of the small numbers; a tap enlarges it (8328533);
  - recipes: servings ("מנות − 4 +") and units (as written / grams / cups and spoons) over the ingredients
    (`public/groceries/measure.js`, 44 tests; 8de2b83);
  - the groceries tabs: a swipe moves between them, and back returns to the previous tab (66dead5);
  - **diets as apps** in תנועה ותזונה: אטקינס, פליאו, דל פחמימות, דל סוכר (עומס גליקמי נמוך, "אינו ייעוץ רפואי") and
    צום לסירוגין (`public/groceries/diets.js`, 21 tests). Each opens its tab with its switch (per person, `prefs.diets`);
    on, it adds its own pie and verdict beside each list item and a stamp on recipes; fasting is an eating-window clock.
    The verdicts are rules of thumb from net carbs per 100 g or per serving and from the ingredients' names.
  - parasha (stop 3): א−/א+ text size in the study room (prefs.study.size), and back closes the open layer one step at a time
    through H.back, whose common.js/sheet.js patch waits for the master (ai-features-hback.patch in the notes folder; 627843e).
  - the weather's sea card: diving, surfing and a beach day per day (good / fair / not, with the reason), from Open-Meteo
    Marine; thresholds in `server/sea-logic.ts` (LIMITS), 32 tests; near the coast or a chosen beach (prefs.weather.beach).
  - notes (the owner): the "שמירה כפתק" popup on marked text is gone in favour of paste: Ctrl+V on the notes page opens a
    new note, and "📋 הדבקה" reads the clipboard or opens an empty note for a long-press paste (e69a2e0). Removing
    assets/capture.js with its loader in common.js and sw.js is the master's patch (ai-features-capture-removal.patch).
    The explicit "שמירה כפתק" buttons in parasha, research and the calculator are gone too (d2c6962).
  - notes (the owner): rich formatting, bold, italic, underline, strikethrough, a colour and a font, from a compact
    toolbar and Ctrl+B/I/U (0dd842d). Stored as allowlist HTML in `notes.rich`, cleaned on the server on each save
    (`server/notes-rich.ts`, 36 tests) and again on the page; paste is plain text. The master reviews the cleaning
    and adds the test to npm test; design styles the toolbar and the colour and font classes.
  - The look of all of these is design's: the class contract is in the notes folder (ai-features-diet-pie-contract.md).
    Unstyled until then: the pie buttons are 45 px tall.

## In progress

- Set aside by the owner (2026-11-13, through the CEO): the family goal with roles and "שבט" for relatives (slice D) is
  for later; on-screen niqqud as a choice is not critical. (Its cost when it comes: every screen's text through the
  vocalizer, so a cache per text.)
- Later, from design:
  - the founders page, built from `docs/design/prototype/founders.html` and `founders.css`, with the levels by number;
  - the profile banner: the person chooses which earned title effect to show (glow, wings, crown, founder). The owner's
    decision: a choice, not automatic;
  - the goals gallery on the badge pictures (`.bdg` with an img), once they arrive after the image quota resets.
- LCP on news, the tree and songs; the blocking time in the calculator.
- **The single record** (design leads): the JS side waits for design's markup and spec. The stump is a dock, and the music
  stops from the record or from the main player.
- Next from the batch, in small deploys:
  - the owner's room: a usage dashboard and the feedback inbox;
  - a feedback button;
  - badges for every tool, with שבט for relatives only;
  - optional on-screen niqqud (not critical, the owner);
  - רַאבַּ"ע's astrology as an opt-in;
  - the gendered UI wording.
- The calendar's blocking time on 4G: 309 ms after drawing it whole (175 before). The data now arrives all at once; to look
  into.

## Blockers

- None.

## Needs the owner

- Nothing now. Decided on 2026-11-13: the 4G tool is CDP (`tools/perf-cdp.mjs`), with no Lighthouse; the voice prompt
  stays as it is.
- For the CEO: an `"perf": "node tools/perf-cdp.mjs"` script in `package.json`, if wanted. Also add the tests
  `test-weather.mjs` and `test-speech-text.mjs` to `npm test`.

## The family story, v1 (branch `claude/story-4cc985`, 2026-11-13)

- **Done:** the page `/family/story/`, the server, the view filter with 38 tests, the table and the routes (decisions.md).
  - Checked: typecheck and `npm test` are clean; the audit passed at 375 and 1280, light and dark; it works end to end on
    the dev server (adding, tags, the timeline, a file opening, a fake file refused, another household gets 404).
- **Waiting:** design's `story.css`; the master's patches (top menu, npm test); the owner's approval for the backup.
- **Not in v1:** exhibitions; the place map; transcription; the fingerprint for a restricted document; the AI's follow-up
  question. Not yet tested: recording on a real phone (iOS writes audio/mp4).
