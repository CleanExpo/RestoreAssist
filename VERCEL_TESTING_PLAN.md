# Vercel Deployment Testing Plan

## Overview
This document provides step-by-step testing procedures to verify the Vercel deployment fix and identify any remaining issues.

---

## Phase 1: Pre-Deployment Verification (Local Testing)

### Test 1.1: TypeScript Build Success ✅
**Already Verified** - Build completes without errors.

```bash
cd packages/backend
npm run build
```

**Expected Result**:
- ✅ No TypeScript errors
- ✅ `dist/` folder created
- ✅ `dist/index.js` exists (11KB)

**Actual Result**: ✅ PASSED

---

### Test 1.2: Express App Export Verification ✅
**Already Verified** - App properly exported for serverless.

```bash
tail -5 packages/backend/dist/index.js
```

**Expected Result**:
```javascript
// Export for Vercel serverless
exports.default = app;
```

**Actual Result**: ✅ PASSED

---

### Test 1.3: Local Server Startup
**Run the compiled code locally to ensure it works**:

```bash
cd packages/backend
NODE_ENV=development PORT=3001 node dist/index.js
```

**Expected Result**:
```
🎯 Sentry initialized for development environment
🚀 Server running on port 3001
```

**How to Test**:
```bash
# In another terminal
curl http://localhost:3001/api/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-21T...",
  "environment": "development",
  "uptime": 1.234
}
```

**Status**: ⏳ TO BE TESTED

---

## Phase 2: Vercel Configuration Validation

### Test 2.1: Verify vercel.json Syntax
**Check the configuration is valid JSON**:

```bash
cd packages/backend
cat vercel.json | jq .
```

**Expected Result**: Valid JSON output with no errors

**Status**: ⏳ TO BE TESTED

---

### Test 2.2: Verify Vercel Project Settings

**Go to Vercel Dashboard** → Your Backend Project → Settings → General

**Required Settings**:
- [ ] **Framework Preset**: `Other`
- [ ] **Root Directory**: `packages/backend`
- [ ] **Build Command**: `npm run build && npm run vercel:prepare`
- [ ] **Output Directory**: Leave blank (handled by vercel.json)
- [ ] **Install Command**: `npm install`
- [ ] **Node.js Version**: `20.x`

**Status**: ⏳ TO BE CONFIGURED

---

### Test 2.3: Environment Variables Check

**Go to Vercel Dashboard** → Settings → Environment Variables

**Critical Variables** (must be set for ALL environments):

#### Tier 1: Deployment Blockers
These MUST be set or deployment will fail:

```bash
✅ NODE_ENV=production
✅ DATABASE_URL=postgresql://...
✅ JWT_SECRET=... (min 32 characters)
✅ JWT_REFRESH_SECRET=... (min 32 characters)
✅ ANTHROPIC_API_KEY=sk-ant-api03-...
```

#### Tier 2: Runtime Errors
These won't block deployment but will cause runtime errors:

```bash
⚠️ STRIPE_SECRET_KEY=sk_live_...
⚠️ STRIPE_WEBHOOK_SECRET=whsec_...
⚠️ SENDGRID_API_KEY=SG....
⚠️ ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app
```

#### Tier 3: Optional Features
These enable optional functionality:

```bash
ℹ️ GOOGLE_CLIENT_ID=...
ℹ️ GOOGLE_CLIENT_SECRET=...
ℹ️ SENTRY_DSN=...
ℹ️ SERVICEM8_API_KEY=...
```

**How to Check**:
1. Go to Settings → Environment Variables
2. Verify each variable appears for Production, Preview, and Development
3. Click "eye" icon to verify values (ensure no typos)

**Status**: ⏳ TO BE CONFIGURED

---

## Phase 3: Deployment Testing

### Test 3.1: Trigger Deployment

**Method 1: Automatic** (Recommended)
The fix has already been pushed to GitHub. Vercel should auto-deploy.

**Method 2: Manual**
1. Go to Vercel Dashboard → Deployments
2. Click "..." on latest deployment
3. Click "Redeploy"

**Expected Build Log**:
```
Cloning completed
Installing dependencies...
added 767 packages
> @restore-assist/backend@1.0.0 build
> tsc
Build complete. Dist folder ready.
Building with @vercel/node...
✓ Build completed
Deploying...
✓ Deployment complete
```

**Status**: ⏳ TO BE TESTED

---

### Test 3.2: Deployment Success Indicators

**Check Vercel Dashboard**:
- [ ] Status: ✅ Ready
- [ ] Build time: ~30-40 seconds
- [ ] No errors in build logs
- [ ] Domain assigned: `restore-assist-backend-....vercel.app`

**Status**: ⏳ TO BE TESTED

---

## Phase 4: Post-Deployment Functional Testing

### Test 4.1: Health Endpoint (Unauthenticated)

```bash
curl https://restore-assist-backend-git-main-unite-group.vercel.app/api/health
```

**Expected Response** (200 OK):
```json
{
  "status": "healthy",
  "timestamp": "2025-10-21T05:45:23.456Z",
  "environment": "production",
  "uptime": 12.345
}
```

**Failure Scenarios**:
- ❌ 404 Not Found → Routing issue in vercel.json
- ❌ 500 Internal Server Error → Check Runtime Logs
- ❌ Timeout → Function not starting, check environment variables

**Status**: ⏳ TO BE TESTED

---

### Test 4.2: Authentication Endpoint

```bash
curl -X POST https://restore-assist-backend-git-main-unite-group.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@restoreassist.com","password":"demo123"}'
```

**Expected Response** (200 OK):
```json
{
  "message": "Login successful",
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "user": {
    "userId": "...",
    "email": "demo@restoreassist.com",
    "name": "Demo User",
    "role": "user"
  }
}
```

**Failure Scenarios**:
- ❌ 500 "Database connection failed" → DATABASE_URL incorrect or database unreachable
- ❌ 500 "JWT signing failed" → JWT_SECRET missing or invalid
- ❌ 401 "Invalid credentials" → User doesn't exist in production database

**Status**: ⏳ TO BE TESTED

---

### Test 4.3: Admin Health Endpoint (Authenticated)

**First, get a token** from Test 4.2, then:

```bash
TOKEN="<your-access-token>"

curl https://restore-assist-backend-git-main-unite-group.vercel.app/api/admin/health \
  -H "Authorisation: Bearer $TOKEN"
```

**Expected Response** (200 OK):
```json
{
  "status": "healthy",
  "timestamp": "2025-10-21T05:45:23.456Z",
  "environment": "production",
  "services": {
    "database": "connected",
    "anthropic": "connected",
    "stripe": "configured",
    "sendgrid": "configured"
  }
}
```

**Failure Scenarios**:
- ❌ 401 "Unauthorized" → Token invalid or expired
- ❌ 403 "Forbidden" → User role is not "admin"
- ❌ 500 "Service check failed" → One or more services unreachable

**Status**: ⏳ TO BE TESTED

---

### Test 4.4: Database Connection Test

```bash
TOKEN="<your-admin-token>"

curl https://restore-assist-backend-git-main-unite-group.vercel.app/api/admin/stats \
  -H "Authorisation: Bearer $TOKEN"
```

**Expected Response** (200 OK):
```json
{
  "totalUsers": 5,
  "totalReports": 12,
  "totalSubscriptions": 3,
  "recentActivity": [...]
}
```

**Failure Scenarios**:
- ❌ 500 "Database error" → DATABASE_URL incorrect
- ❌ "relation does not exist" → Migrations not run
- ❌ "SSL required" → DATABASE_URL missing `?sslmode=require`

**Status**: ⏳ TO BE TESTED

---

### Test 4.5: Stripe Integration Test

```bash
TOKEN="<your-access-token>"

curl https://restore-assist-backend-git-main-unite-group.vercel.app/api/subscriptions/create-checkout-session \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorisation: Bearer $TOKEN" \
  -d '{"priceId":"price_1QUt07GgOkOOL0JGTgxIAnCF"}'
```

**Expected Response** (200 OK):
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

**Failure Scenarios**:
- ❌ 500 "Stripe error" → STRIPE_SECRET_KEY invalid
- ❌ "No such price" → STRIPE_PRICE_ID incorrect
- ❌ 401 → Not authenticated

**Status**: ⏳ TO BE TESTED

---

### Test 4.6: CORS Configuration Test

**From your frontend domain**:

```javascript
// In browser console at https://restoreassist.app
fetch('https://restore-assist-backend-git-main-unite-group.vercel.app/api/health', {
  credentials: 'include'
})
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

**Expected Result**:
- ✅ Response received
- ✅ No CORS errors in console

**Failure Scenarios**:
- ❌ "CORS policy: No 'Access-Control-Allow-Origin'" → ALLOWED_ORIGINS missing frontend domain
- ❌ "Credentials flag is 'true'" error → CORS credentials not allowed

**Status**: ⏳ TO BE TESTED

---

## Phase 5: Potential Issues to Watch For

### Issue 5.1: Cold Start Timeouts ⚠️

**Symptom**: First request takes >10 seconds or times out

**Cause**: Serverless functions "cold start" - need to boot up on first request

**Solution**:
- Expected behavior for serverless
- Subsequent requests will be fast (<100ms)
- Consider Vercel Pro for "warm" functions

**How to Test**:
1. Wait 5 minutes with no requests
2. Make a request and time it
3. Immediately make another request and time it

**Expected**:
- First request: 2-10 seconds
- Second request: <500ms

---

### Issue 5.2: Database Connection Pool Exhaustion ⚠️

**Symptom**: "Too many connections" or "Connection pool timeout"

**Cause**: Serverless functions create new database connections, pools can exhaust

**Solution**: Use connection pooling (Prisma handles this, but check your DATABASE_URL)

**Recommended DATABASE_URL format**:
```
postgresql://user:password@host:5432/database?sslmode=require&connection_limit=5&pool_timeout=10
```

**How to Test**:
1. Make 20 concurrent requests
2. Check for connection errors

---

### Issue 5.3: Environment Variable Mismatches ⚠️

**Symptom**: Works in Preview but fails in Production

**Cause**: Environment variables not set for all environments

**Solution**:
1. Go to Settings → Environment Variables
2. For each variable, ensure all 3 checkboxes are checked:
   - [x] Production
   - [x] Preview
   - [x] Development

**How to Test**:
1. Deploy to preview branch
2. Test preview deployment
3. Compare with production

---

### Issue 5.4: Static File Serving ⚠️

**Symptom**: 404 for `/assets/*` or `/public/*` files

**Cause**: Express.js static middleware might not work in serverless

**Check**: Do you need to serve static files from backend?

**Solution**:
- Serve static files from frontend Vercel project instead
- Or use Vercel blob storage for uploads
- Or use S3/CloudFront for static assets

**Status**: ⏳ TO BE INVESTIGATED

---

### Issue 5.5: Long-Running Operations ⏱️

**Symptom**: "Function execution timed out after 10s"

**Cause**: Vercel Hobby plan has 10s max execution time

**Operations that might timeout**:
- Report generation with Claude AI (can take 5-15s)
- Large database queries
- PDF export generation
- Email sending

**Solutions**:
1. **Immediate**: Optimize operations to complete in <10s
2. **Short-term**: Upgrade to Vercel Pro (60s limit)
3. **Long-term**: Move long operations to background jobs (BullMQ + Redis)

**How to Test**:
```bash
TOKEN="<your-token>"

# Test report generation (might timeout on Hobby plan)
time curl -X POST https://restore-assist-backend.vercel.app/api/reports/generate \
  -H "Authorisation: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "propertyAddress": "123 Test St, Sydney NSW 2000",
    "damageType": "water",
    "description": "Extensive water damage from burst pipe"
  }'
```

**Expected**:
- Hobby: Might timeout after 10s
- Pro: Should complete in 10-20s

---

### Issue 5.6: Prisma Schema Sync 🗄️

**Symptom**: "Prisma Client not initialized" or schema mismatch errors

**Cause**: Prisma needs to generate client after `npm install`

**Check if you have**:
```json
// package.json
{
  "scripts": {
    "postinstall": "prisma generate"  // ← Need this?
  }
}
```

**Status**: ⏳ TO BE VERIFIED

---

## Phase 6: Performance & Monitoring

### Test 6.1: Response Time Benchmarks

```bash
# Run 10 requests and average response time
for i in {1..10}; do
  time curl -s -o /dev/null https://restore-assist-backend.vercel.app/api/health
done
```

**Expected Benchmarks**:
- Health endpoint: <200ms (after cold start)
- Authentication: <500ms
- Report generation: 5-15s (depending on complexity)
- Database queries: <1s

---

### Test 6.2: Concurrent Request Handling

```bash
# Use Apache Bench for load testing
ab -n 100 -c 10 https://restore-assist-backend.vercel.app/api/health
```

**Expected**:
- 100 requests, 10 concurrent
- 0 failed requests
- Average response time <500ms

---

### Test 6.3: Sentry Error Tracking

**Trigger an error**:
```bash
curl https://restore-assist-backend.vercel.app/api/admin/stats
# (without token - should 401)
```

**Check Sentry Dashboard**:
- [ ] Error appears in Sentry
- [ ] Stacktrace is readable
- [ ] Environment tagged as "production"
- [ ] User context included (if applicable)

---

## Test Results Summary Template

Copy this table and fill in results:

| Test | Status | Response Time | Notes |
|------|--------|--------------|-------|
| 1.1 TypeScript Build | ✅ PASS | - | No errors |
| 1.2 Export Verification | ✅ PASS | - | Correct export |
| 1.3 Local Server | ⏳ TODO | - | |
| 2.1 vercel.json Valid | ⏳ TODO | - | |
| 2.2 Project Settings | ⏳ TODO | - | |
| 2.3 Environment Variables | ⏳ TODO | - | |
| 3.1 Deployment Trigger | ⏳ TODO | - | |
| 3.2 Deployment Success | ⏳ TODO | - | |
| 4.1 Health Endpoint | ⏳ TODO | | |
| 4.2 Authentication | ⏳ TODO | | |
| 4.3 Admin Health | ⏳ TODO | | |
| 4.4 Database Connection | ⏳ TODO | | |
| 4.5 Stripe Integration | ⏳ TODO | | |
| 4.6 CORS Configuration | ⏳ TODO | | |

---

## Troubleshooting Decision Tree

```
Deployment fails?
├─ Build step fails?
│  ├─ TypeScript errors? → Run `npm run build` locally, fix errors
│  ├─ Module not found? → Check package.json dependencies
│  └─ Out of memory? → Reduce build complexity or upgrade plan
│
├─ "No Output Directory" error?
│  └─ vercel.json incorrect → Already fixed in commit 302e298
│
└─ Build succeeds but runtime fails?
   ├─ Check Runtime Logs in Vercel Dashboard
   ├─ Environment variables missing? → Add in Settings
   ├─ Database connection fails? → Check DATABASE_URL
   ├─ Timeout (>10s)? → Optimize or upgrade to Pro
   └─ CORS errors? → Check ALLOWED_ORIGINS
```

---

## Next Steps After Testing

1. **All tests pass** ✅
   - Document any performance optimizations needed
   - Set up monitoring alerts
   - Create runbook for common issues

2. **Some tests fail** ⚠️
   - Document exact error messages
   - Check Runtime Logs in Vercel
   - Review environment variables
   - Test locally with production env vars

3. **Deployment fails** ❌
   - Capture full build log
   - Verify vercel.json syntax
   - Check Vercel project settings
   - Contact Vercel support if needed

---

**Testing Started**: _______________
**Testing Completed**: _______________
**Tested By**: _______________
**Overall Status**: ⏳ PENDING
