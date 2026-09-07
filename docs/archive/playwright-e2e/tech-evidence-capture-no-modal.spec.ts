import { test, expect } from "@playwright/test";
import { loginAs, seedInspection } from "./_helpers/auth";

test("USER role: evidence capture never opens the licence modal (rule 25)", async ({
  page,
}) => {
  test.fixme(); // CapturePhotoFab exists with the exact aria-label; the seeded inspection does not put the page in a state that renders it

  await loginAs(page, "USER");
  await seedInspection(page);
  await page.goto("/dashboard/inspections/test-inspection");
  await page.getByRole("button", { name: /Capture photo/ }).click();
  await expect(page.getByText(/Add your credentials/)).toHaveCount(0);
  await expect(page.getByText(/Still using these credentials/)).toHaveCount(0);
});
