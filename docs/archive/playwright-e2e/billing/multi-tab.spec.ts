import { test, expect } from "@playwright/test";

test("multi-tab dashboard loads cleanly for the same user", async ({ browser, request }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 5 } });
  const { data } = await seed.json();

  const contextA = await browser.newContext();
  await contextA.request.post("/api/test/sign-in-as", { data: { email: data.email } });
  const pageA = await contextA.newPage();
  await pageA.goto("/dashboard");
  await expect(pageA).toHaveURL(/\/dashboard/);

  const contextB = await browser.newContext();
  await contextB.request.post("/api/test/sign-in-as", { data: { email: data.email } });
  const pageB = await contextB.newPage();
  await pageB.goto("/dashboard");
  await expect(pageB).toHaveURL(/\/dashboard/);
});
