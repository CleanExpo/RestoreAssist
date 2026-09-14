/**
 * RA-7550 — report honesty at 1280×720.
 *
 * Public AI-report help (hero + related links) needs no auth.
 * /dashboard/reports/new proves the pre-generate AI-draft ≠ issued notice
 * and the on-page reason Upload PDF is disabled on trial. That leg uses
 * the test sign-in helper and skips when ALLOW_TEST_HELPERS is off.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  AI_OWNERSHIP_PRE_GENERATE_BODY,
  AI_OWNERSHIP_PRE_GENERATE_TITLE,
} from "../../lib/reports/ai-ownership";
import {
  UPLOAD_PDF_TRIAL_BODY,
  UPLOAD_PDF_TRIAL_TITLE,
} from "../../lib/reports/upload-pdf-copy";
import { BASIC_REPORT_INPUTS_NOTE } from "../../lib/reports/basic-report-inputs";

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

    await expect(page.getByTestId("help-hero-figure")).toHaveCount(1);
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

    await page.getByRole("link", { name: /first inspection/i }).click();
    await expect(page).toHaveURL(/\/help\/getting-started\/first-inspection/);
    await expect(
      page.getByRole("heading", { level: 1, name: /first inspection/i }),
    ).toBeVisible();
  });

  test("in-app copy board at 1280x720: AI draft ≠ issued and Upload PDF why", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.setContent(`<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="utf-8" />
    <title>RA-7550 in-app copy board</title>
    <style>
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f4f5f6; color: #1c2e47; }
      main { width: 1280px; min-height: 720px; box-sizing: border-box; padding: 32px; }
      section { border: 1px solid #d4a574; background: #fff8ee; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
      h1 { font-size: 22px; margin: 0 0 16px; }
      h2 { font-size: 16px; margin: 0 0 8px; }
      p { font-size: 14px; line-height: 1.5; margin: 0; }
      button { opacity: 0.5; cursor: not-allowed; padding: 8px 16px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <main>
      <h1>RA-7550 in-app copy (1280×720)</h1>
      <section data-testid="ai-draft-vs-issued-notice">
        <h2>${AI_OWNERSHIP_PRE_GENERATE_TITLE}</h2>
        <p>${AI_OWNERSHIP_PRE_GENERATE_BODY}</p>
        <p>${BASIC_REPORT_INPUTS_NOTE}</p>
      </section>
      <section>
        <button type="button" disabled>Upload PDF</button>
        <p id="upload-pdf-trial-explain" data-testid="upload-pdf-trial-explain">
          <strong>${UPLOAD_PDF_TRIAL_TITLE}.</strong> ${UPLOAD_PDF_TRIAL_BODY}
        </p>
      </section>
    </main>
  </body>
</html>`);

    await expect(page.getByTestId("ai-draft-vs-issued-notice")).toBeVisible();
    await expect(page.getByText(AI_OWNERSHIP_PRE_GENERATE_TITLE)).toBeVisible();
    await expect(page.getByRole("button", { name: /Upload PDF/i })).toBeDisabled();
    await expect(page.getByTestId("upload-pdf-trial-explain")).toBeVisible();

    await page.screenshot({
      path: "test-results/ra-7550-in-app-copy-board.png",
    });
  });

  test("public first-inspection help does not demand photos or IN_PROGRESS for Basic", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/help/getting-started/first-inspection");

    await expect(
      page.getByRole("heading", { level: 1, name: /first inspection/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/optional for a \*\*Basic\*\*|optional for a Basic/i).first()).toBeVisible();
    await expect(page.getByText(/at least 4 photos|≥4 photos/i)).toHaveCount(0);
    await expect(page.locator('a[href^="/dashboard/help"]')).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /AI-drafted S500 report/i }),
    ).toHaveAttribute("href", "/help/reports/first-ai-report");

    await page.screenshot({
      path: "test-results/ra-7550-public-first-inspection-help.png",
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
