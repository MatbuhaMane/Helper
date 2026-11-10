# Helper – העוזר המשפחתי 🤝

A personal assistant for family and friends, running on Cloudflare (Pages + Functions + D1), with Google sign-in.

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
functions/api/     one Pages Function: router for /api/*
server/            backend modules (TypeScript)
  core.ts          sessions, Google OAuth, encrypted Gmail tokens
  ai.ts            Claude (Opus 5.5) for judgment-heavy work, Gemini for cheap tasks; each falls back to the other
  kitchen.ts       groceries sync + recipe book + recipe import (JSON-LD, AI fallback)
  news.ts          feeds, RSS/Atom parsing, edge cache, reader view, summaries
  mail.ts          Gmail planning, preview, step-by-step apply, undo
schema.sql         D1 tables
```

## Setup (one time)

1. **Google sign-in** – in [Google Cloud Console](https://console.cloud.google.com/): create a project → *APIs & Services* → enable **Gmail API** → *OAuth consent screen* (External; add the family's emails as test users, or publish the app) → *Credentials* → *OAuth client ID* (Web application) with redirect URI `https://<your-domain>/api/auth/callback`. Note the client ID and secret.
   - Gmail's `gmail.modify` scope is a restricted scope. While the app is in *Testing*, Google expires refresh tokens after 7 days, so Mom would need to reconnect weekly. Publishing it (unverified, under 100 users) avoids that; Google shows an "unverified app" warning once.
2. **Cloudflare** – create the D1 database and the Pages project:
   ```bash
   npx wrangler d1 create helper-db          # put the id into wrangler.toml
   npm run db:remote
   npx wrangler pages project create helper
   ```
3. **Settings** – in `wrangler.toml` set `OWNER_EMAIL` (your Gmail) and `GOOGLE_CLIENT_ID`. Secrets:
   ```bash
   npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name helper
   npx wrangler pages secret put ANTHROPIC_API_KEY   --project-name helper
   npx wrangler pages secret put GEMINI_API_KEY      --project-name helper
   openssl rand -base64 32 | npx wrangler pages secret put TOKEN_KEY --project-name helper
   ```
4. **Deploy** – `npm run deploy`, then add a custom domain (for example `helper.<your-domain>`) under the Pages project's *Custom domains*.
5. Sign in as the owner, open **ניהול משפחה** and invite everyone.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # DEV_MODE=1 enables /api/auth/dev?email=... sign-in
npm run db:local
npm run dev                      # http://localhost:8788
npm run typecheck
```
