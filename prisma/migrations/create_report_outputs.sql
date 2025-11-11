-- Create report_outputs table for storing composed reports
-- Run this in Supabase SQL Editor

-- Table: report_outputs - Store generated HTML/PDF/DOCX reports
CREATE TABLE IF NOT EXISTS "report_outputs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "report_id" UUID NOT NULL REFERENCES "report_uploads"("id") ON DELETE CASCADE,
  "html" TEXT,
  "pdf_url" TEXT,
  "docx_url" TEXT,
  "version" INTEGER DEFAULT 1,
  "generated_by" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "generated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "report_outputs_report_idx" ON "report_outputs"("report_id");
CREATE INDEX IF NOT EXISTS "report_outputs_version_idx" ON "report_outputs"("report_id", "version" DESC);
CREATE INDEX IF NOT EXISTS "report_outputs_generated_idx" ON "report_outputs"("generated_at" DESC);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_report_outputs_updated_at
  BEFORE UPDATE ON "report_outputs"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE "report_outputs" IS 'Stores generated HTML/PDF/DOCX reports with versioning';
COMMENT ON COLUMN "report_outputs".html IS 'Rendered HTML content of the report';
COMMENT ON COLUMN "report_outputs".pdf_url IS 'URL to generated PDF in Supabase Storage';
COMMENT ON COLUMN "report_outputs".docx_url IS 'URL to generated DOCX in Supabase Storage (future)';
COMMENT ON COLUMN "report_outputs".version IS 'Version number for report regeneration tracking';
