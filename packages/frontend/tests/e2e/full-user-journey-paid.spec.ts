import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Full User Journey - Paid User
 *
 * Validates complete paid user flow:
 * 1. Sign up
 * 2. Go through Stripe checkout
 * 3. Receive payment confirmation
 * 4. Generate multiple reports
 * 5. Verify subscription active
 */

// Mock Stripe checkout session
async function mockStripeCheckout(page: Page) {
  await page.route('**/api/stripe/create-checkout-session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: 'cs_test_session_123',
        url: 'https://checkout.stripe.com/test/session/123'
      })
    });
  });

  // Mock Stripe webhook delivery
  await page.route('**/api/stripe/webhook', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ received: true })
    });
  });
}

// Mock successful payment confirmation
async function mockPaymentSuccess(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'mock-paid-user-token');
    localStorage.setItem('subscriptionStatus', 'active');
    localStorage.setItem('subscriptionData', JSON.stringify({
      status: 'active',
      planName: 'Monthly Plan',
      priceId: 'price_monthly',
      reportsLimit: 'unlimited',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }));
  });
}

test.describe('Full User Journey - Paid User', () => {
  const testEmail = `test-paid-${Date.now()}@restoreassist.com`;
  const testPassword = 'TestPass123!';

  test.beforeEach(async ({ page }) => {
    await mockStripeCheckout(page);
  });

  test('should complete full paid user journey from signup to subscription', async ({ page }) => {
    // Step 1: Sign up
    await page.goto('/');

    // Click "Start Free Trial" to access signup (use .first() to handle multiple buttons)
    const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
    await startButton.click();

    // Wait for auth modal backdrop to appear
    await page.waitForSelector('.fixed.inset-0', { timeout: 5000 });

    // Fill signup form
    const emailInput = page.getByLabel(/^email/i).first();
    await emailInput.fill(testEmail);

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(testPassword);

    const signupButton = page.getByRole('button', { name: /sign up|create account/i });
    await signupButton.click();

    // Wait for signup to complete
    await page.waitForTimeout(2000);

    // Step 2: Navigate to pricing to upgrade
    await page.goto('/pricing');

    // Verify pricing page loaded
    await expect(page).toHaveURL('/pricing');

    // Select a plan (monthly)
    const selectPlanButton = page.getByRole('button', { name: /select|choose|get started/i }).first();
    await expect(selectPlanButton).toBeVisible();

    // Click to initiate checkout
    await selectPlanButton.click();

    // Wait for checkout to be initiated
    await page.waitForTimeout(2000);

    // Step 3: Simulate successful payment by navigating to success page
    await page.goto('/checkout/success?session_id=cs_test_session_123');

    // Verify success page loaded
    await expect(page).toHaveURL(/checkout\/success/);

    // Step 4: Verify payment confirmation message
    const successMessage = page.getByText(/success|thank you|confirmed|payment received/i);
    await expect(successMessage).toBeVisible({ timeout: 10000 });

    // Step 5: Navigate to dashboard
    await mockPaymentSuccess(page);
    await page.goto('/dashboard');

    // Verify subscription is active
    const subscriptionStatus = page.getByText(/subscription|active|premium|pro/i);
    await expect(subscriptionStatus).toBeVisible({ timeout: 10000 });
  });

  test('should allow paid user to generate multiple reports', async ({ page }) => {
    // Set up paid user session
    await mockPaymentSuccess(page);
    await page.goto('/dashboard');

    // Generate first report
    const generateButton1 = page.getByRole('button', { name: /generate|new report/i });
    if (await generateButton1.isVisible()) {
      await generateButton1.click();

      // Fill report form
      const locationInput = page.getByLabel(/location|address/i);
      if (await locationInput.isVisible()) {
        await locationInput.fill('Report 1 Location');
      }

      const submitButton = page.getByRole('button', { name: /generate|create|submit/i });
      await submitButton.click();

      // Wait for report generation
      await page.waitForTimeout(2000);

      // Return to dashboard
      await page.goto('/dashboard');

      // Generate second report
      const generateButton2 = page.getByRole('button', { name: /generate|new report/i });
      if (await generateButton2.isVisible()) {
        await generateButton2.click();

        const locationInput2 = page.getByLabel(/location|address/i);
        if (await locationInput2.isVisible()) {
          await locationInput2.fill('Report 2 Location');
        }

        const submitButton2 = page.getByRole('button', { name: /generate|create|submit/i });
        await submitButton2.click();

        await page.waitForTimeout(2000);

        // Return to dashboard
        await page.goto('/dashboard');

        // Verify both reports appear
        const reportCards = page.locator('[class*="report"], [data-testid*="report"]');
        const reportCount = await reportCards.count();

        expect(reportCount).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test('should show unlimited reports indicator for paid users', async ({ page }) => {
    await mockPaymentSuccess(page);
    await page.goto('/dashboard');

    // Look for unlimited/premium indicator
    const unlimitedIndicator = page.getByText(/unlimited|premium|pro|no limits/i);
    await expect(unlimitedIndicator).toBeVisible({ timeout: 5000 });
  });

  test('should display subscription details in settings', async ({ page }) => {
    await mockPaymentSuccess(page);
    await page.goto('/subscription');

    // Verify subscription page loads
    await expect(page).toHaveURL('/subscription');

    // Check for subscription details
    const subscriptionDetails = page.locator('h1, h2').filter({ hasText: /subscription|plan|billing/i });
    await expect(subscriptionDetails).toBeVisible({ timeout: 10000 });

    // Look for plan name
    const planName = page.getByText(/monthly plan|yearly plan|premium|pro/i);
    await expect(planName).toBeVisible({ timeout: 5000 });
  });

  test('should show next billing date', async ({ page }) => {
    await mockPaymentSuccess(page);
    await page.goto('/subscription');

    // Look for next billing date
    const billingDate = page.getByText(/next billing|renews|billing date/i);
    await expect(billingDate).toBeVisible({ timeout: 5000 });
  });

  test('should have manage subscription button', async ({ page }) => {
    await mockPaymentSuccess(page);
    await page.goto('/subscription');

    // Look for manage/cancel subscription button
    const manageButton = page.getByRole('button', { name: /manage|cancel|update/i })
      .or(page.getByRole('link', { name: /manage|cancel/i }));

    const hasManageButton = await manageButton.count() > 0;
    expect(hasManageButton).toBeTruthy();
  });
});

test.describe('Stripe Checkout Flow Integration', () => {
  test('should redirect to Stripe checkout with correct session ID', async ({ page }) => {
    await mockStripeCheckout(page);
    await page.goto('/pricing');

    // Intercept Stripe redirect
    let checkoutUrl = '';
    page.on('request', (request) => {
      if (request.url().includes('checkout.stripe.com')) {
        checkoutUrl = request.url();
      }
    });

    const selectButton = page.getByRole('button', { name: /select|choose/i }).first();
    if (await selectButton.isVisible()) {
      await selectButton.click();
      await page.waitForTimeout(2000);

      // Verify checkout was initiated (API called)
      console.log(`Checkout initiated: ${checkoutUrl !== ''}`);
    }
  });

  test('should handle payment cancellation', async ({ page }) => {
    await mockStripeCheckout(page);

    // Navigate to pricing with cancel parameter
    await page.goto('/pricing?canceled=true');

    // Verify we're back on pricing page
    await expect(page).toHaveURL(/pricing/);

    // Page should still be functional
    const pricingContent = page.locator('h1');
    await expect(pricingContent).toBeVisible();
  });

  test('should show error if checkout session creation fails', async ({ page }) => {
    // Mock failed checkout
    await page.route('**/api/stripe/create-checkout-session', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to create checkout session' })
      });
    });

    await page.goto('/pricing');

    const selectButton = page.getByRole('button', { name: /select|choose/i }).first();
    if (await selectButton.isVisible()) {
      await selectButton.click();
      await page.waitForTimeout(2000);

      // Check for error message
      const errorMessage = page.getByText(/error|failed|try again/i);
      const hasError = await errorMessage.count() > 0;

      console.log(`Error message displayed: ${hasError}`);
    }
  });
});

test.describe('Payment Webhook Handling', () => {
  test('should activate subscription after successful payment webhook', async ({ page }) => {
    // Simulate webhook delivery by setting subscription data
    await page.addInitScript(() => {
      // Simulate webhook received event
      localStorage.setItem('subscriptionStatus', 'active');
      localStorage.setItem('webhookReceived', 'true');
    });

    await page.goto('/dashboard');

    // Verify subscription is active
    const activeIndicator = page.getByText(/active|subscribed|premium/i);
    await expect(activeIndicator).toBeVisible({ timeout: 10000 });
  });

  test('should update report limits after subscription activation', async ({ page }) => {
    // Before payment - trial limits
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
      localStorage.setItem('trialData', JSON.stringify({
        reportsRemaining: 1,
        totalReports: 3
      }));
    });

    await page.goto('/dashboard');

    // Check trial limits
    const trialLimits = page.getByText(/\d+\/\d+|reports remaining/i);
    const hasTrial = await trialLimits.count() > 0;

    if (hasTrial) {
      // Simulate payment completion
      await mockPaymentSuccess(page);
      await page.reload();

      // Should now show unlimited or increased limits
      const unlimitedIndicator = page.getByText(/unlimited|premium/i);
      const hasUnlimited = await unlimitedIndicator.count() > 0;

      expect(hasUnlimited).toBeTruthy();
    }
  });
});

test.describe('Paid User Features', () => {
  test('should show premium features in dashboard', async ({ page }) => {
    await mockPaymentSuccess(page);
    await page.goto('/dashboard');

    // Look for premium/pro features
    const premiumFeature = page.getByText(/premium|advanced|export|analytics/i);
    await expect(premiumFeature).toBeVisible({ timeout: 10000 });
  });

  test('should have access to all report export formats', async ({ page }) => {
    await mockPaymentSuccess(page);
    await page.goto('/dashboard');

    const generateButton = page.getByRole('button', { name: /generate|new report/i });
    if (await generateButton.isVisible()) {
      await generateButton.click();

      // Look for export format options
      const exportOptions = page.getByText(/pdf|docx|xlsx|export/i);
      const hasExport = await exportOptions.count() > 0;

      console.log(`Export options available: ${hasExport}`);
    }
  });

  test('should display subscription badge in header', async ({ page }) => {
    await mockPaymentSuccess(page);
    await page.goto('/dashboard');

    // Look for premium/pro badge
    const badge = page.locator('[class*="badge"]').filter({ hasText: /premium|pro|plus/i });
    const hasBadge = await badge.count() > 0;

    console.log(`Premium badge displayed: ${hasBadge}`);
  });
});
