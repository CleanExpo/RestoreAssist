import { test, expect } from "@playwright/test";

/**
 * Punch-list P1 #16 — protected routes preserve intended destination
 * through the /login redirect via `?callbackUrl=<encoded path>`.
 *
 * Scope: this spec verifies the middleware-side contract (unauth → /login
 * with callbackUrl set) and the login-page input contract (URL still carries
 * the param when the page renders). The "sign in then land at target" half
 * exercises real credentials and is covered by the existing auth.setup
 * fixture; we don't duplicate it here.
 */

test.describe("login redirect preserves intended destination", () => {
  test("unauthenticated /dashboard/inspections/123 → /login?callbackUrl=…", async ({
    page,
  }) => {
    await page.goto("/dashboard/inspections/123");

    // Middleware should bounce to /login with the original path encoded as
    // ?callbackUrl=. The login page is a client component wrapped in
    // Suspense — wait for navigation to settle on /login.
    await page.waitForURL(/\/login(\?|$)/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("callbackUrl")).toBe(
      "/dashboard/inspections/123",
    );
  });

  test("preserves search params on the protected URL", async ({ page }) => {
    await page.goto("/dashboard/inspections?tab=open&page=2");

    await page.waitForURL(/\/login(\?|$)/);
    const url = new URL(page.url());
    expect(url.searchParams.get("callbackUrl")).toBe(
      "/dashboard/inspections?tab=open&page=2",
    );
  });

  test("does NOT carry callbackUrl when /login is visited directly", async ({
    page,
  }) => {
    await page.goto("/login");

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("callbackUrl")).toBeNull();
  });
});
