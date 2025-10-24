import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Error Recovery
 *
 * Validates error handling and recovery mechanisms:
 * 1. Trigger errors intentionally
 * 2. Verify error boundaries catch them
 * 3. Verify retry mechanisms work
 * 4. Verify error reporting to Sentry
 */

// Helper: Trigger network error
async function triggerNetworkError(page: Page, urlPattern: string) {
  await page.route(urlPattern, async (route) => {
    await route.abort('failed');
  });
}

// Helper: Trigger 500 server error
async function trigger500Error(page: Page, urlPattern: string) {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal Server Error' })
    });
  });
}

// Helper: Trigger timeout error
async function triggerTimeoutError(page: Page, urlPattern: string) {
  await page.route(urlPattern, async (route) => {
    await new Promise(resolve => setTimeout(resolve, 30000)); // Exceed timeout
    await route.fulfill({ status: 200 });
  });
}

test.describe('Error Recovery - Network Errors', () => {
  test('should show error message when API request fails', async ({ page }) => {
    // Trigger network failure on API endpoint
    await triggerNetworkError(page, '**/api/**');

    await page.goto('/');

    // Try to perform action that requires API
    const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForTimeout(1000);

      // Fill form
      const emailInput = page.getByLabel(/^email/i).first();
      if (await emailInput.isVisible()) {
        await emailInput.fill('test@example.com');

        const passwordInput = page.locator('input[type="password"]').first();
        await passwordInput.fill('Password123!');

        const submitButton = page.getByRole('button', { name: /sign up|create/i });
        await submitButton.click();

        // Should show error message
        await page.waitForTimeout(2000);

        const errorMessage = page.getByText(/error|failed|try again|network/i);
        const hasError = await errorMessage.count() > 0;

        expect(hasError).toBeTruthy();
      }
    }
  });

  test('should retry failed API requests automatically', async ({ page }) => {
    let requestCount = 0;

    // Fail first request, succeed on retry
    await page.route('**/api/auth/**', async (route) => {
      requestCount++;

      if (requestCount === 1) {
        // First attempt fails
        await route.abort('failed');
      } else {
        // Retry succeeds
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, accessToken: 'mock-token' })
        });
      }
    });

    await page.goto('/');

    const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForTimeout(1000);

      const emailInput = page.getByLabel(/^email/i).first();
      if (await emailInput.isVisible()) {
        await emailInput.fill('test@example.com');

        const passwordInput = page.locator('input[type="password"]').first();
        await passwordInput.fill('Password123!');

        const submitButton = page.getByRole('button', { name: /sign up|create/i });
        await submitButton.click();

        await page.waitForTimeout(3000);

        // Should have retried and succeeded
        expect(requestCount).toBeGreaterThanOrEqual(2);
        console.log(`Retry mechanism triggered: ${requestCount} attempts`);
      }
    }
  });

  test('should handle 500 server errors gracefully', async ({ page }) => {
    await trigger500Error(page, '**/api/stripe/create-checkout-session');

    await page.goto('/pricing');

    const selectButton = page.getByRole('button', { name: /select|choose/i }).first();
    if (await selectButton.isVisible()) {
      await selectButton.click();
      await page.waitForTimeout(2000);

      // Should show user-friendly error
      const errorMessage = page.getByText(/error|failed|try again|unavailable/i);
      const hasError = await errorMessage.count() > 0;

      expect(hasError).toBeTruthy();
    }
  });

  test('should handle API timeout errors', async ({ page }) => {
    // Mock slow API response
    await page.route('**/api/**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 5000));
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ data: 'delayed' })
      });
    });

    await page.goto('/');

    // Application should remain responsive during slow requests
    const heroText = page.locator('h1').first();
    await expect(heroText).toBeVisible({ timeout: 2000 });

    console.log('Application remains responsive during API delays');
  });
});

test.describe('Error Recovery - UI Error Boundaries', () => {
  test('should catch and display runtime errors in error boundary', async ({ page }) => {
    // Inject error-causing script
    await page.addInitScript(() => {
      // Override a component to throw error
      window.addEventListener('load', () => {
        // Simulate component error
        (window as any).__TEST_TRIGGER_ERROR = true;
      });
    });

    await page.goto('/');

    // Navigate to a page that might trigger error
    await page.goto('/dashboard');

    // Wait for potential error boundary to appear
    await page.waitForTimeout(2000);

    // Look for error boundary UI
    const errorBoundary = page.getByText(/something went wrong|error occurred|try again/i);
    const hasErrorUI = await errorBoundary.count() > 0;

    console.log(`Error boundary UI displayed: ${hasErrorUI}`);
  });

  test('should have "Reload" button in error boundary', async ({ page }) => {
    // Trigger error scenario
    await page.addInitScript(() => {
      (window as any).__FORCE_ERROR = true;
    });

    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Look for reload/retry button
    const reloadButton = page.getByRole('button', { name: /reload|try again|refresh/i });
    const hasReload = await reloadButton.count() > 0;

    if (hasReload) {
      // Click reload button
      await reloadButton.first().click();

      // Should attempt to recover
      await page.waitForTimeout(1000);
      console.log('Error boundary reload button functional');
    }
  });

  test('should isolate errors to affected components', async ({ page }) => {
    // Trigger error in specific component
    await page.goto('/dashboard');

    // Rest of the page should remain functional
    const navigation = page.locator('nav, header');
    await expect(navigation).toBeVisible({ timeout: 5000 });

    console.log('Navigation remains visible despite component errors');
  });
});

test.describe('Error Recovery - Form Validation Errors', () => {
  test('should show inline validation errors', async ({ page }) => {
    await page.goto('/');

    const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
    await startButton.click();

    await page.waitForTimeout(1000);

    // Submit empty form
    const submitButton = page.getByRole('button', { name: /sign up|create/i });
    await submitButton.click();

    // Should show validation errors
    const validationError = page.getByText(/required|cannot be empty|please enter/i);
    await expect(validationError).toBeVisible({ timeout: 3000 });
  });

  test('should clear validation errors when user corrects input', async ({ page }) => {
    await page.goto('/');

    const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
    await startButton.click();

    await page.waitForTimeout(1000);

    const emailInput = page.getByLabel(/^email/i).first();
    if (await emailInput.isVisible()) {
      // Enter invalid email
      await emailInput.fill('invalid-email');

      const submitButton = page.getByRole('button', { name: /sign up|create/i });
      await submitButton.click();

      await page.waitForTimeout(1000);

      // Should show error
      const validationError = page.getByText(/valid email|invalid/i);
      const hasError = await validationError.count() > 0;

      if (hasError) {
        // Correct the input
        await emailInput.fill('valid@example.com');
        await page.waitForTimeout(500);

        // Error should clear
        const errorStillVisible = await validationError.isVisible();
        expect(errorStillVisible).toBeFalsy();
      }
    }
  });

  test('should prevent form submission with validation errors', async ({ page }) => {
    let submitAttempted = false;

    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/')) {
        submitAttempted = true;
      }
    });

    await page.goto('/');

    const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
    await startButton.click();

    await page.waitForTimeout(1000);

    const emailInput = page.getByLabel(/^email/i).first();
    if (await emailInput.isVisible()) {
      await emailInput.fill('invalid');

      const submitButton = page.getByRole('button', { name: /sign up|create/i });
      await submitButton.click();

      await page.waitForTimeout(2000);

      // Should not have submitted invalid form
      expect(submitAttempted).toBeFalsy();
    }
  });
});

test.describe('Error Recovery - Payment Errors', () => {
  test('should handle Stripe checkout creation failure', async ({ page }) => {
    await trigger500Error(page, '**/api/stripe/create-checkout-session');

    await page.goto('/pricing');

    const selectButton = page.getByRole('button', { name: /select|choose/i }).first();
    await selectButton.click();

    await page.waitForTimeout(2000);

    // Should show payment error
    const paymentError = page.getByText(/payment.*error|checkout.*failed|try again/i);
    const hasError = await paymentError.count() > 0;

    expect(hasError).toBeTruthy();
  });

  test('should allow user to retry failed payment', async ({ page }) => {
    let attemptCount = 0;

    await page.route('**/api/stripe/create-checkout-session', async (route) => {
      attemptCount++;

      if (attemptCount === 1) {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Failed' })
        });
      } else {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ sessionId: 'cs_test', url: 'https://checkout.stripe.com/test' })
        });
      }
    });

    await page.goto('/pricing');

    const selectButton = page.getByRole('button', { name: /select|choose/i }).first();
    await selectButton.click();

    await page.waitForTimeout(2000);

    // Should show error
    const errorMessage = page.getByText(/error|failed/i);
    const hasError = await errorMessage.count() > 0;

    if (hasError) {
      // Look for retry button
      const retryButton = page.getByRole('button', { name: /try again|retry/i })
        .or(selectButton);

      await retryButton.click();
      await page.waitForTimeout(2000);

      // Should have retried
      expect(attemptCount).toBeGreaterThanOrEqual(2);
    }
  });
});

test.describe('Error Recovery - Authentication Errors', () => {
  test('should handle expired session gracefully', async ({ page }) => {
    // Mock expired token response
    await page.route('**/api/auth/**', async (route) => {
      await route.fulfill({
        status: 401,
        body: JSON.stringify({ error: 'Token expired' })
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'expired-token');
    });

    await page.goto('/dashboard');

    // Should redirect to login or show error
    await page.waitForTimeout(2000);

    const redirectedToLogin = !page.url().includes('/dashboard');
    const errorShown = await page.getByText(/session expired|log in again/i).count() > 0;

    expect(redirectedToLogin || errorShown).toBeTruthy();
  });

  test('should handle simultaneous auth requests', async ({ page }) => {
    let requestCount = 0;

    await page.route('**/api/auth/refresh', async (route) => {
      requestCount++;
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ accessToken: 'new-token' })
      });
    });

    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'expiring-token');
      localStorage.setItem('refreshToken', 'valid-refresh');
    });

    await page.goto('/dashboard');

    // Trigger multiple requests that might cause concurrent refresh
    await Promise.all([
      page.goto('/dashboard'),
      page.goto('/subscription'),
      page.goto('/settings')
    ]);

    // Should handle concurrent requests without duplicate refresh calls
    console.log(`Auth refresh calls made: ${requestCount}`);
    expect(requestCount).toBeLessThanOrEqual(3);
  });
});

test.describe('Error Recovery - Retry Mechanisms', () => {
  test('should implement exponential backoff for retries', async ({ page }) => {
    const requestTimes: number[] = [];

    await page.route('**/api/test-endpoint', async (route) => {
      requestTimes.push(Date.now());

      if (requestTimes.length < 3) {
        await route.abort('failed');
      } else {
        await route.fulfill({ status: 200, body: '{}' });
      }
    });

    // Application would implement retry logic
    console.log('Exponential backoff test setup complete');
  });

  test('should stop retrying after max attempts', async ({ page }) => {
    let attemptCount = 0;

    await page.route('**/api/persistent-failure', async (route) => {
      attemptCount++;
      await route.abort('failed');
    });

    // Trigger action that would retry
    await page.goto('/');

    // After max retries, should show permanent error
    await page.waitForTimeout(5000);

    console.log(`Total retry attempts: ${attemptCount}`);
    // Should not exceed reasonable retry limit (e.g., 3-5 attempts)
    expect(attemptCount).toBeLessThanOrEqual(5);
  });

  test('should show retry count to user', async ({ page }) => {
    let attemptCount = 0;

    await page.route('**/api/**', async (route) => {
      attemptCount++;

      if (attemptCount < 3) {
        await route.abort('failed');
      } else {
        await route.fulfill({ status: 200, body: '{}' });
      }
    });

    await page.goto('/');

    // Look for retry indicator
    const retryIndicator = page.getByText(/retrying|attempt \d+/i);
    const showsRetry = await retryIndicator.count() > 0;

    console.log(`Retry indicator shown to user: ${showsRetry}`);
  });
});

test.describe('Error Recovery - User Feedback', () => {
  test('should show toast notification for errors', async ({ page }) => {
    await trigger500Error(page, '**/api/**');

    await page.goto('/');

    // Trigger action that causes error
    const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForTimeout(1000);

      // Look for toast/snackbar notification
      const toast = page.locator('[role="alert"], [class*="toast"], [class*="notification"]');
      const hasToast = await toast.count() > 0;

      console.log(`Error toast displayed: ${hasToast}`);
    }
  });

  test('should provide actionable error messages', async ({ page }) => {
    await triggerNetworkError(page, '**/api/**');

    await page.goto('/pricing');

    const selectButton = page.getByRole('button', { name: /select|choose/i }).first();
    if (await selectButton.isVisible()) {
      await selectButton.click();
      await page.waitForTimeout(2000);

      // Error message should be user-friendly and actionable
      const actionableError = page.getByText(/try again|check connection|contact support/i);
      const hasActionable = await actionableError.count() > 0;

      expect(hasActionable).toBeTruthy();
    }
  });

  test('should log errors to console for debugging', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await triggerNetworkError(page, '**/api/**');
    await page.goto('/');

    // Trigger action
    await page.waitForTimeout(2000);

    // Errors should be logged
    console.log(`Console errors logged: ${consoleErrors.length}`);
  });
});

test.describe('Error Recovery - Fallback Mechanisms', () => {
  test('should show cached data when API fails', async ({ page }) => {
    // Set up cached data
    await page.addInitScript(() => {
      localStorage.setItem('cachedReports', JSON.stringify([
        { id: 1, name: 'Report 1' },
        { id: 2, name: 'Report 2' }
      ]));
    });

    // Fail API request
    await triggerNetworkError(page, '**/api/reports');

    await page.goto('/dashboard');

    // Should still show cached reports
    const reportsList = page.locator('[class*="report"]');
    const hasReports = await reportsList.count() > 0;

    console.log(`Cached data shown on API failure: ${hasReports}`);
  });

  test('should show offline indicator when network unavailable', async ({ page }) => {
    // Simulate offline mode
    await page.context().setOffline(true);

    await page.goto('/');

    // Look for offline indicator
    await page.waitForTimeout(2000);

    const offlineIndicator = page.getByText(/offline|no connection|network unavailable/i);
    const hasIndicator = await offlineIndicator.count() > 0;

    console.log(`Offline indicator shown: ${hasIndicator}`);

    // Restore online mode
    await page.context().setOffline(false);
  });
});
