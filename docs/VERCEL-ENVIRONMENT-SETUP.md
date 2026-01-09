# Vercel Environment Setup for Database Migrations

## Problem

Database migrations were not being applied to production because the **DIRECT_URL** environment variable was missing from Vercel. This caused user registration failures when the migration included new required columns.

## Solution

### Required Environment Variables in Vercel

Both variables are required for migrations to work with Supabase's pooled connections:

| Variable | Value | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | `postgresql://postgres:[PASSWORD]@db.XXXXX.supabase.co:6543/postgres` | **Pooled connection** (for app runtime) |
| `DIRECT_URL` | `postgresql://postgres:[PASSWORD]@db.XXXXX.supabase.co:5432/postgres` | **Direct connection** (for migrations only) |

### Key Differences

- **DATABASE_URL (port 6543)**: Pooled connection - use this for application queries
- **DIRECT_URL (port 5432)**: Direct connection - Prisma uses this ONLY for schema migrations
- Migrations MUST use the direct connection because pooled connections don't support DDL statements

### How to Set Variables in Vercel

1. Go to Vercel Project Settings
2. Navigate to Environment Variables
3. Add both DATABASE_URL and DIRECT_URL with your Supabase credentials

### Verifying Setup

**Check if migrations are pending:**
```bash
curl "https://restoreassist.app/api/admin/deploy-migrations?token=YOUR_ADMIN_SECRET"
```

**Deploy pending migrations:**
```bash
curl -X POST "https://restoreassist.app/api/admin/deploy-migrations?token=YOUR_ADMIN_SECRET"
```

Replace `YOUR_ADMIN_SECRET` with the value of `ADMIN_MIGRATION_SECRET` environment variable.

### Build Process

The build script now includes migration deployment:

```bash
"build": "prisma generate && next build && npx prisma migrate deploy --skip-generate"
```

This ensures migrations run after the application builds but before deployment completes.

## Testing

After setting up environment variables:

1. **Test user registration** - Try creating a new account with email/password
2. **Check migration status** - Call the diagnostic endpoint above
3. **Monitor logs** - Check Vercel deployment logs for `prisma migrate deploy` output

## Troubleshooting

**Error: "Authentication failed against database server"**
- Verify DIRECT_URL credentials are correct
- Check that the password doesn't have special characters (if so, URL-encode them)
- Confirm the Supabase database is accessible from Vercel

**Error: "The column X does not exist"**
- Migrations haven't been deployed yet
- Call the `/api/admin/deploy-migrations` endpoint to manually deploy
- Check DIRECT_URL is set in Vercel environment

**Migrations applied but app still crashes**
- Run `npx prisma generate` locally to regenerate client
- Commit the generated files if needed
- Redeploy to Vercel

## Migration History

Critical migrations that must be deployed:
- `20260109_add_premium_inspection_reports` - Adds `hasPremiumInspectionReports` boolean column
- Other regulatory and feature migrations

## Next Steps

1. ✅ Set DIRECT_URL in Vercel production environment
2. ✅ Trigger a new deployment (push code or click "Redeploy")
3. ✅ Verify migrations run during build with `npx prisma migrate deploy`
4. ✅ Test user registration with email/password
5. ✅ Test Google OAuth sign-in

---

**Last Updated**: 2026-01-10
**Related**: CLAUDE.md, ENVIRONMENT.md
