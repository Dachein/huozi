-- 0009_oauth_2_1.sql
--
-- OAuth 2.1 + PKCE primary auth path for MCP clients (Claude Code, Cursor,
-- Codex, Hermes, …). Adds three new tables; access tokens themselves piggy-
-- back on the existing `api_keys` table (with the new `oauth_client_id`
-- column below) so `/mcp` Bearer validation keeps using the same code path.
--
-- Legacy `hz_<random>` keys keep working unchanged. RFC 8628 device flow
-- keeps working unchanged. This migration is purely additive.
--
-- Token shape on the wire:
--   - Legacy:        Authorization: Bearer hz_<48hex>
--   - OAuth 2.1:     Authorization: Bearer oat_<48hex>     (oat = OAuth Access Token)
--   - Refresh:       used only at /oauth/token, never to /mcp:
--                    ort_<48hex>                            (ort = OAuth Refresh Token)

-- ── 1. Registered MCP clients (DCR; RFC 7591) ────────────────────────────
--
-- One row per (Claude Code instance | Cursor instance | …) that registered
-- itself via POST /oauth/register. Most clients re-register on every fresh
-- install; that's fine — `client_id` is opaque to the user, and unused rows
-- are harmless. We still index by `client_name` for cleanup.
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id        TEXT PRIMARY KEY,           -- opaque, generated server-side
  client_name      TEXT,                       -- self-reported, e.g. "Claude Code"
  client_uri       TEXT,                       -- self-reported homepage
  redirect_uris    TEXT NOT NULL,              -- JSON array of registered URIs
  grant_types      TEXT NOT NULL,              -- JSON array; we accept ["authorization_code","refresh_token"]
  token_endpoint_auth_method TEXT NOT NULL,    -- 'none' (public client w/ PKCE) is the only thing we accept
  scope            TEXT,                       -- requested scope at registration time (informational)
  created_at       INTEGER NOT NULL,
  last_used_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_name
  ON oauth_clients (client_name);

-- ── 2. Authorization codes (short-lived, single-use, PKCE-bound) ─────────
--
-- Lifecycle:
--   POST /oauth/authorize/approve  →  INSERT row  (15-min TTL)
--   POST /oauth/token              →  consume row, mint access_token + refresh_token
-- A row may also be marked `consumed_at` if the user pressed back / denied.
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code                  TEXT PRIMARY KEY,      -- 48-hex opaque
  client_id             TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  workspace_id          TEXT NOT NULL,         -- 'ws_<slug>' form (matches api_keys)
  redirect_uri          TEXT NOT NULL,         -- echo of the URI used in /authorize; must match at /token
  scope                 TEXT,                  -- requested scope, e.g. "read write share"
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,         -- 'S256' (we don't accept 'plain')
  created_at            INTEGER NOT NULL,
  expires_at            INTEGER NOT NULL,      -- created_at + 15 min
  consumed_at           INTEGER                -- non-null = single-use exhausted
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires
  ON oauth_authorization_codes (expires_at);

-- ── 3. Refresh tokens (long-lived, rotating) ─────────────────────────────
--
-- Refresh-token rotation: every successful refresh returns a new refresh
-- token AND revokes the previous one. The `previous_token_hash` chain lets
-- us detect token-leak replay (RFC 6819 §5.2.2.3) — if a revoked token is
-- presented again after a new one has been issued, we kill the entire chain.
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash            TEXT PRIMARY KEY,      -- sha256(token); we never store plaintext
  client_id             TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  workspace_id          TEXT NOT NULL,
  scope                 TEXT,
  /** key_id of the access_token (api_keys row) currently paired with this refresh token. */
  current_access_key_id TEXT,
  previous_token_hash   TEXT,                  -- chain pointer; null = first in chain
  created_at            INTEGER NOT NULL,
  expires_at            INTEGER NOT NULL,      -- 30 days
  revoked_at            INTEGER                -- non-null = no longer usable
);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_user
  ON oauth_refresh_tokens (user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_client
  ON oauth_refresh_tokens (client_id);

-- ── 4. api_keys: add oauth_client_id ─────────────────────────────────────
--
-- Tags an access-token row as having been minted via OAuth (vs legacy
-- direct mint or device-flow mint). NULL for non-OAuth keys, which is the
-- vast majority of existing rows.
ALTER TABLE api_keys ADD COLUMN oauth_client_id TEXT;

-- ── 5. Pending /authorize sessions ───────────────────────────────────────
--
-- The agent's browser hits worker /oauth/authorize with all the OAuth
-- params; we stash them under a short opaque session_id and 302 the
-- browser to the Next.js /authorize page. The Next.js page then asks the
-- worker (admin-secret) for the pending request, renders consent, and on
-- approve calls back to mint the auth_code.
CREATE TABLE IF NOT EXISTS oauth_pending_authorizations (
  session_id            TEXT PRIMARY KEY,      -- 32-hex opaque, lives in the URL
  client_id             TEXT NOT NULL,
  redirect_uri          TEXT NOT NULL,
  scope                 TEXT,
  state                 TEXT,                  -- echo back to client at redirect time
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  created_at            INTEGER NOT NULL,
  expires_at            INTEGER NOT NULL,      -- 15 min — must match user attention span
  consumed_at           INTEGER                -- set when /approve mints the code; replay guard
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_expires
  ON oauth_pending_authorizations (expires_at);
