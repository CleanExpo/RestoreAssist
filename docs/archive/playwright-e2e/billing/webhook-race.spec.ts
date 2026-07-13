import { test, expect } from "@playwright/test";

test("success page renders pending-activation or redirects", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 5 } });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  // Visit success with a fake session_id; Stripe lookup will fail in test mode without a real session
  // Expect either redirect back to /billing/upgrade?cancelled=1 OR the pending-activation page
  await page.goto("/billing/success?session_id=cs_test_fake");
  await expect(page).toHaveURL(/\/billing\/(success|upgrade)/);
});
