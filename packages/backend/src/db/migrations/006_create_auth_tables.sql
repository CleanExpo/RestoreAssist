-- Migration: Create authentication and rate limiting tables
-- Version: 006
-- Description: Creates tables for auth attempts tracking and device fingerprinting

-- Up Migration

-- Create auth_attempts table for rate limiting and security monitoring
CREATE TABLE IF NOT EXISTS auth_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    ip_address INET NOT NULL,
    user_agent TEXT,
    success BOOLEAN NOT NULL DEFAULT false,
    failure_reason VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    attempt_type VARCHAR(50) DEFAULT 'login' CHECK (attempt_type IN ('login', 'register', 'reset_password', 'verify_email'))
);

-- Create device_fingerprints table for fraud detection
CREATE TABLE IF NOT EXISTS device_fingerprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint VARCHAR(255) NOT NULL UNIQUE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ip_address INET,
    user_agent TEXT,
    screen_resolution VARCHAR(50),
    timezone VARCHAR(100),
    language VARCHAR(10),
    platform VARCHAR(100),
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    trust_score INTEGER DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
    is_blocked BOOLEAN DEFAULT false,
    blocked_reason TEXT,
    device_count INTEGER DEFAULT 1
);

-- Create indexes for performance
CREATE INDEX idx_auth_attempts_user_id ON auth_attempts(user_id);
CREATE INDEX idx_auth_attempts_email ON auth_attempts(email);
CREATE INDEX idx_auth_attempts_ip_address ON auth_attempts(ip_address);
CREATE INDEX idx_auth_attempts_timestamp ON auth_attempts(timestamp DESC);
CREATE INDEX idx_auth_attempts_success ON auth_attempts(success);
CREATE INDEX idx_auth_attempts_type ON auth_attempts(attempt_type);

-- Composite index for rate limiting queries
CREATE INDEX idx_auth_attempts_rate_limit ON auth_attempts(ip_address, timestamp DESC)
    WHERE success = false;

CREATE INDEX idx_device_fingerprints_user_id ON device_fingerprints(user_id);
CREATE INDEX idx_device_fingerprints_fingerprint ON device_fingerprints(fingerprint);
CREATE INDEX idx_device_fingerprints_ip_address ON device_fingerprints(ip_address);
CREATE INDEX idx_device_fingerprints_trust_score ON device_fingerprints(trust_score);
CREATE INDEX idx_device_fingerprints_blocked ON device_fingerprints(is_blocked)
    WHERE is_blocked = true;

-- Create function to clean old auth attempts (keep last 30 days)
CREATE OR REPLACE FUNCTION clean_old_auth_attempts()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM auth_attempts
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to check rate limits
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_ip_address INET,
    p_window_minutes INTEGER DEFAULT 15,
    p_max_attempts INTEGER DEFAULT 5
)
RETURNS BOOLEAN AS $$
DECLARE
    attempt_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO attempt_count
    FROM auth_attempts
    WHERE ip_address = p_ip_address
        AND success = false
        AND timestamp > CURRENT_TIMESTAMP - (p_window_minutes || ' minutes')::INTERVAL;

    RETURN attempt_count < p_max_attempts;
END;
$$ LANGUAGE plpgsql;

-- Update last_seen trigger for device_fingerprints
CREATE OR REPLACE FUNCTION update_device_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_seen = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_device_fingerprints_last_seen
    BEFORE UPDATE ON device_fingerprints
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.*)
    EXECUTE FUNCTION update_device_last_seen();

-- Add comments for documentation
COMMENT ON TABLE auth_attempts IS 'Tracks all authentication attempts for rate limiting and security monitoring';
COMMENT ON COLUMN auth_attempts.user_id IS 'User ID if login was successful or user exists';
COMMENT ON COLUMN auth_attempts.email IS 'Email used in the attempt';
COMMENT ON COLUMN auth_attempts.ip_address IS 'IP address of the attempt';
COMMENT ON COLUMN auth_attempts.success IS 'Whether the authentication attempt was successful';
COMMENT ON COLUMN auth_attempts.failure_reason IS 'Reason for failure if applicable';

COMMENT ON TABLE device_fingerprints IS 'Tracks device fingerprints for fraud detection and multi-device monitoring';
COMMENT ON COLUMN device_fingerprints.fingerprint IS 'Unique device fingerprint hash';
COMMENT ON COLUMN device_fingerprints.trust_score IS 'Trust score from 0-100, higher is more trusted';
COMMENT ON COLUMN device_fingerprints.device_count IS 'Number of different devices associated with this fingerprint';

COMMENT ON FUNCTION check_rate_limit IS 'Checks if an IP address has exceeded the rate limit for failed attempts';
COMMENT ON FUNCTION clean_old_auth_attempts IS 'Removes auth attempt records older than 30 days';

-- Down Migration (Rollback)
-- DROP TRIGGER IF EXISTS update_device_fingerprints_last_seen ON device_fingerprints;
-- DROP FUNCTION IF EXISTS update_device_last_seen();
-- DROP FUNCTION IF EXISTS check_rate_limit(INET, INTEGER, INTEGER);
-- DROP FUNCTION IF EXISTS clean_old_auth_attempts();
-- DROP TABLE IF EXISTS device_fingerprints CASCADE;
-- DROP TABLE IF EXISTS auth_attempts CASCADE;