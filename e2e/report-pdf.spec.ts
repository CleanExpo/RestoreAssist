/**
 * RA-6800 — Report → PDF critical-path E2E (API-level)
 *
 * Proves the production-critical path: a TRIAL user creates a report then
 * downloads a valid PDF. No AI call involved — generateIICRCReportPDF is
 * pure pdf-lib and works with any stored report data including empty fields.
 *
 * Constraints:
 *   - Requires ALLOW_TEST_HELPERS=true (sandbox / CI). Tests skip on prod.
 *   - Seeds a fresh TRIAL user per test-group so subscription credits are
 *     never exhausted by adjacent test runs.
 *   - PDF content is not semantically validated; the test proves the
 *     endpoint returns bytes with the correct content-type.
 *
 * Run: pnpm exec playwright test e2e/report-pdf.spec.ts
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { applySessionCookieFromResponse } from "./helpers/session-cookie";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Seeds a TRIAL user with 14 days remaining + 100 credits, then signs in.
 * Returns the seeded user's email, or skips the test if helpers are not
 * enabled in this environment.
 */
async function seedTrialAndSignIn(
  page: Page,
  context: BrowserContext,
): Promise<string> {
  const seedRes = await page.request.post("/api/test/seed-trial-user", {
    data: { daysUntilExpiry: 14 },
    failOnStatusCode: false,
  });

  test.skip(!seedRes.ok(), "ALLOW_TEST_HELPERS not enabled — test skipped");

  const { data } = await seedRes.json();
  const { email } = data as { email: string };

  const signinRes = await page.request.post("/api/test/sign-in-as", {
    data: { role: "USER", email },
    failOnStatusCode: false,
  });

  if (!signinRes.ok()) {
    test.skip(true, "sign-in helper unavailable — test skipped");
  }

  await applySessionCookieFromResponse(context, signinRes);
  return email;
}

/**
 * Creates a minimal report via POST /api/reports.
 * Returns the report ID.
 */
async function createReport(page: Page): Promise<string> {
  const key = `e2e-report-pdf-${Date.now()}`;
  const res = await page.request.post("/api/reports", {
    headers: { "Idempotency-Key": key },
    data: {
      title: "Test Water Damage Assessment",
      clientName: "Jane Testclient",
      propertyAddress: "42 Test Street, Melbourne VIC 3000",
      waterCategory: "2",
      waterClass: "2",
    },
  });

  if (res.status() === 401 || res.status() === 403) {
    throw new Error(
      `Report creation failed — auth/subscription issue (${res.status()}): ${await res.text()}`,
    );
  }
  if (!res.ok()) {
    throw new Error(
      `Report creation failed (${res.status()}): ${await res.text()}`,
    );
  }

  const body = await res.json();
  const id: string = body?.report?.id ?? body?.id ?? body?.data?.id;
  if (!id) {
    throw new Error(
      `Report created but response had no id field: ${JSON.stringify(body)}`,
    );
  }
  return id;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Report → PDF critical path (RA-6800)", () => {
  test("TRIAL user can create a report and download a valid PDF", async ({
    page,
    context,
  }) => {
    await seedTrialAndSignIn(page, context);

    const reportId = await createReport(page);

    const pdfRes = await page.request.get(`/api/reports/${reportId}/pdf`);
    expect(pdfRes.status()).toBe(200);

    const contentType = pdfRes.headers()["content-type"] ?? "";
    expect(contentType).toContain("application/pdf");

    // Sanity-check: PDF bytes start with the PDF magic header %PDF-
    const body = await pdfRes.body();
    expect(body.length).toBeGreaterThan(100);
    expect(body.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  test("PDF endpoint returns 401 for an unauthenticated request", async ({
    page,
  }) => {
    // No sign-in — request carries no session cookie
    const pdfRes = await page.request.get(
      `/api/reports/non-existent-id-000/pdf`,
      { failOnStatusCode: false },
    );
    expect(pdfRes.status()).toBe(401);
  });

  test("PDF endpoint returns 401/404 for a report owned by another user", async ({
    page,
    context,
  }) => {
    // User A creates a report
    await seedTrialAndSignIn(page, context);
    const userAReportId = await createReport(page);

    // User B seeds + signs in — their session replaces User A's in this context
    const seedBRes = await page.request.post("/api/test/seed-trial-user", {
      data: { daysUntilExpiry: 14 },
      failOnStatusCode: false,
    });
    test.skip(!seedBRes.ok(), "ALLOW_TEST_HELPERS not enabled — test skipped");

    const { data: dataB } = await seedBRes.json();
    const signinBRes = await page.request.post("/api/test/sign-in-as", {
      data: { role: "USER", email: dataB.email },
      failOnStatusCode: false,
    });
    await applySessionCookieFromResponse(context, signinBRes);

    // User B cannot access User A's PDF
    const pdfRes = await page.request.get(
      `/api/reports/${userAReportId}/pdf`,
      { failOnStatusCode: false },
    );
    expect([401, 404]).toContain(pdfRes.status());
  });

  test("PDF endpoint returns 404 for a non-existent report ID (authenticated)", async ({
    page,
    context,
  }) => {
    await seedTrialAndSignIn(page, context);

    const pdfRes = await page.request.get(
      `/api/reports/00000000-0000-0000-0000-000000000000/pdf`,
      { failOnStatusCode: false },
    );
    // Route returns 401 (not authorised) or 404 (not found) — both are correct
    expect([401, 404]).toContain(pdfRes.status());
  });
});
