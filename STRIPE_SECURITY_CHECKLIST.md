# Stripe Integration Security Checklist

## PCI Compliance Points

### ✅ Implemented Security Measures

1. **Never Log Card Data**
   - ✓ All payment processing happens on Stripe's servers
   - ✓ No card data touches our servers
   - ✓ Using Stripe Checkout (hosted payment page)
   - ✓ No card data in logs or error messages

2. **API Key Security**
   - ✓ Secret keys stored in environment variables
   - ✓ Never exposed to frontend
   - ✓ Different keys for test/production
   - ✓ Keys validated before initialization

3. **Webhook Security**
   - ✓ Signature verification on all webhooks
   - ✓ HTTPS-only webhook endpoints
   - ✓ Idempotency for webhook handlers
   - ✓ Proper error handling

4. **Request Validation**
   - ✓ Zod schema validation for all requests
   - ✓ Authentication required for checkout
   - ✓ Price ID format validation
   - ✓ Price existence verification before checkout

5. **Data Encryption**
   - ✓ HTTPS for all API calls
   - ✓ Secure database connections (SSL)
   - ✓ Session tokens encrypted
   - ✓ No sensitive data in URLs

6. **Error Handling**
   - ✓ Detailed errors in development only
   - ✓ Generic errors in production
   - ✓ Comprehensive logging for debugging
   - ✓ No sensitive data in error messages

## Environment Variables Checklist

### Required Variables (Production)
- [ ] `STRIPE_SECRET_KEY` - Production secret key (sk_live_...)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Production publishable key (pk_live_...)
- [ ] `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (whsec_...)
- [ ] `STRIPE_PRICE_MONTHLY` - Monthly plan price ID
- [ ] `STRIPE_PRICE_YEARLY` - Yearly plan price ID
- [ ] `STRIPE_PRICE_FREE_TRIAL` - Free trial price ID (optional)

### Required Variables (Development/Test)
- [x] `STRIPE_SECRET_KEY` - Test secret key (sk_test_...)
- [x] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Test publishable key (pk_test_...)
- [x] `STRIPE_PRICE_MONTHLY` - Test monthly price ID
- [x] `STRIPE_PRICE_YEARLY` - Test yearly price ID
- [x] `STRIPE_PRICE_FREE_TRIAL` - Test free trial price ID

## Stripe Dashboard Configuration

### Webhook Events to Enable
1. `checkout.session.completed` - When checkout succeeds
2. `customer.subscription.created` - New subscription
3. `customer.subscription.updated` - Subscription changes
4. `customer.subscription.deleted` - Subscription canceled
5. `invoice.paid` - Successful payment
6. `invoice.payment_failed` - Failed payment

### Webhook Endpoint URLs
- **Production**: `https://restoreassist.app/api/webhooks/stripe`
- **Development**: Use Stripe CLI for local testing

### Stripe Products Setup
1. Create products in Stripe Dashboard:
   - RestoreAssist Monthly ($49.50 AUD/month)
   - RestoreAssist Yearly ($528 AUD/year)
   - Free Trial (14 days)

2. Note the price IDs and add to environment variables

## Testing Checklist

### Manual Testing
- [ ] Test successful checkout flow
- [ ] Test subscription creation
- [ ] Test subscription cancellation
- [ ] Test webhook signature validation
- [ ] Test invalid price ID handling
- [ ] Test authentication requirement
- [ ] Test customer creation
- [ ] Test existing customer handling

### Test Card Numbers (Stripe Test Mode)
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **Requires Auth**: 4000 0027 6000 3184
- **Exp Date**: Any future date
- **CVC**: Any 3 digits
- **ZIP**: Any 5 digits

## Deployment Checklist

### Pre-Deployment
- [x] Code review completed
- [x] Security audit performed
- [x] Environment variables configured
- [ ] Stripe webhook endpoint configured
- [ ] Test mode validation passed
- [ ] Production keys obtained

### Post-Deployment
- [ ] Webhook endpoint verified in production
- [ ] Test transaction completed
- [ ] Subscription flow validated
- [ ] Error monitoring configured
- [ ] Rate limiting verified
- [ ] Customer support notified

## Monitoring & Alerts

### Set Up Monitoring For:
1. Failed checkout sessions (> 5% failure rate)
2. Webhook delivery failures
3. Payment failures
4. Subscription cancellations
5. API errors from Stripe

### Error Tracking
- All Stripe errors logged with context
- User ID associated with each transaction
- Stripe request IDs captured for support

## Rate Limiting

### Implemented Limits
- Authentication: 10 requests/minute per IP
- Checkout creation: 20 requests/minute per user
- Webhook processing: 100 requests/minute

## Data Retention

### User Data
- Customer IDs: Retained indefinitely
- Subscription IDs: Retained indefinitely
- Payment history: Available via Stripe Dashboard

### Privacy Compliance
- No card data stored
- Customer email stored for receipts
- Ability to delete customer data via Stripe API

## Incident Response Plan

### If Stripe Keys Compromised
1. Immediately rotate keys in Stripe Dashboard
2. Update environment variables in Vercel
3. Redeploy application
4. Audit recent transactions
5. Notify affected customers if necessary

### If Webhook Secret Compromised
1. Generate new webhook secret in Stripe
2. Update STRIPE_WEBHOOK_SECRET
3. Redeploy application
4. Monitor for suspicious activity

## Support Contacts

- **Stripe Support**: https://support.stripe.com
- **Stripe Status**: https://status.stripe.com
- **PCI Compliance**: https://stripe.com/docs/security

## Additional Resources

- [Stripe Security Best Practices](https://stripe.com/docs/security/guide)
- [PCI Compliance Guide](https://stripe.com/docs/security/guide#pci-compliance)
- [Webhook Security](https://stripe.com/docs/webhooks/best-practices)
- [Testing Guide](https://stripe.com/docs/testing)
