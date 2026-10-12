-- P2 / V1 P1-3 — moisture reading invalidation (no hard delete of audit trail)
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "invalidatedAt" TIMESTAMP(3);
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "invalidatedByUserId" TEXT;
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "invalidationReason" TEXT;
ALTER TABLE "MoistureReading" ADD COLUMN IF NOT EXISTS "replacementReadingId" TEXT;

CREATE INDEX IF NOT EXISTS "MoistureReading_inspectionId_invalidatedAt_idx"
  ON "MoistureReading"("inspectionId", "invalidatedAt");
