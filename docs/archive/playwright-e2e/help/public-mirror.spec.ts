import { test, expect } from "@playwright/test";
// Credential-gated. the Screenshot component throws without a Cloudinary cloud name; proven by supplying a dummy value and watching this pass
test.skip(
  !process.env.CLOUDINARY_URL,
  "requires CLOUDINARY_URL; see docs/e2e-36-spec-triage.md",
);


test("Public /help renders without auth", async ({ page }) => {
  await page.goto("/help");
  await expect(page.getByRole("heading", { level: 1, name: /RestoreAssist Help/i })).toBeVisible();
});

test("Public article renders without auth (audience: tradie)", async ({ page }) => {
  await page.goto("/help/getting-started/first-inspection");
  // tradie audience — should render
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
