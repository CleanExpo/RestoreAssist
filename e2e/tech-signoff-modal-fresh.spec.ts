import { test, expect } from "@playwright/test";

test("USER first sign-off opens fresh modal; second sign-off opens prefilled", async ({
  page,
  request,
}) => {
  await request.post("/api/test/sign-in-as", { data: { role: "USER" } });
  await page.goto("/dashboard/inspections/test-inspection");
  await page.getByRole("button", { name: /Submit for review/ }).click();
  await expect(page.getByText(/Add your credentials/)).toBeVisible();

  await page.getByLabel("IICRC certificate number").fill("IICRC-1");
  await page.getByLabel("WHS card / White Card number").fill("WHS-1");
  await page.getByRole("button", { name: /Verify and continue/ }).click();

  await page.getByRole("button", { name: /Submit for review/ }).click();
  await expect(page.getByText(/Still using these credentials/)).toBeVisible();
  await expect(page.getByText(/IICRC-1/)).toBeVisible();
});
