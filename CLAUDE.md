# Helper – העוזר המשפחתי

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
