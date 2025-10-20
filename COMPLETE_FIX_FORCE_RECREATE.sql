-- =====================================================
-- COMPLETE FIX: Force Recreate Organizations + Ascora
-- =====================================================
-- This version DROPS and RECREATES everything
-- Use this if you got "column slug does not exist" error
-- =====================================================

-- =====================================================
-- PART 1: DROP EVERYTHING (Clean Slate)
-- =====================================================

-- Drop Ascora tables
DROP TABLE IF EXISTS ascora_sync_schedules CASCADE;
DROP TABLE IF EXISTS ascora_sync_logs CASCADE;
DROP TABLE IF EXISTS ascora_invoices CASCADE;
DROP TABLE IF EXISTS ascora_customers CASCADE;
DROP TABLE IF EXISTS ascora_jobs CASCADE;
DROP TABLE IF EXISTS ascora_integrations CASCADE;

-- Drop organizations tables (even if partial)
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_ascora_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_organizations_updated_at() CASCADE;

-- Confirm cleanup
SELECT 'Step 1: Cleanup complete' as status;

-- =====================================================
-- PART 2: CREATE ORGANIZATIONS TABLE (FRESH!)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table (full recreation)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url VARCHAR(500),
  owner_id TEXT NOT NULL,
  subscription_tier VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key after table creation
ALTER TABLE organizations
ADD CONSTRAINT organizations_owner_id_fkey
FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE RESTRICT;

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_owner_id ON organizations(owner_id);

-- Organization members table
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE organization_members
ADD CONSTRAINT organization_members_organization_id_fkey
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE organization_members
ADD CONSTRAINT organization_members_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- Confirm organizations created
SELECT 'Step 2: Organizations tables created' as status;

-- Create default organization
DO $$
DECLARE
    admin_user_id TEXT;
    new_org_id UUID;
BEGIN
    -- Find first admin user
    SELECT user_id INTO admin_user_id
    FROM users
    WHERE role = 'admin' OR email LIKE '%admin%'
    LIMIT 1;

    -- Create default org if admin exists
    IF admin_user_id IS NOT NULL THEN
        INSERT INTO organizations (slug, name, description, owner_id)
        VALUES ('default-org', 'Default Organization', 'Auto-created for Ascora integration', admin_user_id)
        RETURNING id INTO new_org_id;

        RAISE NOTICE 'Created default organization with ID: %', new_org_id;
    ELSE
        RAISE WARNING 'No admin user found - cannot create default organization';
    END IF;
END $$;

-- =====================================================
-- PART 3: CREATE ASCORA TABLES
-- =====================================================

-- Table 1: ascora_integrations
CREATE TABLE ascora_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    user_id TEXT NOT NULL,
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

ALTER TABLE ascora_integrations
ADD CONSTRAINT ascora_integrations_organization_id_fkey
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ascora_integrations
ADD CONSTRAINT ascora_integrations_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(user_id);

CREATE INDEX idx_ascora_org ON ascora_integrations(organization_id);
CREATE INDEX idx_ascora_active ON ascora_integrations(is_active);
CREATE INDEX idx_ascora_user ON ascora_integrations(user_id);

-- Table 2: ascora_jobs
CREATE TABLE ascora_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID,
    report_id UUID,
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

ALTER TABLE ascora_jobs
ADD CONSTRAINT ascora_jobs_organization_id_fkey
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ascora_jobs
ADD CONSTRAINT ascora_jobs_report_id_fkey
FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE SET NULL;

CREATE INDEX idx_ascora_jobs_org ON ascora_jobs(organization_id);
CREATE INDEX idx_ascora_jobs_report ON ascora_jobs(report_id);
CREATE INDEX idx_ascora_jobs_ascora_id ON ascora_jobs(ascora_job_id);
CREATE INDEX idx_ascora_jobs_customer ON ascora_jobs(customer_id);
CREATE INDEX idx_ascora_jobs_status ON ascora_jobs(job_status);

-- Table 3: ascora_customers
CREATE TABLE ascora_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID,
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

ALTER TABLE ascora_customers
ADD CONSTRAINT ascora_customers_organization_id_fkey
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX idx_ascora_customers_org ON ascora_customers(organization_id);
CREATE INDEX idx_ascora_customers_ascora_id ON ascora_customers(ascora_customer_id);
CREATE INDEX idx_ascora_customers_email ON ascora_customers(email);
CREATE INDEX idx_ascora_customers_phone ON ascora_customers(phone);

-- Table 4: ascora_invoices
CREATE TABLE ascora_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID,
    ascora_invoice_id VARCHAR(255) UNIQUE NOT NULL,
    ascora_job_id VARCHAR(255),
    report_id UUID,
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

ALTER TABLE ascora_invoices
ADD CONSTRAINT ascora_invoices_organization_id_fkey
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ascora_invoices
ADD CONSTRAINT ascora_invoices_report_id_fkey
FOREIGN KEY (report_id) REFERENCES reports(report_id);

CREATE INDEX idx_ascora_invoices_org ON ascora_invoices(organization_id);
CREATE INDEX idx_ascora_invoices_ascora_id ON ascora_invoices(ascora_invoice_id);
CREATE INDEX idx_ascora_invoices_report ON ascora_invoices(report_id);
CREATE INDEX idx_ascora_invoices_status ON ascora_invoices(status);

-- Table 5: ascora_sync_logs
CREATE TABLE ascora_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID,
    integration_id UUID,
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

ALTER TABLE ascora_sync_logs
ADD CONSTRAINT ascora_sync_logs_organization_id_fkey
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ascora_sync_logs
ADD CONSTRAINT ascora_sync_logs_integration_id_fkey
FOREIGN KEY (integration_id) REFERENCES ascora_integrations(id);

CREATE INDEX idx_ascora_logs_org ON ascora_sync_logs(organization_id);
CREATE INDEX idx_ascora_logs_status ON ascora_sync_logs(status);
CREATE INDEX idx_ascora_logs_type ON ascora_sync_logs(sync_type);
CREATE INDEX idx_ascora_logs_created ON ascora_sync_logs(created_at DESC);

-- Table 6: ascora_sync_schedules
CREATE TABLE ascora_sync_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID,
    integration_id UUID NOT NULL,
    sync_interval INTEGER DEFAULT 300,
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ascora_sync_schedules
ADD CONSTRAINT ascora_sync_schedules_organization_id_fkey
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE ascora_sync_schedules
ADD CONSTRAINT ascora_sync_schedules_integration_id_fkey
FOREIGN KEY (integration_id) REFERENCES ascora_integrations(id) ON DELETE CASCADE;

CREATE INDEX idx_ascora_schedules_org ON ascora_sync_schedules(organization_id);
CREATE INDEX idx_ascora_schedules_next ON ascora_sync_schedules(next_run_at);

-- Confirm Ascora tables created
SELECT 'Step 3: Ascora tables created' as status;

-- =====================================================
-- PART 4: CREATE TRIGGERS
-- =====================================================

-- Trigger for organizations
CREATE OR REPLACE FUNCTION update_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_organizations_updated_at();

-- Trigger for Ascora tables
CREATE OR REPLACE FUNCTION update_ascora_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ascora_integrations_updated_at
    BEFORE UPDATE ON ascora_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_ascora_updated_at();

CREATE TRIGGER ascora_jobs_updated_at
    BEFORE UPDATE ON ascora_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_ascora_updated_at();

CREATE TRIGGER ascora_customers_updated_at
    BEFORE UPDATE ON ascora_customers
    FOR EACH ROW
    EXECUTE FUNCTION update_ascora_updated_at();

CREATE TRIGGER ascora_invoices_updated_at
    BEFORE UPDATE ON ascora_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_ascora_updated_at();

CREATE TRIGGER ascora_sync_schedules_updated_at
    BEFORE UPDATE ON ascora_sync_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_ascora_updated_at();

SELECT 'Step 4: Triggers created' as status;

-- =====================================================
-- PART 5: ADD COMMENTS
-- =====================================================

COMMENT ON TABLE organizations IS 'Multi-tenant organizations for team collaboration';
COMMENT ON TABLE organization_members IS 'Organization membership and roles';
COMMENT ON TABLE ascora_integrations IS 'Store Ascora CRM connection details and API keys';
COMMENT ON TABLE ascora_jobs IS 'Track Ascora jobs linked to RestoreAssist reports';
COMMENT ON TABLE ascora_customers IS 'Synchronized customers from Ascora CRM';
COMMENT ON TABLE ascora_invoices IS 'Track invoices created in Ascora from reports';
COMMENT ON TABLE ascora_sync_logs IS 'Audit trail of all sync operations';
COMMENT ON TABLE ascora_sync_schedules IS 'Automatic sync scheduling configuration';

-- =====================================================
-- FINAL VERIFICATION
-- =====================================================

SELECT '
========================================
✅ MIGRATION COMPLETE!
========================================

Created tables:
  ✅ organizations
  ✅ organization_members
  ✅ ascora_integrations
  ✅ ascora_jobs
  ✅ ascora_customers
  ✅ ascora_invoices
  ✅ ascora_sync_logs
  ✅ ascora_sync_schedules

All foreign keys and indexes created successfully.
Your database is ready for Ascora integration!
========================================
' as "✅ SUCCESS";

-- Show created tables
SELECT
    tablename as "Table Name",
    schemaname as "Schema"
FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename LIKE 'ascora%' OR tablename LIKE 'organization%')
ORDER BY tablename;
