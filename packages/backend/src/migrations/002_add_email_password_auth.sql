-- Add email/password authentication support
-- Created: 2025-10-23

-- Add password_hash column to users table (nullable for backwards compatibility with Google OAuth users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Make google_id nullable since we now support email/password auth too
ALTER TABLE users ALTER COLUMN google_id DROP NOT NULL;

-- Update the email unique constraint to remain
-- (Email is still unique across both auth methods)

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_password_hash ON users(password_hash) WHERE password_hash IS NOT NULL;

COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password for email/password authentication. NULL for Google OAuth users.';
