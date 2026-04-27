-- Drop the agent-install OTP state-machine table.
--
-- Phase A killed the Supabase-backed agent-install flow:
-- /api/agent/start and /api/agent/step are gone. Agents now obtain keys
-- by having a logged-in user mint one at /workspace/connect (the same
-- mechanism Edge already uses).
--
-- Apply with: supabase db push   (or via Dashboard SQL editor)

DROP TABLE IF EXISTS public.agent_sessions;
