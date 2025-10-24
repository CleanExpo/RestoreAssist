-- Migration: Create login sessions table for session management
-- Version: 008
-- Description: Creates the login_sessions table for managing user login sessions

-- Up Migration
CREATE TABLE IF NOT EXISTS login_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    CONSTRAINT login_sessions_valid_expiry CHECK (expires_at > created_at)
);

-- Create indexes for performance
CREATE INDEX idx_login_sessions_user_id ON login_sessions(user_id);
CREATE INDEX idx_login_sessions_session_token ON login_sessions(session_token);
CREATE INDEX idx_login_sessions_expires_at ON login_sessions(expires_at);
CREATE INDEX idx_login_sessions_is_active ON login_sessions(is_active);
CREATE INDEX idx_login_sessions_ip_address ON login_sessions(ip_address);
CREATE INDEX idx_login_sessions_last_activity ON login_sessions(last_activity_at DESC);

-- Composite index for finding active sessions
CREATE INDEX idx_login_sessions_active ON login_sessions(session_token, is_active, expires_at)
    WHERE is_active = true;

-- Composite index for user's active sessions
CREATE INDEX idx_login_sessions_user_active ON login_sessions(user_id, is_active, expires_at)
    WHERE is_active = true;

-- Create trigger to update last_activity_at on any update
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if the session is being accessed (not just being deactivated)
    IF NEW.is_active = true THEN
        NEW.last_activity_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_login_sessions_activity
    BEFORE UPDATE ON login_sessions
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.* AND NEW.is_active = true)
    EXECUTE FUNCTION update_session_activity();

-- Create function to clean expired sessions (runs daily)
CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete sessions that are expired or inactive for more than 30 days
    DELETE FROM login_sessions
    WHERE expires_at < CURRENT_TIMESTAMP
       OR (is_active = false AND last_activity_at < CURRENT_TIMESTAMP - INTERVAL '30 days');
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get active session count for rate limiting
CREATE OR REPLACE FUNCTION get_active_session_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    session_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO session_count
    FROM login_sessions
    WHERE user_id = p_user_id
      AND is_active = true
      AND expires_at > CURRENT_TIMESTAMP;
    RETURN session_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE login_sessions IS 'User login sessions for session management and tracking';
COMMENT ON COLUMN login_sessions.session_id IS 'Unique identifier for the session';
COMMENT ON COLUMN login_sessions.user_id IS 'User who owns this session';
COMMENT ON COLUMN login_sessions.session_token IS 'Unique token for the session (UUID)';
COMMENT ON COLUMN login_sessions.ip_address IS 'IP address where session was created';
COMMENT ON COLUMN login_sessions.user_agent IS 'User agent string when session was created';
COMMENT ON COLUMN login_sessions.created_at IS 'When the session was created';
COMMENT ON COLUMN login_sessions.expires_at IS 'When the session expires';
COMMENT ON COLUMN login_sessions.last_activity_at IS 'Last time this session was used';
COMMENT ON COLUMN login_sessions.is_active IS 'Whether the session is still active';

COMMENT ON FUNCTION clean_expired_sessions IS 'Removes expired and old inactive sessions';
COMMENT ON FUNCTION get_active_session_count IS 'Returns the number of active sessions for a user';

-- Down Migration (Rollback)
-- DROP TRIGGER IF EXISTS update_login_sessions_activity ON login_sessions;
-- DROP FUNCTION IF EXISTS update_session_activity();
-- DROP FUNCTION IF EXISTS get_active_session_count(UUID);
-- DROP FUNCTION IF EXISTS clean_expired_sessions();
-- DROP TABLE IF EXISTS login_sessions CASCADE;