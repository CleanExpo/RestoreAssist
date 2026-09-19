/**
 * RA-7550 — report honesty at 1280×720.
 *
 * Public AI-report help (hero + related links) needs no auth.
 * Authed `/dashboard/reports/new` proves AI draft ≠ issued before generate
 * and the on-page reason Upload PDF is disabled on trial.
 *
 * Auth matches article-detail / billing specs: seed-trial-user + sign-in-as
 * on `request`, then apply the session cookie to `page`'s context. Sketch E2E
 * sets ALLOW_TEST_HELPERS=true; a helper failure fails this spec (no skip).
 */
import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

const VIEWPORT = { width: 1280, height: 720 };

async function loginAsSeededTrialUser(
  request: APIRequestContext,
  context: BrowserContext,
): Promise<void> {
  const seed = await request.post("/api/test/seed-trial-user", {
    data: { daysUntilExpiry: 10 },
  });
  if (!seed.ok()) {
    throw new Error(
      `seed-trial-user failed: ${seed.status()} ${await seed.text().catch(() => "")}`,
    );
  }
  const { data } = await seed.json();
  const signIn = await request.post("/api/test/sign-in-as", {
    data: { role: "USER", email: data.email },
  });
  if (!signIn.ok()) {
    throw new Error(
      `sign-in-as failed: ${signIn.status()} ${await signIn.text().catch(() => "")}`,
    );
  }
  await applySessionCookieFromResponse(context, signIn);
}

test.describe("RA-7550 report honesty", () => {
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
      page.getByText(/not a signed or issued report/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/optional for Basic/i).first()).toBeVisible();
    await expect(page.getByText(/inspection in `?IN_PROGRESS`?/i)).toHaveCount(0);
    await expect(page.getByText(/at least 4 photos/i)).toHaveCount(0);

    await expect(page.locator('a[href^="/dashboard/help"]')).toHaveCount(0);

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

  test("public first-inspection help does not demand photos or IN_PROGRESS for Basic", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto("/help/getting-started/first-inspection");

    await expect(
      page.getByRole("heading", { level: 1, name: /first inspection/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/optional for a \*\*Basic\*\*|optional for a Basic/i).first(),
    ).toBeVisible();
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

  test("live /dashboard/reports/new teaches AI draft ≠ issued and explains Upload PDF", async ({
    page,
    request,
    context,
  }) => {
    await loginAsSeededTrialUser(request, context);
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
      page.getByText(/paid subscription and your own Anthropic key/i),
    ).toBeVisible();

    await page.screenshot({
      path: "test-results/ra-7550-reports-new-trial.png",
      fullPage: true,
    });
  });
});
