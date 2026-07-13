import { test, expect } from "@playwright/test";

// TODO(setup-wizard Phase 7+): un-skip when BusinessDetailsCard adds:
//   - "I don't have an ABN" link below the ABN input
//   - Modal with 3 options: (a) link to ABR registration site, (b) Continue
//     without ABN — pre-trading mode, (c) Help me apply
//   - "Continue without ABN" sets tradingStatus=PRE_TRADING on Organization
test.skip("no ABN → pre-trading mode (Continue without ABN flow)", async ({
  page,
}) => {
  const email = `e2e-no-abn-${Date.now()}@test.com`;
  const password = "test-password-12345!";

  await page.goto("/signup");
  await page.getByLabel(/full name/i).fill("E2E No ABN");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByLabel(/^confirm password$/i).fill(password);
  await page.getByRole("checkbox", { name: /i agree/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();

  await page.waitForURL(/\/(dashboard|setup)/);
  if (!page.url().includes("/setup")) {
    await page.goto("/setup");
  }

  // Click the "I don't have an ABN" link (NOT YET BUILT)
  await page.getByText(/i don.t have an abn/i).click();

  // Modal appears with 3 options
  await expect(page.getByText(/continue without abn/i)).toBeVisible();

  await page
    .getByRole("button", { name: /continue without abn|pre-trading/i })
    .click();

  // Sections flip to manual; pre-trading indicator visible
  await expect(page.getByText(/pre-trading/i)).toBeVisible();
});
