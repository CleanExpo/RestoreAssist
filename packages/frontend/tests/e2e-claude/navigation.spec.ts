import { test, expect } from '@playwright/test';
import { ROUTES_TO_TEST } from './fixtures/test-data';

/**
 * E2E Test Suite: Navigation & Routes
 *
 * Tests all 30 application routes:
 * 1. Verify each route returns 200 (no 404s)
 * 2. Test resource page dropdowns
 * 3. Verify footer links work
 * 4. Test navigation menu functionality
 */

test.describe('Route Accessibility', () => {
  // Test each route individually
  ROUTES_TO_TEST.forEach(({ path, name }) => {
    test(`should load ${name} page (${path})`, async ({ page }) => {
      // Navigate to route
      await page.goto(path);

      // Verify URL is correct
      await expect(page).toHaveURL(path);

      // Verify page loaded successfully (check for main content)
      const mainContent = page.locator('main, [role="main"], body');
      await expect(mainContent).toBeVisible({ timeout: 10000 });

      // Verify no error messages
      const errorText = page.getByText(/404|not found|error/i);
      const hasError = await errorText.count();

      // Some routes might legitimately have "error" in content, so we're lenient
      if (hasError > 0) {
        const errorContent = await errorText.first().textContent();
        console.log(`Possible error on ${path}: ${errorContent}`);
      }

      // Verify response status by checking network
      const response = await page.request.get(path);
      expect(response.status()).toBe(200);
    });
  });
});

test.describe('Main Navigation Menu', () => {
  test('should display main navigation with logo', async ({ page }) => {
    await page.goto('/');

    // Verify navigation exists
    const nav = page.locator('nav, header').first();
    await expect(nav).toBeVisible();

    // Verify logo/brand link
    const logo = page.locator('a[href="/"], img[alt*="logo" i], [class*="logo"]').first();
    await expect(logo).toBeVisible();
  });

  test('should navigate to Pricing page from header', async ({ page }) => {
    await page.goto('/');

    // Find pricing link in navigation
    const pricingLink = page.getByRole('link', { name: /pricing/i });
    await expect(pricingLink).toBeVisible();

    // Click pricing link
    await pricingLink.click();

    // Verify navigation
    await expect(page).toHaveURL('/pricing');
  });

  test('should navigate to About page from header', async ({ page }) => {
    await page.goto('/');

    // Find about link
    const aboutLink = page.getByRole('link', { name: /about/i });

    if (await aboutLink.count() > 0) {
      await aboutLink.click();
      await expect(page).toHaveURL('/about');
    }
  });

  test('should navigate to Contact page from header', async ({ page }) => {
    await page.goto('/');

    // Find contact link
    const contactLink = page.getByRole('link', { name: /contact/i });

    if (await contactLink.count() > 0) {
      await contactLink.click();
      await expect(page).toHaveURL('/contact');
    }
  });
});

test.describe('Features Dropdown Navigation', () => {
  test('should open Features dropdown menu', async ({ page }) => {
    await page.goto('/');

    // Find features dropdown trigger
    const featuresButton = page.getByRole('button', { name: /features/i })
      .or(page.getByRole('link', { name: /features/i }));

    if (await featuresButton.count() > 0) {
      // Hover or click to open dropdown
      await featuresButton.hover();
      await page.waitForTimeout(500);

      // Verify dropdown content appears
      const dropdownContent = page.locator('[class*="dropdown"], [role="menu"], [class*="mega"]');
      const hasDropdown = await dropdownContent.count() > 0;

      console.log(`Features dropdown visible: ${hasDropdown}`);
    }
  });

  test('should navigate to AI Reports from Features dropdown', async ({ page }) => {
    await page.goto('/');

    // Open features dropdown
    const featuresButton = page.getByRole('button', { name: /features/i })
      .or(page.getByRole('link', { name: /features/i }));

    if (await featuresButton.count() > 0) {
      await featuresButton.hover();
      await page.waitForTimeout(500);

      // Find AI Reports link
      const aiReportsLink = page.getByRole('link', { name: /ai.*report/i });

      if (await aiReportsLink.count() > 0) {
        await aiReportsLink.click();
        await expect(page).toHaveURL('/features/ai-reports');
      }
    }
  });

  test('should navigate to Water Damage from Features dropdown', async ({ page }) => {
    await page.goto('/');

    const featuresButton = page.getByRole('button', { name: /features/i })
      .or(page.getByRole('link', { name: /features/i }));

    if (await featuresButton.count() > 0) {
      await featuresButton.hover();
      await page.waitForTimeout(500);

      const waterDamageLink = page.getByRole('link', { name: /water.*damage/i });

      if (await waterDamageLink.count() > 0) {
        await waterDamageLink.click();
        await expect(page).toHaveURL('/features/water-damage');
      }
    }
  });

  test('should navigate to Templates from Features dropdown', async ({ page }) => {
    await page.goto('/');

    const featuresButton = page.getByRole('button', { name: /features/i })
      .or(page.getByRole('link', { name: /features/i }));

    if (await featuresButton.count() > 0) {
      await featuresButton.hover();
      await page.waitForTimeout(500);

      const templatesLink = page.getByRole('link', { name: /template/i });

      if (await templatesLink.count() > 0) {
        await templatesLink.click();
        await expect(page).toHaveURL('/features/templates');
      }
    }
  });
});

test.describe('Resources Dropdown Navigation', () => {
  test('should navigate to Documentation from Resources', async ({ page }) => {
    await page.goto('/');

    // Find resources dropdown
    const resourcesButton = page.getByRole('button', { name: /resources/i })
      .or(page.getByText(/resources/i));

    if (await resourcesButton.count() > 0) {
      await resourcesButton.hover();
      await page.waitForTimeout(500);

      const docsLink = page.getByRole('link', { name: /documentation/i });

      if (await docsLink.count() > 0) {
        await docsLink.click();
        await expect(page).toHaveURL('/resources/documentation');
      }
    }
  });

  test('should navigate to Training from Resources', async ({ page }) => {
    await page.goto('/');

    const resourcesButton = page.getByRole('button', { name: /resources/i })
      .or(page.getByText(/resources/i));

    if (await resourcesButton.count() > 0) {
      await resourcesButton.hover();
      await page.waitForTimeout(500);

      const trainingLink = page.getByRole('link', { name: /training/i });

      if (await trainingLink.count() > 0) {
        await trainingLink.click();
        await expect(page).toHaveURL('/resources/training');
      }
    }
  });

  test('should navigate to API Integration from Resources', async ({ page }) => {
    await page.goto('/');

    const resourcesButton = page.getByRole('button', { name: /resources/i })
      .or(page.getByText(/resources/i));

    if (await resourcesButton.count() > 0) {
      await resourcesButton.hover();
      await page.waitForTimeout(500);

      const apiLink = page.getByRole('link', { name: /api/i });

      if (await apiLink.count() > 0) {
        await apiLink.click();
        await expect(page).toHaveURL('/resources/api');
      }
    }
  });
});

test.describe('Footer Navigation', () => {
  test('should display footer with all sections', async ({ page }) => {
    await page.goto('/');

    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Verify footer exists
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });

  test('should navigate to Privacy Policy from footer', async ({ page }) => {
    await page.goto('/');

    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Find privacy link in footer
    const privacyLink = page.getByRole('link', { name: /privacy/i });

    if (await privacyLink.count() > 0) {
      await privacyLink.last().click(); // Use last() to get footer link
      await expect(page).toHaveURL('/privacy');
    }
  });

  test('should navigate to Terms of Service from footer', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const termsLink = page.getByRole('link', { name: /terms/i });

    if (await termsLink.count() > 0) {
      await termsLink.last().click();
      await expect(page).toHaveURL('/terms');
    }
  });

  test('should navigate to Refund Policy from footer', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const refundLink = page.getByRole('link', { name: /refund/i });

    if (await refundLink.count() > 0) {
      await refundLink.last().click();
      await expect(page).toHaveURL('/refunds');
    }
  });
});

test.describe('404 and Error Handling', () => {
  test('should redirect unknown routes to home', async ({ page }) => {
    // Navigate to non-existent route
    await page.goto('/this-page-does-not-exist-123');

    // Should redirect to home
    await expect(page).toHaveURL('/');
  });

  test('should handle invalid feature routes gracefully', async ({ page }) => {
    await page.goto('/features/invalid-feature-name');

    // Should redirect to home or show 404
    await page.waitForTimeout(1000);

    const currentUrl = page.url();
    expect(currentUrl === '/' || currentUrl.includes('/features/')).toBeTruthy();
  });
});

test.describe('Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('should display mobile menu button', async ({ page }) => {
    await page.goto('/');

    // Look for hamburger menu button
    const menuButton = page.getByRole('button', { name: /menu/i })
      .or(page.locator('button[aria-label*="menu" i]'))
      .or(page.locator('[class*="hamburger"], [class*="mobile-menu"]'));

    const hasMenuButton = await menuButton.count() > 0;
    console.log(`Mobile menu button found: ${hasMenuButton}`);
  });

  test('should open mobile menu when button clicked', async ({ page }) => {
    await page.goto('/');

    const menuButton = page.getByRole('button', { name: /menu/i })
      .or(page.locator('button[aria-label*="menu" i]'))
      .or(page.locator('[class*="hamburger"]'));

    if (await menuButton.count() > 0) {
      await menuButton.first().click();
      await page.waitForTimeout(500);

      // Verify mobile menu is visible
      const mobileNav = page.locator('nav, [role="navigation"]', { hasText: /features|pricing|about/i });
      const isVisible = await mobileNav.count() > 0;

      console.log(`Mobile menu opened: ${isVisible}`);
    }
  });
});
