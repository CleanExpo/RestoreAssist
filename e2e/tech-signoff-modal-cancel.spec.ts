import { test, expect } from "@playwright/test";
import { loginAs, seedInspection } from "./_helpers/auth";

test("USER cancels the modal — returns to inspection without dropping evidence", async ({
  page,
}) => {
  await loginAs(page, "USER");
  await seedInspection(page);
  await page.goto("/dashboard/inspections/test-inspection");
  await page.getByRole("button", { name: /Sign Inspection/ }).click();
  await expect(page.getByText(/Add your credentials/)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText(/Add your credentials/)).toHaveCount(0);
  await expect(page).toHaveURL(/inspections\/test-inspection/);
});
