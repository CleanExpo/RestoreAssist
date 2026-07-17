import { test, expect } from "@playwright/test";

test("upgrade page renders feature-gated reason copy", async ({ page, request }) => {
  // STANDARD user clicks a PREMIUM feature
  const seed = await request.post("/api/test/seed-trial-user", {
    data: { daysUntilExpiry: 10, subscriptionStatus: "ACTIVE" },
  });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  // Visit upgrade page directly with feature reason — FeatureGate mount-sites are out of scope here
  await page.goto("/billing/upgrade?reason=feature&feature=advanced-damage");
  await expect(page.getByText(/advanced-damage/i)).toBeVisible();
});
