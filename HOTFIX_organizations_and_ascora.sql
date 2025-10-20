-- HOTFIX: Create Missing Organizations Table and Fix Ascora Migration
-- Date: 2025-10-21
-- Issue: Ascora migration failed due to missing organizations table
-- Status: Partially migrated database - needs cleanup and proper order

-- =====================================================
-- STEP 1: Rollback Partial Ascora Migration
-- =====================================================

-- Drop Ascora tables in reverse dependency order
DROP TABLE IF EXISTS ascora_sync_schedules CASCADE;
DROP TABLE IF EXISTS ascora_sync_logs CASCADE;
DROP TABLE IF EXISTS ascora_invoices CASCADE;
DROP TABLE IF EXISTS ascora_customers CASCADE;
DROP TABLE IF EXISTS ascora_jobs CASCADE;
DROP TABLE IF EXISTS ascora_integrations CASCADE;

-- Drop any orphaned functions
DROP FUNCTION IF EXISTS update_ascora_updated_at() CASCADE;

-- Confirm cleanup
DO $$
BEGIN
    RAISE NOTICE 'Ascora tables dropped successfully';
END $$;

-- =====================================================
-- STEP 2: Create Organizations Table (MISSING)
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url VARCHAR(500),
  owner_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  subscription_tier VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON organizations(owner_id);

-- Organization members junction table
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);

-- Update trigger for organizations
CREATE OR REPLACE FUNCTION update_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_organizations_updated_at ON organizations;
CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_organizations_updated_at();

COMMENT ON TABLE organizations IS 'Multi-tenant organizations for team collaboration';
COMMENT ON TABLE organization_members IS 'Organization membership and roles';

-- Confirm organizations created
DO $$
BEGIN
    RAISE NOTICE 'Organizations table created successfully';
END $$;

-- =====================================================
-- STEP 3: Create Default Organization (For Testing)
-- =====================================================

-- Get the first admin user
DO $$
DECLARE
    admin_user_id TEXT;
BEGIN
    -- Find first admin user
    SELECT user_id INTO admin_user_id
    FROM users
    WHERE role = 'admin' OR email LIKE '%admin%'
    LIMIT 1;

    -- If admin user exists, create default organization
    IF admin_user_id IS NOT NULL THEN
        INSERT INTO organizations (slug, name, description, owner_id, subscription_tier)
        VALUES (
            'default-org',
            'Default Organization',
            'Automatically created default organization',
            admin_user_id,
            'free'
        )
        ON CONFLICT (slug) DO NOTHING;

        RAISE NOTICE 'Default organization created for user: %', admin_user_id;
    ELSE
        RAISE NOTICE 'No admin user found - skipping default organization';
    END IF;
END $$;

-- =====================================================
-- STEP 4: Verify Organizations Table is Ready
-- =====================================================

-- Check organizations table structure
SELECT
    'organizations' as table_name,
    COUNT(*) as row_count
FROM organizations;

-- Check foreign key constraints
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'organizations'
    AND tc.constraint_type = 'FOREIGN KEY';

-- =====================================================
-- STEP 5: Information Message
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'HOTFIX COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Organizations table is now ready!';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Verify organizations table exists: SELECT * FROM organizations;';
    RAISE NOTICE '2. Re-run Ascora migration: psql < packages/backend/src/migrations/006_ascora_integration.sql';
    RAISE NOTICE '3. Test Ascora endpoints: curl /api/organizations/[id]/ascora/status';
    RAISE NOTICE '';
    RAISE NOTICE 'The Ascora migration should now succeed!';
    RAISE NOTICE '========================================';
END $$;

-- =====================================================
-- VERIFICATION QUERIES (Optional - for manual checking)
-- =====================================================

-- Uncomment to run verification:

-- List all tables
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Check if organizations exists
-- SELECT EXISTS (
--     SELECT FROM pg_tables
--     WHERE schemaname = 'public'
--     AND tablename = 'organizations'
-- ) as organizations_exists;

-- Check if Ascora tables exist (should be FALSE after Step 1)
-- SELECT
--     EXISTS (SELECT FROM pg_tables WHERE tablename = 'ascora_integrations') as ascora_integrations,
--     EXISTS (SELECT FROM pg_tables WHERE tablename = 'ascora_jobs') as ascora_jobs,
--     EXISTS (SELECT FROM pg_tables WHERE tablename = 'ascora_customers') as ascora_customers;

-- =====================================================
-- ROLLBACK SCRIPT (If Needed)
-- =====================================================

-- To rollback this entire hotfix:
-- DROP TABLE IF EXISTS organization_members CASCADE;
-- DROP TABLE IF EXISTS organizations CASCADE;
-- DROP FUNCTION IF EXISTS update_organizations_updated_at() CASCADE;
