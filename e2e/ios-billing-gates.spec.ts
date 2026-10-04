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
    test.fixme(); // RA-7900: the iOS-only anchor below never renders in the E2E env, so this check never actually ran (it passed vacuously before the anchor was added)
    await mockCapacitorIOS(page);
    await page.goto("/dashboard/settings");
    // iOS-only control: proves the page rendered with the shell detected,
    // so the negative check below is not passing on an empty page.
    await expect(page.getByText("Require Face ID to unlock")).toBeVisible();
    await expect(page.getByText("Upgrade Package")).not.toBeVisible();
  });

  test("settings page hides Manage Subscription on iOS", async ({ page }) => {
    test.fixme(); // RA-7900: see above
    await mockCapacitorIOS(page);
    await page.goto("/dashboard/settings");
    await expect(page.getByText("Require Face ID to unlock")).toBeVisible();
    await expect(page.getByText("Manage Subscription")).not.toBeVisible();
  });

  test("BillingGate shows no external link on iOS", async ({ page }) => {
    test.fixme(); // RA-7900: BillingGate's iOS fallback never renders in the E2E env, so this check never actually ran
    await mockCapacitorIOS(page);
    await page.goto("/dashboard/subscription");
    // The iOS placeholder must be on screen before counting links in it.
    await expect(page.getByText("Managed by your workspace")).toBeVisible();
    // The fallback must contain no href pointing to restoreassist.app
    const externalLink = page.locator('a[href*="restoreassist.app"]');
    await expect(externalLink).toHaveCount(0);
  });
});
