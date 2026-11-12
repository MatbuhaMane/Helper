-- Helper: family assistant database (Cloudflare D1)

CREATE TABLE IF NOT EXISTS members (
  email      TEXT PRIMARY KEY,
  name       TEXT,
  he_name    TEXT,                                -- the Hebrew name the helper calls the person by
  household  TEXT NOT NULL DEFAULT 'family',
  role       TEXT NOT NULL DEFAULT 'member',      -- 'owner' | 'member'
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_email ON sessions(email);

-- OAuth refresh tokens for Gmail, encrypted with TOKEN_KEY (AES-GCM)
CREATE TABLE IF NOT EXISTS google_tokens (
  email         TEXT PRIMARY KEY,
  refresh_token TEXT NOT NULL,
  scope         TEXT,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS households (
  id     TEXT PRIMARY KEY,
  seeded INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS grocery_items (
  household  TEXT NOT NULL,
  id         TEXT NOT NULL,
  name       TEXT NOT NULL,
  cat        TEXT NOT NULL,
  checked    INTEGER NOT NULL DEFAULT 0,
  qty        INTEGER NOT NULL DEFAULT 1,
  src        TEXT,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (household, id)
);
CREATE INDEX IF NOT EXISTS grocery_updated ON grocery_items(household, updated_at);

CREATE TABLE IF NOT EXISTS recipes (
  household   TEXT NOT NULL,
  id          TEXT NOT NULL,
  title       TEXT NOT NULL,
  image       TEXT,
  source_url  TEXT,
  ingredients TEXT NOT NULL,   -- JSON [{name, measure}]
  steps       TEXT NOT NULL,   -- JSON [string]
  notes       TEXT,
  tags        TEXT,            -- JSON [string]
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (household, id)
);

CREATE TABLE IF NOT EXISTS feeds (
  email    TEXT NOT NULL,
  id       TEXT NOT NULL,
  url      TEXT NOT NULL,
  title    TEXT NOT NULL,
  folder   TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, id)
);

-- every article seen in any feed, so the family can search the past (kept 120 days)
CREATE TABLE IF NOT EXISTS news_items (
  id         TEXT PRIMARY KEY,   -- hash of the link
  feed_url   TEXT NOT NULL,
  feed_title TEXT NOT NULL,
  title      TEXT NOT NULL,
  link       TEXT NOT NULL,
  date       INTEGER NOT NULL,
  summary    TEXT,
  image      TEXT,
  body       TEXT,               -- full text where the feed carries it (Telegram posts)
  lang       TEXT,
  seen_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS news_items_feed_date ON news_items(feed_url, date);
CREATE INDEX IF NOT EXISTS news_items_date ON news_items(date);
-- articles translated into Hebrew
CREATE TABLE IF NOT EXISTS news_translations (
  url        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,      -- JSON {title_he, paragraphs:[...], from}
  created_at INTEGER NOT NULL
);
-- headlines translated into Hebrew (by article id), so only headlines are translated when that's all that's needed
CREATE TABLE IF NOT EXISTS news_title_tr (
  id         TEXT PRIMARY KEY,
  title_he   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- an article checked against independent sources on the web
CREATE TABLE IF NOT EXISTS news_verifications (
  item_id    TEXT PRIMARY KEY,
  data       TEXT NOT NULL,      -- JSON {status, rating, explanation_he, sources:[{url, title}], at}
  created_at INTEGER NOT NULL
);
-- which set of recommended sources each person already received (new ones are added once)
CREATE TABLE IF NOT EXISTS news_seeds (
  email   TEXT PRIMARY KEY,
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS news_state (
  email   TEXT NOT NULL,
  item_id TEXT NOT NULL,      -- hash of the article link
  read    INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  saved   TEXT,               -- JSON snapshot of a starred article
  at      INTEGER NOT NULL,
  PRIMARY KEY (email, item_id)
);

-- Mail organizer: proposed plans and the exact record of every change (for undo)
CREATE TABLE IF NOT EXISTS mail_plans (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  request    TEXT NOT NULL,
  plan       TEXT NOT NULL,     -- JSON
  status     TEXT NOT NULL,     -- 'proposed' | 'applying' | 'applied' | 'undone' | 'cancelled'
  created_at INTEGER NOT NULL,
  applied_at INTEGER
);
CREATE TABLE IF NOT EXISTS mail_changes (
  plan_id    TEXT NOT NULL,
  op_index   INTEGER NOT NULL,
  batch      INTEGER NOT NULL,
  message_ids TEXT NOT NULL,   -- JSON array of the messages actually changed
  PRIMARY KEY (plan_id, op_index, batch)
);

-- The daemon: each member's companion (name, current animal, append-only conversation, memory notes)
CREATE TABLE IF NOT EXISTS daemons (
  email      TEXT PRIMARY KEY,
  name       TEXT,
  form_slug  TEXT NOT NULL,
  form_he    TEXT NOT NULL,
  form_emoji TEXT NOT NULL,
  address    TEXT NOT NULL DEFAULT 'plural',
  messages   TEXT NOT NULL DEFAULT '[]',
  memory     TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS image_quota (
  email TEXT NOT NULL,
  day   TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, day)
);

-- The companion's current 3D body (the parameters Claude chose for the animal)
CREATE TABLE IF NOT EXISTS daemon_forms (
  email      TEXT PRIMARY KEY,
  params     TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Signing in the desktop program through the normal browser (Google refuses embedded sign-in)
CREATE TABLE IF NOT EXISTS desktop_codes (
  code       TEXT PRIMARY KEY,
  sid        TEXT,
  created_at INTEGER NOT NULL
);

-- his voice: each person's chosen Hebrew voice, and a daily allowance of spoken characters
CREATE TABLE IF NOT EXISTS voice_prefs (
  email TEXT PRIMARY KEY,
  voice TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tts_quota (
  email TEXT NOT NULL,
  day TEXT NOT NULL,
  chars INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, day)
);

-- each person's preferences per tool (news view, songbook instrument, ...), so they follow them to every device
CREATE TABLE IF NOT EXISTS user_prefs (
  email      TEXT NOT NULL,
  ns         TEXT NOT NULL,      -- the tool: 'news', 'songs', 'groceries', 'daemon', ...
  data       TEXT NOT NULL,      -- JSON object
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (email, ns)
);

-- worldwide recipe search: cached search results (per query) and translated recipes (per page)
CREATE TABLE IF NOT EXISTS recipe_searches (
  q          TEXT PRIMARY KEY,
  results    TEXT NOT NULL,      -- JSON [{url, title_he, title, site, lang, country, image, snippet_he, relevance}]
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS web_recipes (
  url        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,      -- JSON recipe already translated to Hebrew
  created_at INTEGER NOT NULL
);

-- ketosis: each person's diet settings, meal log (eaten and planned), weight, and nutrition per 100 g
CREATE TABLE IF NOT EXISTS keto_settings (
  email      TEXT PRIMARY KEY,
  data       TEXT NOT NULL,      -- JSON {enabled, preset, netCarbLimit, kcalTarget, fatPct, proteinPct, carbPct}
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS keto_meals (
  email      TEXT NOT NULL,
  id         TEXT NOT NULL,
  at         INTEGER NOT NULL,   -- when it was (or will be) eaten
  name       TEXT NOT NULL,
  items      TEXT NOT NULL,      -- JSON [{name, grams, fat, protein, carbs, fiber}] (values for the amount used)
  fat        REAL NOT NULL,
  protein    REAL NOT NULL,
  carbs      REAL NOT NULL,
  fiber      REAL NOT NULL,
  status     TEXT NOT NULL DEFAULT 'eaten',   -- 'eaten' | 'planned'
  created_at INTEGER NOT NULL,
  PRIMARY KEY (email, id)
);
CREATE INDEX IF NOT EXISTS keto_meals_at ON keto_meals(email, at);
CREATE TABLE IF NOT EXISTS keto_weights (
  email TEXT NOT NULL,
  day   TEXT NOT NULL,           -- YYYY-MM-DD
  kg    REAL NOT NULL,
  PRIMARY KEY (email, day)
);
CREATE TABLE IF NOT EXISTS recipe_checks (
  key        TEXT PRIMARY KEY,   -- hash of the ingredient names
  data       TEXT NOT NULL,      -- JSON {kosher:[{index, kind, reason_he, subs}], keto:[{index, reason_he, subs}]}
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recipe_nutrition (
  key        TEXT PRIMARY KEY,   -- hash of the ingredients and servings
  data       TEXT NOT NULL,      -- JSON {servings, items:[{name, grams, fat, protein, carbs, fiber}], total, per_serving}
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS foods (
  household  TEXT NOT NULL,      -- '' for shared estimates, a household id for that family's own corrections
  key        TEXT NOT NULL,      -- normalized name
  name       TEXT NOT NULL,
  fat        REAL NOT NULL,      -- grams per 100 g
  protein    REAL NOT NULL,
  carbs      REAL NOT NULL,      -- total carbohydrates (fiber included, as on Israeli labels' "פחמימות")
  fiber      REAL NOT NULL,
  unit_g     REAL,               -- weight of one typical unit (an egg, a slice), if it has one
  is_food    INTEGER NOT NULL DEFAULT 1,
  source     TEXT NOT NULL,      -- 'ai' | 'user'
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (household, key)
);

-- the songbook: saved links (Shironet, Tab4u…) and the family's own chord sheets
CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  household TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  kind TEXT NOT NULL,
  body TEXT,
  url TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS songs_household ON songs (household, updated_at);

-- Music: a person's Spotify connection (the refresh token encrypted like the Gmail one), and the sign-in in progress
CREATE TABLE IF NOT EXISTS music_tokens (
  email      TEXT NOT NULL,
  provider   TEXT NOT NULL,            -- 'spotify'
  refresh    TEXT,                     -- encrypted
  access     TEXT,
  expires_at INTEGER,
  pkce       TEXT,                     -- the code verifier while signing in
  state      TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (email, provider)
);

-- Fridges: the family's fridges (shared by all members) and what's in each
CREATE TABLE IF NOT EXISTS fridges (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fridge_items (
  fridge     TEXT NOT NULL,
  id         TEXT NOT NULL,
  name       TEXT NOT NULL,
  cat        TEXT,
  qty        REAL NOT NULL DEFAULT 1,
  unit       TEXT,
  expires    TEXT,                 -- YYYY-MM-DD, when it goes off (optional)
  note       TEXT,
  added_by   TEXT,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (fridge, id)
);
CREATE INDEX IF NOT EXISTS fridge_items_changed ON fridge_items(fridge, updated_at);

-- Notes (פתקים): each person's own, dated; a title is written for them when none was given
CREATE TABLE IF NOT EXISTS notes (
  email        TEXT NOT NULL,
  id           TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  source_url   TEXT,
  source_title TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, id)
);

-- the Torah researcher (פרשת השבוע): answers kept per (passage, focus, question) for a month
CREATE TABLE IF NOT EXISTS research_answers (
  key TEXT PRIMARY KEY,
  answer TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- our copy of what the study room read from Sefaria (texts, links, dictionaries, manuscripts), by request
CREATE TABLE IF NOT EXISTS sefaria_cache (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- the family's own days in the calendar (shared by everyone): birthdays, memorial days, anniversaries
CREATE TABLE IF NOT EXISTS family_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  date TEXT NOT NULL,
  after_sunset INTEGER NOT NULL DEFAULT 0,
  recur TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);

-- The family vault (server/vault): the tree, the documents and pictures, who did what, and how one unlocks it.
-- Names, titles, notes and details are stored sealed (encrypted), files only as ciphertext in R2 (or Drive, or the NAS).
CREATE TABLE IF NOT EXISTS family_people (
  id           TEXT PRIMARY KEY,
  household    TEXT NOT NULL,
  name_enc     TEXT,
  details_enc  TEXT,
  parent1      TEXT,
  parent2      TEXT,
  partner      TEXT,
  member_email TEXT,
  photo_item   TEXT,
  created_by   TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS family_people_house ON family_people(household);

CREATE TABLE IF NOT EXISTS vault_items (
  id          TEXT PRIMARY KEY,
  household   TEXT NOT NULL,
  person_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  title_enc   TEXT,
  note_enc    TEXT,
  mime        TEXT,
  size        INTEGER,
  store       TEXT NOT NULL DEFAULT 'r2',
  object_key  TEXT,
  dek         TEXT,
  owner_email TEXT NOT NULL,
  private     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE INDEX IF NOT EXISTS vault_items_person ON vault_items(person_id);

CREATE TABLE IF NOT EXISTS vault_audit (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  household TEXT NOT NULL,
  email     TEXT NOT NULL,
  action    TEXT NOT NULL,
  target    TEXT,
  person_id TEXT,
  private   INTEGER NOT NULL DEFAULT 0,
  ip        TEXT,
  at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS vault_audit_house ON vault_audit(household, at);

CREATE TABLE IF NOT EXISTS passkeys (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  alg        INTEGER NOT NULL,
  jwk        TEXT NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  label      TEXT,
  created_at INTEGER NOT NULL,
  last_used  INTEGER
);
CREATE INDEX IF NOT EXISTS passkeys_email ON passkeys(email);

CREATE TABLE IF NOT EXISTS vault_unlocks (
  sid        TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  until      INTEGER NOT NULL,
  hard_until INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  challenge  TEXT NOT NULL,
  kind       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_hits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

-- The vault's backups: which file has a copy where, and the backup settings (server/vault/backup.ts).
CREATE TABLE IF NOT EXISTS vault_replicas (
  item_id   TEXT NOT NULL,
  target    TEXT NOT NULL,
  remote_id TEXT NOT NULL,
  at        INTEGER NOT NULL,
  PRIMARY KEY (item_id, target)
);
CREATE TABLE IF NOT EXISTS backup_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- Previews: the sign-in tickets already used (each one works once).
CREATE TABLE IF NOT EXISTS handoff_nonces (
  n   TEXT PRIMARY KEY,
  exp INTEGER NOT NULL
);

-- The AI meter (server/meter.ts): one row per call to Claude or Gemini – quantities only; prices are applied when read.
CREATE TABLE IF NOT EXISTS ai_usage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  email       TEXT,
  feature     TEXT NOT NULL,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  input       INTEGER NOT NULL DEFAULT 0,
  output      INTEGER NOT NULL DEFAULT 0,
  cache_write INTEGER NOT NULL DEFAULT 0,
  cache_read  INTEGER NOT NULL DEFAULT 0,
  searches    INTEGER NOT NULL DEFAULT 0,
  grounded    INTEGER NOT NULL DEFAULT 0,
  audio_out   INTEGER NOT NULL DEFAULT 0,
  image_out   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ai_usage_at ON ai_usage(at);

-- עץ המשפחה: relationships as records of their own (docs/family-forest.md). parent: a is the parent of b; partner: a < b.
CREATE TABLE IF NOT EXISTS family_links (
  id         TEXT PRIMARY KEY,
  household  TEXT NOT NULL,
  type       TEXT NOT NULL,
  a          TEXT NOT NULL,
  b          TEXT NOT NULL,
  kind       TEXT,
  status     TEXT,
  since      TEXT,
  until      TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS family_links_house ON family_links(household);

-- עץ המשפחה, stage 2 (docs/family-forest.md): one person in two households' trees, linked with consent.
-- Asked by a member of house_a about person_a, sent to the email of a member of the other household. A head there
-- approves by picking person_b. If the person is a user, their own consent may be needed (consent_email).
CREATE TABLE IF NOT EXISTS family_bridges (
  id            TEXT PRIMARY KEY,
  house_a       TEXT NOT NULL,
  person_a      TEXT NOT NULL,
  to_email      TEXT NOT NULL,
  note_enc      TEXT,                       -- who it is, in the asker's words (sealed)
  house_b       TEXT,
  person_b      TEXT,
  status        TEXT NOT NULL,              -- pending | awaiting_person | confirmed | declined | revoked
  consent_email TEXT,
  asked_by      TEXT NOT NULL,
  decided_by    TEXT,
  created_at    INTEGER NOT NULL,
  decided_at    INTEGER
);
CREATE INDEX IF NOT EXISTS family_bridges_status ON family_bridges(status);

-- who heads what: role head = a head of the household, role tribe = the tribe head (household is empty)
CREATE TABLE IF NOT EXISTS family_roles (
  household  TEXT NOT NULL,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL,
  named_by   TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (household, email, role)
);

-- a household's name as other households see it ("משפחת כהן"), set by a head (not in households, whose rows mean the groceries were seeded)
CREATE TABLE IF NOT EXISTS family_households (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

-- לוח שנה: each person's private link for subscribing to the calendar from Google, Apple or Outlook (only its hash is kept)
CREATE TABLE IF NOT EXISTS calendar_feeds (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  tree       INTEGER NOT NULL DEFAULT 1,      -- with the birthdays and memorial days from the family tree
  created_at INTEGER NOT NULL,
  used_at    INTEGER
);
CREATE INDEX IF NOT EXISTS calendar_feeds_email ON calendar_feeds(email);

-- המפגש המשפחתי (docs/business/gathering.md): a gathering, who answered, what to bring, the comments, and anonymous
-- counts for the beta. The invitation link is a key: only its hash (to find it) and a sealed copy (for the host) are kept.
CREATE TABLE IF NOT EXISTS gatherings (
  id           TEXT PRIMARY KEY,
  household    TEXT NOT NULL,
  host_email   TEXT NOT NULL,
  title        TEXT NOT NULL,
  date         TEXT NOT NULL,
  time         TEXT,
  place        TEXT,
  map          TEXT,
  note         TEXT,
  food         TEXT NOT NULL DEFAULT '',      -- '' | kosher | halal
  invitees_enc TEXT,                          -- the host's list of whom to invite (sealed)
  token_hash   TEXT NOT NULL,
  token_enc    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS gatherings_token ON gatherings(token_hash);
CREATE INDEX IF NOT EXISTS gatherings_house ON gatherings(household);
CREATE TABLE IF NOT EXISTS gathering_rsvps (
  id         TEXT PRIMARY KEY,
  gathering  TEXT NOT NULL,
  guest_hash TEXT,                            -- a guest's key (hashed), or
  email      TEXT,                            -- a member signed in
  name       TEXT NOT NULL,
  coming     TEXT NOT NULL,                   -- yes | no | maybe
  count      INTEGER NOT NULL DEFAULT 1,
  note       TEXT,
  at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gathering_rsvps_g ON gathering_rsvps(gathering);
CREATE TABLE IF NOT EXISTS gathering_items (
  id            TEXT PRIMARY KEY,
  gathering     TEXT NOT NULL,
  title         TEXT NOT NULL,
  kind          TEXT,                         -- meat | dairy | parve, for a kosher gathering
  taker         TEXT,                         -- the answer (gathering_rsvps.id) of whoever brings it
  grocery_house TEXT,                         -- where it was put on a grocery list, to take it off again
  grocery_src   TEXT,
  added_by      TEXT,
  at            INTEGER NOT NULL,
  deleted       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS gathering_items_g ON gathering_items(gathering);
CREATE TABLE IF NOT EXISTS gathering_comments (
  id        TEXT PRIMARY KEY,
  gathering TEXT NOT NULL,
  rsvp      TEXT,
  name      TEXT NOT NULL,
  text      TEXT NOT NULL,
  at        INTEGER NOT NULL,
  deleted   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS gathering_comments_g ON gathering_comments(gathering);
CREATE TABLE IF NOT EXISTS gathering_stats (
  gathering TEXT NOT NULL,
  kind      TEXT NOT NULL,                    -- open | rsvp | signin
  day       TEXT NOT NULL,
  n         INTEGER NOT NULL,
  PRIMARY KEY (gathering, kind, day)
);

-- The owner's room (/admin/, server/admin.ts): who opened it on which session (after the owner's biometric), what it did,
-- the project's income and expenses entered by hand, the app's settings, who else may enter, messages to everyone,
-- and special features for a person.
CREATE TABLE IF NOT EXISTS admin_entries (
  sid_hash   TEXT PRIMARY KEY,
  by_email   TEXT NOT NULL,                   -- whose passkey opened it
  as_email   TEXT NOT NULL,                   -- whose account the device was signed in to
  created_at INTEGER NOT NULL,
  last_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_audit (
  at       INTEGER NOT NULL,
  by_email TEXT NOT NULL,
  as_email TEXT NOT NULL,
  action   TEXT NOT NULL,
  detail   TEXT
);
CREATE INDEX IF NOT EXISTS admin_audit_at ON admin_audit(at);
CREATE TABLE IF NOT EXISTS admin_ledger (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,                   -- income | expense
  title      TEXT NOT NULL,
  amount     REAL NOT NULL,
  currency   TEXT NOT NULL,                   -- ILS | USD
  date       TEXT NOT NULL,
  monthly    INTEGER NOT NULL DEFAULT 0,
  until      TEXT,
  by_email   TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                   -- JSON
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_supers (
  email      TEXT PRIMARY KEY,
  by_email   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_messages (
  id         TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  level      TEXT NOT NULL,                   -- info | warn | party
  link       TEXT,
  by_email   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS message_reads (
  message TEXT NOT NULL,
  email   TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (message, email)
);
CREATE TABLE IF NOT EXISTS user_features (
  email      TEXT NOT NULL,
  feature    TEXT NOT NULL,
  by_email   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (email, feature)
);

-- The AI allowance (server/credits.ts): a member with no row is family (no limit, at the owner's cost); a new account
-- from an invitation is limited and spends its grants (trial, purchase, gift – none expire). Own keys are sealed.
CREATE TABLE IF NOT EXISTS ai_allowance (
  email      TEXT PRIMARY KEY,
  limited    INTEGER NOT NULL DEFAULT 1,
  since      INTEGER NOT NULL,                -- usage from here on is spent from the grants
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_credits (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  source     TEXT NOT NULL,                   -- trial | purchase | gift
  usd        REAL NOT NULL,                   -- dollars of real AI cost (prices.ts costOf)
  note       TEXT,
  by_email   TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_credits_email ON ai_credits(email);
CREATE TABLE IF NOT EXISTS user_ai_keys (
  email    TEXT NOT NULL,
  provider TEXT NOT NULL,                     -- claude | gemini
  key_enc  TEXT NOT NULL,
  hint     TEXT,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (email, provider)
);

-- Design's image tool (server/design-images.ts): each picture made through Gemini for design, kept in MEDIA under
-- design/<batch>/<i>; the day counts toward the daily cap.
CREATE TABLE IF NOT EXISTS design_images (
  batch      TEXT NOT NULL,
  i          INTEGER NOT NULL,
  day        TEXT NOT NULL,
  prompt     TEXT NOT NULL,
  refs       TEXT,
  aspect     TEXT,
  mime       TEXT NOT NULL,
  size       INTEGER,
  by_email   TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (batch, i)
);
CREATE INDEX IF NOT EXISTS design_images_day ON design_images(day);

-- joining from a gathering's invitation (server/join.ts, master): a single-use ticket while the guest signs in with Google
-- (twenty minutes); only the hash of the ticket is kept, and the guest's earlier answer (rsvp) to tie to the new member.
CREATE TABLE IF NOT EXISTS invite_joins (
  nonce_hash TEXT PRIMARY KEY,
  gathering  TEXT NOT NULL,
  rsvp       TEXT,
  exp        INTEGER NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);
