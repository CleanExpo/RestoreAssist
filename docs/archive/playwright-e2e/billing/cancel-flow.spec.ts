import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

// KNOWN RED — RA-7473. The reassurance copy does not exist. `/no problem/i` is absent
// from /billing/upgrade?cancelled=1 on a properly authenticated page. Verified
// after the sign-in cookie-jar bug was fixed, so this is NOT the login page and
// NOT an ambiguous locator -- it is a genuine gap.
//
// test.fail(), so the day the copy is written this test PASSES and the run goes
// RED to tell us. A skip would go quiet.
test.fail();
test("cancel from Stripe returns to /billing/upgrade?cancelled=1 with subdued copy", async ({ page, request, context }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 5 } });
  const { data } = await seed.json();
  // `request` is a SEPARATE cookie jar from `page`'s browser context, so signing
  // in through it left the page unauthenticated and every navigation below landed
  // on /login. Assertions then failed as "text not found", which reads like missing
  // copy and is not. Proven 2026-09-07: applying the cookie to the page's context
  // puts it on the real dashboard. Uses the helper auth.setup.ts already uses.
  const signIn = await request.post("/api/test/sign-in-as", { data: { role: "USER", email: data.email } });
  await applySessionCookieFromResponse(context, signIn);

  await page.goto("/billing/upgrade?cancelled=1");
  await expect(page.getByText(/no problem/i)).toBeVisible();
});
