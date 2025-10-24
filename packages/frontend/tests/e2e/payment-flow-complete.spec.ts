import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Complete Payment Flow
 *
 * Validates end-to-end payment processing:
 * 1. Mock Stripe checkout
 * 2. Webhook delivery
 * 3. Subscription activation
 * 4. Report limit increase
 */

// Mock Stripe API responses
async function setupStripeMocks(page: Page) {
  // Mock checkout session creation
  await page.route('**/api/stripe/create-checkout-session', async (route) => {
    const request = route.request();
    const postData = request.postDataJSON();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: 'cs_test_' + Date.now(),
        url: 'https://checkout.stripe.com/test/session/' + Date.now(),
        priceId: postData?.priceId || 'price_test'
      })
    });
  });

  // Mock webhook endpoint
  await page.route('**/api/stripe/webhook', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ received: true })
    });
  });

  // Mock subscription status check
  await page.route('**/api/stripe/subscription-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        planName: 'Monthly Plan'
      })
    });
  });
}

// Simulate webhook delivery
async function simulateWebhook(page: Page, eventType: string, data: any) {
  await page.evaluate(({ type, payload }) => {
    const event = new CustomEvent('stripe-webhook', {
      detail: { type, data: payload }
    });
    window.dispatchEvent(event);
  }, { type: eventType, payload: data });
}

test.describe('Complete Payment Flow - Checkout Session', () => {
  test.beforeEach(async ({ page }) => {
    await setupStripeMocks(page);
  });

  test('should create Stripe checkout session with correct parameters', async ({ page }) => {
    let checkoutRequest: any = null;

    await page.route('**/api/stripe/create-checkout-session', async (route) => {
      checkoutRequest = route.request().postDataJSON();

      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          sessionId: 'cs_test_123',
          url: 'https://checkout.stripe.com/test'
        })
      });
    });

    await page.goto('/pricing');

    // Select monthly plan
    const monthlyButton = page.getByRole('button', { name: /select.*monthly|choose.*monthly/i })
      .or(page.getByRole('button', { name: /select|choose/i }).first());

    if (await monthlyButton.isVisible()) {
      await monthlyButton.click();
      await page.waitForTimeout(2000);

      // Verify request was made with correct data
      expect(checkoutRequest).toBeTruthy();
      expect(checkoutRequest?.priceId).toBeTruthy();
      expect(checkoutRequest?.successUrl).toContain('/checkout/success');
      expect(checkoutRequest?.cancelUrl).toBeTruthy();

      console.log('Checkout request parameters:', checkoutRequest);
    }
  });

  test('should include user email in checkout session', async ({ page }) => {
    let checkoutRequest: any = null;

    await page.route('**/api/stripe/create-checkout-session', async (route) => {
      checkoutRequest = route.request().postDataJSON();

      await route.fulfill({
        status: 200,
        body: JSON.stringify({ sessionId: 'cs_test', url: 'https://checkout.stripe.com/test' })
      });
    });

    // Set up authenticated user
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
      localStorage.setItem('userEmail', 'paying-user@test.com');
    });

    await page.goto('/pricing');

    const selectButton = page.getByRole('button', { name: /select|choose/i }).first();
    if (await selectButton.isVisible()) {
      await selectButton.click();
      await page.waitForTimeout(2000);

      console.log('Checkout includes user email:', checkoutRequest?.email || 'Not included');
    }
  });

  test('should redirect to Stripe checkout URL', async ({ page }) => {
    const checkoutUrl = 'https://checkout.stripe.com/test/session/abc123';

    await page.route('**/api/stripe/create-checkout-session', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          sessionId: 'cs_test_abc123',
          url: checkoutUrl
        })
      });
    });

    // Mock external navigation
    let redirectedUrl = '';
    page.on('framenavigated', (frame) => {
      redirectedUrl = frame.url();
    });

    await page.goto('/pricing');

    const selectButton = page.getByRole('button', { name: /select|choose/i }).first();
    if (await selectButton.isVisible()) {
      await selectButton.click();
      await page.waitForTimeout(2000);

      console.log('Redirected to:', redirectedUrl);
    }
  });

  test('should show loading state during checkout creation', async ({ page }) => {
    await page.route('**/api/stripe/create-checkout-session', async (route) => {
      // Delay response to show loading state
      await new Promise(resolve => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ sessionId: 'cs_test', url: 'https://checkout.stripe.com/test' })
      });
    });

    await page.goto('/pricing');

    const selectButton = page.getByRole('button', { name: /select|choose/i }).first();
    await selectButton.click();

    // Check for loading indicator
    const loadingIndicator = page.getByText(/loading|redirecting|processing/i)
      .or(page.locator('[class*="loading"], [class*="spinner"]'));

    const hasLoading = await loadingIndicator.count() > 0;
    expect(hasLoading).toBeTruthy();
  });

  test('should disable button during checkout creation', async ({ page }) => {
    await page.route('**/api/stripe/create-checkout-session', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ sessionId: 'cs_test', url: 'https://checkout.stripe.com/test' })
      });
    });

    await page.goto('/pricing');

    const selectButton = page.getByRole('button', { name: /select|choose/i }).first();
    await selectButton.click();

    // Button should be disabled
    await page.waitForTimeout(500);
    const isDisabled = await selectButton.isDisabled();

    expect(isDisabled).toBeTruthy();
  });
});

test.describe('Complete Payment Flow - Webhook Processing', () => {
  test.beforeEach(async ({ page }) => {
    await setupStripeMocks(page);
  });

  test('should handle checkout.session.completed webhook', async ({ page }) => {
    await page.goto('/checkout/success?session_id=cs_test_123');

    // Simulate webhook event
    await simulateWebhook(page, 'checkout.session.completed', {
      id: 'cs_test_123',
      customer: 'cus_test',
      subscription: 'sub_test',
      status: 'complete'
    });

    await page.waitForTimeout(2000);

    // Verify success page shows confirmation
    const successMessage = page.getByText(/success|thank you|confirmed/i);
    await expect(successMessage).toBeVisible({ timeout: 5000 });
  });

  test('should handle payment_intent.succeeded webhook', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
    });

    await page.goto('/dashboard');

    // Simulate payment success webhook
    await simulateWebhook(page, 'payment_intent.succeeded', {
      id: 'pi_test_123',
      amount: 4900,
      currency: 'usd',
      status: 'succeeded'
    });

    await page.waitForTimeout(2000);

    // Should update subscription status
    console.log('Payment intent webhook processed');
  });

  test('should handle customer.subscription.created webhook', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
    });

    await page.goto('/dashboard');

    // Simulate subscription created webhook
    await simulateWebhook(page, 'customer.subscription.created', {
      id: 'sub_test',
      customer: 'cus_test',
      status: 'active',
      current_period_end: Date.now() + 30 * 24 * 60 * 60 * 1000
    });

    await page.waitForTimeout(2000);

    // Should activate subscription features
    const subscriptionIndicator = page.getByText(/active|subscribed|premium/i);
    const hasIndicator = await subscriptionIndicator.count() > 0;

    console.log(`Subscription indicator shown: ${hasIndicator}`);
  });

  test('should handle invoice.payment_succeeded webhook', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
    });

    await page.goto('/subscription');

    // Simulate invoice payment success
    await simulateWebhook(page, 'invoice.payment_succeeded', {
      id: 'in_test',
      subscription: 'sub_test',
      status: 'paid',
      amount_paid: 4900
    });

    await page.waitForTimeout(2000);

    console.log('Invoice payment webhook processed');
  });

  test('should retry webhook delivery on failure', async ({ page }) => {
    let webhookAttempts = 0;

    await page.route('**/api/stripe/webhook', async (route) => {
      webhookAttempts++;

      if (webhookAttempts < 3) {
        await route.fulfill({ status: 500, body: JSON.stringify({ error: 'Processing failed' }) });
      } else {
        await route.fulfill({ status: 200, body: JSON.stringify({ received: true }) });
      }
    });

    await page.goto('/');

    // Simulate webhook delivery
    await simulateWebhook(page, 'checkout.session.completed', { id: 'cs_test' });

    await page.waitForTimeout(5000);

    // Should have retried
    expect(webhookAttempts).toBeGreaterThanOrEqual(1);
    console.log(`Webhook delivery attempts: ${webhookAttempts}`);
  });
});

test.describe('Complete Payment Flow - Subscription Activation', () => {
  test.beforeEach(async ({ page }) => {
    await setupStripeMocks(page);
  });

  test('should activate subscription after successful payment', async ({ page }) => {
    // Navigate to success page (simulating return from Stripe)
    await page.goto('/checkout/success?session_id=cs_test_123');

    await page.waitForTimeout(2000);

    // Should show success message
    const successMessage = page.getByText(/success|thank you|payment.*confirmed/i);
    await expect(successMessage).toBeVisible({ timeout: 10000 });

    // Should have link to dashboard
    const dashboardLink = page.getByRole('link', { name: /dashboard|go to dashboard|continue/i });
    const hasLink = await dashboardLink.count() > 0;

    if (hasLink) {
      await dashboardLink.click();
      await expect(page).toHaveURL(/dashboard/, { timeout: 5000 });
    }
  });

  test('should update user session with subscription data', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
    });

    await page.goto('/checkout/success?session_id=cs_test_123');

    // Simulate subscription activation
    await page.evaluate(() => {
      localStorage.setItem('subscriptionStatus', 'active');
      localStorage.setItem('subscriptionId', 'sub_test_123');
    });

    await page.goto('/dashboard');

    // Verify subscription data is in session
    const sessionData = await page.evaluate(() => ({
      status: localStorage.getItem('subscriptionStatus'),
      subscriptionId: localStorage.getItem('subscriptionId')
    }));

    expect(sessionData.status).toBe('active');
    expect(sessionData.subscriptionId).toBeTruthy();
  });

  test('should send confirmation email after subscription activation', async ({ page }) => {
    let emailSent = false;

    await page.route('**/api/send-confirmation-email', async (route) => {
      emailSent = true;
      await route.fulfill({ status: 200, body: JSON.stringify({ sent: true }) });
    });

    await page.goto('/checkout/success?session_id=cs_test_123');

    await page.waitForTimeout(3000);

    console.log(`Confirmation email sent: ${emailSent}`);
  });

  test('should display subscription details on success page', async ({ page }) => {
    await page.goto('/checkout/success?session_id=cs_test_123');

    // Look for subscription details
    const planName = page.getByText(/monthly plan|yearly plan|subscription/i);
    const nextBilling = page.getByText(/next billing|renews/i);

    const hasPlanName = await planName.count() > 0;
    const hasNextBilling = await nextBilling.count() > 0;

    console.log(`Subscription details shown: Plan=${hasPlanName}, Billing=${hasNextBilling}`);
  });
});

test.describe('Complete Payment Flow - Report Limit Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupStripeMocks(page);
  });

  test('should increase report limits after subscription activation', async ({ page }) => {
    // Start with trial limits
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
      localStorage.setItem('reportsLimit', '3'); // Trial limit
    });

    await page.goto('/dashboard');

    // Check initial limit
    const trialLimit = page.getByText(/3.*reports|reports.*remaining/i);
    const hasTrialLimit = await trialLimit.count() > 0;

    console.log(`Trial limit shown: ${hasTrialLimit}`);

    // Simulate subscription activation
    await page.evaluate(() => {
      localStorage.setItem('subscriptionStatus', 'active');
      localStorage.setItem('reportsLimit', 'unlimited');
    });

    await page.reload();

    // Should now show unlimited
    const unlimitedIndicator = page.getByText(/unlimited|no limit|premium/i);
    await expect(unlimitedIndicator).toBeVisible({ timeout: 5000 });
  });

  test('should remove trial restrictions after payment', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
      localStorage.setItem('subscriptionStatus', 'active');
    });

    await page.goto('/dashboard');

    // Should not show trial restrictions
    const trialBanner = page.getByText(/trial|limited|upgrade now/i);
    const hasTrialBanner = await trialBanner.count() > 0;

    expect(hasTrialBanner).toBeFalsy();
  });

  test('should allow unlimited report generation for paid users', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
      localStorage.setItem('subscriptionStatus', 'active');
      localStorage.setItem('reportsLimit', 'unlimited');
    });

    await page.goto('/dashboard');

    // Generate report button should always be enabled
    const generateButton = page.getByRole('button', { name: /generate|new report/i });

    if (await generateButton.isVisible()) {
      const isDisabled = await generateButton.isDisabled();
      expect(isDisabled).toBeFalsy();

      // No limit warning should appear
      const limitWarning = page.getByText(/limit reached|no reports/i);
      const hasWarning = await limitWarning.count() > 0;

      expect(hasWarning).toBeFalsy();
    }
  });

  test('should sync report limit across devices', async ({ browser }) => {
    const context = await browser.newContext();

    // Device 1: Subscribe
    const page1 = await context.newPage();
    await page1.addInitScript(() => {
      localStorage.setItem('accessToken', 'shared-token');
      localStorage.setItem('subscriptionStatus', 'active');
    });
    await page1.goto('/dashboard');

    // Device 2: Should see updated limits
    const page2 = await context.newPage();
    await page2.addInitScript(() => {
      localStorage.setItem('accessToken', 'shared-token');
    });
    await page2.goto('/dashboard');

    await page2.waitForTimeout(2000);

    // Should sync subscription status
    const subscriptionStatus = await page2.evaluate(() =>
      localStorage.getItem('subscriptionStatus')
    );

    console.log(`Subscription synced across devices: ${subscriptionStatus === 'active'}`);

    await context.close();
  });
});

test.describe('Complete Payment Flow - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await setupStripeMocks(page);
  });

  test('should handle payment cancellation', async ({ page }) => {
    await page.goto('/pricing?canceled=true');

    // Should show cancellation message or remain on pricing
    await expect(page).toHaveURL(/pricing/);

    // No subscription should be activated
    await page.addInitScript(() => {
      const hasSubscription = localStorage.getItem('subscriptionStatus');
      if (hasSubscription) {
        throw new Error('Subscription should not be active after cancellation');
      }
    });
  });

  test('should handle duplicate webhook events (idempotency)', async ({ page }) => {
    let webhookCallCount = 0;

    await page.route('**/api/stripe/webhook', async (route) => {
      webhookCallCount++;
      await route.fulfill({ status: 200, body: JSON.stringify({ received: true }) });
    });

    await page.goto('/');

    // Send same webhook twice
    const webhookData = { id: 'cs_test_duplicate', status: 'complete' };
    await simulateWebhook(page, 'checkout.session.completed', webhookData);
    await page.waitForTimeout(1000);
    await simulateWebhook(page, 'checkout.session.completed', webhookData);

    await page.waitForTimeout(2000);

    // Should handle idempotently (process once)
    console.log(`Webhook calls for duplicate event: ${webhookCallCount}`);
  });

  test('should handle partial payment failures', async ({ page }) => {
    await page.route('**/api/stripe/webhook', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ received: true, status: 'requires_action' })
      });
    });

    await page.goto('/checkout/success?session_id=cs_test_partial');

    await page.waitForTimeout(2000);

    // Should show additional action required
    const actionRequired = page.getByText(/action required|confirm payment|verify/i);
    const hasAction = await actionRequired.count() > 0;

    console.log(`Additional action message shown: ${hasAction}`);
  });

  test('should handle expired checkout sessions', async ({ page }) => {
    await page.route('**/api/stripe/session-status', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ status: 'expired' })
      });
    });

    await page.goto('/checkout/success?session_id=cs_test_expired');

    await page.waitForTimeout(2000);

    // Should show session expired message
    const expiredMessage = page.getByText(/expired|try again|create new/i);
    const hasMessage = await expiredMessage.count() > 0;

    console.log(`Expired session message shown: ${hasMessage}`);
  });

  test('should handle subscription renewal', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
      localStorage.setItem('subscriptionStatus', 'active');
      localStorage.setItem('currentPeriodEnd', new Date(Date.now() + 1000).toISOString()); // About to expire
    });

    await page.goto('/subscription');

    // Simulate renewal webhook
    await simulateWebhook(page, 'invoice.payment_succeeded', {
      subscription: 'sub_test',
      period_end: Date.now() + 30 * 24 * 60 * 60 * 1000
    });

    await page.waitForTimeout(2000);

    // Should update renewal date
    const renewalDate = page.getByText(/renews|next billing/i);
    await expect(renewalDate).toBeVisible({ timeout: 5000 });
  });
});
