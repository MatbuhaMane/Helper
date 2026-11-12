# Helper – הָאֹהֶל (האוהל)

The app is called **הָאֹהֶל** (in sentences "האוהל": משתמש באוהל); the AI inside it is still העוזר החכם. The code and the repo keep the name Helper.

A hub for all the useful tools the family uses day to day: groceries, recipes and ketosis, news, songbook,
mail organizer, a PC guide, and the daemon companion who works the apps for you. See README.md for setup
and the architecture.

## Principles (set by the owner; they apply to every change)

1. **Two interfaces, one product.** On mobile it is an app (installable PWA, bottom tab bar, touch-first).
   On PC it is a program (the Electron app in `desktop/` and the wide web layout).
2. **Connected per user.** Personal details and preferences live on the server, per user (email), and follow
   the person from phone to PC to any other device. `localStorage` is only for what is truly per-device:
   offline caches, unsent drafts, where the daemon stands on this screen.
3. **A hub.** New everyday tools are added to the hub (shared shell, navigation, sign-in, daemon) rather than built as separate apps.
4. **Pleasant, comfortable, intuitive on PC and on mobile.** This is a work rule, not a nice-to-have:
   a feature is done only after it has been checked at phone width (375 px) and at desktop width, in light and dark mode.
   `tools/audit.js` runs that check over every page (overflow, broken images, nameless controls, low contrast).
5. **Be proactive.** After feature work, give an honest self-review (what is weak, what was not tested) and a few
   concrete proposals for the interface, the functionality and new features.
6. **Tools.** Look for tools, plugins and skills that would do the work better, and ask the owner before installing any of them.

## Conventions

- The UI is Hebrew, right to left. Answer the owner in Hebrew.
- Design tokens are in `public/assets/base.css` (limestone, basalt ink, vine for the active state, olive as a field; Rubik).
  Use the tokens and logical properties (`inline-size`, `margin-inline-start`), never raw left/right.
- Frontend is vanilla JS with the shared helpers in `public/assets/common.js` (`H.el`, `H.api`, `H.modal`, `H.toast`).
- Backend modules are in `server/`, routed in `functions/api/[[path]].ts`. Tables are created on first use from
  `schema.sql`; a new column on an existing table goes in the `COLUMNS` list in `server/schema.ts`.
- AI: Claude for judgment-heavy work and web search, Gemini for cheap high-volume tasks; each falls back to the other (`server/ai.ts`).
- Companion figures: follow the `figure-style`, `blender-figures` and `historic-figures` skills in `.claude/skills/`.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # DEV_MODE=1 enables the dev sign-in; add your own API keys there
npm run dev                      # http://localhost:8788
npm run typecheck
node tools/push-keys.mjs         # copy the AI keys from .dev.vars to the live Worker (never prints them)
```

Preferences: use `H.prefs('tool', defaults)` / `H.savePrefs('tool')` from `common.js` for anything a person chooses;
they are stored per user on the server (`/api/prefs`, table `user_prefs`) and arrive with `/api/me`.

## Working in parallel (several Claude sessions)

The project is worked on by several sessions at once, one per area, each in its own git worktree and branch,
so no two sessions edit the same working copy.

| Session | Folder | Branch | Dev server (port / inspector) | Brief |
|---|---|---|---|---|
| Master | `M:\Claude Code\Helper` | `main` | 8788 / 9229 | this file, `docs/decisions.md` |
| Design & graphics | `M:\Claude Code\Helper-design` | `design` | 8789 / 9230 | `docs/areas/design.md` |
| Business modeling | `M:\Claude Code\Helper-business` | `business` | none (docs only) | `docs/areas/business.md` |
| AI & feature mechanics | `M:\Claude Code\Helper-ai` | `ai-features` | 8790 / 9231 | `docs/areas/ai-features.md` |

Run an area's dev server with `npm run dev -- --port 8789 --inspector-port 9230` (each worktree has its own
untracked `.claude/launch.json` with its port). Each worktree has its own `node_modules`, its own `.dev.vars` (copied by the owner, never
committed or printed) and its own local database in `.wrangler/` (empty at first; tables are created on first use, use the dev sign-in).
Google sign-in on localhost works only on port 8788.

### Who owns what

A file has one owner. Other sessions propose changes to it (in `docs/decisions.md` or a message to the master) instead of editing it.

- **design**: `public/**/*.css` (including `public/assets/base.css`, the design tokens), images, icons and fonts under
  `public/assets/` (not `common.js`), `public/figures/`, `figures/`, the figure skills in `.claude/skills/`, `docs/design/`.
- **business**: `docs/business/`.
- **ai-features**: `server/` feature modules (AI, news, recipes, keto, calendar, daemon, voice, mail, music…), the family tree
  logic in `server/vault/index.ts` and `server/vault/kin.ts` (with `test-kin.mjs`), the Hebrew dates in `server/hebdate.ts`
  (with `test-hebdate.mjs`), each page's JavaScript (`public/*/*.js`, `public/tools/*/*.js`), `docs/ai/`, `docs/family-forest.md`.
- **master** (shared files): `functions/api/[[path]].ts`, `schema.sql`, `server/schema.ts`, `server/core.ts`, `server/ai.ts`,
  `server/meter.ts`, `server/prices.ts`, the vault's security (`server/vault/crypto.ts`, `webauthn.ts`, `store.ts`, `backup.ts`),
  `src/`, `wrangler.toml`, `package.json`, `package-lock.json`, `public/sw.js`, `public/_headers`, `public/manifest.json`,
  `public/assets/common.js`, `public/index.html`, `desktop/`, `tools/`, `.github/`, `.gitignore`, `README.md`, this file,
  `docs/areas/`, `docs/decisions.md`, `docs/security.md`.

Exception: an area may **append** a route line to `functions/api/[[path]].ts`, a table to `schema.sql` or a column to the
`COLUMNS` list in `server/schema.ts` for its own feature, never editing existing lines, and records it in `docs/decisions.md`.

### Rules

1. Each area session works only in its own worktree and branch, in small, clear commits.
2. Areas never bump `CACHE` in `public/sw.js`; the master bumps it once per merge into `main`.
3. Sync often: at the start of each work day, and before asking for a merge, merge `main` into the area branch
   (`git merge main`) and resolve conflicts there.
4. A change that affects another area (a shared file, an API another area uses, a design token, a price) gets an entry
   in `docs/decisions.md` and is flagged to the master.
5. Only the master merges area branches into `main`, after reviewing the diff (`git diff main...design`), checking for
   conflicts, and running `npm run typecheck`, `npm test` (vault, meter, forest, calendar) and the page audit.
6. **A push to `main` deploys the live site.** The master pushes `main` only with the owner's approval. Area branches are
   pushed only with the owner's approval; a pushed branch gets its own preview address with its own database.
7. Never delete, force-push, rewrite history or discard someone's uncommitted work.

### Merging an area (the master)

```bash
git switch main
git merge --no-ff design          # after reviewing git diff main...design
# bump CACHE in public/sw.js, commit, run the checks, then ask the owner before git push
```
