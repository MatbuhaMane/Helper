# Area: AI & feature mechanics

**Worktree:** `M:\Claude Code\Helper-ai` · **Branch:** `ai-features` · **Dev server:** `npm run dev -- --port 8790 --inspector-port 9231`

## Scope

How the features work: AI behavior (prompts, models, fallbacks, cost), each tool's logic on the server and in the page,
and new feature mechanics.

## Owned paths

- the feature modules in `server/` (news, newsai, research, kitchen, keto, recipecheck, worldrecipes, calendar, daemon,
  voice, mail, music, songs, fun, notes, fridge, sefaria, web, calc, prefs, usage)
- the family tree logic in `server/vault/index.ts` (people, links, the tree) and `docs/family-forest.md`
- each page's JavaScript: `public/*/*.js`, `public/tools/*/*.js`
- `docs/ai/`

The master owns `server/ai.ts`, `server/meter.ts`, `server/prices.ts`, `server/core.ts` and the vault's security
(`crypto.ts`, `webauthn.ts`, `store.ts`, `backup.ts`): propose changes there. You may append a route line to
`functions/api/[[path]].ts`, a table to `schema.sql` or a column to the `COLUMNS` list in `server/schema.ts` for your
feature, never editing existing lines, and log it in `docs/decisions.md`. CSS belongs to design.

## Goals

- **The family tree, stage 2** (`docs/family-forest.md`): link trees between households through marriages, with consent
  from both sides; per-person privacy levels (`private`, `household`, `linked`, `forest`) and full anonymity, enforced on
  the server; "how are we related?" across linked trees, computed on the server.
- **AI cost.** Use the meter's numbers (`/api/usage`) to choose cheaper models where quality allows (Gemini for volume,
  Claude for judgment), cache where possible; tell business what a feature costs.
- Feature work that the owner asks for, in small batches, each with tests where the logic is non-trivial
  (`tools/test-vault.mjs`, `tools/test-meter.mjs` show the pattern).

## Rules that matter here

- Never read or print `.dev.vars`; the owner enters keys and secrets.
- Personal data lives on the server per user; the vault's data stays sealed; privacy is checked on the server, never only in the page.
- Done means the feature also works at 375 px and on desktop, light and dark (with design for the looks).

## Open questions

- Linking households: who invites whom, and how is the same person in two trees matched (an email, a confirmed invitation)?
- Who sets the privacy of someone who is not a user (a grandparent, a child)?
