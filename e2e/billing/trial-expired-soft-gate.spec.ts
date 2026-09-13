import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

/**
 * RA-7439, decided 2026-09-07: an expired trial KEEPS the dashboard. The wall
 * sits at creating a report, not at the door.
 *
 * RA-7462: that wall must open `/billing/upgrade?reason=trial-expired` — the
 * page that already takes payment — not the generic credits / pricing wall.
 * Removing the banner or the reason parameter must turn this spec red.
 */
test("an expired trial can still open the dashboard", async ({
  page,
  context,
  request,
}) => {
  const seed = await request.post("/api/test/seed-trial-user", {
    data: { daysUntilExpiry: -1 },
  });
  const { data } = await seed.json();
  const signIn = await request.post("/api/test/sign-in-as", {
    data: { role: "USER", email: data.email },
  });
  await applySessionCookieFromResponse(context, signIn);

  await page.goto("/dashboard");

  // The whole assertion: they are NOT bounced. Not to /login, not to an
  // upgrade page. If this ever redirects, the soft-gating decision has been
  // reversed in code without RA-7439 being revisited.
  await expect(page).toHaveURL(/\/dashboard/);
});

test("an expired trial sees the subscribe banner and reaches the pay page", async ({
  page,
  context,
  request,
}) => {
  const seed = await request.post("/api/test/seed-trial-user", {
    data: { daysUntilExpiry: -1 },
  });
  const { data } = await seed.json();
  const signIn = await request.post("/api/test/sign-in-as", {
    data: { role: "USER", email: data.email },
  });
  await applySessionCookieFromResponse(context, signIn);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("trial-expired-banner")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/your trial has ended/i)).toBeVisible();

  // Same click contract as voluntary-upgrade (RA-7465): the CTA must be
  // reachable at Desktop Chrome 1280x720 after the banner moved into the
  // offset column. A covered link fails actionability; this is the proof.
  await page
    .locator('a[href="/billing/upgrade?reason=trial-expired"]:visible')
    .last()
    .click({ timeout: 5_000 });
  await expect(page).toHaveURL(/\/billing\/upgrade\?reason=trial-expired/);
  await expect(
    page.getByRole("heading", { name: /Continue with RestoreAssist/i }),
  ).toBeVisible();
});

test("creating a report after the trial ends opens the subscribe page", async ({
  page,
  context,
  request,
}) => {
  const seed = await request.post("/api/test/seed-trial-user", {
    data: { daysUntilExpiry: -1 },
  });
  const { data } = await seed.json();
  const signIn = await request.post("/api/test/sign-in-as", {
    data: { role: "USER", email: data.email },
  });
  await applySessionCookieFromResponse(context, signIn);

  await page.goto("/dashboard/reports/new");
  await expect(page).toHaveURL(/\/billing\/upgrade\?reason=trial-expired/, {
    timeout: 15_000,
  });
});
