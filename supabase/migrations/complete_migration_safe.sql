-- ========================================
-- RestoreAssist Complete Database Migration (Safe)
-- ========================================
-- This version uses DROP IF EXISTS and CREATE OR REPLACE
-- Safe to run multiple times - idempotent
--
-- Execute this entire file in Supabase SQL Editor
-- ========================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 001: USERS TABLE
-- ========================================

-- Drop existing objects if they exist
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS update_users_updated_at() CASCADE;
DROP INDEX IF EXISTS idx_users_email;
DROP INDEX IF EXISTS idx_users_role;
DROP INDEX IF EXISTS idx_users_created_at;

CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'viewer')),
    company TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- ========================================
-- 002: REPORTS TABLE
-- ========================================

-- Drop existing objects
DROP TABLE IF EXISTS reports CASCADE;
DROP FUNCTION IF EXISTS update_reports_updated_at() CASCADE;

CREATE TABLE reports (
    report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    timestamp TEXT NOT NULL,
    property_address TEXT NOT NULL,
    damage_type TEXT NOT NULL CHECK (damage_type IN ('Water', 'Fire', 'Storm', 'Flood', 'Mold', 'Impact', 'Other')),
    damage_description TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')),
    severity TEXT NOT NULL CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
    urgent BOOLEAN NOT NULL DEFAULT false,
    summary TEXT NOT NULL,
    recommendations JSONB NOT NULL,
    scope_of_work JSONB NOT NULL,
    itemized_estimate JSONB NOT NULL,
    total_cost DECIMAL(12, 2) NOT NULL,
    timeline TEXT NOT NULL,
    compliance_notes JSONB NOT NULL,
    authority_to_proceed TEXT NOT NULL,
    client_name TEXT,
    client_email TEXT,
    client_phone TEXT,
    insurance_company TEXT,
    claim_number TEXT,
    policy_number TEXT,
    assessor_name TEXT,
    generated_by TEXT NOT NULL DEFAULT 'RestoreAssist AI',
    model TEXT NOT NULL,
    created_by_user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_reports_created_at ON reports(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_state ON reports(state) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_damage_type ON reports(damage_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_severity ON reports(severity) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_urgent ON reports(urgent) WHERE deleted_at IS NULL AND urgent = true;
CREATE INDEX idx_reports_total_cost ON reports(total_cost DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_client_name ON reports(client_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_claim_number ON reports(claim_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_created_by ON reports(created_by_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_pagination ON reports(created_at DESC, report_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_search ON reports USING GIN (
    to_tsvector('english',
        coalesce(property_address, '') || ' ' ||
        coalesce(damage_description, '') || ' ' ||
        coalesce(summary, '') || ' ' ||
        coalesce(client_name, '') || ' ' ||
        coalesce(claim_number, '')
    )
) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION update_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reports_updated_at ON reports;
CREATE TRIGGER trigger_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION update_reports_updated_at();

-- ========================================
-- 003: REFRESH TOKENS TABLE
-- ========================================

DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_tokens() CASCADE;

CREATE TABLE refresh_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_revoked ON refresh_tokens(revoked) WHERE revoked = false;

CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM refresh_tokens
    WHERE expires_at < NOW() OR revoked = true;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 004: INTEGRATION SYNC RECORDS TABLE
-- ========================================

DROP TABLE IF EXISTS integration_sync_records CASCADE;
DROP FUNCTION IF EXISTS update_sync_records_updated_at() CASCADE;

CREATE TABLE integration_sync_records (
    sync_id TEXT PRIMARY KEY,
    report_id UUID NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
    integration_type TEXT NOT NULL CHECK (integration_type IN ('servicem8', 'xero', 'myob')),
    external_job_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'syncing', 'synced', 'failed')),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    sync_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_records_report_id ON integration_sync_records(report_id);
CREATE INDEX idx_sync_records_external_job_id ON integration_sync_records(external_job_id);
CREATE INDEX idx_sync_records_status ON integration_sync_records(status);
CREATE INDEX idx_sync_records_integration_type ON integration_sync_records(integration_type);
CREATE INDEX idx_sync_records_created_at ON integration_sync_records(created_at DESC);

CREATE OR REPLACE FUNCTION update_sync_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_records_updated_at ON integration_sync_records;
CREATE TRIGGER trigger_sync_records_updated_at
    BEFORE UPDATE ON integration_sync_records
    FOR EACH ROW
    EXECUTE FUNCTION update_sync_records_updated_at();

-- ========================================
-- 005: DRIVE FILE RECORDS TABLE
-- ========================================

DROP TABLE IF EXISTS drive_file_records CASCADE;

CREATE TABLE drive_file_records (
    record_id TEXT PRIMARY KEY,
    report_id UUID NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
    drive_file_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('docx', 'pdf')),
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    uploaded_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX idx_drive_files_report_id ON drive_file_records(report_id);
CREATE INDEX idx_drive_files_drive_file_id ON drive_file_records(drive_file_id);
CREATE INDEX idx_drive_files_uploaded_by ON drive_file_records(uploaded_by);
CREATE INDEX idx_drive_files_uploaded_at ON drive_file_records(uploaded_at DESC);
CREATE INDEX idx_drive_files_format ON drive_file_records(format);

-- ========================================
-- 006: GOOGLE DRIVE AUTH TABLE
-- ========================================

DROP TABLE IF EXISTS google_drive_auth CASCADE;
DROP FUNCTION IF EXISTS update_google_drive_auth_updated_at() CASCADE;

CREATE TABLE google_drive_auth (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date BIGINT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_google_drive_auth_email ON google_drive_auth(email);
CREATE INDEX idx_google_drive_auth_expiry ON google_drive_auth(expiry_date);

CREATE OR REPLACE FUNCTION update_google_drive_auth_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_google_drive_auth_updated_at ON google_drive_auth;
CREATE TRIGGER trigger_google_drive_auth_updated_at
    BEFORE UPDATE ON google_drive_auth
    FOR EACH ROW
    EXECUTE FUNCTION update_google_drive_auth_updated_at();

-- ========================================
-- 007: ROW LEVEL SECURITY POLICIES
-- ========================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_file_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_drive_auth ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can create users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

-- Users policies
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Admins can view all users" ON users FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid()::text AND role = 'admin'));
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id AND role = (SELECT role FROM users WHERE user_id = auth.uid()::text));
CREATE POLICY "Admins can create users" ON users FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid()::text AND role = 'admin'));
CREATE POLICY "Admins can delete users" ON users FOR DELETE USING (EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid()::text AND role = 'admin'));

-- Drop existing report policies
DROP POLICY IF EXISTS "Users can view reports" ON reports;
DROP POLICY IF EXISTS "Authenticated users can create reports" ON reports;
DROP POLICY IF EXISTS "Users can update own reports" ON reports;
DROP POLICY IF EXISTS "Users can delete own reports" ON reports;

-- Reports policies
CREATE POLICY "Users can view reports" ON reports FOR SELECT USING (deleted_at IS NULL AND (EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid()::text AND role = 'admin') OR created_by_user_id = auth.uid()::text OR EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid()::text AND role = 'viewer')));
CREATE POLICY "Authenticated users can create reports" ON reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own reports" ON reports FOR UPDATE USING (deleted_at IS NULL AND (created_by_user_id = auth.uid()::text OR EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid()::text AND role = 'admin')));
CREATE POLICY "Users can delete own reports" ON reports FOR DELETE USING (created_by_user_id = auth.uid()::text OR EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid()::text AND role = 'admin'));

-- Drop existing refresh token policies
DROP POLICY IF EXISTS "Users can view own tokens" ON refresh_tokens;
DROP POLICY IF EXISTS "Users can create own tokens" ON refresh_tokens;
DROP POLICY IF EXISTS "Users can delete own tokens" ON refresh_tokens;

-- Refresh tokens policies
CREATE POLICY "Users can view own tokens" ON refresh_tokens FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY "Users can create own tokens" ON refresh_tokens FOR INSERT WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY "Users can delete own tokens" ON refresh_tokens FOR DELETE USING (user_id = auth.uid()::text);

-- Drop existing sync record policies
DROP POLICY IF EXISTS "Users can view sync records" ON integration_sync_records;
DROP POLICY IF EXISTS "Authenticated users can create sync records" ON integration_sync_records;
DROP POLICY IF EXISTS "Users can update sync records" ON integration_sync_records;

-- Integration sync records policies
CREATE POLICY "Users can view sync records" ON integration_sync_records FOR SELECT USING (EXISTS (SELECT 1 FROM reports WHERE reports.report_id = integration_sync_records.report_id AND (reports.created_by_user_id = auth.uid()::text OR EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid()::text AND role IN ('admin', 'viewer')))));
CREATE POLICY "Authenticated users can create sync records" ON integration_sync_records FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update sync records" ON integration_sync_records FOR UPDATE USING (EXISTS (SELECT 1 FROM reports WHERE reports.report_id = integration_sync_records.report_id AND reports.created_by_user_id = auth.uid()::text));

-- Drop existing drive file policies
DROP POLICY IF EXISTS "Users can view drive files" ON drive_file_records;
DROP POLICY IF EXISTS "Authenticated users can create drive files" ON drive_file_records;
DROP POLICY IF EXISTS "Users can delete own drive files" ON drive_file_records;

-- Drive file records policies
CREATE POLICY "Users can view drive files" ON drive_file_records FOR SELECT USING (EXISTS (SELECT 1 FROM reports WHERE reports.report_id = drive_file_records.report_id AND (reports.created_by_user_id = auth.uid()::text OR EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid()::text AND role IN ('admin', 'viewer')))));
CREATE POLICY "Authenticated users can create drive files" ON drive_file_records FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete own drive files" ON drive_file_records FOR DELETE USING (uploaded_by = auth.uid()::text);

-- Drop existing Google Drive auth policies
DROP POLICY IF EXISTS "Users can view own drive auth" ON google_drive_auth;
DROP POLICY IF EXISTS "Users can create own drive auth" ON google_drive_auth;
DROP POLICY IF EXISTS "Users can update own drive auth" ON google_drive_auth;
DROP POLICY IF EXISTS "Users can delete own drive auth" ON google_drive_auth;

-- Google Drive auth policies
CREATE POLICY "Users can view own drive auth" ON google_drive_auth FOR SELECT USING (user_id = auth.uid()::text);
CREATE POLICY "Users can create own drive auth" ON google_drive_auth FOR INSERT WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY "Users can update own drive auth" ON google_drive_auth FOR UPDATE USING (user_id = auth.uid()::text);
CREATE POLICY "Users can delete own drive auth" ON google_drive_auth FOR DELETE USING (user_id = auth.uid()::text);

-- ========================================
-- 008: SEED DEFAULT USERS
-- ========================================

INSERT INTO users (user_id, email, password, name, role, created_at, updated_at)
VALUES (
    'user-default-admin',
    'admin@restoreassist.com',
    '$2b$10$nOUIs5kJ7naTuTFkBy1veuK0kSxUFXfuaT6/KzBsHNiKxWp7oCZqW',
    'Admin User',
    'admin',
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (user_id, email, password, name, role, company, created_at, updated_at)
VALUES (
    'user-default-demo',
    'demo@restoreassist.com',
    '$2b$10$N9qo8uLOickgx2ZMRZoMye5d8bKxBvvBfJN1LqZCT.ZUF5SIcBkq2',
    'Demo User',
    'user',
    'RestoreAssist Demo',
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

-- ========================================
-- MIGRATION COMPLETE
-- ========================================
-- Tables created: 6
-- Default users: 2
--   - admin@restoreassist.com / admin123
--   - demo@restoreassist.com / demo123
-- ========================================
