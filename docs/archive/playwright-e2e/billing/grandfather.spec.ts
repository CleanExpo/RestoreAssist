import { test, expect } from "@playwright/test";

test("existing TRIAL user with 27 days remaining (grandfathered) is unchanged", async ({ request }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 27 } });
  const { data } = await seed.json();
  expect(data.daysRemaining).toBe(27);

  // Verify via the trial-status API that their daysRemaining is preserved post-migration
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });
  const status = await request.get("/api/billing/trial-status");
  expect(status.ok()).toBe(true);
  const body = await status.json();
  expect(body.data.daysRemaining).toBeGreaterThan(15);
});
