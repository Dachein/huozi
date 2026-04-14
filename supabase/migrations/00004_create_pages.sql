-- Pages table
CREATE TABLE public.pages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  content       TEXT NOT NULL,
  content_type  TEXT NOT NULL DEFAULT 'markdown',
  rendered_html TEXT,
  is_published  BOOLEAN NOT NULL DEFAULT true,
  og_image_url  TEXT,
  custom_css    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, slug)
);

CREATE INDEX idx_pages_workspace_slug ON pages(workspace_id, slug);
CREATE INDEX idx_pages_published ON pages(is_published) WHERE is_published = true;

ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can read published pages
CREATE POLICY "Anyone can read published pages" ON pages
  FOR SELECT USING (is_published = true);

-- RLS: owners can manage pages via workspace ownership
CREATE POLICY "Owners can manage pages" ON pages
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );
