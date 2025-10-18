-- ========================================
-- RestoreAssist Database Verification Queries
-- ========================================
-- Run these queries in Supabase SQL Editor to verify setup
-- ========================================

-- 1. Check all tables created (should return 6 tables)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. Check RLS is enabled on all tables (should show 6 rows with rowsecurity = true)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 3. Verify default users exist (should return 2 users)
SELECT user_id, email, role, name
FROM users
ORDER BY role DESC;

-- 4. Check all indexes created (should return many indexes)
SELECT
    tablename,
    indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 5. Count RLS policies (should return 6 tables with policies)
SELECT
    schemaname,
    tablename,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- 6. Verify all triggers exist
SELECT
    trigger_name,
    event_object_table as table_name,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table;

-- 7. Check table row counts (should all be 0 except users = 2)
SELECT
    'users' as table_name,
    COUNT(*) as row_count
FROM users
UNION ALL
SELECT 'reports', COUNT(*) FROM reports
UNION ALL
SELECT 'refresh_tokens', COUNT(*) FROM refresh_tokens
UNION ALL
SELECT 'integration_sync_records', COUNT(*) FROM integration_sync_records
UNION ALL
SELECT 'drive_file_records', COUNT(*) FROM drive_file_records
UNION ALL
SELECT 'google_drive_auth', COUNT(*) FROM google_drive_auth
ORDER BY table_name;

-- 8. Verify table columns for reports table
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'reports'
ORDER BY ordinal_position;

-- ========================================
-- VERIFICATION COMPLETE
-- ========================================
-- If all queries return expected results, database is ready!
-- ========================================
