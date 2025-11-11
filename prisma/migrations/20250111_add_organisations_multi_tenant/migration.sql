-- Phase 9: Multi-Tenant Architecture
-- Add organisations table and tenant-aware columns

-- Create organisations table
CREATE TABLE IF NOT EXISTS "Organisation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "subdomain" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "settings" JSONB,
  "billing_email" TEXT,
  "contact_email" TEXT
);

-- Add org_id column to User table
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "org_id" TEXT;

-- Add org_id column to InspectionReport table
ALTER TABLE "InspectionReport"
ADD COLUMN IF NOT EXISTS "org_id" TEXT;

-- Add org_id column to report_outputs table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'report_outputs') THEN
    ALTER TABLE "report_outputs"
    ADD COLUMN IF NOT EXISTS "org_id" TEXT;
  END IF;
END $$;

-- Create indexes for faster tenant filtering
CREATE INDEX IF NOT EXISTS "User_org_id_idx" ON "User"("org_id");
CREATE INDEX IF NOT EXISTS "InspectionReport_org_id_idx" ON "InspectionReport"("org_id");
CREATE INDEX IF NOT EXISTS "Organisation_subdomain_idx" ON "Organisation"("subdomain");

-- Add foreign key constraints (optional - can be enabled later)
-- ALTER TABLE "User"
-- ADD CONSTRAINT "User_org_id_fkey"
-- FOREIGN KEY ("org_id") REFERENCES "Organisation"("id")
-- ON DELETE SET NULL ON UPDATE CASCADE;

-- ALTER TABLE "InspectionReport"
-- ADD CONSTRAINT "InspectionReport_org_id_fkey"
-- FOREIGN KEY ("org_id") REFERENCES "Organisation"("id")
-- ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert default organisation for existing data
INSERT INTO "Organisation" ("id", "name", "subdomain", "status", "updated_at")
VALUES ('default', 'RestoreAssist', 'default', 'active', NOW())
ON CONFLICT ("subdomain") DO NOTHING;

-- Migrate existing users to default organisation
UPDATE "User"
SET "org_id" = 'default'
WHERE "org_id" IS NULL;

-- Migrate existing inspection reports to default organisation
UPDATE "InspectionReport"
SET "org_id" = 'default'
WHERE "org_id" IS NULL;

-- Comments for documentation
COMMENT ON TABLE "Organisation" IS 'Multi-tenant organisations/tenants';
COMMENT ON COLUMN "Organisation"."subdomain" IS 'Subdomain identifier (e.g., allied.restoreassist.app → allied)';
COMMENT ON COLUMN "Organisation"."status" IS 'active, suspended, or deleted';
COMMENT ON COLUMN "Organisation"."settings" IS 'JSON settings including branding, features, limits';
COMMENT ON COLUMN "User"."org_id" IS 'Organisation tenant identifier';
COMMENT ON COLUMN "InspectionReport"."org_id" IS 'Organisation tenant identifier for data isolation';
