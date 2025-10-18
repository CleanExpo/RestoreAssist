-- ========================================
-- RestoreAssist Database Rollback
-- ========================================
-- Run this to completely remove all RestoreAssist tables
-- USE WITH CAUTION - This deletes all data!
-- ========================================

-- Drop all RLS policies first
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can create users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

DROP POLICY IF EXISTS "Users can view reports" ON reports;
DROP POLICY IF EXISTS "Authenticated users can create reports" ON reports;
DROP POLICY IF EXISTS "Users can update own reports" ON reports;
DROP POLICY IF EXISTS "Users can delete own reports" ON reports;

DROP POLICY IF EXISTS "Users can view own tokens" ON refresh_tokens;
DROP POLICY IF EXISTS "Users can create own tokens" ON refresh_tokens;
DROP POLICY IF EXISTS "Users can delete own tokens" ON refresh_tokens;

DROP POLICY IF EXISTS "Users can view sync records" ON integration_sync_records;
DROP POLICY IF EXISTS "Authenticated users can create sync records" ON integration_sync_records;
DROP POLICY IF EXISTS "Users can update sync records" ON integration_sync_records;

DROP POLICY IF EXISTS "Users can view drive files" ON drive_file_records;
DROP POLICY IF EXISTS "Authenticated users can create drive files" ON drive_file_records;
DROP POLICY IF EXISTS "Users can delete own drive files" ON drive_file_records;

DROP POLICY IF EXISTS "Users can view own drive auth" ON google_drive_auth;
DROP POLICY IF EXISTS "Users can create own drive auth" ON google_drive_auth;
DROP POLICY IF EXISTS "Users can update own drive auth" ON google_drive_auth;
DROP POLICY IF EXISTS "Users can delete own drive auth" ON google_drive_auth;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS google_drive_auth CASCADE;
DROP TABLE IF EXISTS drive_file_records CASCADE;
DROP TABLE IF EXISTS integration_sync_records CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_users_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_reports_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_sync_records_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_google_drive_auth_updated_at() CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_tokens() CASCADE;

-- ========================================
-- ROLLBACK COMPLETE
-- ========================================
-- All RestoreAssist tables, policies, and functions removed
-- You can now run the complete_migration.sql again
-- ========================================
