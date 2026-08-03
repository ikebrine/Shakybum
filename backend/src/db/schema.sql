-- Shakybum backend schema (SQLite for dev/small-scale; see README for the
-- Postgres migration notes — the SQL here is deliberately close to portable:
-- TEXT ids (uuid strings), REAL for money, INTEGER 0/1 for booleans).

CREATE TABLE IF NOT EXISTS users (
  id                      TEXT PRIMARY KEY,
  email                   TEXT UNIQUE NOT NULL,
  handle                  TEXT UNIQUE NOT NULL,
  name                    TEXT NOT NULL,
  password_hash           TEXT NOT NULL,
  bio                     TEXT NOT NULL DEFAULT '',
  avatar_emoji            TEXT NOT NULL DEFAULT '💃',
  badge                   TEXT NOT NULL DEFAULT 'Newcomer',
  bum_enabled             INTEGER NOT NULL DEFAULT 0,
  allow_download          INTEGER NOT NULL DEFAULT 1,
  contact_email           TEXT,
  contact_phone           TEXT,
  payout_phone            TEXT,
  payout_provider         TEXT,
  paystack_recipient_code TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_requests (
  id                 TEXT PRIMARY KEY,
  payer_id           TEXT NOT NULL REFERENCES users(id),
  creator_id         TEXT NOT NULL REFERENCES users(id),
  amount             REAL NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending|paid_hold|approved|declined|refunded|expired
  paystack_reference TEXT UNIQUE NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contact_creator_status ON contact_requests(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_contact_payer_status ON contact_requests(payer_id, status);

CREATE TABLE IF NOT EXISTS bum_sessions (
  id                 TEXT PRIMARY KEY,
  payer_id           TEXT NOT NULL REFERENCES users(id),
  creator_id         TEXT NOT NULL REFERENCES users(id),
  mins               INTEGER NOT NULL,
  amount             REAL NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',
  paystack_reference TEXT UNIQUE NOT NULL,
  total_sec          INTEGER NOT NULL DEFAULT 0,
  started_at         TEXT,
  ended_at           TEXT,
  extensions         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bum_creator_status ON bum_sessions(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_bum_payer_status ON bum_sessions(payer_id, status);

CREATE TABLE IF NOT EXISTS bum_extensions (
  id                 TEXT PRIMARY KEY,
  bum_session_id     TEXT NOT NULL REFERENCES bum_sessions(id),
  mins               INTEGER NOT NULL,
  amount             REAL NOT NULL,
  paystack_reference TEXT UNIQUE NOT NULL,
  status             TEXT NOT NULL DEFAULT 'initiated', -- initiated|paid|failed
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  sender_id  TEXT NOT NULL REFERENCES users(id),
  chat_key   TEXT NOT NULL, -- sorted "userIdA:userIdB" — see repositories/messages.js
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_key, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,
  text       TEXT NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, read);

-- Central payment ledger — one row per money movement, independent of which
-- domain object (contact_requests / bum_sessions / bum_extensions) it belongs
-- to. Query this for admin/accounting views rather than reconstructing totals
-- from the domain tables.
CREATE TABLE IF NOT EXISTS payments (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id), -- the payer
  kind               TEXT NOT NULL, -- contact|bum|bum_extend
  ref_id             TEXT NOT NULL, -- contact_requests.id / bum_sessions.id / bum_extensions.id
  amount             REAL NOT NULL,
  platform_cut       REAL NOT NULL,
  creator_cut        REAL NOT NULL,
  status             TEXT NOT NULL DEFAULT 'initiated', -- initiated|paid|failed|refunded|released
  paystack_reference TEXT UNIQUE NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(ref_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
