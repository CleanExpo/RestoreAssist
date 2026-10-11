/**
 * The homeowner portal is reached only by a tokened link, so the production
 * smoke never exercised it — and on 2026-10-11 every /portal/<token> request
 * on restoreassist.app returned 500 (the ClientPortalAccount.inspectionId
 * migration had not been applied) while this smoke stayed green.
 *
 * An unknown token must be refused cleanly (404/401 or the expired-link page),
 * never a 500. Any schema drift on the portal lookup surfaces here, because
 * the lookup reads ClientPortalAccount before it can decide the token is bad.
 */
import { test, expect } from "@playwright/test";

const UNKNOWN_TOKEN = "smoke-unknown-portal-token-000000000000";

test.describe("@smoke homeowner portal refuses an unknown token without a server error", () => {
  test("GET /portal/<unknown> is not a 5xx", async ({ request }) => {
    const res = await request.get(`/portal/${UNKNOWN_TOKEN}`, {
      maxRedirects: 0,
    });
    expect(res.status(), `status ${res.status()}`).toBeLessThan(500);
  });

  test("GET /api/portal/<unknown>/updates is 404", async ({ request }) => {
    const res = await request.get(`/api/portal/${UNKNOWN_TOKEN}/updates`);
    expect(res.status()).toBe(404);
  });
});
