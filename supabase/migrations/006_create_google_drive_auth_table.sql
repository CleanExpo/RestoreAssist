-- Migration: Create Google Drive authorization table
-- Description: Store OAuth tokens for Google Drive integration
-- Date: 2025-01-16

-- Create google_drive_auth table
CREATE TABLE IF NOT EXISTS google_drive_auth (
    -- Primary key (one auth per user)
    user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,

    -- OAuth tokens
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date BIGINT, -- Unix timestamp in milliseconds

    -- User metadata
    email TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_google_drive_auth_email ON google_drive_auth(email);
CREATE INDEX idx_google_drive_auth_expiry ON google_drive_auth(expiry_date);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_google_drive_auth_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER trigger_google_drive_auth_updated_at
    BEFORE UPDATE ON google_drive_auth
    FOR EACH ROW
    EXECUTE FUNCTION update_google_drive_auth_updated_at();

-- Comments
COMMENT ON TABLE google_drive_auth IS 'OAuth 2.0 tokens for Google Drive integration per user';
COMMENT ON COLUMN google_drive_auth.access_token IS 'Google OAuth access token (short-lived)';
COMMENT ON COLUMN google_drive_auth.refresh_token IS 'Google OAuth refresh token (long-lived)';
COMMENT ON COLUMN google_drive_auth.expiry_date IS 'Access token expiry timestamp (Unix milliseconds)';
COMMENT ON COLUMN google_drive_auth.email IS 'Google account email address';
