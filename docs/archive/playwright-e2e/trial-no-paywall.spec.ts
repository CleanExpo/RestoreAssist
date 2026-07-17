/**
 * RA-6792 — Trial first-run surfaces render WITHOUT a paywall / upgrade modal.
 *
 * The onboarding audit found three first-run surfaces disagreeing on step one
 * and a risk that a TRIAL user hits an upgrade wall before reaching first value
 * (create an inspection → generate a report). This @smoke scaffold guards the
 * core promise: a trial user can open /signup, /dashboard/inspections/new and
 * /dashboard/reports/new and see the real form — no "Upgrade", "paywall", or
 * billing-required modal in the way.
 *
 * Scaffold semantics (matches the existing e2e patterns, e.g.
 * tech-evidence-capture-no-modal.spec.ts + _helpers/auth.ts):
 *   - The /signup leg is fully public and always runs.
 *   - The authenticated legs use the test-only sign-in helper, which is gated
 *     behind ALLOW_TEST_HELPERS (sandbox/CI only). When that helper is not
 *     available (e.g. local run without the env flag), those legs SKIP rather
 *     than fail — keeping this a lightweight, deterministic smoke guard until
 *     full auth fixtures are wired for it. See RA-6792 owner-gated remainder.
 *
 * Run:  pnpm test:smoke   (or any subset matching @smoke)
 */
import { test, expect, type Page } from "@playwright/test";

/** Locators that, if visible, mean a trial user has been blocked by a wall. */
async function assertNoPaywallModal(page: Page): Promise<void> {
  // role=dialog modal whose copy pushes an upgrade / subscription.
  const upgradeDialog = page
    .getByRole("dialog")
    .filter({ hasText: /upgrade|subscribe|paywall|payment required/i });
  await expect(upgradeDialog).toHaveCount(0);

  // Bare copy variants that gate the page without a dialog wrapper.
  await expect(
    page.getByText(/upgrade to continue|subscription required/i),
  ).toHaveCount(0);
}

/** Sign in as a TRIAL-tier USER via the gated test helper; skip if unavailable. */
async function loginAsTrialUserOrSkip(page: Page): Promise<void> {
  const res = await page.request
    .post("/api/test/sign-in-as", { data: { role: "USER" } })
    .catch(() => null);

  test.skip(
    !res || !res.ok(),
    "Test sign-in helper unavailable (ALLOW_TEST_HELPERS not set) — authed legs skipped",
  );
}

test.describe("@smoke RA-6792 trial first-run — no paywall before first value", () => {
  test("/signup renders the create-account form (public)", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("button", { name: /create account/i }),
    ).toBeVisible({ timeout: 15_000 });
    await assertNoPaywallModal(page);
  });

  test("/dashboard/inspections/new renders for a TRIAL user with no upgrade wall", async ({
    page,
  }) => {
    await loginAsTrialUserOrSkip(page);
    await page.goto("/dashboard/inspections/new");
    await expect(
      page.getByRole("heading", { name: /new inspection/i }),
    ).toBeVisible({ timeout: 15_000 });
    await assertNoPaywallModal(page);
  });

  test("/dashboard/reports/new renders for a TRIAL user with no upgrade wall", async ({
    page,
  }) => {
    await loginAsTrialUserOrSkip(page);
    await page.goto("/dashboard/reports/new");
    // The new-report surface always renders a primary heading; we assert it is
    // present rather than pinning exact copy that may evolve.
    await expect(page.getByRole("heading").first()).toBeVisible({
      timeout: 15_000,
    });
    await assertNoPaywallModal(page);
  });
});
