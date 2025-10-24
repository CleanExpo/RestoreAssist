-- Rollback Scripts for Migrations 005-008
-- Execute these scripts in reverse order to safely rollback the database changes

-- ============================================================================
-- ROLLBACK Migration 008: Remove foreign keys and constraints
-- ============================================================================
DROP TRIGGER IF EXISTS auto_flag_suspicious_trials_trigger ON free_trial_tokens;
DROP FUNCTION IF EXISTS auto_flag_suspicious_trials() CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_data() CASCADE;
DROP FUNCTION IF EXISTS refresh_user_trial_status() CASCADE;
DROP MATERIALIZED VIEW IF EXISTS user_trial_status CASCADE;

DROP INDEX IF EXISTS idx_fraud_detection_compound;
DROP INDEX IF EXISTS idx_auth_rate_limit_compound;

ALTER TABLE subscription_history DROP CONSTRAINT IF EXISTS subscription_dates_valid;
ALTER TABLE trial_fraud_flags DROP CONSTRAINT IF EXISTS fraud_resolved_properly;
ALTER TABLE free_trial_tokens DROP CONSTRAINT IF EXISTS token_used_after_created;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_lowercase;

-- ============================================================================
-- ROLLBACK Migration 007: Remove trial management tables
-- ============================================================================
DROP FUNCTION IF EXISTS expire_unused_tokens() CASCADE;
DROP FUNCTION IF EXISTS calculate_fraud_risk_score(UUID, VARCHAR, INET) CASCADE;
DROP FUNCTION IF EXISTS check_duplicate_trial(VARCHAR, INET, VARCHAR) CASCADE;

-- Drop tables in correct order (respecting foreign key dependencies)
DROP TABLE IF EXISTS subscription_history CASCADE;
DROP TABLE IF EXISTS trial_fraud_flags CASCADE;
DROP TABLE IF EXISTS free_trial_tokens CASCADE;

-- ============================================================================
-- ROLLBACK Migration 006: Remove auth and device tracking tables
-- ============================================================================
DROP TRIGGER IF EXISTS update_device_fingerprints_last_seen ON device_fingerprints CASCADE;
DROP FUNCTION IF EXISTS update_device_last_seen() CASCADE;
DROP FUNCTION IF EXISTS check_rate_limit(INET, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS clean_old_auth_attempts() CASCADE;

-- Drop tables
DROP TABLE IF EXISTS device_fingerprints CASCADE;
DROP TABLE IF EXISTS auth_attempts CASCADE;

-- ============================================================================
-- ROLLBACK Migration 005: Remove users table
-- ============================================================================
DROP TRIGGER IF EXISTS update_users_updated_at ON users CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop the users table (this will cascade delete all dependent objects)
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- Verification Script - Run after rollback to ensure clean state
-- ============================================================================
DO $$
DECLARE
    table_count INTEGER;
    function_count INTEGER;
    trigger_count INTEGER;
BEGIN
    -- Check if any of our tables still exist
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('users', 'auth_attempts', 'device_fingerprints',
                       'free_trial_tokens', 'trial_fraud_flags', 'subscription_history');

    -- Check if any of our functions still exist
    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines
    WHERE routine_schema = 'public'
    AND routine_name IN ('update_updated_at_column', 'check_rate_limit',
                         'clean_old_auth_attempts', 'update_device_last_seen',
                         'check_duplicate_trial', 'calculate_fraud_risk_score',
                         'expire_unused_tokens', 'auto_flag_suspicious_trials',
                         'cleanup_expired_data', 'refresh_user_trial_status');

    -- Check if any triggers still exist
    SELECT COUNT(*) INTO trigger_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    AND trigger_name IN ('update_users_updated_at', 'update_device_fingerprints_last_seen',
                         'auto_flag_suspicious_trials_trigger');

    -- Report results
    IF table_count = 0 AND function_count = 0 AND trigger_count = 0 THEN
        RAISE NOTICE 'Rollback completed successfully. All objects removed.';
    ELSE
        RAISE WARNING 'Rollback may be incomplete. Remaining objects: % tables, % functions, % triggers',
                      table_count, function_count, trigger_count;
    END IF;
END $$;

-- ============================================================================
-- Alternative: Individual Rollback Commands
-- ============================================================================
-- If you need to rollback individual migrations, use these commands:

-- Rollback only Migration 008:
-- Execute the rollback commands for Migration 008 only

-- Rollback only Migration 007:
-- Execute the rollback commands for Migration 007 only

-- Rollback only Migration 006:
-- Execute the rollback commands for Migration 006 only

-- Rollback only Migration 005:
-- Execute the rollback commands for Migration 005 only

-- ============================================================================
-- Emergency Rollback - Use with extreme caution
-- ============================================================================
-- This will forcefully drop all created objects, ignoring dependencies
-- DO $$
-- BEGIN
--     -- Force drop all tables with CASCADE
--     DROP TABLE IF EXISTS subscription_history CASCADE;
--     DROP TABLE IF EXISTS trial_fraud_flags CASCADE;
--     DROP TABLE IF EXISTS free_trial_tokens CASCADE;
--     DROP TABLE IF EXISTS device_fingerprints CASCADE;
--     DROP TABLE IF EXISTS auth_attempts CASCADE;
--     DROP TABLE IF EXISTS users CASCADE;
--
--     -- Drop all functions
--     DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
--     DROP FUNCTION IF EXISTS check_rate_limit(INET, INTEGER, INTEGER) CASCADE;
--     DROP FUNCTION IF EXISTS clean_old_auth_attempts() CASCADE;
--     DROP FUNCTION IF EXISTS update_device_last_seen() CASCADE;
--     DROP FUNCTION IF EXISTS check_duplicate_trial(VARCHAR, INET, VARCHAR) CASCADE;
--     DROP FUNCTION IF EXISTS calculate_fraud_risk_score(UUID, VARCHAR, INET) CASCADE;
--     DROP FUNCTION IF EXISTS expire_unused_tokens() CASCADE;
--     DROP FUNCTION IF EXISTS auto_flag_suspicious_trials() CASCADE;
--     DROP FUNCTION IF EXISTS cleanup_expired_data() CASCADE;
--     DROP FUNCTION IF EXISTS refresh_user_trial_status() CASCADE;
--
--     -- Drop materialized view
--     DROP MATERIALIZED VIEW IF EXISTS user_trial_status CASCADE;
--
--     RAISE NOTICE 'Emergency rollback completed. All objects forcefully removed.';
-- END $$;