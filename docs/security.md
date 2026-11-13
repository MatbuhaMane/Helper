# Security

How the family helper protects its members and their information, what each layer does, and what is still to do.
Read this before changing sign-in, the API, the family vault, or the headers.

## Who we defend against

| Threat | Main defences |
|---|---|
| A stranger on the internet | Google sign-in, invitations only (members table), every API checks the session and the household |
| A family member's account taken over (stolen Google password) | Google 2-step verification (required of everyone, see the checklist); the vault asks again: a passkey or a fresh sign-in |
| An open, unattended phone or laptop | The vault locks after 15 minutes without use, after 5 minutes in the background, and on "נעילה"; a lock cancels the recent sign-in |
| A bug or injected script in a page (XSS) | Strict CSP on the vault (our own scripts only, none inline, no third-party code); file downloads are sandboxed and never rendered as pages |
| Another site acting in the person's name (CSRF) | SameSite=Lax session cookie + every write must come from our own origin (Origin / Fetch Metadata check) |
| A copy of the database, the R2 bucket, a Drive folder or a NAS backup | Envelope encryption: only ciphertext and wrapped keys are stored; the master key lives only as a Worker secret |
| A curious member of the family | Private items are visible only to the member who added them – to nobody else, the app's owner included |
| Mistakes and malice inside the family | Deletion goes to a 30-day recycle bin; every view, upload, edit and deletion is in the activity log |
| Guessing and flooding | Rate limits on unlocking, adding passkeys and uploading |
| Members of another household (friends invited to the app) | Groceries, recipes, the calendar, the fridges and the vault are scoped by household |

## The layers

### Sign-in and sessions (`server/core.ts`)
- Google OAuth (authorization code flow, `state` checked); only invited emails (the `members` table) get in.
- The session is a random id in an `HttpOnly; Secure; SameSite=Lax` cookie, stored server-side with an expiry (60 days) and its start time.
- `?reauth=1` on `/api/auth/login` makes Google ask for the password again (`prompt=login`, `max_age=0`) – used by the vault.

### Every request (`functions/api/[[path]].ts`, `src/worker.ts`, `public/_headers`)
- Writes (POST/PUT/DELETE) must carry our own `Origin`; where a browser sends none, `Sec-Fetch-Site` must not be cross-site.
- Headers on every response: HSTS (a year), `nosniff`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, COOP, a Permissions-Policy that refuses
  payment/USB/serial/Bluetooth/HID, and a baseline CSP (`object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action` ours and Google's).
- API answers are `no-store`.

### The family vault (`server/vault/`, `public/family/`)
- **Encryption (crypto.ts).** Each file gets its own random AES-256-GCM key; the file is stored only as ciphertext. The file key is stored wrapped
  by a key derived (HKDF) from the master key `VAULT_KEY`. Names, titles, notes and details are sealed with another derived key. Every ciphertext
  is bound to its record and field (GCM additional data), so nothing can be moved to another row or person without failing to open.
- **Unlocking.** A passkey (WebAuthn: fingerprint, face, Windows Hello, the phone's PIN – user verification required), or a Google sign-in made
  in the last 10 minutes. An unlock belongs to one session: 15 minutes from the last action, 2 hours at most. Passkey checks are done in
  `webauthn.ts` without outside packages (ES256 and RS256; challenge, origin, site, user verification and the signature counter are all checked).
- **Who sees what.** Enforced on the server only: same household for the tree and shared items; private items only for whoever added them
  (another member gets "not found", as if the item did not exist); only the one who added an item can make it private or shared.
- **Linked trees (stage 2, `kin.ts`).** Two households' trees join only through a link that a head on the other side approves, and the
  person's own consent when they are a user. Outside its household a person shows by privacy levels per field group (identity, dates,
  notes, files: `private` / `household` / `linked` / `forest`, the strictest of all their records, or their own if they are a user); the
  default keeps everything in the household, so outsiders see "קרוב/ת משפחה". Files and emails never leave the household; other households'
  records and households go by opaque ids. What does leave by default is the **shape** of the tree (how many people, who is whose child),
  so paths across trees do not break. The tribe head (named by the app's owner) can see and edit the cards of non-users across the
  linked trees, never their files. Views from outside are written into the activity log of the household that was seen.
- **Files.** Allowed types only (PDF, images, Word, Excel, plain text), checked by their first bytes, not by their name; at most 25 MB.
  Served back with `Content-Disposition: attachment`, `Content-Security-Policy: sandbox`, `no-store` – the page shows them from memory (blob URLs)
  and revokes those on lock.
- **The page.** Its own strict CSP: scripts from our origin only, none inline, no frames. The music player, the text capture and the companion
  do not load there (`data-vault`). Nothing about the vault is cached by the service worker.
- **Activity log.** Unlocks, views, uploads, edits, deletions, passkey changes; IP addresses are kept only as a keyed fingerprint.

### The app lock and the tree lock (`server/lock.ts`, the owner's design of 2026-11-14)
- **The tree.** Open to a signed-in member of its household by default. This replaces the trusted device. A person may lock it with a 4-digit code or a passkey, and then it opens for 15 minutes from its last use. Documents, files, privacy, deletes, linking trees and backups stay `fresh`: a passkey, or a Google sign-in from the last 10 minutes. No setting opens them.
- **The app lock.** Optional, per person: a code or a passkey, with an idle timer (1/5/15/60 minutes) or the padlock in the menu. It is enforced in the router (`lock.gate`). A locked session gets 423 from everything but `/api/lock*`, `/api/me`, `/api/logout` and `/api/auth/*`.
- **The code.** It is kept as PBKDF2-SHA256 (100,000 rounds) over HMAC(code) with a pepper derived from `VAULT_KEY`, with a salt per person, and compared in constant time. A 4-digit space is small, so the server limits guesses:
  - every 5 wrong codes, a 15-minute pause;
  - at 10 wrong codes, the code closes until a new sign-in.
  - Changing the code, or weakening a lock, needs the current code or a proof (a code, passkey or sign-in) from the last 5 minutes.
- **Recovery.** Recovery is a new Google sign-in ("שכחתי את הקוד"): every new session starts open and resets the wrong-code count. So the lock protects an unattended open device, not an account whose Google sign-in is in someone else's hands. That is the intended level: "secure but not excessive".
- **Passkey sign-in.** `/api/auth/passkey` takes a discoverable passkey that a member registered (for the vault). Its signature, counter, origin and rpId are checked as in `webauthn.ts`, and only a person still in `members` gets a session. It is rate-limited per IP.

### Links that are their own key (`server/calendar.ts`)
- `GET /api/calendar/feed/:token` (the calendar that Google, Apple or Outlook subscribe to) answers **without a session**: the link is the key.
  It is 24 random bytes (32 characters); only its SHA-256 hash is stored; it is rate-limited; a new link replaces the old one, it can be
  cancelled at any time, and it stops working when the member is removed. It shows what that member sees in the calendar page, the tree's
  privacy included.
- The family tree is **off by default** in the link (the owner's decision): only a person who ticks "include the family tree" sends the
  tree's names and birth and memorial dates there. Known trade-off when they do: those reach the link **without the vault being
  unlocked**, and the subscribing service (Google, Apple, Microsoft) keeps a copy. The calendar page itself shows the tree's days to
  signed-in members of the household, also without an unlock.

- `/api/gather/invite/:token…` (the family gathering's invitation) also answers **without a session**. The key is 24 random bytes
  carried after the `#` of the link (so it never reaches a server log on page load); only its hash (to find it) and a sealed copy
  (for the host) are stored. A guest sees only that gathering: its title, day and place, the first names of who is coming, what
  they bring, and the comments – never the tree or anything else of the household. A guest's own answers are tied to a second
  random key kept on their device (hashed on the server). Guests' writes are rate-limited by a keyed fingerprint of the address.
  The link stops working the day after the gathering, or when the host cancels it. The page sends no referrer and asks not to be
  indexed.
- **Joining from an invitation** (`server/join.ts`, the owner's decision once the AI allowance existed): "כניסה עם Google" on an
  open invitation asks the server for a single-use ticket (20 minutes; only its hash is stored; rate-limited per address) kept
  in an HttpOnly cookie on that device. When Google's sign-in returns, a valid ticket for a still-open gathering admits a new
  email as a `member` of a **new household of its own** (never the inviting family's), with the one-time trial credits and no
  other access; the guest's earlier answer becomes theirs. The invitation's key never travels in the sign-in address (the page
  keeps it in sessionStorage). Without a ticket, only invited members get in, as before. The owner can turn it off in the room
  (`gather.guest_signup`). Previews never admit guests.

### The owner's room (`server/admin.ts`, `public/admin/`)
- Entered only with a passkey of an owner (the emails in `OWNER_EMAIL`) or a super the owner named, with user verification
  required; the challenge is bound to this device's session, and so is the entry. On someone else's device the browser can
  offer the owner's phone by QR code.
- The entry closes after **3 idle minutes** (a floating warning after 30 seconds; any action keeps it open), and after 2 hours
  at most (30 minutes for a visit from someone else's account). A lock button closes it at once. "Stay unlocked" lifts the
  idle limit only on the owner's own account, enforced on the server.
- From someone else's account (a visit): only that person's features and the app's counts – no money, settings, members,
  messages to everyone or audit log. Every action is written to `admin_audit`.
- The members list (`/api/members`) and the AI cost report (`/api/usage`) need the owner's session **and** the room open from
  the owner's own account.

### The AI allowance and people's own keys (`server/credits.ts`, `server/meter.ts`)
- The meter's fetch wrapper gates every request to Claude or Gemini (`/v1/messages`, `:generateContent`), however `fetch`
  is called. A limited account with no credit left is refused (402 `ai_credit_needed`) before anything leaves. The family
  (members with no allowance row) is not limited; new accounts get a one-time trial grant. If the allowance cannot be read,
  the call is let through and logged (a deliberate trade-off: a database fault does not switch the AI off for everyone).
- A person's own Claude or Gemini key is checked once with the provider (listing models), stored sealed with the vault key
  under a per-person context, never returned (only its last four characters are shown), never logged, removable at any time;
  saving is limited to ten tries an hour. Their requests go out with their key and are metered as `own_key`, outside the
  owner's costs and their credit.

### The desktop program (`desktop/main.js`)
- Context isolation and the sandbox are on; navigation is locked to the app; links open in the browser only if they are http(s);
  device permissions are refused except the microphone.

## Keys and secrets

| Secret | What | Where |
|---|---|---|
| `VAULT_KEY` | The vault's master key (base64 of 32 random bytes) | Worker secret – **and a copy offline** |
| `GOOGLE_CLIENT_SECRET`, `TOKEN_KEY` | Google sign-in; encryption of Gmail tokens | Worker secrets |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `YOUTUBE_API_KEY` | AI and search | Worker secrets |

**Setting `VAULT_KEY`** (once; the value is never shown on screen):

```bash
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put VAULT_KEY
```

Keep a copy of the key offline (a password manager, or printed and kept with the family's papers). **Without it, the vault's documents cannot be
opened by anyone** – that is the point, and it is also the risk. To keep a copy, generate it into the password manager first and then
`npx wrangler secret put VAULT_KEY` and paste it.

**Rotating it:** put the current key in `VAULT_KEY_OLD`, a new one in `VAULT_KEY`. Everything still opens; new items use the new key.
(A re-wrapping job that moves old items to the new key is a planned follow-up.)

## Backups: Cloudflare first, Google Drive and the NAS as encrypted copies

Cloudflare R2 is the main store. Every vault file also has two encrypted copies, and the vault's records are saved every night:

| Where | How it gets there | What it is for |
|---|---|---|
| Google Drive (the owner's) | The Worker copies each new file right away (ciphertext, as it is) into the folder "Helper vault (encrypted)", through the owner's own Google sign-in with the `drive.file` scope (only files the helper made). The nightly job fills in anything missed. | **A live copy**: if R2 cannot give a file back, the vault reads it from Drive (`readWithFailover`). |
| The family NAS (Synology) | The NAS **pulls** the bucket's `vault/` folder itself with Cloud Sync and a **read-only** R2 token. Nothing at home is open to the internet, and the NAS cannot change anything in Cloudflare. | **A cold copy at home**, with its own history. |
| A nightly snapshot | 01:30 UTC (the Worker's cron): the tree (people, relationships, links between trees, heads, households' names) and the items' records – already sealed – encrypted once more, to R2 `_backup/` (two weeks kept) and to Drive. Older snapshots (version 1) hold people and items only, not the relationships. | With the files and `VAULT_KEY`, it restores everything. |

**Recovery without Cloudflare at all:** copy the NAS folder (or download the Drive folder) to a computer and run

```bash
node tools/vault-restore.mjs <backup folder> <output folder>
```

It asks for `VAULT_KEY` (hidden) and writes every document and picture, decrypted, in a folder per person, with `people.json`.

**Connecting Drive (the owner, once):** ניהול משפחה → גיבויים → חיבור Google Drive. In Google Cloud (project family-helper-514321) the
Google Drive API must be enabled and the `.../auth/drive.file` scope added to the consent screen (a non-sensitive scope: no verification).

**Setting up the NAS (the NAS's administrator, once):**
1. Cloudflare → R2 → Manage API tokens → Create: permission **Object Read only**, only the bucket `helper-media`. Note the Access Key ID,
   the Secret and the endpoint `https://<account id>.r2.cloudflarestorage.com`.
2. DSM → Package Center → install **Cloud Sync**.
3. Cloud Sync → + → **S3 Storage** → S3-compatible: the endpoint, the two keys, signature v4, bucket `helper-media`, remote folder `/vault`.
4. Local folder: e.g. a shared folder `Backups/helper-vault`, visible only to the administrator. Direction: **Download remote changes only**,
   and tick **Don't remove files in the local folder when they are removed from the remote** (so a deletion in the cloud never deletes the home copy).
5. Optional: Snapshot Replication or Hyper Backup on that folder, for history.

`server/vault/store.ts` keeps a driver interface (`r2` now; `drive`/`nas` as main stores if ever wanted).

## Previews

Previews (`<branch>-helper.shemrivers.workers.dev`) have their own database and bucket (test data), their own vault key and token key,
and they sign in **through the live site**: a preview sends the person to the live site's Google sign-in, and the live site – only for a
member of the family – sends back a ticket signed with `PREVIEW_HANDOFF_KEY`, good for one minute, once, and only for that preview's address.
No Google redirect address per branch is needed.

## Setting and replacing secrets

```bash
node tools/secrets.mjs
```

One pass over every secret: what it is, where a new one is made (Anthropic, Google AI Studio, Google Cloud), and where it goes – the live
site, the previews' shared base config, `.dev.vars`. Keys from services are pasted (hidden). Keys the helper makes (`VAULT_KEY`,
`TOKEN_KEY`) are made there and copied to the clipboard so they go into the password manager first. Nothing is printed.

## The family's checklist

1. Everyone turns on Google 2-step verification (a phone prompt or a security key) – a Google account is the key to the helper.
2. Everyone adds a passkey on their phone and computer (ניהול משפחה → מפתחות גישה), and removes a lost device there at once.
3. The owner keeps the offline copy of `VAULT_KEY`.
4. Phones and computers have a screen lock.

## Still to do

- A strict CSP for the whole app (today only the vault has one): the other pages have inline scripts and embed YouTube, Spotify and others,
  so they need their scripts moved to files and an allow-list.
- "Sign out of all devices" and a list of active sessions.
- A job that re-wraps keys after a rotation.
- Rate limiting on sign-in attempts at the edge (Cloudflare WAF rate-limiting rules).

## Tests

```bash
npm run test:vault      # the vault's encryption, passkey checks (a simulated authenticator, real keys) and the preview sign-in tickets
npm run test:forest     # linked trees: privacy levels, anonymity, the tribe, one person in two trees, relationship names
npm run test:calendar   # the Hebrew dates on the server, against the page's own algorithm
npm test                # all of them, with the AI meter's tests
```
