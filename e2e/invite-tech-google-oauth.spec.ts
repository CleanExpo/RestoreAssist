import { test, expect } from "@playwright/test";
// Credential-gated. The OAuth path cannot start without a client id; the server logs
// error=OAuthSignin.
//
// RA-7562: "set" is not the same as "usable". The Sketch E2E job now supplies a
// PLACEHOLDER GOOGLE_CLIENT_ID so lib/env-check.ts stops reporting a missing REQUIRED
// var. A truthy check would read that placeholder as a credential, unskip this spec,
// and send it at Google's real OAuth grant with an id Google will reject - turning a
// skip into a red job while proving nothing. So gate on the SHAPE of a real client id
// (a Google project number, a dash, then the hosted suffix), which no placeholder here
// satisfies and every genuine credential does. When real CI Google credentials land,
// this spec starts running on its own - no second flag to remember.
// "What a real Google client id looks like" already has an owner in this repo:
// GOOGLE_CLIENT_ID_PATTERN and the placeholder rejection inside
// configuredGoogleAudience(), both in app/api/auth/native-token-exchange/route.ts.
// Mirrored here rather than imported because importing that route pulls in
// createRemoteJWKSet and a live JWKS handle at module load. Keep the two in sync;
// a first version of this guard used a narrower character class and would have
// false-skipped a genuine hyphenated client id.
const GOOGLE_CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const HAS_REAL_GOOGLE_CLIENT =
  !/todo|placeholder|replace[-_ ]?me/i.test(GOOGLE_CLIENT_ID) &&
  GOOGLE_CLIENT_ID_PATTERN.test(GOOGLE_CLIENT_ID);
test.skip(
  !HAS_REAL_GOOGLE_CLIENT,
  "requires a REAL GOOGLE_CLIENT_ID (<project-number>-<id>.apps.googleusercontent.com); " +
    "a CI placeholder is deliberately not enough. See docs/e2e-36-spec-triage.md",
);


test.use({ viewport: { width: 393, height: 852 } });

test("invited technician — Google OAuth path", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-org-with-manager", {
    data: { managerEmail: `mgr-${Date.now()}@test.com` },
  });
  const { token } = await seed.json();

  await request.post("/api/test/sign-in-google-as", {
    data: { email: `tech-${Date.now()}@example.com` },
  });

  await page.goto(`/invite/${token}`);
  await page.getByRole("button", { name: /Continue with Google/ }).click();
  await page.waitForURL(/\?step=2/);

  await page.getByLabel(/Terms of Service/).check();
  await page.getByLabel(/chain-of-custody/).check();
  await page.getByRole("button", { name: /Join/ }).click();

  await expect(page).toHaveURL(/\/dashboard/);
});
