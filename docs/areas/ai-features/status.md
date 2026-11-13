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

## In progress

- LCP on news, the tree and songs; the blocking time in groceries and the calculator.

## Blockers

- Measuring on 4G and a slow processor needs a driver outside the page (a page cannot slow itself down). See the next section.

## Needs the owner

**A tool for measuring on 4G** (the master brings it). Two ways:

1. **The Chrome DevTools Protocol, with no new package (recommended).**
   - What: a short script, `tools/perf-cdp.mjs`, about 80 lines (written, kept outside the repo until approved). It runs the
     Chrome already installed here, headless, through Node's own WebSocket, and loads `tools/perf.js` into every page.
   - How it measures: Lighthouse's 4G and 4× slower processor, at 375 and at 1280. The measurement above was made with it.
   - Installs nothing. A full run of 25 pages × 4 sizes takes about 15 minutes.
   - Downside: our own numbers, with no Lighthouse "score".
2. **Lighthouse as a devDependency** (`npm i -D lighthouse`, about 30 MB in `node_modules`).
   - The standard tool, with concrete advice (unused code, image sizes).
   - Slower (15–20 s a page), and no fps or INP.
   - It could be added later, for a one-off check of a single page.
