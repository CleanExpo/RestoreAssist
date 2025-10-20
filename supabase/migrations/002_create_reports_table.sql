-- Migration: Create reports table
-- Description: AI-generated damage assessment reports
-- Date: 2025-01-16

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
    -- Primary key
    report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    timestamp TEXT NOT NULL, -- ISO string from report generation

    -- Property information
    property_address TEXT NOT NULL,
    damage_type TEXT NOT NULL CHECK (damage_type IN ('Water', 'Fire', 'Storm', 'Flood', 'Mould', 'Biohazard', 'Impact', 'Other')),
    damage_description TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')),

    -- Assessment details
    severity TEXT NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
    urgent BOOLEAN NOT NULL DEFAULT false,

    -- Report content
    summary TEXT NOT NULL,
    recommendations JSONB NOT NULL, -- Array of recommendation strings
    scope_of_work JSONB NOT NULL, -- Array of work items
    itemized_estimate JSONB NOT NULL, -- Array of cost items
    total_cost DECIMAL(12, 2) NOT NULL,
    timeline TEXT NOT NULL,
    compliance_notes JSONB NOT NULL, -- Array of compliance notes
    authority_to_proceed TEXT NOT NULL,

    -- Metadata
    client_name TEXT,
    client_email TEXT,
    client_phone TEXT,
    insurance_company TEXT,
    claim_number TEXT,
    policy_number TEXT,
    assessor_name TEXT,
    generated_by TEXT NOT NULL DEFAULT 'RestoreAssist AI',
    model TEXT NOT NULL,

    -- User relationship
    created_by_user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,

    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for common queries
CREATE INDEX idx_reports_created_at ON reports(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_state ON reports(state) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_damage_type ON reports(damage_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_severity ON reports(severity) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_urgent ON reports(urgent) WHERE deleted_at IS NULL AND urgent = true;
CREATE INDEX idx_reports_total_cost ON reports(total_cost DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_client_name ON reports(client_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_claim_number ON reports(claim_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_created_by ON reports(created_by_user_id) WHERE deleted_at IS NULL;

-- Composite index for pagination and sorting
CREATE INDEX idx_reports_pagination ON reports(created_at DESC, report_id) WHERE deleted_at IS NULL;

-- Full-text search index
CREATE INDEX idx_reports_search ON reports USING GIN (
    to_tsvector('english',
        coalesce(property_address, '') || ' ' ||
        coalesce(damage_description, '') || ' ' ||
        coalesce(summary, '') || ' ' ||
        coalesce(client_name, '') || ' ' ||
        coalesce(claim_number, '')
    )
) WHERE deleted_at IS NULL;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on UPDATE
CREATE TRIGGER trigger_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION update_reports_updated_at();

-- Add comments for documentation
COMMENT ON TABLE reports IS 'AI-generated disaster restoration damage assessment reports';
COMMENT ON COLUMN reports.report_id IS 'Unique identifier for the report (UUID)';
COMMENT ON COLUMN reports.created_at IS 'Database timestamp when report was created';
COMMENT ON COLUMN reports.timestamp IS 'ISO string timestamp from report generation';
COMMENT ON COLUMN reports.property_address IS 'Full address of the damaged property';
COMMENT ON COLUMN reports.damage_type IS 'Type of damage (Water, Fire, Storm, Flood, Mould, Biohazard, Impact, Other)';
COMMENT ON COLUMN reports.severity IS 'Severity rating (Low, Medium, High, Critical)';
COMMENT ON COLUMN reports.urgent IS 'Whether immediate action is required';
COMMENT ON COLUMN reports.scope_of_work IS 'JSONB array of work items to be completed';
COMMENT ON COLUMN reports.itemized_estimate IS 'JSONB array of cost items with quantities and prices';
COMMENT ON COLUMN reports.total_cost IS 'Total cost of all items in AUD';
COMMENT ON COLUMN reports.compliance_notes IS 'JSONB array of Australian compliance requirements (NCC, AS, state codes)';
COMMENT ON COLUMN reports.deleted_at IS 'Soft delete timestamp (NULL if not deleted)';
