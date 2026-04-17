-- RA-1131: Add auto-decision fields to ScopeVariation
-- Additive only — all columns nullable; safe to apply against existing data.

ALTER TABLE "ScopeVariation"
  ADD COLUMN IF NOT EXISTS "autoDecision"       TEXT,
  ADD COLUMN IF NOT EXISTS "autoDecisionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "autoDecisionAt"     TIMESTAMP(3);
