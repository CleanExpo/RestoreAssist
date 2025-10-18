-- Migration: Create drive file records table
-- Description: Track Google Drive uploads for reports
-- Date: 2025-01-16

-- Create drive_file_records table
CREATE TABLE IF NOT EXISTS drive_file_records (
    -- Primary key
    record_id TEXT PRIMARY KEY,

    -- Report relationship
    report_id UUID NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,

    -- Google Drive details
    drive_file_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('docx', 'pdf')),

    -- Upload metadata
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    uploaded_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX idx_drive_files_report_id ON drive_file_records(report_id);
CREATE INDEX idx_drive_files_drive_file_id ON drive_file_records(drive_file_id);
CREATE INDEX idx_drive_files_uploaded_by ON drive_file_records(uploaded_by);
CREATE INDEX idx_drive_files_uploaded_at ON drive_file_records(uploaded_at DESC);
CREATE INDEX idx_drive_files_format ON drive_file_records(format);

-- Comments
COMMENT ON TABLE drive_file_records IS 'Track Google Drive file uploads for reports';
COMMENT ON COLUMN drive_file_records.record_id IS 'Unique record identifier';
COMMENT ON COLUMN drive_file_records.drive_file_id IS 'Google Drive file ID';
COMMENT ON COLUMN drive_file_records.file_url IS 'Google Drive web view link';
COMMENT ON COLUMN drive_file_records.format IS 'File format (docx or pdf)';
COMMENT ON COLUMN drive_file_records.uploaded_by IS 'User who uploaded the file';
