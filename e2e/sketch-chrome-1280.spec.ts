/**
 * RA-7542 — Sketch chrome vs pan/zoom at Desktop Chrome 1280×720
 * (Playwright's "Standard" / Desktop Chrome viewport).
 *
 * Watched-failing contract: overlay `absolute`/`sticky` dock used to sit on
 * the canvas centre and steal clicks. After the layout fix the dock is
 * in-flow and empty-canvas / post-nav must not leave selection chrome up.
 *
 * Job setup matches e2e/sketch-api.spec.ts (POST /api/inspections +
 * Idempotency-Key). The UI /inspections/new title field is not present in
 * Sketch E2E CI and timed out at getByLabel(/title/i).fill.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";

test.use({
  storageState: AUTH_FILE,
  viewport: { width: 1280, height: 720 },
});

test.describe.configure({ timeout: 60_000 });

async function createInspection(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/inspections", {
    headers: { "Idempotency-Key": `e2e-chrome-${Date.now()}-${Math.random()}` },
    data: {
      propertyAddress: "12 Test Street, Melbourne VIC 3000",
      propertyPostcode: "3000",
      claimType: "WATER",
    },
  });
  expect(
    [200, 201],
    `POST /api/inspections must succeed (got ${res.status()})`,
  ).toContain(res.status());
  const body = await res.json();
  return body?.id ?? body?.data?.id ?? body?.inspection?.id ?? "";
}

async function openSketch(page: Page, inspectionId: string) {
  await page.goto(`/dashboard/inspections/${inspectionId}?tab=sketch`);
}

test.describe("RA-7542 sketch chrome @ 1280×720", () => {
  test("dock is not sticky/fixed and does not cover the canvas centre", async ({
    page,
    request,
  }) => {
    const id = await createInspection(request);
    expect(id, "createInspection must return an inspection id").toBeTruthy();
    await openSketch(page, id);

    const toolbar = page.getByTestId("sketch-dock-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 15_000 });

    const position = await toolbar.evaluate((el) => getComputedStyle(el).position);
    expect(["static", "relative"]).toContain(position);

    const canvasHost = page.getByTestId("sketch-canvas-host");
    await expect(canvasHost).toBeVisible();
    const [tb, cv] = await Promise.all([
      toolbar.boundingBox(),
      canvasHost.boundingBox(),
    ]);
    expect(tb && cv, "toolbar and canvas host must have layout boxes").toBeTruthy();
    if (tb && cv) {
      const canvasCenterY = cv.y + cv.height / 2;
      const coversCanvasCentre =
        tb.y < canvasCenterY && tb.y + tb.height > canvasCenterY;
      expect(coversCanvasCentre).toBe(false);
    }

    // Actionability: the canvas centre must be clickable (not stolen by chrome).
    const box = await canvasHost.boundingBox();
    expect(box, "canvas host bounding box").toBeTruthy();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page.getByTestId("sketch-selection-panel")).toHaveCount(0);
  });

  test("leaving Sketch and returning does not keep selection chrome", async ({
    page,
    request,
  }) => {
    const id = await createInspection(request);
    expect(id, "createInspection must return an inspection id").toBeTruthy();
    await openSketch(page, id);
    await expect(page.getByTestId("sketch-dock-toolbar")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("tab", { name: /overview/i }).click();
    await expect(page.getByTestId("sketch-dock-toolbar")).toBeHidden();

    await page.getByRole("tab", { name: /sketch|floor plan/i }).click();
    await expect(page.getByTestId("sketch-dock-toolbar")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByTestId("sketch-selection-panel")).toHaveCount(0);

    await page.goto("/dashboard/inspections");
    await page.goto(`/dashboard/inspections/${id}?tab=sketch`);
    await expect(page.getByTestId("sketch-dock-toolbar")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("sketch-selection-panel")).toHaveCount(0);
    const position = await page
      .getByTestId("sketch-dock-toolbar")
      .evaluate((el) => getComputedStyle(el).position);
    expect(["static", "relative"]).toContain(position);
  });
});
