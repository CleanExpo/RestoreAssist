-- Phase 11: Interactive Scope Builder UI
-- Create report_scope_drafts table for work-in-progress scope editing

CREATE TABLE IF NOT EXISTS "report_scope_drafts" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "org_id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL UNIQUE,
  "payload" JSONB DEFAULT '{"lines": []}'::jsonb,
  "overrides" JSONB DEFAULT NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS "report_scope_drafts_org_id_idx" ON "report_scope_drafts"("org_id");
CREATE INDEX IF NOT EXISTS "report_scope_drafts_report_id_idx" ON "report_scope_drafts"("report_id");

-- Foreign key to report_uploads (if using Supabase, this may need to be added separately)
-- ALTER TABLE "report_scope_drafts" ADD CONSTRAINT "report_scope_drafts_report_id_fkey"
--   FOREIGN KEY ("report_id") REFERENCES "report_uploads"("id") ON DELETE CASCADE;

COMMENT ON TABLE "report_scope_drafts" IS 'Work-in-progress scope editing before finalization';
COMMENT ON COLUMN "report_scope_drafts"."payload" IS 'Draft scope lines with {lines: [{id, assembly_id, code, desc, qty, unit, days, labour, equipment, materials, clause, notes}]}';
COMMENT ON COLUMN "report_scope_drafts"."overrides" IS 'Custom OH&P percentages {overhead_pct, profit_pct, contingency_pct, gst_pct}';
