-- Create report ingestion tables for RestoreAssist
-- Run this in Supabase SQL Editor

-- Table 1: report_uploads - Track all uploaded report files
CREATE TABLE IF NOT EXISTS "report_uploads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "file_name" TEXT NOT NULL,
  "file_size" INTEGER NOT NULL,
  "mime_type" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "uploaded_by" UUID,
  "upload_source" TEXT NOT NULL CHECK (upload_source IN ('dashboard', 'api', 'webhook')),
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'parsing', 'completed', 'failed')),
  "error_message" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_uploaded_by FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE SET NULL
);

-- Table 2: report_analysis - Store AI-generated analysis results
CREATE TABLE IF NOT EXISTS "report_analysis" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "report_upload_id" UUID NOT NULL REFERENCES "report_uploads"("id") ON DELETE CASCADE,
  "full_text" TEXT NOT NULL,
  "service_type" TEXT CHECK (service_type IN ('water_damage', 'mould_remediation', 'fire_smoke', 'contents', 'reconstruction', 'unknown')),
  "confidence_score" DECIMAL(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  "detected_standards" TEXT[], -- Array of standard codes (e.g., ['S500', 'S520'])
  "key_findings" JSONB, -- AI-generated summary and insights
  "ai_model" TEXT, -- e.g., 'claude-3-5-sonnet', 'gpt-4'
  "prompt_version" TEXT, -- Track which prompt template was used
  "raw_ai_response" JSONB, -- Store complete AI response for debugging
  "analyzed_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "report_uploads_status_idx" ON "report_uploads"("status");
CREATE INDEX IF NOT EXISTS "report_uploads_source_idx" ON "report_uploads"("upload_source");
CREATE INDEX IF NOT EXISTS "report_uploads_user_idx" ON "report_uploads"("uploaded_by");
CREATE INDEX IF NOT EXISTS "report_uploads_created_idx" ON "report_uploads"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "report_analysis_upload_idx" ON "report_analysis"("report_upload_id");
CREATE INDEX IF NOT EXISTS "report_analysis_service_idx" ON "report_analysis"("service_type");
CREATE INDEX IF NOT EXISTS "report_analysis_standards_idx" ON "report_analysis" USING GIN("detected_standards");

-- Full-text search on extracted text
ALTER TABLE "report_analysis"
  ADD COLUMN IF NOT EXISTS full_text_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(full_text, ''))) STORED;

CREATE INDEX IF NOT EXISTS "report_analysis_fulltext_idx"
  ON "report_analysis" USING GIN (full_text_tsv);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_report_uploads_updated_at
  BEFORE UPDATE ON "report_uploads"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE "report_uploads" IS 'Tracks all uploaded restoration report files';
COMMENT ON TABLE "report_analysis" IS 'Stores AI-generated analysis and classification of reports';
COMMENT ON COLUMN "report_analysis".full_text_tsv IS 'Generated tsvector for full-text search on extracted text';
COMMENT ON COLUMN "report_analysis".detected_standards IS 'Array of IICRC standard codes detected in report';
COMMENT ON COLUMN "report_analysis".key_findings IS 'Structured AI-generated insights and summary';
