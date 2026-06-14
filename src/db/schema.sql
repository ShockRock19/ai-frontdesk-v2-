-- AI Front-Desk schema v2 — supercharged edition (SQLite)

CREATE TABLE IF NOT EXISTS admin_user (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  email         TEXT NOT NULL,
  password_hash TEXT,
  salt          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS businesses (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  industry               TEXT DEFAULT '',
  description            TEXT DEFAULT '',
  twilio_number          TEXT UNIQUE,
  tone                   TEXT DEFAULT 'warm, professional, concise',
  target_market          TEXT DEFAULT '',
  services               TEXT DEFAULT '',
  qualification_criteria TEXT DEFAULT '',
  booking_instructions   TEXT DEFAULT '',
  faq                    TEXT DEFAULT '',
  owner_phone            TEXT DEFAULT '',
  owner_email            TEXT DEFAULT '',
  greeting               TEXT DEFAULT '',
  timezone               TEXT DEFAULT 'America/New_York',
  active                 INTEGER NOT NULL DEFAULT 1,
  -- NEW: business hours (JSON array of {day,open,close})
  business_hours         TEXT DEFAULT '',
  -- NEW: after-hours message
  after_hours_message    TEXT DEFAULT '',
  -- NEW: max appointments per day
  max_daily_appointments INTEGER DEFAULT 20,
  -- NEW: appointment reminder lead time in hours
  reminder_hours         INTEGER DEFAULT 24,
  -- NEW: webhook URL for real-time event pushes
  webhook_url            TEXT DEFAULT '',
  -- NEW: webhook secret for HMAC signing
  webhook_secret         TEXT DEFAULT '',
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  name         TEXT DEFAULT '',
  phone        TEXT DEFAULT '',
  email        TEXT DEFAULT '',
  notes        TEXT DEFAULT '',
  -- NEW: lifetime interaction stats
  total_conversations INTEGER DEFAULT 0,
  total_appointments  INTEGER DEFAULT 0,
  lead_score_avg      REAL DEFAULT 0,
  -- NEW: tags for segmentation
  tags         TEXT DEFAULT '',
  -- NEW: opt-out flag
  opted_out    INTEGER DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_biz ON customers(business_id);

CREATE TABLE IF NOT EXISTS conversations (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id),
  channel      TEXT NOT NULL,
  external_id  TEXT,
  customer_id  TEXT REFERENCES customers(id),
  status       TEXT NOT NULL DEFAULT 'open',
  -- NEW: sentiment score (-1 to 1, set by agent at end)
  sentiment    REAL DEFAULT NULL,
  -- NEW: outcome tag
  outcome      TEXT DEFAULT '',
  -- NEW: duration tracking
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at     TEXT DEFAULT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conv_biz ON conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_conv_ext ON conversations(channel, external_id);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  -- NEW: token count for cost tracking
  tokens          INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS appointments (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL REFERENCES businesses(id),
  customer_id     TEXT REFERENCES customers(id),
  conversation_id TEXT REFERENCES conversations(id),
  service         TEXT DEFAULT '',
  starts_at       TEXT NOT NULL,
  duration_min    INTEGER NOT NULL DEFAULT 30,
  notes           TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'scheduled',
  -- NEW: reminder tracking
  reminder_sent   INTEGER DEFAULT 0,
  -- NEW: reschedule count
  reschedule_count INTEGER DEFAULT 0,
  -- NEW: source channel
  source_channel  TEXT DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appt_biz ON appointments(business_id, starts_at);

CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL REFERENCES businesses(id),
  customer_id     TEXT REFERENCES customers(id),
  conversation_id TEXT REFERENCES conversations(id),
  qualified       INTEGER NOT NULL DEFAULT 0,
  score           INTEGER DEFAULT 0,
  summary         TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'new',
  -- NEW: follow-up date
  follow_up_at    TEXT DEFAULT NULL,
  -- NEW: assigned to (for team use)
  assigned_to     TEXT DEFAULT '',
  -- NEW: source channel
  source_channel  TEXT DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lead_biz ON leads(business_id, created_at);

-- NEW: Blocklist table (spam / unwanted callers)
CREATE TABLE IF NOT EXISTS blocklist (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  phone       TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  reason      TEXT DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_block_biz ON blocklist(business_id);

-- NEW: Webhook event log
CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  event_type  TEXT NOT NULL,
  payload     TEXT NOT NULL,
  delivered   INTEGER DEFAULT 0,
  attempts    INTEGER DEFAULT 0,
  last_error  TEXT DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_whook_biz ON webhook_events(business_id, created_at);

-- NEW: API usage / cost tracking
CREATE TABLE IF NOT EXISTS usage_log (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  date        TEXT NOT NULL,
  channel     TEXT NOT NULL,
  input_tokens  INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  conversations INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_biz ON usage_log(business_id, date);
