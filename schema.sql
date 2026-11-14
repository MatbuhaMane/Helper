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

-- מסעדות שלנו: the household's own list of restaurants (server/restaurants.ts)
CREATE TABLE IF NOT EXISTS restaurants (
  household  TEXT NOT NULL,
  id         TEXT NOT NULL,
  name       TEXT NOT NULL,
  place      TEXT,
  cuisine    TEXT,
  kosher     TEXT,             -- '' (not known), kosher, mehadrin, no
  link       TEXT,
  phone      TEXT,
  note       TEXT,
  place_id   TEXT,             -- Google's place ID, when it came from a search (the only thing of Google's that may be kept)
  fav        INTEGER NOT NULL DEFAULT 0,
  visited_at INTEGER,
  visited_by TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (household, id)
);

-- restaurants from Google Places: searches per person per month (server/places.ts), nothing of the answers
CREATE TABLE IF NOT EXISTS places_usage (
  email TEXT NOT NULL,
  month TEXT NOT NULL,          -- YYYY-MM
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, month)
);

-- ניהול מטרות: goals → processes (checklists) → small daily steps, each person's own (server/goals.ts)
CREATE TABLE IF NOT EXISTS goals (
  email      TEXT NOT NULL,
  id         TEXT NOT NULL,
  title      TEXT NOT NULL,
  why        TEXT,
  kind       TEXT NOT NULL,      -- short (under a day), regular, long (over a year)
  due        TEXT,               -- YYYY-MM-DD
  status     TEXT NOT NULL,      -- active, done, archived, deleted
  days       TEXT,               -- JSON [weekday 0-6]: the days to work on it (none: every day but the rest day)
  time       TEXT,               -- HH:MM
  template   TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  done_at    INTEGER,
  PRIMARY KEY (email, id)
);
CREATE TABLE IF NOT EXISTS goal_processes (
  email      TEXT NOT NULL,
  goal_id    TEXT NOT NULL,
  id         TEXT NOT NULL,
  title      TEXT NOT NULL,
  sort       REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (email, id)
);
CREATE TABLE IF NOT EXISTS goal_steps (
  email      TEXT NOT NULL,
  goal_id    TEXT NOT NULL,
  process_id TEXT NOT NULL,
  id         TEXT NOT NULL,
  text       TEXT NOT NULL,
  sort       REAL NOT NULL DEFAULT 0,
  small      INTEGER NOT NULL DEFAULT 0,   -- 1: a 5-minute version ("נתקעתי")
  done_at    INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (email, id)
);
CREATE TABLE IF NOT EXISTS goal_reviews (
  email      TEXT NOT NULL,
  week       TEXT NOT NULL,      -- the day of the review, YYYY-MM-DD
  good       TEXT,
  stuck      TEXT,
  change     TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (email, week)
);
CREATE TABLE IF NOT EXISTS goal_badges (
  email     TEXT NOT NULL,
  badge     TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (email, badge)
);

-- עוזר מחקר: researches; their notes are the hub's own notes (research_notes links them, a note in several researches);
-- questions and threads; sources as CSL-JSON (Crossref's and OpenAlex's metadata, no abstracts). server/researches.ts
CREATE TABLE IF NOT EXISTS researches (
  email      TEXT NOT NULL,
  id         TEXT NOT NULL,
  title      TEXT NOT NULL,
  purpose    TEXT NOT NULL,      -- paper, book, talk, post, work, personal, family
  aim        TEXT,
  style      TEXT NOT NULL,      -- apa, mla, chicago
  status     TEXT NOT NULL,      -- active, deleted
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (email, id)
);
CREATE TABLE IF NOT EXISTS research_notes (
  email       TEXT NOT NULL,
  research_id TEXT NOT NULL,
  note_id     TEXT NOT NULL,
  sort        REAL NOT NULL DEFAULT 0,
  added_at    INTEGER NOT NULL,
  PRIMARY KEY (email, research_id, note_id)
);
CREATE TABLE IF NOT EXISTS research_threads (
  email       TEXT NOT NULL,
  id          TEXT NOT NULL,
  research_id TEXT NOT NULL,
  text        TEXT NOT NULL,
  status      TEXT NOT NULL,     -- open, answered, parked
  answer      TEXT,
  note_id     TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (email, id)
);
CREATE TABLE IF NOT EXISTS research_sources (
  email       TEXT NOT NULL,
  id          TEXT NOT NULL,
  research_id TEXT NOT NULL,
  csl         TEXT NOT NULL,     -- JSON, CSL fields
  doi         TEXT,
  oa_url      TEXT,              -- an open copy (OpenAlex)
  retracted   INTEGER NOT NULL DEFAULT 0,
  cited       INTEGER,
  note        TEXT,
  reliability INTEGER,           -- 1-5, the person's own mark
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (email, id)
);

-- עוזר מחקר, step 2: a journal of a few lines a day, and drafts written from the notes (server/research-writing.ts)
CREATE TABLE IF NOT EXISTS research_journal (
  email       TEXT NOT NULL,
  research_id TEXT NOT NULL,
  day         TEXT NOT NULL,     -- YYYY-MM-DD
  text        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (email, research_id, day)
);
CREATE TABLE IF NOT EXISTS research_drafts (
  email       TEXT NOT NULL,
  id          TEXT NOT NULL,
  research_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,     -- Markdown, with [@source id] citations and [[note]] links
  drive_id    TEXT,              -- the Google Doc it was saved as
  template    TEXT,              -- imrad, seminar, essay, talk, post (research-pack.ts)
  target      INTEGER,           -- the length to aim for, in words
  numbered    INTEGER NOT NULL DEFAULT 0,   -- 1: numbered headings, cross-references by number
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (email, id)
);

-- עוזר מחקר, step 3, shared research (server/researches.ts, research-share.ts): members in roles, the history of changes
-- (to restore), and comments. Rows are kept under the research owner's address (owner).
CREATE TABLE IF NOT EXISTS research_members (
  owner       TEXT NOT NULL,
  research_id TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL,            -- editor, contributor, reader
  status      TEXT NOT NULL,            -- invited, active
  outside     INTEGER NOT NULL DEFAULT 0, -- 1: not of the owner's household (joins only on their own approval)
  invited_by  TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (owner, research_id, email)
);
CREATE INDEX IF NOT EXISTS research_members_email ON research_members (email, status);
CREATE TABLE IF NOT EXISTS research_history (
  owner       TEXT NOT NULL,
  research_id TEXT NOT NULL,
  id          TEXT NOT NULL,
  at          INTEGER NOT NULL,
  by          TEXT NOT NULL,
  kind        TEXT NOT NULL,            -- note, thread, source, draft, member
  item_id     TEXT NOT NULL,
  action      TEXT NOT NULL,            -- add, edit, remove, restore
  before      TEXT,                     -- JSON: how it was (what a restore brings back)
  after       TEXT,
  PRIMARY KEY (owner, research_id, id)
);
CREATE INDEX IF NOT EXISTS research_history_id ON research_history (id);
CREATE TABLE IF NOT EXISTS research_comments (
  owner       TEXT NOT NULL,
  research_id TEXT NOT NULL,
  id          TEXT NOT NULL,
  on_kind     TEXT NOT NULL,            -- research, note, thread, source, draft
  on_id       TEXT NOT NULL DEFAULT '',
  by          TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (owner, research_id, id)
);
CREATE INDEX IF NOT EXISTS research_comments_id ON research_comments (id);

-- Paid companion figures a person has (server/figures.ts): bought with credits (usd, counted as spent in
-- credits.balance), or given to the owner's family at the owner's cost (how = 'family', usd 0).
CREATE TABLE IF NOT EXISTS figure_owned (
  email     TEXT NOT NULL,
  figure    TEXT NOT NULL,                     -- Figure2D's id (figures-rules.ts PAID)
  usd       REAL NOT NULL DEFAULT 0,
  how       TEXT NOT NULL,                     -- family | credits
  bought_at INTEGER NOT NULL,
  PRIMARY KEY (email, figure)
);

-- Founding members (docs/business/founders.md; the owner's decision of 2026-11-13): the moment each gathering first had five
-- invitees who confirmed, and its organiser. Written once and never rewritten – it cannot be rebuilt afterwards. seq runs
-- forever ("the millionth" is counted from it, also after the beta window); dev: from a dev server, never counted. The owner
-- approves the founders' list in the room at the end of the window (fake gatherings filtered there). server/gather.ts
CREATE TABLE IF NOT EXISTS gathering_milestones (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  gathering  TEXT NOT NULL UNIQUE,
  host_email TEXT NOT NULL,
  household  TEXT NOT NULL,
  reached_at INTEGER NOT NULL,
  confirmed  INTEGER NOT NULL,
  dev        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS gathering_milestones_host ON gathering_milestones(host_email, reached_at);

-- The app lock and the tree lock, per person (server/lock.ts; the owner's design, docs/decisions.md "Locks and privacy").
-- The 4-digit code only as PBKDF2 over an HMAC with a pepper from VAULT_KEY, salted per person.
CREATE TABLE IF NOT EXISTS user_locks (
  email       TEXT PRIMARY KEY,
  app         TEXT NOT NULL DEFAULT 'off',     -- off | pin | bio
  tree        TEXT NOT NULL DEFAULT 'off',     -- off | pin | bio
  autolock    INTEGER NOT NULL DEFAULT 5,      -- minutes away before the app locks itself: 1 | 5 | 15 | 60
  pin_hash    TEXT,
  pin_salt    TEXT,
  fails       INTEGER NOT NULL DEFAULT 0,
  pause_until INTEGER NOT NULL DEFAULT 0,
  closed      INTEGER NOT NULL DEFAULT 0,      -- 1: ten wrong codes, open again with a new Google sign-in
  tip_hidden  INTEGER NOT NULL DEFAULT 0,      -- "לא להציג שוב" on the tree's security tip
  updated_at  INTEGER NOT NULL
);

-- Discovery (ai-features, docs/ai/social-plan.md slice A): which tools a person has opened – for "גילית 6 מתוך 18 כלים",
-- the "סייר" badge, and the owner's usage dashboard. Only the tool and when; never what is in it.
CREATE TABLE IF NOT EXISTS tool_visits (
  email     TEXT NOT NULL,
  tool      TEXT NOT NULL,
  first_at  INTEGER NOT NULL,
  last_at   INTEGER NOT NULL,
  n         INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (email, tool)
);

-- The family's feedback (ai-features, the family batch): a button on any page and the companion send it here; the owner
-- reads it in the owner's room. No alert is sent.
CREATE TABLE IF NOT EXISTS feedback (
  id       TEXT PRIMARY KEY,
  email    TEXT NOT NULL,
  name     TEXT,
  text     TEXT NOT NULL,
  page     TEXT,
  via      TEXT NOT NULL DEFAULT 'button',   -- button | companion
  at       INTEGER NOT NULL,
  read_at  INTEGER,
  done     INTEGER NOT NULL DEFAULT 0
);

-- Shared goals and encouragement (ai-features, vision batch 8 slice C; server/goal-social.ts). A goal the person shares
-- (goals.shared) makes progress posts the household sees; hearts and short advice on them.
CREATE TABLE IF NOT EXISTS goal_posts (
  id        TEXT PRIMARY KEY,
  goal_id   TEXT NOT NULL,
  email     TEXT NOT NULL,
  household TEXT NOT NULL,
  kind      TEXT NOT NULL,                -- step | goal
  text      TEXT NOT NULL,
  steps     INTEGER NOT NULL DEFAULT 0,   -- the day's steps, for a step post
  at        INTEGER NOT NULL,
  deleted   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS goal_posts_household ON goal_posts (household, at);
CREATE TABLE IF NOT EXISTS post_hearts (
  post_id TEXT NOT NULL,
  email   TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (post_id, email)
);
CREATE TABLE IF NOT EXISTS post_advice (
  id      TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  email   TEXT NOT NULL,
  text    TEXT NOT NULL,
  at      INTEGER NOT NULL,
  hearted INTEGER NOT NULL DEFAULT 0,     -- the advised marked it good: the adviser badge
  deleted INTEGER NOT NULL DEFAULT 0
);

-- named grocery lists beside the household's main one (grocery-lists.ts); an item's list column points here
CREATE TABLE IF NOT EXISTS grocery_lists (
  household  TEXT NOT NULL,
  id         TEXT NOT NULL,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'list',   -- list (later: template, archive, auto)
  owner      TEXT NOT NULL,                  -- who opened it: they, or a household admin, may delete it
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (household, id)
);

-- Recurring goals (ai-features, 2026-11-13; server/goals.ts): a recurring goal (goals.repeat) starts a fresh round each
-- period; each round's count is kept here, for the history and the streak of whole rounds.
CREATE TABLE IF NOT EXISTS goal_rounds (
  email      TEXT NOT NULL,
  goal_id    TEXT NOT NULL,
  period     TEXT NOT NULL,              -- the period's first day, YYYY-MM-DD
  done       INTEGER NOT NULL DEFAULT 0, -- steps done within the period
  total      INTEGER NOT NULL DEFAULT 0, -- the goal's steps then
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (email, goal_id, period)
);

-- פרופיל המשפחה: what a household publishes about itself (server/family-profile.ts); read only through its view filter
-- (server/family-profile-rules.ts). The name is family_households.title.
CREATE TABLE IF NOT EXISTS family_profiles (
  household  TEXT PRIMARY KEY,
  line       TEXT NOT NULL DEFAULT '',
  cover      TEXT NOT NULL DEFAULT 'olive',     -- one of the drawn covers, or 'own'
  cover_own  INTEGER NOT NULL DEFAULT 0,        -- an own photo is in MEDIA at profile/<household>/cover
  origins    TEXT NOT NULL DEFAULT '[]',        -- JSON [{place, years}]
  traditions TEXT NOT NULL DEFAULT '',
  dishes     TEXT NOT NULL DEFAULT '[]',        -- JSON [recipe id], from the household's book
  open_tribe INTEGER NOT NULL DEFAULT 0,        -- a head opened it to the linked households
  link_hash  TEXT,                              -- the invitation link's hash (null: no link)
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
-- a change a member who is not a head suggests; a head takes it in or lets it go
CREATE TABLE IF NOT EXISTS family_profile_suggestions (
  id         TEXT PRIMARY KEY,
  household  TEXT NOT NULL,
  email      TEXT NOT NULL,
  patch      TEXT NOT NULL,                     -- JSON, cleaned as family-profile-rules.cleanPatch
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS family_profiles_link ON family_profiles(link_hash);

-- The reports inbox, תיבת פניות (ai-features; server/reports.ts): a member reports a problem from any page (a shake or
-- the menu); the team reads it in the back door and answers privately. Only the reporter sees the report and the answer.
CREATE TABLE IF NOT EXISTS reports (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,                  -- who sent it
  name         TEXT,                           -- their card name then
  text         TEXT NOT NULL,
  path         TEXT NOT NULL DEFAULT '/',      -- the page, a path of the app
  title        TEXT,                           -- the page's name
  device       TEXT,                           -- phone | tablet | pc
  theme        TEXT,                           -- light | dark
  width        INTEGER,                        -- the screen's width in CSS pixels
  has_shot     INTEGER NOT NULL DEFAULT 0,     -- a screenshot the person chose to attach (MEDIA reports/<id>, or shot_data)
  shot_data    TEXT,                           -- the screenshot as a data URL, only where there is no MEDIA bucket
  via          TEXT NOT NULL DEFAULT 'menu',   -- shake | menu | button | companion
  state        TEXT NOT NULL DEFAULT 'new',    -- new | working | done
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  read_at      INTEGER,                        -- the team last opened it
  seen_at      INTEGER,                        -- the reporter last opened it
  last_team_at INTEGER                         -- the team's last answer
);
CREATE INDEX IF NOT EXISTS reports_email ON reports(email, created_at);
CREATE TABLE IF NOT EXISTS report_messages (
  id       TEXT PRIMARY KEY,
  report   TEXT NOT NULL,
  by_team  INTEGER NOT NULL DEFAULT 1,         -- 1: the team's answer
  by_email TEXT,                               -- who in the team wrote it (never shown to the member)
  text     TEXT NOT NULL,
  at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS report_messages_report ON report_messages(report, at);

-- Messages between members, הודעות (server/dm.ts): one conversation per pair (a < b, emails in lower case);
-- only the two sides ever read it. The back door gets counts only.
CREATE TABLE IF NOT EXISTS dm_threads (
  id         TEXT PRIMARY KEY,
  a          TEXT NOT NULL,
  b          TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_at    INTEGER,                          -- the last message (NULL: opened, nothing sent yet)
  last_by    TEXT,                             -- who wrote it
  a_seen     INTEGER,                          -- when a last opened it
  b_seen     INTEGER,
  UNIQUE (a, b)
);
CREATE INDEX IF NOT EXISTS dm_threads_a ON dm_threads(a, last_at);
CREATE INDEX IF NOT EXISTS dm_threads_b ON dm_threads(b, last_at);
CREATE TABLE IF NOT EXISTS dm_messages (
  id     TEXT PRIMARY KEY,
  thread TEXT NOT NULL,
  sender TEXT NOT NULL,
  text   TEXT NOT NULL,
  at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dm_messages_thread ON dm_messages(thread, at);
CREATE TABLE IF NOT EXISTS dm_blocks (
  blocker TEXT NOT NULL,
  blocked TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked)
);
-- הסיפור המשפחתי (server/story.ts): a household's stories, recordings, readings, documents and photos; read only through
-- the view filter in server/story-rules.ts. Sealed with the vault key like vault_items; a file only as ciphertext, at
-- story/<household>/<id> in the vault's store. level: private (only owner_email) | household (the default) | tribe.
CREATE TABLE IF NOT EXISTS story_items (
  id          TEXT PRIMARY KEY,
  household   TEXT NOT NULL,
  kind        TEXT NOT NULL,                    -- story | recording | reading | doc | photo
  level       TEXT NOT NULL DEFAULT 'household',
  owner_email TEXT NOT NULL,
  title_enc   TEXT,
  text_enc    TEXT,                             -- the story, or what was said (typed or transcribed)
  when_text   TEXT NOT NULL DEFAULT '',         -- as the person wrote it, even rough ("שנות ה-50")
  year        INTEGER,                          -- story-rules.yearOf(when_text), for the timeline
  place_enc   TEXT,
  people      TEXT NOT NULL DEFAULT '[]',       -- JSON [family_people id] of this household's tree
  mime        TEXT,
  size        INTEGER,                          -- counts toward the household's 2 GB
  store       TEXT,
  object_key  TEXT,
  dek         TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE INDEX IF NOT EXISTS story_items_house ON story_items(household, created_at);

-- the owner's invitations from outside the family (server/join.ts, the back door's "הזמנות"): a personal link, used once,
-- into a household of its own. Only the link key's hash (to find it) and a sealed copy (for the owner) are kept. Its
-- status is computed: cancelled_at, then used_at, then exp (join-rules inviteStatus). email: only that address may use it.
CREATE TABLE IF NOT EXISTS owner_invites (
  id           TEXT PRIMARY KEY,
  key_hash     TEXT NOT NULL UNIQUE,
  key_enc      TEXT NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT,
  created_by   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  exp          INTEGER NOT NULL,
  used_by      TEXT,
  used_at      INTEGER,
  cancelled_at INTEGER,
  opened_at    INTEGER                       -- the first time its page was opened ("נפתחה")
);
CREATE INDEX IF NOT EXISTS owner_invites_made ON owner_invites(created_at);

-- a request for access (server/access.ts, master): someone who signed in with Google, not a member and not invited.
-- The sign-in leaves a one-hour ticket (its hash only); the form sends it back with a name and a note; the owner is told.
CREATE TABLE IF NOT EXISTS access_requests (
  email          TEXT PRIMARY KEY,
  google_name    TEXT,
  ticket_hash    TEXT,
  ticket_exp     INTEGER,
  name           TEXT,
  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'denied',   -- denied (signed in, did not ask), asked, invited, declined
  asked_at       INTEGER,
  created_at     INTEGER NOT NULL,
  last_denied_at INTEGER
);
CREATE INDEX IF NOT EXISTS access_requests_ticket ON access_requests (ticket_hash);

-- a change to the family tree that waits for a user's yes (server/vault/index.ts, the owner's rule of 2026-11-13):
-- a card of another user, or a relationship that touches one. One row for each user it waits for (one grp);
-- what it would change is sealed (payload_enc). Nothing in the tree changes until every one of them approves.
CREATE TABLE IF NOT EXISTS family_changes (
  id          TEXT PRIMARY KEY,
  household   TEXT NOT NULL,
  person_id   TEXT,                            -- edit | delete: the card
  kind        TEXT NOT NULL,                   -- edit | delete | unlink | relink
  target_id   TEXT,                            -- unlink | relink: the family_links id
  payload_enc TEXT,
  grp         TEXT NOT NULL,
  by_email    TEXT NOT NULL,
  for_email   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined | cancelled
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER
);
CREATE INDEX IF NOT EXISTS family_changes_for ON family_changes(for_email, status);
CREATE INDEX IF NOT EXISTS family_changes_by ON family_changes(by_email, status);
CREATE INDEX IF NOT EXISTS family_changes_grp ON family_changes(grp);
-- secret grants the owner gives one member from the owner's room (server/grants.ts): frames, bio_ancient, name_ancient
CREATE TABLE IF NOT EXISTS user_grants (
  email      TEXT NOT NULL,
  grant_key  TEXT NOT NULL,
  by_email   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (email, grant_key)
);

-- web push subscriptions, one row per device (server/push.ts)
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint   TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_email ON push_subs (email);

-- עץ מבנה (server/layout.ts, ai-features 2026-11-13): the owner's layer over the hub's menus (H.APPS), one row a
-- version; the newest is the one in use. json is the cleaned layout (server/layout-rules.ts).
CREATE TABLE IF NOT EXISTS site_layout (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  json     TEXT NOT NULL,
  by_email TEXT,
  at       INTEGER NOT NULL,
  note     TEXT
);

-- the surprise eggs the owner hides on a page, for a time, and who found each
CREATE TABLE IF NOT EXISTS eggs (
  id         TEXT PRIMARY KEY,
  page       TEXT NOT NULL,                     -- the path, with its last slash ('/' is the home page)
  text       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'text',      -- text | surprise | link
  link       TEXT,
  starts     INTEGER,                           -- ms, null = from now
  ends       INTEGER,                           -- ms, the last day, null = no end
  active     INTEGER NOT NULL DEFAULT 1,
  x          REAL NOT NULL DEFAULT 50,          -- where it sits on the page, % of the width and height
  y          REAL NOT NULL DEFAULT 50,
  created_at INTEGER NOT NULL,
  by_email   TEXT
);
CREATE INDEX IF NOT EXISTS eggs_page ON eggs(page, active);
CREATE TABLE IF NOT EXISTS egg_finds (
  egg_id TEXT NOT NULL,
  email  TEXT NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (egg_id, email)
);

-- notifications held by the gate (quiet hours, quiet Shabbat, not urgent) for the daily summary (server/push.ts)
CREATE TABLE IF NOT EXISTS push_digest (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  url        TEXT,
  created_at INTEGER NOT NULL,
  seen_at    INTEGER
);
CREATE INDEX IF NOT EXISTS push_digest_email ON push_digest (email, seen_at);

-- פרנסה, the household's money (server/parnasa.ts). A row is personal (kupa_id NULL, seen by owner_email only) or in a
-- shared קופה (seen by that קופה's members). Amounts are shekels, an expense negative. Nothing here goes to the logs.
CREATE TABLE IF NOT EXISTS pr_tx (
  id          TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  kupa_id     TEXT,
  date        TEXT NOT NULL,
  amount      REAL NOT NULL,
  what        TEXT NOT NULL,
  cat         TEXT NOT NULL,
  learn_key   TEXT,
  dup_key     TEXT NOT NULL,
  recur_id    TEXT,
  source      TEXT NOT NULL DEFAULT 'manual',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pr_tx_owner ON pr_tx (owner_email, kupa_id, date);
CREATE INDEX IF NOT EXISTS pr_tx_kupa ON pr_tx (kupa_id, date);
CREATE TABLE IF NOT EXISTS pr_recur (
  id          TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  kupa_id     TEXT,
  what        TEXT NOT NULL,
  amount      REAL NOT NULL,
  cat         TEXT NOT NULL,
  every       INTEGER NOT NULL DEFAULT 1,
  day         INTEGER NOT NULL,
  next_date   TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pr_recur_owner ON pr_recur (owner_email, kupa_id);
-- the categories a person chose for a business, remembered for the next guess
CREATE TABLE IF NOT EXISTS pr_learn (
  email TEXT NOT NULL,
  key   TEXT NOT NULL,
  cat   TEXT NOT NULL,
  at    INTEGER NOT NULL,
  PRIMARY KEY (email, key)
);
CREATE TABLE IF NOT EXISTS pr_kupa (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- status: 'invited' until the person accepts, then 'member'
CREATE TABLE IF NOT EXISTS pr_kupa_members (
  kupa_id    TEXT NOT NULL,
  email      TEXT NOT NULL,
  status     TEXT NOT NULL,
  invited_by TEXT,
  at         INTEGER NOT NULL,
  PRIMARY KEY (kupa_id, email)
);
CREATE INDEX IF NOT EXISTS pr_kupa_members_email ON pr_kupa_members (email, status);
CREATE TABLE IF NOT EXISTS pr_holdings (
  id          TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  kupa_id     TEXT,
  symbol      TEXT NOT NULL,
  name        TEXT NOT NULL,
  qty         REAL NOT NULL,
  cost        REAL NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pr_holdings_owner ON pr_holdings (owner_email, kupa_id);
