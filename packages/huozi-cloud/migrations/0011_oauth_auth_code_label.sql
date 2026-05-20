-- 0011_oauth_auth_code_label.sql
--
-- User-supplied label captured at consent time, threaded through the
-- authorization-code grant so the resulting `api_keys.name` becomes
-- `[<kind>] <label>` instead of just `[<kind>]`.
--
-- Why on the auth_code row (not on api_keys or oauth_pending_authorizations):
--   - pending row already consumed by the time /token mints the key;
--   - api_keys is downstream — we need the label to ride the auth_code
--     so /token can read it and format the name.
--
-- Refresh-grant path doesn't need its own column: the prior access
-- key's `name` already carries `[<kind>] <label>` and the refresh code
-- copies it forward.

ALTER TABLE oauth_authorization_codes ADD COLUMN label TEXT;
