/**
 * E2E auth helpers — wrap test-only API routes (gated by ALLOW_TEST_HELPERS)
 * so the resulting session cookie binds to the Playwright `page` BrowserContext.
 *
 * Why this exists: Playwright's `request` fixture is a SEPARATE BrowserContext
 * from `page`. Calling `request.post("/api/test/sign-in-as", ...)` sets the
 * NextAuth session cookie on `request`'s jar, but `page` then navigates
 * anonymously and the dashboard renders the logged-out shell. Routing all
 * test-helper calls through `page.request` keeps the cookie jar shared with
 * the page, so subsequent `page.goto(...)` calls are authenticated.
 */
import type { Page } from "@playwright/test";

type Role = "USER" | "ADMIN" | "MANAGER";

export async function loginAs(page: Page, role: Role): Promise<void> {
  const res = await page.request.post("/api/test/sign-in-as", {
    data: { role },
  });
  if (!res.ok()) {
    throw new Error(
      `sign-in-as failed: ${res.status()} ${await res.text().catch(() => "")}`,
    );
  }
}

export async function seedInspection(
  page: Page,
  body: {
    inspectionId?: string;
    status?: string;
    source?: string;
    acceptedAt?: string | null;
  } = {},
): Promise<void> {
  const res = await page.request.post("/api/test/seed-inspection", {
    data: body,
  });
  if (!res.ok()) {
    throw new Error(
      `seed-inspection failed: ${res.status()} ${await res.text().catch(() => "")}`,
    );
  }
}

export async function seedAuthorisation(
  page: Page,
  body: {
    subjectLicenceNumber?: string;
    whsCardNumber?: string;
    subjectLicenceState?: string;
    subjectLicenceClass?: string;
    publicLiabilityInsurer?: string;
    publicLiabilityPolicyNumber?: string;
    publicLiabilityCoverAmount?: number;
  } = {},
): Promise<void> {
  const res = await page.request.post("/api/test/seed-authorisation", {
    data: body,
  });
  if (!res.ok()) {
    throw new Error(
      `seed-authorisation failed: ${res.status()} ${await res.text().catch(() => "")}`,
    );
  }
}
