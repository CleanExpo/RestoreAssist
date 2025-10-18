# RestoreAssist Supabase Migrations

Complete SQL migration files for deploying RestoreAssist to Supabase.

## Overview

This directory contains all SQL migration files needed to set up the RestoreAssist database schema in Supabase.

## Migration Files

Execute these migrations in order:

1. **001_create_users_table.sql** - User authentication and profiles
2. **002_create_reports_table.sql** - AI-generated damage assessment reports
3. **003_create_refresh_tokens_table.sql** - JWT refresh token storage
4. **004_create_integration_sync_records_table.sql** - ServiceM8 sync tracking
5. **005_create_drive_file_records_table.sql** - Google Drive upload tracking
6. **006_create_google_drive_auth_table.sql** - Google OAuth tokens
7. **007_create_rls_policies.sql** - Row Level Security policies
8. **008_seed_default_users.sql** - Default admin and demo users

## Database Schema

### Tables

#### users
- Primary authentication table
- Stores user profiles and roles (admin, user, viewer)
- Password hashing with bcrypt

#### reports
- Core table for damage assessment reports
- Full-text search capability
- Soft delete support
- JSONB fields for structured data

#### refresh_tokens
- JWT refresh token management
- Automatic expiration handling
- Revocation support

#### integration_sync_records
- Track ServiceM8 and other integrations
- Audit trail with JSONB snapshots
- Status tracking (pending, syncing, synced, failed)

#### drive_file_records
- Google Drive upload tracking
- Links reports to Drive files
- Format tracking (DOCX/PDF)

#### google_drive_auth
- OAuth 2.0 token storage per user
- Access and refresh token management
- Automatic expiry tracking

## Supabase Setup Instructions

### Option 1: Using Supabase Dashboard

1. Log in to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to "SQL Editor"
4. Run each migration file in order (001 → 008)
5. Verify tables created in "Table Editor"

### Option 2: Using Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run all migrations
supabase db push

# Or run individually
supabase db execute --file migrations/001_create_users_table.sql
supabase db execute --file migrations/002_create_reports_table.sql
# ... etc
```

### Option 3: Run Complete Migration

Use the provided `complete_migration.sql` file to run all migrations at once:

```sql
-- In Supabase SQL Editor, paste and run complete_migration.sql
```

## Row Level Security (RLS)

All tables have RLS enabled with the following policies:

### Users
- Users can view their own profile
- Admins can view all users
- Users can update their own profile (except role)
- Admins can create/delete users

### Reports
- Admins can view all reports
- Users can view their own reports
- Viewers can view all reports
- Users can create reports
- Users can update/delete their own reports
- Admins can update/delete all reports

### Refresh Tokens
- Users can only access their own tokens

### Integration Sync Records
- Users can view sync records for their reports
- Authenticated users can create sync records

### Drive File Records
- Users can view Drive files for their reports
- Users can delete their own Drive files

### Google Drive Auth
- Users can only access their own OAuth tokens

## Default Users

Two default users are created:

**Admin User:**
- Email: `admin@restoreassist.com`
- Password: `admin123`
- Role: `admin`

**Demo User:**
- Email: `demo@restoreassist.com`
- Password: `demo123`
- Role: `user`

⚠️ **IMPORTANT:** Change these passwords in production!

## Features

### Full-Text Search
Reports table includes GIN index for full-text search on:
- Property address
- Damage description
- Summary
- Client name
- Claim number

### Automatic Timestamps
All tables include automatic `updated_at` timestamp updates via triggers.

### Soft Deletes
Reports table supports soft deletes with `deleted_at` column.

### Composite Indexes
Optimized indexes for:
- Pagination and sorting
- Filtering by state, damage type, severity
- User-specific queries
- Date range queries

## Environment Variables

After setting up the database, configure these environment variables in your backend:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Or use PostgreSQL connection directly
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
```

## Verification

After running migrations, verify the setup:

```sql
-- Check all tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- Check default users exist
SELECT user_id, email, role
FROM users;

-- Check indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

## Rollback

To rollback migrations:

```sql
-- Drop tables in reverse order
DROP TABLE IF EXISTS google_drive_auth CASCADE;
DROP TABLE IF EXISTS drive_file_records CASCADE;
DROP TABLE IF EXISTS integration_sync_records CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_users_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_reports_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_sync_records_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_google_drive_auth_updated_at() CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_tokens() CASCADE;
```

## Support

For issues or questions:
- Check Supabase logs in Dashboard → Logs
- Review RLS policies if access denied
- Verify indexes for performance issues
- Check trigger functions for timestamp issues

## Next Steps

After database setup:

1. Update backend connection strings
2. Test authentication endpoints
3. Verify RLS policies with test users
4. Run integration tests
5. Set up database backups
6. Configure monitoring and alerts
7. Plan for database scaling
