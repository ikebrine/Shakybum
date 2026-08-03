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

-- payment status values: initiated|paid|failed|refunded|processing_refund|
--                         processing_payout|released|payout_failed
CREATE TABLE IF NOT EXISTS payments (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id), -- the payer
  kind               TEXT NOT NULL, -- contact|bum|bum_extend
  ref_id             TEXT NOT NULL, -- contact_requests.id / bum_sessions.id / bum_extensions.id
  amount             REAL NOT NULL,
  platform_cut       REAL NOT NULL,
  creator_cut        REAL NOT NULL,
  status             TEXT NOT NULL DEFAULT 'initiated',
  paystack_reference TEXT UNIQUE NOT NULL,
  payout_reference   TEXT UNIQUE, -- set when a transfer to the creator is initiated; confirmed via transfer.success webhook
  refund_reference   TEXT,        -- Paystack refunds are tracked by the original transaction reference, not a separate one
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(ref_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_payout_ref ON payments(payout_reference);

-- ── Social/content (posts, likes, comments, follows, challenges) ──
-- Deliberately metadata-only: no video file storage/CDN here (would need
-- S3/Cloudinary/Mux) — video_url is expected to point at wherever that
-- ends up living. This backend covers the social graph and engagement data
-- that badge computation and feeds need, not media hosting.

CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  video_url     TEXT,
  caption       TEXT NOT NULL DEFAULT '',
  move_tag      TEXT,
  kind          TEXT NOT NULL DEFAULT 'post', -- post|short
  likes_count   INTEGER NOT NULL DEFAULT 0,   -- denormalized for feed sort/display; source of truth is the likes table
  comments_count INTEGER NOT NULL DEFAULT 0,  -- denormalized; source of truth is the comments table
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_kind ON posts(kind, created_at);

CREATE TABLE IF NOT EXISTS likes (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS follows (
  id           TEXT PRIMARY KEY,
  follower_id  TEXT NOT NULL REFERENCES users(id), -- the one doing the following
  followee_id  TEXT NOT NULL REFERENCES users(id), -- the one being followed
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);

CREATE TABLE IF NOT EXISTS challenges (
  id          TEXT PRIMARY KEY,
  creator_id  TEXT NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  move_tag    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS challenge_entries (
  id           TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id),
  user_id      TEXT NOT NULL REFERENCES users(id),
  post_id      TEXT NOT NULL REFERENCES posts(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(challenge_id, user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_entries_challenge ON challenge_entries(challenge_id);
