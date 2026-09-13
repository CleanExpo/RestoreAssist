import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

// RA-7465 — keep a real click, not an href assertion. The banner used to
// sit under the fixed sidebar at 1280x720; asserting href would pass while
// the customer still could not click through to pay.
test("TRIAL user with 2 days left sees banner and reaches upgrade page", async ({ page, request, context }) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 2 } });
  const { data } = await seed.json();
  // `request` is a SEPARATE cookie jar from `page`'s browser context, so signing
  // in through it left the page unauthenticated and every navigation below landed
  // on /login. Assertions then failed as "text not found", which reads like missing
  // copy and is not. Proven 2026-09-07: applying the cookie to the page's context
  // puts it on the real dashboard. Uses the helper auth.setup.ts already uses.
  const signIn = await request.post("/api/test/sign-in-as", { data: { role: "USER", email: data.email } });
  await applySessionCookieFromResponse(context, signIn);

  await page.goto("/dashboard");
  // The copy is present TWICE -- <strong>2 days left</strong> and the full banner
  // <span>2 days left in trial -- upgrade to keep your reports</span> -- so a bare
  // /2 days left/i tripped Playwright strict mode and reported "element(s) not
  // found". The banner was never missing. Assert the banner sentence, which is
  // what the customer actually reads, rather than .first() on an ambiguous match.
  await expect(
    page.getByText(/2 days left in trial/i).first(),
  ).toBeVisible({ timeout: 10_000 });
  // Target the voluntary-upgrade href the countdown banner renders. A text
  // match on "Upgrade now" is ambiguous (TrialBanner also uses that label
  // with a different destination). Click must succeed at 1280x720 — the
  // CTA used to sit under the fixed sidebar (RA-7465).
  await page
    .locator('a[href="/billing/upgrade?reason=voluntary"]:visible')
    .last()
    .click({ timeout: 5_000 });
  await expect(page).toHaveURL(/\/billing\/upgrade\?reason=voluntary/);
  // Single-catalogue upgrade page (RA-6929) — the retired Standard/Premium
  // tier names are gone. Land on the voluntary hero, not a leftover label.
  await expect(page.getByRole("heading", { name: /Choose a plan/i })).toBeVisible();
});
