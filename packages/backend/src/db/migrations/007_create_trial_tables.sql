-- Migration: Create trial management and fraud detection tables
-- Version: 007
-- Description: Creates tables for free trial tokens and fraud detection flags

-- Up Migration

-- Create free_trial_tokens table for managing trial access
CREATE TABLE IF NOT EXISTS free_trial_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(255) NOT NULL UNIQUE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    ip_address INET,
    device_fingerprint VARCHAR(255) REFERENCES device_fingerprints(fingerprint) ON DELETE SET NULL,
    trial_days INTEGER DEFAULT 7,
    metadata JSONB DEFAULT '{}',
    source VARCHAR(100) DEFAULT 'website',
    campaign_id VARCHAR(100),
    referrer_url TEXT,
    CONSTRAINT token_expiry_check CHECK (expires_at > created_at)
);

-- Create trial_fraud_flags table for fraud detection
CREATE TABLE IF NOT EXISTS trial_fraud_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    ip_address INET,
    device_fingerprint VARCHAR(255) REFERENCES device_fingerprints(fingerprint) ON DELETE SET NULL,
    reason VARCHAR(255) NOT NULL,
    severity VARCHAR(50) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    auto_blocked BOOLEAN DEFAULT false,
    risk_score INTEGER DEFAULT 50 CHECK (risk_score >= 0 AND risk_score <= 100)
);

-- Create subscription_history table to track trial to paid conversions
CREATE TABLE IF NOT EXISTS subscription_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_type VARCHAR(50) NOT NULL CHECK (subscription_type IN ('trial', 'basic', 'premium', 'enterprise')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'suspended')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    trial_token_id UUID REFERENCES free_trial_tokens(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX idx_free_trial_tokens_token ON free_trial_tokens(token);
CREATE INDEX idx_free_trial_tokens_user_id ON free_trial_tokens(user_id);
CREATE INDEX idx_free_trial_tokens_email ON free_trial_tokens(email);
CREATE INDEX idx_free_trial_tokens_expires_at ON free_trial_tokens(expires_at);
CREATE INDEX idx_free_trial_tokens_used ON free_trial_tokens(used);
CREATE INDEX idx_free_trial_tokens_device_fingerprint ON free_trial_tokens(device_fingerprint);
CREATE INDEX idx_free_trial_tokens_source ON free_trial_tokens(source);
CREATE INDEX idx_free_trial_tokens_ip_address ON free_trial_tokens(ip_address);

-- Composite index for finding active tokens
CREATE INDEX idx_free_trial_tokens_active ON free_trial_tokens(token, used, expires_at)
    WHERE used = false AND expires_at > CURRENT_TIMESTAMP;

CREATE INDEX idx_trial_fraud_flags_user_id ON trial_fraud_flags(user_id);
CREATE INDEX idx_trial_fraud_flags_email ON trial_fraud_flags(email);
CREATE INDEX idx_trial_fraud_flags_severity ON trial_fraud_flags(severity);
CREATE INDEX idx_trial_fraud_flags_resolved ON trial_fraud_flags(resolved);
CREATE INDEX idx_trial_fraud_flags_created_at ON trial_fraud_flags(created_at DESC);
CREATE INDEX idx_trial_fraud_flags_ip_address ON trial_fraud_flags(ip_address);
CREATE INDEX idx_trial_fraud_flags_risk_score ON trial_fraud_flags(risk_score);

-- Composite index for unresolved high-severity flags
CREATE INDEX idx_trial_fraud_flags_critical_unresolved ON trial_fraud_flags(user_id, severity, resolved)
    WHERE resolved = false AND severity IN ('high', 'critical');

CREATE INDEX idx_subscription_history_user_id ON subscription_history(user_id);
CREATE INDEX idx_subscription_history_status ON subscription_history(status);
CREATE INDEX idx_subscription_history_type ON subscription_history(subscription_type);
CREATE INDEX idx_subscription_history_stripe_customer ON subscription_history(stripe_customer_id);
CREATE INDEX idx_subscription_history_active ON subscription_history(user_id, status)
    WHERE status = 'active';

-- Create function to check for duplicate trials
CREATE OR REPLACE FUNCTION check_duplicate_trial(
    p_email VARCHAR(255),
    p_ip_address INET,
    p_device_fingerprint VARCHAR(255)
)
RETURNS TABLE(
    has_duplicate BOOLEAN,
    duplicate_type VARCHAR(50),
    previous_trial_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- Check by email
    IF EXISTS (
        SELECT 1 FROM free_trial_tokens
        WHERE email = p_email AND used = true
    ) THEN
        RETURN QUERY
        SELECT
            true,
            'email'::VARCHAR(50),
            MAX(used_at)
        FROM free_trial_tokens
        WHERE email = p_email AND used = true;
        RETURN;
    END IF;

    -- Check by IP address (same IP used in last 30 days)
    IF EXISTS (
        SELECT 1 FROM free_trial_tokens
        WHERE ip_address = p_ip_address
            AND used = true
            AND used_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
    ) THEN
        RETURN QUERY
        SELECT
            true,
            'ip_address'::VARCHAR(50),
            MAX(used_at)
        FROM free_trial_tokens
        WHERE ip_address = p_ip_address AND used = true;
        RETURN;
    END IF;

    -- Check by device fingerprint
    IF p_device_fingerprint IS NOT NULL AND EXISTS (
        SELECT 1 FROM free_trial_tokens
        WHERE device_fingerprint = p_device_fingerprint AND used = true
    ) THEN
        RETURN QUERY
        SELECT
            true,
            'device'::VARCHAR(50),
            MAX(used_at)
        FROM free_trial_tokens
        WHERE device_fingerprint = p_device_fingerprint AND used = true;
        RETURN;
    END IF;

    -- No duplicate found
    RETURN QUERY SELECT false, NULL::VARCHAR(50), NULL::TIMESTAMP WITH TIME ZONE;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate fraud risk score
CREATE OR REPLACE FUNCTION calculate_fraud_risk_score(
    p_user_id UUID,
    p_email VARCHAR(255),
    p_ip_address INET
)
RETURNS INTEGER AS $$
DECLARE
    risk_score INTEGER := 0;
    temp_count INTEGER;
BEGIN
    -- Check for multiple accounts from same IP
    SELECT COUNT(DISTINCT user_id) INTO temp_count
    FROM auth_attempts
    WHERE ip_address = p_ip_address
        AND timestamp > CURRENT_TIMESTAMP - INTERVAL '7 days';

    IF temp_count > 3 THEN
        risk_score := risk_score + 20;
    END IF;

    -- Check for disposable email domain
    IF p_email LIKE '%@guerrillamail.%'
        OR p_email LIKE '%@mailinator.%'
        OR p_email LIKE '%@tempmail.%'
        OR p_email LIKE '%@throwaway.%' THEN
        risk_score := risk_score + 30;
    END IF;

    -- Check for rapid trial attempts
    SELECT COUNT(*) INTO temp_count
    FROM free_trial_tokens
    WHERE ip_address = p_ip_address
        AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour';

    IF temp_count > 2 THEN
        risk_score := risk_score + 25;
    END IF;

    -- Check for existing fraud flags
    SELECT COUNT(*) INTO temp_count
    FROM trial_fraud_flags
    WHERE (user_id = p_user_id OR email = p_email OR ip_address = p_ip_address)
        AND resolved = false
        AND severity IN ('high', 'critical');

    IF temp_count > 0 THEN
        risk_score := risk_score + 40;
    END IF;

    -- Cap the score at 100
    RETURN LEAST(risk_score, 100);
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-expire old unused tokens
CREATE OR REPLACE FUNCTION expire_unused_tokens()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE free_trial_tokens
    SET used = false
    WHERE expires_at < CURRENT_TIMESTAMP
        AND used = false;

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE free_trial_tokens IS 'Manages free trial access tokens and tracks trial usage';
COMMENT ON COLUMN free_trial_tokens.token IS 'Unique token for trial activation';
COMMENT ON COLUMN free_trial_tokens.trial_days IS 'Number of trial days granted';
COMMENT ON COLUMN free_trial_tokens.source IS 'Where the trial originated (website, campaign, partner, etc.)';
COMMENT ON COLUMN free_trial_tokens.metadata IS 'Additional metadata in JSON format';

COMMENT ON TABLE trial_fraud_flags IS 'Tracks potential fraud indicators for trial abuse prevention';
COMMENT ON COLUMN trial_fraud_flags.reason IS 'Reason for the fraud flag';
COMMENT ON COLUMN trial_fraud_flags.severity IS 'Severity level of the fraud indicator';
COMMENT ON COLUMN trial_fraud_flags.risk_score IS 'Calculated risk score from 0-100';
COMMENT ON COLUMN trial_fraud_flags.auto_blocked IS 'Whether the system automatically blocked this user';

COMMENT ON TABLE subscription_history IS 'Tracks subscription lifecycle and trial to paid conversions';
COMMENT ON COLUMN subscription_history.trial_token_id IS 'Links to the original trial token if converted from trial';

COMMENT ON FUNCTION check_duplicate_trial IS 'Checks if a user has already used a trial based on multiple factors';
COMMENT ON FUNCTION calculate_fraud_risk_score IS 'Calculates a fraud risk score based on various signals';

-- Down Migration (Rollback)
-- DROP FUNCTION IF EXISTS expire_unused_tokens();
-- DROP FUNCTION IF EXISTS calculate_fraud_risk_score(UUID, VARCHAR, INET);
-- DROP FUNCTION IF EXISTS check_duplicate_trial(VARCHAR, INET, VARCHAR);
-- DROP TABLE IF EXISTS subscription_history CASCADE;
-- DROP TABLE IF EXISTS trial_fraud_flags CASCADE;
-- DROP TABLE IF EXISTS free_trial_tokens CASCADE;