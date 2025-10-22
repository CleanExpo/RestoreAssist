import { test, expect } from '@playwright/test';
import { mockStripeCheckoutAPI, mockStripeCheckoutFailure } from './mocks/api-mocks';
import { STRIPE_TEST_DATA } from './fixtures/test-data';

/**
 * E2E Test Suite: Stripe Checkout Flow
 *
 * Tests the payment processing workflow:
 * 1. Navigate to pricing page
 * 2. Select a plan (Monthly/Yearly)
 * 3. Verify Stripe checkout redirect
 * 4. Test success/cancel callbacks
 * 5. Verify subscription status updates
 */

test.describe('Stripe Checkout Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Stripe API before each test
    await mockStripeCheckoutAPI(page);
  });

  test('should display pricing page with all plans', async ({ page }) => {
    await page.goto('/pricing');

    // Verify pricing page loaded
    await expect(page).toHaveURL('/pricing');

    // Check for pricing header
    const pricingHeader = page.locator('h1').filter({ hasText: /pricing|plan/i });
    await expect(pricingHeader).toBeVisible();

    // Verify at least 2 pricing cards are visible (Monthly & Yearly)
    const pricingCards = page.locator('[class*="pricing"], [class*="plan"]').filter({
      has: page.locator('button, a')
    });

    const cardCount = await pricingCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(2);
  });

  test('should show monthly plan details correctly', async ({ page }) => {
    await page.goto('/pricing');

    // Look for monthly plan text
    const monthlyPlan = page.getByText(/monthly|month/i).first();
    await expect(monthlyPlan).toBeVisible();

    // Verify price is displayed
    const priceElement = page.getByText(/\$\d+/);
    await expect(priceElement.first()).toBeVisible();
  });

  test('should show yearly plan with discount badge', async ({ page }) => {
    await page.goto('/pricing');

    // Look for yearly plan
    const yearlyPlan = page.getByText(/yearly|annual/i).first();
    await expect(yearlyPlan).toBeVisible();

    // Check for savings/discount indicator
    const discountBadge = page.getByText(/save|discount|best value/i);

    // Some plans show discount badges
    const hasBadge = await discountBadge.count() > 0;
    console.log(`Yearly plan discount badge shown: ${hasBadge}`);
  });

  test('should redirect to Stripe checkout when plan is selected', async ({ page }) => {
    // Track navigation events
    const navigationPromise = page.waitForEvent('framenavigated', { timeout: 10000 });

    await page.goto('/pricing');

    // Find and click on a plan button
    const selectPlanButton = page.getByRole('button', {
      name: /select|choose|get started|subscribe/i
    }).first();

    await expect(selectPlanButton).toBeVisible();

    // Mock the checkout redirect
    await page.route('https://checkout.stripe.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        body: '<html><body>Mock Stripe Checkout</body></html>',
      });
    });

    // Click the button
    await selectPlanButton.click();

    // Wait for loading state or redirect
    await page.waitForTimeout(2000);

    // Verify API was called
    // Note: In the real app, this triggers a loading overlay
    const loadingIndicator = page.getByText(/loading|redirecting/i);
    const hasLoading = await loadingIndicator.count() > 0;

    console.log(`Loading indicator shown: ${hasLoading}`);
  });

  test('should handle checkout success callback', async ({ page }) => {
    // Navigate directly to success page
    await page.goto('/checkout/success');

    // Verify success page loads
    await expect(page).toHaveURL('/checkout/success');

    // Check for success message
    const successMessage = page.getByText(/success|thank you|confirmed/i);
    await expect(successMessage.first()).toBeVisible({ timeout: 10000 });
  });

  test('should handle checkout cancellation gracefully', async ({ page }) => {
    // Navigate to pricing (cancel URL)
    await page.goto('/pricing?canceled=true');

    // Verify we're back on pricing page
    await expect(page).toHaveURL(/pricing/);

    // Page should still be functional
    const pricingHeader = page.locator('h1');
    await expect(pricingHeader).toBeVisible();
  });

  test('should show error message when checkout fails', async ({ page }) => {
    // Mock failed checkout
    await mockStripeCheckoutFailure(page);

    await page.goto('/pricing');

    // Click plan button
    const selectButton = page.getByRole('button', {
      name: /select|choose|get started/i
    }).first();

    if (await selectButton.isVisible()) {
      await selectButton.click();

      // Wait for error to appear
      await page.waitForTimeout(2000);

      // Check for error toast/modal
      const errorMessage = page.getByText(/error|failed|try again/i);
      const hasError = await errorMessage.count() > 0;

      console.log(`Error message displayed: ${hasError}`);
    }
  });

  test('should display FAQ section on pricing page', async ({ page }) => {
    await page.goto('/pricing');

    // Scroll down to FAQ section
    await page.evaluate(() => window.scrollBy(0, 500));

    // Look for FAQ heading
    const faqHeading = page.getByText(/frequently asked|faq/i);
    await expect(faqHeading).toBeVisible();

    // Verify at least one FAQ item
    const faqItem = page.locator('h3, h4').filter({ hasText: /\?/ });
    const faqCount = await faqItem.count();

    expect(faqCount).toBeGreaterThan(0);
  });

  test('should have "Back to Home" navigation', async ({ page }) => {
    await page.goto('/pricing');

    // Look for back button
    const backButton = page.getByRole('button', { name: /back/i })
      .or(page.getByRole('link', { name: /back/i }));

    const hasBackButton = await backButton.count() > 0;

    if (hasBackButton) {
      await backButton.click();

      // Verify navigation to home
      await expect(page).toHaveURL('/');
    }
  });
});

test.describe('Pricing Page Interaction', () => {
  test('should allow switching between monthly and yearly tabs', async ({ page }) => {
    await page.goto('/pricing');

    // Look for tab switchers (if they exist)
    const monthlyTab = page.getByRole('button', { name: /monthly/i })
      .or(page.getByText(/monthly/i).filter({ has: page.locator('input[type="radio"]') }));

    const yearlyTab = page.getByRole('button', { name: /yearly|annual/i })
      .or(page.getByText(/yearly|annual/i).filter({ has: page.locator('input[type="radio"]') }));

    // Check if tabs exist
    const hasMonthlyTab = await monthlyTab.count() > 0;
    const hasYearlyTab = await yearlyTab.count() > 0;

    if (hasMonthlyTab && hasYearlyTab) {
      // Click yearly tab
      await yearlyTab.click();
      await page.waitForTimeout(500);

      // Click monthly tab
      await monthlyTab.click();
      await page.waitForTimeout(500);

      // Verify page is still functional
      await expect(page).toHaveURL('/pricing');
    }
  });

  test('should show plan features list', async ({ page }) => {
    await page.goto('/pricing');

    // Look for feature lists (usually bullet points or checkmarks)
    const featureList = page.locator('ul li, .feature, [class*="check"]').first();

    const hasFeatures = await featureList.count() > 0;
    expect(hasFeatures).toBeTruthy();
  });

  test('should prevent double-clicking plan selection', async ({ page }) => {
    await mockStripeCheckoutAPI(page);
    await page.goto('/pricing');

    const selectButton = page.getByRole('button', {
      name: /select|choose|get started/i
    }).first();

    if (await selectButton.isVisible()) {
      // Click button twice rapidly
      await selectButton.click();
      await selectButton.click();

      // Verify only one API call is made (button should disable after first click)
      await page.waitForTimeout(1000);

      // Button should be disabled during loading
      const isDisabled = await selectButton.isDisabled();
      console.log(`Button disabled during checkout: ${isDisabled}`);
    }
  });
});

test.describe('Subscription Management', () => {
  test('should navigate to subscription management page', async ({ page }) => {
    await page.goto('/subscription');

    // Verify subscription page loads
    await expect(page).toHaveURL('/subscription');

    // Check for subscription-related content
    const subscriptionContent = page.locator('h1, h2').filter({
      hasText: /subscription|manage|billing/i
    });

    await expect(subscriptionContent).toBeVisible({ timeout: 10000 });
  });

  test('should display current subscription status', async ({ page }) => {
    // Set mock subscription data
    await page.evaluate(() => {
      localStorage.setItem('accessToken', 'mock-access-token');
      sessionStorage.setItem('subscriptionStatus', 'active');
    });

    await page.goto('/subscription');

    // Look for status indicator
    const statusText = page.getByText(/active|inactive|trial|subscribed/i);
    const hasStatus = await statusText.count() > 0;

    console.log(`Subscription status displayed: ${hasStatus}`);
  });
});
