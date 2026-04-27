-- Phase B-D hook: per-key capability narrowing.
--
-- v1 always writes NULL = "inherit creator's role caps".
-- Advanced future feature: writes a JSON array of allowed capability
-- names; runtime intersects with role caps so a key never escalates.
--
-- Apply with:
--   wrangler d1 execute huozi-db --remote --file migrations/0006_add_api_keys_caps.sql

ALTER TABLE api_keys ADD COLUMN caps TEXT;
