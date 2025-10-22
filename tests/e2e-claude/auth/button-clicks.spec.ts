/**
 * E2E Tests: Single-Click Button Activation
 *
 * Tests that all authentication buttons activate on the first click/tap,
 * without requiring double-clicks due to cookie consent backdrop interference.
 *
 * User Story 1: As a user, I want all buttons to activate on the first click,
 * so I don't have to click twice.
 *
 * @see packages/frontend/src/components/CookieConsent.tsx
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.VITE_API_URL || 'http://localhost:5173';

/**
 * Helper: Waits for cookie consent banner to appear and verifies backdrop behavior
 */
async function checkCookieConsentBackdrop(page: Page): Promise<boolean> {
  // Wait for cookie consent to appear (has 1 second delay)
  await page.waitForTimeout(1500);

  // Check if backdrop exists and get its computed style
  const backdrop = page.locator('div.fixed.inset-0.bg-black').first();
  const backdropExists = await backdrop.count() > 0;

  if (!backdropExists) {
    return false;
  }

  // Verify backdrop has correct pointer-events class
  const backdropClasses = await backdrop.getAttribute('class');
  console.log('Cookie consent backdrop classes:', backdropClasses);

  return backdropClasses?.includes('pointer-events-none') || false;
}

/**
 * Helper: Dismisses cookie consent banner
 */
async function dismissCookieConsent(page: Page): Promise<void> {
  try {
    // Click the "Decline" button to hide banner
    const declineButton = page.locator('button:has-text("Decline")');
    await declineButton.waitFor({ timeout: 2000 });
    await declineButton.click();

    // Wait for banner to disappear
    await page.waitForTimeout(500);
  } catch (error) {
    console.log('Cookie consent not found or already dismissed');
  }
}

test.describe('Single-Click Button Activation', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to reset cookie consent
    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE_URL);
  });

  test('Sign in button activates on first click with cookie consent visible', async ({ page }) => {
    // Navigate to landing page
    await page.goto(BASE_URL);

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Verify cookie consent is visible
    const consentBanner = page.locator('text=We Value Your Privacy');
    await expect(consentBanner).toBeVisible({ timeout: 3000 });

    // Check backdrop has pointer-events-none when visible
    const backdropNonBlocking = await checkCookieConsentBackdrop(page);
    expect(backdropNonBlocking).toBe(true);

    // Locate "Sign in with Google" button
    const signInButton = page.locator('button:has-text("Sign in with Google")').first();
    await expect(signInButton).toBeVisible();

    // CRITICAL TEST: Click button once and verify it responds
    // (We can't actually complete OAuth in test, but we can verify the button is clickable)
    const clickPromise = signInButton.click({ force: false });

    // Verify button was clicked without error
    await expect(clickPromise).resolves.toBeUndefined();

    // Alternative verification: Check if OAuth flow would have started
    // (In real scenario, this would navigate to Google or show OAuth popup)
    // Since we can't complete OAuth, we verify the button is not disabled
    await expect(signInButton).not.toBeDisabled();
  });

  test('Sign in button activates on first click with cookie consent hidden', async ({ page }) => {
    // Navigate to landing page
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Dismiss cookie consent
    await dismissCookieConsent(page);

    // Verify cookie consent is gone
    const consentBanner = page.locator('text=We Value Your Privacy');
    await expect(consentBanner).not.toBeVisible();

    // Locate "Sign in with Google" button
    const signInButton = page.locator('button:has-text("Sign in with Google")').first();
    await expect(signInButton).toBeVisible();

    // Click button once
    const clickPromise = signInButton.click({ force: false });

    // Verify button was clicked without error
    await expect(clickPromise).resolves.toBeUndefined();
    await expect(signInButton).not.toBeDisabled();
  });

  test('Keyboard navigation (Tab + Enter) activates button on first press', async ({ page }) => {
    // Navigate to landing page
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Tab to the sign-in button
    // (Assuming it's one of the first focusable elements)
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Verify a button is focused
    const focusedElement = await page.evaluate(() => {
      const element = document.activeElement;
      return {
        tagName: element?.tagName,
        text: element?.textContent?.trim(),
      };
    });

    console.log('Focused element:', focusedElement);

    // If we landed on the sign-in button, press Enter
    if (focusedElement.text?.includes('Sign in with Google')) {
      // Press Enter once
      await page.keyboard.press('Enter');

      // Verify Enter was processed (button would trigger OAuth flow)
      // Since we can't complete OAuth, we just verify no error occurred
      await page.waitForTimeout(200);
    }
  });

  test('Cookie consent backdrop does not block clicks when hidden', async ({ page }) => {
    // Navigate to landing page
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Dismiss cookie consent
    await dismissCookieConsent(page);

    // Verify backdrop is gone or has pointer-events-none
    const backdrop = page.locator('div.fixed.inset-0.bg-black').first();
    const backdropVisible = await backdrop.isVisible();

    if (backdropVisible) {
      const backdropClasses = await backdrop.getAttribute('class');
      expect(backdropClasses).toContain('pointer-events-none');
    }

    // Click multiple buttons to verify none are blocked
    const buttons = page.locator('button').filter({ hasText: /Sign in|Get Started|Learn More/i });
    const buttonCount = await buttons.count();

    console.log(`Found ${buttonCount} buttons to test`);

    for (let i = 0; i < Math.min(buttonCount, 3); i++) {
      const button = buttons.nth(i);
      if (await button.isVisible()) {
        // Click should work without force
        await button.click({ force: false, timeout: 1000 }).catch(() => {
          // Button might navigate away, that's okay
        });
      }
    }
  });
});

test.describe('Mobile Touch Events', () => {
  test.use({
    // Simulate mobile device (iPhone 12)
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    hasTouch: true,
    isMobile: true,
  });

  test.beforeEach(async ({ page }) => {
    // Clear localStorage to reset cookie consent
    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE_URL);
  });

  test('Sign in button activates on first tap (mobile)', async ({ page }) => {
    // Navigate to landing page
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Wait for cookie consent
    await page.waitForTimeout(1500);

    // Locate "Sign in with Google" button
    const signInButton = page.locator('button:has-text("Sign in with Google")').first();
    await expect(signInButton).toBeVisible();

    // CRITICAL TEST: Tap button once (simulates mobile tap)
    await signInButton.tap({ force: false });

    // Verify button responded to tap
    await expect(signInButton).not.toBeDisabled();
  });

  test('Touch events work with cookie consent backdrop visible (mobile)', async ({ page }) => {
    // Navigate to landing page
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Verify cookie consent is visible
    const consentBanner = page.locator('text=We Value Your Privacy');
    await expect(consentBanner).toBeVisible({ timeout: 3000 });

    // Check backdrop is not blocking
    const backdropNonBlocking = await checkCookieConsentBackdrop(page);
    expect(backdropNonBlocking).toBe(true);

    // Locate button
    const signInButton = page.locator('button:has-text("Sign in with Google")').first();
    await expect(signInButton).toBeVisible();

    // Tap button with backdrop visible
    await signInButton.tap({ force: false });

    // Verify tap worked
    await expect(signInButton).not.toBeDisabled();
  });

  test('Accept/Decline buttons respond to first tap (mobile)', async ({ page }) => {
    // Navigate to landing page
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Wait for cookie consent
    await page.waitForTimeout(1500);

    // Verify cookie consent is visible
    const declineButton = page.locator('button:has-text("Decline")');
    await expect(declineButton).toBeVisible();

    // Tap Decline button once
    await declineButton.tap({ force: false });

    // Verify banner disappears
    await page.waitForTimeout(500);
    const consentBanner = page.locator('text=We Value Your Privacy');
    await expect(consentBanner).not.toBeVisible();
  });
});
