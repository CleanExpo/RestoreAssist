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
      // One seat for the one seeded invite: technician seats are enforced at
      // acceptance (7f7b703a5), and a seed with no seat answers 402 on "Join".
      data: { managerEmail: `mgr-${Date.now()}@test.com`, technicianSeats: 1 },
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

    // The seeded invite is role USER, and a USER lands on Field Mode
    // (app/invite/[token]/page.tsx). The licence banner lives on /dashboard.
    await page.waitForURL(/\/dashboard\/field(\?|$)/, { timeout: 30_000 });
    await page.goto("/dashboard");

    // The technician licence banner (components/dashboard/TechLicenceBanner).
    // The old /…attestations|IICRC certificate/ alternation matched the banner's
    // headline, its body line and its "IICRC certificate pending" badge at once,
    // a strict-mode violation; the headline alone is the banner's own claim.
    await expect(
      page.getByText("Add your credentials to unlock attestations", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 15_000 });

    expect(inviteeEmail).toMatch(/@/);
  });
});
