# Stripe Integration - Complete Setup Guide

## ✅ What's Been Completed

### 1. Stripe Product Catalog
- **Free Trial**: $0 AUD (3 reports) - `prod_TGdTtgqCXY34na`
- **Monthly Plan**: $49.50 AUD/month - `prod_TGdXM0eZiBxmfW`
- **Yearly Plan**: $528 AUD/year ($44/month) - `prod_TGdZP6UNZ8ONMh`

### 2. Configuration Files
✅ Backend configuration: `packages/backend/src/config/stripe.ts`
✅ Frontend configuration: `packages/frontend/src/config/stripe.ts`
✅ Environment variables configured in `.env.local` and `.env`

### 3. Frontend Components
✅ Pricing page: `packages/frontend/src/pages/PricingPage.tsx`
✅ Pricing card component: `packages/frontend/src/components/pricing/PricingCard.tsx`
✅ Checkout success page: `packages/frontend/src/pages/CheckoutSuccess.tsx`
✅ React Router configured with routes

### 4. Backend API Endpoints
✅ `POST /api/stripe/create-checkout-session` - Create Stripe checkout
✅ `GET /api/stripe/checkout-session/:sessionId` - Verify checkout
✅ `POST /api/stripe/webhook` - Handle Stripe webhooks (placeholder)

### 5. Scripts
✅ `npm run stripe:setup` - Create new products in Stripe
✅ `npm run stripe:fetch` - Fetch existing product/price IDs

---

## 🚀 How to Test the Integration

### Step 1: Start the Backend Server
```bash
cd packages/backend
npm run dev
```

Server should start on: http://localhost:3001

### Step 2: Start the Frontend Development Server
```bash
cd packages/frontend
npm run dev
```

Frontend should start on: http://localhost:5173

### Step 3: Test the Pricing Page

1. **Navigate to pricing page:**
   - Open browser to: http://localhost:5173/pricing

2. **You should see 3 pricing cards:**
   - Free Trial ($0) - 3 reports
   - Monthly Plan ($49.50/month)
   - Yearly Plan ($528/year) with "Best Value" badge

3. **Click "Get Started" on any plan:**
   - This will call the backend API
   - Backend creates a Stripe checkout session
   - Browser redirects to Stripe's hosted checkout page

### Step 4: Test Stripe Checkout

1. **Use Stripe test card numbers:**
   - Success: `4242 4242 4242 4242`
   - Requires 3D Secure: `4000 0027 6000 3184`
   - Declined: `4000 0000 0000 0002`

2. **Fill in checkout form:**
   - Card number: Use test card above
   - Expiry: Any future date (e.g., 12/25)
   - CVC: Any 3 digits (e.g., 123)
   - Email: Your email address
   - Name: Any name
   - Billing address: Any valid address

3. **Complete payment:**
   - Click "Pay" or "Subscribe"
   - For test mode, payment will process instantly

### Step 5: Verify Success Page

After successful payment:
- Redirects to: http://localhost:5173/checkout/success?session_id=...
- Shows payment confirmation
- Displays:
  - Email used for checkout
  - Amount paid
  - Plan selected
  - Next steps

---

## 🔧 API Testing with cURL

### Create Checkout Session
```bash
curl -X POST http://localhost:3001/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "priceId": "price_1SK6GPBY5KEPMwxd43EBhwXx",
    "planName": "Monthly Plan",
    "successUrl": "http://localhost:5173/checkout/success",
    "cancelUrl": "http://localhost:5173/pricing"
  }'
```

### Get Checkout Session
```bash
curl http://localhost:3001/api/stripe/checkout-session/cs_test_xxxxx
```

---

## 📝 Next Steps to Production

### 1. Configure Stripe Webhooks

1. **Go to Stripe Dashboard:**
   - https://dashboard.stripe.com/test/webhooks

2. **Add endpoint:**
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

3. **Get webhook signing secret:**
   - Copy the signing secret
   - Add to `.env.local`:
     ```
     STRIPE_WEBHOOK_SECRET=whsec_xxxxx
     ```

### 2. Implement Subscription Tracking

You need to create database tables to track:
- User subscriptions
- Active plans
- Report usage limits
- Subscription status

**Suggested database schema:**
```sql
CREATE TABLE user_subscriptions (
  subscription_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  plan_type VARCHAR(50), -- 'freeTrial', 'monthly', 'yearly'
  status VARCHAR(50), -- 'active', 'cancelled', 'expired'
  reports_used INT DEFAULT 0,
  reports_limit INT, -- 3 for free trial, NULL for unlimited
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Update Webhook Handler

In `packages/backend/src/routes/stripeRoutes.ts`, implement the TODO sections:

```typescript
case 'checkout.session.completed': {
  // 1. Get user info from session
  // 2. Create/update subscription record
  // 3. Send welcome email
  // 4. Grant access to features
  break;
}

case 'customer.subscription.created': {
  // 1. Update user subscription status
  // 2. Set report limits based on plan
  break;
}
```

### 4. Add Subscription Management UI

Create pages for users to:
- View current subscription
- Upgrade/downgrade plans
- Cancel subscription
- View billing history
- Update payment method

### 5. Implement Usage Limits

In your report generation endpoint:
```typescript
// Check if user has reached report limit
const subscription = await getUserSubscription(userId);

if (subscription.plan_type === 'freeTrial') {
  if (subscription.reports_used >= 3) {
    return res.status(403).json({
      error: 'Free trial limit reached',
      message: 'Upgrade to continue generating reports'
    });
  }
}

// Generate report...

// Increment usage counter
await incrementReportUsage(userId);
```

### 6. Switch to Live Mode

1. **Get live API keys from Stripe dashboard:**
   - Live secret key: `sk_live_xxxxx`
   - Live publishable key: `pk_live_xxxxx`

2. **Update environment variables:**
   ```bash
   # Backend .env.local
   STRIPE_SECRET_KEY=sk_live_xxxxx

   # Frontend .env
   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
   ```

3. **Use live product/price IDs:**
   - Create products in live mode
   - Run `npm run stripe:fetch` to get live IDs
   - Update .env files

4. **Update webhook endpoint to production URL**

---

## 🎯 Quick Reference

### Environment Variables

**Backend (`packages/backend/.env.local`):**
```bash
STRIPE_SECRET_KEY=sk_live_51SK3Z3BY5KEPMwxd...
STRIPE_PRODUCT_FREE_TRIAL=prod_TGdTtgqCXY34na
STRIPE_PRODUCT_MONTHLY=prod_TGdXM0eZiBxmfW
STRIPE_PRODUCT_YEARLY=prod_TGdZP6UNZ8ONMh
STRIPE_PRICE_FREE_TRIAL=price_1SK6CHBY5KEPMwxdjZxT8CKH
STRIPE_PRICE_MONTHLY=price_1SK6GPBY5KEPMwxd43EBhwXx
STRIPE_PRICE_YEARLY=price_1SK6I7BY5KEPMwxdC451vfBk
STRIPE_WEBHOOK_SECRET=whsec_xxxxx  # Add this for webhooks
```

**Frontend (`packages/frontend/.env`):**
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_51SK3Z3BY5KEPMwxd...
VITE_STRIPE_PRODUCT_FREE_TRIAL=prod_TGdTtgqCXY34na
VITE_STRIPE_PRODUCT_MONTHLY=prod_TGdXM0eZiBxmfW
VITE_STRIPE_PRODUCT_YEARLY=prod_TGdZP6UNZ8ONMh
VITE_STRIPE_PRICE_FREE_TRIAL=price_1SK6CHBY5KEPMwxdjZxT8CKH
VITE_STRIPE_PRICE_MONTHLY=price_1SK6GPBY5KEPMwxd43EBhwXx
VITE_STRIPE_PRICE_YEARLY=price_1SK6I7BY5KEPMwxdC451vfBk
```

### Routes

- **Pricing Page:** `/pricing`
- **Checkout Success:** `/checkout/success`
- **Dashboard:** `/dashboard`

### API Endpoints

- **Create Checkout:** `POST /api/stripe/create-checkout-session`
- **Get Session:** `GET /api/stripe/checkout-session/:sessionId`
- **Webhooks:** `POST /api/stripe/webhook`

---

## 🐛 Troubleshooting

### "Failed to create checkout session"
- Check backend server is running on port 3001
- Verify STRIPE_SECRET_KEY is set correctly
- Check browser console for error details

### "No checkout URL returned"
- Check backend logs for Stripe API errors
- Verify price ID exists in Stripe dashboard
- Ensure Stripe is in test mode during development

### Webhook not firing
- Check webhook signing secret is correct
- Verify endpoint URL is accessible from internet
- Use Stripe CLI for local testing: `stripe listen --forward-to localhost:3001/api/stripe/webhook`

### Redirect loops
- Clear browser cache/cookies
- Check success/cancel URLs are correct
- Verify routes are properly configured

---

## 📚 Resources

- **Stripe Dashboard:** https://dashboard.stripe.com
- **Stripe API Docs:** https://stripe.com/docs/api
- **Stripe Testing:** https://stripe.com/docs/testing
- **Stripe Webhooks:** https://stripe.com/docs/webhooks

---

**Status:** ✅ Integration Complete - Ready for Testing
**Last Updated:** October 19, 2025
