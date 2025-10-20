# Vercel Deployment - Diagnostic Reference Guide

**Date:** October 21, 2025
**Project:** RestoreAssist Backend & Frontend
**Branch:** Drop-In-Claude-Orchestrator

---

## File Inventory

### Vercel Configuration Files

| File | Path | Purpose | Status |
|------|------|---------|--------|
| Backend Config | `packages/backend/vercel.json` | Build & deploy rules | ✅ Correct |
| Frontend Config | `packages/frontend/vercel.json` | Frontend build rules | ✅ Correct |
| Backend Ignores | `packages/backend/.vercelignore` | Files to exclude from deploy | ✅ Correct |
| Backend Project Link | `packages/backend/.vercel/project.json` | Links to Vercel cloud | ✅ Set |
| Frontend Project Link | `packages/frontend/.vercel/project.json` | Links to Vercel cloud | ✅ Set |

### Serverless Function Files

| File | Path | Purpose | Status |
|------|------|---------|--------|
| Main Handler | `packages/backend/api/index.js` | Express app loader | ✅ Ready |
| Test Endpoint | `packages/backend/api/test.js` | Diagnostics endpoint | ✅ Ready |
| Hello Endpoint | `packages/backend/api/hello.js` | Minimal test | ✅ Ready |

### Source Code

| File | Path | Status | Notes |
|------|------|--------|-------|
| Express App | `packages/backend/src/index.ts` | ✅ Fixed | Async error handling added |
| Auth Service | `packages/backend/src/services/authService.ts` | ✅ Fixed | Type corrections |
| Subscription Service | `packages/backend/src/services/subscriptionService.ts` | ✅ Fixed | Stripe status mapping fixed |
| Stripe Routes | `packages/backend/src/routes/stripeRoutes.ts` | ✅ Fixed | Type corrections |
| UUID Utility | `packages/backend/src/utils/uuid.ts` | ✅ Created | Uses native crypto |
| DB Connection | `packages/backend/src/db/connection.ts` | ✅ Fixed | Lazy loading for serverless |

### Build Output

| Path | Purpose | Expected After Build |
|------|---------|----------------------|
| `packages/backend/dist/` | Compiled TypeScript | Created by `npm run build` → `tsc` |
| `packages/backend/dist/index.js` | Compiled main app | Loaded by `api/index.js` |
| `packages/backend/dist/**/*` | All compiled modules | All .ts files become .js |

---

## Configuration Details

### Backend vercel.json

**Location:** `packages/backend/vercel.json`

```json
{
  "buildCommand": "npm run build && npm run vercel:prepare",
  "functions": {
    "api/*.js": {
      "memory": 1024,
      "maxDuration": 10
    }
  }
}
```

**Key Points:**
- `buildCommand`: Compiles TypeScript and verifies build
- `functions`: Defines serverless function configuration
- `memory: 1024`: 1GB RAM per function
- `maxDuration: 10`: 10 second timeout

### Frontend vercel.json

**Location:** `packages/frontend/vercel.json`

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Key Points:**
- `framework: vite`: Tells Vercel to use Vite
- `rewrites`: SPA routing - all 404s go to index.html
- `outputDirectory: dist`: Where Vite outputs built files

---

## Environment Variables Checklist

### All 26 Variables Required for Production

#### Core (4 Required)
```
☑️ NODE_ENV=production
☑️ ANTHROPIC_API_KEY=sk-...
☑️ JWT_SECRET=your-super-secret-key-change-in-production
☑️ JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
```

#### JWT Config (2 Optional - Has Defaults)
```
☑️ JWT_EXPIRY=15m
☑️ JWT_REFRESH_EXPIRY=7d
```

#### Stripe (9 Required for Payments)
```
☑️ STRIPE_SECRET_KEY=sk_live_...
☑️ STRIPE_PUBLISHABLE_KEY=pk_live_...
☑️ STRIPE_PRODUCT_FREE_TRIAL=prod_TGdTtgqCXY34na
☑️ STRIPE_PRODUCT_MONTHLY=prod_TGdXM0eZiBxmfW
☑️ STRIPE_PRODUCT_YEARLY=prod_TGdZP6UNZ8ONMh
☑️ STRIPE_PRICE_FREE_TRIAL=price_1SK6CHBY5KEPMwxdjZxT8CKH
☑️ STRIPE_PRICE_MONTHLY=price_1SK6GPBY5KEPMwxd43EBhwXx
☑️ STRIPE_PRICE_YEARLY=price_1SK6I7BY5KEPMwxdC451vfBk
☑️ STRIPE_WEBHOOK_SECRET=whsec_Jqc8nVBJCUl1KgVVrgmcpmr0oLqHkfVa
```

#### Database (8 Optional - Uses In-Memory if not set)
```
☑️ USE_POSTGRES=true (or false)
☑️ SUPABASE_URL=https://...supabase.co
☑️ SUPABASE_ANON_KEY=eyJhbG...
☑️ SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
☑️ DB_HOST=db.oxeiaavuspvpvanzcrjc.supabase.co
☑️ DB_PORT=5432
☑️ DB_NAME=postgres
☑️ DB_PASSWORD=your-password
```

#### Google OAuth (2 Optional)
```
☑️ GOOGLE_CLIENT_ID=...
☑️ GOOGLE_CLIENT_SECRET=...
```

#### CORS (1 Required)
```
☑️ ALLOWED_ORIGINS=https://restoreassist.app,https://www.restoreassist.app,https://restore-assist-frontend.vercel.app
```

---

## Build Process Flow

### When You Redeploy on Vercel

```
1. Vercel clones your Git repository
                    ↓
2. [CRITICAL] Checks Root Directory setting
   → If NOT set to packages/backend: ❌ FAILS
   → If set to packages/backend: ✅ Continues
                    ↓
3. [CRITICAL] Checks Framework Preset
   → If set to Next.js: ❌ FAILS (wrong structure)
   → If set to Other: ✅ Continues
                    ↓
4. Runs build command: npm run build && npm run vercel:prepare
   → Executes: tsc (TypeScript compilation)
   → Creates: packages/backend/dist/
   → Creates: All .js files from .ts files
                    ↓
5. Discovers serverless functions in api/*.js
   → Finds: api/index.js
   → Finds: api/test.js
   → Finds: api/hello.js
                    ↓
6. Deploys functions to Vercel edge network
   → Each .js file becomes a serverless function
   → Sets memory and timeout from vercel.json
                    ↓
7. Deployment complete
   → URLs available at *.vercel.app/api/*
```

### Critical Decision Points Where It Can Fail

**Point 1: Root Directory Check**
- If Root Directory = `.` → Vercel looks for `api/` at repo root → NOT FOUND → ❌ FAIL
- If Root Directory = `packages/backend` → Vercel looks for `api/` there → FOUND → ✅ OK

**Point 2: Function Discovery**
- If Framework = `Next.js` → Looks for `pages/api/` → NOT FOUND → ❌ FAIL
- If Framework = `Other` → Uses vercel.json patterns → FOUND → ✅ OK

**Point 3: Build Command**
- If build command fails → No dist/ folder → api/index.js can't load app → ❌ FAIL
- If build command succeeds → dist/ exists → api/index.js loads successfully → ✅ OK

---

## Testing Sequence

### Test 1: Ultra-Minimal (No Dependencies)

**Endpoint:** `GET https://restore-assist-backend.vercel.app/api/hello`

**Expected Response (200):**
```json
{
  "message": "Hello from Vercel!"
}
```

**What this tests:**
- Vercel can execute ANY function at all
- Node.js runtime is working
- Vercel routing is working

**If this fails:** Vercel configuration is wrong (Root Directory or Framework Preset)

---

### Test 2: Standalone Diagnostic Endpoint

**Endpoint:** `GET https://restore-assist-backend.vercel.app/api/test`

**Expected Response (200):**
```json
{
  "status": "ok",
  "message": "Vercel serverless function is working correctly",
  "timestamp": "2025-10-21T...",
  "runtime": {
    "nodeVersion": "v20.x",
    "platform": "linux"
  },
  "environment": {
    "NODE_ENV": "production",
    "hasAnthropicKey": true,
    "hasJwtSecret": true,
    "hasStripeKey": true
  }
}
```

**What this tests:**
- Standalone functions work
- Environment variables are loaded
- No initialization dependencies

**If this fails but hello works:** There's an issue with the test.js file specifically

---

### Test 3: Express App Loaded

**Endpoint:** `GET https://restore-assist-backend.vercel.app/api/health`

**Expected Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-21T...",
  "environment": "production"
}
```

**What this tests:**
- TypeScript compilation succeeded (dist/index.js exists)
- api/index.js successfully loaded the compiled app
- Express server is running
- Health check route responds

**If this fails but test works:** Issue with Express app loading from dist/

---

### Test 4: Authentication

**Endpoint:** `POST https://restore-assist-backend.vercel.app/api/auth/login`

**Request:**
```bash
curl -X POST https://restore-assist-backend.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@restoreassist.com",
    "password": "admin123"
  }'
```

**Expected Response (200):**
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "user": {
    "id": "...",
    "email": "admin@restoreassist.com",
    "role": "admin"
  }
}
```

**What this tests:**
- Authentication service working
- JWT token generation working
- Database connection working (if USE_POSTGRES=true)

---

### Test 5: Stripe Webhook

**From Vercel Dashboard:**
1. Go to https://vercel.com/unite-group/restore-assist-backend
2. Click "Deployments" → Latest deployment
3. Click "Runtime Logs" tab
4. Look for function invocations

**From Stripe Dashboard:**
1. Go to https://dashboard.stripe.com/test/webhooks
2. Find your webhook endpoint
3. Click "Send a test webhook"
4. Choose event type: `checkout.session.completed`
5. Click "Send test event"
6. Check Vercel Runtime Logs for the webhook handler execution

**What this tests:**
- Webhook is receiving events
- Event processing is working
- Subscription system is functional

---

## Debugging Checklist

### If Deployment Fails in Build Phase

Check Vercel Build Logs for:

```
☑️ "npm install" completed successfully
☑️ "tsc" completed without errors
☑️ "npm run vercel:prepare" executed
☑️ dist/ folder created
☑️ dist/index.js exists (check artifacts)
```

### If Deployment Succeeds but APIs Fail

Check Vercel Runtime Logs:

```
☑️ Call to GET /api/hello → Should see: "Hello from Vercel!"
☑️ Call to GET /api/test → Should see diagnostics
☑️ Call to GET /api/health → Should see health status
☑️ Check error messages for hints about what's failing
```

### If Some APIs Work, Others Fail

```
☑️ Verify specific route exists in src/routes/
☑️ Verify route is registered in src/index.ts
☑️ Verify route doesn't depend on database if USE_POSTGRES=false
☑️ Check request/response middleware
☑️ Check authentication middleware
```

---

## Common Error Messages & Solutions

### Error: "INTERNAL_FUNCTION_INVOCATION_FAILED"

**Cause:** Vercel cannot execute ANY function
**Most Likely:** Root Directory not set to `packages/backend`
**Solution:**
1. Dashboard → Settings → General
2. Set Root Directory to `packages/backend`
3. Redeploy

### Error: "Cannot find module '../dist/index'"

**Cause:** TypeScript didn't compile to dist/ folder
**Most Likely:** Build command failed silently
**Solution:**
1. Check Build Logs in Vercel Dashboard
2. Look for TypeScript errors in build output
3. Fix errors in source code
4. Redeploy

### Error: "Cannot find module 'express'"

**Cause:** node_modules not installed in build
**Most Likely:** npm install didn't run or failed
**Solution:**
1. Check Build Logs for npm errors
2. Verify package.json syntax is correct
3. Check package-lock.json is up to date
4. Manually redeploy

### Error: "ECONNREFUSED" on database queries

**Cause:** Database connection failed
**Most Likely:** USE_POSTGRES=true but connection timeout
**Solution:**
1. Set USE_POSTGRES=false for testing
2. Redeploy to confirm other APIs work
3. Then troubleshoot database connection
4. Check SUPABASE_URL and credentials

### Error: "Missing environment variable: STRIPE_SECRET_KEY"

**Cause:** Environment variable not set in Vercel
**Solution:**
1. Dashboard → Settings → Environment Variables
2. Add missing variable
3. Redeploy

---

## File References

### Key Code Files

**Backend Express App:**
```
packages/backend/src/index.ts
├── Line ~10: Express app creation
├── Line ~30: Routes registration
├── Line ~50: Error handler
└── Line ~60: Server startup
```

**API Handler:**
```
packages/backend/api/index.js
├── Line ~5: NODE_ENV setup
├── Line ~10: Diagnostics function
├── Line ~45: Express app loading
├── Line ~69: Request handler export
└── Line ~87: Error response with diagnostics
```

**Auth Service:**
```
packages/backend/src/services/authService.ts
├── Used by: /api/auth/login
├── Used by: /api/auth/register
├── Used by: /api/auth/refresh
└── Uses: JWT secrets from env
```

**Subscription Service:**
```
packages/backend/src/services/subscriptionService.ts
├── Used by: /api/stripe/webhook
├── Uses: STRIPE_SECRET_KEY from env
└── Updates: Database with subscription info
```

---

## Recent Fixes Applied

### Commit: 2bed699
**Message:** Fix all uuid ES Module imports - replace with native crypto.randomUUID()

**Files Changed:**
- `src/services/authService.ts` - Uses crypto instead of uuid
- `src/services/reportService.ts` - Uses crypto instead of uuid
- `src/services/subscriptionService.ts` - Uses crypto instead of uuid
- `src/utils/uuid.ts` - New utility using native crypto

### Commit: bd9b4ce
**Message:** Fix Vercel deployment - replace uuid package with crypto.randomUUID()

**Files Changed:**
- Updated package.json build dependencies

### Commit: 49adf82
**Message:** Add error handling to Vercel serverless entry point

**Files Changed:**
- `api/index.js` - Enhanced error handling and diagnostics

### Commit: 897c098
**Message:** Fix serverless crash - implement lazy database connection loading

**Files Changed:**
- `src/db/connection.ts` - Proxy pattern for lazy loading

### Commit: 421806d
**Message:** Fix TypeScript build errors for production deployment

**Files Changed:**
- `src/config/stripe.ts` - Type corrections
- `src/routes/stripeRoutes.ts` - Type corrections
- `src/services/subscriptionService.ts` - Type corrections

---

## Dashboard Navigation

### To Check Root Directory Setting

1. Go to: https://vercel.com/dashboard
2. Click: "restore-assist-backend" project
3. Click: Settings tab
4. Click: General (in sidebar)
5. Look for: "Root Directory" field
6. Current should be: `.` or empty
7. Change to: `packages/backend`
8. Click: Save

### To Check Environment Variables

1. Go to: https://vercel.com/dashboard
2. Click: "restore-assist-backend" project
3. Click: Settings tab
4. Click: Environment Variables (in sidebar)
5. You should see: 26+ variables listed
6. Check: All required variables are present
7. If missing: Add them from VERCEL_ENV_VARIABLES.md

### To Check Build Logs

1. Go to: https://vercel.com/dashboard
2. Click: "restore-assist-backend" project
3. Click: Deployments tab
4. Click: Latest deployment
5. Click: "Build Logs" button
6. Look for: npm install, tsc, vercel:prepare steps
7. Check: No errors in output

### To Check Runtime Logs

1. Go to: https://vercel.com/dashboard
2. Click: "restore-assist-backend" project
3. Click: Deployments tab
4. Click: Latest deployment
5. Click: "Runtime Logs" button
6. Make a request to the API
7. Watch logs appear in real-time
8. Look for: Error messages

---

## Documentation Files

### Analysis Documents

| File | Location | Purpose |
|------|----------|---------|
| This file | VERCEL_DIAGNOSTIC_REFERENCE.md | Diagnostic reference |
| Executive Summary | VERCEL_ANALYSIS_EXECUTIVE_SUMMARY.md | High-level overview |
| Full Analysis | VERCEL_DEPLOYMENT_ANALYSIS_REPORT.json | Detailed JSON report |
| Configuration Checklist | VERCEL_CONFIGURATION_CHECKLIST.md | Step-by-step config guide |
| Deployment Analysis | VERCEL_DEPLOYMENT_ANALYSIS.md | Root cause analysis |
| Deployment Status | DEPLOYMENT_STATUS.md | Current status tracking |
| Environment Variables | VERCEL_ENV_VARIABLES.md | All variables documented |

---

## Quick Reference Commands

### Test All Endpoints (in order)

```bash
# Test 1: Ultra-minimal
curl https://restore-assist-backend.vercel.app/api/hello

# Test 2: Diagnostics
curl https://restore-assist-backend.vercel.app/api/test

# Test 3: Health check
curl https://restore-assist-backend.vercel.app/api/health

# Test 4: Authentication
curl -X POST https://restore-assist-backend.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@restoreassist.com","password":"admin123"}'
```

### Check Build Locally

```bash
cd packages/backend
npm install
npm run build
echo "✅ Build successful if no errors above"
```

### Check App Runs Locally

```bash
cd packages/backend
npm run dev
# Should see: 🚀 RestoreAssist Backend running on http://localhost:3001
# Then: curl http://localhost:3001/api/health
```

---

**Last Updated:** October 21, 2025
**Document Type:** Diagnostic Reference
**Completeness:** Comprehensive - All systems documented

