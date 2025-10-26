# Database Migration Instructions for Vercel

## Problem
Your Vercel production database is missing the subscription fields that exist in your local database:
- `subscriptionStatus`
- `subscriptionPlan` 
- `subscriptionId`
- `stripeCustomerId`
- `trialEndsAt`
- `subscriptionEndsAt`
- `creditsRemaining`
- `totalCreditsUsed`
- `lastBillingDate`
- `nextBillingDate`

## Solution Options

### Option 1: Use Prisma DB Push (Recommended)
This is the easiest method for development/production sync:

```bash
# Set your Vercel database URL
export DATABASE_URL="your_vercel_database_url_here"

# Push schema changes directly to database
npx prisma db push

# Generate new Prisma client
npx prisma generate
```

### Option 2: Run Manual Migration SQL
If you prefer to run the migration manually:

```bash
# Make script executable
chmod +x migrate-vercel-db.sh

# Run the migration
./migrate-vercel-db.sh
```

### Option 3: Use Vercel CLI
If you have Vercel CLI installed:

```bash
# Connect to your Vercel project
vercel link

# Run migration through Vercel
vercel env pull
npx prisma db push
```

## Environment Variables Needed

Make sure these are set in your Vercel environment:
- `DATABASE_URL` - Your PostgreSQL connection string
- `DIRECT_URL` - Direct connection URL (optional but recommended)

## Verification

After running the migration, verify it worked by:

1. **Check the database schema:**
   ```sql
   \d "User"
   ```

2. **Test the application:**
   - Try signing up a new user
   - Check if subscription fields are created
   - Verify no more Prisma errors

## Important Notes

- **Backup First**: Always backup your production database before running migrations
- **Test Locally**: Test the migration on a copy of your production data first
- **Monitor**: Watch your Vercel logs during deployment for any errors
- **Rollback Plan**: Keep the old schema in case you need to rollback

## Troubleshooting

If you still get errors:
1. Check Vercel environment variables are set correctly
2. Verify database connection is working
3. Check Prisma client is regenerated after schema changes
4. Look at Vercel function logs for detailed error messages
