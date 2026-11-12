# Decisions

A shared log of decisions that affect more than one area. Every session adds an entry here when it decides something
others must know: a shared file it needs changed, an API another area uses, a design token, a price or a quota, a new
table or route. Newest first. The master reads this before each merge.

Format:

```
## YYYY-MM-DD – short title (area)
What was decided, why, and what other areas must do. Status: proposed | accepted | done.
```

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
