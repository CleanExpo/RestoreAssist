/**
 * Dashboard connected journey — overview → jobs → job detail → schedule → inbox.
 * @smoke
 */
import { test, expect } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";
import { loginAs } from "./_helpers/auth";
import { seedV1ReferenceClaim } from "./_helpers/v1-reference-claim";

test.describe("Dashboard connected navigation @smoke", () => {
  // These two need the storage state e2e/auth.setup.ts writes, and auth.setup
  // can only log in through the test helper (ALLOW_TEST_HELPERS) or a real
  // account (E2E_USER_EMAIL + E2E_USER_PASSWORD). With neither, the run cannot
  // authenticate: production smoke runs --no-deps with no credentials, and
  // before this skip both tests failed with ENOENT on e2e/.auth/user.json.
  // A skip is not a pass: scripts/run-smoke.mjs fails the run unless the skip
  // is declared, with its reason, in scripts/ci/smoke-skip-manifest.json.
  test.skip(
    process.env.ALLOW_TEST_HELPERS !== "true" &&
      !(process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD),
    "No way to authenticate: set E2E_USER_EMAIL/E2E_USER_PASSWORD or ALLOW_TEST_HELPERS=true",
  );

  test.use({ storageState: AUTH_FILE });

  test("overview pipeline links reach inspections and return", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", {
        name: /jobs still on site|reports waiting|money outstanding|start the first job|nothing waiting|loading the board|workspace partially/i,
      }),
    ).toBeVisible({ timeout: 20_000 });

    // The pipeline's Inspect step, not the page's first /inspect/ link: since
    // the overview redesign (e3513ca06) a "New inspection" quick action comes
    // first in the DOM and lands on /dashboard/inspections/new, which also
    // satisfies the URL check below but has no "Inspections" heading.
    const inspectStep = page
      .getByRole("region", { name: "Job through invoice" })
      .getByRole("link", { name: /inspect/i });
    await expect(inspectStep).toBeVisible();
    await inspectStep.click();
    await expect(page).toHaveURL(/\/dashboard\/inspections\/?(\?|$)/);
    await expect(
      page.getByRole("heading", { name: /^inspections$/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: /^overview$/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/?$/);
  });

  test("inspections list exposes schedule and overview shortcuts", async ({
    page,
  }) => {
    await page.goto("/dashboard/inspections");
    await expect(
      page.getByRole("navigation", { name: "Related pages" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Schedule" })).toBeVisible();
    await page.getByRole("link", { name: "Schedule" }).click();
    await expect(page).toHaveURL(/\/dashboard\/inspections\/schedule/);
    await expect(
      page.getByRole("heading", { name: /^job schedule$/i }),
    ).toBeVisible();
  });
});

test.describe("Owner dashboard full path @smoke", () => {
  test.skip(
    process.env.ALLOW_TEST_HELPERS !== "true",
    "Set ALLOW_TEST_HELPERS=true for owner journey with seeded job",
  );

  test("login → overview → open job → workflow back → schedule → inbox survives reload", async ({
    page,
  }) => {
    const inspectionId = `dash-journey-${Date.now()}`;
    await loginAs(page, "ADMIN");
    await seedV1ReferenceClaim(page, inspectionId);

    await page.goto("/dashboard");
    await expect(
      page.getByRole("region", { name: "Job through invoice" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto(`/dashboard/inspections/${inspectionId}`);
    await expect(
      page.getByRole("navigation", { name: "Job workflow" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto(
      `/dashboard/inspections/${inspectionId}?tab=sketch`,
    );
    await expect(
      page.getByRole("tab", { name: /floor plan/i }),
    ).toHaveAttribute("aria-selected", "true");

    await page.goto(`/dashboard/inspections/${inspectionId}`);
    await expect(
      page.getByRole("region", { name: "Claim journey" }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: "All jobs" }).click();
    await expect(page).toHaveURL(/\/dashboard\/inspections/);

    await page.goto("/dashboard/inspections/schedule");
    await expect(
      page.getByRole("heading", { name: /^job schedule$/i }),
    ).toBeVisible();

    await page.goto("/dashboard/operations/completeness-inbox");
    await expect(
      page.getByRole("heading", { name: /^completeness inbox$/i }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: /^completeness inbox$/i }),
    ).toBeVisible();

    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", {
        name: /jobs still on site|reports waiting|money outstanding|start the first job|nothing waiting|loading the board/i,
      }),
    ).toBeVisible();
  });
});
