-- ============================================
-- CRM Full-Text Search Setup
-- ============================================
-- Date: 2026-01-28
-- Purpose: Add full-text search capabilities to CRM models
-- Models: Company, Contact
-- Run this in Supabase SQL Editor

-- ============================================
-- COMPANY FULL-TEXT SEARCH
-- ============================================

-- Add tsvector column if not exists (should already exist from schema)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Company' AND column_name = 'search_vector'
    ) THEN
        ALTER TABLE "Company" ADD COLUMN "search_vector" tsvector;
    END IF;
END $$;

-- Create GIN index for fast full-text search on Company
CREATE INDEX IF NOT EXISTS "Company_search_vector_gin" ON "Company" USING GIN ("search_vector");

-- Create trigger function for Company search_vector updates
CREATE OR REPLACE FUNCTION update_company_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW."search_vector" := to_tsvector('english',
    COALESCE(NEW."name", '') || ' ' ||
    COALESCE(NEW."industry", '') || ' ' ||
    COALESCE(NEW."website", '') || ' ' ||
    COALESCE(NEW."addressLine1", '') || ' ' ||
    COALESCE(NEW."addressLine2", '') || ' ' ||
    COALESCE(NEW."city", '') || ' ' ||
    COALESCE(NEW."state", '') || ' ' ||
    COALESCE(NEW."postcode", '') || ' ' ||
    COALESCE(NEW."abn", '') || ' ' ||
    COALESCE(NEW."acn", '') || ' ' ||
    COALESCE(NEW."description", '') || ' ' ||
    COALESCE(NEW."notes", '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS company_search_vector_insert ON "Company";
DROP TRIGGER IF EXISTS company_search_vector_update ON "Company";

-- Create trigger for Company on INSERT
CREATE TRIGGER company_search_vector_insert
BEFORE INSERT ON "Company"
FOR EACH ROW
EXECUTE FUNCTION update_company_search_vector();

-- Create trigger for Company on UPDATE
CREATE TRIGGER company_search_vector_update
BEFORE UPDATE ON "Company"
FOR EACH ROW
EXECUTE FUNCTION update_company_search_vector();

-- Backfill existing Company data
UPDATE "Company" SET "search_vector" = to_tsvector('english',
  COALESCE("name", '') || ' ' ||
  COALESCE("industry", '') || ' ' ||
  COALESCE("website", '') || ' ' ||
  COALESCE("addressLine1", '') || ' ' ||
  COALESCE("addressLine2", '') || ' ' ||
  COALESCE("city", '') || ' ' ||
  COALESCE("state", '') || ' ' ||
  COALESCE("postcode", '') || ' ' ||
  COALESCE("abn", '') || ' ' ||
  COALESCE("acn", '') || ' ' ||
  COALESCE("description", '') || ' ' ||
  COALESCE("notes", '')
)
WHERE "search_vector" IS NULL;

-- ============================================
-- CONTACT FULL-TEXT SEARCH
-- ============================================

-- Add tsvector column if not exists (should already exist from schema)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Contact' AND column_name = 'search_vector'
    ) THEN
        ALTER TABLE "Contact" ADD COLUMN "search_vector" tsvector;
    END IF;
END $$;

-- Create GIN index for fast full-text search on Contact
CREATE INDEX IF NOT EXISTS "Contact_search_vector_gin" ON "Contact" USING GIN ("search_vector");

-- Create trigger function for Contact search_vector updates
CREATE OR REPLACE FUNCTION update_contact_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW."search_vector" := to_tsvector('english',
    COALESCE(NEW."firstName", '') || ' ' ||
    COALESCE(NEW."lastName", '') || ' ' ||
    COALESCE(NEW."fullName", '') || ' ' ||
    COALESCE(NEW."email", '') || ' ' ||
    COALESCE(NEW."phone", '') || ' ' ||
    COALESCE(NEW."mobilePhone", '') || ' ' ||
    COALESCE(NEW."title", '') || ' ' ||
    COALESCE(NEW."addressLine1", '') || ' ' ||
    COALESCE(NEW."addressLine2", '') || ' ' ||
    COALESCE(NEW."city", '') || ' ' ||
    COALESCE(NEW."state", '') || ' ' ||
    COALESCE(NEW."postcode", '') || ' ' ||
    COALESCE(NEW."notes", '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS contact_search_vector_insert ON "Contact";
DROP TRIGGER IF EXISTS contact_search_vector_update ON "Contact";

-- Create trigger for Contact on INSERT
CREATE TRIGGER contact_search_vector_insert
BEFORE INSERT ON "Contact"
FOR EACH ROW
EXECUTE FUNCTION update_contact_search_vector();

-- Create trigger for Contact on UPDATE
CREATE TRIGGER contact_search_vector_update
BEFORE UPDATE ON "Contact"
FOR EACH ROW
EXECUTE FUNCTION update_contact_search_vector();

-- Backfill existing Contact data
UPDATE "Contact" SET "search_vector" = to_tsvector('english',
  COALESCE("firstName", '') || ' ' ||
  COALESCE("lastName", '') || ' ' ||
  COALESCE("fullName", '') || ' ' ||
  COALESCE("email", '') || ' ' ||
  COALESCE("phone", '') || ' ' ||
  COALESCE("mobilePhone", '') || ' ' ||
  COALESCE("title", '') || ' ' ||
  COALESCE("addressLine1", '') || ' ' ||
  COALESCE("addressLine2", '') || ' ' ||
  COALESCE("city", '') || ' ' ||
  COALESCE("state", '') || ' ' ||
  COALESCE("postcode", '') || ' ' ||
  COALESCE("notes", '')
)
WHERE "search_vector" IS NULL;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Test Company search
-- SELECT id, name, industry FROM "Company" WHERE "search_vector" @@ to_tsquery('english', 'restoration');

-- Test Contact search
-- SELECT id, "fullName", email FROM "Contact" WHERE "search_vector" @@ to_tsquery('english', 'john & smith');

-- Check trigger status
SELECT
  tgname as trigger_name,
  tgrelid::regclass as table_name
FROM pg_trigger
WHERE tgname LIKE '%search_vector%'
ORDER BY table_name, tgname;

-- Check index status
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE '%search_vector%'
ORDER BY tablename, indexname;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'CRM Full-Text Search Setup Complete!';
  RAISE NOTICE 'Triggers created: company_search_vector_insert, company_search_vector_update';
  RAISE NOTICE 'Triggers created: contact_search_vector_insert, contact_search_vector_update';
  RAISE NOTICE 'Indexes created: Company_search_vector_gin, Contact_search_vector_gin';
  RAISE NOTICE 'Backfill completed for existing records';
END $$;
