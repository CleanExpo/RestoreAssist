import { test, expect } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";

// The real shell's user-agent (capacitor.config.ts ios.appendUserAgent). The
// server verdict and isCapacitorIOS() both read it.
const IOS_SHELL_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 RestoreAssistIOSShell";

// Injects a mock window.Capacitor that reports platform as "ios". On its own
// this is NOT enough: once @capacitor/core loads in a browser it reports
// "web" (RA-7900), which is why the settings and subscription checks below
// never reached their iOS state. The shell user-agent above is what drives
// detection; the mock stays for code that reads window.Capacitor first.
async function mockCapacitorIOS(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    };
  });
}

test.describe("iOS billing gates", () => {
  test.use({ storageState: AUTH_FILE, userAgent: IOS_SHELL_UA });

  test("login page hides Sign up link on iOS", async ({ page }) => {
    await mockCapacitorIOS(page);
    await page.goto("/login");
    // Wait for the form first: not.toBeVisible() passes at once on a page that
    // has not rendered yet.
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.getByText("Sign up for free")).not.toBeVisible();
    await expect(page.getByText("Don't have an account")).not.toBeVisible();
    // No sign-up link anywhere on the page, including global widgets.
    await expect(page.locator('a[href*="/signup"]')).toHaveCount(0);
  });

  test("launch page (/) sends the shell to login on iOS", async ({ page }) => {
    // The shell's server.url is the site root, so this is its first screen.
    await mockCapacitorIOS(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
    await expect(page.getByText("Start free")).toHaveCount(0);
  });

  test("signup page redirects to login on iOS", async ({ page }) => {
    await mockCapacitorIOS(page);
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  });

  test("settings page hides Upgrade Package link on iOS", async ({ page }) => {
    await mockCapacitorIOS(page);
    await page.goto("/dashboard/settings");
    // iOS-only control: proves the page rendered with the shell detected,
    // so the negative check below is not passing on an empty page.
    await expect(page.getByText("Require Face ID to unlock")).toBeVisible();
    await expect(page.getByText("Upgrade Package")).toHaveCount(0);
  });

  test("settings page hides Manage Subscription on iOS", async ({ page }) => {
    await mockCapacitorIOS(page);
    await page.goto("/dashboard/settings");
    await expect(page.getByText("Require Face ID to unlock")).toBeVisible();
    await expect(page.getByText("Manage Subscription")).toHaveCount(0);
  });

  test("BillingGate shows no external link on iOS", async ({ page }) => {
    await mockCapacitorIOS(page);
    // /dashboard/subscription is ADMIN-only and sends this USER-role account
    // to /dashboard/field (RA-7900), so check the gate on /pricing, which is
    // public and wrapped in the same BillingGate.
    await page.goto("/pricing");
    const fallback = page
      .getByRole("status")
      .filter({ hasText: "Managed by your workspace" });
    await expect(fallback).toBeVisible();
    // The fallback must contain no href pointing to restoreassist.app
    await expect(fallback.locator('a[href*="restoreassist.app"]')).toHaveCount(
      0,
    );
    // and the pricing plans behind it must not render at all.
    await expect(page.locator('a[href*="/signup"]')).toHaveCount(0);
  });
});
