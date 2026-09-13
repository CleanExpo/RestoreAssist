/**
 * RA-7542 — Sketch chrome vs pan/zoom at Desktop Chrome 1280×720
 * (Playwright's "Standard" / Desktop Chrome viewport).
 *
 * Watched-failing contract: overlay `absolute`/`sticky` dock used to sit on
 * the canvas centre and steal clicks. After the layout fix the dock is
 * in-flow and empty-canvas / post-nav must not leave selection chrome up.
 */
import { test, expect, type Page } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";

test.use({
  storageState: AUTH_FILE,
  viewport: { width: 1280, height: 720 },
});

async function createInspection(page: Page, title: string): Promise<string> {
  await page.goto("/dashboard/inspections/new");
  await page.getByLabel(/title/i).fill(title);
  const addressInput = page.getByLabel(/address/i);
  if (await addressInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await addressInput.fill("12 Test Street, Melbourne VIC 3000");
  }
  await page
    .getByRole("button", { name: /create|save|next/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/dashboard\/inspections\/[a-z0-9-]+(?:\/|$)/, {
    timeout: 10_000,
  });
  const match = page.url().match(/\/inspections\/([a-z0-9-]+)/);
  return match?.[1] ?? "";
}

async function openSketch(page: Page, inspectionId: string) {
  await page.goto(`/dashboard/inspections/${inspectionId}?tab=sketch`);
}

test.describe("RA-7542 sketch chrome @ 1280×720", () => {
  test("dock is not sticky/fixed and does not cover the canvas centre", async ({
    page,
  }) => {
    const id = await createInspection(page, "RA-7542 chrome 1280");
    if (!id) return;
    await openSketch(page, id);

    const toolbar = page.getByTestId("sketch-dock-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 10_000 });

    const position = await toolbar.evaluate((el) => getComputedStyle(el).position);
    expect(["static", "relative"]).toContain(position);

    const canvasHost = page.getByTestId("sketch-canvas-host");
    await expect(canvasHost).toBeVisible();
    const [tb, cv] = await Promise.all([
      toolbar.boundingBox(),
      canvasHost.boundingBox(),
    ]);
    expect(tb && cv).toBeTruthy();
    if (tb && cv) {
      const canvasCenterY = cv.y + cv.height / 2;
      const coversCanvasCentre =
        tb.y < canvasCenterY && tb.y + tb.height > canvasCenterY;
      expect(coversCanvasCentre).toBe(false);
    }

    // Actionability: the canvas centre must be clickable (not stolen by chrome).
    const box = await canvasHost.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await expect(page.getByTestId("sketch-selection-panel")).toHaveCount(0);
  });

  test("leaving Sketch and returning does not keep selection chrome", async ({
    page,
  }) => {
    const id = await createInspection(page, "RA-7542 post-nav");
    if (!id) return;
    await openSketch(page, id);
    await expect(page.getByTestId("sketch-dock-toolbar")).toBeVisible({
      timeout: 10_000,
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
      timeout: 10_000,
    });
    await expect(page.getByTestId("sketch-selection-panel")).toHaveCount(0);
    const position = await page
      .getByTestId("sketch-dock-toolbar")
      .evaluate((el) => getComputedStyle(el).position);
    expect(["static", "relative"]).toContain(position);
  });
});
