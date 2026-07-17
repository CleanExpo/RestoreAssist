import { test, expect } from "@playwright/test";

test("TRIAL user with 2 days left sees banner and reaches upgrade page", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 2 } });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  await page.goto("/dashboard");
  await expect(page.getByText(/2 days left/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: /upgrade/i }).first().click();
  await expect(page).toHaveURL(/\/billing\/upgrade/);
  await expect(page.getByText(/Standard/i)).toBeVisible();
});
