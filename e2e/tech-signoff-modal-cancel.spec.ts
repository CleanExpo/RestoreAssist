import { test, expect } from "@playwright/test";
import { loginAs, seedInspection } from "./_helpers/auth";

// Own user and own inspection, not the shared USER / "test-inspection".
// tech-second-signoff-prefilled seeds a fresh Authorisation for the shared
// USER, and InspectionSignOff's mount probe then skips straight to the
// unlocked form: no "Sign Inspection" button, no modal to cancel. This spec
// only passed when its click beat that probe.
const EMAIL = "e2e-signoff-cancel@restoreassist.app";
const INSPECTION = "test-inspection-signoff-cancel";

test("USER cancels the modal — returns to inspection without dropping evidence", async ({
  page,
}) => {
  await loginAs(page, "USER", { email: EMAIL });
  await seedInspection(page, { inspectionId: INSPECTION });
  await page.goto(`/dashboard/inspections/${INSPECTION}`);
  await page.getByRole("button", { name: /Sign Inspection/ }).click();
  await expect(page.getByText(/Add your credentials/)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText(/Add your credentials/)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`inspections/${INSPECTION}`));
});
