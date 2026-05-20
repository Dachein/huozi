-- 0012_email_aliases.sql
--
-- Per-user custom email aliases for inbound mail. Sibling to email_tokens:
-- tokens are random-uuid magic addresses (delivered to anyone who knows them
-- → spam-friendly but unguessable); aliases are user-chosen prefixes (e.g.
-- `dachein@mail.huozi.app`) → memorable but enumerable.
--
-- Both paths flow into the same mail-inbound handler in huozi-cloud. The
-- parser tries the alias table first (more common, more cache-friendly);
-- falls back to the `t-<32hex>` token regex.
--
-- Design rules:
--   - local_part is PRIMARY KEY so it's globally unique across the zone.
--     First claim wins. Squatting is mitigated by sender-allowlist defaults.
--   - active = 0 means mail is silently dropped (paused), not deleted.
--     User can re-Activate without losing the prefix or the allowlist.
--   - allowed_senders mirrors email_tokens shape for parity.

CREATE TABLE IF NOT EXISTS email_aliases (
  local_part       TEXT PRIMARY KEY,        -- lowercase [a-z0-9](-?[a-z0-9])* 2-30 chars; URL-safe
  workspace_id     TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  active           INTEGER NOT NULL DEFAULT 1,  -- 0 = paused (drop mail), 1 = live
  created_at       INTEGER NOT NULL,
  last_used_at     INTEGER,                 -- last successful delivery; "this works" UI hint
  allowed_senders  TEXT                     -- JSON array of domain strings; NULL = any
);

CREATE INDEX IF NOT EXISTS idx_email_aliases_user
  ON email_aliases (workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_email_aliases_active
  ON email_aliases (active);
