-- Migration: Create Row Level Security (RLS) policies
-- Description: Security policies for all tables
-- Date: 2025-01-16

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_file_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_drive_auth ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- USERS TABLE POLICIES
-- ==============================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON users
    FOR SELECT
    USING (auth.uid()::text = user_id);

-- Admins can view all users
CREATE POLICY "Admins can view all users"
    ON users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE user_id = auth.uid()::text
            AND role = 'admin'
        )
    );

-- Users can update their own profile (except role)
CREATE POLICY "Users can update own profile"
    ON users
    FOR UPDATE
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id AND role = (SELECT role FROM users WHERE user_id = auth.uid()::text));

-- Admins can insert new users
CREATE POLICY "Admins can create users"
    ON users
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE user_id = auth.uid()::text
            AND role = 'admin'
        )
    );

-- Admins can delete users
CREATE POLICY "Admins can delete users"
    ON users
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE user_id = auth.uid()::text
            AND role = 'admin'
        )
    );

-- ==============================================
-- REPORTS TABLE POLICIES
-- ==============================================

-- Users can view reports (admins: all, users: own, viewers: all)
CREATE POLICY "Users can view reports"
    ON reports
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND (
            -- Admins can see all
            EXISTS (
                SELECT 1 FROM users
                WHERE user_id = auth.uid()::text
                AND role = 'admin'
            )
            OR
            -- Users can see their own
            created_by_user_id = auth.uid()::text
            OR
            -- Viewers can see all
            EXISTS (
                SELECT 1 FROM users
                WHERE user_id = auth.uid()::text
                AND role = 'viewer'
            )
        )
    );

-- Authenticated users can create reports
CREATE POLICY "Authenticated users can create reports"
    ON reports
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their own reports, admins can update all
CREATE POLICY "Users can update own reports"
    ON reports
    FOR UPDATE
    USING (
        deleted_at IS NULL
        AND (
            created_by_user_id = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM users
                WHERE user_id = auth.uid()::text
                AND role = 'admin'
            )
        )
    );

-- Users can delete their own reports, admins can delete all
CREATE POLICY "Users can delete own reports"
    ON reports
    FOR DELETE
    USING (
        created_by_user_id = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM users
            WHERE user_id = auth.uid()::text
            AND role = 'admin'
        )
    );

-- ==============================================
-- REFRESH TOKENS TABLE POLICIES
-- ==============================================

-- Users can view their own refresh tokens
CREATE POLICY "Users can view own tokens"
    ON refresh_tokens
    FOR SELECT
    USING (user_id = auth.uid()::text);

-- Users can insert their own refresh tokens
CREATE POLICY "Users can create own tokens"
    ON refresh_tokens
    FOR INSERT
    WITH CHECK (user_id = auth.uid()::text);

-- Users can delete their own refresh tokens
CREATE POLICY "Users can delete own tokens"
    ON refresh_tokens
    FOR DELETE
    USING (user_id = auth.uid()::text);

-- ==============================================
-- INTEGRATION SYNC RECORDS POLICIES
-- ==============================================

-- Users can view sync records for their reports
CREATE POLICY "Users can view sync records"
    ON integration_sync_records
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM reports
            WHERE reports.report_id = integration_sync_records.report_id
            AND (
                reports.created_by_user_id = auth.uid()::text
                OR EXISTS (
                    SELECT 1 FROM users
                    WHERE user_id = auth.uid()::text
                    AND role IN ('admin', 'viewer')
                )
            )
        )
    );

-- Authenticated users can create sync records
CREATE POLICY "Authenticated users can create sync records"
    ON integration_sync_records
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update sync records for their reports
CREATE POLICY "Users can update sync records"
    ON integration_sync_records
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM reports
            WHERE reports.report_id = integration_sync_records.report_id
            AND reports.created_by_user_id = auth.uid()::text
        )
    );

-- ==============================================
-- DRIVE FILE RECORDS POLICIES
-- ==============================================

-- Users can view drive files for their reports
CREATE POLICY "Users can view drive files"
    ON drive_file_records
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM reports
            WHERE reports.report_id = drive_file_records.report_id
            AND (
                reports.created_by_user_id = auth.uid()::text
                OR EXISTS (
                    SELECT 1 FROM users
                    WHERE user_id = auth.uid()::text
                    AND role IN ('admin', 'viewer')
                )
            )
        )
    );

-- Authenticated users can create drive file records
CREATE POLICY "Authenticated users can create drive files"
    ON drive_file_records
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Users can delete their own drive file records
CREATE POLICY "Users can delete own drive files"
    ON drive_file_records
    FOR DELETE
    USING (uploaded_by = auth.uid()::text);

-- ==============================================
-- GOOGLE DRIVE AUTH POLICIES
-- ==============================================

-- Users can view their own Google Drive auth
CREATE POLICY "Users can view own drive auth"
    ON google_drive_auth
    FOR SELECT
    USING (user_id = auth.uid()::text);

-- Users can insert their own Google Drive auth
CREATE POLICY "Users can create own drive auth"
    ON google_drive_auth
    FOR INSERT
    WITH CHECK (user_id = auth.uid()::text);

-- Users can update their own Google Drive auth
CREATE POLICY "Users can update own drive auth"
    ON google_drive_auth
    FOR UPDATE
    USING (user_id = auth.uid()::text);

-- Users can delete their own Google Drive auth
CREATE POLICY "Users can delete own drive auth"
    ON google_drive_auth
    FOR DELETE
    USING (user_id = auth.uid()::text);
