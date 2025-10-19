-- Migration: 006_ascora_integration.sql
-- Description: Ascora CRM Integration - Database Schema
-- Created: 2025-10-19
-- Feature: Feature 6b - Ascora CRM Integration

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Table 1: ascora_integrations
-- Store Ascora CRM connection details and API keys
-- =====================================================
CREATE TABLE IF NOT EXISTS ascora_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(user_id),
    api_url VARCHAR(500) NOT NULL UNIQUE,
    api_token TEXT NOT NULL, -- Encrypted Ascora API token
    company_code VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(50) DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'success', 'error')),
    webhook_token VARCHAR(255), -- Webhook verification token
    sync_settings JSONB DEFAULT '{"sync_customers": true, "sync_jobs": true, "sync_invoices": true}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ascora_integrations
CREATE INDEX idx_ascora_org ON ascora_integrations(organization_id);
CREATE INDEX idx_ascora_active ON ascora_integrations(is_active);
CREATE INDEX idx_ascora_user ON ascora_integrations(user_id);

-- =====================================================
-- Table 2: ascora_jobs
-- Track Ascora jobs linked to RestoreAssist reports
-- =====================================================
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

-- Indexes for ascora_jobs
CREATE INDEX idx_ascora_jobs_org ON ascora_jobs(organization_id);
CREATE INDEX idx_ascora_jobs_report ON ascora_jobs(report_id);
CREATE INDEX idx_ascora_jobs_ascora_id ON ascora_jobs(ascora_job_id);
CREATE INDEX idx_ascora_jobs_customer ON ascora_jobs(customer_id);
CREATE INDEX idx_ascora_jobs_status ON ascora_jobs(job_status);

-- =====================================================
-- Table 3: ascora_customers
-- Synchronized customers from Ascora CRM
-- =====================================================
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

-- Indexes for ascora_customers
CREATE INDEX idx_ascora_customers_org ON ascora_customers(organization_id);
CREATE INDEX idx_ascora_customers_ascora_id ON ascora_customers(ascora_customer_id);
CREATE INDEX idx_ascora_customers_email ON ascora_customers(email);
CREATE INDEX idx_ascora_customers_phone ON ascora_customers(phone);

-- =====================================================
-- Table 4: ascora_invoices
-- Track invoices created in Ascora from reports
-- =====================================================
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

-- Indexes for ascora_invoices
CREATE INDEX idx_ascora_invoices_org ON ascora_invoices(organization_id);
CREATE INDEX idx_ascora_invoices_ascora_id ON ascora_invoices(ascora_invoice_id);
CREATE INDEX idx_ascora_invoices_report ON ascora_invoices(report_id);
CREATE INDEX idx_ascora_invoices_status ON ascora_invoices(status);

-- =====================================================
-- Table 5: ascora_sync_logs
-- Audit trail of all sync operations
-- =====================================================
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

-- Indexes for ascora_sync_logs
CREATE INDEX idx_ascora_logs_org ON ascora_sync_logs(organization_id);
CREATE INDEX idx_ascora_logs_status ON ascora_sync_logs(status);
CREATE INDEX idx_ascora_logs_type ON ascora_sync_logs(sync_type);
CREATE INDEX idx_ascora_logs_created ON ascora_sync_logs(created_at DESC);

-- =====================================================
-- Table 6: ascora_sync_schedules
-- Automatic sync scheduling configuration
-- =====================================================
CREATE TABLE IF NOT EXISTS ascora_sync_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    integration_id UUID NOT NULL REFERENCES ascora_integrations(id) ON DELETE CASCADE,
    sync_interval INTEGER DEFAULT 300, -- Seconds between syncs
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ascora_sync_schedules
CREATE INDEX idx_ascora_schedules_org ON ascora_sync_schedules(organization_id);
CREATE INDEX idx_ascora_schedules_next ON ascora_sync_schedules(next_run_at);

-- =====================================================
-- Triggers for updated_at timestamps
-- =====================================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_ascora_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables with updated_at
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

-- =====================================================
-- Comments for documentation
-- =====================================================

COMMENT ON TABLE ascora_integrations IS 'Store Ascora CRM connection details and API keys';
COMMENT ON TABLE ascora_jobs IS 'Track Ascora jobs linked to RestoreAssist reports';
COMMENT ON TABLE ascora_customers IS 'Synchronized customers from Ascora CRM';
COMMENT ON TABLE ascora_invoices IS 'Track invoices created in Ascora from reports';
COMMENT ON TABLE ascora_sync_logs IS 'Audit trail of all sync operations';
COMMENT ON TABLE ascora_sync_schedules IS 'Automatic sync scheduling configuration';

-- =====================================================
-- Sample data (optional - for development only)
-- =====================================================

-- Uncomment for development environment only
-- INSERT INTO ascora_integrations (organization_id, user_id, api_url, api_token, company_code)
-- VALUES (
--     (SELECT id FROM organizations LIMIT 1),
--     (SELECT user_id FROM users LIMIT 1),
--     'https://demo.ascora.com/api/v1',
--     'encrypted_token_placeholder',
--     'DEMO'
-- );

-- =====================================================
-- Rollback script (if needed)
-- =====================================================

-- To rollback this migration, run:
-- DROP TRIGGER IF EXISTS ascora_integrations_updated_at ON ascora_integrations;
-- DROP TRIGGER IF EXISTS ascora_jobs_updated_at ON ascora_jobs;
-- DROP TRIGGER IF EXISTS ascora_customers_updated_at ON ascora_customers;
-- DROP TRIGGER IF EXISTS ascora_invoices_updated_at ON ascora_invoices;
-- DROP TRIGGER IF EXISTS ascora_sync_schedules_updated_at ON ascora_sync_schedules;
-- DROP FUNCTION IF EXISTS update_ascora_updated_at();
-- DROP TABLE IF EXISTS ascora_sync_schedules CASCADE;
-- DROP TABLE IF EXISTS ascora_sync_logs CASCADE;
-- DROP TABLE IF EXISTS ascora_invoices CASCADE;
-- DROP TABLE IF EXISTS ascora_customers CASCADE;
-- DROP TABLE IF EXISTS ascora_jobs CASCADE;
-- DROP TABLE IF EXISTS ascora_integrations CASCADE;

-- Migration complete
