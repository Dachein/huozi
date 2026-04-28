-- Add content_type to files_current to support binary uploads.
--
-- Pre-existing rows are text (UTF-8); leaving the column NULL preserves
-- their inferred-on-read behavior. Binary writes (huozi_upload) populate
-- it explicitly; on read, NULL falls back to mime-guess-by-extension.
--
-- Apply with:
--   wrangler d1 execute huozi-db --remote --file migrations/0008_files_content_type.sql

ALTER TABLE files_current ADD COLUMN content_type TEXT;
