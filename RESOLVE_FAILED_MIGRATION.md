# Resolving Failed Migration on Production

The production database has a failed migration `20251216000000_init` that needs to be resolved before the new migration can be applied.

## Option 1: Mark Failed Migration as Rolled Back (Recommended)

Connect to your production database and run:

```sql
-- Mark the failed migration as rolled back
UPDATE "_prisma_migrations" 
SET "finished_at" = NOW(), 
    "rolled_back_at" = NOW(),
    "logs" = 'Manually rolled back due to idempotent replacement migration'
WHERE "migration_name" = '20251216000000_init' 
  AND "finished_at" IS NULL;
```

## Option 2: Delete Failed Migration Record

If the schema already exists (which it likely does), you can delete the failed migration record:

```sql
-- Delete the failed migration record
DELETE FROM "_prisma_migrations" 
WHERE "migration_name" = '20251216000000_init' 
  AND "finished_at" IS NULL;
```

## Option 3: Use Prisma CLI (if you have database access)

If you have direct access to the production database via Prisma CLI:

```bash
npx prisma migrate resolve --rolled-back 20251216000000_init
```

## After Resolving

Once the failed migration is resolved, the new idempotent migration `20251216111739_init` will apply successfully on the next deployment.

The new migration is fully idempotent and will:
- Skip creating enums/types that already exist
- Skip creating tables that already exist  
- Skip creating indexes that already exist
- Skip creating foreign keys that already exist

This means it's safe to run even if the database already has the schema.
