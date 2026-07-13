import { test, expect } from "@playwright/test";

test("cancel from Stripe returns to /billing/upgrade?cancelled=1 with subdued copy", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 5 } });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  await page.goto("/billing/upgrade?cancelled=1");
  await expect(page.getByText(/no problem/i)).toBeVisible();
});
