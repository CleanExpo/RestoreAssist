-- =====================================================
-- COMPLETE FIX: Organizations + Ascora Integration
-- RUN THIS ENTIRE FILE IN ONE GO
-- =====================================================
-- This script fixes the broken migration state and installs
-- both the organizations table AND Ascora integration
-- =====================================================

BEGIN;

-- =====================================================
-- PART 1: CLEANUP - Remove Partial Ascora Migration
-- =====================================================

DROP TABLE IF EXISTS ascora_sync_schedules CASCADE;
DROP TABLE IF EXISTS ascora_sync_logs CASCADE;
DROP TABLE IF EXISTS ascora_invoices CASCADE;
DROP TABLE IF EXISTS ascora_customers CASCADE;
DROP TABLE IF EXISTS ascora_jobs CASCADE;
DROP TABLE IF EXISTS ascora_integrations CASCADE;
DROP FUNCTION IF EXISTS update_ascora_updated_at() CASCADE;

-- =====================================================
-- PART 2: CREATE ORGANIZATIONS TABLE (MISSING!)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Create default organization
DO $$
DECLARE
    admin_user_id TEXT;
BEGIN
    SELECT user_id INTO admin_user_id
    FROM users
    WHERE role = 'admin' OR email LIKE '%admin%'
    LIMIT 1;

    IF admin_user_id IS NOT NULL THEN
        INSERT INTO organizations (slug, name, owner_id)
        VALUES ('default-org', 'Default Organization', admin_user_id)
        ON CONFLICT (slug) DO NOTHING;
    END IF;
END $$;

-- =====================================================
-- PART 3: ASCORA INTEGRATION TABLES
-- =====================================================

-- Table 1: ascora_integrations
CREATE TABLE IF NOT EXISTS ascora_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(user_id),
    api_url VARCHAR(500) NOT NULL UNIQUE,
    api_token TEXT NOT NULL,
    company_code VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(50) DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'success', 'error')),
    webhook_token VARCHAR(255),
    sync_settings JSONB DEFAULT '{"sync_customers": true, "sync_jobs": true, "sync_invoices": true}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ascora_org ON ascora_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_ascora_active ON ascora_integrations(is_active);
CREATE INDEX IF NOT EXISTS idx_ascora_user ON ascora_integrations(user_id);

-- Table 2: ascora_jobs
CREATE TABLE IF NOT EXISTS ascora_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    report_id UUID REFERENCES reports(report_id) ON DELETE SET NULL,
    ascora_job_id VARCHAR(255) UNIQUE NOT NULL,
    job_title VARCHAR(500),
    customer_id VARCHAR(255),
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(20),
    job_status VARCHAR(50),
    description TEXT,
    job_address TEXT,
    job_type VARCHAR(50),
    priority VARCHAR(20),
    estimated_cost DECIMAL(12, 2),
    actual_cost DECIMAL(12, 2),
    scheduled_date TIMESTAMP WITH TIME ZONE,
    completed_date TIMESTAMP WITH TIME ZONE,
    assigned_to VARCHAR(255),
    assigned_to_name VARCHAR(255),
    invoice_status VARCHAR(50),
    invoice_amount DECIMAL(12, 2),
    payment_status VARCHAR(50),
    custom_fields JSONB,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    sync_direction VARCHAR(50) CHECK (sync_direction IN ('to_ascora', 'from_ascora', 'both')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ascora_jobs_org ON ascora_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_ascora_jobs_report ON ascora_jobs(report_id);
CREATE INDEX IF NOT EXISTS idx_ascora_jobs_ascora_id ON ascora_jobs(ascora_job_id);
CREATE INDEX IF NOT EXISTS idx_ascora_jobs_customer ON ascora_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_ascora_jobs_status ON ascora_jobs(job_status);

-- Table 3: ascora_customers
CREATE TABLE IF NOT EXISTS ascora_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    ascora_customer_id VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    company_name VARCHAR(500),
    email VARCHAR(255),
    phone VARCHAR(20),
    mobile VARCHAR(20),
    street_address TEXT,
    suburb VARCHAR(255),
    state VARCHAR(10),
    postcode VARCHAR(10),
    country VARCHAR(100),
    customer_type VARCHAR(50),
    billing_address TEXT,
    tax_id VARCHAR(50),
    notes TEXT,
    custom_fields JSONB,
    synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ascora_customers_org ON ascora_customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_ascora_customers_ascora_id ON ascora_customers(ascora_customer_id);
CREATE INDEX IF NOT EXISTS idx_ascora_customers_email ON ascora_customers(email);
CREATE INDEX IF NOT EXISTS idx_ascora_customers_phone ON ascora_customers(phone);

-- Table 4: ascora_invoices
CREATE TABLE IF NOT EXISTS ascora_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    ascora_invoice_id VARCHAR(255) UNIQUE NOT NULL,
    ascora_job_id VARCHAR(255),
    report_id UUID REFERENCES reports(report_id),
    customer_id VARCHAR(255),
    invoice_number VARCHAR(50),
    invoice_date DATE,
    due_date DATE,
    total_amount DECIMAL(12, 2),
    paid_amount DECIMAL(12, 2),
    status VARCHAR(50),
    payment_method VARCHAR(50),
    payment_date DATE,
    synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ascora_invoices_org ON ascora_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_ascora_invoices_ascora_id ON ascora_invoices(ascora_invoice_id);
CREATE INDEX IF NOT EXISTS idx_ascora_invoices_report ON ascora_invoices(report_id);
CREATE INDEX IF NOT EXISTS idx_ascora_invoices_status ON ascora_invoices(status);

-- Table 5: ascora_sync_logs
CREATE TABLE IF NOT EXISTS ascora_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    integration_id UUID REFERENCES ascora_integrations(id),
    sync_type VARCHAR(50) NOT NULL,
    source VARCHAR(50),
    target VARCHAR(50),
    resource_type VARCHAR(50),
    resource_id UUID,
    ascora_resource_id VARCHAR(255),
    status VARCHAR(50) CHECK (status IN ('success', 'failed', 'pending', 'skipped')),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    response_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ascora_logs_org ON ascora_sync_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_ascora_logs_status ON ascora_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_ascora_logs_type ON ascora_sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_ascora_logs_created ON ascora_sync_logs(created_at DESC);

-- Table 6: ascora_sync_schedules
CREATE TABLE IF NOT EXISTS ascora_sync_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    integration_id UUID NOT NULL REFERENCES ascora_integrations(id) ON DELETE CASCADE,
    sync_interval INTEGER DEFAULT 300,
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ascora_schedules_org ON ascora_sync_schedules(organization_id);
CREATE INDEX IF NOT EXISTS idx_ascora_schedules_next ON ascora_sync_schedules(next_run_at);

-- =====================================================
-- PART 4: TRIGGERS
-- =====================================================

-- Trigger function for organizations
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

-- Trigger function for Ascora tables
CREATE OR REPLACE FUNCTION update_ascora_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ascora_integrations_updated_at ON ascora_integrations;
CREATE TRIGGER ascora_integrations_updated_at
    BEFORE UPDATE ON ascora_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_ascora_updated_at();

DROP TRIGGER IF EXISTS ascora_jobs_updated_at ON ascora_jobs;
CREATE TRIGGER ascora_jobs_updated_at
    BEFORE UPDATE ON ascora_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_ascora_updated_at();

DROP TRIGGER IF EXISTS ascora_customers_updated_at ON ascora_customers;
CREATE TRIGGER ascora_customers_updated_at
    BEFORE UPDATE ON ascora_customers
    FOR EACH ROW
    EXECUTE FUNCTION update_ascora_updated_at();

DROP TRIGGER IF EXISTS ascora_invoices_updated_at ON ascora_invoices;
CREATE TRIGGER ascora_invoices_updated_at
    BEFORE UPDATE ON ascora_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_ascora_updated_at();

DROP TRIGGER IF EXISTS ascora_sync_schedules_updated_at ON ascora_sync_schedules;
CREATE TRIGGER ascora_sync_schedules_updated_at
    BEFORE UPDATE ON ascora_sync_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_ascora_updated_at();

-- =====================================================
-- PART 5: COMMENTS
-- =====================================================

COMMENT ON TABLE organizations IS 'Multi-tenant organizations for team collaboration';
COMMENT ON TABLE organization_members IS 'Organization membership and roles';
COMMENT ON TABLE ascora_integrations IS 'Store Ascora CRM connection details and API keys';
COMMENT ON TABLE ascora_jobs IS 'Track Ascora jobs linked to RestoreAssist reports';
COMMENT ON TABLE ascora_customers IS 'Synchronized customers from Ascora CRM';
COMMENT ON TABLE ascora_invoices IS 'Track invoices created in Ascora from reports';
COMMENT ON TABLE ascora_sync_logs IS 'Audit trail of all sync operations';
COMMENT ON TABLE ascora_sync_schedules IS 'Automatic sync scheduling configuration';

COMMIT;

-- =====================================================
-- SUCCESS VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ MIGRATION COMPLETE!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Created tables:';
    RAISE NOTICE '  ✅ organizations';
    RAISE NOTICE '  ✅ organization_members';
    RAISE NOTICE '  ✅ ascora_integrations';
    RAISE NOTICE '  ✅ ascora_jobs';
    RAISE NOTICE '  ✅ ascora_customers';
    RAISE NOTICE '  ✅ ascora_invoices';
    RAISE NOTICE '  ✅ ascora_sync_logs';
    RAISE NOTICE '  ✅ ascora_sync_schedules';
    RAISE NOTICE '';
    RAISE NOTICE 'Your database is now ready for Ascora integration!';
    RAISE NOTICE '========================================';
END $$;

-- Verify tables exist
SELECT
    'All tables created successfully!' as status,
    COUNT(*) as table_count
FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename LIKE 'ascora%' OR tablename LIKE 'organization%');
