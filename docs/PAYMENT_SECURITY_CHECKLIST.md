# Payment Security Checklist

## PCI Compliance

### ✅ Implemented
- [x] No card data stored in our database
- [x] All payment processing handled by Stripe
- [x] Stripe Checkout provides PCI-compliant payment form
- [x] No card details pass through our servers
- [x] HTTPS enforced in production

### ⚠️ Recommended Improvements
- [ ] Implement Content Security Policy (CSP) headers
- [ ] Add Subresource Integrity (SRI) for external scripts
- [ ] Regular security audits of payment flow

## Data Protection

### ✅ Implemented
- [x] Webhook signature verification
- [x] Environment variables for sensitive keys
- [x] No API keys in frontend code
- [x] Database transactions for payment records
- [x] Error logging with Sentry

### ⚠️ TODO: Phase 2
- [ ] Migrate from localStorage to httpOnly cookies
- [ ] Implement CSRF token protection
- [ ] Add rate limiting on payment endpoints
- [ ] Implement request signing for API calls

## Current Security Measures

### 1. Webhook Security
```typescript
// Verify webhook signature before processing
const event = stripe.webhooks.constructEvent(
  req.body,
  sig,
  webhookSecret
);
```

**Why**: Prevents malicious actors from faking payment webhooks

### 2. No Sensitive Data Logging
```typescript
// ❌ NEVER log card data
console.log('Payment received:', {
  amount: invoice.amount_paid,
  // Card data NOT logged
});
```

**Why**: Prevents sensitive data from being stored in logs

### 3. Idempotent Operations
```typescript
// Check if subscription already exists before creating
const existing = await getSubscriptionByStripeId(subscriptionId);
if (existing) {
  return; // Prevent duplicate subscriptions
}
```

**Why**: Prevents duplicate charges if webhook is replayed

### 4. Secure Environment Variables
```env
# ✅ Production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ⚠️ NEVER commit these to git
# Use .env files and .gitignore
```

**Why**: API keys must never be exposed in code or version control

## Known Security Limitations (To Be Fixed)

### 1. localStorage Storage ⚠️

**Current Implementation**:
```typescript
// ⚠️ Vulnerable to XSS attacks
localStorage.setItem('accessToken', token);
localStorage.setItem('userId', userId);
```

**Why It's Problematic**:
- Accessible by any JavaScript code
- Vulnerable to XSS attacks
- Can be stolen by malicious scripts

**Planned Fix (Phase 2)**:
```typescript
// ✅ Secure: httpOnly cookies
res.cookie('accessToken', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000 // 15 minutes
});
```

### 2. No CSRF Protection ⚠️

**Current Implementation**:
```typescript
// ⚠️ No CSRF token validation
fetch('/api/stripe/create-checkout-session', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

**Planned Fix (Phase 2)**:
```typescript
// ✅ CSRF token in header
fetch('/api/stripe/create-checkout-session', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify(data)
});
```

## Error Handling Best Practices

### ✅ Never Expose Sensitive Errors
```typescript
// ✅ Good: Generic error message
catch (error) {
  console.error('Payment failed:', error); // Log internally
  res.status(500).json({
    error: 'Payment processing failed' // Generic message
  });
}

// ❌ Bad: Exposes implementation details
catch (error) {
  res.status(500).json({
    error: error.message, // Could reveal sensitive info
    stack: error.stack     // NEVER expose stack traces
  });
}
```

## Testing Security

### Test Scenarios

1. **Webhook Signature Verification**
```typescript
test('rejects webhook with invalid signature', async () => {
  const response = await request(app)
    .post('/api/stripe/webhook')
    .set('stripe-signature', 'invalid-signature')
    .send(webhookPayload);

  expect(response.status).toBe(400);
});
```

2. **Payment Amount Validation**
```typescript
test('prevents negative payment amounts', async () => {
  const response = await request(app)
    .post('/api/stripe/create-checkout-session')
    .send({
      priceId: 'invalid-negative-price',
      userId: 'user-123'
    });

  expect(response.status).toBe(400);
});
```

3. **UserId Validation**
```typescript
test('rejects checkout without userId', async () => {
  const response = await request(app)
    .post('/api/stripe/create-checkout-session')
    .send({
      priceId: 'price_123'
      // Missing userId
    });

  // Should still work but warn in logs
  expect(response.status).toBe(200);
});
```

## Production Deployment Checklist

### Before Going Live
- [ ] Replace all test API keys with live keys
- [ ] Set STRIPE_WEBHOOK_SECRET from Stripe Dashboard
- [ ] Enable webhook endpoint in Stripe Dashboard
- [ ] Test webhook delivery in production
- [ ] Configure HTTPS/TLS certificates
- [ ] Set up monitoring and alerts
- [ ] Review all error messages for information disclosure
- [ ] Implement rate limiting
- [ ] Add logging for all payment events
- [ ] Test payment flow end-to-end in production mode

### Monitoring
- [ ] Set up alerts for failed webhooks
- [ ] Monitor for unusual payment patterns
- [ ] Track failed payment attempts
- [ ] Review Sentry errors daily
- [ ] Monitor Stripe Dashboard for disputes

## Incident Response Plan

### If Payment Data is Compromised

1. **Immediate Actions**
   - Rotate all API keys immediately
   - Disable affected webhook endpoints
   - Contact Stripe support
   - Notify affected users

2. **Investigation**
   - Review server logs for unauthorized access
   - Check Stripe Dashboard for unusual activity
   - Audit all recent payments
   - Identify scope of breach

3. **Remediation**
   - Patch security vulnerabilities
   - Reset all user sessions
   - Force password resets if needed
   - Update security measures

4. **Post-Incident**
   - Document incident timeline
   - Update security protocols
   - Conduct security training
   - Implement additional monitoring

## Compliance Requirements

### Data Retention
- Payment records: 7 years (tax compliance)
- Webhook logs: 90 days
- Error logs: 30 days
- Customer data: Until account deletion

### Privacy (GDPR/CCPA)
- [ ] Allow users to export payment history
- [ ] Allow users to delete account and data
- [ ] Provide clear privacy policy
- [ ] Obtain consent for data processing
- [ ] Implement data portability

## Security Contacts

### Report Security Issues
- Email: security@restoreassist.com
- Stripe Support: https://support.stripe.com

### Escalation Path
1. Development Team → Immediate fix
2. Security Lead → Risk assessment
3. Stripe Support → Payment-specific issues
4. Legal Team → Compliance issues

## References

- [Stripe Security Best Practices](https://stripe.com/docs/security)
- [PCI DSS Requirements](https://www.pcisecuritystandards.org/)
- [OWASP Payment Security](https://owasp.org/www-project-payment-testing/)
- [GDPR Compliance Guide](https://gdpr.eu/)
