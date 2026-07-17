import { test, expect } from "@playwright/test";

/**
 * Workshop / Equipment E2E Tests (RA-214)
 * Tests inspection, scope, report, and restoration-document API auth guards
 * plus dashboard navigation redirects for unauthenticated users
 */

test.describe("Workshop API Authentication", () => {
  test("should require authentication for GET /api/inspections", async ({
    request,
  }) => {
    const response = await request.get("/api/inspections");

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("should require authentication for GET /api/scopes", async ({
    request,
  }) => {
    const response = await request.get("/api/scopes");

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("should require authentication for GET /api/reports", async ({
    request,
  }) => {
    const response = await request.get("/api/reports");

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test("should require authentication for GET /api/restoration-documents", async ({
    request,
  }) => {
    const response = await request.get("/api/restoration-documents");

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });
});

test.describe("Workshop Dashboard Navigation", () => {
  test("should redirect unauthenticated users from /dashboard/inspections to login", async ({
    page,
  }) => {
    await page.goto("/dashboard/inspections");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test("should redirect unauthenticated users from /dashboard/reports to login", async ({
    page,
  }) => {
    await page.goto("/dashboard/reports");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
