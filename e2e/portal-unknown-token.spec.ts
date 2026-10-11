/**
 * The homeowner portal is reached only by a tokened link, so the production
 * smoke never exercised it — and on 2026-10-11 every /portal/<token> request
 * on restoreassist.app returned 500 (the ClientPortalAccount.inspectionId
 * migration had not been applied) while this smoke stayed green.
 *
 * An unknown token must be refused cleanly, never a 500. The lookup reads
 * ClientPortalAccount before it can decide the token is bad, so schema drift
 * on that table surfaces here.
 *
 * A fresh token per run: the updates route rate-limits per token and fails
 * closed to 429 when Upstash is unreachable. A fixed token would share one
 * bucket across every 15-minute run, and a smoke failure rolls production
 * back (deploy-production.yml). 429 is the limiter, not the portal, so it is
 * accepted; only a 5xx fails.
 */
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

test.describe("@smoke homeowner portal refuses an unknown token without a server error", () => {
  test("GET /portal/<unknown> renders the expired-link page", async ({
    page,
  }) => {
    const res = await page.goto(`/portal/smoke-${randomUUID()}`);
    expect(res, "navigation returned no response").not.toBeNull();
    expect(res!.status(), `status ${res!.status()}`).toBeLessThan(500);
    await expect(
      page.getByRole("heading", { name: /this job link has expired/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("GET /api/portal/<unknown>/updates is 404 (or 429 from the limiter)", async ({
    request,
  }) => {
    const res = await request.get(`/api/portal/smoke-${randomUUID()}/updates`);
    expect([404, 429], `status ${res.status()}`).toContain(res.status());
  });
});
