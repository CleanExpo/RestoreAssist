-- Migration: Create refresh tokens table for JWT refresh token management
-- Version: 007
-- Description: Creates the refresh_tokens table with proper indexes and constraints

-- Up Migration
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE,
    is_revoked BOOLEAN DEFAULT false,
    user_agent TEXT,
    ip_address INET,
    CONSTRAINT refresh_tokens_token_length CHECK (length(token) >= 32)
);

-- Create indexes for performance
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_is_revoked ON refresh_tokens(is_revoked);

-- Composite index for finding active tokens
CREATE INDEX idx_refresh_tokens_active ON refresh_tokens(token, is_revoked, expires_at)
    WHERE is_revoked = false;

-- Composite index for user's active tokens
CREATE INDEX idx_refresh_tokens_user_active ON refresh_tokens(user_id, is_revoked, expires_at)
    WHERE is_revoked = false;

-- Create function to automatically clean expired tokens (runs daily)
CREATE OR REPLACE FUNCTION clean_expired_refresh_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM refresh_tokens
    WHERE expires_at < CURRENT_TIMESTAMP
       OR (is_revoked = true AND revoked_at < CURRENT_TIMESTAMP - INTERVAL '7 days');
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens for maintaining user sessions';
COMMENT ON COLUMN refresh_tokens.id IS 'Unique identifier for the refresh token record';
COMMENT ON COLUMN refresh_tokens.user_id IS 'User who owns this refresh token';
COMMENT ON COLUMN refresh_tokens.token IS 'The actual JWT refresh token string';
COMMENT ON COLUMN refresh_tokens.expires_at IS 'When this token expires';
COMMENT ON COLUMN refresh_tokens.is_revoked IS 'Whether this token has been revoked';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'When this token was revoked';
COMMENT ON COLUMN refresh_tokens.user_agent IS 'User agent string when token was created';
COMMENT ON COLUMN refresh_tokens.ip_address IS 'IP address when token was created';

COMMENT ON FUNCTION clean_expired_refresh_tokens IS 'Removes expired and old revoked refresh tokens';

-- Down Migration (Rollback)
-- DROP FUNCTION IF EXISTS clean_expired_refresh_tokens();
-- DROP TABLE IF EXISTS refresh_tokens CASCADE;