# Trial Activation Deployment Guide

## Overview
This guide explains how to deploy the trial activation system with **graceful degradation** - the system works even without Stripe configured, but provides full fraud protection when properly set up.

## Deployment Modes

### Mode 1: Basic Deployment (No Stripe) ✅ WORKS NOW
**Use Case:** Development, testing, or initial deployment without payment processing

**Requirements:**
- PostgreSQL database with basic tables:
  - `users` (with Google OAuth columns)
  - `free_trial_tokens` (REQUIRED - core trial tracking)
  - `login_sessions` (for session management)

**What Works:**
- ✅ User signup via Google OAuth
- ✅ Account creation
- ✅ Basic trial activation (7 days, 3 reports)
- ✅ Session management

**What's Skipped (with warnings):**
- ⚠️ Payment verification (Stripe not configured)
- ⚠️ Device fingerprinting (optional table)
- ⚠️ Advanced fraud detection (optional tables)

**Environment Variables:**
```bash
# Required
DATABASE_URL=postgresql://user:password@host:5432/database
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
JWT_SECRET=your_jwt_secret

# Not Required (but recommended)
# STRIPE_SECRET_KEY=sk_test_... # Optional - system works without this
```

**Database Migration:**
```sql
-- Minimum required migration
-- Run: packages/backend/src/migrations/001_free_trial_schema_alter.sql
-- This creates:
--   - Google OAuth columns in users table
--   - free_trial_tokens table (REQUIRED)
--   - login_sessions table
```

### Mode 2: Full Production Deployment (With Stripe) 🔒 RECOMMENDED
**Use Case:** Production deployment with fraud protection

**Requirements:**
- All Mode 1 requirements PLUS:
- Stripe account with secret key
- All fraud detection tables created

**What Works:**
- ✅ Everything from Mode 1
- ✅ Payment method verification
- ✅ Device fingerprinting
- ✅ Card reuse detection
- ✅ IP rate limiting
- ✅ Usage pattern analysis
- ✅ Multi-layer fraud scoring
- ✅ Time-based lockouts

**Additional Environment Variables:**
```bash
# Required for full fraud protection
STRIPE_SECRET_KEY=sk_live_your_stripe_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Stripe Product/Price IDs (optional - defaults provided)
STRIPE_PRODUCT_FREE_TRIAL=prod_xxx
STRIPE_PRICE_FREE_TRIAL=price_xxx
STRIPE_PRODUCT_MONTHLY=prod_xxx
STRIPE_PRICE_MONTHLY=price_xxx
STRIPE_PRODUCT_YEARLY=prod_xxx
STRIPE_PRICE_YEARLY=price_xxx
```

**Full Database Migration:**
```sql
-- Complete migration with all fraud tables
-- Run: packages/backend/src/migrations/001_free_trial_schema_alter.sql
-- Creates all tables:
--   1. users (Google OAuth columns)
--   2. free_trial_tokens (REQUIRED)
--   3. device_fingerprints (fraud detection)
--   4. trial_fraud_flags (fraud tracking)
--   5. trial_usage (usage monitoring)
--   6. payment_verifications (card verification)
--   7. login_sessions (session management)
```

## Deployment Steps

### Step 1: Database Setup
1. Ensure PostgreSQL is running
2. Create database if needed:
   ```sql
   CREATE DATABASE restoreassist;
   ```
3. Run migration:
   ```bash
   cd packages/backend
   psql -d restoreassist -f src/migrations/001_free_trial_schema_alter.sql
   ```

### Step 2: Environment Configuration
1. Copy `.env.example` to `.env`
2. Configure required variables (see Mode 1 or Mode 2 above)
3. For Vercel deployment, set environment variables in dashboard

### Step 3: Deploy Backend
```bash
cd packages/backend
npm run build  # Build TypeScript
npm start      # Start server
```

### Step 4: Verify Deployment
Check the health endpoint:
```bash
curl http://localhost:3001/api/trial-auth/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-23T...",
  "services": {
    "googleAuth": true,  // true if GOOGLE_CLIENT_ID configured
    "paymentVerification": false  // false if STRIPE_SECRET_KEY not configured
  }
}
```

### Step 5: Test Trial Activation

#### Test Without Stripe (Mode 1)
```bash
# 1. Login with Google OAuth (get access token)
curl -X POST http://localhost:3001/api/trial-auth/google-login \
  -H "Content-Type: application/json" \
  -d '{"idToken": "your_google_id_token"}'

# 2. Activate trial (should succeed with warnings)
curl -X POST http://localhost:3001/api/trial-auth/activate-trial \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_access_token" \
  -d '{
    "fingerprintHash": "test-fingerprint-hash",
    "deviceData": {"browser": "Chrome", "os": "Windows"}
  }'

# Expected: Success with warning logs about skipped fraud checks
```

#### Test With Stripe (Mode 2)
Same as above, but fraud detection tables will be populated.

## Monitoring

### Warning Logs to Monitor
Watch for these in production:
```
⚠️  Payment verification skipped - Stripe not configured
⚠️  Device fingerprint check skipped (table may not exist)
⚠️  Email validation check skipped (tables may not exist)
⚠️  IP address check skipped (tables may not exist)
```

**Action:** If you see these warnings in production, verify:
1. Stripe keys are configured
2. Database migration ran successfully
3. All tables exist in database

### Success Logs
```
✅ Trial activated successfully for user {userId} ({email})
✅ Subscription created for user {userId} with plan {planType}
```

## Upgrading from Mode 1 to Mode 2

If you deployed in Mode 1 (no Stripe) and want to enable full fraud protection:

1. **Add Stripe Environment Variables:**
   ```bash
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

2. **No Database Migration Needed:**
   - The migration already created all tables
   - Fraud detection will activate automatically

3. **Restart Backend:**
   ```bash
   npm restart
   ```

4. **Verify:**
   ```bash
   curl http://localhost:3001/api/trial-auth/health
   # Should now show: "paymentVerification": true
   ```

## Rollback Plan

If issues occur after deployment:

### Rollback Code
```bash
git revert HEAD  # Revert the trial activation changes
npm run build
npm restart
```

### Emergency Mode (Allow All Signups)
If you need to temporarily disable fraud checks entirely:
1. **Don't do this** - the current code already has graceful fallbacks
2. Instead, check warning logs to identify the issue
3. Fix configuration rather than disabling features

## Database Tables

### Required Table (MUST exist for basic functionality)
- `free_trial_tokens` - Stores trial activation status

### Recommended Tables (for session management)
- `users` - User accounts (with Google OAuth columns)
- `login_sessions` - Active user sessions

### Optional Tables (for fraud protection - Mode 2 only)
- `device_fingerprints` - Track devices for reuse detection
- `trial_fraud_flags` - Log fraud indicators
- `trial_usage` - Track report generation patterns
- `payment_verifications` - Store payment method validations

## Troubleshooting

### Users Can't Sign Up
1. Check Google OAuth credentials are valid
2. Verify `users` table exists
3. Check database connection string

### Trial Activation Fails
1. Verify `free_trial_tokens` table exists
2. Check database user has INSERT permissions
3. Review error logs for specific SQL errors

### Warnings About Missing Tables
1. **Expected in Mode 1** - ignore if Stripe not configured
2. **Unexpected in Mode 2** - run migration again
3. Check table existence:
   ```sql
   \dt  -- List all tables
   ```

### Stripe Errors
1. Verify `STRIPE_SECRET_KEY` is set correctly
2. Check key starts with `sk_test_` (test) or `sk_live_` (production)
3. Test Stripe connection:
   ```bash
   curl http://localhost:3001/api/trial-auth/health
   # Check "paymentVerification" field
   ```

## Performance Considerations

### Mode 1 (No Stripe)
- **Faster signup** - No external API calls to Stripe
- **Lower latency** - Fewer database queries (optional tables skipped)
- **Higher risk** - No fraud protection

### Mode 2 (With Stripe)
- **Slower signup** - Stripe API calls add latency (~200-500ms)
- **More database queries** - All fraud checks run
- **Lower risk** - Full fraud protection enabled

**Recommendation:** Use Mode 2 in production for better security.

## Security Checklist

- [ ] `JWT_SECRET` is strong and random (>32 characters)
- [ ] Google OAuth credentials are production-ready (not development)
- [ ] Stripe uses live keys (`sk_live_`) in production
- [ ] Database uses SSL connection in production
- [ ] All environment variables stored securely (Vercel secrets, not .env)
- [ ] Database backups configured
- [ ] Fraud detection tables created and indexed
- [ ] Monitoring/alerting set up for warning logs

## Summary

| Feature | Mode 1 (No Stripe) | Mode 2 (With Stripe) |
|---------|-------------------|---------------------|
| User Signup | ✅ Works | ✅ Works |
| Trial Activation | ✅ Basic | ✅ Full |
| Payment Verification | ⚠️ Skipped | ✅ Active |
| Fraud Detection | ⚠️ Basic | ✅ Advanced |
| Production Ready | ⚠️ Risk | ✅ Secure |
| Setup Complexity | 🟢 Simple | 🟡 Moderate |

**Recommendation:**
- Development/Testing: Use Mode 1
- Production: Use Mode 2
