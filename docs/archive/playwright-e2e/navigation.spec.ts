import { test, expect } from "@playwright/test";

/**
 * Navigation E2E Tests
 * Tests public page navigation and accessibility
 */

test.describe("Public Navigation", () => {
  test("should load homepage", async ({ page }) => {
    await page.goto("/");

    // Homepage should load with key elements
    await expect(page).toHaveTitle(/RestoreAssist|Restore/i);
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("should navigate to features page", async ({ page }) => {
    await page.goto("/features");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("should navigate to pricing page", async ({ page }) => {
    await page.goto("/pricing");

    // The H1 ships with inline opacity:0 (entrance animation start state) —
    // see RA-1730. Wait for the animation to settle before asserting.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });

    // Pricing page should show at least one pricing tier heading. The page
    // renders multiple "/month" texts and other pricing terms — pin to the
    // tier headings so the matcher resolves to one element instead of the
    // whole pricing-language soup that broke the previous regex.
    await expect(
      page.getByRole("heading", { name: /monthly|annual|enterprise/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("should navigate to about page", async ({ page }) => {
    await page.goto("/about");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("should navigate to FAQ page", async ({ page }) => {
    await page.goto("/faq");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("should navigate to help page", async ({ page }) => {
    await page.goto("/help");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("404 Page", () => {
  test("should display 404 page for invalid routes", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-12345");

    // Should show 404 content. The page renders both a "404" tile and a
    // "Page Not Found" heading — the previous regex matched both and
    // Playwright's strict mode resolved that as ambiguous, failing the
    // assertion despite the page being correct. Pin to the heading so
    // the matcher resolves to one element.
    await expect(
      page.getByRole("heading", { name: /page not found/i }),
    ).toBeVisible();
  });
});
