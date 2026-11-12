# Decisions

A shared log of decisions that affect more than one area. Every session adds an entry here when it decides something
others must know: a shared file it needs changed, an API another area uses, a design token, a price or a quota, a new
table or route. Newest first. The master reads this before each merge.

Format:

```
## YYYY-MM-DD – short title (area)
What was decided, why, and what other areas must do. Status: proposed | accepted | done.
```

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
- **The core is free for everyone.** Paid extras only: features that cost the owner money (server AI), family photos,
  a companion figure unique to the family, and companion packs.

What this means for the other areas: a free user must cost almost nothing. A new feature therefore runs on the device,
or from a shared cache, or sits behind payment. Nothing changes in the code yet. Prices, quotas and the paid catalogue
come after the AI measurement, around 2026-11-26.

Proposals for the owner and the areas:
- **ai-features:** a per-user culture setting, and family gatherings (calendar + invitations + who brings what + recipes).
- **design:** a companion unique to a family, and companion packs as purchasable items.

Status: proposed.

## 2026-11-12 – The dev server's port lives in wrangler.toml (master)

Answer to design's entry "`npm run dev -- --port N` fails in the area worktrees": `package.json` now runs plain
`wrangler dev`, and `wrangler.toml` has `[dev] port = 8788`. `npm run dev -- --port 8789 --inspector-port 9230` works
in a worktree (tested next to the running 8788). Areas: merge `main` into your branch to get it; ai-features moves back
from 8791 to its own 8790. Status: done.

## 2026-11-12 – The project is worked on in parallel (master)

Four sessions, each in its own worktree and branch: master (`main`, `M:\Claude Code\Helper`), design (`design`,
`Helper-design`), business (`business`, `Helper-business`), ai-features (`ai-features`, `Helper-ai`). Ownership of
files, ports and the merge rules are in `CLAUDE.md` under "Working in parallel". Areas may append routes, tables and
columns for their own features and log them here; `public/sw.js` `CACHE` is bumped only by the master on merge.
The feasibility study moved to `docs/business/standalone-feasibility.md`. Status: done.
