import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

test("Article detail page renders frontmatter + body + related", async ({ page, request, context }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 10 } });
  const { data } = await seed.json();
  // Signing in on `request` alone left `page` unauthenticated: they are
  // SEPARATE cookie jars, so every navigation below landed on /login and the
  // assertions failed as "element(s) not found", which reads like missing
  // content and is not. Same defect billing/webhook-race.spec.ts records.
  // `role` is also required by the helper route (400 without it).
  const signIn = await request.post("/api/test/sign-in-as", {
    data: { role: "USER", email: data.email },
  });
  await applySessionCookieFromResponse(context, signIn);

  await page.goto("/dashboard/help/getting-started/first-inspection");

  await expect(page.getByRole("heading", { level: 1, name: /your first inspection/i })).toBeVisible();
  await expect(page.getByText(/8 min read/i)).toBeVisible();
  await expect(page.getByText(/Related articles/i)).toBeVisible();
});
