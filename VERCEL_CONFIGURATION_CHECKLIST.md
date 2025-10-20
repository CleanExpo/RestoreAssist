# Vercel Configuration Checklist

**Status**: CRITICAL - Functions not executing (INTERNAL_FUNCTION_INVOCATION_FAILED)
**Date**: October 20, 2025
**Branch**: Drop-In-Claude-Orchestrator

## Current Situation

All serverless functions (including ultra-minimal test functions with zero dependencies) are failing with `INTERNAL_FUNCTION_INVOCATION_FAILED`. This indicates a Vercel project configuration issue, NOT a code issue.

## Required Vercel Dashboard Settings

### 1. Project Settings → General

**Root Directory**: ✅ MUST BE SET
```
packages/backend
```

**Not** `.` or empty - must be exactly `packages/backend`

### 2. Project Settings → General

**Framework Preset**: ✅ MUST BE SET
```
Other
```

**Not** "Next.js" or any other framework. Our project is Express, not Next.js.

### 3. Build & Development Settings

These should be EMPTY or match vercel.json:

- **Build Command**: Can be empty (vercel.json specifies it)
- **Output Directory**: Can be empty (not used for serverless)
- **Install Command**: Can be empty (defaults to npm install)

### 4. Environment Variables

Verify ALL 26+ environment variables are set:

#### Core Required
- `NODE_ENV` = production
- `ANTHROPIC_API_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

#### Database
- `USE_POSTGRES` = true
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

#### Stripe
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_MONTHLY`
- `STRIPE_PRICE_ID_YEARLY`

#### Google OAuth
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

(See VERCEL_ENV_VARIABLES.md for complete list)

## Verification Tests

After configuring settings, test these endpoints in order:

### Test 1: Ultra-Minimal Function (hello.js)
```bash
curl https://restore-assist-backend.vercel.app/api/hello
```

**Expected Response**:
```json
{"message": "Hello from Vercel!"}
```

**If this fails**: Vercel configuration is wrong (Root Directory or Framework Preset)

### Test 2: Standalone Test Function (test.js)
```bash
curl https://restore-assist-backend.vercel.app/api/test
```

**Expected Response**:
```json
{
  "status": "ok",
  "message": "Vercel serverless function is working correctly",
  "timestamp": "...",
  "runtime": {...},
  "environment": {...}
}
```

**If hello works but test fails**: Minimal issue (unlikely)

### Test 3: Main Express App (index.js)
```bash
curl https://restore-assist-backend.vercel.app/api/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "environment": "production"
}
```

**If test works but health fails**: Check diagnostics in response for dist/ folder issues

## Common Mistakes

### ❌ Wrong Root Directory
```
Root Directory: .
```
**Problem**: Vercel looks for `api/` at repo root, but it's in `packages/backend/api/`

### ❌ Wrong Framework Preset
```
Framework Preset: Next.js
```
**Problem**: Next.js expects `pages/api/` not `api/`

### ❌ Missing Root Directory
```
Root Directory: (empty)
```
**Problem**: Same as setting it to `.`

## How to Fix Configuration

### Option A: Update Existing Project (Recommended)

1. Go to https://vercel.com/dashboard
2. Select "restore-assist-backend" project
3. Click "Settings" → "General"
4. Set "Root Directory" to `packages/backend`
5. Set "Framework Preset" to `Other`
6. Click "Save"
7. Go to "Deployments" tab
8. Click "..." on latest deployment → "Redeploy"
9. Test /api/hello endpoint

### Option B: Create New Vercel Project

If settings can't be saved or keep reverting:

1. Delete existing "restore-assist-backend" project
2. Create new project from GitHub
3. Import "CleanExpo/RestoreAssist" repository
4. **IMPORTANT**: Set configurations during creation:
   - Root Directory: `packages/backend`
   - Framework Preset: `Other`
5. Add all environment variables
6. Deploy
7. Test /api/hello endpoint

## Debugging Checklist

If functions still fail after configuration:

- [ ] Verify Root Directory is EXACTLY `packages/backend` (no trailing slash)
- [ ] Verify Framework Preset is EXACTLY `Other` (not Next.js)
- [ ] Check Deployment → Function logs for actual error messages
- [ ] Verify `/api/hello` returns JSON (simplest possible test)
- [ ] Check Build Logs to ensure TypeScript compiled
- [ ] Verify `dist/` folder was created during build
- [ ] Check Runtime Logs when accessing /api/test for diagnostics
- [ ] Confirm NO .vercelignore is excluding `api/` folder
- [ ] Verify package.json is in `packages/backend/` not repo root

## Expected File Structure (After Build)

```
packages/backend/
├── api/
│   ├── hello.js        ← Ultra-minimal test
│   ├── test.js         ← Standalone test with diagnostics
│   └── index.js        ← Main Express app loader
├── dist/               ← Created by TypeScript build
│   ├── config/
│   ├── routes/
│   ├── services/
│   └── index.js        ← Compiled Express app
├── src/                ← Source TypeScript
├── package.json
├── tsconfig.json
└── vercel.json         ← Build configuration
```

## What We've Already Fixed

✅ TypeScript compilation errors (headers, Stripe status)
✅ Async initialization error handling
✅ Enhanced diagnostics in api/index.js
✅ Added Node.js engine specification (>= 20.x)
✅ Modernized vercel.json (routes → rewrites)
✅ Created test endpoints (hello.js, test.js)
✅ Removed conflicting root vercel.json

## What Needs Dashboard Configuration

❗ Root Directory setting
❗ Framework Preset setting
❗ Environment variables

**These CANNOT be set via code** - they must be configured in Vercel Dashboard.

## Next Steps

1. **Verify Vercel Dashboard Settings** using checklist above
2. **Redeploy** after confirming settings
3. **Test /api/hello** - if this fails, configuration is still wrong
4. **Check logs** in Vercel Dashboard → Deployments → Functions tab
5. **Share logs** if issue persists after configuration verification

## Support Resources

- **Vercel Docs**: https://vercel.com/docs/projects/project-configuration
- **Serverless Functions**: https://vercel.com/docs/functions
- **Framework Detection**: https://vercel.com/docs/frameworks
- **Build Configuration**: https://vercel.com/docs/builds/configure-a-build

---

**Last Updated**: October 20, 2025
**Next Action**: Verify Vercel Dashboard settings match checklist
