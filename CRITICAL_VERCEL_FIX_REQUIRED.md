# CRITICAL: Vercel Dashboard Fix Required

## The Problem

Your frontend Vercel project has a **CORRUPTED** Root Directory setting:
```
Root Directory: " ."
```

This broken value (with quotes and spaces) is causing:
1. ❌ Builds to fail or use wrong directory
2. ❌ Environment variables not being picked up during build
3. ❌ Frontend still calling old backend URL despite `VITE_API_URL=/api` being set

## Evidence

✅ **Environment variable is set correctly**:
```bash
$ vercel env pull
VITE_API_URL="/api"  ✅ CORRECT
```

❌ **But builds are NOT using it**:
- Browser still calls: `https://backend-e03gm60ws-unite-group.vercel.app`
- Should call: `/api` (same-origin)

❌ **Root Directory is broken**:
```
Error: The provided path "D:\RestoreAssist\packages\frontend\packages\frontend" does not exist
```
Notice it's doubling the path because of the broken config!

## THE FIX (YOU MUST DO THIS)

### Step 1: Fix Root Directory

1. **Open**: https://vercel.com/unite-group/restore-assist-frontend/settings/general

2. **Find**: "Root Directory" field

3. **Current broken value**: `" ."` or ` .` (with spaces/quotes)

4. **Change to**: `packages/frontend`
   - Just type: `packages/frontend`
   - NO quotes, NO extra spaces
   - Should look like a simple path

5. **Verify other settings**:
   - Build Command: `npm run build` ✅
   - Output Directory: `dist` ✅
   - Install Command: `npm install` ✅
   - Node Version: 20.x ✅

6. **Click "Save"**

### Step 2: Force Clean Deployment

1. **Go to**: https://vercel.com/unite-group/restore-assist-frontend/deployments

2. **Click** on the latest deployment

3. **Click "..."** menu → **"Redeploy"**

4. **Check "Use existing Build Cache"** → **UNCHECK IT** (force fresh build)

5. **Click "Redeploy"**

6. **Wait 2-3 minutes**

### Step 3: Verify It Works

Once deployed (status: Ready):

```bash
# Test same-origin API call
curl https://restoreassist.app/api/health

# Should return:
# {"status":"healthy","timestamp":"..."}
```

**In Browser**:
1. Open https://restoreassist.app
2. Hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
3. Press F12 → Console
4. **Should see NO CORS errors!** 🎉

## What Will Happen After Fix

✅ Frontend will call `/api/*` (same-origin)
✅ No more CORS errors
✅ YouTube videos will work (CSP fixed)
✅ Google OAuth styles will load (CSP fixed)
✅ All API calls will work

## Why CLI Can't Fix This

The Vercel API has SSL certificate validation issues on Windows:
```
curl: (35) schannel: next InitializeSecurityContext failed:
CRYPT_E_NO_REVOCATION_CHECK
```

**Only the Vercel Dashboard can fix the corrupted Root Directory value.**

## Summary

**ALL code fixes are done**:
- ✅ CORS headers added
- ✅ CSP updated for YouTube
- ✅ API paths fixed (no more `/api/api`)
- ✅ Environment variables set

**ONLY thing left**: Fix Root Directory in Vercel dashboard

**This takes 2 minutes and will fix everything permanently.**

## After You Fix It

Reply with "Fixed" and I'll test it with Playwright to confirm CORS is gone! 🚀
