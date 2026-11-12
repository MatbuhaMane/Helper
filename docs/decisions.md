# Decisions

A shared log of decisions that affect more than one area. Every session adds an entry here when it decides something
others must know: a shared file it needs changed, an API another area uses, a design token, a price or a quota, a new
table or route. Newest first. The master reads this before each merge.

Format:

```
## YYYY-MM-DD – short title (area)
What was decided, why, and what other areas must do. Status: proposed | accepted | done.
```

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

Status: proposed (the owner's decisions; the master decides how and when they reach the code).

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

Status: proposed.

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
