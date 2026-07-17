import { test, expect } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";

// Injects a mock window.Capacitor that reports platform as "ios".
// isCapacitorIOS() checks cap.getPlatform() === "ios" first, so this
// is sufficient to trigger all iOS billing gates without UA sniffing.
async function mockCapacitorIOS(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    };
  });
}

test.describe("iOS billing gates", () => {
  test.use({ storageState: AUTH_FILE });

  test("login page hides Sign up link on iOS", async ({ page }) => {
    await mockCapacitorIOS(page);
    await page.goto("/login");
    await expect(page.getByText("Sign up for free")).not.toBeVisible();
    await expect(page.getByText("Don't have an account")).not.toBeVisible();
  });

  test("signup page redirects to login on iOS", async ({ page }) => {
    await mockCapacitorIOS(page);
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  });

  test("settings page hides Upgrade Package link on iOS", async ({ page }) => {
    await mockCapacitorIOS(page);
    await page.goto("/dashboard/settings");
    await expect(page.getByText("Upgrade Package")).not.toBeVisible();
  });

  test("settings page hides Manage Subscription on iOS", async ({ page }) => {
    await mockCapacitorIOS(page);
    await page.goto("/dashboard/settings");
    await expect(page.getByText("Manage Subscription")).not.toBeVisible();
  });

  test("BillingGate shows no external link on iOS", async ({ page }) => {
    await mockCapacitorIOS(page);
    await page.goto("/dashboard/subscription");
    // The fallback must contain no href pointing to restoreassist.app
    const externalLink = page.locator('a[href*="restoreassist.app"]');
    await expect(externalLink).toHaveCount(0);
  });
});
