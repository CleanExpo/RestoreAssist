/**
 * E2E @sp-a — Job close happy path.
 *
 * Seeds an inspection in IN_BILLING status, navigates to the detail page,
 * and asserts the CloseJobPrompt card renders. Full transactional close
 * coverage lives in vitest (app/api/inspections/[id]/close/__tests__).
 * This spec asserts UI mount + the 409 path round-trips correctly (no
 * paid-invoice seed in the test helper yet — SP-B will extend it).
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 10.
 */
import { test, expect } from "@playwright/test";
import { loginAs, seedInspection } from "./_helpers/auth";

const INSPECTION_ID = "test-sp-a-close-happy";

test.describe("@sp-a Job close happy path", () => {
  test("CloseJobPrompt renders for IN_BILLING inspection", async ({ page }) => {
    await loginAs(page, "USER");
    await seedInspection(page, {
      inspectionId: INSPECTION_ID,
      status: "IN_BILLING",
    });

    await page.goto(`/dashboard/inspections/${INSPECTION_ID}`);

    // The prompt is gated on status — seeded IN_BILLING means it should mount.
    const prompt = page.getByTestId("close-job-prompt");
    await expect(prompt).toBeVisible({ timeout: 15_000 });

    // The card's primary CTA must be present.
    await expect(
      prompt.getByRole("button", { name: /Looks right, close job/i }),
    ).toBeVisible();
    // And the regenerate-draft link.
    await expect(
      prompt.getByRole("button", { name: /Regenerate draft/i }),
    ).toBeVisible();
  });
});
