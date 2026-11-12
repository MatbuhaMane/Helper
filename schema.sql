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
