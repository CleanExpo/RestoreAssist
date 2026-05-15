import { test, expect } from "@playwright/test";

test("Article detail page renders frontmatter + body + related", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 10 } });
  const { data } = await seed.json();
  await request.post("/api/test/sign-in-as", { data: { email: data.email } });

  await page.goto("/dashboard/help/getting-started/first-inspection");

  await expect(page.getByRole("heading", { level: 1, name: /your first inspection/i })).toBeVisible();
  await expect(page.getByText(/8 min read/i)).toBeVisible();
  await expect(page.getByText(/Related articles/i)).toBeVisible();
});
