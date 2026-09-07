import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

test("Help dropdown opens and lists 8 categories", async ({ page, request, context }) => {
  // Seed any active user (the dropdown is universal)
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

  await page.goto("/dashboard");
  await page.getByRole("button", { name: /how to/i }).click();

  await expect(page.getByText(/getting started/i)).toBeVisible();
  await expect(page.getByText(/inspections/i)).toBeVisible();
  await expect(page.getByText(/reports/i)).toBeVisible();
  await expect(page.getByText(/clients & portal/i)).toBeVisible();
  await expect(page.getByText(/billing/i)).toBeVisible();
  await expect(page.getByText(/team/i)).toBeVisible();
  await expect(page.getByText(/integrations/i)).toBeVisible();
  await expect(page.getByText(/compliance/i)).toBeVisible();
});
