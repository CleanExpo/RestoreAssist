# RestoreAssist Supabase Quick Start Guide

## 🚀 Quick Setup (5 minutes)

### Step 1: Copy Complete Migration

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **SQL Editor**
4. Click **New Query**
5. Copy and paste the entire contents of `complete_migration.sql`
6. Click **Run** (or press Ctrl+Enter)

✅ **Done!** All tables, indexes, policies, and default users are now created.

### Step 2: Verify Setup

Run this query in SQL Editor:

```sql
-- Check all tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Should return:
-- drive_file_records
-- google_drive_auth
-- integration_sync_records
-- refresh_tokens
-- reports
-- users
```

### Step 3: Test Default Users

```sql
-- View default users
SELECT user_id, email, role FROM users;

-- Should show:
-- admin@restoreassist.com (admin)
-- demo@restoreassist.com (user)
```

### Step 4: Get Connection Details

In Supabase Dashboard → Settings → Database:

```bash
# Add to your .env file
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Or direct PostgreSQL connection
DATABASE_URL=postgresql://postgres:[password]@db.xxxxxxxxxxxxx.supabase.co:5432/postgres
```

## 📋 Database Schema Overview

### Tables Created

| Table | Purpose | Rows (Initial) |
|-------|---------|----------------|
| `users` | Authentication & profiles | 2 (admin, demo) |
| `reports` | AI damage assessments | 0 |
| `refresh_tokens` | JWT token storage | 0 |
| `integration_sync_records` | ServiceM8 sync tracking | 0 |
| `drive_file_records` | Google Drive uploads | 0 |
| `google_drive_auth` | OAuth tokens | 0 |

### Features Enabled

✅ **Row Level Security (RLS)** - All tables protected
✅ **Full-Text Search** - GIN index on reports
✅ **Soft Deletes** - Reports can be recovered
✅ **Auto Timestamps** - `updated_at` automatically maintained
✅ **Foreign Keys** - Data integrity enforced
✅ **Composite Indexes** - Optimized queries

## 🔐 Default Login Credentials

**Admin Account:**
```
Email: admin@restoreassist.com
Password: admin123
```

**Demo Account:**
```
Email: demo@restoreassist.com
Password: demo123
```

⚠️ **Change these passwords immediately in production!**

## 🧪 Test Queries

### Create Test Report

```sql
INSERT INTO reports (
    timestamp,
    property_address,
    damage_type,
    damage_description,
    state,
    severity,
    urgent,
    summary,
    recommendations,
    scope_of_work,
    itemized_estimate,
    total_cost,
    timeline,
    compliance_notes,
    authority_to_proceed,
    model,
    created_by_user_id
) VALUES (
    '2025-01-16T10:00:00Z',
    '123 Main St, Sydney NSW 2000',
    'Water',
    'Burst pipe in ceiling causing water damage',
    'NSW',
    'High',
    true,
    'Significant water damage to ceiling and walls',
    '["Remove damaged ceiling", "Dry affected areas", "Repair plasterboard"]'::jsonb,
    '[{"item": "Ceiling removal", "quantity": "10m²"}]'::jsonb,
    '[{"item": "Labour", "cost": 2000}, {"item": "Materials", "cost": 1500}]'::jsonb,
    3500.00,
    '3-5 business days',
    '["NCC 2022 compliant", "AS 3500.1 plumbing standards"]'::jsonb,
    'Authority to proceed granted',
    'claude-sonnet-4.5',
    'user-default-admin'
);
```

### Query Reports

```sql
-- Get all reports
SELECT
    report_id,
    property_address,
    damage_type,
    severity,
    total_cost,
    created_at
FROM reports
WHERE deleted_at IS NULL
ORDER BY created_at DESC;
```

### Search Reports

```sql
-- Full-text search
SELECT
    property_address,
    damage_type,
    summary
FROM reports
WHERE to_tsvector('english', property_address || ' ' || damage_description)
      @@ to_tsquery('english', 'water & damage')
AND deleted_at IS NULL;
```

## 🔧 Maintenance Tasks

### Cleanup Expired Tokens

```sql
-- Run periodically (daily)
SELECT cleanup_expired_tokens();
```

### Soft Delete Reports

```sql
-- Soft delete (recoverable)
UPDATE reports
SET deleted_at = NOW()
WHERE report_id = 'your-report-id';

-- Recover soft deleted
UPDATE reports
SET deleted_at = NULL
WHERE report_id = 'your-report-id';
```

### Get Database Statistics

```sql
-- Table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Row counts
SELECT
    'users' as table_name, COUNT(*) as rows FROM users
UNION ALL
SELECT 'reports', COUNT(*) FROM reports
UNION ALL
SELECT 'refresh_tokens', COUNT(*) FROM refresh_tokens;
```

## 📚 Next Steps

1. **Update Backend Code**
   - Replace in-memory database with Supabase client
   - Update connection strings
   - Test all endpoints

2. **Configure RLS for Service Role**
   - Service role bypasses RLS by default
   - Use anon key for user-specific queries

3. **Set Up Backups**
   - Enable Point-in-Time Recovery in Supabase
   - Schedule daily backups
   - Test restore procedure

4. **Add Monitoring**
   - Set up error alerts
   - Monitor query performance
   - Track database size

5. **Optimize Queries**
   - Review slow query logs
   - Add indexes as needed
   - Use EXPLAIN ANALYZE

## ⚠️ Important Notes

- **RLS is enabled** - Use service role key carefully
- **Passwords are hashed** - Use bcrypt with 10 rounds
- **Soft deletes** - Reports marked deleted, not removed
- **JSONB columns** - Use for flexible structured data
- **Full-text search** - Optimized for English text

## 🆘 Troubleshooting

**Problem: Cannot insert data**
- Check RLS policies
- Ensure you're authenticated
- Use service role key for testing

**Problem: Slow queries**
- Check index usage: `EXPLAIN ANALYZE your_query;`
- Review table sizes
- Optimize WHERE clauses

**Problem: Connection errors**
- Verify connection string
- Check firewall/IP allowlist
- Confirm project is not paused

## 📞 Support

- Supabase Docs: https://supabase.com/docs
- RestoreAssist Repo: https://github.com/CleanExpo/RestoreAssist
- Check migrations/README.md for detailed documentation
