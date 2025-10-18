# Supabase Setup Guide for RestoreAssist Backend

## Overview
This guide will help you connect the RestoreAssist backend to your Supabase PostgreSQL database.

## Prerequisites
- Supabase project created at https://supabase.com
- All migrations successfully applied (see `/supabase/migrations/README.md`)
- Supabase project credentials ready

## Step 1: Get Your Supabase Database Credentials

1. Log in to your Supabase project dashboard
2. Go to **Project Settings** (gear icon) > **Database**
3. Scroll down to **Connection Info** or **Connection String**

You'll find these values:

```
Host: db.[YOUR-PROJECT-REF].supabase.co
Database name: postgres
Port: 5432
User: postgres
Password: [YOUR-DATABASE-PASSWORD]
```

## Step 2: Update Backend Environment Variables

Edit `packages/backend/.env.local` with your Supabase credentials:

```env
# Database Configuration
USE_POSTGRES=true

# Supabase Connection
DB_HOST=db.[YOUR-PROJECT-REF].supabase.co
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=[YOUR-DATABASE-PASSWORD]
DB_POOL_SIZE=20
```

### Alternative: Use Connection String

You can also use the direct connection string format:

```env
SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
```

If using this approach, you'll need to update `src/db/connection.ts` to parse the connection string.

## Step 3: Test the Connection

1. Start the backend server:
```bash
cd packages/backend
npm run dev
```

2. Check the console output for:
```
✅ Database connection successful
✅ Database initialized successfully
```

3. Test the health endpoint:
```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/admin/health
```

## Step 4: Verify Database Access

1. Login to get an access token:
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@restoreassist.com","password":"admin123"}'
```

2. Use the token to fetch reports:
```bash
curl http://localhost:3001/api/reports \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Connection Pooling

The backend uses `pg-promise` with connection pooling configured via:

```typescript
{
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_POOL_SIZE || '20'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
}
```

## Troubleshooting

### Connection Refused
- Verify your Supabase project is active
- Check that the host URL is correct (db.XXXXX.supabase.co)
- Ensure your IP is allowed (Supabase allows all IPs by default)

### Authentication Failed
- Double-check your database password
- Password is found in Supabase Dashboard > Project Settings > Database > Database Password
- You may need to reset it if forgotten

### SSL Connection Issues
If you get SSL errors, you may need to add SSL configuration:

```typescript
// In src/db/connection.ts
const dbConfig = {
  // ... existing config
  ssl: {
    rejectUnauthorized: false
  }
};
```

### Table Not Found
- Ensure all migrations have been applied in Supabase SQL Editor
- Run verification queries from `supabase/verification_queries.sql`
- Check that RLS policies are enabled but not blocking your queries

## Switching Between Supabase and In-Memory

To switch back to in-memory database (for local development):

```env
USE_POSTGRES=false
```

To use Supabase:

```env
USE_POSTGRES=true
```

## Production Deployment

For production, ensure you:

1. Use environment variables (never commit credentials)
2. Enable SSL connections
3. Configure appropriate connection pool size based on your Supabase plan
4. Set up proper RLS policies for multi-tenant access
5. Enable connection pooling through Supabase's built-in pooler if needed

## Next Steps

Once connected:

1. Test report creation via API
2. Verify authentication works with Supabase users table
3. Test ServiceM8 and Google Drive integrations
4. Connect the frontend to the backend API

## Support

- Supabase Docs: https://supabase.com/docs/guides/database
- RestoreAssist Issues: https://github.com/your-repo/issues
