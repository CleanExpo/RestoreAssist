-- Migration: Create users table
-- Description: User authentication and profile management
-- Date: 2025-01-16

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    -- Primary key
    user_id TEXT PRIMARY KEY,

    -- Authentication
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, -- Hashed with bcrypt

    -- Profile
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'viewer')),
    company TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Comments
COMMENT ON TABLE users IS 'RestoreAssist user accounts and profiles';
COMMENT ON COLUMN users.user_id IS 'Unique user identifier (format: user-{timestamp}-{random})';
COMMENT ON COLUMN users.email IS 'User email address (unique)';
COMMENT ON COLUMN users.password IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.role IS 'User role: admin, user, or viewer';
