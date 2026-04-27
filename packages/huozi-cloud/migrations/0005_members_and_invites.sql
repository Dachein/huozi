-- Phase B-A: workspace membership + invites.
-- Apply with: wrangler d1 execute huozi-db --remote --file migrations/0005_members_and_invites.sql

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  role         TEXT NOT NULL,
  joined_at    INTEGER NOT NULL,
  invited_by   TEXT,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members (user_id);

CREATE TABLE IF NOT EXISTS workspace_invites (
  token        TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL,
  invited_by   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  accepted_at  INTEGER,
  revoked_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_invites_workspace_active
  ON workspace_invites (workspace_id, accepted_at, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_invites_email
  ON workspace_invites (email);

-- Backfill: every existing workspace gets an owner membership row.
-- Idempotent thanks to the composite PK + INSERT OR IGNORE.
INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, joined_at, invited_by)
SELECT id, owner_id, 'owner', created_at, NULL FROM workspaces;
