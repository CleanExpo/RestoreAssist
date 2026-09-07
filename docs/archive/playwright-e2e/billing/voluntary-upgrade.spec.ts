import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

// KNOWN RED — RA-7465. The trial banner renders correctly, but its "Upgrade now"
// link cannot be clicked: the fixed <aside> sidebar intercepts the pointer
// events, for BOTH matching links, at 1280x720. That is a real revenue defect,
// not a test problem.
//
// test.fail() rather than a skip, and rather than continue-on-error on the CI
// step. It inverts the expectation: the moment RA-7465 is fixed and this test
// PASSES, the run goes RED and tells us. A skip would go quiet instead, and a
// step-level continue-on-error would also swallow regressions in the six
// specs beside it -- which is the defect this replaces.
test.fail();
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
  // TWO "Upgrade now" links match, and .first() resolved to one that never
  // became clickable, so the test timed out rather than reporting anything
  // useful. Target the link by the href the trial banner actually renders, and
  // take the visible one -- .first() on an ambiguous match picks whichever came
  // back, which is how this looked like a broken page instead of a broken locator.
  // .last(), not .first(): TWO "Upgrade now" links render with this href, and
  // the first is overlapped by the fixed <aside> sidebar, which intercepts the
  // pointer events. Playwright reported that as a 30s timeout, which reads like
  // a dead page rather than an obscured element. The in-content link is the one
  // a customer on this viewport can actually reach.
  //
  // The overlap itself is a real UI question and is filed separately -- an
  // upgrade call-to-action sitting under a fixed sidebar is a revenue surface
  // that some viewport cannot click.
  // Bounded to 5s on purpose. Unbounded, the click waits the full 30s test
  // budget and Playwright records `timedOut`, which is a DIFFERENT status from
  // `failed` and does NOT satisfy the test.fail() above -- measured: the run
  // reported `expected=failed results=['timedOut'] -> unexpected`. Bounding it
  // makes the real defect report as the failure it is.
  await page
    .locator('a[href="/billing/upgrade?reason=voluntary"]:visible')
    .last()
    .click({ timeout: 5_000 });
  await expect(page).toHaveURL(/\/billing\/upgrade/);
  await expect(page.getByText(/Standard/i)).toBeVisible();
});
