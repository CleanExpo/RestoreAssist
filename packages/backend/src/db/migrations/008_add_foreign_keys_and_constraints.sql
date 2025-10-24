-- Migration: Add foreign keys and additional constraints
-- Version: 008
-- Description: Adds cross-table foreign keys and business logic constraints

-- Up Migration

-- Add additional constraints to ensure data integrity
ALTER TABLE users
    ADD CONSTRAINT users_email_lowercase CHECK (email = LOWER(email));

-- Add constraint to ensure trial tokens are generated before use
ALTER TABLE free_trial_tokens
    ADD CONSTRAINT token_used_after_created CHECK (
        used = false OR used_at >= created_at
    );

-- Add constraint to ensure fraud flags are resolved properly
ALTER TABLE trial_fraud_flags
    ADD CONSTRAINT fraud_resolved_properly CHECK (
        (resolved = false AND resolved_at IS NULL AND resolved_by IS NULL)
        OR (resolved = true AND resolved_at IS NOT NULL)
    );

-- Add constraint for subscription history dates
ALTER TABLE subscription_history
    ADD CONSTRAINT subscription_dates_valid CHECK (
        (expires_at IS NULL OR expires_at > started_at)
        AND (cancelled_at IS NULL OR cancelled_at >= started_at)
    );

-- Create a materialized view for user trial status (for performance)
CREATE MATERIALIZED VIEW user_trial_status AS
SELECT
    u.id as user_id,
    u.email,
    u.created_at as user_created_at,
    COALESCE(
        MAX(CASE WHEN sh.subscription_type = 'trial' AND sh.status = 'active' THEN true ELSE false END),
        false
    ) as has_active_trial,
    MAX(ftt.used_at) as last_trial_used,
    COUNT(DISTINCT ftt.id) FILTER (WHERE ftt.used = true) as total_trials_used,
    MAX(tff.risk_score) as max_fraud_risk_score,
    COUNT(DISTINCT tff.id) FILTER (WHERE tff.resolved = false) as unresolved_fraud_flags
FROM users u
LEFT JOIN subscription_history sh ON u.id = sh.user_id
LEFT JOIN free_trial_tokens ftt ON u.id = ftt.user_id
LEFT JOIN trial_fraud_flags tff ON u.id = tff.user_id
GROUP BY u.id, u.email, u.created_at;

CREATE UNIQUE INDEX idx_user_trial_status_user_id ON user_trial_status(user_id);
CREATE INDEX idx_user_trial_status_has_trial ON user_trial_status(has_active_trial);
CREATE INDEX idx_user_trial_status_risk ON user_trial_status(max_fraud_risk_score);

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_user_trial_status()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_trial_status;
END;
$$ LANGUAGE plpgsql;

-- Create a compound index for fraud detection queries
CREATE INDEX idx_fraud_detection_compound ON trial_fraud_flags(
    user_id,
    email,
    ip_address,
    severity,
    resolved
) WHERE resolved = false;

-- Create a compound index for auth rate limiting
CREATE INDEX idx_auth_rate_limit_compound ON auth_attempts(
    ip_address,
    attempt_type,
    timestamp DESC
) WHERE success = false AND timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour';

-- Create a function to automatically flag suspicious trial attempts
CREATE OR REPLACE FUNCTION auto_flag_suspicious_trials()
RETURNS TRIGGER AS $$
DECLARE
    duplicate_check RECORD;
    risk_score INTEGER;
BEGIN
    -- Only run for new trial tokens
    IF TG_OP = 'INSERT' THEN
        -- Check for duplicates
        SELECT * INTO duplicate_check
        FROM check_duplicate_trial(NEW.email, NEW.ip_address, NEW.device_fingerprint);

        IF duplicate_check.has_duplicate THEN
            -- Create a fraud flag
            INSERT INTO trial_fraud_flags (
                user_id,
                email,
                ip_address,
                device_fingerprint,
                reason,
                severity,
                details,
                auto_blocked,
                risk_score
            ) VALUES (
                NEW.user_id,
                NEW.email,
                NEW.ip_address,
                NEW.device_fingerprint,
                'Duplicate trial attempt via ' || duplicate_check.duplicate_type,
                CASE
                    WHEN duplicate_check.duplicate_type = 'device' THEN 'high'
                    WHEN duplicate_check.duplicate_type = 'ip_address' THEN 'medium'
                    ELSE 'low'
                END,
                jsonb_build_object(
                    'duplicate_type', duplicate_check.duplicate_type,
                    'previous_trial_date', duplicate_check.previous_trial_date,
                    'token_id', NEW.id
                ),
                false,
                CASE
                    WHEN duplicate_check.duplicate_type = 'device' THEN 75
                    WHEN duplicate_check.duplicate_type = 'ip_address' THEN 50
                    ELSE 25
                END
            );
        END IF;

        -- Calculate risk score if user exists
        IF NEW.user_id IS NOT NULL THEN
            risk_score := calculate_fraud_risk_score(NEW.user_id, NEW.email, NEW.ip_address);

            -- Auto-block if risk score is too high
            IF risk_score >= 80 THEN
                INSERT INTO trial_fraud_flags (
                    user_id,
                    email,
                    ip_address,
                    device_fingerprint,
                    reason,
                    severity,
                    details,
                    auto_blocked,
                    risk_score
                ) VALUES (
                    NEW.user_id,
                    NEW.email,
                    NEW.ip_address,
                    NEW.device_fingerprint,
                    'High risk score detected',
                    'critical',
                    jsonb_build_object(
                        'calculated_risk_score', risk_score,
                        'token_id', NEW.id,
                        'auto_blocked', true
                    ),
                    true,
                    risk_score
                );

                -- Mark the token as invalid
                NEW.used := true;
                NEW.used_at := CURRENT_TIMESTAMP;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic fraud detection
CREATE TRIGGER auto_flag_suspicious_trials_trigger
    BEFORE INSERT ON free_trial_tokens
    FOR EACH ROW
    EXECUTE FUNCTION auto_flag_suspicious_trials();

-- Create a function to clean up expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS TABLE(
    auth_attempts_deleted INTEGER,
    expired_tokens_updated INTEGER,
    old_fraud_flags_archived INTEGER
) AS $$
DECLARE
    auth_deleted INTEGER;
    tokens_updated INTEGER;
    flags_archived INTEGER;
BEGIN
    -- Clean old auth attempts
    DELETE FROM auth_attempts
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '90 days';
    GET DIAGNOSTICS auth_deleted = ROW_COUNT;

    -- Mark expired tokens
    UPDATE free_trial_tokens
    SET used = false
    WHERE expires_at < CURRENT_TIMESTAMP
        AND used = false;
    GET DIAGNOSTICS tokens_updated = ROW_COUNT;

    -- Archive old resolved fraud flags (move to details JSON)
    UPDATE trial_fraud_flags
    SET details = details || jsonb_build_object('archived_at', CURRENT_TIMESTAMP)
    WHERE resolved = true
        AND resolved_at < CURRENT_TIMESTAMP - INTERVAL '180 days';
    GET DIAGNOSTICS flags_archived = ROW_COUNT;

    RETURN QUERY SELECT auth_deleted, tokens_updated, flags_archived;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON MATERIALIZED VIEW user_trial_status IS 'Aggregated view of user trial and fraud status for quick lookups';
COMMENT ON FUNCTION refresh_user_trial_status IS 'Refreshes the user trial status materialized view';
COMMENT ON FUNCTION auto_flag_suspicious_trials IS 'Automatically flags suspicious trial attempts based on various signals';
COMMENT ON FUNCTION cleanup_expired_data IS 'Cleans up old authentication attempts, expires tokens, and archives old fraud flags';

-- Down Migration (Rollback)
-- DROP TRIGGER IF EXISTS auto_flag_suspicious_trials_trigger ON free_trial_tokens;
-- DROP FUNCTION IF EXISTS auto_flag_suspicious_trials();
-- DROP FUNCTION IF EXISTS cleanup_expired_data();
-- DROP FUNCTION IF EXISTS refresh_user_trial_status();
-- DROP MATERIALIZED VIEW IF EXISTS user_trial_status;
-- DROP INDEX IF EXISTS idx_fraud_detection_compound;
-- DROP INDEX IF EXISTS idx_auth_rate_limit_compound;
-- ALTER TABLE subscription_history DROP CONSTRAINT IF EXISTS subscription_dates_valid;
-- ALTER TABLE trial_fraud_flags DROP CONSTRAINT IF EXISTS fraud_resolved_properly;
-- ALTER TABLE free_trial_tokens DROP CONSTRAINT IF EXISTS token_used_after_created;
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_lowercase;