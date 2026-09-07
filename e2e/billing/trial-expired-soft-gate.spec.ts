import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

/**
 * RA-7439, decided 2026-09-07: an expired trial KEEPS the dashboard. The wall
 * sits at creating a report, not at the door.
 *
 * The trial is 15 days because setup is heavy. Someone who spent that time
 * configuring the system has built the very thing that makes them pay, and
 * redirecting them away from it on day 16 hides their own work from them.
 *
 * This file replaces hard-paywall.spec.ts, which asserted a redirect to
 * /billing/upgrade?reason=trial-expired. Nothing in the product produces that
 * reason, and after the decision above, nothing should.
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
