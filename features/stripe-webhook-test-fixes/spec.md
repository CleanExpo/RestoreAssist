# Feature Specification: Fix Stripe Webhook Integration Tests

**Status**: Blocked - Requires deeper investigation
**Priority**: High
**Created**: 2025-10-20
**Type**: Bug Fix / Test Infrastructure

## Problem Statement

4 out of 11 Stripe webhook integration tests are failing with identical symptoms:
- Tests expect subscription service functions to be called by webhook handlers
- Webhook handlers execute successfully (return 200 OK)
- Mock subscription service functions record ZERO calls
- Tests that don't involve subscription service calls pass successfully

### Failing Tests
1. `should handle checkout.session.completed event` - `mockProcessCheckoutSession` not called
2. `should handle customer.subscription.deleted event` - `mockUpdateSubscriptionStatus` not called
3. `should handle invoice.payment_succeeded event` - `mockRecordSubscriptionHistory` not called
4. `should handle invoice.payment_failed event` - `mockUpdateSubscriptionStatus` not called

### Passing Tests
1. `should return 400 when webhook secret is missing` ✅
2. `should return 400 when signature verification fails` ✅
3. `should handle unhandled event types gracefully` ✅
4. `POST /api/stripe/create-checkout-session` ✅ (2 tests)
5. `GET /api/stripe/checkout-session/:sessionId` ✅ (2 tests)

## Root Cause Analysis

### Attempted Fixes (All Failed)
1. ❌ Added Sentry mocking (`@sentry/node`)
2. ❌ Added emailService mocking with implementations
3. ❌ Set default mock implementations before module import
4. ❌ Replaced `jest.clearAllMocks()` with individual `mockFn.mockClear()`
5. ❌ Moved mock setup order (before imports)

### Suspected Issues
1. **Module Import/Export Mismatch**: Jest mocks might not be hooking into the correct module references
2. **Express Middleware Interference**: `express.json()` and `express.raw()` both applied, causing body parsing conflicts
3. **Async Timing**: Webhook handlers use try/catch blocks that might swallow errors before mocks record calls
4. **TypeScript/Jest Interaction**: ES modules and CommonJS interop issues with Jest mocking

### Evidence
- File: `packages/backend/tests/integration/stripeWebhooks.test.ts`
- Route handler: `packages/backend/src/routes/stripeRoutes.ts` (lines 102-401)
- Subscription service: `packages/backend/src/services/subscriptionService.ts`
- Mock setup: Lines 42-70 in test file
- Webhook handlers have try/catch blocks (lines 137-175, 214-263, etc.)

## Success Criteria

✅ All 11 Stripe webhook integration tests pass
✅ Mock subscription service functions are called and recorded correctly
✅ Tests remain isolated and don't affect each other
✅ No regression in currently passing tests
✅ Test coverage remains at 80%+ (constitution requirement)

## Acceptance Tests

### Test 1: checkout.session.completed webhook
```typescript
GIVEN a valid checkout session completed event
WHEN the webhook is triggered
THEN processCheckoutSession should be called with correct session data
AND response status should be 200
AND response body should equal { received: true }
```

### Test 2: customer.subscription.deleted webhook
```typescript
GIVEN a valid subscription deleted event
WHEN the webhook is triggered
THEN updateSubscriptionStatus should be called with ('sub-123', 'cancelled', metadata)
AND response status should be 200
```

### Test 3: invoice.payment_succeeded webhook
```typescript
GIVEN a valid invoice payment succeeded event
WHEN the webhook is triggered
THEN recordSubscriptionHistory should be called with payment event data
AND response status should be 200
```

### Test 4: invoice.payment_failed webhook
```typescript
GIVEN a valid invoice payment failed event
WHEN the webhook is triggered
THEN updateSubscriptionStatus should be called with ('sub-123', 'past_due', metadata)
AND response status should be 200
```

## Technical Constraints

- **Australian English**: All documentation and code comments
- **TypeScript Strict Mode**: No type assertions without justification
- **Constitution Compliance**: 80%+ test coverage, TDD principles
- **Jest/Supertest**: Must use existing test infrastructure
- **Module Mocking**: Must work with Jest's module mocking system

## Proposed Investigation Steps

1. **Verify Mock Import Paths**: Confirm jest.mock paths resolve to same module as stripeRoutes imports
2. **Add Debug Logging**: Temporarily add console.log in webhook handlers to verify execution flow
3. **Test Mock Directly**: Create isolated test that calls mocked functions directly to verify mock setup
4. **Check Compiled Output**: Inspect TypeScript compilation output to verify imports are correct
5. **Simplify Test Setup**: Try removing express middleware and testing route handler directly
6. **Alternative Mocking**: Try jest.spyOn instead of jest.mock
7. **Body Parser Investigation**: Test with raw body parser only (required for Stripe signature verification)

## Related Issues

- Constitution Principle II: Test-Driven Development (NON-NEGOTIABLE)
- No skipped tests allowed without GitHub issue tracking
- Integration testing standards require proper module-level mocking

## Notes

- Tests were refactored to use module-level mocking pattern
- Previously all tests were skipped, now 7/11 pass
- The pattern of failures suggests a systemic issue with how mocks interact with route handlers
- Webhook handlers use nested try/catch blocks that catch all errors
- Email service calls are wrapped in `.catch()` blocks and don't throw

## Next Steps

**Option A: Continue Debugging** (Time-boxed to 2 hours)
- Add detailed logging to webhook handlers
- Create minimal reproduction test case
- Consult Jest documentation on ES module mocking

**Option B: Refactor Test Architecture** (Recommended)
- Extract webhook logic into testable service functions
- Use dependency injection for easier mocking
- Separate route handling from business logic

**Option C: Alternative Test Strategy**
- Use real PostgreSQL instance in tests (testcontainers)
- Reduce reliance on complex mocking
- Focus on integration over unit testing for webhooks

**Decision**: Option B recommended - refactor for testability following constitution principles

---

## Implementation Resources

- **Full Implementation Plan**: [`implementation-plan.md`](./implementation-plan.md) (3000+ words, complete code examples)
- **Quick Start Guide**: [`QUICKSTART.md`](./QUICKSTART.md) (1-page summary)
- **Architecture Diagrams**: [`ARCHITECTURE.md`](./ARCHITECTURE.md) (visual flow diagrams)

**Next Steps**: Review implementation plan and begin Phase 1 (Service Interfaces)

---

**Created by**: Claude Code AI Assistant
**Reviewed by**: Pending
**Approved by**: Pending
