# Status – vision

Updated by the department at the end of every meaningful round of work. Short: the master reads it for the board meeting.
Last update: 2026-11-15.

## Done

- **Seven batches** of the owner's notes collected and sent (`docs/vision/batch.md`, under "נשלח").
- **Decisions recorded** in `docs/decisions.md`:
  - one visual style for all the graphics;
  - the tree opens on a trusted device;
  - the ring and the top bar;
  - the PC guide and the mail sorter go through the user's own AI;
  - every AI tool also works without AI;
  - goal management, spec v1;
  - the research assistant, spec v1;
  - the companion figures: the free and paid lists, Ibn Ezra only for the owner's family, פנק as the default;
  - the readiness bar;
  - Russian, Amharic and Tigrinya: after the family launch, before the closed beta.
- **Specs written with the owner:**
  - `docs/vision/goals.md`: goal management, part 1 live;
  - `docs/vision/research.md`: the research assistant, steps 1–2 live.
- **The readiness bar** (`docs/vision/ready.md`): five conditions before the family sees the app. The fifth is a joint
  test run with the owner, which replaced "two weeks of use".
- **Later** (`docs/vision/later.md`): a section for each religion, like פרשת השבוע.
- **Declined:** an explicit easter-egg version of Cleopatra and Dracula, for the owner only. It was not passed on,
  because of Gemini's terms and because the app is a family app. Recorded in the figures decision.

## In progress

- **Batch 14** (2026-11-14), sent to design, ai-features, the CEO and research2:
  - the test-run findings on the phone: the slide centring, the sky spot, the missing daily summary, the guitar's horizontal strum;
  - the cushions' arrange mode;
  - the tools menu order with the "ניסיוני" tag;
  - wave 1 of the owner's quick ideas: faster AI replies, the background feed, no Google links, notes;
  - the garage (smart home) feasibility study.
- **"יד ביד" is built now, behind a switch** (2026-11-15, the owner decided in the master's session; `main` 3bc7c23, read there): a feature that waits for an approval (the lawyer, insurance, a licence) is built in full but locked by its own owner-only switch, off by default. ai-features builds stage 1 this way after batch 30's open items. Recorded in `docs/vision/yad-beyad.md` under "השלבים".
- **Design and "יד ביד"** (2026-11-15, the master reported, checked with `git log design`): design has done every batch on its branch without messaging vision: the icon (98d4003), the stage 1 screens (6e8695b), and batches 37 to 44 (39094e6, a81c9df, be6b93d, 9b8520c, 1e15307, c49dbe8, 2304b89, 2108d92). Up to batch 40 is already in `main`; 41 to 44 are on `design` only. Design confirmed it itself afterwards: specs in `docs/design/yad.md` and `yad-queue.md`, prototypes in `docs/design/prototype/yad.html` and `yad-queue.html`, CSS in `public/tools/yad/yad.css`; it reports a clean audit at 375 and 1280, light and dark, and will message vision after each batch from now on. Vision has not looked at the screens themselves.
- **Batch 44** (2026-11-15), sent to design, ai-features, legal and the CEO: six corrections to the limit lines after legal's check (three wording fixes, one replaced line, two new lines); 23 of the 49 types now have a line.
- **Batch 43** (2026-11-15), sent to design, ai-features, legal and the CEO: the limit lines for 21 of the 49 "יד ביד" types (legal checks the wording), and the driving declaration in the rules page and the terms chapter.
- **Batch 42** (2026-11-15), sent to design, ai-features, legal and the CEO: nine of the 49 "יד ביד" types carry the licence mark; rides carry it with a driving declaration; each type gets a description line with its limit (vision words them, the owner approves); youth mentoring only in family and friends in stage 1; three questions for the owner's lawyer through the CEO.
- **Batch 41** (2026-11-15), sent to design, ai-features, legal and the CEO: the licence declaration in "יד ביד" follows a per-type mark, "דורש רישיון", not the tier; legal proposes which of the 49 types get the mark, for the owner's approval.
- **Batch 40** (2026-11-15), sent to design, ai-features and the CEO: three simplifications of the "יד ביד" approval queue after the ai-features estimate (a fund request for someone else with a mark and the owner's check instead of an in-app consent flow; "מאת האוהל" needs one-time only; one immediate notification mechanism, the daily summary later).
- **Batch 39** (2026-11-15), sent to design, ai-features and the CEO: the spec of the owner's approval queue for "יד ביד" stage 1 (inside the "ממתין לאישור" page; deeds valued from a list; approve or reject with a reason; three actions on a report; fund requests for a person, for the public and "מאת האוהל"; immediate notifications only for the urgent items).
- **Batch 38** (2026-11-15), sent to design, ai-features, legal and the CEO: four conditions on the licence declaration in "יד ביד" (never looks verified, no licence numbers or documents, a false declaration is grounds for removal, the terms say the Ohel does not check).
- **Batch 37** (2026-11-15), sent to design, ai-features, legal and the CEO: the six stage 1 simplifications of "יד ביד" (tithe redemption to stage 2, no GPS, simple sorting, one simple notification, distance as a range, a need outside the list waits for the owner) and the product rules from legal (no illegal services, publication only with the owner's approval, report and removal, regulated professionals with a self-declared licence, ידיים have no monetary value).
- **Batch 36** (2026-11-15), sent to design, ai-features and the CEO: the screen spec of "יד ביד" stage 1 (home screen with banner and dashboard, "לוח הדרושים", "יצירת צורך", what I can give in the profile, location, the fund page and redeeming the tithe).
- **Batch 35** (2026-11-15), sent to the CEO: strengthen the Ohel's cyber security (a full review, findings by severity for the owner, and a standing security check for every feature that touches personal data).
- **Batch 34** (2026-11-15), sent to design, ai-features, legal and the CEO: "יד ביד" starts in stages. Stage 1 now is the spec and design of the social interface for family and friends only (`docs/vision/yad-beyad.md`); legal starts the tax check; ai-features estimates the scope; building waits for the end of the family's two weeks.
- **Legal closed its check (through the CEO, 2026-11-15):** no legal blocker, also for trade with everyone and for youth; the written answer comes later and stays with the owner. The product rules went out in batch 37.
- **The two first lists of "יד ביד"** (26 service types, 23 deed types, with scores and tiers): the owner approved them in the master's session on 2026-11-15; recorded in `docs/vision/yad-beyad.md` and `docs/decisions.md`. The flag on the licence declaration is settled (batch 41).
- **The rules page and the terms chapter of "יד ביד":** the owner approved the vision's tone version in the CEO's session (all five of legal's additions stay; a recommendation is optional); legal writes the final version, then the owner's lawyer.
- **Batch 33** (2026-11-14), sent to the CEO and business: the tool is named "יד ביד" with the owner's line, and ידיים stay unlinked from credits (only discretionary gift credits).
- **Batch 32** (2026-11-14), sent to design, the CEO, business and legal: the internal economy and the "יד" token (closed loop, earned only by doing, four hour tiers, a 10% tithe to a public fund, trade with everyone under three trust rules, youth inside the family). A big idea: "בקרוב" only.
- **Batch 31** (2026-11-14), sent to ai-features, design and the CEO: "רמת הניג'וס", phone notifications per tool with four levels (off, quiet, normal, nag), main settings plus per-tool and per-item overrides.
- **Batch 30** (2026-11-14), sent to ai-features, design and the CEO: Telegram-level smoothness across the whole app (now), the video speed slide in every player, and the chat spec 1 (wave 2).
- **Batch 29** (2026-11-14), sent to ai-features, design, business and the CEO: the הקפדה coach, spec 1 (wave 2, after the family launch).
- **Batch 28** (2026-11-14), sent to ai-features, design, business and the CEO: goals part 2 after the owner's test (AI consultation per goal, help defining a goal, phone notifications per kind, shared goals on the tree profile) and storage (your own Drive or NAS, ours paid, short clips free).
- **Batch 27** (2026-11-14), sent to ai-features, design, business and the CEO:
  - friends as "the family you choose": a page in the tree, chats one to one or in groups, and a fourth privacy level "חברים ומשפחה";
  - the living museum becomes the hub for all memories, with videos and life events added;
  - "גבעה ביער" waits for enough users.
- **Batch 26** (2026-11-14), sent to ai-features-2, business and the CEO: the owner answered all 21 future-tool questions.
  - The answers are in `docs/vision/future-specs.md` and in `docs/decisions.md`.
  - AI inside a tool is free with a quota; business sets the quota and the price.
- **Batch 25** (2026-11-14), sent to ai-features-2 and the CEO, at the CEO's request:
  - `docs/vision/future-specs.md` holds short specs for the eight `H.FUTURE` tools, by priority;
  - the 21 questions for the owner were answered in batch 26.
- **Batch 24** (2026-11-14): how a person is shown on each tree. On the pine it is a pine cone; on the olive, a frame of olive branches.
- **Batch 23** (2026-11-14): tree skins. The pine is the default and the olive is available too; the maple and the African juniper come later. The owner makes the art from `docs/vision/asset-prompts-full.md`.
- **Batch 22** (2026-11-14), sent to design and the CEO: "ع ב-ע" (עין בעין), the language-learning game. The concept is approved (`docs/vision/language-game.md`): any language to any language, a living dictionary where words are engraved after four checks, and Creative Commons or official YouTube embeds. It is kept for later, with a "בקרוב" mark only.
- **Batch 21** (2026-11-14), sent to design, ai-features, business and the CEO: the owner closed the open questions: the brand mark (the current logo), kids mode (the child flag), test gatherings, places in il only, business drafts after the measurement, shared songbooks by link too.
- **Batch 20** (2026-11-14), sent to design and the CEO: five more future tools, each with a "בקרוב" mark only: the garden, home maintenance, grandparents' stories (in the tree), a homework helper (kids mode) and a translator.
- **Batch 19** (2026-11-14), sent to design and the CEO: two future tools, kept for later with a "בקרוב" mark: the kitchen helper (wave 2) and "איך אני עושה".
- **Batch 18** (2026-11-14), sent to ai-features, design and the CEO: the family tree after the test run.
  - Fixes first: the documents that don't open, deleting your own additions, one screen with pinch zoom, all generations up to the great-grandparents' parents, a faster profile.
  - Then the new interface: gentle motion, the seasons, a floating menu, leaf, banner and profile states, a docked profile tab, editing by permission.
  - The CEO reviews the permission changes (vault) before merging.
- **New way of working (owner, 2026-11-14):** an item is sent right after the owner's "מאשר", with no wait for "שלח".
- **Batch 17** (2026-11-14), sent to the CEO, design and ai-features:
  - pop-up messages at the top, light and dismissible, with a switch for the songbook's recognition messages;
  - the shopping list: multi-select, the fridge, sorting, user categories, a lists panel.
- **Batch 16** (2026-11-14), sent to the CEO, design and ai-features:
  - the daily summary card shows every day;
  - the premium-motion rule for every interface, starting with the recipe card flip;
  - the recipe book: the feed is the default, plus the "my recipes" and "shared with me" menus.
- **Batch 15** (2026-11-14), sent to design and the CEO: big new ideas wait, and the interface shows them only as "בקרוב". This applies to גבעה ביער and the garage. The garage study is cancelled.
- **The owner's quick ideas** (`docs/vision/later.md`), split into three waves:
  - wave 2 waits for the family launch: the הקפדה coach, Telegram-level chat;
  - wave 3: friends and "גבעה ביער" wait for a vision spec, and the garage waits for the study.
- **The personal profile and the back door** (`docs/vision/profile.md`): decided and sent (batch 11) to design, ai-features and the CEO.
- **Serious mode** (`docs/vision/serious-mode.md`): decided and sent (batch 11) to design, ai-features and the CEO.
- **Grandparents mode, the emergency button and kids mode** (`docs/vision/grandparents-kids.md`): decided and sent (batch 12).
- **Joint test run 1:** the CEO reports main is live as v136 (serious mode, grants, the ancient script), so it can resume now from the wizard.
- **Shabbat and holidays, notifications and the daily rhythm** (`docs/vision/shabbat-notifications.md`): decided and sent (batch 13).
- **The tree drawing (the app's default tree), Sigd and Novy God, the test run after the next merge:** decided and sent (batch 12).

- **The family tree, spec 1** (`docs/vision/tree.md`): decided and sent (batch 9) to design, ai-features and the CEO.
  - A fixed drawn tree, with people as leaves.
  - The play is in the interface only.
  - Quiet and respectful for those who passed away.
  - Before the family launch.
  - Next: the family story ("a living museum").
- **The family story, spec 1** (`docs/vision/story.md`): decided and sent (batch 10). It comes after the launch.
- **The family profile, spec 1** (`docs/vision/family-profile.md`): decided (the household by default, opened by choice), sent (batch 10).

- **The heads' round** (decided):
  - the joint test run starts now;
  - the parents see it first;
  - the wizard is built before the social layer.

- **Batch 8, sent:**
  - the social layer, which unblocks goals part 2 (`docs/vision/social.md`);
  - the first-minute wizard, in a game feel (`docs/vision/first-minute.md`);
  - the tent app icon, with the family logo for the owner only, served per user by the master.

- **The "בקרוב" pages:** done on ai-features (580dc1a), waiting for the master's merge.
  - Weather is finished.
  - ChatGPT and the goals' family signals are hidden.
  - The languages stay "בקרוב", and the credit card stays.
- **Icons and emoji:** the owner said yes. Small line icons stay; emoji are replaced gradually. Sent to design.

- **Batch 7, the readiness bar:**
  - the master builds the speed and motion measurement;
  - design finishes the style and the motion;
  - ai-features works on speed, the "בקרוב" pages and the core flows.
- **Waiting for the first measurement.** Then the joint test run with the owner, in the browser pane, with friction
  notes going into batches.

## Blockers

- None.

## Needs the owner

- **The master is now the new CEO session** (the owner, 2026-11-13). From now on, copies go there only.
- **Actions, not questions:**
  - around 2026-11-26, the 14-day usage export from the back door, for business;
  - trying goals part 1, which unblocks part 2.
- The open questions were closed on 2026-11-14 (batch 21).
