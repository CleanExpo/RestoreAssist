/**
 * Playwright Auth Setup — RA2-055 (RA-125)
 *
 * Logs in once and serialises the browser storage state to
 * playwright/.auth/user.json so the V2 workflow tests can skip the
 * login page entirely.
 *
 * Credentials are supplied via env vars:
 *   E2E_USER_EMAIL    (default: test@restoreassist.app)
 *   E2E_USER_PASSWORD (default: Test1234!)
 */

import { test as setup, expect } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";

// Re-export for back-compat with any existing importer.
export { AUTH_FILE };

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL ?? "test@restoreassist.app";
  const password = process.env.E2E_USER_PASSWORD ?? "Test1234!";

  await page.goto("/login");
  // Target inputs by type — getByLabel(/password/i) is ambiguous (the field +
  // a show/hide toggle both match, tripping Playwright strict mode). RA-6764.
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // After a successful login the middleware may redirect to /dashboard
  // (active subscription), /billing/upgrade (trial-expired / paywalled),
  // /setup (first-run wizard), or /onboarding (incomplete profile).
  // All of these prove authentication succeeded. The specific landing page
  // is a business-logic concern; individual tests assert their own URL state.
  // Using waitForURL rather than toHaveURL so setup doesn't fail if the
  // production test account's trial has expired (e.g. between seed runs).
  await page.waitForURL(/\/(dashboard|billing|setup|onboarding)/, {
    timeout: 15_000,
  });

  // Save auth state for other test files
  await page.context().storageState({ path: AUTH_FILE });
});
