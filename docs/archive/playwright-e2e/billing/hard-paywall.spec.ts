import { test, expect } from "@playwright/test";

test("expired trial user redirected to /billing/upgrade on /dashboard", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: -1 } });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/billing\/upgrade\?reason=trial-expired/);
  await expect(page.getByText(/trial has ended/i)).toBeVisible();
});
