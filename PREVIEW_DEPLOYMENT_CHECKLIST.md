# Preview Deployment Checklist

Branch: `merge-frontend-backend`
Status: 🟡 Waiting for Vercel to build...

## Steps to Verify

### 1. Check Vercel Dashboard
1. Go to: https://vercel.com/dashboard
2. Find your RestoreAssist project
3. Look for new deployment from `merge-frontend-backend` branch
4. Wait for status: **"Ready"** ✅

### 2. Get Preview URL
Once deployed, you'll get a preview URL like:
```
https://restoreassist-[hash]-[team].vercel.app
```

### 3. Test Frontend
Open preview URL in browser and check:
- [ ] Homepage loads
- [ ] No console errors (F12 → Console)
- [ ] Assets load correctly
- [ ] Navigation works

### 4. Test Backend API
Test these endpoints on the preview URL:

```bash
# Replace [preview-url] with your actual preview URL

# Test health endpoint
curl https://[preview-url]/api/health

# Expected response:
# {"status":"healthy","timestamp":"...","environment":"production","uptime":...}

# Test CORS is gone (should work from browser console)
# Open https://[preview-url] and run in console:
fetch('/api/health')
  .then(r => r.json())
  .then(console.log)
# Should succeed with no CORS errors!
```

### 5. Test Google OAuth (Important!)
- [ ] Click "Sign in with Google"
- [ ] Should redirect to Google
- [ ] After selecting account, should redirect back
- [ ] Check for any errors in console

**Note:** Google OAuth might fail on preview URL because:
- OAuth redirect URIs are configured for `restoreassist.app`
- Preview URL is `*.vercel.app` (different domain)
- This is EXPECTED and will work once merged to main

### 6. Check for CORS Errors
**Most Important Test:**
- [ ] Open browser DevTools (F12)
- [ ] Go to Console tab
- [ ] Look for any messages containing "CORS" or "Access-Control"
- [ ] Should see NONE! 🎉

### 7. Compare with Current Production
Open both in separate tabs:
- Current: https://restoreassist.app
- Preview: https://[preview-url]

Both should:
- Load at similar speed
- Show same UI
- Have same functionality

But preview should have:
- ✅ NO CORS errors
- ✅ Faster API calls (same-origin)

## Expected Issues on Preview

### Google OAuth Will Fail
**Why:** OAuth is configured for `restoreassist.app`, not `*.vercel.app`
**Solution:** This will work when merged to main and deployed to production domain

### Stripe Webhooks Won't Work
**Why:** Webhooks point to production URL
**Solution:** This will work on production deployment

### Email Sending Might Fail
**Why:** Some email services restrict by domain
**Solution:** Should work on production

## If Preview Looks Good

### Merge to Main
```bash
git checkout main
git merge merge-frontend-backend
git push origin main
```

### Update Vercel Production Deployment
1. Go to Vercel dashboard
2. Select RestoreAssist project
3. Go to Settings → General
4. Verify Build Command: `npm run vercel-build`
5. Verify Root Directory: `./` (project root)
6. Deploy!

### Set Environment Variables
Make sure all env vars from `UNIFIED_DEPLOYMENT.md` are set in Vercel:
- JWT secrets
- Google OAuth credentials
- Stripe keys
- Etc.

## If Preview Has Issues

### Common Problems

#### Build Fails
Check Vercel build logs for:
- Missing dependencies
- TypeScript errors
- Build script issues

#### Frontend Loads But API Fails
- Check `/api/health` endpoint
- Verify backend built correctly
- Check Vercel function logs

#### API Returns 404
- Verify `vercel.json` routes are correct
- Check backend `api/index.js` exists
- Review Vercel deployment structure

## Current Status

Branch pushed: ✅
Waiting for Vercel build: 🟡
Preview URL: [Will appear in Vercel dashboard]

**Next:** Check Vercel dashboard and update this file with preview URL!
