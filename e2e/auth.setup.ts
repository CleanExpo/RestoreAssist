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

import { test as setup, expect, type Page } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";
import { applySessionCookieFromResponse } from "./helpers/session-cookie";

// Re-export for back-compat with any existing importer.
export { AUTH_FILE };

setup("authenticate", async ({ page, context }) => {
  const email = process.env.E2E_USER_EMAIL ?? "test@restoreassist.app";
  const password = process.env.E2E_USER_PASSWORD ?? "Test1234!";

  const helperEmail = `e2e-auth-${Date.now()}@test.local`;
  const helperSignIn = await page.request.post("/api/test/sign-in-as", {
    data: {
      role: "USER",
      email: helperEmail,
      setupCompletedAt: new Date().toISOString(),
    },
    failOnStatusCode: false,
  });

  if (helperSignIn.ok()) {
    await applySessionCookieFromResponse(context, helperSignIn);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expectAuthenticatedDashboard(page, "test helper session");
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  await page.goto("/login");
  // Target inputs by type — getByLabel(/password/i) is ambiguous (the field +
  // a show/hide toggle both match, tripping Playwright strict mode). RA-6764.
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for successful redirect to dashboard
  await expectAuthenticatedDashboard(page, "credential login");

  // Save auth state for other test files
  await page.context().storageState({ path: AUTH_FILE });
});

async function expectAuthenticatedDashboard(page: Page, authSource: string) {
  await Promise.race([
    page.waitForURL(/\/dashboard(?:[/?#]|$)/, { timeout: 15_000 }),
    page.waitForURL(/\/billing\/upgrade(?:[/?#]|$)/, { timeout: 15_000 }),
  ]).catch(() => undefined);

  const currentUrl = new URL(page.url());
  if (currentUrl.pathname === "/billing/upgrade") {
    const reason = currentUrl.searchParams.get("reason") ?? "unknown";
    throw new Error(
      [
        `Authenticated setup reached the billing paywall via ${authSource}.`,
        `Current URL: ${currentUrl.pathname}${currentUrl.search}`,
        `Reason: ${reason}.`,
        reason === "trial-expired"
          ? "The production E2E account is expired; renew or replace it before running authenticated production setup."
          : "The account is not permitted through the subscription gate.",
      ].join(" "),
    );
  }

  await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/, { timeout: 15_000 });
}
