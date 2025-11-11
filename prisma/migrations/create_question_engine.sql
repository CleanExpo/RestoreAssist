-- Create Question Engine tables for RestoreAssist
-- Run this in Supabase SQL Editor

-- Table 1: question_bank - Master library of verification questions
CREATE TABLE IF NOT EXISTS "question_bank" (
  "id" SERIAL PRIMARY KEY,
  "question" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "service_type" TEXT,
  "expected_evidence" TEXT[],
  "report_grade" INTEGER CHECK (report_grade IN (1, 2, 3)),
  "standard_ref" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 2: report_responses - Store answers/evidence for each report question
CREATE TABLE IF NOT EXISTS "report_responses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "report_id" UUID NOT NULL REFERENCES "report_uploads"("id") ON DELETE CASCADE,
  "question_id" INTEGER REFERENCES "question_bank"("id") ON DELETE SET NULL,
  "question_text" TEXT,
  "answer" TEXT,
  "evidence_url" TEXT,
  "verified" BOOLEAN DEFAULT FALSE,
  "verified_by" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "verified_at" TIMESTAMP WITH TIME ZONE,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "question_bank_category_idx" ON "question_bank"("category");
CREATE INDEX IF NOT EXISTS "question_bank_service_idx" ON "question_bank"("service_type");
CREATE INDEX IF NOT EXISTS "question_bank_grade_idx" ON "question_bank"("report_grade");

CREATE INDEX IF NOT EXISTS "report_responses_report_idx" ON "report_responses"("report_id");
CREATE INDEX IF NOT EXISTS "report_responses_question_idx" ON "report_responses"("question_id");
CREATE INDEX IF NOT EXISTS "report_responses_verified_idx" ON "report_responses"("verified");

-- Full-text search on questions
ALTER TABLE "question_bank"
  ADD COLUMN IF NOT EXISTS question_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(question, ''))) STORED;

CREATE INDEX IF NOT EXISTS "question_bank_fulltext_idx"
  ON "question_bank" USING GIN (question_tsv);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_question_bank_updated_at
  BEFORE UPDATE ON "question_bank"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_report_responses_updated_at
  BEFORE UPDATE ON "report_responses"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed common questions for each service type
INSERT INTO "question_bank" (question, category, service_type, expected_evidence, report_grade, standard_ref) VALUES
-- Water Damage (S500) - Basic
('Were moisture readings documented before drying?', 'Documentation', 'Water Damage', ARRAY['Moisture meter readings', 'Psychrometric chart'], 1, 'S500'),
('Was customer informed of expected drying timeline?', 'Communication', 'Water Damage', ARRAY['Customer signature', 'Email confirmation'], 1, 'S500'),
('Were before and after photos taken?', 'Documentation', 'Water Damage', ARRAY['Photo log', 'Timestamped images'], 1, 'S500'),
('Was electrical power assessed for safety?', 'Safety', 'Water Damage', ARRAY['Safety checklist', 'Circuit breaker inspection'], 1, 'S500'),

-- Water Damage (S500) - Intermediate
('Was psychrometric data recorded throughout drying?', 'Equipment', 'Water Damage', ARRAY['Daily moisture logs', 'Humidity readings'], 2, 'S500'),
('Were structural cavities inspected for hidden moisture?', 'Assessment', 'Water Damage', ARRAY['Thermal imaging', 'Invasive inspection notes'], 2, 'S500'),
('Was Class of Water determined (1/2/3)?', 'Assessment', 'Water Damage', ARRAY['Classification documentation', 'Source identification'], 2, 'S500'),

-- Mould Remediation (S520) - Intermediate
('Was containment established before disturbing mould?', 'Containment', 'Mould Remediation', ARRAY['Containment photos', 'Barrier installation checklist'], 2, 'S520'),
('Was negative air pressure verified?', 'Equipment', 'Mould Remediation', ARRAY['Pressure differential readings', 'Manometer measurements'], 2, 'S520'),
('Were affected materials properly disposed per regulations?', 'Compliance', 'Mould Remediation', ARRAY['Waste manifest', 'Disposal receipts'], 2, 'S520'),

-- Mould Remediation (S520) - Advanced
('Was post-remediation clearance testing performed?', 'Quality Assurance', 'Mould Remediation', ARRAY['Lab results', 'IAQ report'], 3, 'S520'),
('Were HVAC systems cleaned and verified mould-free?', 'Remediation', 'Mould Remediation', ARRAY['HVAC cleaning report', 'Video inspection'], 3, 'S520'),

-- Fire & Smoke (S700)
('Was soot residue tested for pH and solubility?', 'Assessment', 'Fire & Smoke', ARRAY['Lab analysis', 'pH test results'], 2, 'S700'),
('Were HEPA vacuums used during cleanup?', 'Equipment', 'Fire & Smoke', ARRAY['Equipment checklist', 'HEPA filter documentation'], 2, 'S700'),

-- General/Safety
('Was proper PPE worn by all technicians?', 'Safety', NULL, ARRAY['PPE checklist', 'Training records'], 1, NULL),
('Were air quality concerns communicated to occupants?', 'Communication', NULL, ARRAY['Communication log', 'Signed disclosure'], 2, NULL);

-- Comments for documentation
COMMENT ON TABLE "question_bank" IS 'Master library of verification questions for quality assurance';
COMMENT ON TABLE "report_responses" IS 'Stores technician answers and evidence for each report question';
COMMENT ON COLUMN "report_responses".question_text IS 'Snapshot of question at time of response (in case bank question changes)';
COMMENT ON COLUMN "report_responses".evidence_url IS 'Link to supporting documentation (photos, PDFs, etc.)';
