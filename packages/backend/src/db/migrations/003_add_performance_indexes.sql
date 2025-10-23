-- =====================================================
-- Migration: Add Performance Optimization Indexes
-- Date: 2025-10-23
-- Purpose: Improve query performance and eliminate N+1 problems
-- =====================================================

-- User authentication indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_google_id
  ON users(google_id) WHERE google_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_password_hash
  ON users(password_hash) WHERE password_hash IS NOT NULL;

-- Free trial indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_free_trial_tokens_user_id
  ON free_trial_tokens(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_free_trial_tokens_status
  ON free_trial_tokens(status) WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_free_trial_tokens_expires
  ON free_trial_tokens(expires_at) WHERE status = 'active';

-- Device fingerprinting indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_fingerprints_hash
  ON device_fingerprints(fingerprint_hash);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_fingerprints_user
  ON device_fingerprints(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_fingerprints_blocked
  ON device_fingerprints(is_blocked) WHERE is_blocked = true;

-- Fraud detection composite indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_flags_user_fingerprint
  ON trial_fraud_flags(user_id, fingerprint_hash, created_at DESC)
  WHERE resolved = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_flags_severity
  ON trial_fraud_flags(severity, created_at DESC)
  WHERE resolved = false AND severity IN ('high', 'critical');

-- Login session indexes for rate limiting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_login_sessions_ip_time
  ON login_sessions(ip_address, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_login_sessions_user_time
  ON login_sessions(user_id, created_at DESC);

-- Payment verification indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_verifications_card
  ON payment_verifications(card_fingerprint, user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_verifications_user
  ON payment_verifications(user_id, verification_date DESC);

-- Trial usage tracking indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trial_usage_token
  ON trial_usage(token_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trial_usage_user
  ON trial_usage(user_id, created_at DESC);

-- Ascora integration indexes for N+1 prevention
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ascora_jobs_org_status
  ON ascora_jobs(organization_id, job_status)
  WHERE organization_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ascora_jobs_report
  ON ascora_jobs(report_id)
  WHERE report_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ascora_customers_org_email
  ON ascora_customers(organization_id, email)
  WHERE organization_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ascora_invoices_org_status
  ON ascora_invoices(organization_id, status)
  WHERE organization_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ascora_logs_org_type
  ON ascora_sync_logs(organization_id, sync_type, created_at DESC);

-- Report performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reports_user_created
  ON reports(created_by_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Covering index for common report queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reports_covering
  ON reports(report_id, created_at, total_cost, damage_type, state)
  INCLUDE (property_address, client_name, summary)
  WHERE deleted_at IS NULL;

-- Organization member lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_composite
  ON organization_members(organization_id, user_id, role);

-- Auth attempts monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auth_attempts_monitoring
  ON auth_attempts(ip_address, attempted_at DESC)
  WHERE success = false;

-- Analyze tables after index creation
ANALYZE users;
ANALYZE free_trial_tokens;
ANALYZE device_fingerprints;
ANALYZE trial_fraud_flags;
ANALYZE login_sessions;
ANALYZE payment_verifications;
ANALYZE trial_usage;
ANALYZE reports;
ANALYZE ascora_jobs;
ANALYZE ascora_customers;
ANALYZE ascora_invoices;
ANALYZE ascora_sync_logs;
ANALYZE organization_members;
ANALYZE auth_attempts;