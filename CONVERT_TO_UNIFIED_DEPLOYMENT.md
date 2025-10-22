# Convert Backend Project to Unified Deployment

## Step-by-Step Instructions

### Step 1: Update Project Settings

Go to: https://vercel.com/unite-group/restore-assist-backend/settings/general

**Change these settings:**

1. **Root Directory**
   - Current: `packages/backend`
   - **New**: `.` (just a dot - means project root)

2. **Build Command**
   - Current: `npm run build`
   - **New**: `npm run vercel-build`

3. **Output Directory**
   - **Leave blank** (handled by vercel.json)

4. **Install Command**
   - Should be: `npm install` (usually auto-detected)

### Step 2: Add Frontend Environment Variables

Go to: https://vercel.com/unite-group/restore-assist-backend/settings/environment-variables

**Add these NEW variables** (backend vars are already there):

| Variable Name | Value | Notes |
|--------------|-------|-------|
| `VITE_API_URL` | `/api` | Same-origin API calls |
| `VITE_GOOGLE_CLIENT_ID` | (copy from `packages/frontend/.env.production`) | OAuth client ID |
| `VITE_STRIPE_PUBLISHABLE_KEY` | (copy from `packages/frontend/.env.production`) | Stripe public key |
| `VITE_STRIPE_PRODUCT_FREE_TRIAL` | (copy from `packages/frontend/.env.production`) | Product ID |
| `VITE_STRIPE_PRODUCT_MONTHLY` | (copy from `packages/frontend/.env.production`) | Product ID |
| `VITE_STRIPE_PRODUCT_YEARLY` | (copy from `packages/frontend/.env.production`) | Product ID |
| `VITE_STRIPE_PRICE_FREE_TRIAL` | (copy from `packages/frontend/.env.production`) | Price ID |
| `VITE_STRIPE_PRICE_MONTHLY` | (copy from `packages/frontend/.env.production`) | Price ID |
| `VITE_STRIPE_PRICE_YEARLY` | (copy from `packages/frontend/.env.production`) | Price ID |

**IMPORTANT**: Set all variables to apply to **Production**, **Preview**, and **Development** environments.

### Step 3: Update Google OAuth Redirect URI

**CRITICAL**: Update in Google Cloud Console

1. Go to: https://console.cloud.google.com/apis/credentials
2. Select your OAuth 2.0 Client ID
3. Update **Authorized redirect URIs**:
   - Remove: `https://backend-e03gm60ws-unite-group.vercel.app/api/auth/google/callback`
   - Add: `https://restoreassist.app/api/auth/google/callback`
4. Save

### Step 4: Point Domain to This Project

Go to: https://vercel.com/unite-group/restore-assist-backend/settings/domains

**Add domain:**
1. Click "Add Domain"
2. Enter: `restoreassist.app`
3. Follow DNS configuration instructions (if needed)
4. Add `www.restoreassist.app` as well (optional)

**Note**: If domain is already pointing to another Vercel project, you'll need to remove it from that project first.

### Step 5: Remove Domain from Old Frontend Project

**IF** you have a separate frontend project:

1. Go to that project's domain settings
2. Remove `restoreassist.app` domain
3. This frees it up for the unified project

### Step 6: Redeploy

Go to: https://vercel.com/unite-group/restore-assist-backend/deployments

1. Click on the latest deployment
2. Click the "..." menu
3. Select "Redeploy"
4. Wait for deployment to complete (2-5 minutes)

### Step 7: Verify It Works

Once deployed, test:

```bash
# Test backend API
curl https://restoreassist.app/api/health

# Should return:
# {"status":"healthy","timestamp":"...","environment":"production","uptime":...}
```

**In browser:**
1. Open: https://restoreassist.app
2. Press F12 (DevTools)
3. Go to Console tab
4. **Should see NO CORS errors!** 🎉
5. Try signing in with Google - should work!

## What This Achieves

✅ **Single deployment** - One project serves both frontend and backend
✅ **No CORS issues** - Same-origin API calls (`/api/*`)
✅ **Faster** - No cross-domain overhead
✅ **Simpler** - One set of environment variables
✅ **SendGrid already configured** - Email sending ready

## Rollback Plan

If something goes wrong:

1. Go back to Settings → General
2. Change Root Directory back to `packages/backend`
3. Change Build Command back to `npm run build`
4. Remove the frontend environment variables
5. Redeploy

## Environment Variables Checklist

After completing, verify you have ALL of these:

**Backend Variables** (should already exist):
- [ ] NODE_ENV
- [ ] JWT_SECRET
- [ ] JWT_REFRESH_SECRET
- [ ] GOOGLE_CLIENT_ID
- [ ] GOOGLE_CLIENT_SECRET
- [ ] GOOGLE_REDIRECT_URI (update to `https://restoreassist.app/api/auth/google/callback`)
- [ ] STRIPE_SECRET_KEY
- [ ] STRIPE_WEBHOOK_SECRET
- [ ] SENDGRID_API_KEY ✅
- [ ] EMAIL_FROM ✅
- [ ] SENTRY_DSN (if using Sentry)

**Frontend Variables** (need to add):
- [ ] VITE_API_URL
- [ ] VITE_GOOGLE_CLIENT_ID
- [ ] VITE_STRIPE_PUBLISHABLE_KEY
- [ ] VITE_STRIPE_PRODUCT_FREE_TRIAL
- [ ] VITE_STRIPE_PRODUCT_MONTHLY
- [ ] VITE_STRIPE_PRODUCT_YEARLY
- [ ] VITE_STRIPE_PRICE_FREE_TRIAL
- [ ] VITE_STRIPE_PRICE_MONTHLY
- [ ] VITE_STRIPE_PRICE_YEARLY

## Need Help?

If you get stuck on any step, let me know which step and I'll help troubleshoot.
