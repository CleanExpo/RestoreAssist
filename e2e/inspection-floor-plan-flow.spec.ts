/**
 * Professional inspection floor-plan smoke — field documentation path.
 * @smoke
 */
import { test, expect } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";
import { loginAs } from "./_helpers/auth";
import { seedV1ReferenceClaim } from "./_helpers/v1-reference-claim";

test.describe("Inspection floor plan field flow @smoke", () => {
  test.skip(
    process.env.ALLOW_TEST_HELPERS !== "true",
    "Set ALLOW_TEST_HELPERS=true to seed a reference job",
  );

  test.use({ storageState: AUTH_FILE });

  test("floor plan tab shows field guide, canvas, and workflow links", async ({
    page,
  }) => {
    const inspectionId = `floor-plan-flow-${Date.now()}`;
    await loginAs(page, "ADMIN");
    await seedV1ReferenceClaim(page, inspectionId);

    await page.goto(`/dashboard/inspections/${inspectionId}?tab=sketch`);
    await expect(
      page.getByRole("tab", { name: /floor plan/i }),
    ).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });

    // The hub renders the checklist twice on purpose (12b350bb8): an xl aside
    // and an xl:hidden <details> for narrower screens. Exactly one of the pair
    // may be visible at any width, so the strict locator is scoped to it.
    await expect(
      page.getByLabel("Floor plan field checklist").filter({ visible: true }),
    ).toBeVisible();

    await expect(page.getByTestId("sketch-canvas-host")).toBeVisible({
      timeout: 25_000,
    });

    const workflow = page.getByRole("navigation", { name: "Job workflow" });
    await expect(workflow).toBeVisible();
    // Scoped to the workflow strip: a page-wide substring match also hits the
    // breadcrumb (the seeded job is titled "Floor Plan Flow …") and the
    // "Capture Floor Plan" action, none of which is the link this asserts.
    const floorPlanLink = workflow.getByRole("link", {
      name: "Floor plan",
      exact: true,
    });
    await expect(floorPlanLink).toBeVisible();
    await expect(floorPlanLink).toHaveAttribute(
      "href",
      `/dashboard/inspections/${inspectionId}?tab=sketch`,
    );
  });

  test("overview journey and more sections toggle", async ({ page }) => {
    const inspectionId = `floor-plan-journey-${Date.now()}`;
    await loginAs(page, "ADMIN");
    await seedV1ReferenceClaim(page, inspectionId);

    await page.goto(`/dashboard/inspections/${inspectionId}`);
    await expect(
      page.getByRole("region", { name: "Claim journey" }),
    ).toBeVisible({ timeout: 20_000 });

    const more = page.getByRole("tab", { name: /more sections/i });
    await expect(more).toBeVisible();
    await more.click();
    await expect(
      page.getByRole("tab", { name: /environmental|cost estimates/i }).first(),
    ).toBeVisible();
  });
});
