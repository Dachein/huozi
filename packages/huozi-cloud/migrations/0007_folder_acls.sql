-- Folder-level ACLs (per-path access lists).
--
-- Apply with:
--   wrangler d1 execute huozi-db --remote --file migrations/0007_folder_acls.sql

CREATE TABLE IF NOT EXISTS folder_acls (
  workspace_id      TEXT NOT NULL,
  path_prefix       TEXT NOT NULL,
  mode              TEXT NOT NULL,
  last_changed_by   TEXT NOT NULL,
  last_changed_at   INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, path_prefix)
);

CREATE INDEX IF NOT EXISTS idx_folder_acls_ws
  ON folder_acls (workspace_id);

CREATE TABLE IF NOT EXISTS folder_acl_members (
  workspace_id  TEXT NOT NULL,
  path_prefix   TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  added_by      TEXT NOT NULL,
  added_at      INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, path_prefix, user_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_acl_members_user
  ON folder_acl_members (workspace_id, user_id);
