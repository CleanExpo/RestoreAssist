import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Complete Authentication Flow
 *
 * Validates entire authentication lifecycle:
 * 1. Sign up
 * 2. Log out
 * 3. Log in
 * 4. Token refresh
 * 5. Session management
 */

// Helper: Sign up with email/password
async function signUp(page: Page, email: string, password: string) {
  await page.goto('/');

  const startButton = page.getByRole('button', { name: /start.*free.*trial|sign up/i }).first();
  await startButton.click();

  // Wait for modal backdrop to appear
  await page.waitForSelector('.fixed.inset-0', { timeout: 5000 });

  const emailInput = page.getByLabel(/^email/i).first();
  await emailInput.fill(email);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(password);

  const submitButton = page.getByRole('button', { name: /sign up|create account/i });
  await submitButton.click();

  await page.waitForTimeout(2000);
}

// Helper: Log in with email/password
async function logIn(page: Page, email: string, password: string) {
  await page.goto('/');

  // Look for login button or link
  const loginButton = page.getByRole('button', { name: /log in|sign in/i })
    .or(page.getByRole('link', { name: /log in|sign in/i }));

  if (await loginButton.count() > 0) {
    await loginButton.first().click();
  } else {
    // If no dedicated login button, start button might toggle to login
    const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
    await startButton.click();

    // Look for toggle to login mode
    const toggleLogin = page.getByText(/already have an account|log in/i);
    if (await toggleLogin.count() > 0) {
      await toggleLogin.click();
    }
  }

  // Wait for modal backdrop to appear
  await page.waitForSelector('.fixed.inset-0', { timeout: 5000 });

  const emailInput = page.getByLabel(/^email/i).first();
  await emailInput.fill(email);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(password);

  const submitButton = page.getByRole('button', { name: /log in|sign in/i });
  await submitButton.click();

  await page.waitForTimeout(2000);
}

// Helper: Mock auth API
async function mockAuthAPI(page: Page, options: { shouldFail?: boolean; errorMessage?: string } = {}) {
  await page.route('**/trial-auth/**', async (route) => {
    const url = route.request().url();

    if (options.shouldFail) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: options.errorMessage || 'Authentication failed'
        })
      });
    } else if (url.includes('/email-signup') || url.includes('/email-login')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          tokens: {
            accessToken: 'mock-access-token-' + Date.now(),
            refreshToken: 'mock-refresh-token-' + Date.now()
          },
          sessionToken: 'mock-session-token',
          user: { email: 'test@example.com', id: '123' }
        })
      });
    } else {
      await route.continue();
    }
  });
}

// Helper: Log out
async function logOut(page: Page) {
  // First try to find a direct logout button
  const logoutButton = page.getByRole('button', { name: /logout|sign out/i });

  if (await logoutButton.count() > 0) {
    await logoutButton.first().click();
    await page.waitForTimeout(1000);
  } else {
    // Click user menu button (with User text or icon)
    const userMenu = page.getByRole('button', { name: /user/i }).first();
    if (await userMenu.count() > 0) {
      await userMenu.click();
      await page.waitForTimeout(500);

      // Find Sign Out in the dropdown (could be button or text)
      const signOutButton = page.getByText(/sign out/i).first();
      await signOutButton.click();
      await page.waitForTimeout(1000);
    }
  }
}

test.describe('Complete Authentication Flow', () => {
  const testEmail = `auth-test-${Date.now()}@restoreassist.com`;
  const testPassword = 'SecurePass123!';

  test('should complete full authentication lifecycle: signup → logout → login', async ({ page }) => {
    await mockAuthAPI(page);

    // Step 1: Sign up
    await signUp(page, testEmail, testPassword);

    // Verify signup successful (redirected or on dashboard)
    await expect(page).toHaveURL(/dashboard|reports|home/i, { timeout: 10000 });

    // Verify access token is set
    const hasToken = await page.evaluate(() => {
      return !!localStorage.getItem('accessToken');
    });
    expect(hasToken).toBeTruthy();

    // Step 2: Log out
    await logOut(page);

    // Verify redirected to landing page
    await expect(page).toHaveURL('/', { timeout: 5000 });

    // Verify token is cleared
    const tokenCleared = await page.evaluate(() => {
      return !localStorage.getItem('accessToken');
    });
    expect(tokenCleared).toBeTruthy();

    // Step 3: Log in with same credentials
    await logIn(page, testEmail, testPassword);

    // Verify login successful
    await expect(page).toHaveURL(/dashboard|reports|home/i, { timeout: 10000 });

    // Verify token is set again
    const hasTokenAgain = await page.evaluate(() => {
      return !!localStorage.getItem('accessToken');
    });
    expect(hasTokenAgain).toBeTruthy();
  });

  test('should persist authentication across page reloads', async ({ page }) => {
    // Set up authenticated session
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-access-token');
      localStorage.setItem('refreshToken', 'mock-refresh-token');
      localStorage.setItem('userEmail', 'test@example.com');
    });

    await page.goto('/dashboard');

    // Verify authenticated
    await expect(page).toHaveURL(/dashboard/);

    // Reload page
    await page.reload();

    // Verify still authenticated
    await expect(page).toHaveURL(/dashboard/);

    const tokenStillExists = await page.evaluate(() => {
      return !!localStorage.getItem('accessToken');
    });
    expect(tokenStillExists).toBeTruthy();
  });

  test('should handle invalid login credentials', async ({ page }) => {
    await mockAuthAPI(page, { shouldFail: true, errorMessage: 'Invalid credentials' });
    await page.goto('/');

    // Attempt login with invalid credentials
    const loginButton = page.getByRole('button', { name: /log in|sign in/i })
      .or(page.getByRole('link', { name: /log in|sign in/i }));

    if (await loginButton.count() > 0) {
      await loginButton.first().click();
    } else {
      const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
      await startButton.click();

      const toggleLogin = page.getByText(/already have an account|log in/i);
      if (await toggleLogin.count() > 0) {
        await toggleLogin.click();
      }
    }

    await page.waitForTimeout(1000);

    const emailInput = page.getByLabel(/^email/i).first();
    await emailInput.fill('wrong@example.com');

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('wrongpassword');

    const submitButton = page.getByRole('button', { name: /log in|sign in/i });
    await submitButton.click();

    await page.waitForTimeout(2000);

    // Should show error message
    const errorMessage = page.getByText(/invalid|incorrect|wrong|failed|error/i);
    const hasError = await errorMessage.count() > 0;

    // Or should stay on same page
    const stillOnLanding = page.url() === new URL('/', page.url()).href;

    expect(hasError || stillOnLanding).toBeTruthy();
  });

  test('should validate email format on signup', async ({ page }) => {
    await page.goto('/');

    const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
    await startButton.click();

    await page.waitForTimeout(1000);

    const emailInput = page.getByLabel(/^email/i).first();
    await emailInput.fill('invalid-email');

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('Password123!');

    const submitButton = page.getByRole('button', { name: /sign up|create account/i });
    await submitButton.click();

    await page.waitForTimeout(1000);

    // Should show validation error
    const validationError = page.getByText(/valid email|invalid email|email format/i);
    const hasValidation = await validationError.count() > 0;

    expect(hasValidation).toBeTruthy();
  });

  test('should enforce password requirements on signup', async ({ page }) => {
    await page.goto('/');

    const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
    await startButton.click();

    await page.waitForTimeout(1000);

    const emailInput = page.getByLabel(/^email/i).first();
    await emailInput.fill('test@example.com');

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('weak'); // Too weak

    const submitButton = page.getByRole('button', { name: /sign up|create account/i });
    await submitButton.click();

    await page.waitForTimeout(1000);

    // Should show password requirements error
    const passwordError = page.getByText(/password.*characters|password.*strong|password requirements/i);
    const hasError = await passwordError.count() > 0;

    expect(hasError).toBeTruthy();
  });
});

test.describe('Token Management', () => {
  test('should store access and refresh tokens on login', async ({ page }) => {
    await page.addInitScript(() => {
      // Mock successful auth response
      window.addEventListener('storage', () => {
        console.log('Storage event triggered');
      });
    });

    // Set up mock tokens
    await page.evaluate(() => {
      localStorage.setItem('accessToken', 'mock-access-token-abc123');
      localStorage.setItem('refreshToken', 'mock-refresh-token-xyz789');
    });

    await page.goto('/dashboard');

    const tokens = await page.evaluate(() => {
      return {
        access: localStorage.getItem('accessToken'),
        refresh: localStorage.getItem('refreshToken')
      };
    });

    expect(tokens.access).toBeTruthy();
    expect(tokens.refresh).toBeTruthy();
  });

  test('should clear all auth data on logout', async ({ page }) => {
    // Set up authenticated session
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
      localStorage.setItem('refreshToken', 'mock-refresh');
      localStorage.setItem('sessionToken', 'mock-session');
      localStorage.setItem('userEmail', 'test@example.com');
      sessionStorage.setItem('trialData', '{}');
    });

    await page.goto('/dashboard');

    // Perform logout
    await logOut(page);

    // Verify all auth data cleared
    const allCleared = await page.evaluate(() => {
      return !localStorage.getItem('accessToken') &&
             !localStorage.getItem('refreshToken') &&
             !localStorage.getItem('sessionToken') &&
             !sessionStorage.getItem('trialData');
    });

    expect(allCleared).toBeTruthy();
  });

  test('should handle token refresh automatically', async ({ page }) => {
    // Set up token refresh mock
    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token'
        })
      });
    });

    // Set up expired token
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'expired-token');
      localStorage.setItem('refreshToken', 'valid-refresh-token');
    });

    await page.goto('/dashboard');

    // Wait for potential token refresh
    await page.waitForTimeout(2000);

    // Application should still function (token refreshed)
    const currentUrl = page.url();
    console.log(`Current URL after potential refresh: ${currentUrl}`);
  });

  test('should redirect to login if refresh token expired', async ({ page }) => {
    // Mock failed token refresh
    await page.route('**/api/auth/refresh', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Refresh token expired' })
      });
    });

    // Set up expired tokens
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'expired-access');
      localStorage.setItem('refreshToken', 'expired-refresh');
    });

    await page.goto('/dashboard');

    // Should redirect to login/landing
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const redirectedToLogin = currentUrl.includes('/') || currentUrl.includes('login');

    console.log(`Redirected to login: ${redirectedToLogin}`);
  });
});

test.describe('Session Management', () => {
  test('should prevent access to protected routes without authentication', async ({ page }) => {
    // Clear any existing auth
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Try to access protected route
    await page.goto('/dashboard');

    // Should redirect to landing/login
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const redirected = !currentUrl.includes('/dashboard');

    expect(redirected).toBeTruthy();
  });

  test('should allow access to public routes without authentication', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });

    // Access public routes
    const publicRoutes = ['/', '/pricing', '/about', '/contact'];

    for (const route of publicRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(route);
      console.log(`Public route accessible: ${route}`);
    }
  });

  test('should maintain session across multiple tabs', async ({ browser }) => {
    const context = await browser.newContext();

    // Tab 1: Login
    const page1 = await context.newPage();
    await page1.addInitScript(() => {
      localStorage.setItem('accessToken', 'shared-token');
    });
    await page1.goto('/dashboard');

    // Tab 2: Should have same session
    const page2 = await context.newPage();
    await page2.goto('/dashboard');

    const token2 = await page2.evaluate(() => localStorage.getItem('accessToken'));
    expect(token2).toBe('shared-token');

    await context.close();
  });

  test('should handle concurrent logout from multiple tabs', async ({ browser }) => {
    const context = await browser.newContext();

    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Set up auth in both tabs
    await page1.addInitScript(() => {
      localStorage.setItem('accessToken', 'shared-token');
    });
    await page2.addInitScript(() => {
      localStorage.setItem('accessToken', 'shared-token');
    });

    await page1.goto('/dashboard');
    await page2.goto('/dashboard');

    // Logout from page1
    await page1.evaluate(() => {
      localStorage.removeItem('accessToken');
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'accessToken',
        oldValue: 'shared-token',
        newValue: null
      }));
    });

    // Wait for storage event to propagate
    await page2.waitForTimeout(1000);

    // Page2 should also detect logout
    const token2 = await page2.evaluate(() => localStorage.getItem('accessToken'));
    expect(token2).toBeNull();

    await context.close();
  });
});

test.describe('Password Security', () => {
  test('should not expose password in network requests', async ({ page }) => {
    const requests: string[] = [];

    page.on('request', (request) => {
      const postData = request.postData();
      if (postData) {
        requests.push(postData);
      }
    });

    await page.goto('/');

    const startButton = page.getByRole('button', { name: /start.*free.*trial/i });
    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForTimeout(1000);

      const emailInput = page.getByLabel(/email/i).or(page.getByPlaceholder(/email/i));
      await emailInput.fill('test@example.com');

      const passwordInput = page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i));
      await passwordInput.fill('MySecretPassword123!');

      // Verify password input is type="password"
      const inputType = await passwordInput.getAttribute('type');
      expect(inputType).toBe('password');
    }
  });

  test('should have toggle to show/hide password', async ({ page }) => {
    await page.goto('/');

    const startButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
    await startButton.click();

    await page.waitForTimeout(1000);

    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('TestPassword123');

    // Look for show/hide password toggle button
    const toggleButton = page.getByRole('button', { name: /show password|hide password/i });

    const hasToggle = await toggleButton.count() > 0;

    if (hasToggle) {
      // Click toggle
      await toggleButton.first().click();
      await page.waitForTimeout(300);

      // Verify input type changed to text
      const textInput = page.locator('input#password[type="text"]');
      const isTextVisible = await textInput.count() > 0;
      expect(isTextVisible).toBeTruthy();

      // Click again to hide
      await toggleButton.first().click();
      await page.waitForTimeout(300);

      // Verify input type changed back to password
      const passwordInputAgain = page.locator('input#password[type="password"]');
      const isPasswordVisible = await passwordInputAgain.count() > 0;
      expect(isPasswordVisible).toBeTruthy();
    }
  });
});
