# Stripe Setup — RestoreAssist

## Products & Prices

| Product | Amount | Currency | Interval | Reports/Month | Env Var |
|---------|--------|----------|----------|---------------|---------|
| Monthly Plan | $99.00 | AUD | month | 50 | `STRIPE_PRICE_MONTHLY` |
| Yearly Plan | $1,188.00 | AUD | year | 70 | `STRIPE_PRICE_YEARLY` |

### Add-on Report Packs (one-time)

Add-ons are created dynamically per checkout session — no persistent Stripe price objects are needed.

| Pack | Amount (AUD) | Reports |
|------|-------------|---------|
| 8 Additional Reports | $20.00 | 8 |
| 25 Additional Reports | $50.00 | 25 |
| 60 Additional Reports | $100.00 | 60 |

### Lifetime Access (invite-only)

A one-time $22.00 AUD payment grants permanent access. Gated by email in `lib/lifetime-pricing.ts`.

## Required Environment Variables

```bash
# apps/web/.env.local

# Stripe keys (required)
STRIPE_SECRET_KEY=sk_live_...          # or sk_test_... for dev
STRIPE_PUBLISHABLE_KEY=pk_live_...     # or pk_test_... for dev
STRIPE_WEBHOOK_SECRET=whsec_...        # from Stripe Dashboard > Webhooks

# Subscription price IDs (recommended — fallback creates prices dynamically)
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...
```

If `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` are not set, the checkout route (`/api/create-checkout-session`) falls back to creating prices on-the-fly when a `resource_missing` error occurs. Setting the env vars avoids creating duplicate price objects.

## Webhook Events

The webhook route at `/api/webhooks/stripe` handles these events:

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Activates subscription, processes add-on/invoice/lifetime payments |
| `checkout.session.async_payment_succeeded` | Same as above (delayed payment methods) |
| `customer.subscription.created` | Sets user to ACTIVE, applies signup bonus |
| `customer.subscription.updated` | Syncs status (ACTIVE, PAST_DUE, CANCELED, etc.) |
| `customer.subscription.deleted` | Sets CANCELED, sends cancellation email |
| `invoice.payment_succeeded` | Resets monthly report usage counter |
| `invoice.payment_failed` | Sets PAST_DUE, sends dunning email |
| `payment_intent.succeeded` | Backup handler for add-ons and invoice payments |

### Webhook URL

Configure in the Stripe Dashboard:

- **Test**: `https://<your-ngrok-or-dev-url>/api/webhooks/stripe`
- **Production**: `https://restoreassist.com.au/api/webhooks/stripe`

## Scripts

### Audit Stripe Configuration

```bash
cd apps/web
npx tsx scripts/audit-stripe.ts
```

Checks that products, prices, webhooks, and env vars are correctly set up. Returns exit code 1 if any critical check fails.

### Create Products & Prices

```bash
cd apps/web
npx tsx scripts/setup-stripe.ts
```

Creates the Monthly and Yearly products/prices if they don't exist. Outputs the price IDs to add to `.env.local`.

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/create-checkout-session` | POST | Create subscription checkout (monthly/yearly) |
| `/api/checkout-lifetime` | POST | Create lifetime one-time payment checkout |
| `/api/addons/checkout` | POST | Create add-on report pack checkout |
| `/api/subscription` | GET | Get current subscription details from Stripe |
| `/api/subscription/portal` | POST | Create Stripe billing portal session |
| `/api/verify-subscription` | POST | Verify checkout session and activate subscription |
| `/api/check-active-subscription` | POST | Check/sync active subscription from Stripe |
| `/api/cancel-subscription` | POST | Cancel subscription at period end |
| `/api/reactivate-subscription` | POST | Reactivate a cancelled subscription |
| `/api/webhooks/stripe` | POST | Stripe webhook handler |

## Signup Bonus

First-time subscribers receive 10 bonus add-on reports. This is tracked by the `signupBonusApplied` field on the User model. The bonus is applied by the webhook handler, the checkout verification route, and the subscription check route.
