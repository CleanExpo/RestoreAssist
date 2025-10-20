# Potential Vercel Deployment Issues - Risk Assessment

## High Priority Issues (Likely to Occur)

### 🔴 Issue 1: Missing Environment Variables
**Likelihood**: 95%
**Impact**: CRITICAL - Deployment will fail or throw runtime errors
**Symptoms**:
- 500 Internal Server Error on all endpoints
- "JWT_SECRET is undefined" errors
- "Cannot connect to database" errors

**Pre-Deployment Fix**:
```bash
# Go to Vercel Dashboard → Settings → Environment Variables
# Add ALL required variables for Production, Preview, Development:

NODE_ENV=production
DATABASE_URL=postgresql://...?sslmode=require
JWT_SECRET=<32+ character secret>
JWT_REFRESH_SECRET=<32+ character secret>
ANTHROPIC_API_KEY=sk-ant-api03-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SENDGRID_API_KEY=SG....
ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app
```

**Testing**:
```bash
# After deployment, test health endpoint
curl https://your-backend.vercel.app/api/health

# If you see "healthy", environment is loaded correctly
# If you see 500 error, check Runtime Logs for missing vars
```

---

### 🔴 Issue 2: Database Not Migrated
**Likelihood**: 90%
**Impact**: HIGH - Runtime errors when querying database
**Symptoms**:
- "relation 'users' does not exist"
- "column 'severity' does not exist"
- SQL errors in Runtime Logs

**Pre-Deployment Fix**:
```bash
# Connect to production database and run migrations
psql $DATABASE_URL -f packages/backend/src/db/migrations/001_create_subscriptions.sql
psql $DATABASE_URL -f packages/backend/src/db/migrations/002_fix_subscription_constraint.sql

# Or if using Prisma:
cd packages/backend
npx prisma migrate deploy
```

**Testing**:
```bash
TOKEN="<your-admin-token>"

curl https://your-backend.vercel.app/api/admin/stats \
  -H "Authorisation: Bearer $TOKEN"

# Should return user/report stats
# If "relation does not exist", migrations not run
```

---

### 🟡 Issue 3: Serverless Cold Start Performance
**Likelihood**: 100% (expected behavior)
**Impact**: MEDIUM - User experience issue
**Symptoms**:
- First request takes 5-10 seconds
- Subsequent requests are fast (<500ms)
- Timeout errors on first request after idle period

**Understanding**:
This is **normal serverless behavior**, not a bug:
1. Function spins down after ~5 minutes of inactivity
2. Next request triggers "cold start" (boot time)
3. Function stays "warm" for subsequent requests

**Mitigation Options**:
1. **Accept it** - Most users won't notice (one slow request/session)
2. **Upgrade to Pro** - Keeps functions warmer longer
3. **Keep-alive ping** - Cron job hits endpoint every 4 minutes
4. **Loading indicator** - Show "Initializing..." on first load

**Testing**:
```bash
# Wait 5 minutes, then:
time curl https://your-backend.vercel.app/api/health
# First: ~5-10 seconds

# Immediately run again:
time curl https://your-backend.vercel.app/api/health
# Second: <500ms
```

---

### 🟡 Issue 4: AI Report Generation Timeouts
**Likelihood**: 70% on Hobby plan
**Impact**: HIGH - Core feature broken
**Symptoms**:
- "Function execution timed out after 10.00 seconds"
- Report generation fails mid-process
- Works locally but fails on Vercel

**Root Cause**:
Vercel Hobby plan has **10-second timeout** for serverless functions.
Claude AI report generation can take 10-20 seconds.

**Evidence from your code**:
```typescript
// packages/backend/src/services/claudeService.ts
async generateReport(request: ReportRequest): Promise<GeneratedReport> {
  // This makes an API call to Anthropic Claude
  // Can take 10-20 seconds depending on complexity
  const response = await this.client.messages.create({...});
  // ↑ This might timeout on Vercel Hobby
}
```

**Solutions**:

**Option A: Upgrade to Vercel Pro** (Recommended)
- 60-second timeout limit
- Cost: $20/month per team member
- Immediate fix, no code changes

**Option B: Optimize for 10s limit**
```typescript
// Use streaming response to start faster
const response = await this.client.messages.create({
  stream: true,  // ← Start responding immediately
  max_tokens: 2000  // ← Reduce token limit (faster)
});
```

**Option C: Move to background jobs**
```typescript
// Queue the report generation
POST /api/reports/generate
→ Returns: { jobId: "abc123", status: "processing" }

// Poll for completion
GET /api/reports/status/abc123
→ Returns: { status: "complete", reportId: "xyz789" }
```

**Testing**:
```bash
TOKEN="<your-token>"

time curl -X POST https://your-backend.vercel.app/api/reports/generate \
  -H "Authorisation: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "propertyAddress": "123 Test St",
    "damageType": "water",
    "description": "Burst pipe caused extensive water damage throughout first floor including kitchen, living room, and bathroom. Carpet saturated, drywall swelling, ceiling water stains visible."
  }'

# If it times out after 10s → Need Pro plan or optimization
# If it completes → You're good!
```

---

## Medium Priority Issues (Possible)

### 🟡 Issue 5: CORS Configuration
**Likelihood**: 60%
**Impact**: MEDIUM - Frontend can't communicate with backend
**Symptoms**:
- "CORS policy: No 'Access-Control-Allow-Origin' header"
- Requests work in Postman/curl but fail in browser
- Network tab shows CORS preflight (OPTIONS) failing

**Root Cause**:
Your backend CORS middleware:
```typescript
// packages/backend/src/index.ts:32-38
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorisation'],
  optionsSuccessStatus: 204
}));
```

If `ALLOWED_ORIGINS` is missing or incorrect, frontend will be blocked.

**Pre-Deployment Fix**:
```bash
# In Vercel environment variables:
ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app,https://your-frontend.vercel.app

# Include:
# - Production domain
# - www subdomain
# - Vercel preview domains (if testing)
```

**Testing**:
```javascript
// In browser console at https://restoreassist.app
fetch('https://your-backend.vercel.app/api/health', {
  credentials: 'include'
})
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)

// Success: JSON response
// Failure: CORS error in console
```

---

### 🟡 Issue 6: Database Connection Pool Exhaustion
**Likelihood**: 40%
**Impact**: HIGH - Random failures under load
**Symptoms**:
- "Too many connections to database"
- "Connection pool timeout"
- Works initially, fails after multiple requests

**Root Cause**:
Serverless functions create new database connections.
Without proper pooling, connections accumulate.

**Your DATABASE_URL should include**:
```
postgresql://user:pass@host:5432/db?sslmode=require&connection_limit=5&pool_timeout=10
```

**Pre-Deployment Fix**:
```bash
# Update DATABASE_URL in Vercel environment variables:
DATABASE_URL=postgresql://user:pass@host:5432/restoreassist?sslmode=require&connection_limit=5&pool_timeout=10&connect_timeout=10

# Key parameters:
# - sslmode=require → Force SSL
# - connection_limit=5 → Max 5 connections per instance
# - pool_timeout=10 → Wait 10s for connection
# - connect_timeout=10 → Fail after 10s
```

**Testing**:
```bash
# Make 20 concurrent requests
for i in {1..20}; do
  curl -s https://your-backend.vercel.app/api/health &
done
wait

# All should succeed
# If some fail with "connection" errors → Pool exhaustion
```

---

### 🟡 Issue 7: Prisma Client Not Generated
**Likelihood**: 30%
**Impact**: CRITICAL - All database queries fail
**Symptoms**:
- "Cannot find module '@prisma/client'"
- "PrismaClient is not a constructor"
- Build succeeds but runtime fails

**Root Cause**:
Prisma Client needs to be generated after `npm install`.

**Check if you need**:
```bash
# Look for postinstall script
cat packages/backend/package.json | grep postinstall
```

**If missing, add**:
```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

**Testing**:
```bash
TOKEN="<your-token>"

curl https://your-backend.vercel.app/api/admin/stats \
  -H "Authorisation: Bearer $TOKEN"

# Success: Returns stats
# Failure: "Cannot find module @prisma/client"
```

---

## Low Priority Issues (Unlikely)

### 🟢 Issue 8: Stripe Webhook Signature Verification
**Likelihood**: 20%
**Impact**: MEDIUM - Webhook events not processed
**Symptoms**:
- Subscriptions created in Stripe but not in database
- Webhook logs in Stripe show delivery but "400 Bad Request"
- "Webhook signature verification failed"

**Root Cause**:
Webhook secret in environment doesn't match Stripe dashboard.

**Pre-Deployment Fix**:
1. Go to Stripe Dashboard → Webhooks
2. Find your webhook endpoint
3. Click "Signing secret" to reveal: `whsec_...`
4. Copy to Vercel environment variables as `STRIPE_WEBHOOK_SECRET`

**Testing**:
```bash
# In Stripe Dashboard → Webhooks
# Click "Send test webhook"
# Select "customer.subscription.created"

# Check Vercel Runtime Logs for:
✓ "Webhook signature verified"
✗ "Webhook signature verification failed"
```

---

### 🟢 Issue 9: SendGrid Email Delivery
**Likelihood**: 15%
**Impact**: LOW - Emails not sent but app works
**Symptoms**:
- No emails received after signup/subscription
- No errors in logs
- SendGrid dashboard shows 0 sends

**Root Cause**:
SendGrid API key invalid or email not verified.

**Pre-Deployment Fix**:
```bash
# Test SendGrid API key locally
curl -X POST https://api.sendgrid.com/v3/mail/send \
  -H "Authorization: Bearer $SENDGRID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "personalizations": [{"to": [{"email": "test@example.com"}]}],
    "from": {"email": "noreply@restoreassist.com"},
    "subject": "Test",
    "content": [{"type": "text/plain", "value": "Test email"}]
  }'

# Success: 202 Accepted
# Failure: 401 Unauthorized or 403 Forbidden
```

**Testing**:
```bash
# Trigger a subscription and check SendGrid dashboard
# Or check Runtime Logs for:
✓ "Email sent successfully"
✗ "SendGrid error: 401"
```

---

## Issue Priority Matrix

```
High Impact + High Likelihood (Fix IMMEDIATELY):
┌─────────────────────────────────────────┐
│ 🔴 Missing Environment Variables        │
│ 🔴 Database Not Migrated                │
│ 🟡 AI Timeout (if using Hobby plan)     │
└─────────────────────────────────────────┘

High Impact + Medium Likelihood (Fix BEFORE launch):
┌─────────────────────────────────────────┐
│ 🟡 CORS Configuration                   │
│ 🟡 Database Connection Pool             │
└─────────────────────────────────────────┘

Medium Impact + Low Likelihood (Fix IF encountered):
┌─────────────────────────────────────────┐
│ 🟢 Stripe Webhook Verification          │
│ 🟢 SendGrid Email Delivery              │
│ 🟢 Prisma Client Generation             │
└─────────────────────────────────────────┘

Low Impact + Any Likelihood (Expected behavior):
┌─────────────────────────────────────────┐
│ 🟢 Cold Start Performance               │
└─────────────────────────────────────────┘
```

---

## Recommended Pre-Deployment Checklist

Before triggering Vercel deployment, complete these:

### Must Complete (Blockers)
- [ ] Set all Tier 1 environment variables (NODE_ENV, DATABASE_URL, JWT_SECRET, etc.)
- [ ] Run database migrations on production database
- [ ] Verify DATABASE_URL includes `?sslmode=require&connection_limit=5`
- [ ] Set ALLOWED_ORIGINS to include production frontend domain
- [ ] Verify Stripe secrets match Stripe dashboard

### Should Complete (Recommended)
- [ ] Test local build: `cd packages/backend && npm run build`
- [ ] Verify environment variables set for ALL environments (Production, Preview, Development)
- [ ] Set up Stripe webhook endpoint in Stripe dashboard
- [ ] Verify SendGrid API key is valid
- [ ] Check if using Hobby or Pro plan (for timeout expectations)

### Nice to Have (Optional)
- [ ] Set up Sentry project and add DSN
- [ ] Configure Google OAuth redirect URIs
- [ ] Set up monitoring/alerting
- [ ] Create database backups

---

## What to Do When Deployment Fails

### Step 1: Capture the Error
- [ ] Screenshot the Vercel deployment error
- [ ] Copy full build log from Vercel dashboard
- [ ] Note the exact commit SHA that failed

### Step 2: Check Build Logs
```
Look for these patterns:

"Error: No Output Directory" → vercel.json issue (already fixed)
"TypeScript compilation failed" → Run `npm run build` locally
"Module not found" → Missing dependency in package.json
"Environment variable undefined" → Check Settings → Environment Variables
```

### Step 3: Check Runtime Logs
```
Vercel Dashboard → Your Project → Runtime Logs

Look for:
"Cannot connect to database" → DATABASE_URL issue
"JWT_SECRET is undefined" → Missing environment variable
"Operation timed out" → Function execution limit (10s on Hobby)
"Too many connections" → Database pool exhaustion
```

### Step 4: Test Locally with Production Config
```bash
# Copy production environment variables to .env.production
# Then test:
NODE_ENV=production node packages/backend/dist/index.js

# If it works locally but fails on Vercel:
# → Environment variable mismatch
# → Vercel-specific issue (cold start, timeout, etc.)
```

### Step 5: Rollback if Needed
```bash
# In Vercel Dashboard:
Deployments → Find last working deployment → Promote to Production

# Or via Git:
git revert HEAD
git push origin main
```

---

## Success Criteria

Deployment is **successful** when all these pass:

✅ Build completes without errors
✅ Health endpoint returns 200 OK
✅ Authentication works (login returns JWT token)
✅ Database queries work (admin stats endpoint succeeds)
✅ No CORS errors when frontend calls backend
✅ No errors in Vercel Runtime Logs (first 5 minutes)

If all these pass, you're **production-ready**! 🎉

---

**Last Updated**: 2025-10-21
**Risk Assessment Version**: 1.0
**Based on**: RestoreAssist architecture analysis
