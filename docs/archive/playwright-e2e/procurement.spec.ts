import { test, expect } from "@playwright/test";

/**
 * Procurement & Approval E2E Tests (RA-217)
 * Tests procurement and approval-related API endpoints and dashboard routes
 */

test.describe("Procurement API Authentication", () => {
  test("should require authentication for procurement endpoints", async ({
    request,
  }) => {
    // Test procurement-related protected endpoints return 401
    // "/api/contractors" is NOT here on purpose: app/api/contractors/route.ts
    // is public by design (it returns only isPubliclyVisible profiles and is
    // rate-limited against directory scraping). Asserting 401 on it made this
    // spec fail with "expected 401, received 200", which reads exactly like an
    // auth hole and is not one. The protected sibling is
    // /api/contractors/profile, which security.spec.ts already covers.
    const protectedEndpoints = [
      // "/api/team" itself has no route.ts -- only /members, /activity,
      // /assignees and /invites exist -- so it answered 404, not 401.
      "/api/team/members",
      "/api/notifications",
      "/api/integrations",
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await request.get(endpoint);
      // Named in the message: the loop previously reported only "expected 401,
      // received 200" with no way to tell WHICH endpoint answered.
      expect(
        response.status(),
        `Expected 401 from GET ${endpoint}, got ${response.status()}`,
      ).toBe(401);
    }
  });
});

test.describe("Procurement Dashboard Routes", () => {
  test("should redirect /dashboard/contractors to login without auth", async ({
    page,
  }) => {
    await page.goto("/dashboard/contractors");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test("should redirect /dashboard/team to login without auth", async ({
    page,
  }) => {
    await page.goto("/dashboard/team");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test("should redirect /dashboard/integrations to login without auth", async ({
    page,
  }) => {
    await page.goto("/dashboard/integrations");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
