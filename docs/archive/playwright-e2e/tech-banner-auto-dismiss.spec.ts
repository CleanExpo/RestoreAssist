import { test, expect } from "@playwright/test";
import { loginAs, seedAuthorisation } from "./_helpers/auth";

test("dashboard banner auto-dismisses after first Authorisation", async ({
  page,
}) => {
  await loginAs(page, "USER");
  await page.goto("/dashboard");
  await expect(page.getByText(/Add your IICRC/)).toBeVisible();

  await seedAuthorisation(page, {
    subjectLicenceNumber: "IICRC-1",
    whsCardNumber: "WHS-1",
  });
  await page.reload();
  await expect(page.getByText(/Add your IICRC/)).toHaveCount(0);
});
