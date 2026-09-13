import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

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
