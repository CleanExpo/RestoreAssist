import { test, expect } from "@playwright/test";

/**
 * CRM & Client Management E2E Tests (RA-216)
 * Tests CRM and client management API endpoints and dashboard routes
 */

test.describe("CRM API Authentication", () => {
  test("should require authentication for CRM endpoints", async ({
    request,
  }) => {
    // Test CRM-related protected endpoints return 401
    const protectedEndpoints = [
      "/api/clients",
      "/api/feedback",
      "/api/analytics",
      "/api/interviews",
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await request.get(endpoint);
      // Should return 401 Unauthorized
      expect(response.status()).toBe(401);
    }
  });
});

test.describe("CRM Dashboard Routes", () => {
  test("should redirect /dashboard/clients to login without auth", async ({
    page,
  }) => {
    await page.goto("/dashboard/clients");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test("should redirect /dashboard/analytics to login without auth", async ({
    page,
  }) => {
    await page.goto("/dashboard/analytics");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Public CRM Pages", () => {
  test("should display contact page with visible heading", async ({ page }) => {
    await page.goto("/contact");

    // Contact page is public — H1 should be visible without auth
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
