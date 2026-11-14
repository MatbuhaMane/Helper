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

Dispatched by the master at 01:20, because the 5-hour window renewed early (it now resets at 06:10). Nothing is left
for the 03:30 conductor tonight.
- design (up to dc77eae) and ai-features step 2 (up to da57855) went live as cache v48, with test:research-pack added.
- ai-features step 3 (b24e1c1, sharing) was not merged: sharing private notes needs its own review with the owner.

## Log
- 2026-11-13 01:20: master dispatched ai-features (link goals/research/capture css, then the without-AI list); 5h 0% at start, weekly 62%, caps 95% / 85%.
- 2026-11-13 03:43: nothing queued (Tonight already dispatched at 01:20); 5h 69% (resets 06:10), weekly 71% (cap 85%); no orders, no late run scheduled.
- 2026-11-14 03:44: nothing queued (Tonight still holds the 11-13 items, already dispatched); 5h 6% (resets 08:00), weekly 21% (cap 47%); no orders, no late run scheduled.
