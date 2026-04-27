-- Drop the cloud_connections table.
--
-- Connection metadata (label, agent_kind, revoked_at) has been consolidated
-- into huozi-cloud's D1 `api_keys` table:
--   - label + agent_kind  → encoded into `api_keys.name` as "[<kind>] <label>"
--   - revoked_at          → new `api_keys.revoked_at` column (D1 migration
--                           0001_add_api_keys_revoked_at.sql)
--
-- Ordering: apply this AFTER the D1 migration AND after the Next.js code
-- changes that stop reading/writing this table have been deployed. Once
-- gone, there is no rollback within Supabase — the data lives in D1.
--
-- Apply with: supabase db push   (or via the dashboard).

DROP TABLE IF EXISTS public.cloud_connections;
