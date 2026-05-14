/**
 * E2E — DR/NRPG inbound job → dashboard alert → Accept & Start.
 *
 * Seeds an inspection with source='DR_NRPG' + acceptedAt=null via the
 * test-only seed helper (a faithful stand-in for what the verified
 * webhook handler produces; the HMAC + integration-row plumbing
 * required to exercise the real webhook is covered by the vitest
 * suite for the pure mapper module).
 *
 * Verifies:
 *   1. <InboundJobAlert> renders on /dashboard with the seeded job.
 *   2. Tapping "Accept & Start" calls /api/inspections/[id]/accept
 *      and removes the row from the alert.
 */
import { test, expect } from "@playwright/test";
import { loginAs, seedInspection } from "./_helpers/auth";

const INBOUND_JOB_ID = "test-drnrpg-inbound";

test.describe("DR/NRPG inbound job flow", () => {
  test("seeded DR_NRPG inspection appears in alert and accepts cleanly", async ({
    page,
  }) => {
    await loginAs(page, "USER");

    // Seed a DRAFT inspection sourced from DR_NRPG, not yet accepted.
    await seedInspection(page, {
      inspectionId: INBOUND_JOB_ID,
      status: "DRAFT",
      source: "DR_NRPG",
      acceptedAt: null,
    });

    await page.goto("/dashboard");

    const alert = page.getByTestId("inbound-job-alert");
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText(/from DR\/NRPG/i);

    const acceptBtn = alert.getByRole("button", {
      name: /accept and start inspection/i,
    });
    await expect(acceptBtn).toBeVisible();

    await acceptBtn.click();

    // After accept, the row is removed; with only one seeded job the
    // entire alert region unmounts.
    await expect(alert).toBeHidden({ timeout: 10_000 });
  });
});
