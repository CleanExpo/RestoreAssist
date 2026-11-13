-- RA-8043e Slice 1a (M1): record which Drive credential produced each claim
-- analysis batch and, only for a firm's own Drive, which firm it belongs to.
--
-- Additive only. The global unique on ClaimAnalysis.googleDriveFileId stays:
-- analyze-batch keeps upserting on it until Slice 1a-ii. No backfill: every
-- existing batch came from the platform service account, so the column
-- default (PLATFORM_SERVICE_ACCOUNT, no firm) is already true for them and
-- satisfies the CHECK below.

-- CreateEnum
CREATE TYPE "ClaimDriveSource" AS ENUM ('PLATFORM_SERVICE_ACCOUNT', 'FIRM_OAUTH');

-- AlterTable
ALTER TABLE "ClaimAnalysisBatch" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "source" "ClaimDriveSource" NOT NULL DEFAULT 'PLATFORM_SERVICE_ACCOUNT';

-- CreateIndex
CREATE INDEX "ClaimAnalysisBatch_organizationId_idx" ON "ClaimAnalysisBatch"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimAnalysis_batchId_googleDriveFileId_key" ON "ClaimAnalysis"("batchId", "googleDriveFileId");

-- AddForeignKey
ALTER TABLE "ClaimAnalysisBatch" ADD CONSTRAINT "ClaimAnalysisBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A service-account batch never carries a firm; a firm batch always does.
-- Prisma connects as a role that bypasses RLS, so this CHECK is what holds the
-- rule for every writer, not only this repository's code.
ALTER TABLE "ClaimAnalysisBatch" ADD CONSTRAINT "claim_batch_source_org" CHECK (
  ("source" = 'PLATFORM_SERVICE_ACCOUNT' AND "organizationId" IS NULL)
  OR ("source" = 'FIRM_OAUTH' AND "organizationId" IS NOT NULL)
);
