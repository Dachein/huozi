-- Final Supabase teardown.
--
-- After Phase B, the Cloud edition no longer reads anything from Supabase.
-- Workspace metadata + members live in D1; auth lives in D1 (jose JWTs +
-- otp_codes); files + commits + api_keys live in D1/R2 (huozi-cloud Worker).
--
-- This drops the last two business tables that were still readable but
-- unused. After applying:
--   - public.cloud_workspaces  →  gone
--   - public.profiles          →  gone
--   - auth.users               →  remains (Supabase managed; pause project later)
--
-- Apply via Supabase Dashboard → SQL editor (or `supabase db push`).
-- This is irreversible — applies an "I really am done with Supabase"
-- decision the user already made.

DROP TABLE IF EXISTS public.cloud_workspaces;
DROP TABLE IF EXISTS public.profiles;

-- Once you confirm everything still works for ~24h, also pause the project:
--   Supabase Dashboard → Settings → Pause project
-- Saves $25/mo if you're on Pro.
