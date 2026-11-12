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
- **Files.** Allowed types only (PDF, images, Word, Excel, plain text), checked by their first bytes, not by their name; at most 25 MB.
  Served back with `Content-Disposition: attachment`, `Content-Security-Policy: sandbox`, `no-store` – the page shows them from memory (blob URLs)
  and revokes those on lock.
- **The page.** Its own strict CSP: scripts from our origin only, none inline, no frames. The music player, the text capture and the companion
  do not load there (`data-vault`). Nothing about the vault is cached by the service worker.
- **Activity log.** Unlocks, views, uploads, edits, deletions, passkey changes; IP addresses are kept only as a keyed fingerprint.

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
| A nightly snapshot | 01:30 UTC (the Worker's cron): the tree and the items' records – already sealed – encrypted once more, to R2 `_backup/` (two weeks kept) and to Drive. | With the files and `VAULT_KEY`, it restores everything. |

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
```
