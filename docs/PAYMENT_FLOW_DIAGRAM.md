# Stripe Payment Flow - Visual Diagram

## High-Level Architecture

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │
       │ 1. Signs up (email/password)
       ▼
┌─────────────────────────────┐
│   Frontend (React)          │
│                             │
│  • FreeTrialLanding         │
│  • Stores userId, email     │
│  • Redirects to Dashboard   │
└──────────┬──────────────────┘
           │
           │ 2. Displays trial status
           ▼
┌─────────────────────────────┐
│   Dashboard                 │
│                             │
│  • TrialUpgradeBanner       │
│  • UpgradeToPaidButton      │
│  • Shows 3/3 reports        │
└──────────┬──────────────────┘
           │
           │ 3. User clicks "Upgrade"
           ▼
┌─────────────────────────────┐
│   POST /api/stripe/         │
│   create-checkout-session   │
│                             │
│  Body: {                    │
│    priceId, email, userId   │
│  }                          │
└──────────┬──────────────────┘
           │
           │ 4. Creates session
           ▼
┌─────────────────────────────┐
│   Stripe Checkout           │
│                             │
│  • Pre-filled email         │
│  • Card payment form        │
│  • Secure payment           │
└──────────┬──────────────────┘
           │
           │ 5. Payment successful
           ▼
┌─────────────────────────────┐
│   Stripe Webhook            │
│   checkout.session.         │
│   completed                 │
│                             │
│  Metadata: { userId }       │
└──────────┬──────────────────┘
           │
           │ 6. Create subscription
           ▼
┌─────────────────────────────┐
│   Database                  │
│   user_subscriptions        │
│                             │
│  • user_id                  │
│  • stripe_subscription_id   │
│  • plan_type: 'monthly'     │
│  • reports_limit: NULL      │
│  • status: 'active'         │
└──────────┬──────────────────┘
           │
           │ 7. Redirect to success
           ▼
┌─────────────────────────────┐
│   /checkout/success         │
│                             │
│  • Shows confirmation       │
│  • "Go to Dashboard"        │
└──────────┬──────────────────┘
           │
           │ 8. Returns to dashboard
           ▼
┌─────────────────────────────┐
│   Dashboard (Paid User)     │
│                             │
│  • No trial banner          │
│  • Unlimited reports        │
│  • Full access              │
└─────────────────────────────┘
```

## Detailed Component Flow

### 1. Trial Signup
```
User Input:
├─ Email: user@example.com
├─ Password: SecurePass123!
└─ Name: John Doe

POST /api/trial-auth/email-signup
├─ Create user account
├─ Generate JWT tokens
└─ Activate 14-day trial

Response:
{
  user: { userId, email, name },
  tokens: { accessToken, refreshToken },
  trial: { reportsRemaining: 3, expiresAt }
}

localStorage:
├─ accessToken
├─ refreshToken
├─ userId ← CRITICAL for Stripe
├─ userEmail ← CRITICAL for Stripe
└─ userName
```

### 2. Dashboard - Trial Banner
```
┌────────────────────────────────────────────────────────┐
│  🔵 Free Trial Active    3 reports remaining           │
│                                                         │
│  Expires: Nov 6, 2025 (14 days remaining)              │
│                                                         │
│  ┌──────────────────────────────────┐                  │
│  │ ✨ Upgrade to unlock unlimited   │                  │
│  │                                   │                  │
│  │ • Unlimited reports               │  [ Upgrade to ] │
│  │ • PDF & Excel export              │  [ Monthly    ] │
│  │ • Priority support                │                 │
│  │                                   │  [ Upgrade to ] │
│  └──────────────────────────────────┘  [ Yearly     ] │
│                                         [ 10% off    ] │
└────────────────────────────────────────────────────────┘
```

### 3. Upgrade Button Click
```
User clicks: "Upgrade to Monthly"

UpgradeToPaidButton:
├─ Gets userId from localStorage
├─ Gets userEmail from localStorage
├─ Gets priceId from config
└─ Calls backend API

POST /api/stripe/create-checkout-session
{
  priceId: "price_1SK6GPBY5KEPMwxd43EBhwXx",
  planName: "Professional Monthly",
  email: "user@example.com",
  userId: "user-123", ← From localStorage
  successUrl: "http://localhost:3000/checkout/success",
  cancelUrl: "http://localhost:3000/dashboard"
}

Backend creates Stripe session:
{
  mode: 'subscription',
  customer_email: email,
  metadata: { userId, planType, planName }, ← Critical
  client_reference_id: userId ← Fallback
}

Response:
{
  url: "https://checkout.stripe.com/c/pay/cs_test_...",
  sessionId: "cs_test_..."
}

window.location.href = url ← Redirect to Stripe
```

### 4. Stripe Checkout Page
```
┌─────────────────────────────────────────┐
│  Stripe Checkout - Secure Payment      │
├─────────────────────────────────────────┤
│                                         │
│  Email: user@example.com (pre-filled)  │
│                                         │
│  Card number:  [4242 4242 4242 4242 ] │
│  Expiry:       [12 / 30             ] │
│  CVC:          [123                 ] │
│  ZIP:          [12345               ] │
│                                         │
│  Professional Monthly                   │
│  $49.50 AUD / month                    │
│                                         │
│  [ Subscribe ]                          │
│                                         │
│  🔒 Secure payment by Stripe            │
└─────────────────────────────────────────┘
```

### 5. Webhook Event
```
Stripe → POST /api/stripe/webhook

Headers:
├─ stripe-signature: t=...,v1=... ← Verified
└─ content-type: application/json

Body:
{
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_...",
      customer: "cus_...",
      subscription: "sub_...",
      customer_email: "user@example.com",
      metadata: {
        userId: "user-123", ← Extract this
        planType: "monthly",
        planName: "Professional Monthly"
      }
    }
  }
}

Backend processing:
├─ Verify webhook signature ✓
├─ Extract userId from metadata ✓
├─ Extract subscription_id ✓
├─ Call subscriptionService.processCheckoutSession()
│  ├─ Create subscription record
│  ├─ Set reports_limit: NULL (unlimited)
│  └─ Set status: 'active'
├─ Send confirmation email ✓
└─ Return 200 OK to Stripe
```

### 6. Database Record
```sql
INSERT INTO user_subscriptions (
  subscription_id,
  user_id,                        ← From webhook metadata
  stripe_customer_id,             ← From webhook session
  stripe_subscription_id,         ← From webhook session
  plan_type,
  status,
  reports_used,
  reports_limit,                  ← NULL = unlimited
  current_period_start,
  current_period_end,
  created_at
) VALUES (
  'sub-1698765432-abc123',
  'user-123',
  'cus_...',
  'sub_...',
  'monthly',
  'active',
  0,
  NULL,
  '2025-10-23 00:00:00',
  '2025-11-23 00:00:00',
  NOW()
);
```

### 7. Success Page
```
┌─────────────────────────────────────────┐
│  ✅ Payment Successful!                 │
├─────────────────────────────────────────┤
│                                         │
│  Thank you for subscribing to           │
│  RestoreAssist                          │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Email:     user@example.com     │   │
│  │ Amount:    $49.50 AUD           │   │
│  │ Plan:      Professional Monthly │   │
│  └─────────────────────────────────┘   │
│                                         │
│  What's Next?                           │
│  ✓ You'll receive a confirmation email │
│  ✓ You now have unlimited access       │
│  ✓ Start generating reports            │
│                                         │
│  [ Go to Dashboard ]  [ Home ]          │
└─────────────────────────────────────────┘
```

### 8. Dashboard - Paid User
```
┌─────────────────────────────────────────┐
│  RestoreAssist Dashboard                │
├─────────────────────────────────────────┤
│                                         │
│  ✅ Professional Monthly Plan           │
│                                         │
│  • Unlimited reports available          │
│  • PDF & Excel export enabled           │
│  • Priority support                     │
│                                         │
│  [ Manage Subscription ]                │
│                                         │
├─────────────────────────────────────────┤
│  Generate Report                        │
│  [Report Form]                          │
│                                         │
│  Recent Reports                         │
│  [Report List]                          │
└─────────────────────────────────────────┘
```

## Data Flow Summary

```
localStorage          Backend                Stripe              Database
─────────────────────────────────────────────────────────────────────────

userId: user-123  →   Checkout Session  →   Payment Form
email: user@...       metadata: {           customer_email
                        userId,
                        planType
                      }

                                             Payment Success
                                                   ↓
                      ← Webhook Event   ←   checkout.session.
                        (verified)           completed
                                             metadata: {
                                               userId: user-123
                                             }
                            ↓
                      Extract userId
                      Create subscription
                            ↓
                                          →  INSERT INTO
                                             user_subscriptions
                                             (
                                               user_id,
                                               plan_type: monthly,
                                               reports_limit: NULL,
                                               status: active
                                             )

GET /subscription/me                     ←  SELECT FROM
                                            user_subscriptions
                                            WHERE user_id = ?
```

## Security Flow

```
Input Validation     Webhook Verification     Data Protection
───────────────────────────────────────────────────────────────

User Input           Stripe Signature         Database
├─ Email format      ├─ Verify signature      ├─ No card data
├─ Password strength │   using secret         ├─ Only metadata
└─ User exists       └─ Reject if invalid     └─ Audit trail

API Request          Session Validation       Error Handling
├─ JWT auth          ├─ Check session_id      ├─ Generic errors
├─ Rate limiting     ├─ Verify customer       ├─ Log to Sentry
└─ Input sanitized   └─ Match userId          └─ No stack traces
```

## Error Scenarios

### Scenario 1: Checkout Creation Fails
```
User → Click Upgrade → API Error
                         ↓
                    Toast Error:
                    "Failed to start checkout"
                         ↓
                    User retries
```

### Scenario 2: Payment Declined
```
User → Stripe Checkout → Card Declined
                            ↓
                       Stripe Error Page
                            ↓
                       User updates card
                            ↓
                       Retries payment
```

### Scenario 3: Webhook Failed
```
Stripe → Webhook → Server Error
                      ↓
                  Stripe retries
                  (automatic)
                      ↓
                  Eventually succeeds
                  or manual intervention
```

## Success Metrics

```
Conversion Funnel:
─────────────────

100% Sign up for trial
 ↓
 70% See upgrade prompt
 ↓
 15% Click upgrade button
 ↓
 80% Complete payment
 ↓
 12% Convert to paid (overall)
```

## Timeline

```
T+0s    User signs up
T+10s   Dashboard loads with trial banner
T+30s   User clicks upgrade
T+35s   Redirected to Stripe
T+60s   User enters card details
T+90s   Payment submitted
T+92s   Payment processed by Stripe
T+93s   Webhook sent to backend
T+94s   Subscription created
T+95s   Confirmation email sent
T+96s   Redirect to success page
T+100s  User returns to dashboard
T+105s  Dashboard shows paid status
```
