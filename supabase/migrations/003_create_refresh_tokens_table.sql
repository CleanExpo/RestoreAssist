-- Migration: Create refresh tokens table
-- Description: JWT refresh token storage for authentication
-- Date: 2025-01-16

-- Create refresh_tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    -- Primary key
    token TEXT PRIMARY KEY,

    -- User relationship
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Token metadata
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Revocation support
    revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_revoked ON refresh_tokens(revoked) WHERE revoked = false;

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM refresh_tokens
    WHERE expires_at < NOW() OR revoked = true;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens for user authentication';
COMMENT ON COLUMN refresh_tokens.token IS 'JWT refresh token string';
COMMENT ON COLUMN refresh_tokens.user_id IS 'User who owns this refresh token';
COMMENT ON COLUMN refresh_tokens.expires_at IS 'When this token expires (7 days from creation)';
COMMENT ON COLUMN refresh_tokens.revoked IS 'Whether token has been revoked (logout)';
