-- Adds D1-backed identity tables for the auth replacement (Phase A of the
-- "kill Supabase" arc). After this migration ships:
--   - /auth/otp/{request,verify} routes can store + verify OTP codes.
--   - /auth/me reads the JWT cookie and returns the principal from `users`.
--   - Cloud and Edge editions both run the same login flow.
--
-- Apply with:
--   wrangler d1 execute huozi-db --remote --file migrations/0003_users_and_otp.sql

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS otp_codes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  consumed_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_email_active
  ON otp_codes (email, consumed_at, expires_at);
