# Stripe Webhook Test Fixes - Implementation Checklist

**Use this checklist to track progress during implementation.**

---

## Pre-Implementation (10 min)

- [ ] **Read Documentation**
  - [ ] Read [QUICKSTART.md](./QUICKSTART.md) (5 min)
  - [ ] Skim [implementation-plan.md](./implementation-plan.md) (5 min)
  - [ ] Bookmark [ARCHITECTURE.md](./ARCHITECTURE.md) for reference

- [ ] **Setup Environment**
  - [ ] Create feature branch: `git checkout -b fix/stripe-webhook-test-di`
  - [ ] Pull latest changes: `git pull origin main`
  - [ ] Install dependencies: `npm install`
  - [ ] Run baseline tests: `npm test -- stripeWebhooks.test.ts`
  - [ ] Record baseline: `____/11 tests passing`

---

## Phase 1: Service Interfaces (30 min)

- [ ] **Create Interfaces File**
  - [ ] Create directory: `packages/backend/src/services/interfaces/`
  - [ ] Create file: `packages/backend/src/services/interfaces/index.ts`

- [ ] **Define Interfaces**
  - [ ] Define `ISubscriptionService` interface
    - [ ] `processCheckoutSession(session: Stripe.Checkout.Session): Promise<void>`
    - [ ] `processSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void>`
    - [ ] `updateSubscriptionStatus(id, status, metadata?): Promise<void>`
    - [ ] `recordSubscriptionHistory(history: SubscriptionHistory): Promise<void>`
    - [ ] `getSubscriptionByStripeId(stripeId: string): Promise<Subscription | null>`

  - [ ] Define `IEmailService` interface
    - [ ] `sendCheckoutConfirmation(params): Promise<void>`
    - [ ] `sendSubscriptionCancelled(params): Promise<void>`
    - [ ] `sendPaymentReceipt(params): Promise<void>`
    - [ ] `sendPaymentFailed(params): Promise<void>`

  - [ ] Define `IErrorTracker` interface
    - [ ] `addBreadcrumb(breadcrumb): void`
    - [ ] `captureException(error, context?): void`

  - [ ] Define `IStripeService` interface
    - [ ] `customers.retrieve(customerId: string): Promise<Stripe.Customer>`

  - [ ] Define `WebhookDependencies` type combining all interfaces

- [ ] **Verify Interfaces**
  - [ ] TypeScript compiles: `npm run build`
  - [ ] No type errors in interfaces
  - [ ] All method signatures match implementation

**Checkpoint**: TypeScript builds successfully, no errors

---

## Phase 2: Webhook Handler Factory (90 min)

- [ ] **Refactor stripeRoutes.ts**
  - [ ] Import `WebhookDependencies` from interfaces
  - [ ] Create `createStripeRouter(deps: WebhookDependencies)` function
  - [ ] Move router creation inside factory function

- [ ] **Update Webhook Handler - checkout.session.completed**
  - [ ] Replace `import { processCheckoutSession }` with `deps.subscriptionService.processCheckoutSession`
  - [ ] Replace `emailService.sendCheckoutConfirmation` with `deps.emailService.sendCheckoutConfirmation`
  - [ ] Replace `Sentry.addBreadcrumb` with `deps.errorTracker.addBreadcrumb`
  - [ ] Replace `Sentry.captureException` with `deps.errorTracker.captureException`
  - [ ] Verify logic unchanged (only dependency source changed)

- [ ] **Update Webhook Handler - customer.subscription.deleted**
  - [ ] Replace `getSubscriptionByStripeId` with `deps.subscriptionService.getSubscriptionByStripeId`
  - [ ] Replace `updateSubscriptionStatus` with `deps.subscriptionService.updateSubscriptionStatus`
  - [ ] Replace `stripe.customers.retrieve` with `deps.stripeService.customers.retrieve`
  - [ ] Replace `emailService.sendSubscriptionCancelled` with `deps.emailService.sendSubscriptionCancelled`
  - [ ] Verify logic unchanged

- [ ] **Update Webhook Handler - invoice.payment_succeeded**
  - [ ] Replace `getSubscriptionByStripeId` with `deps.subscriptionService.getSubscriptionByStripeId`
  - [ ] Replace `recordSubscriptionHistory` with `deps.subscriptionService.recordSubscriptionHistory`
  - [ ] Replace `emailService.sendPaymentReceipt` with `deps.emailService.sendPaymentReceipt`
  - [ ] Verify logic unchanged

- [ ] **Update Webhook Handler - invoice.payment_failed**
  - [ ] Replace `getSubscriptionByStripeId` with `deps.subscriptionService.getSubscriptionByStripeId`
  - [ ] Replace `updateSubscriptionStatus` with `deps.subscriptionService.updateSubscriptionStatus`
  - [ ] Replace `recordSubscriptionHistory` with `deps.subscriptionService.recordSubscriptionHistory`
  - [ ] Replace `emailService.sendPaymentFailed` with `deps.emailService.sendPaymentFailed`
  - [ ] Verify logic unchanged

- [ ] **Update Other Webhook Handlers**
  - [ ] customer.subscription.created → `deps.subscriptionService.processSubscriptionUpdate`
  - [ ] customer.subscription.updated → `deps.subscriptionService.processSubscriptionUpdate`
  - [ ] Verify all handlers use injected dependencies

- [ ] **Create Default Export (Production)**
  - [ ] Import real services at bottom of file
  - [ ] Create real `WebhookDependencies` object
  - [ ] Export default: `export default createStripeRouter(realDeps)`
  - [ ] Verify no direct imports in handler bodies (only in default export)

**Checkpoint**: TypeScript builds, server starts, no runtime errors

---

## Phase 3: Production Entry Point (15 min)

- [ ] **Verify index.ts**
  - [ ] Confirm imports default export: `import stripeRoutes from './routes/stripeRoutes'`
  - [ ] Confirm routes registered: `app.use('/api/stripe', stripeRoutes)`
  - [ ] No changes needed (backward compatible)

- [ ] **Test Production Server**
  - [ ] Start server: `npm run dev`
  - [ ] Check console for errors
  - [ ] Test endpoint: `curl http://localhost:3000/api/stripe/webhook` (expect 400 - missing signature)
  - [ ] Stop server

**Checkpoint**: Production server starts and responds

---

## Phase 4: Test Refactor (60 min)

- [ ] **Remove Jest Module Mocks**
  - [ ] Remove or comment out `jest.mock('../../src/services/subscriptionService')`
  - [ ] Remove or comment out `jest.mock('../../src/services/emailService')`
  - [ ] Remove or comment out `jest.mock('@sentry/node')` (except if needed for other imports)
  - [ ] Keep `jest.mock('stripe')` and `jest.mock('../../src/config/stripe')`

- [ ] **Create Mock Implementations**
  - [ ] Create `mockProcessCheckoutSession = jest.fn()`
  - [ ] Create `mockProcessSubscriptionUpdate = jest.fn()`
  - [ ] Create `mockUpdateSubscriptionStatus = jest.fn()`
  - [ ] Create `mockRecordSubscriptionHistory = jest.fn()`
  - [ ] Create `mockGetSubscriptionByStripeId = jest.fn()`
  - [ ] Create `mockSendCheckoutConfirmation = jest.fn()`
  - [ ] Create `mockSendSubscriptionCancelled = jest.fn()`
  - [ ] Create `mockSendPaymentReceipt = jest.fn()`
  - [ ] Create `mockSendPaymentFailed = jest.fn()`
  - [ ] Create `mockAddBreadcrumb = jest.fn()`
  - [ ] Create `mockCaptureException = jest.fn()`
  - [ ] Create `mockCustomersRetrieve = jest.fn()`

- [ ] **Import Factory Function**
  - [ ] Change import: `import { createStripeRouter } from '../../src/routes/stripeRoutes'`
  - [ ] Remove import of default export

- [ ] **Create Mock Dependencies Object**
  - [ ] Define `mockDependencies: WebhookDependencies` in `beforeAll()`
  - [ ] Wire `subscriptionService` mocks
  - [ ] Wire `emailService` mocks
  - [ ] Wire `errorTracker` mocks
  - [ ] Wire `stripeService` mocks

- [ ] **Inject Mocks into Router**
  - [ ] Call `const stripeRoutes = createStripeRouter(mockDependencies)`
  - [ ] Mount router: `app.use('/api/stripe', stripeRoutes)`

- [ ] **Update beforeEach()**
  - [ ] Clear all mock call history
  - [ ] Set default mock implementations (resolved promises)
  - [ ] Set `mockGetSubscriptionByStripeId` to return test subscription
  - [ ] Set `mockWebhooksConstructEvent` to parse payload

- [ ] **Update Test Assertions**
  - [ ] Verify `mockProcessCheckoutSession` called in checkout.session.completed test
  - [ ] Verify `mockUpdateSubscriptionStatus` called in customer.subscription.deleted test
  - [ ] Verify `mockRecordSubscriptionHistory` called in invoice.payment_succeeded test
  - [ ] Verify `mockUpdateSubscriptionStatus` called in invoice.payment_failed test
  - [ ] Add assertions for email service calls
  - [ ] Verify mock call arguments match expected values

**Checkpoint**: Run tests: `npm test -- stripeWebhooks.test.ts`

---

## Phase 5: Verification (30 min)

- [ ] **Run Full Test Suite**
  - [ ] Run: `npm test -- stripeWebhooks.test.ts`
  - [ ] Result: `____/11 tests passing` (target: 11/11)
  - [ ] No test failures
  - [ ] No test timeouts

- [ ] **Run Tests Multiple Times (Stability)**
  - [ ] Run 10x: `for i in {1..10}; do npm test -- stripeWebhooks.test.ts; done` (Linux/Mac)
  - [ ] OR PowerShell: `1..10 | ForEach-Object { npm test -- stripeWebhooks.test.ts }`
  - [ ] All runs pass: `____/10 successful`
  - [ ] No flaky tests

- [ ] **Check Test Coverage**
  - [ ] Run: `npm test -- stripeWebhooks.test.ts --coverage`
  - [ ] Coverage: `____%` (target: >80%)
  - [ ] No coverage regression

- [ ] **Manual Webhook Test (Optional)**
  - [ ] Install Stripe CLI: `stripe --version`
  - [ ] Start server: `npm run dev`
  - [ ] Forward webhooks: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
  - [ ] Trigger event: `stripe trigger checkout.session.completed`
  - [ ] Check server logs for successful processing
  - [ ] Stop server and Stripe CLI

- [ ] **Production Build Test**
  - [ ] Build: `npm run build`
  - [ ] No build errors
  - [ ] Start production build: `npm start`
  - [ ] Server starts successfully
  - [ ] Stop server

**Checkpoint**: All tests passing, production builds successfully

---

## Documentation Updates (15 min)

- [ ] **Update TEST_DOCUMENTATION.md**
  - [ ] Add "Dependency Injection for Testability" section
  - [ ] Document production vs test usage patterns
  - [ ] Add benefits list

- [ ] **Update spec.md**
  - [ ] Add "Resolution" section with implementation date
  - [ ] Document changes made
  - [ ] Record final test results
  - [ ] Add lessons learned

- [ ] **Add Code Comments**
  - [ ] Comment `createStripeRouter()` function explaining DI pattern
  - [ ] Comment default export explaining production usage
  - [ ] Comment test setup explaining mock injection

**Checkpoint**: Documentation updated

---

## Code Review Preparation (10 min)

- [ ] **Self-Review**
  - [ ] All webhook handlers use `deps.*` (no direct imports)
  - [ ] Default export provides real services
  - [ ] Tests inject mocks correctly
  - [ ] No console.log statements left in code
  - [ ] TypeScript strict mode passes
  - [ ] ESLint passes: `npm run lint`

- [ ] **Create Before/After Comparison**
  - [ ] Screenshot before test results (7/11 passing)
  - [ ] Screenshot after test results (11/11 passing)
  - [ ] Prepare for PR description

- [ ] **Commit Changes**
  - [ ] Stage changes: `git add .`
  - [ ] Commit: `git commit -m "Fix Stripe webhook tests with dependency injection"`
  - [ ] Push: `git push origin fix/stripe-webhook-test-di`

**Checkpoint**: Code committed and pushed

---

## Pull Request (15 min)

- [ ] **Create PR**
  - [ ] Open PR from `fix/stripe-webhook-test-di` to `main`
  - [ ] Title: "Fix Stripe webhook integration tests with dependency injection"
  - [ ] Description includes before/after test results
  - [ ] Link to implementation plan and spec

- [ ] **PR Description Checklist**
  - [ ] Problem description (4 failing tests)
  - [ ] Solution summary (dependency injection)
  - [ ] Before/after test results
  - [ ] Files changed summary
  - [ ] Risk assessment (low - backward compatible)
  - [ ] Testing performed
  - [ ] Links to documentation

- [ ] **Request Reviews**
  - [ ] Tag 2+ team members for review
  - [ ] Request tech lead approval
  - [ ] Link PR in team chat

**Checkpoint**: PR created and submitted for review

---

## Post-Merge (5 min)

- [ ] **Merge PR**
  - [ ] All reviews approved
  - [ ] CI/CD tests pass
  - [ ] Merge to main

- [ ] **Deploy to Staging**
  - [ ] Deploy to staging environment
  - [ ] Run E2E tests on staging
  - [ ] Monitor Sentry for webhook errors (1 hour)

- [ ] **Deploy to Production**
  - [ ] Deploy to production
  - [ ] Monitor webhook success rate (24 hours)
  - [ ] Check Stripe dashboard for webhook delivery

- [ ] **Cleanup**
  - [ ] Delete feature branch: `git branch -d fix/stripe-webhook-test-di`
  - [ ] Update project board
  - [ ] Close related GitHub issues

**Checkpoint**: Feature deployed and monitored

---

## Success Criteria

✅ All 11 tests passing (previously 7/11)
✅ Mock functions correctly record calls
✅ Production server runs without errors
✅ Test coverage above 80%
✅ TypeScript strict mode passes
✅ ESLint passes with no warnings
✅ Zero production downtime during rollout
✅ Documentation updated

---

## Troubleshooting

### Tests Still Failing After Refactor

**Symptom**: Mocks still record zero calls

**Possible Causes**:
1. Mock not properly wired in `mockDependencies` object
2. Handler still using direct import instead of `deps.*`
3. TypeScript type mismatch causing silent failures

**Solutions**:
1. Verify `mockDependencies` object matches `WebhookDependencies` interface
2. Search for direct imports in handler bodies (should only be in default export)
3. Check TypeScript errors: `npm run build`

### TypeScript Errors

**Symptom**: Build fails with type errors

**Possible Causes**:
1. Interface signatures don't match real service methods
2. Missing type imports from Stripe SDK
3. Mock implementations don't satisfy interface

**Solutions**:
1. Compare interface methods with actual service implementations
2. Import Stripe types: `import Stripe from 'stripe'`
3. Add proper return types to mock implementations

### Production Server Crashes

**Symptom**: Server won't start after refactor

**Possible Causes**:
1. Default export not configured correctly
2. Real services not imported in default export
3. Circular dependency issues

**Solutions**:
1. Verify default export calls `createStripeRouter(realDeps)`
2. Check all real service imports at bottom of file
3. Move imports to resolve circular dependencies

### Flaky Tests

**Symptom**: Tests pass sometimes, fail other times

**Possible Causes**:
1. Shared state between tests (mocks not cleared)
2. Async timing issues
3. beforeEach() not resetting mocks

**Solutions**:
1. Ensure all mocks cleared in `beforeEach()`
2. Add `await` to all async operations
3. Check no tests mutate shared objects

---

## Time Tracking

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| Pre-Implementation | 10 min | ___ min | |
| Phase 1: Interfaces | 30 min | ___ min | |
| Phase 2: Handler Factory | 90 min | ___ min | |
| Phase 3: Entry Point | 15 min | ___ min | |
| Phase 4: Tests | 60 min | ___ min | |
| Phase 5: Verification | 30 min | ___ min | |
| Documentation | 15 min | ___ min | |
| Code Review Prep | 10 min | ___ min | |
| Pull Request | 15 min | ___ min | |
| **Total** | **275 min (4.6 hrs)** | **___ min** | |

---

**Implementation Date**: ___________
**Developer**: ___________
**Reviewer(s)**: ___________
**Approved By**: ___________
**Deployment Date**: ___________
