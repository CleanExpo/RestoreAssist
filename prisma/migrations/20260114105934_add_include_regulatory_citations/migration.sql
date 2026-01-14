-- AlterTable
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "includeRegulatoryCitations" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Report_includeRegulatoryCitations_idx" ON "Report"("includeRegulatoryCitations");
