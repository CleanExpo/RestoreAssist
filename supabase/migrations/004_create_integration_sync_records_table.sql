-- Migration: Create integration sync records table
-- Description: Track ServiceM8 and other integration sync operations
-- Date: 2025-01-16

-- Create integration_sync_records table
CREATE TABLE IF NOT EXISTS integration_sync_records (
    -- Primary key
    sync_id TEXT PRIMARY KEY,

    -- Report relationship
    report_id UUID NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,

    -- Integration details
    integration_type TEXT NOT NULL CHECK (integration_type IN ('servicem8', 'xero', 'myob')),
    external_job_id TEXT NOT NULL, -- ServiceM8 job ID, Xero invoice ID, etc.

    -- Sync status
    status TEXT NOT NULL CHECK (status IN ('pending', 'syncing', 'synced', 'failed')),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,

    -- Sync data (snapshots for audit trail)
    sync_data JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_sync_records_report_id ON integration_sync_records(report_id);
CREATE INDEX idx_sync_records_external_job_id ON integration_sync_records(external_job_id);
CREATE INDEX idx_sync_records_status ON integration_sync_records(status);
CREATE INDEX idx_sync_records_integration_type ON integration_sync_records(integration_type);
CREATE INDEX idx_sync_records_created_at ON integration_sync_records(created_at DESC);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_sync_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER trigger_sync_records_updated_at
    BEFORE UPDATE ON integration_sync_records
    FOR EACH ROW
    EXECUTE FUNCTION update_sync_records_updated_at();

-- Comments
COMMENT ON TABLE integration_sync_records IS 'Track synchronization of reports with external integrations';
COMMENT ON COLUMN integration_sync_records.sync_id IS 'Unique sync operation identifier';
COMMENT ON COLUMN integration_sync_records.integration_type IS 'Type of integration (servicem8, xero, myob)';
COMMENT ON COLUMN integration_sync_records.external_job_id IS 'External system job/invoice/record ID';
COMMENT ON COLUMN integration_sync_records.status IS 'Sync status (pending, syncing, synced, failed)';
COMMENT ON COLUMN integration_sync_records.sync_data IS 'JSONB snapshots of report and external data for audit';
