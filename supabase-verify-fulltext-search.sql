-- ============================================
-- Verify and Fix Full-Text Search Setup
-- ============================================
-- Date: 2026-01-28
-- Purpose: Verify existing full-text search for Report, Client, Inspection
-- and fix any issues

-- ============================================
-- VERIFICATION SECTION
-- ============================================

-- Check if search_vector columns exist
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE column_name = 'search_vector'
  AND table_schema = 'public'
ORDER BY table_name;

-- Check if GIN indexes exist
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE '%search_vector%'
  AND schemaname = 'public'
ORDER BY tablename;

-- Check if trigger functions exist
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name LIKE '%search_vector%'
  AND routine_schema = 'public'
ORDER BY routine_name;

-- Check if triggers exist
SELECT
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  tgtype
FROM pg_trigger
WHERE tgname LIKE '%search_vector%'
  AND tgrelid::regclass::text NOT LIKE 'pg_%'
ORDER BY table_name, trigger_name;

-- ============================================
-- COUNT RECORDS WITH NULL search_vector
-- ============================================

-- Check Report table
DO $$
DECLARE
  null_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "Report" WHERE "search_vector" IS NULL;
  SELECT COUNT(*) INTO total_count FROM "Report";
  RAISE NOTICE 'Report: % of % records have NULL search_vector', null_count, total_count;
END $$;

-- Check Client table
DO $$
DECLARE
  null_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "Client" WHERE "search_vector" IS NULL;
  SELECT COUNT(*) INTO total_count FROM "Client";
  RAISE NOTICE 'Client: % of % records have NULL search_vector', null_count, total_count;
END $$;

-- Check Inspection table
DO $$
DECLARE
  null_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "Inspection" WHERE "search_vector" IS NULL;
  SELECT COUNT(*) INTO total_count FROM "Inspection";
  RAISE NOTICE 'Inspection: % of % records have NULL search_vector', null_count, total_count;
END $$;

-- ============================================
-- FIX SECTION: Re-run backfills if needed
-- ============================================

-- Backfill Report data (only update NULL records)
UPDATE "Report" SET "search_vector" = to_tsvector('english',
  COALESCE("reportNumber", '') || ' ' ||
  COALESCE("clientName", '') || ' ' ||
  COALESCE("propertyAddress", '') || ' ' ||
  COALESCE("hazardType", '') || ' ' ||
  COALESCE("waterCategory", '') || ' ' ||
  COALESCE("description", '')
)
WHERE "search_vector" IS NULL;

-- Backfill Client data (only update NULL records)
UPDATE "Client" SET "search_vector" = to_tsvector('english',
  COALESCE("name", '') || ' ' ||
  COALESCE("email", '') || ' ' ||
  COALESCE("phone", '') || ' ' ||
  COALESCE("company", '')
)
WHERE "search_vector" IS NULL;

-- Backfill Inspection data (only update NULL records)
UPDATE "Inspection" SET "search_vector" = to_tsvector('english',
  COALESCE("inspectionNumber", '') || ' ' ||
  COALESCE("propertyAddress", '') || ' ' ||
  COALESCE("technicianName", '')
)
WHERE "search_vector" IS NULL;

-- ============================================
-- TEST SEARCHES
-- ============================================

-- Test Report search (example)
-- SELECT "reportNumber", "clientName", "propertyAddress"
-- FROM "Report"
-- WHERE "search_vector" @@ to_tsquery('english', 'water & damage')
-- LIMIT 5;

-- Test Client search (example)
-- SELECT "name", "email", "company"
-- FROM "Client"
-- WHERE "search_vector" @@ plainto_tsquery('english', 'restoration company')
-- LIMIT 5;

-- Test Inspection search (example)
-- SELECT "inspectionNumber", "propertyAddress", "technicianName"
-- FROM "Inspection"
-- WHERE "search_vector" @@ plainto_tsquery('english', 'melbourne property')
-- LIMIT 5;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Full-Text Search Verification Complete!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Check the output above for:';
  RAISE NOTICE '1. search_vector columns (should see Report, Client, Inspection)';
  RAISE NOTICE '2. GIN indexes (should see 3+ indexes)';
  RAISE NOTICE '3. Trigger functions (should see update_*_search_vector)';
  RAISE NOTICE '4. Triggers (should see *_search_vector_insert and *_update)';
  RAISE NOTICE '5. NULL counts (should be 0 after backfill)';
  RAISE NOTICE '===========================================';
END $$;
