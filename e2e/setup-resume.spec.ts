import { test, expect } from "@playwright/test";

test("resume: close tab mid-hydration → return → state restored", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page1 = await ctx.newPage();

  const email = `e2e-resume-${Date.now()}@test.com`;
  const password = "test-password-12345!";

  await page1.goto("/signup");
  await page1.getByLabel(/full name/i).fill("E2E Resume");
  await page1.getByLabel(/email/i).fill(email);
  await page1.getByLabel(/^password$/i).fill(password);
  await page1.getByLabel(/^confirm password$/i).fill(password);
  await page1.getByRole("checkbox", { name: /i agree/i }).check();
  await page1.getByRole("button", { name: /create account/i }).click();

  await page1.waitForURL(/\/(dashboard|setup)/);
  if (!page1.url().includes("/setup")) {
    await page1.goto("/setup");
  }

  await page1.getByPlaceholder(/e\.g\. 53 004 085 616/i).fill("53004085616");
  await page1.getByRole("button", { name: /start setup/i }).click();

  // Wait briefly for hydration to start (Business Details turns into "Looking up..." skeleton)
  await expect(page1.getByText(/looking up your business/i)).toBeVisible({
    timeout: 10_000,
  });

  // Close the tab mid-flight
  await page1.close();

  // Open a fresh tab in the SAME browser context (same auth cookie)
  const page2 = await ctx.newPage();
  await page2.goto("/setup");

  // The wizard should rehydrate from server-side Organization + HydrationJob state.
  // Either business details has progressed to ready, OR is still running, OR errored —
  // any of which is non-pending, meaning state was preserved.
  await page2.waitForLoadState("domcontentloaded");
  const hasReady = await page2
    .getByText(/legal name|trading name|active/i)
    .isVisible()
    .catch(() => false);
  const hasRunning = await page2
    .getByText(/looking up your business/i)
    .isVisible()
    .catch(() => false);
  const hasManual = await page2
    .getByText(/couldn.t reach|fill .* manually/i)
    .isVisible()
    .catch(() => false);

  expect(hasReady || hasRunning || hasManual).toBe(true);
});
