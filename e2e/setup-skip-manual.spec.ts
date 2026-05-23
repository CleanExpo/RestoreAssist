import { test, expect } from "@playwright/test";

// TODO(setup-wizard Phase 7+): un-skip when SetupShell adds:
//   - Small low-contrast "Skip to manual setup" link at the bottom of the page
//   - Confirmation modal: "Setup uses AI to save you time. Are you sure you want to fill this in manually?"
//   - On confirm: flip ALL section states to 'manual' + track Organization.setupMode = MANUAL
test.skip("skip-to-manual: small escape hatch flips all sections to manual", async ({
  page,
}) => {
  const email = `e2e-skip-manual-${Date.now()}@test.com`;
  const password = "test-password-12345!";

  await page.goto("/signup");
  await page.getByLabel(/full name/i).fill("E2E Skip Manual");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByLabel(/^confirm password$/i).fill(password);
  await page.getByRole("checkbox", { name: /i agree/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();

  await page.waitForURL(/\/(dashboard|setup)/);
  if (!page.url().includes("/setup")) {
    await page.goto("/setup");
  }

  // Click "Skip to manual setup" link (NOT YET BUILT)
  await page.getByText(/skip to manual setup/i).click();

  // Confirm modal
  await expect(
    page.getByText(/are you sure you want to fill this in manually/i),
  ).toBeVisible();
  await page.getByRole("button", { name: /yes|confirm/i }).click();

  // All sections flip to manual — verify by looking for manual entry inputs
  await expect(page.getByPlaceholder(/legal name/i)).toBeVisible();
  await expect(page.getByLabel(/upload or replace logo/i)).toBeVisible();
});
