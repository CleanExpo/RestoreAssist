import { test, expect } from "@playwright/test";
import { TEST_HEADSHOT_JPEG } from "./fixtures/headshot-jpeg";

test.use({ viewport: { width: 393, height: 852 } }); // iPhone 14 Pro

test.describe("W11 — team invite accept", () => {
  test("invited technician — email/password happy path", async ({
    page,
    request,
  }) => {
    test.skip(
      process.env.ALLOW_TEST_HELPERS !== "true",
      "Set ALLOW_TEST_HELPERS=true for invite seed route",
    );
    const seed = await request.post("/api/test/seed-org-with-manager", {
      data: { managerEmail: `mgr-${Date.now()}@test.com` },
    });
    expect(seed.ok(), "seed-org-with-manager must return 200").toBeTruthy();
    const { token, inviteeEmail } = await seed.json();
    expect(token).toBeTruthy();

    await page.goto(`/invite/${token}`);
    await expect(page.getByText("You've been invited")).toBeVisible();

    await page.getByLabel("Your name").fill("Jamie Tradie");
    await page.getByLabel("Mobile (used for SMS reminders)").fill("0412345678");
    await page
      .getByLabel("Set a password (min 12 chars)")
      .fill("verysecurepassword12");
    await page.locator('input[type="file"]').setInputFiles({
      name: "headshot.jpg",
      mimeType: "image/jpeg",
      buffer: TEST_HEADSHOT_JPEG,
    });

    await expect(page.locator('img[alt="Headshot preview"]')).toBeVisible({
      timeout: 5000,
    });

    await page.getByRole("button", { name: "Continue →" }).click();

    await page.getByLabel(/Terms of Service/).check();
    await page.getByLabel(/chain-of-custody/).check();
    await page.getByRole("button", { name: /^Join / }).click();

    await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 30_000 });
    await expect(page).toHaveURL(/firstRun=tech|\/dashboard/);

    await expect(
      page.getByText(/Add your credentials to unlock attestations|IICRC certificate/i),
    ).toBeVisible({ timeout: 15_000 });

    expect(inviteeEmail).toMatch(/@/);
  });
});
