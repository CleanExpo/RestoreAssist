import { test, expect } from "@playwright/test";
import { TEST_HEADSHOT_JPEG } from "./fixtures/headshot-jpeg";

test.use({ viewport: { width: 393, height: 852 } }); // iPhone 14 Pro

test("invited technician — email/password happy path", async ({ page, request }) => {
  // Requires: POST /api/test/seed-org-with-manager (seed-helper route)
  const seed = await request.post("/api/test/seed-org-with-manager", {
    data: { managerEmail: `mgr-${Date.now()}@test.com` },
  });
  const { token, inviteeEmail } = await seed.json();

  await page.goto(`/invite/${token}`);
  await expect(page.getByText("You've been invited")).toBeVisible();

  await page.getByLabel("Your name").fill("Jamie Tradie");
  await page.getByLabel("Mobile (used for SMS reminders)").fill("0412345678");
  await page
    .getByLabel("Set a password (min 12 chars)")
    .fill("verysecurepassword12");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "headshot.jpg",
      mimeType: "image/jpeg",
      buffer: TEST_HEADSHOT_JPEG,
    });

  // CRITICAL: wait for the headshot preview to appear before clicking Continue.
  // squareCropToDataUrl is async; setInputFiles fires onChange, the handler
  // awaits the crop, then setState updates headshotDataUrl, which renders the
  // preview <img alt="Headshot preview">. Without this wait, the test races
  // the async crop pipeline.
  await expect(page.locator('img[alt="Headshot preview"]')).toBeVisible({
    timeout: 5000,
  });

  await page.getByRole("button", { name: "Continue →" }).click();

  await page.getByLabel(/Terms of Service/).check();
  await page.getByLabel(/chain-of-custody/).check();
  await page.getByRole("button", { name: /Join/ }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/Add your IICRC/)).toBeVisible();
});
