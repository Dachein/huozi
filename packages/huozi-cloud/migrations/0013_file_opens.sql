-- 0013_file_opens.sql
--
-- Per-user file-open tracking — powers the "last opened" timestamp on the
-- miniapp pinned cards (and any future recently-opened surfaces).
--
-- Why a new table instead of reusing `commits`:
--   `commits` / /events/recent record *mutations* (create/edit/write/...). A
--   plain view ("open") produces no commit, so last-edited != last-opened. An
--   open is an explicit UI action the client POSTs to /events/open; deriving
--   it from huozi_read would also count Agent reads, which we don't want.
--
-- Design:
--   - Keyed by principal_id (a user's API keys all share one principal_id),
--     so the timestamp is per-user and follows them across devices.
--   - PRIMARY KEY (workspace_id, principal_id, path) + upsert keeps exactly
--     one row per (user, file) holding the latest open time.
--   - Index on (workspace_id, principal_id, opened_at DESC) serves the
--     "recent opens" read.
--
-- NOTE: opens.ts also creates this table lazily at runtime
-- (CREATE TABLE IF NOT EXISTS) because the deploy token lacks D1-management
-- permissions (API error 7403). This file is the canonical record; either
-- path yields the same schema.

CREATE TABLE IF NOT EXISTS file_opens (
  workspace_id  TEXT NOT NULL,
  principal_id  TEXT NOT NULL,
  path          TEXT NOT NULL,
  opened_at     INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, principal_id, path)
);

CREATE INDEX IF NOT EXISTS idx_file_opens_recent
  ON file_opens (workspace_id, principal_id, opened_at DESC);
