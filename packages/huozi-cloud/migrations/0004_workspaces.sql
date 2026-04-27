-- Migrate workspace metadata from Supabase to D1.
--
-- Apply with:
--   wrangler d1 execute huozi-db --remote --file migrations/0004_workspaces.sql

CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces (owner_id);
