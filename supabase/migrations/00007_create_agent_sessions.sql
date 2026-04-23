-- Short-lived state-machine rows for the Agent-driven install flow.
--
-- The /api/agent/start endpoint inserts a row and returns its id. Every
-- subsequent /api/agent/step call looks up the row, dispatches on `state`,
-- and writes back the new state. Rows expire after 30 minutes; a separate
-- cron job (or pg_cron) will eventually reap expired rows.
--
-- Access model: opaque session_id IS the access control. Only code paths
-- that already hold the session_id (i.e. the Agent that just created it
-- via /agent/start) can progress the flow. Nothing cross-joins to
-- user-owned tables, so RLS "no policies" is safe — the service_role key
-- used by our route handlers bypasses RLS anyway.

CREATE TABLE IF NOT EXISTS public.agent_sessions (
  id               TEXT PRIMARY KEY,

  -- State-machine position. See src/lib/agent-session/machine.ts.
  state            TEXT        NOT NULL DEFAULT 'await_choice',

  -- Which of the three install paths the user picked.
  --   '1' = signup, '2' = browser/device flow, '3' = paste token
  choice           TEXT,

  -- For choice=1: email collected in the signup flow.
  email            TEXT,

  -- Populated once OTP verification succeeds.
  user_id          UUID,

  -- Populated once the workspace is auto-created.
  workspace_id    UUID,
  workspace_slug  TEXT,

  -- Populated once the api_key is minted. Plaintext is returned ONCE in
  -- the response body; we only keep the key_id for later audit.
  api_key_id       TEXT,

  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: only the service_role key (used server-side) can touch this.

CREATE INDEX IF NOT EXISTS idx_agent_sessions_expires
  ON public.agent_sessions(expires_at);
