/**
 * E2E: Onboarding hotfix (2026-05-14) — Google Drive BYOK happy path.
 *
 * Verification gate from spec §4.1:
 *   "new tradie signs up → setup wizard StorageCard 'Connect Google Drive' →
 *    OAuth grant → return to /setup → Organization row has
 *    storageProvider=GOOGLE_DRIVE + encrypted refresh token."
 *
 * To keep the suite hermetic we mock Google's auth + token endpoints via
 * Playwright route interception. The real OAuth grant screen is exercised
 * manually as part of Task 10 (deferred from this implementation pass).
 */

import { test, expect } from "@playwright/test";
import { generateValidAbn } from "./helpers/abn";

test.describe("@smoke onboarding hotfix — Google Drive storage card", () => {
  test("connects via mocked OAuth and shows 'Connected as <email>'", async ({
    page,
    context,
  }) => {
    // 1. Intercept Google's authorize endpoint and immediately redirect
    //    back to the app's callback as if the user had granted consent.
    await context.route(
      "https://accounts.google.com/o/oauth2/v2/auth*",
      async (route) => {
        const url = new URL(route.request().url());
        const state = url.searchParams.get("state") ?? "";
        const redirectUri =
          url.searchParams.get("redirect_uri") ??
          "http://localhost:3000/api/oauth/google-drive/callback";
        const cbUrl = new URL(redirectUri);
        cbUrl.searchParams.set("code", "fake-auth-code");
        cbUrl.searchParams.set("state", state);
        await route.fulfill({
          status: 302,
          headers: { location: cbUrl.toString() },
          body: "",
        });
      },
    );

    // 2. Mock the token exchange endpoint.
    await context.route("https://oauth2.googleapis.com/token", async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "fake-access-token",
          refresh_token: "fake-refresh-token",
          expires_in: 3600,
          token_type: "Bearer",
          scope:
            "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata openid email",
        }),
      }),
    );

    // 3. Mock the userinfo endpoint used by fetchGoogleUserEmail.
    await context.route(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      async (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ email: "test@example.com" }),
        }),
    );

    // 4. Sign up a fresh tradie.
    const email = `e2e-storage-${Date.now()}@test.com`;
    const password = "test-password-12345!";
    await page.goto("/signup");
    await page.getByLabel(/full name/i).fill("E2E Storage");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill(password);
    // Anchor the regex so the "Show confirm password" visibility-toggle
    // button — which also matches /confirm password/i — doesn't conflict
    // with the textbox under Playwright's strict mode (RA-4953).
    await page.getByLabel(/^confirm password$/i).fill(password);
    await page.getByRole("checkbox", { name: /i agree/i }).check();
    await page.getByRole("button", { name: /create account/i }).click();

    // 5. Land on /setup.
    await page.waitForURL(/\/(dashboard|setup)/);
    if (!page.url().includes("/setup")) {
      await page.goto("/setup");
    }

    // 6. Submit a valid ABN so the wizard advances past Business Details.
    //    RA-4989 — generate a fresh valid ABN each run so the Organization.abn
    //    UNIQUE constraint doesn't reject the second-and-later smoke
    //    iterations (which otherwise crashed hydrate with P2002).
    const syntheticAbn = generateValidAbn();
    await page.getByPlaceholder(/e\.g\. 53 004 085 616/i).fill(syntheticAbn);
    await page.getByRole("button", { name: /start setup/i }).click();

    // 7. Click "Google Drive" on the StorageCard.
    await page.getByLabel(/google drive/i).click();

    // 8. After the mocked OAuth round-trip, /setup re-renders with the
    //    connected state.
    await page.waitForURL(/\/setup\?storage=connected/, { timeout: 15_000 });
    await expect(page.getByText(/connected as/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("test@example.com")).toBeVisible();
  });
});
