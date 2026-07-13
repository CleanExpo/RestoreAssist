import { test, expect } from "@playwright/test";

test("invite link expired — shows 410 page UX", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-org-with-manager", {
    data: { expiresInDays: -1 },
  });
  const { token } = await seed.json();

  await page.goto(`/invite/${token}`);
  await expect(page.getByText(/expired/i)).toBeVisible();
});
