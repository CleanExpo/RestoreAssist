import { test, expect } from "@playwright/test";

test("website URL unreachable → BrandCard falls back to manual upload", async ({
  page,
}) => {
  const email = `e2e-web-fail-${Date.now()}@test.com`;
  const password = "test-password-12345!";

  await page.goto("/signup");
  await page.getByLabel(/full name/i).fill("E2E Web Fail");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByLabel(/^confirm password$/i).fill(password);
  await page.getByRole("checkbox", { name: /i agree/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();

  await page.waitForURL(/\/(dashboard|setup)/);
  if (!page.url().includes("/setup")) {
    await page.goto("/setup");
  }

  // Valid ABN + unreachable website URL
  await page.getByPlaceholder(/e\.g\. 53 004 085 616/i).fill("53004085616");
  await page
    .getByPlaceholder(/yourcompany\.com\.au|website url/i)
    .fill("https://this-domain-cannot-resolve-12345abcdef.invalid");
  await page.getByRole("button", { name: /start setup/i }).click();

  // Brand card eventually shows manual upload UI (logo button + color pickers)
  await expect(page.getByLabel(/upload or replace logo/i)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel(/primary colour picker/i)).toBeVisible();
});
