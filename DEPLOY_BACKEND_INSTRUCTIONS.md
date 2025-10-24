# **URGENT: Deploy Backend to Fix Stripe Checkout**

## Problem
Your Stripe checkout has been failing for 5+ days because the **backend API is not deployed to Vercel**.

Error: `DEPLOYMENT_NOT_FOUND` when calling `https://api.restoreassist.app`

## Root Cause
- Frontend is deployed ✅ (`restoreassist-unified`)
- Backend is NOT deployed ❌ (`restore-assist-backend` project exists but empty)
- Stripe environment variables ARE configured ✅ (set 1 day ago in Vercel)
- **Missing deployment** is causing all API calls to fail

## Solution: Deploy Backend Manually

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Go to**: https://vercel.com/unite-group/restore-assist-backend
2. **Click**: "Deployments" tab
3. **Click**: "Redeploy" button (or create new deployment)
4. **Select**: `main` branch
5. **Click**: "Deploy"
6. **Wait**: 2-3 minutes for build to complete

### Option 2: Deploy via Vercel CLI

```bash
cd D:\RestoreAssist\packages\backend
vercel login
vercel --prod
```

Note: If you get "Git author must have access" error, use Option 1 instead.

### Option 3: Grant Access to CleanExpo (if deploying fails)

1. Go to: https://vercel.com/teams/unite-group/settings/members
2. Click "Invite Member"
3. Add: `CleanExpo@users.noreply.github.com`
4. Then run: `cd D:\RestoreAssist\packages\backend && vercel --prod`

## Verification Steps

After deployment completes, test the API:

```bash
curl https://api.restoreassist.app/api/health
```

Expected: `{"status":"ok"}`

Then test Stripe checkout:

```bash
curl -X POST https://api.restoreassist.app/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"priceId":"price_1SK6GPBY5KEPMwxd43EBhwXx","planName":"Monthly","successUrl":"https://restoreassist.app/success","cancelUrl":"https://restoreassist.app/pricing"}'
```

Expected: `{"url":"https://checkout.stripe.com/...", "sessionId":"cs_..."}`

## Why This Wasn't Caught Earlier

- Vercel allows multiple projects from same monorepo
- Frontend deployed successfully, masking backend deployment failure
- `vercel ls` showed frontend deployments only
- Backend permissions error was silent (not shown in frontend logs)

## Estimated Time to Fix
**5 minutes** (via Vercel Dashboard)

## Date
2025-10-24 00:20 UTC

---

**Action Required**: Deploy backend immediately to restore Stripe checkout functionality.
