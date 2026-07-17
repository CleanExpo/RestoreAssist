import { test, expect } from "@playwright/test";
import { loginAs, seedInspection, seedAuthorisation } from "./_helpers/auth";

test("second sign-off: Authorisation < 90 days auto-unlocks form (modal skipped)", async ({
  page,
}) => {
  await loginAs(page, "USER");
  await seedInspection(page, { status: "SUBMITTED" });
  await seedAuthorisation(page, {
    subjectLicenceNumber: "IICRC-1",
    whsCardNumber: "WHS-1",
  });

  await page.goto("/dashboard/inspections/test-inspection");

  // T3 mount-time probe detects the recent Authorisation and transitions
  // straight to "form-unlocked" — the licence modal must never appear.
  await expect(page.getByRole("textbox", { name: /Full name/i })).toBeVisible();
  await expect(page.getByText(/Add your credentials/i)).toHaveCount(0);
});
