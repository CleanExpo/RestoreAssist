import { Page, Route } from '@playwright/test';
import { MOCK_TRIAL_DATA, STRIPE_TEST_DATA } from '../fixtures/test-data';

/**
 * Mock API Responses for E2E Testing
 * Intercepts external API calls and returns controlled test data
 */

export async function mockGoogleOAuthAPI(page: Page) {
  // Mock Google OAuth login endpoint
  await page.route('**/api/trial-auth/google-login', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        user: MOCK_TRIAL_DATA.user,
        tokens: MOCK_TRIAL_DATA.tokens,
        sessionToken: MOCK_TRIAL_DATA.sessionToken,
      }),
    });
  });

  // Mock trial activation endpoint
  await page.route('**/api/trial-auth/activate-trial', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        tokenId: MOCK_TRIAL_DATA.trial.tokenId,
        reportsRemaining: MOCK_TRIAL_DATA.trial.reportsRemaining,
        expiresAt: MOCK_TRIAL_DATA.trial.expiresAt,
      }),
    });
  });
}

export async function mockGoogleOAuthFailure(page: Page, errorMessage: string) {
  await page.route('**/api/trial-auth/google-login', async (route: Route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: errorMessage,
      }),
    });
  });
}

export async function mockStripeCheckoutAPI(page: Page) {
  // Mock Stripe checkout session creation
  await page.route('**/api/stripe/create-checkout-session', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: STRIPE_TEST_DATA.checkoutSession.id,
        url: STRIPE_TEST_DATA.checkoutSession.url,
      }),
    });
  });
}

export async function mockStripeCheckoutFailure(page: Page) {
  await page.route('**/api/stripe/create-checkout-session', async (route: Route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Failed to create checkout session',
      }),
    });
  });
}

export async function mockContactFormAPI(page: Page) {
  // Mock contact form submission (currently simulated)
  await page.route('**/api/contact', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: 'Message sent successfully',
      }),
    });
  });
}

export async function mockAllAPIs(page: Page) {
  await mockGoogleOAuthAPI(page);
  await mockStripeCheckoutAPI(page);
  await mockContactFormAPI(page);
}

/**
 * Helper function to wait for API call and verify request
 */
export async function waitForAPICall(
  page: Page,
  urlPattern: string,
  timeout: number = 5000
): Promise<any> {
  return page.waitForResponse(
    (response) => response.url().includes(urlPattern) && response.status() === 200,
    { timeout }
  );
}
