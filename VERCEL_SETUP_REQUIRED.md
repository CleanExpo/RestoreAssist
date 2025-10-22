# URGENT: Vercel Configuration Required

## What Just Happened

We merged the **unified deployment** configuration to main. This changes the deployment architecture from split (2 projects) to unified (1 project).

## Current Problem

Right now you have:
- **Frontend project** serving https://restoreassist.app
- **Backend project** serving https://backend-e03gm60ws-unite-group.vercel.app
- Both are SEPARATE Vercel projects causing CORS issues

## Required Action

You need to **reconfigure your Vercel project** to use the new unified deployment.

### Option A: Reconfigure Existing Project (Recommended)

1. Go to https://vercel.com/dashboard
2. Select your **frontend** project (the one serving restoreassist.app)
3. Go to **Settings** → **General**
4. Update these settings:
   - **Root Directory**: `.` (change from `packages/frontend` to root)
   - **Build Command**: `npm run vercel-build`
   - **Output Directory**: Leave empty (handled by vercel.json)
   - **Install Command**: `npm install`
5. Go to **Settings** → **Environment Variables**
6. Add **all variables** from `UNIFIED_DEPLOYMENT.md` (both frontend AND backend vars)
7. Go to **Deployments** tab
8. Click on latest deployment → **Redeploy**

### Option B: Create New Project

1. Go to https://vercel.com/new
2. Import from GitHub: https://github.com/CleanExpo/RestoreAssist
3. Configure:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (project root)
   - **Build Command**: `npm run vercel-build`
   - **Install Command**: `npm install`
   - **Output Directory**: Leave blank
4. Add **all environment variables** from `UNIFIED_DEPLOYMENT.md`
5. Deploy
6. Point your domain to this new project
7. Delete old projects

## What This Fixes

✅ **No more CORS** - Same-origin API calls
✅ **Single deployment** - One project to manage
✅ **Faster** - No cross-domain overhead
✅ **Simpler** - One set of environment variables

## Verification After Setup

Once deployed, run these tests:

```bash
# Test API works
curl https://restoreassist.app/api/health

# Test frontend loads
curl https://restoreassist.app
```

Open https://restoreassist.app in browser:
- Open DevTools (F12)
- Go to Console tab
- **Should see NO CORS errors!**

## Important Environment Variables

Make sure to set ALL of these in Vercel:

### Backend
```
NODE_ENV=production
JWT_SECRET=<your-secret>
JWT_REFRESH_SECRET=<your-secret>
GOOGLE_CLIENT_ID=<your-id>
GOOGLE_CLIENT_SECRET=<your-secret>
GOOGLE_REDIRECT_URI=https://restoreassist.app/api/auth/google/callback
STRIPE_SECRET_KEY=<your-key>
STRIPE_WEBHOOK_SECRET=<your-secret>
SENDGRID_API_KEY=<your-key>
EMAIL_FROM=RestoreAssist <noreply@restoreassist.app>
```

### Frontend (Build-time)
```
VITE_API_URL=/api
VITE_GOOGLE_CLIENT_ID=<your-id>
VITE_STRIPE_PUBLISHABLE_KEY=<your-key>
VITE_STRIPE_PRODUCT_FREE_TRIAL=<product-id>
VITE_STRIPE_PRODUCT_MONTHLY=<product-id>
VITE_STRIPE_PRODUCT_YEARLY=<product-id>
VITE_STRIPE_PRICE_FREE_TRIAL=<price-id>
VITE_STRIPE_PRICE_MONTHLY=<price-id>
VITE_STRIPE_PRICE_YEARLY=<price-id>
```

## DO THIS NOW

The code is ready. It just needs Vercel configuration changes.

**This will fix ALL your CORS issues permanently.**
