# Stripe Payment Integration Flow

## Overview

This document describes the complete payment flow for RestoreAssist, from trial signup to paid subscription via Stripe Checkout.

## Architecture

### Components

1. **Frontend**: React components handling UI and checkout flow
2. **Backend**: Express routes handling Stripe API calls
3. **Stripe**: Payment processing and webhook events
4. **Database**: PostgreSQL storing subscription records

## Complete User Flow

### 1. Trial Signup (Free)

**User Action**: Signs up with email/password or Google OAuth

**Flow**:
```
1. User submits signup form
2. Backend creates user account
3. Backend activates 14-day free trial (3 reports)
4. Frontend stores userId, email, tokens in localStorage
5. User redirected to dashboard
```

**API Endpoints**:
- `POST /api/trial-auth/email-signup`
- `POST /api/trial-auth/google-login`

**Response Example**:
```json
{
  "success": true,
  "user": {
    "userId": "user-123",
    "email": "user@example.com",
    "name": "John Doe",
    "emailVerified": true
  },
  "tokens": {
    "accessToken": "jwt-token",
    "refreshToken": "refresh-token"
  },
  "trial": {
    "tokenId": "trial-token-123",
    "reportsRemaining": 3,
    "expiresAt": "2025-11-06T00:00:00.000Z"
  }
}
```

### 2. Dashboard - Trial Status

**UI Elements**:
- Trial banner showing reports remaining and expiry date
- Upgrade CTA buttons (Monthly/Yearly)
- Upgrade card in sidebar (if low on reports)

**Components**:
- `TrialUpgradeBanner.tsx` - Full-width upgrade banner
- `UpgradeToPaidButton.tsx` - Reusable upgrade button
- `DashboardUpgradeCard.tsx` - Sidebar upgrade card

### 3. Upgrade to Paid Plan

**User Action**: Clicks "Upgrade to Monthly" or "Upgrade to Yearly"

**Flow**:
```
1. User clicks upgrade button
2. Frontend calls POST /api/stripe/create-checkout-session
   - Passes: priceId, email, userId, planName
3. Backend creates Stripe Checkout Session
   - Sets metadata: { userId, planType, planName }
   - Sets customer_email for pre-fill
   - Sets client_reference_id as fallback userId
4. Backend returns checkout URL
5. Frontend redirects to Stripe Checkout
6. User completes payment on Stripe
7. Stripe redirects back to /checkout/success?session_id={id}
```

**API Request**:
```typescript
POST /api/stripe/create-checkout-session
{
  "priceId": "price_1SK6GPBY5KEPMwxd43EBhwXx",
  "planName": "Professional Monthly",
  "email": "user@example.com",
  "userId": "user-123",
  "successUrl": "http://localhost:3000/checkout/success",
  "cancelUrl": "http://localhost:3000/dashboard"
}
```

**API Response**:
```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_...",
  "sessionId": "cs_test_..."
}
```

### 4. Stripe Checkout Session

**Stripe Configuration**:
```typescript
{
  mode: 'subscription',
  payment_method_types: ['card'],
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: '{BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}',
  cancel_url: '{BASE_URL}/dashboard',
  metadata: {
    userId: 'user-123',
    planType: 'monthly',
    planName: 'Professional Monthly'
  },
  client_reference_id: 'user-123',
  customer_email: 'user@example.com',
  allow_promotion_codes: true,
  billing_address_collection: 'required'
}
```

### 5. Webhook - Payment Success

**Trigger**: Stripe sends `checkout.session.completed` event

**Flow**:
```
1. Stripe webhook POST /api/stripe/webhook
2. Backend verifies webhook signature
3. Backend extracts session data:
   - userId from metadata or client_reference_id
   - customer_id, subscription_id
4. Backend calls subscriptionService.processCheckoutSession()
5. Creates subscription record in database:
   - user_id, plan_type, stripe_customer_id, stripe_subscription_id
   - reports_limit: NULL (unlimited)
   - status: 'active'
6. Sends confirmation email
7. Returns 200 OK to Stripe
```

**Webhook Event**:
```json
{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_test_...",
      "customer": "cus_...",
      "subscription": "sub_...",
      "customer_email": "user@example.com",
      "metadata": {
        "userId": "user-123",
        "planType": "monthly",
        "planName": "Professional Monthly"
      }
    }
  }
}
```

**Database Record**:
```sql
INSERT INTO user_subscriptions (
  subscription_id,
  user_id,
  stripe_customer_id,
  stripe_subscription_id,
  plan_type,
  status,
  reports_used,
  reports_limit,
  current_period_start,
  current_period_end
) VALUES (
  'sub-1698765432-abc123',
  'user-123',
  'cus_...',
  'sub_...',
  'monthly',
  'active',
  0,
  NULL,
  NOW(),
  NOW() + INTERVAL '1 month'
);
```

### 6. Success Page

**User lands on**: `/checkout/success?session_id={sessionId}`

**Flow**:
```
1. Frontend retrieves session data:
   GET /api/stripe/checkout-session/{sessionId}
2. Displays confirmation message
3. Shows payment details
4. Provides "Go to Dashboard" button
5. User returns to dashboard with unlimited reports
```

## Security Measures

### 1. PCI Compliance
- ✅ No card data stored in our database
- ✅ All payments handled by Stripe
- ✅ Stripe Checkout provides PCI-compliant payment form

### 2. Webhook Security
- ✅ Webhook signature verification using STRIPE_WEBHOOK_SECRET
- ✅ Idempotent webhook handling
- ✅ Database transactions for consistency

### 3. User Data Protection
- ⚠️  Currently using localStorage (TODO: migrate to httpOnly cookies)
- ✅ UserId passed securely via authenticated API calls
- ✅ No sensitive data in URL parameters

## Error Handling

### Checkout Creation Failures
```typescript
try {
  const response = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ priceId, email, userId })
  });

  if (!response.ok) {
    throw new Error('Failed to create checkout session');
  }
} catch (error) {
  toast({
    title: 'Error',
    description: 'Failed to start checkout. Please try again.',
    variant: 'destructive'
  });
}
```

### Webhook Failures
- All webhook errors logged to Sentry
- Failed subscriptions can be manually recovered
- Subscription history tracks all state changes

## Testing

### Test Mode
1. Use Stripe test mode keys
2. Test card: `4242 4242 4242 4242`
3. Expiry: Any future date
4. CVC: Any 3 digits
5. ZIP: Any 5 digits

### Test Scenarios
1. ✅ Successful payment - monthly plan
2. ✅ Successful payment - yearly plan
3. ✅ Payment cancelled by user
4. ✅ Payment failed (declined card)
5. ✅ Webhook signature verification
6. ✅ UserId correctly stored in subscription

### E2E Test Flow
```typescript
// packages/frontend/tests/e2e-claude/stripe-upgrade.spec.ts
test('trial user can upgrade to paid plan', async ({ page }) => {
  // 1. Sign up for trial
  await page.goto('/');
  await page.click('[data-testid="signup-button"]');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'TestPassword123!');
  await page.click('[type="submit"]');

  // 2. Click upgrade button
  await page.click('[data-testid="upgrade-monthly"]');

  // 3. Verify Stripe checkout loaded
  await page.waitForURL(/checkout\.stripe\.com/);

  // 4. Fill payment form (Stripe test mode)
  await page.fill('[name="cardnumber"]', '4242424242424242');
  await page.fill('[name="exp-date"]', '12/30');
  await page.fill('[name="cvc"]', '123');
  await page.fill('[name="postal"]', '12345');

  // 5. Submit payment
  await page.click('[type="submit"]');

  // 6. Wait for redirect to success page
  await page.waitForURL(/\/checkout\/success/);

  // 7. Verify success message
  await expect(page.locator('text=Payment Successful')).toBeVisible();

  // 8. Go to dashboard
  await page.click('text=Go to Dashboard');

  // 9. Verify no trial banner (now paid user)
  await expect(page.locator('text=Free Trial Active')).not.toBeVisible();
  await expect(page.locator('text=Unlimited reports')).toBeVisible();
});
```

## Environment Variables

### Required for Production
```env
# Stripe API Keys
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# Stripe Webhook Secret
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...

# Application URLs
BASE_URL=https://restoreassist.com
```

### Frontend (.env)
```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_STRIPE_PRICE_MONTHLY=price_...
VITE_STRIPE_PRICE_YEARLY=price_...
```

## Database Schema

### user_subscriptions
```sql
CREATE TABLE user_subscriptions (
  subscription_id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  plan_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  reports_used INTEGER DEFAULT 0,
  reports_limit INTEGER NULL,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### subscription_history
```sql
CREATE TABLE subscription_history (
  history_id SERIAL PRIMARY KEY,
  subscription_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Stripe Products & Prices

### Products
- **Free Trial**: 3 reports, 14 days
- **Monthly Plan**: Unlimited reports, $49.50 AUD/month
- **Yearly Plan**: Unlimited reports, $528 AUD/year (10% discount)

### Price Configuration
All prices configured in Stripe Dashboard with:
- Currency: AUD
- Billing interval: Monthly or Yearly
- Tax behavior: Exclusive (tax added at checkout)

## Monitoring & Alerts

### Metrics to Track
1. Checkout session creation rate
2. Payment success rate
3. Payment failure rate
4. Webhook delivery success rate
5. Subscription churn rate

### Error Alerts
- Failed webhook deliveries → Slack/Email
- Payment failures → Log to Sentry
- Subscription creation errors → Critical alert

## Future Enhancements

### Phase 2: Security Improvements
- [ ] Migrate from localStorage to httpOnly cookies
- [ ] Implement CSRF protection
- [ ] Add rate limiting on checkout endpoints

### Phase 3: Features
- [ ] Proration for mid-cycle upgrades
- [ ] Discount codes support
- [ ] Annual billing discount automation
- [ ] Customer portal for self-service billing

### Phase 4: Analytics
- [ ] Revenue dashboard
- [ ] Conversion funnel tracking
- [ ] Churn prediction model
- [ ] LTV calculations

## Support & Troubleshooting

### Common Issues

**Issue**: Webhook not received
- Check Stripe webhook logs
- Verify STRIPE_WEBHOOK_SECRET is correct
- Ensure endpoint is publicly accessible

**Issue**: Subscription not created after payment
- Check webhook delivery in Stripe Dashboard
- Review server logs for errors
- Manually process via Stripe Dashboard

**Issue**: UserId not found in session
- Verify metadata is set in checkout session creation
- Check client_reference_id as fallback
- Review frontend localStorage storage

## References

- [Stripe Checkout Docs](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Testing Cards](https://stripe.com/docs/testing)
