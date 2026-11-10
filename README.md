# Helper – העוזר המשפחתי 🤝

A personal assistant for family and friends, running on Cloudflare (Workers + D1 + R2), with Google sign-in, and a daemon companion (after Bayt al-Hikma) that shifts between animals and works the apps for you through Claude.

| App | What it does |
|---|---|
| 🛒 **Groceries & recipes** (`/groceries/`) | Shared shopping list per household (syncs between phones, works offline in the store), auto categories, duplicate detection and merge, web recipe search in a glass popup, a **family recipe book** (save, edit, import from any recipe site, add ingredients to the list). |
| 📰 **News** (`/news/`) | Inoreader-style reader: Israeli and international feeds in folders, unread/starred, an embedded reader view (clean article text inside the app) or the original site embedded, AI summary in Hebrew, add any site by its address. |
| 📬 **Mail organizer** (`/mail/`) | Describe in plain Hebrew what to tidy in Gmail. Claude proposes a plan, shows counts and sample emails, and runs nothing until approved. **Never deletes**: "delete" means a review label + archive. Every change is recorded and can be undone. |
| 💻 **Computer** (`/pc/`) | Hebrew guide for organizing files on a laptop with the Claude desktop app, with standing instructions to back up first and never delete. |
| 👨‍👩‍👧 **Family admin** (`/admin/`) | Owner invites members and assigns households (who shares a list and recipe book). |

## Architecture

```
public/            static frontend (vanilla JS, RTL Hebrew, PWA)
src/worker.ts      Worker entry: /api/* to the router, everything else from public/
functions/api/     the /api/* router
server/            backend modules (TypeScript)
  core.ts          sessions, Google OAuth, encrypted Gmail tokens
  ai.ts            Claude (Opus 5.5) for judgment-heavy work, Gemini for cheap tasks; each falls back to the other
  kitchen.ts       groceries sync + recipe book + recipe import (JSON-LD, AI fallback)
  news.ts          feeds, RSS/Atom parsing, edge cache, reader view, summaries
  mail.ts          Gmail planning, preview, step-by-step apply, undo
schema.sql         D1 tables
```

## Setup (one time)

The app runs as one Cloudflare **Worker** with static assets (`wrangler.toml`), deployed from GitHub with Workers Builds.

1. **Google sign-in** – Google Cloud project with the **Gmail API** enabled, an OAuth consent screen (External, family as test users or published) and a *Web application* OAuth client whose redirect URI is `https://<your-domain>/api/auth/callback`. The client ID goes in `wrangler.toml`; the secret goes in Cloudflare.
   - `gmail.modify` is a restricted scope: while the app is in *Testing*, Google expires refresh tokens after 7 days. Publishing it (unverified, under 100 users) avoids that.
2. **Cloudflare resources** – a D1 database `helper-db` (its id in `wrangler.toml`; run `schema.sql` in its console) and an R2 bucket `helper-media` for the daemon's pictures.
3. **Deploy** – Workers & Pages → Create → Import a repository → `MatbuhaMane/Helper`, deploy command `npx wrangler deploy`. Every push to `main` redeploys.
4. **Settings** (the Worker → Settings → Variables and Secrets):
   - Variable `OWNER_EMAIL` – the family manager's Gmail (kept out of this public repo; `keep_vars` preserves it across deploys).
   - Secrets `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, and `TOKEN_KEY` (32 random bytes, base64: `openssl rand -base64 32`).
5. Add a custom domain if you like (for example `helper.<your-domain>`), sign in as the owner, open **ניהול משפחה** and invite everyone.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # DEV_MODE=1 enables /api/auth/dev?email=... sign-in
npm run db:local
npm run dev                      # http://localhost:8788
npm run typecheck
```
