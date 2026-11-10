-- Helper: family assistant database (Cloudflare D1)

CREATE TABLE IF NOT EXISTS members (
  email      TEXT PRIMARY KEY,
  name       TEXT,
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
