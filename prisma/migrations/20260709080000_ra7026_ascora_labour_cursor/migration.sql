-- RA-7026: cursor column for the batched Ascora labour importer.
ALTER TABLE "AscoraJob" ADD COLUMN "labourSyncedAt" TIMESTAMP(3);

CREATE INDEX "AscoraJob_labourSyncedAt_idx" ON "AscoraJob"("labourSyncedAt");
