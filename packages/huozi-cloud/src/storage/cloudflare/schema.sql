-- huozi-cloud D1 schema v1.
-- Apply with `wrangler d1 execute huozi-db --file src/storage/cloudflare/schema.sql`.
-- Kept minimal; FTS5 and line-offsets indexes come later with Grep's production path.

-- People with login access. One row per email. Replaces Supabase auth.users
-- so Cloud and Edge editions share the same identity backend.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,        -- UUID; matches former Supabase auth.users.id for legacy rows
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Workspaces. The "Cloud SaaS" used to keep these in Supabase
-- cloud_workspaces; both editions now share this D1 table. Each workspace
-- is owned by one user (Cloud); on Edge the owner is the literal "admin".
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,        -- UUID; matches former cloud_workspaces.id for legacy rows
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  owner_id    TEXT NOT NULL,           -- foreign-key-ish to users.id (no FK constraint in D1)
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces (owner_id);

-- Workspace membership. The `owner` row for a workspace is auto-inserted
-- when the workspace is created. Other members arrive via accepted
-- invites. A user can be a member of multiple workspaces; the JWT cookie
-- pins the *current* one (claim `wsid`).
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  role         TEXT NOT NULL,         -- 'owner' | 'member'
  joined_at    INTEGER NOT NULL,
  invited_by   TEXT,                  -- user_id of the inviter; NULL for owners
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members (user_id);

-- Outstanding invites. `token` is a high-entropy random string that lives
-- only in the email + invite URL — never exposed via list endpoints.
-- Redemption: POST /admin/invites/redeem {token, user_id} → INSERT a
-- workspace_members row, mark accepted_at. Tokens are single-use.
CREATE TABLE IF NOT EXISTS workspace_invites (
  token        TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL,         -- 'member' (no admin/owner invites yet)
  invited_by   TEXT NOT NULL,         -- user_id who sent the invite
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  accepted_at  INTEGER,
  revoked_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_invites_workspace_active
  ON workspace_invites (workspace_id, accepted_at, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_invites_email
  ON workspace_invites (email);

-- Folder-level ACLs. Only stored when a folder is set "private"; absence
-- means public. Path prefix MUST end with "/" so prefix matching is
-- unambiguous (e.g. "funds/fund-A/" never collides with "funds/fund-A2/").
--
-- Permission check walks the path's ancestors and picks the longest
-- matching path_prefix. Non-membership (regardless of role) denies access.
-- Workspace owner has NO bypass — data layer is egalitarian.
CREATE TABLE IF NOT EXISTS folder_acls (
  workspace_id      TEXT NOT NULL,
  path_prefix       TEXT NOT NULL,        -- ends with "/"
  mode              TEXT NOT NULL,        -- 'private' (only value in v1)
  last_changed_by   TEXT NOT NULL,        -- user_id; audit only, no privilege
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

-- Pending email-OTP codes. Short-lived (5 min) state used by the
-- /auth/otp/{request,verify} endpoints. We store the SHA-256 of the code,
-- never the plaintext, plus an attempts counter for replay/brute-force
-- defense. Multiple in-flight codes per email are allowed (user retries);
-- verify checks the most recent unconsumed row.
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


-- Edge-edition email+password credentials. One row per user with a
-- password (Cloud users have none — they only login via OTP). The hash
-- column stores a self-describing PHC string ("$pbkdf2-sha256$i=…"),
-- so a future migration to argon2id is transparent — verify dispatches
-- by algorithm prefix. See `auth/password.ts`.
CREATE TABLE IF NOT EXISTS password_credentials (
  user_id     TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);


-- One-shot magic links (Phase B `huozi_grant_browser_session`). Token
-- is high-entropy random; click consumes it (consumed_at set) so even
-- if the URL leaks afterwards it's useless. workspace_id is captured
-- at issue time so the resulting cookie binds back to the same wsid
-- the issuing principal had.
CREATE TABLE IF NOT EXISTS magic_links (
  token        TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  consumed_at  INTEGER,
  issued_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_magic_links_user
  ON magic_links (user_id);


-- Files currently present in each workspace (hot-path index for reads).
CREATE TABLE IF NOT EXISTS files_current (
  workspace_id TEXT NOT NULL,
  path         TEXT NOT NULL,
  blob_sha     TEXT NOT NULL,
  size         INTEGER NOT NULL,
  mtime        INTEGER NOT NULL,
  encoding     TEXT,
  line_endings TEXT,
  content_type TEXT,
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
-- Sliding-window expiration model.
-- - `ttl_seconds` = how long of *inactivity* kills the key. NULL means
--   "never expires" (the legacy default — all keys pre-migration sit at
--   NULL and keep working forever, matching prior behaviour).
-- - `expires_at` is the effective deadline. On every successful auth we
--   bump BOTH `last_used_at = now` AND `expires_at = now + ttl_seconds`
--   (when ttl_seconds is non-null) so idle keys decay naturally.
CREATE TABLE IF NOT EXISTS api_keys (
  key_id             TEXT PRIMARY KEY,
  key_hash           TEXT NOT NULL UNIQUE,
  workspace_id       TEXT NOT NULL,
  scope_path         TEXT,
  principal_type     TEXT NOT NULL,
  principal_id       TEXT NOT NULL,
  created_at         INTEGER NOT NULL,
  expires_at         INTEGER,
  last_used_at       INTEGER,
  ttl_seconds        INTEGER,
  name               TEXT,
  -- "What did this Agent last actually DO?" Populated only on tools/call,
  -- so an idle key that just pings with tools/list keeps last_used_at
  -- fresh while last_action_* stays blank. Gives the Web UI a richer
  -- "last action" line than a bare timestamp.
  last_action_tool   TEXT,
  last_action_target TEXT,
  -- Soft-delete marker. Revoke sets this to now(); auth path filters
  -- `revoked_at IS NULL`. Keeps the row around for audit ("when was this
  -- key revoked?") which used to live in Supabase cloud_connections.
  revoked_at         INTEGER,
  -- Per-key capability narrowing (v2 hook). NULL = inherit creator's
  -- workspace_members.role caps. Non-null = JSON array, intersected with
  -- role caps so a key can never escalate beyond its creator. v1 always
  -- writes NULL; advanced "narrow my key" UI lights this up later.
  caps               TEXT,
  -- OAuth 2.1 link: when this key was minted by /oauth/token (vs. legacy
  -- direct mint or device-flow mint), this points at the oauth_clients
  -- row so we can show "issued to: Cursor (OAuth)" in audit. NULL for
  -- non-OAuth keys (the vast majority of legacy rows).
  oauth_client_id    TEXT
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
-- `expires_at` NULL = never expires. Non-null = epoch-ms deadline; reads
-- after that point treat the share as gone (same surface as revoke).
-- Owners can revoke early via `revoked_at`.
CREATE TABLE IF NOT EXISTS shares (
  slug          TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  blob_sha      TEXT NOT NULL,
  commit_sha    TEXT NOT NULL,
  passcode_hash TEXT,
  created_at    INTEGER NOT NULL,
  revoked_at    INTEGER,
  expires_at    INTEGER,
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

-- ── OAuth 2.1 + PKCE (RFC 6749 §4.1, RFC 7636, RFC 7591) ────────────────
--
-- Primary auth path for MCP clients (Claude Code, Cursor, Codex, Hermes…).
-- Access tokens themselves piggyback on `api_keys` (with `oauth_client_id`
-- column tagging the row); these auxiliary tables hold the OAuth state
-- machine — registered clients, in-flight authorize sessions, single-use
-- auth codes, and refresh tokens.
--
-- Token shape on the wire:
--   - Legacy:    Authorization: Bearer hz_<48hex>
--   - OAuth:     Authorization: Bearer oat_<48hex>   (oat = OAuth Access Token)
--   - Refresh:   ort_<48hex>  (only at /oauth/token, never to /mcp)

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id        TEXT PRIMARY KEY,
  client_name      TEXT,
  client_uri       TEXT,
  redirect_uris    TEXT NOT NULL,              -- JSON array
  grant_types      TEXT NOT NULL,              -- JSON array
  token_endpoint_auth_method TEXT NOT NULL,    -- 'none' (PKCE-only public client) is the only accepted value
  scope            TEXT,
  created_at       INTEGER NOT NULL,
  last_used_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_name
  ON oauth_clients (client_name);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code                  TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  workspace_id          TEXT NOT NULL,         -- 'ws_<slug>' form (matches api_keys)
  redirect_uri          TEXT NOT NULL,
  scope                 TEXT,
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,         -- 'S256' only
  created_at            INTEGER NOT NULL,
  expires_at            INTEGER NOT NULL,
  consumed_at           INTEGER,
  -- Optional user-supplied label from the consent form (e.g. project
  -- name). Folded into api_keys.name at /token time so the UI subtitle
  -- can distinguish multiple connections of the same agent kind.
  label                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires
  ON oauth_authorization_codes (expires_at);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash            TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  workspace_id          TEXT NOT NULL,
  scope                 TEXT,
  current_access_key_id TEXT,
  previous_token_hash   TEXT,
  created_at            INTEGER NOT NULL,
  expires_at            INTEGER NOT NULL,
  revoked_at            INTEGER
);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_user
  ON oauth_refresh_tokens (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_client
  ON oauth_refresh_tokens (client_id);

CREATE TABLE IF NOT EXISTS oauth_pending_authorizations (
  session_id            TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL,
  redirect_uri          TEXT NOT NULL,
  scope                 TEXT,
  state                 TEXT,
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  created_at            INTEGER NOT NULL,
  expires_at            INTEGER NOT NULL,
  consumed_at           INTEGER
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_expires
  ON oauth_pending_authorizations (expires_at);

-- ── Tasks: email magic-address + thread index ──────────────────────────
--
-- See `app/docs/tasks.md` and migration 0010_tasks_email.sql for context.
--
-- `email_tokens` resolves a magic address `t-<token>@mail.huozi.app` to
-- a workspace+user. Cloud-only; Edge uses webhook ingest. Tokens are the
-- credential — drop unknown addresses silently rather than bouncing.
--
-- `task_message_index` maps RFC 2822 Message-Id to task_id, scoped by
-- workspace so cross-workspace thread spoofing isn't possible. Used to
-- decide "this reply lands on existing task" vs "new ticket in inbox."

CREATE TABLE IF NOT EXISTS email_tokens (
  token            TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  revoked_at       INTEGER,
  last_used_at     INTEGER,
  allowed_senders  TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_user
  ON email_tokens (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_email_tokens_active
  ON email_tokens (revoked_at);

CREATE TABLE IF NOT EXISTS task_message_index (
  workspace_id  TEXT NOT NULL,
  message_id    TEXT NOT NULL,
  task_id       TEXT NOT NULL,
  recorded_at   INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_task_message_index_task
  ON task_message_index (workspace_id, task_id);

-- User-chosen email aliases (sibling to email_tokens). See migration
-- 0012_email_aliases.sql for the full design rationale.
CREATE TABLE IF NOT EXISTS email_aliases (
  local_part       TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL,
  last_used_at     INTEGER,
  allowed_senders  TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_aliases_user
  ON email_aliases (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_email_aliases_active
  ON email_aliases (active);
