import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 393, height: 852 } });

test("invited technician — Google OAuth path", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-org-with-manager", {
    data: { managerEmail: `mgr-${Date.now()}@test.com` },
  });
  const { token } = await seed.json();

  await request.post("/api/test/sign-in-google-as", {
    data: { email: `tech-${Date.now()}@example.com` },
  });

  await page.goto(`/invite/${token}`);
  await page.getByRole("button", { name: /Continue with Google/ }).click();
  await page.waitForURL(/\?step=2/);

  await page.getByLabel(/Terms of Service/).check();
  await page.getByLabel(/chain-of-custody/).check();
  await page.getByRole("button", { name: /Join/ }).click();

  await expect(page).toHaveURL(/\/dashboard/);
});
