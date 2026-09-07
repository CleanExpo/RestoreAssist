import { test, expect } from "@playwright/test";

test("Help dropdown opens and lists 8 categories", async ({ page, request }) => {
  // Seed any active user (the dropdown is universal)
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 10 } });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: /how to/i }).click();

  await expect(page.getByText(/getting started/i)).toBeVisible();
  await expect(page.getByText(/inspections/i)).toBeVisible();
  await expect(page.getByText(/reports/i)).toBeVisible();
  await expect(page.getByText(/clients & portal/i)).toBeVisible();
  await expect(page.getByText(/billing/i)).toBeVisible();
  await expect(page.getByText(/team/i)).toBeVisible();
  await expect(page.getByText(/integrations/i)).toBeVisible();
  await expect(page.getByText(/compliance/i)).toBeVisible();
});
