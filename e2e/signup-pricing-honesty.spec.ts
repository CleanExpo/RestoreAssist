/**
 * RA-7549 — stranger-facing signup / pricing honesty at 1280×720.
 *
 * Live stranger signup is hard in CI (BotID + no funded-trial fixture here).
 * This spec proves the public copy a stranger actually reads, and that the
 * post-signup CTA component — mounted on the dashboard welcome landing —
 * points at the Basic report start, not a BYOK settings wall.
 *
 * Authenticated click-through is covered by the unit render of
 * BasicReportWithoutKeyCta (href = /dashboard/reports/new) and, when the
 * test sign-in helper is up, the existing RA-6792 smoke that opens
 * /dashboard/reports/new without an upgrade wall.
 */
import { test, expect } from "@playwright/test";

const VIEWPORT = { width: 1280, height: 720 };

test.describe("@smoke RA-7549 signup/pricing honesty", () => {
  test.use({ viewport: VIEWPORT });

  test("/signup tells a stranger Basic works without an API key", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/signup");

    await expect(
      page.getByText(/Basic reports work without an API key/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Provider charges apply only when you add your own key/i),
    ).toBeVisible();
    await expect(
      page.getByText(/\$99 AUD per month/i),
    ).toBeVisible();

    await expect(
      page.getByText(/API key is required to operate/i),
    ).toHaveCount(0);
    await expect(
      page.getByText(/You will need an Anthropic or OpenAI API key to generate/i),
    ).toHaveCount(0);
  });

  test("/pricing states Basic-without-key and when provider charges apply", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/pricing");

    await expect(
      page.getByText(/Basic reports work without an API key/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Provider charges apply only when you add your own key/i),
    ).toBeVisible();

    await expect(page.getByText(/Bring your own AI key/i)).toHaveCount(0);
    await expect(
      page.getByText(
        /Report generation on every plan[^.]*runs on your own/i,
      ),
    ).toHaveCount(0);

    await expect(
      page.getByRole("link", { name: /Start free trial — \$99 AUD\/month after/i }),
    ).toBeVisible();
    await expect(page.getByText(/Add to Plan/i)).toHaveCount(0);
    await expect(
      page.getByText(/Available after you subscribe to the \$99 AUD monthly plan/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/\bUSD\b/)).toHaveCount(0);
  });
});
