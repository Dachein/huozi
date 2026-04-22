-- huozi-cloud D1 schema v1.
-- Apply with `wrangler d1 execute huozi-db --file src/storage/cloudflare/schema.sql`.
-- Kept minimal; FTS5 and line-offsets indexes come later with Grep's production path.

-- Files currently present in each workspace (hot-path index for reads).
CREATE TABLE IF NOT EXISTS files_current (
  workspace_id TEXT NOT NULL,
  path         TEXT NOT NULL,
  blob_sha     TEXT NOT NULL,
  size         INTEGER NOT NULL,
  mtime        INTEGER NOT NULL,
  encoding     TEXT,
  line_endings TEXT,
  PRIMARY KEY (workspace_id, path)
);

CREATE INDEX IF NOT EXISTS idx_files_current_ws
  ON files_current (workspace_id);

-- Ordered commit chain per workspace. `paths_json` is denormalized for quick
-- single-row reads; `commit_paths` below is the indexed join side.
CREATE TABLE IF NOT EXISTS commits (
  workspace_id TEXT NOT NULL,
  commit_sha   TEXT NOT NULL,
  parent_sha   TEXT,
  author_id    TEXT NOT NULL,
  author_type  TEXT NOT NULL,
  message      TEXT NOT NULL,
  timestamp    INTEGER NOT NULL,
  paths_json   TEXT NOT NULL,
  PRIMARY KEY (workspace_id, commit_sha)
);

CREATE INDEX IF NOT EXISTS idx_commits_ws_ts
  ON commits (workspace_id, timestamp DESC);

-- Per-path rows inside each commit — used by `huozi_history` to filter
-- "commits that touched file X" efficiently.
CREATE TABLE IF NOT EXISTS commit_paths (
  workspace_id    TEXT NOT NULL,
  commit_sha      TEXT NOT NULL,
  path            TEXT NOT NULL,
  operation       TEXT NOT NULL,
  before_blob_sha TEXT,
  after_blob_sha  TEXT,
  additions       INTEGER NOT NULL DEFAULT 0,
  deletions       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, commit_sha, path)
);

CREATE INDEX IF NOT EXISTS idx_commit_paths_ws_path
  ON commit_paths (workspace_id, path, commit_sha);

-- API keys with optional scope. Bearer tokens are SHA-256-hashed on the
-- write-side; lookup compares by `key_hash`.
CREATE TABLE IF NOT EXISTS api_keys (
  key_id         TEXT PRIMARY KEY,
  key_hash       TEXT NOT NULL UNIQUE,
  workspace_id   TEXT NOT NULL,
  scope_path     TEXT,
  principal_type TEXT NOT NULL,
  principal_id   TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER,
  last_used_at   INTEGER,
  name           TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_ws ON api_keys (workspace_id);

-- Short-lived single-use tickets used to authenticate WebSocket upgrades
-- at /events/ws. Browsers can't send Authorization headers during an
-- upgrade handshake, so the flow is:
--   1. Next.js server POSTs /events/mint-ticket with Bearer <api_key>.
--   2. Worker inserts a row here (60s TTL) and returns the ticket string.
--   3. Browser opens wss://.../events/ws?ticket=<ticket>.
--   4. Worker atomically marks `used = 1`, binds principal to the ws.
CREATE TABLE IF NOT EXISTS api_tickets (
  ticket         TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL,
  scope_path     TEXT,
  principal_type TEXT NOT NULL,
  principal_id   TEXT NOT NULL,
  expires_at     INTEGER NOT NULL,
  used           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_api_tickets_expires
  ON api_tickets (expires_at);

-- Device authorization grants (OAuth 2.0 device flow, §3.2).
--
-- Agent flow, mirroring `claude login` / `gh auth login`:
--   1. Agent POSTs /auth/device-code, gets { device_code, user_code,
--      verification_url, interval, expires_in }.
--   2. Agent shows user `user_code` + URL. Agent starts polling
--      /auth/token with the device_code.
--   3. User opens huozi.app/device?code=<user_code> (same tab that's
--      already signed in, typically), picks a workspace, clicks
--      Authorize. Next.js server-side calls Worker
--      /admin/device-authorize which resolves user_code → grant row,
--      mints a scoped api_key, stores it on the row.
--   4. Agent's next poll sees status='authorized', returns the key,
--      the row is marked consumed and the plaintext key is scrubbed.
--
-- user_code is 8 chars (e.g. "ABCD-1234") to make it easy to read
-- aloud / retype. Expiry is 15 min by default.
CREATE TABLE IF NOT EXISTS device_grants (
  device_code     TEXT PRIMARY KEY,
  user_code       TEXT NOT NULL UNIQUE,
  client_name     TEXT,
  agent_kind      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
    /* pending | authorized | denied | expired | consumed */
  user_id         TEXT,
  workspace_id    TEXT,
  workspace_slug  TEXT,
  api_key         TEXT,
  api_key_id      TEXT,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  authorized_at   INTEGER,
  consumed_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_device_grants_user_code
  ON device_grants (user_code);

CREATE INDEX IF NOT EXISTS idx_device_grants_status
  ON device_grants (status, expires_at);

-- Public shares — one row per `huozi.app/p/<slug>` URL. The slug points
-- at a *snapshot* (blob_sha) captured at publish time; later edits to the
-- source file don't affect the published link. R2's content-addressed
-- storage means the frozen bytes remain fetchable as long as the blob row
-- (or any commit referencing it) exists.
--
-- `passcode_hash` NULL = fully public. Non-null = 6-digit SHA-256 gate.
-- No expiry in v1. Owners can revoke via `revoked_at`.
CREATE TABLE IF NOT EXISTS shares (
  slug          TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  blob_sha      TEXT NOT NULL,
  commit_sha    TEXT NOT NULL,
  passcode_hash TEXT,
  created_at    INTEGER NOT NULL,
  revoked_at    INTEGER,
  view_count    INTEGER NOT NULL DEFAULT 0,
  /* The user-facing principal who issued the share (for audit; RLS lives at
     the Worker boundary via api_keys). */
  created_by    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shares_ws
  ON shares (workspace_id);

CREATE INDEX IF NOT EXISTS idx_shares_ws_path
  ON shares (workspace_id, file_path);

-- FTS5 trigram index for grep pre-filtering.
-- Maintained by WorkspaceDO: one row per current file version. Before an
-- UPDATE we DELETE the existing row for (workspace_id, path) and re-INSERT
-- — FTS5 virtual tables don't support ON CONFLICT because the "primary
-- key" (workspace_id, path) isn't visible to the underlying FTS5 index.
-- Trigram tokenizer allows literal-substring search via MATCH '"xyz"'.
CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
  workspace_id UNINDEXED,
  path UNINDEXED,
  content,
  tokenize = 'trigram'
);
