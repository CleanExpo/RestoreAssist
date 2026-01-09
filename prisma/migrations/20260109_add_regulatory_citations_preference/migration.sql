-- Add optional preference for including regulatory citations
-- This allows clients to opt-in to regulatory citations per report

ALTER TABLE "Report" ADD COLUMN "includeRegulatoryCitations" BOOLEAN NOT NULL DEFAULT false;

-- Add index for quick filtering
CREATE INDEX "Report_includeRegulatoryCitations_idx" ON "Report"("includeRegulatoryCitations");

-- Add comment explaining the field
COMMENT ON COLUMN "Report"."includeRegulatoryCitations" IS 'Whether to include regulatory citations (building codes, electrical standards, etc.) in the forensic report PDF. Default: false (IICRC standards only). User can opt-in per report.';
