# HOTFIX Execution Guide

**Issue**: Ascora migration failed due to missing `organizations` table
**Error**: `ERROR: 42P07: relation "idx_ascora_org" already exists`
**Status**: Database in partially migrated state

---

## 🎯 Quick Fix (5 minutes)

### Step 1: Run the Hotfix SQL Script

**On Development/Staging**:
```bash
# Navigate to project root
cd D:\RestoreAssist

# Run the hotfix script
psql -h [your-db-host] -U [your-db-user] -d [your-database] -f HOTFIX_organizations_and_ascora.sql
```

**Using Supabase Dashboard**:
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy contents of `HOTFIX_organizations_and_ascora.sql`
4. Execute

**What the script does**:
1. ✅ Drops partial Ascora tables (clean slate)
2. ✅ Creates missing `organizations` table
3. ✅ Creates `organization_members` junction table
4. ✅ Creates default organization for testing
5. ✅ Verifies structure

---

### Step 2: Re-run Ascora Migration

**After hotfix completes successfully**:

```bash
# The Ascora migration should now work
psql -h [your-db-host] -U [your-db-user] -d [your-database] -f packages/backend/src/migrations/006_ascora_integration.sql
```

**Expected Output**: No errors, all Ascora tables created

---

### Step 3: Verify Success

```sql
-- Check organizations exists
SELECT * FROM organizations;

-- Check Ascora tables exist
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'ascora%'
ORDER BY tablename;

-- Should see:
-- ascora_customers
-- ascora_integrations
-- ascora_invoices
-- ascora_jobs
-- ascora_sync_logs
-- ascora_sync_schedules

-- Verify foreign keys work
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name LIKE 'ascora%'
    AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;
```

---

## 🔍 Troubleshooting

### If Hotfix Script Fails

**Error: "users table not found"**
```sql
-- Run this first to check users table
SELECT * FROM users LIMIT 1;

-- If users table doesn't exist, you have a bigger problem
-- Run the base migrations first:
psql < supabase/migrations/001_create_users_table.sql
```

**Error: "permission denied"**
```bash
# Make sure you're using a superuser or database owner
psql -h [host] -U postgres -d [database] -f HOTFIX_organizations_and_ascora.sql
```

**Error: "CASCADE drops other objects"**
```sql
-- This means other tables depend on the partial Ascora tables
-- Check what will be dropped:
SELECT
    dependent.relname as table_name
FROM pg_constraint
JOIN pg_class dependent ON dependent.oid = pg_constraint.conrelid
WHERE confrelid IN (
    SELECT oid FROM pg_class
    WHERE relname LIKE 'ascora%'
);

-- If you see important tables, STOP and contact support
```

---

### If Re-running Ascora Migration Fails

**Error: "organizations table not found"**
- The hotfix didn't complete successfully
- Re-run HOTFIX_organizations_and_ascora.sql
- Check error messages

**Error: "table already exists"**
- Some Ascora tables still exist from partial migration
- Run just Step 1 of hotfix (DROP commands)
- Then re-run full hotfix

**Error: "foreign key constraint violation"**
```sql
-- Check if organizations table has rows
SELECT COUNT(*) FROM organizations;

-- If empty, create a default organization:
INSERT INTO organizations (slug, name, owner_id)
SELECT 'default-org', 'Default Org', user_id
FROM users
WHERE role = 'admin'
LIMIT 1;
```

---

## 🚀 Testing After Fix

### Backend API Tests

```bash
# Start backend
cd packages/backend
npm run dev

# Test Ascora status endpoint (will return "not connected" - that's OK)
curl http://localhost:3001/api/organizations/[org-id]/ascora/status

# Expected: 200 OK with status object
# Not Expected: 500 error or "table does not exist"
```

### Database Integrity Check

```sql
-- Run this to verify all foreign keys are valid
DO $$
DECLARE
    invalid_fk_count INTEGER;
BEGIN
    -- This query finds any broken foreign key relationships
    SELECT COUNT(*) INTO invalid_fk_count
    FROM (
        SELECT
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name LIKE 'ascora%'
    ) AS fk_check;

    IF invalid_fk_count = 0 THEN
        RAISE NOTICE 'All foreign keys are valid!';
    ELSE
        RAISE WARNING 'Found % invalid foreign keys', invalid_fk_count;
    END IF;
END $$;
```

---

## 📋 Checklist

Before hotfix:
- [ ] Backup database (`pg_dump`)
- [ ] Confirm you have correct database credentials
- [ ] Check current state with `\dt` in psql

During hotfix:
- [ ] Run HOTFIX_organizations_and_ascora.sql
- [ ] Verify no errors in output
- [ ] Check organizations table exists

After hotfix:
- [ ] Re-run 006_ascora_integration.sql
- [ ] Verify all 6 Ascora tables created
- [ ] Test foreign key constraints
- [ ] Test Ascora API endpoints
- [ ] Check backend starts without errors

---

## 🆘 If Things Go Wrong

### Emergency Rollback

```sql
-- Rollback everything to pre-hotfix state
DROP TABLE IF EXISTS ascora_sync_schedules CASCADE;
DROP TABLE IF EXISTS ascora_sync_logs CASCADE;
DROP TABLE IF EXISTS ascora_invoices CASCADE;
DROP TABLE IF EXISTS ascora_customers CASCADE;
DROP TABLE IF EXISTS ascora_jobs CASCADE;
DROP TABLE IF EXISTS ascora_integrations CASCADE;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP FUNCTION IF EXISTS update_organizations_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_ascora_updated_at() CASCADE;

-- Then restore from backup
psql -h [host] -U [user] -d [database] < backup.sql
```

### Contact Information

If the hotfix fails or causes issues:
1. Check `COMPREHENSIVE_DIAGNOSTIC_REPORT.md` for full context
2. Review error messages carefully
3. Check PostgreSQL logs for details
4. Consult the database-architect agent findings

---

## ✅ Success Criteria

The hotfix is successful when:

1. ✅ `organizations` table exists with proper structure
2. ✅ All 6 Ascora tables created without errors
3. ✅ Foreign keys from Ascora tables → organizations work
4. ✅ Foreign keys from Ascora tables → users work
5. ✅ Foreign keys from Ascora tables → reports work
6. ✅ Backend API starts without database errors
7. ✅ Ascora endpoints respond (even if "not connected")

---

## 📚 Related Documentation

- `COMPREHENSIVE_DIAGNOSTIC_REPORT.md` - Full analysis
- `HOTFIX_organizations_and_ascora.sql` - The actual fix
- `packages/backend/src/migrations/006_ascora_integration.sql` - Ascora migration
- `docs/FEATURE6b_IMPLEMENTATION_COMPLETE.md` - Ascora feature docs

---

**Estimated Time**: 5-10 minutes
**Risk Level**: Low (hotfix is reversible)
**Impact**: Unblocks Ascora integration completely

Good luck! 🚀
