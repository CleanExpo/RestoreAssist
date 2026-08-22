-- AI draft ownership: disclaimer until holder rewrites + acknowledges
ALTER TABLE "Report"
  ADD COLUMN IF NOT EXISTS "aiDraftGeneratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "aiDraftHumanEditedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reportOwnershipAcknowledgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reportOwnershipAcknowledgedBy" TEXT;
