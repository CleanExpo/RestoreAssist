# E2E Test Suite - RestoreAssist
## Comprehensive End-to-End Deployment Verification Tests

This directory contains comprehensive end-to-end tests that validate the entire RestoreAssist application works correctly after deployment.

---

## 📋 Test Suite Overview

### Test Files

1. **full-user-journey-trial.spec.ts** (11 tests)
   - Complete trial user flow from landing page to report download
   - Trial activation and limits verification
   - Dashboard functionality validation

2. **full-user-journey-paid.spec.ts** (10 tests)
   - Complete paid user flow including Stripe checkout
   - Subscription activation and management
   - Unlimited report generation verification

3. **authentication-complete.spec.ts** (15 tests)
   - Full authentication lifecycle (signup → logout → login)
   - Token management and refresh
   - Session management across tabs

4. **error-recovery.spec.ts** (37 tests)
   - Network error handling
   - UI error boundaries
   - Form validation errors
   - Payment error recovery
   - Retry mechanisms

5. **payment-flow-complete.spec.ts** (31 tests)
   - Stripe checkout session creation
   - Webhook processing
   - Subscription activation
   - Report limit management

---

## 🚀 Quick Start

### Prerequisites
```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

### Run All Tests
```bash
# Run all E2E tests
npx playwright test tests/e2e/

# Run in headed mode (with browser visible)
npx playwright test tests/e2e/ --headed

# Run with UI mode (interactive debugging)
npx playwright test tests/e2e/ --ui
```

### Run Specific Test Suite
```bash
# Trial user journey
npx playwright test tests/e2e/full-user-journey-trial.spec.ts

# Paid user journey
npx playwright test tests/e2e/full-user-journey-paid.spec.ts

# Authentication tests
npx playwright test tests/e2e/authentication-complete.spec.ts

# Error recovery tests
npx playwright test tests/e2e/error-recovery.spec.ts

# Payment flow tests
npx playwright test tests/e2e/payment-flow-complete.spec.ts
```

### View Test Report
```bash
npx playwright show-report
```

---

## 📝 Test Scenarios

### 1. Trial User Journey

**Scenario:** User signs up for free trial, generates reports, and downloads them.

**Test Flow:**
1. Visit landing page
2. Click "Start Free Trial"
3. Fill email/password signup form
4. Verify trial activation
5. Navigate to dashboard
6. Generate damage report
7. Download report (PDF/DOCX)
8. Verify trial limits (3 reports)
9. Check trial expiration date

**Key Validations:**
- ✅ Trial activation successful
- ✅ Reports remaining counter accurate
- ✅ Download functionality works
- ✅ Trial limits enforced

---

### 2. Paid User Journey

**Scenario:** User upgrades to paid subscription via Stripe checkout.

**Test Flow:**
1. Sign up with email/password
2. Navigate to pricing page
3. Select Monthly/Yearly plan
4. Redirect to Stripe checkout
5. Simulate successful payment
6. Return to success page
7. Verify subscription active
8. Generate multiple reports
9. Verify unlimited access

**Key Validations:**
- ✅ Stripe checkout session created
- ✅ Payment processed successfully
- ✅ Subscription activated
- ✅ Report limits removed
- ✅ Unlimited report generation

---

### 3. Authentication Complete

**Scenario:** Full authentication lifecycle testing.

**Test Flow:**
1. Sign up with new account
2. Verify access token stored
3. Log out
4. Verify token cleared
5. Log in with same credentials
6. Verify token refreshed
7. Test session persistence
8. Test multi-tab sync

**Key Validations:**
- ✅ Signup successful
- ✅ Logout clears session
- ✅ Login restores session
- ✅ Token refresh works
- ✅ Session persists across reloads
- ✅ Multi-tab authentication sync

---

### 4. Error Recovery

**Scenario:** Application handles errors gracefully and recovers.

**Test Flow:**
1. Trigger network errors
2. Verify retry mechanisms
3. Test error boundaries
4. Validate form errors
5. Handle payment failures
6. Test offline mode
7. Verify fallback mechanisms

**Key Validations:**
- ✅ Network errors show user-friendly messages
- ✅ Failed requests retry automatically
- ✅ Error boundaries catch component errors
- ✅ Form validation prevents bad data
- ✅ Payment errors allow retry
- ✅ Offline mode shows indicator
- ✅ Cached data shown on API failure

---

### 5. Payment Flow Complete

**Scenario:** End-to-end payment and webhook processing.

**Test Flow:**
1. Create Stripe checkout session
2. Verify session parameters
3. Simulate webhook delivery
4. Process webhook events
5. Activate subscription
6. Update report limits
7. Handle edge cases

**Key Validations:**
- ✅ Checkout session includes user email
- ✅ Success URL and cancel URL correct
- ✅ Webhooks processed idempotently
- ✅ Subscription activated on payment
- ✅ Report limits updated
- ✅ Edge cases handled (expiry, cancellation)

---

## 🧪 Test Helpers & Utilities

### Helper Functions

```typescript
// Authentication
signupWithEmail(page, email, password)
logIn(page, email, password)
logOut(page)

// Report Generation
generateDamageReport(page)

// Payment Mocking
mockStripeCheckout(page)
mockPaymentSuccess(page)
simulateWebhook(page, eventType, data)

// Error Triggering
triggerNetworkError(page, urlPattern)
trigger500Error(page, urlPattern)
triggerTimeoutError(page, urlPattern)
```

### Test Data Fixtures

Located in: `tests/e2e-claude/fixtures/test-data.ts`

```typescript
MOCK_TRIAL_DATA          // Trial user data
STRIPE_TEST_DATA         // Stripe test data
FORM_VALIDATION_TESTS    // XSS/SQL injection tests
ROUTES_TO_TEST          // All app routes
```

### API Mocks

Located in: `tests/e2e-claude/mocks/api-mocks.ts`

```typescript
mockGoogleOAuthAPI(page)
mockGoogleOAuthFailure(page, errorMessage)
mockStripeCheckoutAPI(page)
mockStripeCheckoutFailure(page)
mockContactFormAPI(page)
```

---

## 🔧 Configuration

### Playwright Config

```typescript
// playwright.config.ts
{
  testDir: './tests',
  timeout: 30 * 1000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Serial execution
  use: {
    baseURL: 'http://localhost:5173',
    headless: process.env.CI ? true : false,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  }
}
```

### Environment Variables

```env
# Application URL
VITE_APP_URL=http://localhost:5173

# Stripe (test mode)
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# CI mode
CI=true  # Enable retries and headless mode
```

---

## 📊 Test Results

### Current Status
```
Total Tests: 104 tests (in /e2e directory)
Pass Rate: ~85% (with known fixes needed)
Execution Time: ~3-5 minutes
Browser: Chromium (Chrome)
```

### Known Issues
1. **Button Selection** - Fixed: Use `.first()` for multiple buttons
2. **Missing UI Elements** - Some trial UI features not yet implemented
3. **Timing Issues** - Some tests need adjusted timeouts

---

## 🐛 Debugging Tests

### View Test in Browser
```bash
npx playwright test --headed --debug
```

### Generate Trace
```bash
npx playwright test --trace on
```

### View Trace
```bash
npx playwright show-trace trace.zip
```

### Screenshot on Failure
Screenshots automatically saved to:
```
test-results/[test-name]/test-failed-1.png
```

### Video Recording
Videos automatically saved on failure:
```
test-results/[test-name]/video.webm
```

---

## 🚦 CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Build application
        run: npm run build

      - name: Run E2E tests
        run: npx playwright test tests/e2e/
        env:
          CI: true

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 📈 Test Maintenance

### Adding New Tests

1. Create test file in `tests/e2e/`
2. Follow naming convention: `feature-name.spec.ts`
3. Use existing helpers and fixtures
4. Document test scenarios
5. Run and verify locally
6. Commit with descriptive message

### Updating Tests

1. Review failing tests
2. Check for UI changes
3. Update selectors if needed
4. Verify test logic still valid
5. Re-run and confirm passing
6. Update documentation

### Best Practices

✅ **DO:**
- Use descriptive test names
- Keep tests independent
- Use page object pattern
- Mock external services
- Clean up test data
- Document complex logic

❌ **DON'T:**
- Depend on test execution order
- Use hard-coded delays (use `waitFor...`)
- Test implementation details
- Skip error handling
- Leave commented code
- Ignore flaky tests

---

## 🔍 Troubleshooting

### Tests Fail Locally

1. **Dev server not running**
   ```bash
   npm run dev  # In separate terminal
   ```

2. **Port conflict**
   ```bash
   # Check if port 5173 is in use
   lsof -i :5173  # Mac/Linux
   netstat -ano | findstr :5173  # Windows
   ```

3. **Browser not installed**
   ```bash
   npx playwright install chromium
   ```

### Tests Timeout

1. Increase timeout in test:
   ```typescript
   test('slow test', async ({ page }) => {
     test.setTimeout(60000); // 60 seconds
   });
   ```

2. Check network tab for slow requests
3. Verify selectors are correct

### Flaky Tests

1. Add explicit waits:
   ```typescript
   await page.waitForLoadState('networkidle');
   ```

2. Use more specific selectors
3. Check for race conditions
4. Add retry logic for transient errors

---

## 📚 Resources

- [Playwright Documentation](https://playwright.dev/)
- [Test Execution Report](./TEST_EXECUTION_REPORT.md)
- [RestoreAssist API Docs](../../../docs/API.md)
- [Stripe Testing Guide](https://stripe.com/docs/testing)

---

## 🤝 Contributing

### Running Tests Before PR

```bash
# Run all tests
npm run test:e2e

# Run specific suite
npx playwright test tests/e2e/authentication-complete.spec.ts

# View results
npx playwright show-report
```

### Code Review Checklist

- [ ] Tests pass locally
- [ ] New tests documented
- [ ] No hardcoded credentials
- [ ] Selectors are maintainable
- [ ] Test data cleaned up
- [ ] Error messages clear
- [ ] No test interdependencies

---

## 📞 Support

For issues or questions:
- Create GitHub issue
- Check troubleshooting guide
- Review test execution report
- Contact QA team

---

**Last Updated:** 2025-10-24
**Test Suite Version:** 1.0.0
**Playwright Version:** ^1.40.0
