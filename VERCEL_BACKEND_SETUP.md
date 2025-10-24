# Fix Backend Deployment on Vercel - Dashboard Configuration

## Problem
Backend deployment failing with: `ENOENT: no such file or directory, open '/vercel/path0/packages/backend/package.json'`

## Root Cause
The `restore-assist-backend` Vercel project has incorrect "Root Directory" setting, causing build commands to run in the wrong location.

## Solution: Update Project Settings in Vercel Dashboard

### Step 1: Access Project Settings
1. Go to: https://vercel.com/unite-group/restore-assist-backend/settings
2. Click on "General" tab

### Step 2: Update Root Directory
1. Scroll to "Root Directory" section
2. Click "Edit"
3. Set to: `packages/backend`
4. Click "Save"

### Step 3: Update Build Settings (if needed)
1. Scroll to "Build & Development Settings"
2. Override with these values:
   - **Framework Preset**: Other
   - **Build Command**: `npm run build`
   - **Output Directory**: Leave empty (serverless functions don't need this)
   - **Install Command**: `npm install`

### Step 4: Redeploy
1. Go to "Deployments" tab
2. Click on the latest deployment
3. Click "Redeploy" button
4. Wait 2-3 minutes

## Alternative: Re-link Project from Root

If the above doesn't work, create fresh deployment:

```bash
# From repository root
cd D:\RestoreAssist

# Link to backend project with root directory specified
vercel --cwd=. link

# When prompted:
# - Select: unite-group
# - Project: restore-assist-backend
# - Link to existing project? Yes

# Deploy
vercel --cwd=. --prod
```

## Verification

After deployment, test:

```bash
# Test health endpoint
curl https://restore-assist-backend.vercel.app/api/health

# Test Stripe checkout
curl -X POST https://api.restoreassist.app/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"priceId":"price_1SK6GPBY5KEPMwxd43EBhwXx","planName":"Monthly","successUrl":"https://restoreassist.app/success","cancelUrl":"https://restoreassist.app/pricing"}'
```

Expected result: Stripe checkout URL returned

## Custom Domain Configuration

After backend deploys successfully, configure custom domain:

1. Go to: https://vercel.com/unite-group/restore-assist-backend/settings/domains
2. Add domain: `api.restoreassist.app`
3. Update DNS records as instructed
4. Wait for SSL certificate provisioning (5-10 minutes)

---

**Date**: 2025-10-24
**Status**: Awaiting manual configuration via Vercel Dashboard
