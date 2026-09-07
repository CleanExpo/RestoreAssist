import { test, expect } from "@playwright/test";

test("Public /help renders without auth", async ({ page }) => {
  await page.goto("/help");
  await expect(page.getByRole("heading", { level: 1, name: /RestoreAssist Help/i })).toBeVisible();
});

test("Public article renders without auth (audience: tradie)", async ({ page }) => {
  await page.goto("/help/getting-started/first-inspection");
  // tradie audience — should render
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
