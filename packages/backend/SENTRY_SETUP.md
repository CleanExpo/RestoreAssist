# Sentry Error Monitoring Setup

**Status**: ✅ Implemented
**Date**: October 20, 2025
**Priority**: HIGH (Critical for production)

## Overview

Sentry error monitoring has been integrated into RestoreAssist backend to track production errors, performance issues, and critical failures across all services.

## Features Implemented

### ✅ Core Sentry Integration
- **Early initialization** via `src/instrument.ts` (loaded before all other modules)
- **Express error handler** automatically captures all route errors
- **Performance monitoring** with 10% sampling in production
- **Profiling** enabled for performance analysis
- **Serverless-aware** with proper flush handling for Vercel

### ✅ Enhanced Error Context
- **User information** (ID, email, role) automatically attached to errors
- **Request details** (method, path, query, headers) for debugging
- **Route tags** for easy filtering in Sentry dashboard
- **Custom severity levels** based on HTTP status codes

### ✅ Critical Path Monitoring
- **Stripe webhook failures** tracked with full event context
- **Payment processing errors** with customer and subscription IDs
- **Automatic error filtering** (auth errors, validation errors excluded)

## Configuration

### Environment Variables

Add to Vercel project settings:

```bash
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

**To get your Sentry DSN:**
1. Create free account at https://sentry.io
2. Create new project (Node.js/Express)
3. Copy DSN from project settings
4. Add to Vercel environment variables

### Optional: Release Tracking

Sentry automatically tracks releases using:
- `VERCEL_GIT_COMMIT_SHA` (Vercel auto-provides this)
- Or `npm_package_version` as fallback

## What Gets Tracked

### ✅ Automatically Captured
- All uncaught Express errors
- Unhandled promise rejections
- HTTP errors (400-599)
- Console errors and warnings
- Performance transactions

### ✅ Manually Tracked
- Stripe webhook processing failures
- Payment processing errors
- Subscription creation/update failures

### ❌ Filtered Out (Not Sent to Sentry)
- Authentication errors (expected)
- Token expiration (expected)
- Validation errors (expected)
- 401/403 responses (expected)

## Error Context Example

When an error occurs, Sentry captures:

```json
{
  "user": {
    "id": "user-123",
    "email": "customer@example.com",
    "username": "John Doe"
  },
  "request": {
    "method": "POST",
    "url": "/api/reports",
    "path": "/api/reports",
    "query": {"page": "1"},
    "headers": {
      "user-agent": "Mozilla/5.0...",
      "content-type": "application/json"
    }
  },
  "tags": {
    "route.path": "/api/reports",
    "route.method": "POST",
    "user.role": "user"
  },
  "contexts": {
    "runtime": {
      "name": "node",
      "version": "v22.18.0"
    }
  }
}
```

## Stripe Webhook Example

Checkout session failures include:

```json
{
  "tags": {
    "stripe.event": "checkout.session.completed",
    "stripe.session_id": "cs_test_123"
  },
  "contexts": {
    "stripe": {
      "sessionId": "cs_test_123",
      "customerId": "cus_123",
      "subscriptionId": "sub_123",
      "paymentStatus": "paid"
    }
  }
}
```

## Using Sentry Dashboard

### Finding Errors

1. **Go to Issues tab** - See all captured errors
2. **Filter by tags**:
   - `route.path:/api/stripe/webhook` - Stripe errors
   - `user.role:admin` - Admin-triggered errors
   - `stripe.event:checkout.session.completed` - Checkout failures

### Performance Monitoring

1. **Go to Performance tab** - See slow endpoints
2. **Check transactions** - See which routes are slow
3. **View profiles** - CPU/memory profiling data

### Setting Up Alerts

1. **Alerts → Create Alert Rule**
2. **Example**: Alert when Stripe webhook failures > 5 in 1 hour
3. **Send to**: Email, Slack, PagerDuty, etc.

## Serverless Considerations

### Automatic Flush Handling

On Vercel serverless functions:
- Errors are **flushed immediately** (2-second timeout)
- Ensures errors reach Sentry before function terminates
- Gracefully handles flush failures

### Performance Impact

- **Minimal overhead**: ~5ms per request
- **Sampling**: Only 10% of transactions in production
- **Async processing**: Doesn't block request handling

## Files Modified

```
packages/backend/
├── src/
│   ├── instrument.ts              # NEW: Sentry initialization
│   ├── index.ts                   # MODIFIED: Import instrument + Express handler
│   ├── middleware/
│   │   └── errorHandler.ts        # MODIFIED: Enhanced context
│   └── routes/
│       └── stripeRoutes.ts        # MODIFIED: Webhook error tracking
└── package.json                    # MODIFIED: Added Sentry dependencies
```

## Testing Sentry Integration

### Test Error Capture (Local)

```bash
# Start backend
cd packages/backend
npm run dev

# Trigger test error
curl -X POST http://localhost:3001/api/test-error \
  -H "Content-Type: application/json"

# Check console for:
# "✅ Sentry error monitoring initialized"
```

### Test Error Capture (Production)

```bash
# Trigger 500 error (will be caught by Sentry)
curl -X POST https://restore-assist-backend.vercel.app/api/reports \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'

# Check Sentry dashboard within 30 seconds
```

## Monitoring Best Practices

### 1. Set Up Alerts
- **Critical**: Stripe webhook failures
- **High**: Report generation failures
- **Medium**: Authentication service errors

### 2. Weekly Review
- Check error trends
- Identify recurring issues
- Monitor performance degradation

### 3. Error Budget
- Target: < 0.1% error rate
- Alert when > 1% errors in 1 hour

## Next Steps

To further enhance monitoring:

1. **Add more webhook tracking** - Track all Stripe events
2. **Monitor external APIs** - Anthropic, Google, ServiceM8
3. **Database query monitoring** - Slow queries, connection issues
4. **Custom metrics** - Business metrics (reports/day, revenue, etc.)
5. **Session replay** - Sentry's session replay for frontend (future)

## Troubleshooting

### "Sentry DSN not provided" Warning

**Solution**: Add `SENTRY_DSN` environment variable to Vercel

### Errors Not Appearing in Sentry

1. Check `SENTRY_DSN` is correct
2. Verify Sentry project is active
3. Check network connectivity
4. Look for flush timeouts in logs

### Too Many Errors Being Sent

1. Add more filters in `instrument.ts` `beforeSend`
2. Increase sampling rate threshold
3. Review error-prone endpoints

## Support Resources

- **Sentry Docs**: https://docs.sentry.io/platforms/node/
- **Express Integration**: https://docs.sentry.io/platforms/node/guides/express/
- **Performance Monitoring**: https://docs.sentry.io/product/performance/
- **Serverless Functions**: https://docs.sentry.io/platforms/node/guides/aws-lambda/ (concepts apply to Vercel)

---

**Last Updated**: October 20, 2025
**Status**: Production Ready ✅
