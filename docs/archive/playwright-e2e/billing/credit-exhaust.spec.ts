import { test, expect } from "@playwright/test";

test("credit-exhausted event opens CreditExhaustModal", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 10 } });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  await page.goto("/dashboard");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("credit-exhausted")));

  await expect(page.getByText(/out of credits/i)).toBeVisible();
  const upgradeLink = page.getByRole("link", { name: /upgrade plan/i });
  await expect(upgradeLink).toHaveAttribute("href", "/billing/upgrade?reason=credits");
});
