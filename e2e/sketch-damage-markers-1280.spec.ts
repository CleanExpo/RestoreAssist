/**
 * RA-2953 — IICRC damage marker library at Desktop Chrome 1280×720.
 *
 * Markers are a React overlay (same overlayVpt class as RA-7547 #2202 evidence
 * pins). Hard-fail if job setup cannot create a job — no vacuous early returns.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";

test.use({
  storageState: AUTH_FILE,
  viewport: { width: 1280, height: 720 },
});

test.describe.configure({ timeout: 60_000 });

const SEEDED_MARKER = {
  id: "dm-e2e-1",
  type: "water_cat3",
  severity: "high",
  room_label: "Kitchen",
  dimension_m2: 4.5,
  notes: "Black water at kitchen sink",
  x: 150,
  y: 200,
  nx: 0.35,
  ny: 0.4,
};

async function createInspection(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/inspections", {
    headers: { "Idempotency-Key": `e2e-dmg-${Date.now()}-${Math.random()}` },
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

async function saveMeasuredRoomWithMarker(
  request: APIRequestContext,
  inspectionId: string,
): Promise<string> {
  const res = await request.post(`/api/inspections/${inspectionId}/sketches`, {
    headers: { "x-client-updated-at": String(Date.now()) },
    data: {
      floorNumber: 0,
      floorLabel: "Ground Floor",
      sketchType: "structural",
      sketchData: {
        scaleConfig: { pxPerMetre: 100 },
        objects: [
          {
            type: "polygon",
            points: [
              { x: 0, y: 0 },
              { x: 300, y: 0 },
              { x: 300, y: 400 },
              { x: 0, y: 400 },
            ],
            data: {
              type: "room",
              label: "Kitchen",
              provenance: "operator_measured",
            },
          },
        ],
        damageMarkers: [SEEDED_MARKER],
      },
    },
  });
  expect(
    [200, 201],
    `POST sketches must persist a room + marker (got ${res.status()})`,
  ).toContain(res.status());
  const body = await res.json();
  const id = body?.id ?? body?.data?.id ?? body?.sketch?.id ?? "";
  expect(id, "saved sketch must return an id").toBeTruthy();
  return id;
}

async function openSketch(page: Page, inspectionId: string) {
  await page.goto(`/dashboard/inspections/${inspectionId}?tab=sketch`);
}

async function clickDockTool(
  page: Page,
  testId:
    | "sketch-tool-pan"
    | "sketch-tool-marker"
    | "sketch-tool-zoom-in"
    | "sketch-tool-zoom-reset",
) {
  const btn = page.getByTestId(testId);
  await expect(btn, `${testId} must be in the dock`).toBeVisible({
    timeout: 15_000,
  });
  await btn.click();
}

async function markerOffsetOnHost(page: Page) {
  const host = page.getByTestId("sketch-canvas-host");
  const pin = host.getByTestId("sketch-damage-marker").first();
  const [p, h] = await Promise.all([pin.boundingBox(), host.boundingBox()]);
  expect(p && h, "marker and canvas host must have layout boxes").toBeTruthy();
  return {
    x: p!.x - h!.x,
    y: p!.y - h!.y,
  };
}

test.describe("RA-2953 IICRC damage markers @ 1280×720", () => {
  test("library is selectable and a seeded marker renders on the canvas", async ({
    page,
    request,
  }) => {
    const inspectionId = await createInspection(request);
    expect(inspectionId, "createInspection must return an inspection id").toBeTruthy();
    await saveMeasuredRoomWithMarker(request, inspectionId);
    await openSketch(page, inspectionId);

    await expect(page.getByTestId("sketch-dock-toolbar")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("sketch-canvas-host")).toHaveAttribute(
      "data-fabric-ready",
      "true",
      { timeout: 15_000 },
    );

    const pin = page.getByTestId("sketch-damage-marker").first();
    await expect(pin, "seeded Cat 3 marker must render on the live canvas").toBeVisible({
      timeout: 15_000,
    });
    await expect(pin).toHaveAttribute("data-marker-type", "water_cat3");
    await expect(pin.getByRole("button").first()).toHaveAttribute(
      "aria-label",
      /Water Cat 3.*Kitchen/i,
    );

    await clickDockTool(page, "sketch-tool-marker");
    await expect(page.getByTestId("sketch-tool-marker")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const library = page.getByTestId("sketch-damage-marker-library");
    await expect(library).toBeVisible();
    for (const type of [
      "water_cat1",
      "water_cat2",
      "water_cat3",
      "fire",
      "smoke",
      "mould",
      "structural",
    ]) {
      await expect(
        page.getByTestId(`sketch-marker-type-${type}`),
        `${type} must be in the library`,
      ).toBeVisible();
    }
    await page.getByTestId("sketch-marker-type-mould").click();
    await expect(page.getByTestId("sketch-marker-type-mould")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("marker sticks under pan — overlayVpt leaves identity", async ({
    page,
    request,
  }) => {
    const inspectionId = await createInspection(request);
    expect(inspectionId, "createInspection must return an inspection id").toBeTruthy();
    await saveMeasuredRoomWithMarker(request, inspectionId);
    await openSketch(page, inspectionId);

    await expect(page.getByTestId("sketch-canvas-host")).toHaveAttribute(
      "data-fabric-ready",
      "true",
      { timeout: 15_000 },
    );
    const pin = page.getByTestId("sketch-damage-marker").first();
    await expect(pin).toBeVisible({ timeout: 15_000 });

    const layer = page.getByTestId("sketch-damage-marker-layer");
    const panXBefore = Number(await layer.getAttribute("data-overlay-pan-x"));

    await clickDockTool(page, "sketch-tool-pan");
    await expect(page.getByTestId("sketch-tool-pan")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const box = await page.getByTestId("sketch-canvas-host").boundingBox();
    expect(box, "canvas host bounding box").toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2 + 40);
    await page.mouse.up();

    await expect(pin, "damage marker must survive pan").toBeVisible();
    await expect(
      layer,
      "pan must push overlayVpt from the live Fabric vpt",
    ).not.toHaveAttribute("data-overlay-pan-x", String(panXBefore));
  });

  test("dock Zoom In moves marker screen coords; Fit Canvas restores them", async ({
    page,
    request,
  }) => {
    const inspectionId = await createInspection(request);
    expect(inspectionId, "createInspection must return an inspection id").toBeTruthy();
    await saveMeasuredRoomWithMarker(request, inspectionId);
    await openSketch(page, inspectionId);

    await expect(page.getByTestId("sketch-canvas-host")).toHaveAttribute(
      "data-fabric-ready",
      "true",
      { timeout: 15_000 },
    );
    const host = page.getByTestId("sketch-canvas-host");
    const pin = host.getByTestId("sketch-damage-marker").first();
    await expect(pin).toBeVisible({ timeout: 15_000 });
    const layer = page.getByTestId("sketch-damage-marker-layer");

    const beforeZoom = await markerOffsetOnHost(page);
    const zoomBefore = await layer.getAttribute("data-overlay-zoom");
    const panXBefore = await layer.getAttribute("data-overlay-pan-x");
    const panYBefore = await layer.getAttribute("data-overlay-pan-y");

    await clickDockTool(page, "sketch-tool-zoom-in");
    await expect(layer).not.toHaveAttribute("data-overlay-zoom", zoomBefore ?? "");
    await expect(pin).toBeVisible();
    const afterZoom = await markerOffsetOnHost(page);
    const moved = Math.hypot(
      afterZoom.x - beforeZoom.x,
      afterZoom.y - beforeZoom.y,
    );
    expect(
      moved,
      `dock Zoom In must move marker screen coords (moved ${moved.toFixed(1)}px)`,
    ).toBeGreaterThan(8);

    await clickDockTool(page, "sketch-tool-zoom-reset");
    await expect(layer).toHaveAttribute("data-overlay-zoom", zoomBefore ?? "1");
    await expect(layer).toHaveAttribute("data-overlay-pan-x", panXBefore ?? "0");
    await expect(layer).toHaveAttribute("data-overlay-pan-y", panYBefore ?? "0");
    await expect(pin).toBeVisible();
    const afterReset = await markerOffsetOnHost(page);
    const resetDelta = Math.hypot(
      afterReset.x - beforeZoom.x,
      afterReset.y - beforeZoom.y,
    );
    expect(
      resetDelta,
      `Fit Canvas must return the marker near its pre-zoom host offset (resetDelta=${resetDelta.toFixed(1)}px)`,
    ).toBeLessThan(12);
  });

  test("sketch PDF export hard-fails when no verified render exists (no blank page)", async ({
    request,
  }) => {
    const inspectionId = await createInspection(request);
    expect(inspectionId, "createInspection must return an inspection id").toBeTruthy();
    await saveMeasuredRoomWithMarker(request, inspectionId);

    const res = await request.post(`/api/inspections/${inspectionId}/sketches/pdf`, {
      data: { floors: [] },
    });
    const bodyText = await res.text();
    expect(res.status(), bodyText).toBe(409);
    expect(bodyText).toMatch(/verified floor-plan render/i);
  });
});
