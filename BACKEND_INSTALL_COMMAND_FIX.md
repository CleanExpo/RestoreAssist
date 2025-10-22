# Backend Install Command Fix - Action Required

## The Problem

Backend deployment is failing with:
```
Running "install" command: `cd packages/backend && npm install`...
sh: line 1: cd: packages/backend: No such file or directory
Error: Command "cd packages/backend && npm install" exited with 1
```

## Root Cause

The **Install Command** in Vercel dashboard has an unnecessary `cd` prefix:
- ❌ Current: `cd packages/backend && npm install`
- ✅ Should be: `npm install`

Since **Root Directory** is already set to `packages/backend`, Vercel is already in that directory when running the install command. The `cd packages/backend` tries to navigate to `packages/backend/packages/backend` which doesn't exist.

## The Fix (2 Minutes)

### Option 1: Fix in Vercel Dashboard (Recommended)

1. **Go to**: https://vercel.com/unite-group/restore-assist-backend/settings/general

2. **Scroll to**: "Build & Development Settings" section

3. **Find**: "Install Command" field

4. **Current value**: `cd packages/backend && npm install`

5. **Change to**: `npm install`
   - Just type: `npm install`
   - Remove the entire `cd packages/backend && ` prefix

6. **Verify these settings are still correct**:
   - Root Directory: `packages/backend` ✅
   - Build Command: `npm run build` ✅
   - Output Directory: (empty) ✅
   - Node Version: 20.x ✅

7. **Click "Save"**

### Option 2: Try Forced Redeploy First

Sometimes Vercel will respect the `vercel.json` installCommand if you force a clean redeploy:

1. Go to: https://vercel.com/unite-group/restore-assist-backend/deployments
2. Click latest deployment
3. Click "Redeploy"
4. **UNCHECK** "Use existing Build Cache"
5. Click "Redeploy"

If this fails with the same error, use Option 1.

## What Will Happen After Fix

✅ Backend will install dependencies correctly
✅ TypeScript will compile successfully
✅ Backend API will deploy and be accessible
✅ Frontend can make API calls through `/api` proxy

## Verify After Fix

Once deployed (status: Ready):

```bash
curl https://backend-e03gm60ws-unite-group.vercel.app/api/health

# Should return:
# {"status":"healthy","timestamp":"2025-10-23T..."}
```

## Summary

- **Problem**: Install Command has wrong `cd` prefix
- **Solution**: Remove `cd packages/backend && ` from Install Command
- **Location**: Backend project → Settings → General → Build & Development Settings
- **Takes**: 30 seconds to fix

**This is the LAST blocker for deployment!** 🚀
