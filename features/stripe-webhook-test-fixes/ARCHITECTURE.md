# Stripe Webhook Architecture - Dependency Injection Refactor

## Current Architecture (Broken Tests)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Test Suite (stripeWebhooks.test.ts)                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Jest Module Mocking (BEFORE import)                         │ │
│  │  jest.mock('subscriptionService', () => ({ ... }))           │ │
│  └──────────────────────────────┬───────────────────────────────┘ │
│                                  │ Mock attempts to intercept      │
│                                  ▼                                  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Import stripeRoutes module                                  │ │
│  │  import stripeRoutes from './stripeRoutes';                  │ │
│  └──────────────────────────────┬───────────────────────────────┘ │
│                                  │ Creates closure                 │
│                                  ▼                                  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Route Handler (Closure Scope)                               │ │
│  │                                                               │ │
│  │  ┌────────────────────────────────────────────────────────┐  │ │
│  │  │  import { processCheckoutSession } from 'service';     │  │ │
│  │  │                                                         │  │ │
│  │  │  router.post('/webhook', async () => {                 │  │ │
│  │  │    // ❌ PROBLEM: Uses original import reference      │  │ │
│  │  │    // Mock doesn't intercept this call               │  │ │
│  │  │    await processCheckoutSession(session);            │  │ │
│  │  │  });                                                  │  │ │
│  │  └────────────────────────────────────────────────────────┘  │ │
│  │                                                               │ │
│  │  Original Import ──────────┐                                 │ │
│  │                            │                                  │ │
│  └────────────────────────────┼──────────────────────────────────┘ │
│                                │                                    │
│  ┌────────────────────────────▼──────────────────────────────────┐ │
│  │  Real subscriptionService (NOT MOCK!)                        │ │
│  │  - Mock is created but never used                            │ │
│  │  - Test assertions fail: expect(mock).toHaveBeenCalled()     │ │
│  │  - mock.calls.length = 0 (always)                            │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

❌ RESULT: Handler executes (200 OK) but mock records ZERO calls
```

## New Architecture (Fixed with DI)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Test Suite (stripeWebhooks.test.ts)                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Create Mock Implementations (NO jest.mock!)                 │ │
│  │                                                               │ │
│  │  const mockProcessCheckoutSession = jest.fn();               │ │
│  │  const mockEmailService = { send: jest.fn() };               │ │
│  │                                                               │ │
│  │  const mockDeps: WebhookDependencies = {                     │ │
│  │    subscriptionService: {                                    │ │
│  │      processCheckoutSession: mockProcessCheckoutSession,     │ │
│  │      // ... other methods                                    │ │
│  │    },                                                         │ │
│  │    emailService: mockEmailService,                           │ │
│  │    // ... other services                                     │ │
│  │  };                                                           │ │
│  └──────────────────────────────┬───────────────────────────────┘ │
│                                  │ Direct injection                │
│                                  ▼                                  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Import Factory Function                                     │ │
│  │  import { createStripeRouter } from './stripeRoutes';        │ │
│  │                                                               │ │
│  │  const router = createStripeRouter(mockDeps); // ✅ Inject  │ │
│  └──────────────────────────────┬───────────────────────────────┘ │
│                                  │ Router uses injected deps       │
│                                  ▼                                  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Route Handler Factory                                       │ │
│  │                                                               │ │
│  │  ┌────────────────────────────────────────────────────────┐  │ │
│  │  │  export function createStripeRouter(deps) {            │  │ │
│  │  │    const { subscriptionService, emailService } = deps; │  │ │
│  │  │                                                         │  │ │
│  │  │    router.post('/webhook', async () => {               │  │ │
│  │  │      // ✅ SOLUTION: Uses injected dependency         │  │ │
│  │  │      await deps.subscriptionService                   │  │ │
│  │  │            .processCheckoutSession(session);          │  │ │
│  │  │    });                                                 │  │ │
│  │  │                                                         │  │ │
│  │  │    return router;                                      │  │ │
│  │  │  }                                                      │  │ │
│  │  └────────────────────────────────────────────────────────┘  │ │
│  │                                                               │ │
│  │  Injected Mock ────────────┐                                 │ │
│  │                            │                                  │ │
│  └────────────────────────────┼──────────────────────────────────┘ │
│                                │                                    │
│  ┌────────────────────────────▼──────────────────────────────────┐ │
│  │  Mock subscriptionService                                    │ │
│  │  - Directly injected into handler                            │ │
│  │  - Test assertions work: expect(mock).toHaveBeenCalled()     │ │
│  │  - mock.calls.length = 1 ✅                                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

✅ RESULT: Handler executes AND mock records calls correctly
```

## Production vs Test Usage

### Production (Real Services)

```typescript
// src/index.ts (Production Entry Point)

import stripeRoutes from './routes/stripeRoutes'; // Default export

// ✅ Default export automatically wires real services
app.use('/api/stripe', stripeRoutes);

// Equivalent to:
// const router = createStripeRouter({
//   subscriptionService: realSubscriptionService,
//   emailService: realEmailService,
//   errorTracker: Sentry,
//   stripeService: new Stripe(...)
// });
```

### Testing (Mock Services)

```typescript
// tests/integration/stripeWebhooks.test.ts

import { createStripeRouter } from './routes/stripeRoutes'; // Factory export

// ✅ Manual injection of mocks
const mockDeps: WebhookDependencies = {
  subscriptionService: { /* mocks */ },
  emailService: { /* mocks */ },
  errorTracker: { /* mocks */ },
  stripeService: { /* mocks */ },
};

const router = createStripeRouter(mockDeps);
app.use('/api/stripe', router);
```

## Dependency Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  createStripeRouter(deps: WebhookDependencies)                  │
│                                                                 │
│  Input: deps = {                                                │
│    subscriptionService: ISubscriptionService,                   │
│    emailService: IEmailService,                                 │
│    errorTracker: IErrorTracker,                                 │
│    stripeService: IStripeService                                │
│  }                                                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ Injects into handlers
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  POST /webhook Handler                                          │
│                                                                 │
│  Uses deps.subscriptionService:                                 │
│  ├─ processCheckoutSession()                                    │
│  ├─ processSubscriptionUpdate()                                 │
│  ├─ updateSubscriptionStatus()                                  │
│  ├─ recordSubscriptionHistory()                                 │
│  └─ getSubscriptionByStripeId()                                 │
│                                                                 │
│  Uses deps.emailService:                                        │
│  ├─ sendCheckoutConfirmation()                                  │
│  ├─ sendSubscriptionCancelled()                                 │
│  ├─ sendPaymentReceipt()                                        │
│  └─ sendPaymentFailed()                                         │
│                                                                 │
│  Uses deps.errorTracker:                                        │
│  ├─ addBreadcrumb()                                             │
│  └─ captureException()                                          │
│                                                                 │
│  Uses deps.stripeService:                                       │
│  └─ customers.retrieve()                                        │
└─────────────────────────────────────────────────────────────────┘
```

## Service Interface Hierarchy

```
WebhookDependencies
  │
  ├── ISubscriptionService
  │     ├─ processCheckoutSession(session: Stripe.Checkout.Session)
  │     ├─ processSubscriptionUpdate(subscription: Stripe.Subscription)
  │     ├─ updateSubscriptionStatus(id, status, metadata)
  │     ├─ recordSubscriptionHistory(history)
  │     └─ getSubscriptionByStripeId(stripeId)
  │
  ├── IEmailService
  │     ├─ sendCheckoutConfirmation(params)
  │     ├─ sendSubscriptionCancelled(params)
  │     ├─ sendPaymentReceipt(params)
  │     └─ sendPaymentFailed(params)
  │
  ├── IErrorTracker
  │     ├─ addBreadcrumb(breadcrumb)
  │     └─ captureException(error, context)
  │
  └── IStripeService
        └─ customers.retrieve(customerId)
```

## Webhook Event Flow with DI

```
┌─────────────────────────────────────────────────────────────────┐
│  Stripe Webhook Event Arrives                                   │
│  POST /api/stripe/webhook                                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Express Middleware                                             │
│  - Parses JSON body                                             │
│  - Extracts stripe-signature header                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Webhook Handler                                                │
│                                                                 │
│  1. Verify signature using Stripe SDK                           │
│     stripe.webhooks.constructEvent(body, sig, secret)           │
│                                                                 │
│  2. Extract event type and data                                 │
│     switch(event.type) { ... }                                  │
│                                                                 │
│  3. Call injected service (TESTABLE!)                           │
│     await deps.subscriptionService.processCheckoutSession()     │
│                                                                 │
│  4. Send email notification (TESTABLE!)                         │
│     await deps.emailService.sendCheckoutConfirmation()          │
│                                                                 │
│  5. Log errors to Sentry (TESTABLE!)                            │
│     deps.errorTracker.captureException()                        │
│                                                                 │
│  6. Return 200 OK                                               │
│     res.json({ received: true })                                │
└─────────────────────────────────────────────────────────────────┘
```

## Test Isolation Strategy

```
Test 1: checkout.session.completed
  ├─ Mock processCheckoutSession → return success
  ├─ Mock sendCheckoutConfirmation → return success
  ├─ Mock addBreadcrumb → no-op
  └─ Verify: processCheckoutSession called 1x with session data

Test 2: customer.subscription.deleted
  ├─ Mock getSubscriptionByStripeId → return mock subscription
  ├─ Mock updateSubscriptionStatus → return success
  ├─ Mock sendSubscriptionCancelled → return success
  └─ Verify: updateSubscriptionStatus called with 'cancelled'

Test 3: invoice.payment_succeeded
  ├─ Mock getSubscriptionByStripeId → return mock subscription
  ├─ Mock recordSubscriptionHistory → return success
  ├─ Mock sendPaymentReceipt → return success
  └─ Verify: recordSubscriptionHistory called with payment_succeeded

Test 4: invoice.payment_failed
  ├─ Mock getSubscriptionByStripeId → return mock subscription
  ├─ Mock updateSubscriptionStatus → return success
  ├─ Mock recordSubscriptionHistory → return success
  ├─ Mock sendPaymentFailed → return success
  └─ Verify: updateSubscriptionStatus called with 'past_due'

✅ Each test has complete control over mock behavior
✅ No shared state between tests
✅ No Jest module mocking required
```

## Benefits of Dependency Injection

### 1. Testability
- **Before**: Fight Jest module mocking system
- **After**: Inject mocks directly as function parameters

### 2. Clarity
- **Before**: Hidden dependencies in module imports
- **After**: Explicit dependencies in function signature

### 3. Flexibility
- **Before**: Hard-wired to specific implementations
- **After**: Swap implementations at runtime (e.g., test vs production)

### 4. Type Safety
- **Before**: Mocks might not match real service signatures
- **After**: TypeScript interfaces enforce correct signatures

### 5. Maintainability
- **Before**: Tests break when import paths change
- **After**: Tests break only when interfaces change

## Migration Complexity

```
┌──────────────────┬────────────────┬──────────────────┐
│  Component       │  Lines Changed │  Risk Level      │
├──────────────────┼────────────────┼──────────────────┤
│  Interfaces      │  +150 (new)    │  ✅ Zero Risk    │
│  stripeRoutes.ts │  ~50 modified  │  ⚠️ Low Risk     │
│  Tests           │  ~100 modified │  ⚠️ Low Risk     │
│  Production Code │  0 changed     │  ✅ Zero Risk    │
└──────────────────┴────────────────┴──────────────────┘

Total: ~300 lines of code changes
Estimated Time: 3-4 hours
Risk to Production: ZERO (backward compatible)
```

## Rollback Strategy

```
If tests fail after refactor:
  └─ Check: Did handler logic change? (should be identical)

If production breaks:
  └─ Revert commit (default export maintains original behavior)

If mocks still don't work:
  └─ Debug: Are mock implementations matching interface signatures?

If types don't match:
  └─ Fix interface definitions to match real service signatures
```

---

**Key Takeaway**: Dependency injection transforms brittle module mocking into explicit, testable function parameters. The pattern is more verbose but dramatically more reliable.
