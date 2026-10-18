import { test, expect } from "@playwright/test";
import { TEST_HEADSHOT_JPEG } from "./fixtures/headshot-jpeg";

test.use({ viewport: { width: 393, height: 852 } });

test.describe("RA-P1-1 — technician never hits owner setup wizard", () => {
  test("invited technician lands on dashboard, not /setup", async ({
    page,
    request,
  }) => {
    test.skip(
      process.env.ALLOW_TEST_HELPERS !== "true",
      "Set ALLOW_TEST_HELPERS=true for invite seed route",
    );

    const seed = await request.post("/api/test/seed-org-with-manager", {
      // One seat for the one seeded invite: technician seats are enforced at
      // acceptance (7f7b703a5), and a seed with no seat answers 402 on "Join".
      data: {
        managerEmail: `mgr-gate-${Date.now()}@test.com`,
        technicianSeats: 1,
      },
    });
    expect(seed.ok()).toBeTruthy();
    const { token } = await seed.json();

    await page.goto(`/invite/${token}`);
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

    // The seeded invite is role USER, and a USER lands on Field Mode
    // (app/invite/[token]/page.tsx); a manager or admin gets /dashboard?firstRun=tech.
    await page.waitForURL(/\/dashboard\/field(\?|$)/, { timeout: 30_000 });
    expect(page.url()).not.toContain("/setup");
  });
});
