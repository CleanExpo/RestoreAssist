import { test, expect } from "@playwright/test";

test("already-used invite — redirects to /login with explainer", async ({
  page,
  request,
}) => {
  const seed = await request.post("/api/test/seed-org-with-manager", {
    data: { markUsed: true },
  });
  const { token } = await seed.json();

  await page.goto(`/invite/${token}`);
  await expect(page.getByText(/already been used/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Login/i })).toBeVisible();
});
