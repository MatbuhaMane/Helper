# Decisions

A shared log of decisions that affect more than one area. Every session adds an entry here when it decides something
others must know: a shared file it needs changed, an API another area uses, a design token, a price or a quota, a new
table or route. Newest first. The master reads this before each merge.

Format:

```
## YYYY-MM-DD – short title (area)
What was decided, why, and what other areas must do. Status: proposed | accepted | done.
```

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

## 2026-11-12 – The project is worked on in parallel (master)

Four sessions, each in its own worktree and branch: master (`main`, `M:\Claude Code\Helper`), design (`design`,
`Helper-design`), business (`business`, `Helper-business`), ai-features (`ai-features`, `Helper-ai`). Ownership of
files, ports and the merge rules are in `CLAUDE.md` under "Working in parallel". Areas may append routes, tables and
columns for their own features and log them here; `public/sw.js` `CACHE` is bumped only by the master on merge.
The feasibility study moved to `docs/business/standalone-feasibility.md`. Status: done.
