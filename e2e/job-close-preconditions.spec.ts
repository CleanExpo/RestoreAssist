/**
 * E2E @sp-a — Job close preconditions.
 *
 * Seeds an inspection in SUBMITTED (NOT yet IN_BILLING) and asserts that
 * the CloseJobPrompt is NOT rendered. Also asserts that POSTing directly
 * to the close route returns 409 with a missing[] body.
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 10.
 */
import { test, expect } from "@playwright/test";
import { loginAs, seedInspection } from "./_helpers/auth";

const INSPECTION_ID = "test-sp-a-close-pre";

test.describe("@sp-a Job close preconditions", () => {
  test("prompt is absent when status is not IN_BILLING", async ({ page }) => {
    await loginAs(page, "USER");
    await seedInspection(page, {
      inspectionId: INSPECTION_ID,
      status: "SUBMITTED",
    });

    await page.goto(`/dashboard/inspections/${INSPECTION_ID}`);

    // The prompt should NOT be in the DOM at all.
    await expect(page.getByTestId("close-job-prompt")).toHaveCount(0);
  });

  test("direct POST to /close returns 409 with missing[] when preconditions unmet", async ({
    page,
  }) => {
    await loginAs(page, "USER");
    await seedInspection(page, {
      inspectionId: INSPECTION_ID,
      status: "SUBMITTED", // Wrong starting state — close requires IN_BILLING.
    });

    const res = await page.request.post(
      `/api/inspections/${INSPECTION_ID}/close`,
      {
        data: { closeSummary: "test summary" },
        headers: { "content-type": "application/json" },
      },
    );

    expect(res.status()).toBe(409);
    const body = (await res.json()) as { error?: string; missing?: string[] };
    expect(Array.isArray(body.missing)).toBe(true);
    expect((body.missing ?? []).length).toBeGreaterThan(0);
  });
});
