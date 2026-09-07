import { test, expect } from "@playwright/test";

test("happy path: signup → ABN → all sections green → Activate → dashboard with sample report", async ({
  page,
}) => {
  const email = `e2e-happy-${Date.now()}@test.com`;
  const password = "test-password-12345!";

  // 1. Sign up
  await page.goto("/signup");
  await page.getByLabel(/full name/i).fill("E2E Happy");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByLabel(/^confirm password$/i).fill(password);
  await page.getByRole("checkbox", { name: /i agree/i }).check();
  await page.getByRole("button", { name: /create account/i }).click();

  // 2. After signup user normally lands on /dashboard?welcome=1.
  //    Phase 6 middleware (when shipped) would redirect to /setup automatically.
  //    For now, navigate to /setup explicitly.
  await page.waitForURL(/\/(dashboard|setup)/);
  if (!page.url().includes("/setup")) {
    await page.goto("/setup");
  }

  // 3. /setup loaded — find ABN input
  await expect(page.getByText(/let.s get you set up/i)).toBeVisible();
  await page.getByPlaceholder(/e\.g\. 53 004 085 616/i).fill("53004085616");

  // 4. Submit
  await page.getByRole("button", { name: /start setup/i }).click();

  // 5. Wait for Business Details to hit ready (legal name appears)
  //    Using a generous 30s timeout because ABR sandbox + Gemma + pricing all chain
  await expect(page.getByText(/B P AUSTRALIA|BHP|legal name/i)).toBeVisible({
    timeout: 30_000,
  });

  // 6. Pricing card visible (master tech / hour row)
  await expect(page.getByText(/master tech/i)).toBeVisible();

  // 7. Activate (button enabled once at least the required-red checks turn green)
  //    Brand may show [PENDING] yellow but that's acceptable
  const activate = page.getByRole("button", { name: /activate my workspace/i });
  await expect(activate).toBeEnabled({ timeout: 15_000 });
  await activate.click();

  // 8. Lands on dashboard with firstRun banner
  await page.waitForURL(/\/dashboard\?firstRun=1/, { timeout: 15_000 });
  await expect(page.getByText(/sample/i)).toBeVisible({ timeout: 10_000 });
});
