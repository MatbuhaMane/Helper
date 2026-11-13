# Status – ai-features

Updated by the department at the end of every meaningful round of work. Short: the master reads it for the board meeting.
Last update: 2026-11-13.

## Done

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

## In progress

- LCP on news, the tree and songs; the blocking time in groceries and the calculator.
- **The single record** (design leads): the JS side waits for design's markup and spec. The stump is a dock, and the music
  stops from the record or from the main player.
- Next from the batch, in small deploys:
  - the owner's room: a usage dashboard and the feedback inbox;
  - a feedback button;
  - badges for every tool, with שבט for relatives only;
  - optional on-screen niqqud;
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
