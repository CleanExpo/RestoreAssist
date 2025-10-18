-- Migration: Create reports table
-- Description: Main table for storing damage assessment reports
-- Author: RestoreAssist
-- Date: 2025-10-18

-- Create extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
    -- Primary key
    report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Property information
    property_address TEXT NOT NULL,
    damage_type VARCHAR(50) NOT NULL CHECK (damage_type IN ('water', 'fire', 'storm', 'flood', 'mold')),
    damage_description TEXT NOT NULL,
    state VARCHAR(10) NOT NULL CHECK (state IN ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')),

    -- Report content
    summary TEXT NOT NULL,
    scope_of_work JSONB NOT NULL,
    itemized_estimate JSONB NOT NULL,
    total_cost DECIMAL(12, 2) NOT NULL,
    compliance_notes JSONB NOT NULL,
    authority_to_proceed TEXT NOT NULL,

    -- Metadata
    client_name VARCHAR(255),
    insurance_company VARCHAR(255),
    claim_number VARCHAR(100),
    generated_by VARCHAR(100) NOT NULL DEFAULT 'RestoreAssist AI',
    model VARCHAR(100) NOT NULL,

    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for common queries
CREATE INDEX idx_reports_created_at ON reports(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_state ON reports(state) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_damage_type ON reports(damage_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_total_cost ON reports(total_cost DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_client_name ON reports(client_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_claim_number ON reports(claim_number) WHERE deleted_at IS NULL;

-- Composite index for pagination and sorting
CREATE INDEX idx_reports_pagination ON reports(created_at DESC, report_id) WHERE deleted_at IS NULL;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
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
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE reports IS 'Stores AI-generated disaster restoration damage assessment reports';
COMMENT ON COLUMN reports.report_id IS 'Unique identifier for the report (UUID)';
COMMENT ON COLUMN reports.created_at IS 'Timestamp when report was created';
COMMENT ON COLUMN reports.updated_at IS 'Timestamp when report was last updated';
COMMENT ON COLUMN reports.property_address IS 'Full address of the damaged property';
COMMENT ON COLUMN reports.damage_type IS 'Type of damage: water, fire, storm, flood, or mold';
COMMENT ON COLUMN reports.damage_description IS 'Detailed description of the damage';
COMMENT ON COLUMN reports.state IS 'Australian state where property is located';
COMMENT ON COLUMN reports.summary IS 'AI-generated professional damage assessment summary';
COMMENT ON COLUMN reports.scope_of_work IS 'JSON array of work items to be completed';
COMMENT ON COLUMN reports.itemized_estimate IS 'JSON array of cost items with quantities and prices';
COMMENT ON COLUMN reports.total_cost IS 'Total cost of all items in AUD';
COMMENT ON COLUMN reports.compliance_notes IS 'JSON array of Australian compliance requirements';
COMMENT ON COLUMN reports.authority_to_proceed IS 'Professional authority to proceed document text';
COMMENT ON COLUMN reports.deleted_at IS 'Soft delete timestamp (NULL if not deleted)';
