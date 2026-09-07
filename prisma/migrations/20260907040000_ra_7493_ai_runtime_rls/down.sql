-- Reverse of 20260907040000_ra_7493_ai_runtime_rls.
--
-- Drops the five SELECT policies and disables RLS on the five tables, leaving
-- them exactly as 20260907030000 created them. Nothing else is touched.
--
-- Order matters: a policy cannot outlive its table, but RLS can be disabled
-- while policies still exist, so the policies go first and the ENABLE is
-- reversed after — the mirror image of the forward file.
--
-- Note for whoever runs this: rolling this back alone leaves the five tables
-- RLS-free while they still exist, which is the state the RA-6677 guard fails
-- on. That is intentional — a reversal should restore the previous state, not
-- silently keep half of a later change. Roll back 20260907030000 as well.

DROP POLICY IF EXISTS "AiStyleProfile_select_member" ON "AiStyleProfile";
DROP POLICY IF EXISTS "AiJobSuggestion_select_member" ON "AiJobSuggestion";
DROP POLICY IF EXISTS "AiRunnerReceipt_select_member" ON "AiRunnerReceipt";
DROP POLICY IF EXISTS "AiRunnerBudget_select_member" ON "AiRunnerBudget";
DROP POLICY IF EXISTS "AiRunnerFlag_select_member" ON "AiRunnerFlag";

ALTER TABLE "AiStyleProfile" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "AiJobSuggestion" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "AiRunnerReceipt" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "AiRunnerBudget" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "AiRunnerFlag" DISABLE ROW LEVEL SECURITY;
