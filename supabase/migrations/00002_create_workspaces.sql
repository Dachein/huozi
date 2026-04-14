-- Workspaces table
CREATE TABLE public.workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT  slug_format CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$')
);

-- Phase 1: one workspace per user
CREATE UNIQUE INDEX idx_workspaces_owner ON workspaces(owner_id);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- RLS: owners can manage their workspace
CREATE POLICY "Owners can manage workspace" ON workspaces
  FOR ALL USING (auth.uid() = owner_id);
