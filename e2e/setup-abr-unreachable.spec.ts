import { test, expect } from "@playwright/test";

test("ABR unreachable → Business Details card falls back to manual entry", async ({
  page,
  context,
}) => {
  const email = `e2e-abr-down-${Date.now()}@test.com`;
  const password = "test-password-12345!";

  // Block all ABR requests (both abr.business.gov.au and any sandbox URL)
  await context.route("**/abr.business.gov.au/**", (route) => route.abort());

  // Sign up
  await page.goto("/signup");
  await page.getByLabel(/full name/i).fill("E2E ABR Down");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByLabel(/^confirm password$/i).fill(password);
  await page.getByRole("checkbox", { name: /i agree/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();

  // Navigate to /setup (Phase 6 middleware would handle this auto; for now manual)
  await page.waitForURL(/\/(dashboard|setup)/);
  if (!page.url().includes("/setup")) {
    await page.goto("/setup");
  }

  // Enter ABN — server will try ABR and fail
  await page.getByPlaceholder(/e\.g\. 53 004 085 616/i).fill("53004085616");
  await page.getByRole("button", { name: /start setup/i }).click();

  // Wait for Business Details section to surface the manual fallback message
  await expect(
    page.getByText(
      /couldn.t reach the business register|fill these in manually/i,
    ),
  ).toBeVisible({ timeout: 30_000 });

  // Confirm manual entry inputs are present
  await expect(page.getByPlaceholder(/legal name/i)).toBeVisible();
  await expect(page.getByPlaceholder(/abn/i)).toBeVisible();
});
