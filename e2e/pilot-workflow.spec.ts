import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Pilot Workflow Smoke Tests — RA-1710 / P0-8.
 *
 * Golden-path regression-guard for the V1 pilot launch. Catches the
 * "blank screen at 2am" failure mode that pure unit tests can't:
 * a deploy that builds clean but breaks rendering, redirect rules,
 * or auth gates.
 *
 * Coverage (V1 pilot scope):
 *   - Login + signup pages render with required form controls
 *   - Forgot-password copy is the real "check your inbox" message
 *     (regression on P0-1 — must not regress to "Check the server console")
 *   - Protected pages redirect unauthenticated users to /login
 *   - Health endpoint returns 200
 *   - Progress / attest / pre-attest API endpoints reject unauthenticated
 *     callers with 401 (regression on P0-4 + P0-5 tenancy boundaries)
 *
 * Out-of-scope (V1.1):
 *   - Full lifecycle: signup → inspection → claim → attest+sign → PDF
 *     download. Requires DB seeding + Anthropic-Vision mock + worker
 *     pool — too heavy for ship-week. Tracked separately under
 *     RA-1706 epic.
 *
 * Run locally:    pnpm test:smoke
 * Run on a URL:   PLAYWRIGHT_BASE_URL=https://restoreassist-preview.vercel.app pnpm test:smoke
 */

test.describe("@smoke pilot workflow — public surfaces", () => {
  test("/login renders with email + password + sign-in CTA", async ({
    page,
  }) => {
    await page.goto("/login");
    assertExactSmokeLocation(page.url(), "/login");
    // The H1 on /login is "RestoreAssist" — "Sign in to your account" is
    // a sub-paragraph and "Sign in" is the submit button label.
    await expect(
      page.getByRole("heading", { name: /restoreassist/i, level: 1 }),
    ).toBeVisible();
    // Pin email/password inputs by id — the password field has a sibling
    // "Show password" toggle button whose aria-label clashes with
    // getByLabel(/password/i) under Playwright strict mode.
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in/i })).toBeVisible();
  });

  test("/signup renders without crashing", async ({ page }) => {
    const response = await page.goto("/signup");
    expect(response?.status() ?? 0).toBeLessThan(500);
    assertExactSmokeLocation(page.url(), "/signup");
  });

  test("/forgot-password renders the email-step copy", async ({ page }) => {
    await page.goto("/forgot-password");
    assertExactSmokeLocation(page.url(), "/forgot-password");
    // The "Reset your password" subtitle should appear on the email step.
    await expect(
      page.getByText(/reset your password|forgot/i).first(),
    ).toBeVisible();
  });

  test("/forgot-password does NOT contain the dev 'Check the server console' copy (P0-1 regression guard)", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    assertExactSmokeLocation(page.url(), "/forgot-password");
    const html = await page.content();
    expect(html.toLowerCase()).not.toContain("check the server console");
  });
});

test.describe("@smoke pilot workflow — auth gates", () => {
  for (const route of [
    "/dashboard",
    "/dashboard/claims",
    "/dashboard/telemetry",
    "/dashboard/governance",
  ]) {
    test(`${route} redirects unauthenticated users to /login`, async ({
      page,
      }) => {
      await page.goto(route);
      // NextAuth sends the user back here after sign-in, so the redirect
      // carries ?callbackUrl=<this route>. Asserting the value, not merely
      // permitting the parameter, keeps this a real check: it now also proves
      // the callback points at the requested path and stays site-relative.
      assertExactSmokeLocation(page.url(), "/login", {
        expectedCallbackFor: route,
      });
    });
  }
});

test.describe("@smoke pilot workflow — API surfaces", () => {
  test("GET /api/health returns 200", async ({ request }) => {
    const r = await originBoundRequest(request, "/api/health");
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("application/json");
    const health = await r.json();
    expect(health.status).toBe("ok");
    expect(health.checks?.database?.status).toBe("ok");
    expect(health.checks?.env?.status).toBe("ok");
  });

  test("POST /api/progress/[reportId]/transition rejects unauthenticated callers", async ({
    request,
  }) => {
    const r = await unauthedJsonPost(
      request,
      "/api/progress/r_unauth_smoke/transition",
      {
        key: "start_stabilisation",
      },
    );
    expect([401, 403]).toContain(r.status());
  });

  test("POST /api/progress/[reportId]/pre-attest rejects unauthenticated callers", async ({
    request,
  }) => {
    const r = await unauthedJsonPost(
      request,
      "/api/progress/r_unauth_smoke/pre-attest",
      {
        attestationType: "TECHNICIAN_SIGN_OFF",
        contentSummary: "smoke-test summary content for unauth check",
        consentAcknowledged: true,
      },
    );
    expect([401, 403]).toContain(r.status());
  });

  test("POST /api/progress/[reportId]/attest rejects unauthenticated callers", async ({
    request,
  }) => {
    const r = await unauthedJsonPost(
      request,
      "/api/progress/r_unauth_smoke/attest",
      {
        attestationType: "TECHNICIAN_SIGN_OFF",
        signatureDataUrl: "data:image/png;base64,iVBORw0KGgo=",
        consentToken: "ct_smoke",
      },
    );
    expect([401, 403]).toContain(r.status());
  });

  test("GET /api/progress/[reportId]/documents/stabilisation-certificate rejects unauthenticated callers", async ({
    request,
  }) => {
    const r = await originBoundRequest(
      request,
      "/api/progress/r_unauth_smoke/documents/stabilisation-certificate",
    );
    expect([401, 403]).toContain(r.status());
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────────

async function unauthedJsonPost(
  request: APIRequestContext,
  url: string,
  body: Record<string, unknown>,
) {
  return originBoundRequest(request, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify(body),
  });
}

function configuredSmokeOrigin(): URL {
  const configured = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const parsed = new URL(configured);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`smoke base URL must be an origin, observed ${configured}`);
  }
  return parsed;
}

/**
 * Assert the browser landed on exactly the expected origin and path.
 *
 * The strictness is deliberate and stays the default: a bare URL is what a
 * direct navigation to a public page should produce, and pinning origin and
 * hash is what makes this an *exact location* check rather than a substring
 * one.
 *
 * `expectedCallbackFor` is the single documented exception. A redirect out of
 * a protected route legitimately carries NextAuth's `callbackUrl`, so that the
 * user returns where they were headed after signing in. Before this parameter
 * existed the four auth-gate tests asserted `parsed.search === ""` against
 * that redirect and failed on every run — origin and pathname both matched,
 * and the redirect was working correctly the whole time.
 *
 * Tolerating the parameter is not enough on its own: an unchecked
 * `callbackUrl` is where open-redirect bugs live. So when it is expected, its
 * value is asserted to be exactly the protected path that was requested — a
 * site-relative path, never an absolute URL that could point off-origin.
 */
function assertExactSmokeLocation(
  observed: string,
  expectedPath: string,
  options: { expectedCallbackFor?: string } = {},
): void {
  const expectedOrigin = configuredSmokeOrigin().origin;
  const parsed = new URL(observed);
  expect(parsed.origin).toBe(expectedOrigin);
  expect(parsed.pathname).toBe(expectedPath);

  const { expectedCallbackFor } = options;
  if (expectedCallbackFor === undefined) {
    expect(parsed.search).toBe("");
  } else {
    // No parameter other than callbackUrl, so this cannot become a licence
    // for arbitrary query strings on a redirect.
    expect([...parsed.searchParams.keys()]).toEqual(["callbackUrl"]);

    const callback = parsed.searchParams.get("callbackUrl");
    expect(callback).toBe(expectedCallbackFor);
    // Site-relative only. An absolute callbackUrl surviving here would be an
    // open redirect, which is worth failing on loudly rather than tolerating
    // as "some query string".
    expect(callback?.startsWith("/")).toBe(true);
    expect(callback?.startsWith("//")).toBe(false);
  }

  expect(parsed.hash).toBe("");
}

async function originBoundRequest(
  request: APIRequestContext,
  path: string,
  options: Parameters<APIRequestContext["fetch"]>[1] = {},
) {
  const target = new URL(path, configuredSmokeOrigin());
  const response = await request.fetch(target.toString(), {
    ...options,
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  expect(response.url()).toBe(target.toString());
  expect(response.status() >= 300 && response.status() < 400).toBe(false);
  return response;
}
