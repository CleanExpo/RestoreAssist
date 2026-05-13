import { test, expect } from "@playwright/test";

test("USER cancels the modal — returns to inspection without dropping evidence", async ({
  page,
  request,
}) => {
  await request.post("/api/test/sign-in-as", { data: { role: "USER" } });
  await page.goto("/dashboard/inspections/test-inspection");
  await page.getByRole("button", { name: /Submit for review/ }).click();
  await expect(page.getByText(/Add your credentials/)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText(/Add your credentials/)).toHaveCount(0);
  await expect(page).toHaveURL(/inspections\/test-inspection/);
});
