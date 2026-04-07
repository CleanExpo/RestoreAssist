import { test, expect } from "@playwright/test";

/**
 * Billing / Subscription E2E Tests (RA-215)
 * Tests subscription, credits, and pricing API auth guards
 * plus public pricing page and dashboard subscription redirect
 */

test.describe("Billing API Authentication", () => {
  test("should require authentication for GET /api/check-active-subscription", async ({
    request,
  }) => {
    const response = await request.get("/api/check-active-subscription");

    // Should return 401 Unauthorized or 400 Bad Request (missing required session param)
    expect([400, 401]).toContain(response.status());
  });

  test("should require authentication for GET /api/credits", async ({
    request,
  }) => {
    const response = await request.get("/api/credits");

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("should require authentication for GET /api/pricing-config", async ({
    request,
  }) => {
    const response = await request.get("/api/pricing-config");

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });
});

test.describe("Billing Public Pages", () => {
  test("should load the /pricing page with a visible H1 heading", async ({
    page,
  }) => {
    await page.goto("/pricing");

    // Pricing page should render with a top-level heading
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("Billing Dashboard Navigation", () => {
  test("should redirect unauthenticated users from /dashboard/subscription to login", async ({
    page,
  }) => {
    await page.goto("/dashboard/subscription");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
