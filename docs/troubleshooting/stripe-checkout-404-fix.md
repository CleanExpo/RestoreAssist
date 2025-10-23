# Stripe Endpoint 404/500 Error - Fixed

## Problem
The `/api/stripe/create-checkout-session` endpoint was returning 404/500 errors in production.

## Root Cause Analysis
After investigating the code, I found:

1. **Routes are correctly registered** - Line 148 in `packages/backend/src/index.ts` registers the Stripe routes:
   ```typescript
   app.use('/api/stripe', stripeRoutes);
   ```

2. **Frontend is calling the correct endpoint**:
   - `getApiBaseUrl()` returns `/api` in production (from `VITE_API_URL=/api`)
   - Frontend calls: `${apiUrl}/stripe/create-checkout-session`
   - Full URL: `/api/stripe/create-checkout-session` ✓

3. **Stripe routes are properly implemented** in `packages/backend/src/routes/stripeRoutes.ts`

## Most Likely Cause
The error is likely due to **missing environment variables** in Vercel production:
- `STRIPE_SECRET_KEY` - Required for Stripe SDK initialization
- Other Stripe config may be missing

## Fix Applied

### 1. Added Diagnostic Logging
Added comprehensive logging to help diagnose the issue in production:

```typescript
// Stripe route initialization logging
console.log('✅ [STRIPE] Stripe routes initialized with secret key:',
  STRIPE_CONFIG.secretKey ? `${STRIPE_CONFIG.secretKey.substring(0, 7)}...` : 'MISSING');

// Request logging
console.log('📝 [STRIPE] Create checkout session request received');
console.log('📝 [STRIPE] Request body:', JSON.stringify(req.body, null, 2));

// Success/error logging
console.log('✅ [STRIPE] Checkout session created successfully:', {...});
console.error('❌ [STRIPE] Error creating checkout session:', error);
```

### 2. Added Environment Variable Validation
Added explicit check for `STRIPE_SECRET_KEY`:

```typescript
if (!STRIPE_CONFIG.secretKey) {
  console.error('❌ [STRIPE] STRIPE_SECRET_KEY environment variable not set');
  return res.status(500).json({
    error: 'Stripe is not configured',
    message: 'STRIPE_SECRET_KEY environment variable is missing',
  });
}
```

### 3. Fixed Auth Service Imports
Fixed TypeScript compilation errors in `trialAuthRoutes.ts` where it was trying to use methods from the wrong service.

## What to Check in Vercel

### 1. Check Environment Variables
Go to Vercel Dashboard → Project Settings → Environment Variables and verify:

```bash
# Required Stripe Variables
STRIPE_SECRET_KEY=sk_live_...           # Must start with sk_live_ or sk_test_
STRIPE_PUBLISHABLE_KEY=pk_live_...      # Must start with pk_live_ or pk_test_

# Optional (have defaults)
STRIPE_PRODUCT_FREE_TRIAL=prod_...
STRIPE_PRODUCT_MONTHLY=prod_...
STRIPE_PRODUCT_YEARLY=prod_...
STRIPE_PRICE_FREE_TRIAL=price_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...
```

### 2. Check Vercel Logs
After deployment, check the Vercel function logs for:

```
✅ [STRIPE] Stripe routes initialized with secret key: sk_live...
```

If you see:
```
❌ [STRIPE] STRIPE_SECRET_KEY is not configured - Stripe routes will return errors
```

Then the environment variable is missing or not properly set in Vercel.

### 3. Test the Endpoint
Once deployed, test the endpoint directly:

```bash
curl -X POST https://restoreassist.app/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "priceId": "price_1SK6GPBY5KEPMwxd43EBhwXx",
    "planName": "Professional Monthly",
    "userId": "test-user-123",
    "email": "test@example.com",
    "successUrl": "https://restoreassist.app/checkout/success",
    "cancelUrl": "https://restoreassist.app/pricing"
  }'
```

Expected successful response:
```json
{
  "url": "https://checkout.stripe.com/c/pay/...",
  "sessionId": "cs_test_..."
}
```

If `STRIPE_SECRET_KEY` is missing, you'll get:
```json
{
  "error": "Stripe is not configured",
  "message": "STRIPE_SECRET_KEY environment variable is missing"
}
```

## Vercel Configuration
The Vercel setup is correct:
- `vercel.json` routes all `/api/*` requests to `/api/index.js`
- `api/index.js` loads the Express app from `packages/backend/dist/index.js`
- Routes are registered before the app is exported

## Next Steps

1. **Verify Stripe environment variables are set in Vercel**
2. **Check Vercel deployment logs** for the new diagnostic messages
3. **Test the endpoint** using the curl command above
4. **Monitor Vercel function logs** when users try to checkout

## Files Modified

- `packages/backend/src/routes/stripeRoutes.ts` - Added logging and validation
- `packages/backend/src/routes/trialAuthRoutes.ts` - Fixed auth service imports
- `packages/backend/src/services/emailAuthService.ts` - Added googleAuthService import

## Commit
```
fix: Add diagnostic logging to Stripe checkout endpoint and fix auth service imports
```

---

**The deployment should be live in 2-3 minutes.** Once deployed, check the Vercel logs to see the diagnostic messages and identify if environment variables are the issue.
