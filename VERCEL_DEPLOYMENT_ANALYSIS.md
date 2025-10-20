# Vercel Deployment Analysis & Resolution Plan

**Status**: In Progress - Root Cause Identified
**Date**: October 20, 2025
**Branch**: Drop-In-Claude-Orchestrator

## Executive Summary

RestoreAssist backend is currently failing to deploy on Vercel with `INTERNAL_FUNCTION_INVOCATION_FAILED` errors. Through systematic analysis, we've identified the root cause: **monorepo path configuration issues**. The application works perfectly locally but Vercel cannot locate the serverless functions in the `packages/backend/api` subdirectory.

## Root Cause Analysis

### Primary Issue: Monorepo Path Resolution ✅ IDENTIFIED

**Problem**: Vercel deploys from repository root (`RestoreAssist/`) but serverless functions are in `packages/backend/api/`. Current configuration attempts fail because Vercel's function discovery doesn't properly handle nested subdirectories.

**Evidence**:
- Root `vercel.json` exists at repository level
- Build command correctly executes: `cd packages/backend && npm install && npm run build`
- Functions configuration references `packages/backend/api/**/*.js`
- TypeScript compiles successfully (✅ tested locally)
- Express app initializes correctly (✅ tested locally)
- Even standalone `api/test.js` (no dependencies) fails on Vercel

### Secondary Issues Fixed ✅

1. **Async Initialization Error Handling** (src/index.ts:59-67)
   - Added try-catch around `authService.initializeDefaultUsers()`
   - Prevents silent failures during cold starts
   - Application continues even if user init fails

2. **TypeScript Compilation Errors**
   - Fixed authorization header type issues (authMiddleware.ts)
   - Fixed token extraction from header arrays (trialAuthRoutes.ts)
   - Fixed Stripe status mapping: 'canceled' vs 'cancelled' (subscriptionService.ts)
   - Build now completes successfully ✅

3. **Enhanced Error Diagnostics** (api/index.js)
   - Added comprehensive initialization logging
   - Included filesystem diagnostics
   - Improved error responses with CORS headers
   - Added actionable troubleshooting hints

4. **Test Endpoint Created** (api/test.js)
   - Minimal serverless function for isolation testing
   - No Express dependencies
   - Environment variable checks
   - Runtime diagnostics

## Files Modified (7 commits)

### Commit 1: `db98955` - TypeScript & Runtime Fixes
- `packages/backend/src/index.ts` - Async initialization error handling
- `packages/backend/src/middleware/authMiddleware.ts` - Header type fixes
- `packages/backend/src/routes/trialAuthRoutes.ts` - Token extraction fix
- `packages/backend/src/services/subscriptionService.ts` - Stripe status fix
- `packages/backend/api/index.js` - Enhanced error handling
- `packages/backend/api/test.js` - New test endpoint

### Commit 2: `54cde12` - Backend Vercel Config
- `packages/backend/vercel.json` - Removed conflicting outputDirectory

### Commit 3: `5b48a81` - Root Vercel Config
- `vercel.json` (root) - Updated paths to reference packages/backend/api

## Proposed Solutions

### Option A: Configure Vercel Root Directory (RECOMMENDED ⭐)

**Approach**: Set Vercel project's "Root Directory" setting to `packages/backend`

**Steps**:
1. Go to Vercel Dashboard → Project Settings
2. Set "Root Directory" to `packages/backend`
3. Vercel will then deploy from that subdirectory
4. Existing `packages/backend/vercel.json` will be used
5. Functions will be found at `api/index.js` and `api/test.js` relative to root

**Pros**:
- ✅ Cleanest solution - no code changes needed
- ✅ Standard monorepo pattern
- ✅ Maintains existing file structure
- ✅ Easy to reverse if needed

**Cons**:
- ⚠️ Requires Vercel dashboard access
- ⚠️ Not version controlled

**Estimated Time**: 5 minutes

### Option B: Restructure to Root-Level API Directory

**Approach**: Move `packages/backend/api/` to root `api/` directory

**Steps**:
1. Move `packages/backend/api/` to `api/` at repository root
2. Update `api/index.js` to reference `packages/backend/dist`
3. Update root `vercel.json` to point to `api/**/*.js`
4. Test deployment

**Pros**:
- ✅ Vercel can easily discover functions
- ✅ Works with existing root-level vercel.json
- ✅ No dashboard configuration needed

**Cons**:
- ⚠️ Breaks monorepo structure conventions
- ⚠️ API and backend logic separated across directories
- ⚠️ Harder to maintain

**Estimated Time**: 15 minutes

### Option C: Use Vercel Build Output API

**Approach**: Custom build script that outputs to `.vercel/output` directory

**Steps**:
1. Create build script that compiles to Vercel's output format
2. Configure proper routing in `.vercel/output/config.json`
3. Update package.json build commands
4. Test deployment

**Pros**:
- ✅ Most flexible and powerful
- ✅ Full control over deployment structure
- ✅ Can optimize for serverless

**Cons**:
- ⚠️ More complex setup
- ⚠️ Requires understanding Vercel Build Output API
- ⚠️ More moving parts to maintain

**Estimated Time**: 2-3 hours

### Option D: Deploy Backend as Separate Vercel Project

**Approach**: Create dedicated Vercel project for backend only

**Steps**:
1. Create new Vercel project linked to this repository
2. Set root directory to `packages/backend`
3. Configure environment variables
4. Update frontend to point to new backend URL
5. Deploy and test

**Pros**:
- ✅ Clean separation of concerns
- ✅ Independent deployment and scaling
- ✅ Easier to manage environment per service

**Cons**:
- ⚠️ Two Vercel projects to manage
- ⚠️ Frontend CORS configuration needed
- ⚠️ Additional DNS/domain setup

**Estimated Time**: 30 minutes

## Recommended Next Step

**Implement Option A** - Configure Vercel Root Directory to `packages/backend`

This is the fastest, cleanest solution that aligns with standard monorepo practices. No code changes required, reversible if needed.

### Implementation Instructions:

1. Log into Vercel Dashboard
2. Navigate to "restore-assist-backend" project
3. Go to Settings → General
4. Find "Root Directory" setting
5. Change from `.` to `packages/backend`
6. Click "Save"
7. Trigger new deployment
8. Test endpoints:
   - `https://restore-assist-backend.vercel.app/api/health`
   - `https://restore-assist-backend.vercel.app/api/test`

## Testing Checklist

Once deployment succeeds:

- [ ] Test health endpoint: `GET /api/health`
- [ ] Test simple endpoint: `GET /api/test`
- [ ] Test authentication: `POST /api/auth/login`
- [ ] Test Stripe webhook (from Stripe dashboard)
- [ ] Test report generation with limits
- [ ] Verify environment variables loaded
- [ ] Check Vercel runtime logs for warnings
- [ ] Monitor cold start performance

## Success Criteria

✅ Health endpoint returns 200 OK
✅ Test endpoint returns runtime diagnostics
✅ Authentication endpoints functional
✅ Stripe webhooks processing correctly
✅ Report generation working (10-15s response time)
✅ No INTERNAL_FUNCTION_INVOCATION_FAILED errors
✅ Build logs show successful TypeScript compilation
✅ Runtime logs show proper initialization

## Additional Improvements for Production

After deployment is stable:

1. **Error Monitoring** - Add Sentry (1 hour)
2. **Rate Limiting** - Implement on Stripe webhooks (2 hours)
3. **Health Check Dashboard** - Visualize uptime (1 hour)
4. **Complete Email Notifications** - Finish 15 TODOs in stripeRoutes.ts (4 hours)
5. **Test Suite** - Add basic tests for payments and auth (1 day)
6. **Analytics Integration** - PostHog or Mixpanel (2 hours)
7. **Performance Monitoring** - Track cold starts and response times (2 hours)

## Technical Details

### Local Testing Results ✅

```bash
$ npm run build
> @restore-assist/backend@1.0.0 build
> tsc
✅ Build successful

$ node dist/index.js
🚀 RestoreAssist Backend running on http://localhost:3001
✅ Default users initialized successfully
✅ Google Drive integration enabled
✅ Google OAuth integration enabled
✅ Stripe payment verification enabled

$ curl http://localhost:3001/api/health
{"status":"healthy","timestamp":"2025-10-20T08:48:12.176Z","environment":"development"}
✅ Health endpoint responding correctly
```

### Vercel Build Configuration

**Current root vercel.json**:
```json
{
  "buildCommand": "cd packages/backend && npm install && npm run build",
  "installCommand": "cd packages/backend && npm install",
  "functions": {
    "packages/backend/api/**/*.js": {
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "rewrites": [
    {"source": "/api/test", "destination": "/packages/backend/api/test"},
    {"source": "/(.*)", "destination": "/packages/backend/api/index"}
  ]
}
```

**Issue**: Functions discovery doesn't work with nested `packages/backend/api` path structure.

**Solution**: Set Vercel Root Directory to `packages/backend`, then use:
```json
{
  "buildCommand": "npm run build",
  "functions": {
    "api/**/*.js": {
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "rewrites": [
    {"source": "/api/test", "dest": "/api/test"},
    {"source": "/(.*)", "dest": "/api/index"}
  ]
}
```

## Support & Resources

- **Vercel Monorepo Docs**: https://vercel.com/docs/monorepos
- **Vercel Serverless Functions**: https://vercel.com/docs/functions/serverless-functions
- **Build Output API**: https://vercel.com/docs/build-output-api/v3

---

**Last Updated**: October 20, 2025
**Next Action**: Configure Vercel Root Directory to `packages/backend`
**Status**: Ready for deployment with dashboard configuration
