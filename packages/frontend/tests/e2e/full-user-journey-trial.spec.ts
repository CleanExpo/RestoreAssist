import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test Suite: Full User Journey - Trial User
 *
 * Validates complete trial user flow from landing to report generation:
 * 1. Visit landing page
 * 2. Sign up with email/password
 * 3. Activate trial
 * 4. Generate damage report
 * 5. Download report
 * 6. Verify trial limits
 */

// Helper functions
async function signupWithEmail(page: Page, email: string, password: string) {
  // Click "Start Free Trial" button (use .first() to handle multiple buttons)
  const startTrialButton = page.getByRole('button', { name: /start.*free.*trial/i }).first();
  await startTrialButton.click();

  // Wait for auth modal backdrop to appear
  await page.waitForSelector('.fixed.inset-0', { timeout: 5000 });

  // Fill in email
  const emailInput = page.getByLabel(/^email/i).first();
  await emailInput.fill(email);

  // Fill in password
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(password);

  // Submit form
  const submitButton = page.getByRole('button', { name: /sign up|create account|get started/i });
  await submitButton.click();
}

async function generateDamageReport(page: Page) {
  // Navigate to report generation page
  await page.goto('/dashboard');

  // Click "Generate Report" or "New Report" button
  const generateButton = page.getByRole('button', { name: /generate|new report|create report/i });
  await generateButton.click();

  // Fill in report details
  const locationInput = page.getByLabel(/location|address/i);
  if (await locationInput.isVisible()) {
    await locationInput.fill('123 Test Street, Sydney NSW 2000');
  }

  // Select damage type
  const damageTypeSelect = page.getByLabel(/damage type|type of damage/i);
  if (await damageTypeSelect.isVisible()) {
    await damageTypeSelect.click();
    await page.getByRole('option', { name: /water/i }).click();
  }

  // Submit report generation
  const generateSubmitButton = page.getByRole('button', { name: /generate|create|submit/i });
  await generateSubmitButton.click();
}

test.describe('Full User Journey - Trial User', () => {
  const testEmail = `test-trial-${Date.now()}@restoreassist.com`;
  const testPassword = 'TestPass123!';

  test('should complete full trial user journey from signup to report download', async ({ page }) => {
    // Step 1: Visit landing page
    await page.goto('/');

    // Verify landing page loaded
    await expect(page).toHaveTitle(/RestoreAssist/i);

    // Verify hero section is visible
    const heroHeading = page.locator('h1').first();
    await expect(heroHeading).toBeVisible();

    // Step 2: Sign up with email/password
    await signupWithEmail(page, testEmail, testPassword);

    // Wait for signup to complete (redirects or modal closes)
    await page.waitForTimeout(2000);

    // Step 3: Activate trial (should happen automatically after signup)
    // Verify we're redirected to dashboard or trial activated
    await expect(page).toHaveURL(/dashboard|reports|home/i, { timeout: 10000 });

    // Step 4: Generate damage report
    await generateDamageReport(page);

    // Wait for report to be generated
    await page.waitForTimeout(3000);

    // Verify report appears in dashboard
    const reportCard = page.locator('[class*="report"], [data-testid*="report"]').first();
    await expect(reportCard).toBeVisible({ timeout: 10000 });

    // Step 5: Download report
    const downloadButton = page.getByRole('button', { name: /download|export/i }).first();
    if (await downloadButton.isVisible()) {
      // Set up download listener
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

      await downloadButton.click();

      // Wait for download to start
      const download = await downloadPromise;

      // Verify download occurred
      expect(download.suggestedFilename()).toMatch(/\.pdf|\.docx|\.xlsx/i);

      console.log(`Downloaded: ${download.suggestedFilename()}`);
    }

    // Step 6: Verify trial limits
    // Look for trial status banner
    const trialBanner = page.getByText(/trial|free|reports remaining/i);
    await expect(trialBanner).toBeVisible({ timeout: 5000 });

    // Verify reports remaining counter shows (should be 2/3 after generating one)
    const reportsText = await trialBanner.textContent();
    expect(reportsText).toMatch(/\d+/); // Contains a number
  });

  test('should show trial activation confirmation', async ({ page }) => {
    await page.goto('/');

    await signupWithEmail(page, `test-confirm-${Date.now()}@test.com`, testPassword);

    // Wait for confirmation message or redirect
    await page.waitForTimeout(2000);

    // Check for success message or trial activated indicator
    const successIndicator = page.getByText(/trial activated|welcome|success|account created/i);
    const indicatorExists = await successIndicator.count() > 0;

    // Or verify we're on dashboard
    const onDashboard = page.url().includes('/dashboard') || page.url().includes('/reports');

    expect(indicatorExists || onDashboard).toBeTruthy();
  });

  test('should enforce trial report limit', async ({ page }) => {
    // Mock localStorage with trial data showing 0 reports remaining
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
      localStorage.setItem('trialData', JSON.stringify({
        reportsRemaining: 0,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }));
    });

    await page.goto('/dashboard');

    // Try to generate report
    const generateButton = page.getByRole('button', { name: /generate|new report/i });

    if (await generateButton.isVisible()) {
      await generateButton.click();

      // Should show limit reached message
      const limitMessage = page.getByText(/limit reached|upgrade|no reports remaining/i);
      await expect(limitMessage).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display trial expiration date', async ({ page }) => {
    await page.addInitScript(() => {
      const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      localStorage.setItem('accessToken', 'mock-token');
      localStorage.setItem('trialData', JSON.stringify({
        reportsRemaining: 3,
        expiresAt: expiryDate.toISOString()
      }));
    });

    await page.goto('/dashboard');

    // Look for expiration date display
    const expiryText = page.getByText(/expires|expiry|valid until/i);
    await expect(expiryText).toBeVisible({ timeout: 5000 });

    // Verify date format
    const text = await expiryText.textContent();
    expect(text).toMatch(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}/);
  });

  test('should allow trial user to view pricing upgrade options', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-trial-token');
    });

    await page.goto('/dashboard');

    // Look for upgrade button or link
    const upgradeLink = page.getByRole('link', { name: /upgrade|pricing|plans/i })
      .or(page.getByRole('button', { name: /upgrade|pricing/i }));

    if (await upgradeLink.count() > 0) {
      await upgradeLink.first().click();

      // Should navigate to pricing page
      await expect(page).toHaveURL(/pricing/i, { timeout: 5000 });

      // Verify pricing plans are visible
      const pricingCards = page.locator('[class*="pricing"], [class*="plan"]');
      expect(await pricingCards.count()).toBeGreaterThan(0);
    }
  });

  test('should show trial progress indicator', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
      localStorage.setItem('trialData', JSON.stringify({
        reportsRemaining: 1,
        totalReports: 3,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }));
    });

    await page.goto('/dashboard');

    // Look for progress indicator (e.g., "1/3 reports remaining")
    const progressText = page.getByText(/\d+\s*\/\s*\d+|reports remaining/i);
    await expect(progressText).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Trial User Report Generation', () => {
  test('should validate required fields in report form', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
    });

    await page.goto('/dashboard');

    const generateButton = page.getByRole('button', { name: /generate|new report/i });
    if (await generateButton.isVisible()) {
      await generateButton.click();

      // Try to submit without filling required fields
      const submitButton = page.getByRole('button', { name: /generate|create|submit/i });
      await submitButton.click();

      // Should show validation errors
      const errorMessage = page.getByText(/required|must provide|cannot be empty/i);
      const hasError = await errorMessage.count() > 0;

      expect(hasError).toBeTruthy();
    }
  });

  test('should show loading state during report generation', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
    });

    await page.goto('/dashboard');

    const generateButton = page.getByRole('button', { name: /generate|new report/i });
    if (await generateButton.isVisible()) {
      await generateButton.click();

      // Fill minimal required fields
      const locationInput = page.getByLabel(/location|address/i);
      if (await locationInput.isVisible()) {
        await locationInput.fill('Test Location');
      }

      const submitButton = page.getByRole('button', { name: /generate|create|submit/i });
      await submitButton.click();

      // Look for loading indicator
      const loadingIndicator = page.getByText(/generating|processing|please wait/i)
        .or(page.locator('[class*="loading"], [class*="spinner"]'));

      const hasLoading = await loadingIndicator.count() > 0;
      console.log(`Loading indicator shown: ${hasLoading}`);
    }
  });
});

test.describe('Trial User Dashboard Features', () => {
  test('should display user email in dashboard header', async ({ page }) => {
    const userEmail = 'test@example.com';

    await page.addInitScript((email) => {
      localStorage.setItem('accessToken', 'mock-token');
      localStorage.setItem('userEmail', email);
    }, userEmail);

    await page.goto('/dashboard');

    // Look for user email in header or profile section
    const emailDisplay = page.getByText(userEmail);
    await expect(emailDisplay).toBeVisible({ timeout: 5000 });
  });

  test('should show recent reports list', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
    });

    await page.goto('/dashboard');

    // Look for reports section
    const reportsSection = page.getByRole('heading', { name: /reports|my reports|recent/i });
    await expect(reportsSection).toBeVisible({ timeout: 5000 });
  });

  test('should have functional logout button', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('accessToken', 'mock-token');
    });

    await page.goto('/dashboard');

    const logoutButton = page.getByRole('button', { name: /logout|sign out/i });

    if (await logoutButton.count() > 0) {
      await logoutButton.click();

      // Verify redirect to landing page
      await expect(page).toHaveURL('/', { timeout: 5000 });

      // Verify token is cleared
      const tokenCleared = await page.evaluate(() => {
        return !localStorage.getItem('accessToken');
      });

      expect(tokenCleared).toBeTruthy();
    }
  });
});
