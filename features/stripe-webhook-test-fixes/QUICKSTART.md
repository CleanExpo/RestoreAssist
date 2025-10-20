# Stripe Webhook Test Fixes - Quick Start Guide

**TL;DR**: Refactor webhook handlers to use dependency injection instead of Jest module mocking. This fixes 4 failing tests by allowing direct injection of mock implementations.

---

## Problem Summary

**4 out of 11 tests failing** - Mock subscription service functions not being called despite handlers executing (200 OK).

**Root Cause**: Jest module mocks don't intercept function calls within ES6 module closures. The webhook handlers close over the original imported functions, not the mocked versions.

---

## Solution: Dependency Injection

### Before (Broken)
```typescript
// stripeRoutes.ts
import { processCheckoutSession } from '../services/subscriptionService';

router.post('/webhook', async (req, res) => {
  // ❌ Calls original function, not mock
  await processCheckoutSession(session);
});
```

### After (Fixed)
```typescript
// stripeRoutes.ts
export function createStripeRouter(deps: WebhookDependencies) {
  router.post('/webhook', async (req, res) => {
    // ✅ Calls injected dependency (can be mock)
    await deps.subscriptionService.processCheckoutSession(session);
  });
}
```

---

## Implementation Steps

### 1. Create Service Interfaces (15 min)
**File**: `packages/backend/src/services/interfaces/index.ts`

```typescript
export interface WebhookDependencies {
  subscriptionService: ISubscriptionService;
  emailService: IEmailService;
  errorTracker: IErrorTracker;
  stripeService: IStripeService;
}
```

### 2. Refactor Route Handler (45 min)
**File**: `packages/backend/src/routes/stripeRoutes.ts`

- Wrap router creation in `createStripeRouter(deps)` factory
- Replace direct imports with `deps.subscriptionService.*`
- Export default with real services for production

### 3. Update Tests (30 min)
**File**: `packages/backend/tests/integration/stripeWebhooks.test.ts`

```typescript
// ✅ Remove jest.mock() for services
// ✅ Import factory: createStripeRouter
// ✅ Create mock dependencies object
const mockDeps: WebhookDependencies = { /* mocks */ };

// ✅ Inject mocks into router
const router = createStripeRouter(mockDeps);
```

### 4. Verify (10 min)
```bash
npm test -- stripeWebhooks.test.ts
# Expected: ✅ 11/11 tests passing
```

---

## File Changes Summary

| File | Change Type | Lines Changed |
|------|-------------|---------------|
| `src/services/interfaces/index.ts` | NEW | +150 |
| `src/routes/stripeRoutes.ts` | REFACTOR | ~50 modified |
| `tests/integration/stripeWebhooks.test.ts` | REFACTOR | ~100 modified |
| **Total** | | ~300 lines |

---

## Verification Checklist

- [ ] All 11 tests pass (including 4 previously failing)
- [ ] Mock functions record correct call counts
- [ ] Production server starts without errors
- [ ] Coverage remains above 80%
- [ ] TypeScript strict mode passes

---

## Rollback Plan

**If anything breaks**:
```bash
git revert <commit-hash>
```

**Zero risk to production** - Default export maintains original behavior.

---

## Key Benefits

✅ **Fixes Tests**: Mocks now work correctly (4 failing → 0 failing)
✅ **No Production Changes**: Default export uses real services
✅ **Better Architecture**: Explicit dependencies, easier to test
✅ **Type Safety**: Interfaces enforce correct signatures
✅ **Future-Proof**: Pattern scales to other route handlers

---

## Time Estimate

- **Development**: 2-3 hours
- **Testing**: 30 minutes
- **Code Review**: 30 minutes
- **Total**: ~4 hours

---

## Questions?

**See full implementation plan**: `implementation-plan.md` (3000+ words with code examples)

**Spec document**: `spec.md` (original problem analysis)

**Test documentation**: `packages/backend/TEST_DOCUMENTATION.md`
