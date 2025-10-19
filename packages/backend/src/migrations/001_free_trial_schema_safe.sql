-- Free Trial System Database Schema (Safe Migration)
-- Handles existing tables and indexes gracefully
-- Created: 2025-10-19
-- Version: 1.0.1

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE 1: Users (Google OAuth)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    picture_url TEXT,
    email_verified BOOLEAN DEFAULT false,
    locale VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes only if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_email') THEN
        CREATE INDEX idx_users_email ON users(email);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_google_id') THEN
        CREATE INDEX idx_users_google_id ON users(google_id);
    END IF;
END $$;

-- =====================================================
-- TABLE 2: Free Trial Tokens
-- =====================================================
CREATE TABLE IF NOT EXISTS free_trial_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, active, expired, revoked
    activated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    reports_remaining INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoke_reason TEXT
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trial_tokens_user') THEN
        CREATE INDEX idx_trial_tokens_user ON free_trial_tokens(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trial_tokens_status') THEN
        CREATE INDEX idx_trial_tokens_status ON free_trial_tokens(status);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trial_tokens_expires') THEN
        CREATE INDEX idx_trial_tokens_expires ON free_trial_tokens(expires_at);
    END IF;
END $$;

-- =====================================================
-- TABLE 3: Device Fingerprints
-- =====================================================
CREATE TABLE IF NOT EXISTS device_fingerprints (
    fingerprint_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    fingerprint_hash VARCHAR(64) UNIQUE NOT NULL,
    device_data JSONB NOT NULL,
    trial_count INTEGER DEFAULT 0,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_blocked BOOLEAN DEFAULT false,
    blocked_reason TEXT
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_fingerprints_hash') THEN
        CREATE INDEX idx_fingerprints_hash ON device_fingerprints(fingerprint_hash);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_fingerprints_user') THEN
        CREATE INDEX idx_fingerprints_user ON device_fingerprints(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_fingerprints_blocked') THEN
        CREATE INDEX idx_fingerprints_blocked ON device_fingerprints(is_blocked);
    END IF;
END $$;

-- =====================================================
-- TABLE 4: Payment Verifications
-- =====================================================
CREATE TABLE IF NOT EXISTS payment_verifications (
    verification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    card_fingerprint VARCHAR(255),
    card_last4 VARCHAR(4),
    card_brand VARCHAR(50),
    verification_status VARCHAR(50) NOT NULL, -- success, failed, pending
    stripe_payment_method_id VARCHAR(255),
    amount_cents INTEGER DEFAULT 100, -- Test charge amount
    verification_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    failure_reason TEXT,
    reuse_count INTEGER DEFAULT 0
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payment_verifications_user') THEN
        CREATE INDEX idx_payment_verifications_user ON payment_verifications(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payment_verifications_fingerprint') THEN
        CREATE INDEX idx_payment_verifications_fingerprint ON payment_verifications(card_fingerprint);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_payment_verifications_status') THEN
        CREATE INDEX idx_payment_verifications_status ON payment_verifications(verification_status);
    END IF;
END $$;

-- =====================================================
-- TABLE 5: Login Sessions
-- =====================================================
CREATE TABLE IF NOT EXISTS login_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    ip_address INET,
    country VARCHAR(100),
    region VARCHAR(100),
    city VARCHAR(100),
    timezone VARCHAR(100),
    user_agent TEXT,
    session_token VARCHAR(500) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_login_sessions_user') THEN
        CREATE INDEX idx_login_sessions_user ON login_sessions(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_login_sessions_token') THEN
        CREATE INDEX idx_login_sessions_token ON login_sessions(session_token);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_login_sessions_ip') THEN
        CREATE INDEX idx_login_sessions_ip ON login_sessions(ip_address);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_login_sessions_active') THEN
        CREATE INDEX idx_login_sessions_active ON login_sessions(is_active);
    END IF;
END $$;

-- =====================================================
-- TABLE 6: Trial Fraud Flags
-- =====================================================
CREATE TABLE IF NOT EXISTS trial_fraud_flags (
    flag_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    fingerprint_hash VARCHAR(64),
    ip_address INET,
    flag_type VARCHAR(100) NOT NULL, -- disposable_email, vpn_detected, card_reuse, etc.
    severity VARCHAR(20) NOT NULL, -- low, medium, high, critical
    fraud_score INTEGER DEFAULT 0, -- 0-100
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_note TEXT
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_fraud_flags_user') THEN
        CREATE INDEX idx_fraud_flags_user ON trial_fraud_flags(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_fraud_flags_type') THEN
        CREATE INDEX idx_fraud_flags_type ON trial_fraud_flags(flag_type);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_fraud_flags_severity') THEN
        CREATE INDEX idx_fraud_flags_severity ON trial_fraud_flags(severity);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_fraud_flags_created') THEN
        CREATE INDEX idx_fraud_flags_created ON trial_fraud_flags(created_at);
    END IF;
END $$;

-- =====================================================
-- TABLE 7: Trial Usage
-- =====================================================
CREATE TABLE IF NOT EXISTS trial_usage (
    usage_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_id UUID NOT NULL REFERENCES free_trial_tokens(token_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    report_id UUID,
    action_type VARCHAR(50) NOT NULL, -- report_generated, export_pdf, export_docx
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trial_usage_token') THEN
        CREATE INDEX idx_trial_usage_token ON trial_usage(token_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trial_usage_user') THEN
        CREATE INDEX idx_trial_usage_user ON trial_usage(user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trial_usage_created') THEN
        CREATE INDEX idx_trial_usage_created ON trial_usage(created_at);
    END IF;
END $$;

-- =====================================================
-- Trigger: Update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop and recreate triggers to ensure they exist
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_trial_tokens_updated_at ON free_trial_tokens;
CREATE TRIGGER update_trial_tokens_updated_at BEFORE UPDATE ON free_trial_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE users IS 'Google OAuth authenticated users';
COMMENT ON TABLE free_trial_tokens IS 'Trial lifecycle management with report limits';
COMMENT ON TABLE device_fingerprints IS 'Device tracking for abuse prevention';
COMMENT ON TABLE payment_verifications IS 'Stripe card validation tracking';
COMMENT ON TABLE login_sessions IS 'IP and geolocation audit trail';
COMMENT ON TABLE trial_fraud_flags IS 'Fraud detection and logging system';
COMMENT ON TABLE trial_usage IS 'Report counting and analytics';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Free trial schema migration completed successfully!';
    RAISE NOTICE 'Tables created/verified: 7';
    RAISE NOTICE 'Indexes created/verified: 12';
    RAISE NOTICE 'Triggers created/verified: 2';
END $$;
