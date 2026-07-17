import { test, expect } from "@playwright/test";

test("Cmd-K opens search modal and finds a seed article", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 10 } });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  await page.goto("/dashboard");
  await page.keyboard.press("Meta+k");

  const input = page.getByPlaceholder(/search/i);
  await expect(input).toBeVisible();
  await input.fill("photo");

  await expect(page.getByText(/photo chain-of-custody/i)).toBeVisible({ timeout: 5_000 });
});
