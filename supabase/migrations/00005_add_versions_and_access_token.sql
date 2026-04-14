-- Add versioning and access token support to pages

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS latest_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS access_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS access_token_hint TEXT;

CREATE TABLE public.page_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  content       TEXT NOT NULL,
  content_type  TEXT NOT NULL DEFAULT 'markdown',
  rendered_html TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(page_id, version)
);

CREATE INDEX idx_page_versions_page ON page_versions(page_id, version);

ALTER TABLE public.page_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read versions of published pages" ON page_versions
  FOR SELECT USING (
    page_id IN (SELECT id FROM pages WHERE is_published = true)
  );

CREATE POLICY "Owners can manage page versions" ON page_versions
  FOR ALL USING (
    page_id IN (
      SELECT p.id FROM pages p
      JOIN workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- Migrate existing content to page_versions
INSERT INTO page_versions (page_id, version, content, content_type, rendered_html, created_at)
SELECT id, 1, content, content_type, rendered_html, created_at
FROM pages
WHERE content IS NOT NULL;
