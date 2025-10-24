# Stripe Webhook Testing and Security

This document explains how to properly configure, test, and debug Stripe webhooks for RestoreAssist.

## Security Overview

Stripe webhooks use **signature verification** to ensure that webhook events are genuinely from Stripe and haven't been tampered with. This prevents malicious actors from sending fake payment events to your application.

### How Webhook Signatures Work

1. Stripe signs each webhook event with your webhook signing secret
2. The signature is sent in the `stripe-signature` HTTP header
3. Your application verifies the signature using `stripe.webhooks.constructEvent()`
4. If verification fails, the webhook is rejected with HTTP 400

**Critical**: The webhook endpoint MUST receive the raw request body (not parsed JSON) for signature verification to work.

## Configuration

### Required Environment Variables

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_...           # Your Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_...         # Webhook signing secret

# Stripe Price IDs
STRIPE_PRICE_ID_FREE_TRIAL=price_...    # Free trial price ID
STRIPE_PRICE_ID_MONTHLY=price_...       # Monthly subscription price ID
STRIPE_PRICE_ID_YEARLY=price_...        # Yearly subscription price ID
```

### Getting Your Webhook Signing Secret

#### Option 1: Stripe Dashboard (Production)

1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter your webhook URL: `https://your-domain.com/api/stripe/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click "Add endpoint"
6. Copy the **Signing secret** (starts with `whsec_`)
7. Add it to your `.env` file as `STRIPE_WEBHOOK_SECRET`

#### Option 2: Stripe CLI (Local Development)

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login to Stripe CLI:
   ```bash
   stripe login
   ```
3. Forward webhooks to your local server:
   ```bash
   stripe listen --forward-to localhost:3001/api/stripe/webhook
   ```
4. Copy the webhook signing secret from the CLI output (starts with `whsec_`)
5. Add it to your `.env` file as `STRIPE_WEBHOOK_SECRET`

## Local Testing with Stripe CLI

### Step 1: Start Your Backend

```bash
cd packages/backend
pnpm dev
```

### Step 2: Start Stripe CLI Webhook Forwarding

In a new terminal:

```bash
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

You should see:
```
> Ready! Your webhook signing secret is whsec_... (^C to quit)
```

### Step 3: Update Environment Variable

Copy the signing secret and update your `.env`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart your backend to pick up the new secret.

### Step 4: Trigger Test Events

#### Trigger a Checkout Session Completed Event

```bash
stripe trigger checkout.session.completed
```

#### Trigger a Payment Success Event

```bash
stripe trigger payment_intent.succeeded
```

#### Trigger a Subscription Created Event

```bash
stripe trigger customer.subscription.created
```

### Step 5: Verify Webhook Processing

Check your backend logs for:

```
✅ [STRIPE] Webhook signature verified for event: checkout.session.completed
✅ Subscription created successfully
```

## Common Webhook Errors

### Error: "Webhook signature verification failed"

**Cause**: The webhook signing secret is incorrect or the request body was modified.

**Solutions**:
1. Verify `STRIPE_WEBHOOK_SECRET` matches the secret from Stripe Dashboard or CLI
2. Ensure the webhook endpoint receives raw body (not parsed JSON)
3. Check that no middleware is modifying the request body before it reaches the webhook handler
4. Restart your backend after updating the environment variable

**Example Log**:
```
❌ [STRIPE] Webhook signature verification failed: No signatures found matching the expected signature for payload
```

### Error: "Missing stripe-signature header"

**Cause**: The request doesn't include the required signature header.

**Solutions**:
1. Ensure requests are coming from Stripe (not direct API calls)
2. Use Stripe CLI for local testing: `stripe trigger checkout.session.completed`
3. Verify webhook endpoint is correctly configured in Stripe Dashboard

**Example Log**:
```
❌ [STRIPE] Missing or invalid stripe-signature header
```

### Error: "Webhook not configured"

**Cause**: `STRIPE_WEBHOOK_SECRET` environment variable is missing or contains placeholder text.

**Solutions**:
1. Set `STRIPE_WEBHOOK_SECRET` in your `.env` file
2. Verify the secret doesn't contain "REPLACE_WITH" or other placeholder text
3. Restart your backend after updating the environment variable

**Example Log**:
```
❌ [STRIPE] STRIPE_WEBHOOK_SECRET not configured properly
❌ [STRIPE] Webhook secret must be set to a valid Stripe webhook signing secret
```

### Error: "No signatures found matching the expected signature"

**Cause**: The webhook secret doesn't match the endpoint configuration.

**Solutions**:
1. If using Stripe CLI: Copy the secret from `stripe listen` output
2. If using Dashboard: Copy the secret from the webhook endpoint settings
3. Ensure you're using the correct Stripe account (test vs live mode)
4. Create a new webhook endpoint and get a fresh signing secret

**Example Log**:
```
❌ [STRIPE] Webhook signature verification failed: No signatures found matching the expected signature for payload
```

## Testing Webhook Security

### Test 1: Invalid Signature

Try sending a webhook with an invalid signature:

```bash
curl -X POST http://localhost:3001/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: invalid_signature" \
  -d '{"type": "checkout.session.completed"}'
```

**Expected Response**:
```json
{
  "error": "Invalid signature",
  "message": "Webhook signature verification failed"
}
```

### Test 2: Missing Signature

Try sending a webhook without a signature:

```bash
curl -X POST http://localhost:3001/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{"type": "checkout.session.completed"}'
```

**Expected Response**:
```json
{
  "error": "Missing signature",
  "message": "stripe-signature header is required for webhook verification"
}
```

### Test 3: Missing Webhook Secret

1. Comment out `STRIPE_WEBHOOK_SECRET` in your `.env`
2. Restart backend
3. Try sending a webhook with Stripe CLI:

```bash
stripe trigger checkout.session.completed
```

**Expected Response**:
```json
{
  "error": "Webhook not configured",
  "message": "STRIPE_WEBHOOK_SECRET environment variable is missing or invalid",
  "docs": "See STRIPE_WEBHOOK_TESTING.md for setup instructions"
}
```

## Webhook Event Flow

### 1. Checkout Session Completed

```
User completes payment
    ↓
Stripe sends webhook: checkout.session.completed
    ↓
Backend verifies signature
    ↓
Backend creates subscription record
    ↓
Backend sends confirmation email
    ↓
User gains access to paid features
```

### 2. Subscription Created

```
Checkout session creates subscription
    ↓
Stripe sends webhook: customer.subscription.created
    ↓
Backend verifies signature
    ↓
Backend updates subscription status
    ↓
Subscription is now active
```

### 3. Payment Success

```
Monthly renewal payment succeeds
    ↓
Stripe sends webhook: invoice.payment_succeeded
    ↓
Backend verifies signature
    ↓
Backend records payment history
    ↓
Backend sends payment receipt email
    ↓
Subscription remains active
```

### 4. Payment Failed

```
Monthly renewal payment fails
    ↓
Stripe sends webhook: invoice.payment_failed
    ↓
Backend verifies signature
    ↓
Backend marks subscription as past_due
    ↓
Backend sends payment failure email
    ↓
User notified to update payment method
```

## Webhook Retry Behavior

Stripe automatically retries webhooks that fail:

- **HTTP 500 errors**: Retried with exponential backoff for up to 3 days
- **HTTP 400 errors**: Not retried (signature verification failures, invalid data)
- **HTTP 200 responses**: Marked as successful, no retries

**Important**: Our webhook handler returns HTTP 200 for event processing errors (after signature verification) to prevent Stripe from retrying unrecoverable errors.

## Production Checklist

Before deploying to production:

- [ ] Set `STRIPE_SECRET_KEY` to live mode key (starts with `sk_live_`)
- [ ] Create webhook endpoint in Stripe Dashboard (live mode)
- [ ] Set `STRIPE_WEBHOOK_SECRET` to live mode signing secret
- [ ] Configure webhook URL to production domain: `https://your-domain.com/api/stripe/webhook`
- [ ] Select required webhook events (see Configuration section)
- [ ] Test webhook delivery in Stripe Dashboard
- [ ] Monitor webhook logs for signature verification errors
- [ ] Set up Sentry alerts for webhook failures

## Monitoring Webhooks

### Stripe Dashboard

View webhook delivery logs:
1. Go to [Developers > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click on your webhook endpoint
3. View "Recent deliveries" to see success/failure status
4. Click individual events to see request/response details

### Application Logs

Successful webhook processing:
```
✅ [STRIPE] Webhook signature verified for event: checkout.session.completed
✅ Subscription created successfully
```

Failed signature verification:
```
❌ [STRIPE] Webhook signature verification failed: No signatures found matching...
```

Failed event processing:
```
❌ [STRIPE] Error processing webhook event: Database connection failed
```

### Sentry Monitoring

Webhook errors are automatically tracked in Sentry with tags:
- `stripe.webhook: signature_verification_failed` - Signature verification errors
- `stripe.webhook: event_processing_failed` - Event processing errors

## Troubleshooting Tips

1. **Always use Stripe CLI for local testing** - Direct API calls won't have valid signatures
2. **Restart backend after updating webhook secret** - Environment variables are loaded at startup
3. **Check Stripe Dashboard webhook logs** - See exact request/response from Stripe's perspective
4. **Verify webhook endpoint is publicly accessible** - For production, test with `curl` from external server
5. **Use test mode for development** - Never use live mode keys for testing
6. **Monitor webhook delivery failures** - Set up alerts for repeated failures in Stripe Dashboard

## Additional Resources

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
- [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [Webhook Signatures](https://stripe.com/docs/webhooks/signatures)
