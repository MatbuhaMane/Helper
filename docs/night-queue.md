# Night queue

Work agreed during the day that the night shift carries out while the owner sleeps.
The master keeps this file. The night conductor (scheduled task `helper-night-shift`, 03:30) sends each area its
items, and the morning merge (`helper-morning-merge`, 07:15) merges what is ready and reports.
Only items the owner agreed to go here. Business and vision talk with the owner, so they get no night work.

## Budget (Claude Pro plan)

- The 5-hour window starts fresh on first use after its reset. Night work runs in one fresh window.
- Areas stop at **80% of the 5-hour window**. The last 20% is for the morning merge and report.
- Weekly limit (resets Friday 16:00 Israel time):
  - If it resets within 24 hours, night work may run until it reaches **85%**. The rest is for the owner's morning.
  - Otherwise, night work may use at most a third of what is left at the start.
- Bulk reading, summarizing, drafts and data processing go to Gemini (`node tools/gemini.mjs`; see CLAUDE.md), so the
  Claude window lasts longer.
- Everyone checks `mcp__ccd_session_mgmt__get_usage` before each new piece of work.

## Sessions

| Area | Session id | Folder | Branch |
|---|---|---|---|
| ai-features | local_05b29a1f-f04e-40ee-95f1-b741049c8f08 | M:\Claude Code\Helper-ai | ai-features |
| design | local_c6d62f9a-145a-4b1b-aa89-02c02aaf5ef1 | M:\Claude Code\Helper-design | design |

## Tonight (2026-11-13)

### ai-features

(Research step 2 is already done: 6d9a822, waiting for the morning merge together with 8ecf53b.)
1. Link design's new style sheets in your pages: /tools/tasks/goals.css, /tools/research/research.css and
   /capture/capture.css (design's 3368bdf). Don't merge design into your branch: read them with
   `git show design:<path>`. Keep the inline stopgaps until the morning merge brings the files into main.
2. The "without AI" list, the vision session's next order.

### design

1. The look of research step 2: one thread a day, the weekly summary, the journal, the גשש badge, and the writing skeleton.
   Build it on the core prototype (a02f779), and fit it to ai-features' live markup (6d9a822 on ai-features: drafts,
   the journal, a research as a goal, ✨ directions and first draft).
2. Any badge redraws the owner asked for that are still open.

## Log

