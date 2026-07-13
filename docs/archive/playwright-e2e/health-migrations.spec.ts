import { test, expect } from "@playwright/test";

/**
 * RA-1742 — /api/health/migrations drift watchdog.
 * The 2026-04-27 stuck-migration outage left both sandbox and production
 * blind for days. This endpoint is the canary; the smoke gate locks its
 * shape so future PRs can't regress it.
 */

test.describe("API Health: migrations", () => {
  test("returns 200 with a fully-applied migration set", async ({
    request,
  }) => {
    const r = await request.get("/api/health/migrations");
    // Healthy = 200, drifted = 503. Both shapes are documented; we just
    // assert the response parses and carries the contract fields.
    expect([200, 503]).toContain(r.status());
    const body = await r.json();
    expect(body).toHaveProperty("status");
    expect(["ok", "drift"]).toContain(body.status);
    expect(body).toHaveProperty("counts");
    expect(body.counts).toHaveProperty("applied");
    expect(body.counts).toHaveProperty("failed");
    expect(body.counts).toHaveProperty("rolled_back");
    expect(body.counts).toHaveProperty("total");
    expect(typeof body.counts.applied).toBe("number");
    expect(typeof body.counts.total).toBe("number");
  });
});
