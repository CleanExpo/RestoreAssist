-- Migration: Seed default users
-- Description: Create default admin and demo users
-- Date: 2025-01-16
-- NOTE: Passwords are hashed with bcrypt (10 rounds)

-- Default admin user
-- Email: admin@restoreassist.com
-- Password: admin123
-- Bcrypt hash: $2b$10$YourHashHere (replace with actual hash)
INSERT INTO users (user_id, email, password, name, role, created_at, updated_at)
VALUES (
    'user-default-admin',
    'admin@restoreassist.com',
    '$2b$10$nOUIs5kJ7naTuTFkBy1veuK0kSxUFXfuaT6/KzBsHNiKxWp7oCZqW', -- Hash of 'admin123'
    'Admin User',
    'admin',
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Default demo user
-- Email: demo@restoreassist.com
-- Password: demo123
-- Bcrypt hash: $2b$10$YourHashHere (replace with actual hash)
INSERT INTO users (user_id, email, password, name, role, company, created_at, updated_at)
VALUES (
    'user-default-demo',
    'demo@restoreassist.com',
    '$2b$10$N9qo8uLOickgx2ZMRZoMye5d8bKxBvvBfJN1LqZCT.ZUF5SIcBkq2', -- Hash of 'demo123'
    'Demo User',
    'user',
    'RestoreAssist Demo',
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Comments
COMMENT ON TABLE users IS 'Default users created: admin@restoreassist.com (admin123) and demo@restoreassist.com (demo123)';
