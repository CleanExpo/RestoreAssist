# URGENT: Fix Frontend Vercel Configuration

## The Problem

Your frontend Vercel project has a **BROKEN** Root Directory setting:
- Current: `" ."` (with quotes and space)
- Should be: `packages/frontend` OR empty

This is causing ALL deployments to fail with:
```
The specified Root Directory " ." does not exist
```

## Fix This NOW (2 minutes)

### Go to Frontend Project Settings

1. **Open**: https://vercel.com/unite-group/restore-assist-frontend/settings/general

2. **Find**: "Root Directory" setting

3. **Change to**: `packages/frontend`
   - Or leave it EMPTY and change Build Command instead

4. **Build Command**:
   - If Root Directory is `packages/frontend`: `npm run build`
   - If Root Directory is EMPTY: `cd packages/frontend && npm install && npm run build`

5. **Output Directory**: `dist`

6. **Click "Save"**

### Then Redeploy

1. Go to: https://vercel.com/unite-group/restore-assist-frontend/deployments

2. Click latest deployment (the failed one)

3. Click "Redeploy"

4. Wait 2-3 minutes

## Verify It Works

Once deployed:

```bash
# Test API works (same-origin!)
curl https://restoreassist.app/api/health

# Should return:
# {"status":"healthy",...}
```

**In browser**:
1. Open https://restoreassist.app
2. Press F12 (DevTools)
3. Go to Console tab
4. **Should see NO CORS errors!** 🎉

## What's Already Done

✅ `VITE_API_URL=/api` added to environment variables
✅ Frontend code has CSP fix
✅ Backend has CORS headers
✅ Git has all fixes

## What YOU Need to Do

❌ Fix the Root Directory in Vercel dashboard (can't do via CLI due to SSL cert issue)
❌ Redeploy

**That's literally it. 2 minutes and CORS is fixed forever.**

## Recommended Final Config

**Settings → General:**
- Root Directory: `packages/frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`
- Framework Preset: Vite

**Settings → Environment Variables:**
- ✅ VITE_API_URL = `/api` (already added)
- ✅ VITE_GOOGLE_CLIENT_ID = `292141944467-h0cbhuq8bulddpkruu12pqj938g2md68.apps.googleusercontent.com`
- ✅ VITE_STRIPE_PUBLISHABLE_KEY = (already there)
- ✅ All other VITE_STRIPE_* variables (already there)

## DO THIS NOW

Open Vercel dashboard and fix the Root Directory. That's the ONLY thing blocking you.
