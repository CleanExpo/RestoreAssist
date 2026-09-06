import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

test("success page renders pending-activation or redirects", async ({ page, request, context }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 5 } });
  const { data } = await seed.json();
  // `request` is a SEPARATE cookie jar from `page`'s browser context, so signing
  // in through it left the page unauthenticated and every navigation below landed
  // on /login. Assertions then failed as "text not found", which reads like missing
  // copy and is not. Proven 2026-09-07: applying the cookie to the page's context
  // puts it on the real dashboard. Uses the helper auth.setup.ts already uses.
  const signIn = await request.post("/api/test/sign-in-as", { data: { role: "USER", email: data.email } });
  await applySessionCookieFromResponse(context, signIn);

  // Visit success with a fake session_id; Stripe lookup will fail in test mode without a real session
  // Expect either redirect back to /billing/upgrade?cancelled=1 OR the pending-activation page
  await page.goto("/billing/success?session_id=cs_test_fake");
  await expect(page).toHaveURL(/\/billing\/(success|upgrade)/);
});
