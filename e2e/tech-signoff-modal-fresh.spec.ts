import { test, expect } from "@playwright/test";
import { loginAs, seedInspection } from "./_helpers/auth";

test("USER first sign-off opens fresh modal; second sign-off opens prefilled", async ({
  page,
}) => {
  await loginAs(page, "USER");
  await seedInspection(page);
  await page.goto("/dashboard/inspections/test-inspection");
  await page.getByRole("button", { name: /Sign Inspection/ }).click();
  await expect(page.getByText(/Add your credentials/)).toBeVisible();

  await page.getByLabel("IICRC certificate number").fill("IICRC-1");
  await page.getByLabel("WHS card / White Card number").fill("WHS-1");
  await page.getByRole("button", { name: /Verify and continue/ }).click();

  await page.getByRole("button", { name: /Sign Inspection/ }).click();
  await expect(page.getByText(/Still using these credentials/)).toBeVisible();
  await expect(page.getByText(/IICRC-1/)).toBeVisible();
});
