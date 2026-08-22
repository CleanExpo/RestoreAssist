-- Client-portal evidence quarantine table (Phase 2). Additive; applied via Supabase MCP.
CREATE TABLE IF NOT EXISTS "ClientEvidenceSubmission" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "description" TEXT,
  "fileUrl" TEXT,
  "fileName" TEXT,
  "fileMimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  CONSTRAINT "ClientEvidenceSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClientEvidenceSubmission_inspectionId_idx" ON "ClientEvidenceSubmission"("inspectionId");
ALTER TABLE "ClientEvidenceSubmission" ADD CONSTRAINT "ClientEvidenceSubmission_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
