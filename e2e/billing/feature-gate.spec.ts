import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

test("upgrade page renders feature-gated reason copy", async ({ page, request, context }) => {
  // STANDARD user clicks a PREMIUM feature
  const seed = await request.post("/api/test/seed-trial-user", {
    data: { daysUntilExpiry: 10, subscriptionStatus: "ACTIVE" },
  });
  const { data } = await seed.json();
  // `request` is a SEPARATE cookie jar from `page`'s browser context, so signing
  // in through it left the page unauthenticated and every navigation below landed
  // on /login. Assertions then failed as "text not found", which reads like missing
  // copy and is not. Proven 2026-09-07: applying the cookie to the page's context
  // puts it on the real dashboard. Uses the helper auth.setup.ts already uses.
  const signIn = await request.post("/api/test/sign-in-as", { data: { role: "USER", email: data.email } });
  await applySessionCookieFromResponse(context, signIn);

  // Visit upgrade page directly with feature reason — FeatureGate mount-sites are out of scope here
  await page.goto("/billing/upgrade?reason=feature&feature=advanced-damage");
  // `advanced-damage` renders in TWO <p> elements on the upgrade page, so a bare
  // getByText tripped strict mode and read as missing copy. The feature-gated
  // reason copy IS rendered; the locator was ambiguous.
  await expect(page.getByText(/advanced-damage/i).first()).toBeVisible();
});
