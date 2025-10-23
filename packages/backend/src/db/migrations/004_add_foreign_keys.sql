-- =====================================================
-- Migration: Add Missing Foreign Key Constraints
-- Date: 2025-10-23
-- Purpose: Ensure referential integrity and cascade operations
-- =====================================================

-- Check if constraints exist before adding (idempotent)
DO $$
BEGIN
  -- Free trial tokens -> users
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_free_trial_tokens_user_id'
  ) THEN
    ALTER TABLE free_trial_tokens
      ADD CONSTRAINT fk_free_trial_tokens_user_id
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE;
  END IF;

  -- Device fingerprints -> users (allow NULL for anonymous devices)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_device_fingerprints_user_id'
  ) THEN
    ALTER TABLE device_fingerprints
      ADD CONSTRAINT fk_device_fingerprints_user_id
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE SET NULL;
  END IF;

  -- Trial fraud flags -> users
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_trial_fraud_flags_user_id'
  ) THEN
    ALTER TABLE trial_fraud_flags
      ADD CONSTRAINT fk_trial_fraud_flags_user_id
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE;
  END IF;

  -- Trial usage -> free trial tokens
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_trial_usage_token_id'
  ) THEN
    ALTER TABLE trial_usage
      ADD CONSTRAINT fk_trial_usage_token_id
      FOREIGN KEY (token_id) REFERENCES free_trial_tokens(token_id)
      ON DELETE CASCADE;
  END IF;

  -- Trial usage -> users
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_trial_usage_user_id'
  ) THEN
    ALTER TABLE trial_usage
      ADD CONSTRAINT fk_trial_usage_user_id
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE;
  END IF;

  -- Payment verifications -> users
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_payment_verifications_user_id'
  ) THEN
    ALTER TABLE payment_verifications
      ADD CONSTRAINT fk_payment_verifications_user_id
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE;
  END IF;

  -- Login sessions -> users
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_login_sessions_user_id'
  ) THEN
    ALTER TABLE login_sessions
      ADD CONSTRAINT fk_login_sessions_user_id
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE;
  END IF;

  -- Refresh tokens -> users
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_refresh_tokens_user_id'
  ) THEN
    ALTER TABLE refresh_tokens
      ADD CONSTRAINT fk_refresh_tokens_user_id
      FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Add check constraints for data integrity
ALTER TABLE free_trial_tokens
  DROP CONSTRAINT IF EXISTS check_reports_remaining,
  ADD CONSTRAINT check_reports_remaining
  CHECK (reports_remaining >= 0);

ALTER TABLE free_trial_tokens
  DROP CONSTRAINT IF EXISTS check_trial_dates,
  ADD CONSTRAINT check_trial_dates
  CHECK (expires_at > activated_at);

ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS check_total_cost_positive,
  ADD CONSTRAINT check_total_cost_positive
  CHECK (total_cost >= 0);

ALTER TABLE trial_fraud_flags
  DROP CONSTRAINT IF EXISTS check_fraud_score_range,
  ADD CONSTRAINT check_fraud_score_range
  CHECK (fraud_score >= 0 AND fraud_score <= 100);

ALTER TABLE device_fingerprints
  DROP CONSTRAINT IF EXISTS check_trial_count_positive,
  ADD CONSTRAINT check_trial_count_positive
  CHECK (trial_count >= 0);

ALTER TABLE ascora_jobs
  DROP CONSTRAINT IF EXISTS check_costs_positive,
  ADD CONSTRAINT check_costs_positive
  CHECK (
    (estimated_cost IS NULL OR estimated_cost >= 0) AND
    (actual_cost IS NULL OR actual_cost >= 0) AND
    (invoice_amount IS NULL OR invoice_amount >= 0)
  );

ALTER TABLE ascora_invoices
  DROP CONSTRAINT IF EXISTS check_amounts_positive,
  ADD CONSTRAINT check_amounts_positive
  CHECK (
    (total_amount IS NULL OR total_amount >= 0) AND
    (paid_amount IS NULL OR paid_amount >= 0)
  );

ALTER TABLE ascora_sync_schedules
  DROP CONSTRAINT IF EXISTS check_sync_interval_positive,
  ADD CONSTRAINT check_sync_interval_positive
  CHECK (sync_interval > 0);

-- Add composite unique constraints to prevent duplicates
ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS uq_org_member_user,
  ADD CONSTRAINT uq_org_member_user
  UNIQUE (organization_id, user_id);

ALTER TABLE device_fingerprints
  DROP CONSTRAINT IF EXISTS uq_device_fingerprint,
  ADD CONSTRAINT uq_device_fingerprint
  UNIQUE (fingerprint_hash);

ALTER TABLE ascora_integrations
  DROP CONSTRAINT IF EXISTS uq_ascora_api_url,
  ADD CONSTRAINT uq_ascora_api_url
  UNIQUE (api_url);

-- Add trigger to auto-expire old trials
CREATE OR REPLACE FUNCTION expire_old_trials()
RETURNS trigger AS $$
BEGIN
  UPDATE free_trial_tokens
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < NOW();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_expire_trials ON free_trial_tokens;
CREATE TRIGGER trigger_expire_trials
  AFTER INSERT OR UPDATE ON free_trial_tokens
  FOR EACH STATEMENT
  EXECUTE FUNCTION expire_old_trials();

-- Add trigger to prevent trial reactivation
CREATE OR REPLACE FUNCTION prevent_trial_reactivation()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('expired', 'revoked') AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'Cannot reactivate expired or revoked trial';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_reactivation ON free_trial_tokens;
CREATE TRIGGER trigger_prevent_reactivation
  BEFORE UPDATE ON free_trial_tokens
  FOR EACH ROW
  EXECUTE FUNCTION prevent_trial_reactivation();