-- Adds soft-delete column to api_keys.
--
-- Apply with:
--   wrangler d1 migrations apply huozi-db --remote
--   wrangler d1 migrations apply huozi-db --local   (for local dev)
--
-- Why: revoke used to be a hard DELETE; the audit ("this key existed and was
-- revoked at time X") lived in Supabase cloud_connections. We're collapsing
-- connection metadata into D1 so Cloud and Edge editions share one schema —
-- this column inherits the soft-delete behaviour Supabase used to provide.

ALTER TABLE api_keys ADD COLUMN revoked_at INTEGER;
