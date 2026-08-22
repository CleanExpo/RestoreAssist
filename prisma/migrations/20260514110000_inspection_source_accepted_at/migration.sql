-- DR/NRPG inbound-job tracking: add `source` + `acceptedAt` to Inspection.
-- Additive only — no drops, no data movement. Default 'MANUAL' on source
-- keeps every existing row classifiable without a backfill.
ALTER TABLE "Inspection"
  ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);

-- Index supports the dashboard inbound-job alert query:
--   WHERE userId = ? AND source = 'DR_NRPG' AND acceptedAt IS NULL
CREATE INDEX IF NOT EXISTS "Inspection_userId_source_acceptedAt_idx"
  ON "Inspection" ("userId", "source", "acceptedAt");
