-- API Keys table
CREATE TABLE public.api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL,
  key_prefix    TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT 'Default',
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- RLS: owners can manage api_keys via workspace ownership
CREATE POLICY "Owners can manage api_keys" ON api_keys
  FOR ALL USING (
    workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
  );
