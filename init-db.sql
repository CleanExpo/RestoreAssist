-- ================================
-- RestoreAssist Database Initialization
-- ================================
-- This script initializes the PostgreSQL database for Docker deployment
-- It runs automatically when the database container is first created

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE restoreassist TO postgres;

-- Note: Prisma migrations will handle table creation
-- This file is for initial database setup only
