/**
 * RA-7550 — report honesty at 1280×720.
 *
 * Public AI-report help (hero + related links) needs no auth.
 * /dashboard/reports/new proves the pre-generate AI-draft ≠ issued notice
 * and the on-page reason Upload PDF is disabled on trial. That leg uses
 * the test sign-in helper and skips when ALLOW_TEST_HELPERS is off.
 */
import { test, expect, type Page } from "@playwright/test";

const VIEWPORT = { width: 1280, height: 720 };

async function loginAsTrialUserOrSkip(page: Page): Promise<void> {
  const res = await page.request
    .post("/api/test/sign-in-as", { data: { role: "USER" } })
    .catch(() => null);

  test.skip(
    !res || !res.ok(),
    "Test sign-in helper unavailable (ALLOW_TEST_HELPERS not set) — authed legs skipped",
  );
}

test.describe("@smoke RA-7550 report honesty", () => {
  test.use({ viewport: VIEWPORT });

  test("public AI-report help hero and related links work without auth", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/help/reports/first-ai-report");

    await expect(
      page.getByRole("heading", { level: 1, name: /AI-drafted/i }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByTestId("help-hero-figure")).toBeVisible();

    await expect(
      page.getByText(/AI draft is not a signed or issued report|AI draft.*issued/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/optional for Basic/i).first()).toBeVisible();
    await expect(page.getByText(/inspection in `IN_PROGRESS`/i)).toHaveCount(0);
    await expect(page.getByText(/at least 4 photos/i)).toHaveCount(0);

    const dashboardHelpLinks = page.locator('a[href^="/dashboard/help"]');
    await expect(dashboardHelpLinks).toHaveCount(0);

    await expect(
      page.getByRole("heading", { name: /Related articles/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /first inspection/i }),
    ).toHaveAttribute("href", "/help/getting-started/first-inspection");
    await expect(
      page.getByRole("link", { name: /chain-of-custody/i }),
    ).toHaveAttribute("href", "/help/inspections/photo-cocoa");

    await page.screenshot({
      path: "test-results/ra-7550-public-ai-report-help.png",
      fullPage: true,
    });
  });

  test("trial new-report page teaches AI draft ≠ issued and explains Upload PDF", async ({
    page,
  }) => {
    await loginAsTrialUserOrSkip(page);
    await page.setViewportSize(VIEWPORT);
    await page.goto("/dashboard/reports/new");

    await expect(page.getByRole("heading").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("ai-draft-vs-issued-notice")).toBeVisible();
    await expect(
      page.getByText(/AI draft is not a signed or issued report/i),
    ).toBeVisible();

    const uploadPdf = page.getByRole("button", { name: /Upload PDF/i });
    await expect(uploadPdf).toBeVisible();
    await expect(uploadPdf).toBeDisabled();
    await expect(page.getByTestId("upload-pdf-trial-explain")).toBeVisible();
    await expect(page.getByText(/Upload PDF is on paid plans/i)).toBeVisible();
    await expect(
      page.getByText(/paid subscription makes Upload PDF available/i),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/ra-7550-reports-new-trial.png",
      fullPage: true,
    });
  });
});
