/**
 * RA-785 — Security & Edge Case Stress Tests
 *
 * API-level security tests (no browser). Uses Playwright's request fixture
 * to hit the running server directly.
 *
 * Required env vars for full coverage:
 *   E2E_USER_EMAIL / E2E_USER_PASSWORD     — primary test user (TRIAL or ACTIVE)
 *   E2E_USER_B_EMAIL / E2E_USER_B_PASSWORD — second user for cross-tenant tests
 *   E2E_CANCELED_EMAIL / E2E_CANCELED_PASSWORD — user with CANCELED subscription
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD   — admin user
 *   CRON_SECRET                            — cron bearer token (from .env.local)
 *
 * Run: npx playwright test e2e/security.spec.ts
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sign in with real credentials and return the NextAuth session cookie.
 *
 * Three things here were wrong and each one alone returned null, which then
 * surfaced one call later as `headers[0].value: expected string, got object`
 * -- because `Cookie: session!` passed `null` and `typeof null === "object"`.
 * That error reads like a header bug and is not one. Measured 07/09/2026
 * against a booted app, both endpoints, same credentials:
 *
 *   POST /api/auth/signin/credentials    200, sets csrf-token + callback-url
 *                                        and NO session-token
 *   POST /api/auth/callback/credentials  200, sets next-auth.session-token
 *
 * 1. NextAuth's credentials provider mints a session only on the CALLBACK
 *    endpoint. `signin` renders the sign-in page. The doc comment on this
 *    helper always said `callback`; the code did not.
 * 2. CSRF IS enforced. The old `csrfToken: "__skip__"` was not true of this
 *    app -- the token must come from /api/auth/csrf, and the matching
 *    csrf cookie must ride with the POST. Playwright's `request` fixture
 *    keeps its own cookie jar, so the GET below arms the POST.
 * 3. `res.headers()` COLLAPSES repeated Set-Cookie headers into one string.
 *    The callback response sets two, so the session token could be hidden
 *    behind the callback-url one. `headersArray()` preserves them.
 */
async function getSessionCookie(
  request: import("@playwright/test").APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  // THROW, never return null. Returning null was the whole reason the old
  // helper's failures were unreadable: the null travelled one call further
  // and re-surfaced as a Playwright header type error naming neither the
  // user nor the step that actually failed. Found by independent review
  // (gemini, 07/09/2026). Every message below names the email, because a
  // cross-tenant test signs in twice and "login failed" alone does not say
  // which side broke.
  const csrfRes = await request.get("/api/auth/csrf");
  if (!csrfRes.ok()) {
    throw new Error(
      `getSessionCookie(${email}): GET /api/auth/csrf returned ` +
        `${csrfRes.status()}; cannot sign in without a CSRF token.`,
    );
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrfToken) {
    throw new Error(
      `getSessionCookie(${email}): /api/auth/csrf returned no csrfToken field.`,
    );
  }

  const res = await request.post("/api/auth/callback/credentials", {
    form: {
      email,
      password,
      csrfToken,
      callbackUrl: "/dashboard",
      json: "true",
    },
  });

  for (const header of res.headersArray()) {
    if (header.name.toLowerCase() !== "set-cookie") continue;
    // ANCHORED. A Set-Cookie value always begins with the cookie name, so
    // without `^` this matched any cookie whose name merely ENDS in
    // `next-auth.session-token` -- `fake-next-auth.session-token=...` would
    // have been accepted as a real session. Found by independent review
    // (gemini, 07/09/2026). `__Secure-` is NextAuth's prefix wherever the
    // app runs with NODE_ENV=production.
    const match = header.value.match(
      /^((?:__Secure-)?next-auth\.session-token=[^;]+)/,
    );
    if (match) return match[1];
  }
  throw new Error(
    `getSessionCookie(${email}): POST /api/auth/callback/credentials returned ` +
      `${res.status()} with no next-auth.session-token cookie. Wrong ` +
      `credentials, or the user is not seeded in this database.`,
  );
}

// ---------------------------------------------------------------------------
// 1. Unauthenticated access
// ---------------------------------------------------------------------------

test.describe("1 · Unauthenticated access", () => {
  const PROTECTED_ROUTES = [
    { method: "GET", path: "/api/clients" },
    { method: "GET", path: "/api/inspections" },
    { method: "GET", path: "/api/reports" },
    { method: "GET", path: "/api/invoices" },
    { method: "GET", path: "/api/contractors/profile" },
    { method: "GET", path: "/api/user/profile" },
    { method: "POST", path: "/api/reports/generate-question" },
    { method: "POST", path: "/api/reports/generate-enhanced" },
  ];

  for (const { method, path } of PROTECTED_ROUTES) {
    test(`${method} ${path} → 401 without session`, async ({ request }) => {
      const fn =
        method === "POST"
          ? request.post(path, { data: {} })
          : request.get(path);
      const res = await fn;
      expect(
        res.status(),
        `Expected 401 from ${method} ${path}, got ${res.status()}`,
      ).toBe(401);
    });
  }

  test("GET /api/admin/stats → 401 without session", async ({ request }) => {
    const res = await request.get("/api/admin/stats");
    expect(res.status()).toBe(401);
  });

  test("Cron endpoint without bearer token → 401", async ({ request }) => {
    const res = await request.get("/api/cron/sync-invoices");
    expect(res.status()).toBe(401);
  });

  test("Cron endpoint with wrong bearer token → 401", async ({ request }) => {
    const res = await request.get("/api/cron/sync-invoices", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status()).toBe(401);
  });

  test("Cron endpoint with correct bearer token → 200", async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET;
    test.skip(!cronSecret, "CRON_SECRET env var not set");

    const res = await request.get("/api/cron/sync-invoices", {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    // 200 or 202 — cron ran (or no invoices to sync)
    expect([200, 202]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 2. Cross-tenant isolation
// ---------------------------------------------------------------------------

test.describe("2 · Cross-tenant isolation", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL ||
      !process.env.E2E_USER_PASSWORD ||
      !process.env.E2E_USER_B_EMAIL ||
      !process.env.E2E_USER_B_PASSWORD,
    "Requires E2E_USER_EMAIL, E2E_USER_PASSWORD, E2E_USER_B_EMAIL and E2E_USER_B_PASSWORD " +
      "env vars \u2014 the test bodies dereference all four, so guarding on the emails alone " +
      "lets the suite run with an undefined password and fail for the wrong reason",
  );

  test("User A cannot read User B's inspection", async ({ request }) => {
    // Step 1: User A creates an inspection
    const sessionA = await getSessionCookie(
      request,
      process.env.E2E_USER_EMAIL!,
      process.env.E2E_USER_PASSWORD!,
    );
    expect(sessionA, "User A login failed").toBeTruthy();

    const createRes = await request.post("/api/inspections", {
      headers: { Cookie: sessionA! },
      data: {
        propertyAddress: "1 Cross-Tenant Test St",
        propertySuburb: "Testville",
        propertyState: "VIC",
        propertyPostcode: "3000",
        damageCategory: "CATEGORY_1",
        damageClass: "CLASS_1",
      },
    });
    // A broken precondition is a FAILURE, not a skip. This test guards cross-tenant
    // isolation — the defect class PR #2178 fixed in production. Skipping here meant the
    // guard reported green precisely when the API shape drifted underneath it.
    expect(
      [200, 201],
      `Inspection creation failed: ${createRes.status()}. The precondition for the ` +
        `cross-tenant check could not be established, so isolation was NOT verified.`,
    ).toContain(createRes.status());
    // ENVELOPE. POST /api/inspections returns `{ inspection }`
    // (app/api/inspections/route.ts:473), NOT `{ data }`. Destructuring `data`
    // yielded undefined, and the id assertion below is what caught it.
    // Probed live 07/09/2026: top-level keys are exactly ["inspection"].
    const { inspection } = (await createRes.json()) as {
      inspection?: { id?: string };
    };
    const inspectionId = inspection?.id;
    expect(
      inspectionId,
      "Inspection was created but no id came back, so the cross-tenant read " +
        "below would target /api/inspections/undefined and pass on a 404 " +
        "that proves nothing.",
    ).toBeTruthy();

    // Step 2: User B tries to read User A's inspection
    const sessionB = await getSessionCookie(
      request,
      process.env.E2E_USER_B_EMAIL!,
      process.env.E2E_USER_B_PASSWORD!,
    );
    expect(sessionB, "User B login failed").toBeTruthy();

    const readRes = await request.get(`/api/inspections/${inspectionId}`, {
      headers: { Cookie: sessionB! },
    });

    // Should be 403 (owned by different user) or 404 (not found in user scope)
    expect(
      [403, 404],
      `Expected 403 or 404 from cross-tenant read, got ${readRes.status()}`,
    ).toContain(readRes.status());
  });

  test("User A cannot delete User B's client", async ({ request }) => {
    const sessionA = await getSessionCookie(
      request,
      process.env.E2E_USER_EMAIL!,
      process.env.E2E_USER_PASSWORD!,
    );
    const sessionB = await getSessionCookie(
      request,
      process.env.E2E_USER_B_EMAIL!,
      process.env.E2E_USER_B_PASSWORD!,
    );

    // User B creates a client
    const createRes = await request.post("/api/clients", {
      headers: { Cookie: sessionB! },
      data: {
        name: "Cross-Tenant Client",
        email: "cross-tenant-test@example.com",
        phone: "0412345678",
      },
    });
    expect(
      [200, 201],
      `Client creation failed: ${createRes.status()}. The precondition for the ` +
        `cross-tenant delete check could not be established, so isolation was NOT verified.`,
    ).toContain(createRes.status());
    // ENVELOPE. POST /api/clients returns the client object at the TOP LEVEL
    // (app/api/clients/route.ts:202 spreads it), NOT under `data`. Probed live
    // 07/09/2026: top-level keys begin ["id","name","email",...] and there is
    // no `data` key.
    //
    // THIS IS WHY THE ASSERTION BELOW EXISTS. With `{ data: client }` the id
    // was undefined, so this test sent `DELETE /api/clients/undefined`, got
    // 404, and PASSED -- while proving only that deleting a nonexistent id
    // 404s. A vacuous pass on the guard for the #2178 P0 is worse than a
    // failure, because it is quoted as coverage. Verified by probe:
    // DELETE /api/clients/undefined returns 404.
    const client = (await createRes.json()) as { id?: string };
    expect(
      client?.id,
      "Client was created but no id came back. Without a real id the delete " +
        "below targets /api/clients/undefined, which 404s and makes this " +
        "isolation check vacuous.",
    ).toBeTruthy();

    // User A tries to delete User B's client
    const deleteRes = await request.delete(`/api/clients/${client.id}`, {
      headers: { Cookie: sessionA! },
    });
    expect(
      [403, 404],
      `Expected 403 or 404 when user A deletes user B's client ` +
        `${client.id}, got ${deleteRes.status()}. A 200 here is the #2178 ` +
        `cross-tenant defect, live.`,
    ).toContain(deleteRes.status());
  });
});

// ---------------------------------------------------------------------------
// 3. Missing / invalid field validation
// ---------------------------------------------------------------------------

test.describe("3 · Missing field validation", () => {
  test.skip(!process.env.E2E_USER_EMAIL, "Requires E2E_USER_EMAIL env var");

  test("POST /api/clients with no body → 400", async ({ request }) => {
    const session = await getSessionCookie(
      request,
      process.env.E2E_USER_EMAIL!,
      process.env.E2E_USER_PASSWORD!,
    );
    const res = await request.post("/api/clients", {
      headers: { Cookie: session! },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/reports/generate-question with missing reportId → 400", async ({
    request,
  }) => {
    const session = await getSessionCookie(
      request,
      process.env.E2E_USER_EMAIL!,
      process.env.E2E_USER_PASSWORD!,
    );
    const res = await request.post("/api/reports/generate-question", {
      headers: { Cookie: session! },
      data: { context: "some context but no reportId" },
    });
    expect([400, 402]).toContain(res.status());
  });

  test("POST /api/invoices with missing clientId → 400", async ({
    request,
  }) => {
    const session = await getSessionCookie(
      request,
      process.env.E2E_USER_EMAIL!,
      process.env.E2E_USER_PASSWORD!,
    );
    const res = await request.post("/api/invoices", {
      headers: { Cookie: session! },
      data: { amount: 1000 }, // missing clientId, lineItems etc.
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/contractors/reviews with rating=0 → 400 (out of range)", async ({
    request,
  }) => {
    const session = await getSessionCookie(
      request,
      process.env.E2E_USER_EMAIL!,
      process.env.E2E_USER_PASSWORD!,
    );
    const res = await request.post("/api/contractors/reviews", {
      headers: { Cookie: session! },
      data: {
        contractorSlug: "test-contractor",
        overallRating: 0, // invalid — must be 1-5
        reviewText: "Test review",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /api/contractors/reviews with qualityRating=99 → 400 (sub-rating out of range)", async ({
    request,
  }) => {
    const session = await getSessionCookie(
      request,
      process.env.E2E_USER_EMAIL!,
      process.env.E2E_USER_PASSWORD!,
    );
    const res = await request.post("/api/contractors/reviews", {
      headers: { Cookie: session! },
      data: {
        contractorSlug: "test-contractor",
        overallRating: 4,
        qualityRating: 99, // invalid sub-rating
        reviewText: "Test review",
      },
    });
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 4. Concurrent AI credit deduction (no double-spend)
// ---------------------------------------------------------------------------

test.describe("4 · Concurrent credit deduction", () => {
  /**
   * To run this test:
   * 1. Create a test user with exactly 1 credit remaining
   * 2. Set E2E_LOW_CREDIT_EMAIL + E2E_LOW_CREDIT_PASSWORD
   * 3. The test fires 5 concurrent requests — only 1 should succeed (200/201),
   *    the rest must return 402/429
   */
  test.skip(
    !process.env.E2E_LOW_CREDIT_EMAIL,
    "Requires E2E_LOW_CREDIT_EMAIL env var (user with exactly 1 credit)",
  );

  test("Only one of 5 concurrent AI calls succeeds when user has 1 credit", async ({
    request,
  }) => {
    const session = await getSessionCookie(
      request,
      process.env.E2E_LOW_CREDIT_EMAIL!,
      process.env.E2E_LOW_CREDIT_PASSWORD!,
    );
    expect(session).toBeTruthy();

    // Fire 5 simultaneous requests
    const results = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        request
          .post("/api/reports/generate-question", {
            headers: { Cookie: session! },
            data: { reportId: "test-report-id", context: "test" },
          })
          .then((r) => r.status()),
      ),
    );

    const successes = results.filter((s) => s === 200 || s === 201);
    const blocked = results.filter((s) => s === 402 || s === 429);

    // Exactly 1 should succeed; the other 4 must be blocked
    expect(successes.length).toBe(1);
    expect(blocked.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 5. Expired / cancelled subscription on AI route
// ---------------------------------------------------------------------------

test.describe("5 · Subscription gate enforcement", () => {
  test.skip(
    !process.env.E2E_CANCELED_EMAIL,
    "Requires E2E_CANCELED_EMAIL env var (user with CANCELED subscription)",
  );

  const AI_ROUTES = [
    {
      path: "/api/reports/generate-question",
      data: { reportId: "x", context: "test" },
    },
    { path: "/api/reports/generate-enhanced", data: { reportId: "x" } },
    { path: "/api/reports/generate-cost-estimation", data: { reportId: "x" } },
    { path: "/api/reports/generate-scope-of-works", data: { reportId: "x" } },
  ];

  for (const { path, data } of AI_ROUTES) {
    test(`POST ${path} → 402 for CANCELED subscription`, async ({
      request,
    }) => {
      const session = await getSessionCookie(
        request,
        process.env.E2E_CANCELED_EMAIL!,
        process.env.E2E_CANCELED_PASSWORD!,
      );
      expect(session).toBeTruthy();

      const res = await request.post(path, {
        headers: { Cookie: session! },
        data,
      });

      expect(
        res.status(),
        `Expected 402 from ${path} for CANCELED user, got ${res.status()}`,
      ).toBe(402);
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Non-admin user hitting admin routes
// ---------------------------------------------------------------------------

test.describe("6 · Admin route enforcement", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL,
    "Requires E2E_USER_EMAIL env var (non-admin user)",
  );

  const ADMIN_ROUTES = [
    "/api/admin/stats",
    "/api/admin/users",
    "/api/admin/seed-demo",
  ];

  for (const path of ADMIN_ROUTES) {
    test(`GET ${path} → 403 for non-admin user`, async ({ request }) => {
      const session = await getSessionCookie(
        request,
        process.env.E2E_USER_EMAIL!,
        process.env.E2E_USER_PASSWORD!,
      );
      expect(session).toBeTruthy();

      const res = await request.get(path, {
        headers: { Cookie: session! },
      });

      expect(
        res.status(),
        `Expected 403 from admin route ${path} for regular user, got ${res.status()}`,
      ).toBe(403);
    });
  }

  test("POST /api/admin/seed-demo → 403 for non-admin user", async ({
    request,
  }) => {
    const session = await getSessionCookie(
      request,
      process.env.E2E_USER_EMAIL!,
      process.env.E2E_USER_PASSWORD!,
    );
    const res = await request.post("/api/admin/seed-demo", {
      headers: { Cookie: session! },
      data: {},
    });
    expect(res.status()).toBe(403);
  });
});
