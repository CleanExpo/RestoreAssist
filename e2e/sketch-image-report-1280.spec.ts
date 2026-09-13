/**
 * RA-7547 — re-verify image/photo insert + report embed at 1280×720
 * on current main (post RA-7542 stickiness). Not a greenfield rebuild of
 * RA-98 / RA-1608 / RA-120.
 *
 * Job setup matches e2e/sketch-api.spec.ts and sketch-chrome-1280.spec.ts:
 * POST /api/inspections + Idempotency-Key, then ?tab=sketch.
 * Hard-fail if setup cannot create a job — no vacuous early returns.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";
import { TEST_HEADSHOT_JPEG } from "./fixtures/headshot-jpeg";

test.use({
  storageState: AUTH_FILE,
  viewport: { width: 1280, height: 720 },
});

test.describe.configure({ timeout: 60_000 });

async function createInspection(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/inspections", {
    headers: { "Idempotency-Key": `e2e-img-${Date.now()}-${Math.random()}` },
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

async function saveMeasuredRoom(
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
      },
    },
  });
  expect(
    [200, 201],
    `POST sketches must persist a room (got ${res.status()})`,
  ).toContain(res.status());
  const body = await res.json();
  const id = body?.id ?? body?.data?.id ?? body?.sketch?.id ?? "";
  expect(id, "saved sketch must return an id").toBeTruthy();
  return id;
}

async function placeEvidencePin(
  request: APIRequestContext,
  inspectionId: string,
  sketchId: string,
): Promise<void> {
  const res = await request.post(
    `/api/inspections/${inspectionId}/sketches/${sketchId}/evidence-pins`,
    {
      data: {
        kind: "photo",
        x: 150,
        y: 200,
        nx: 0.35,
        ny: 0.4,
        caption: "Kitchen leak",
      },
    },
  );
  expect(
    [200, 201],
    `POST evidence-pins must place a marker (got ${res.status()} ${await res.text()})`,
  ).toContain(res.status());
}

async function openSketch(page: Page, inspectionId: string) {
  await page.goto(`/dashboard/inspections/${inspectionId}?tab=sketch`);
}

test.describe("RA-7547 image insert + report embed @ 1280×720", () => {
  test("photo marker is on the canvas, survives pan, and chrome stays off the surface", async ({
    page,
    request,
  }) => {
    const inspectionId = await createInspection(request);
    expect(inspectionId, "createInspection must return an inspection id").toBeTruthy();
    const sketchId = await saveMeasuredRoom(request, inspectionId);
    await placeEvidencePin(request, inspectionId, sketchId);
    await openSketch(page, inspectionId);

    const toolbar = page.getByTestId("sketch-dock-toolbar");
    await expect(toolbar).toBeVisible({ timeout: 15_000 });
    const position = await toolbar.evaluate((el) => getComputedStyle(el).position);
    expect(["static", "relative"]).toContain(position);

    const canvasHost = page.getByTestId("sketch-canvas-host");
    await expect(canvasHost).toBeVisible();

    const pin = page.getByTestId("sketch-evidence-pin").first();
    await expect(pin, "seeded photo marker must render on the live canvas").toBeVisible({
      timeout: 15_000,
    });
    await expect(pin.getByRole("button").first()).toHaveAttribute(
      "aria-label",
      /Kitchen leak/i,
    );

    const [tb, cv] = await Promise.all([
      toolbar.boundingBox(),
      canvasHost.boundingBox(),
    ]);
    expect(tb && cv, "toolbar and canvas host must have layout boxes").toBeTruthy();
    const canvasCenterY = cv!.y + cv!.height / 2;
    expect(tb!.y < canvasCenterY && tb!.y + tb!.height > canvasCenterY).toBe(false);

    await page.screenshot({
      path: "test-results/ra-7547-image-insert-1280x720.png",
      fullPage: false,
    });

    await page.getByRole("button", { name: /^Pan$/ }).click();
    const box = await canvasHost.boundingBox();
    expect(box, "canvas host bounding box").toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2 + 40);
    await page.mouse.up();

    await expect(pin, "photo marker must survive pan/zoom").toBeVisible();
    await expect(page.getByTestId("sketch-selection-panel")).toHaveCount(0);
  });

  test("Photo tool opens image insert on the canvas (file picker, not chrome)", async ({
    page,
    request,
  }) => {
    const inspectionId = await createInspection(request);
    expect(inspectionId, "createInspection must return an inspection id").toBeTruthy();
    await saveMeasuredRoom(request, inspectionId);
    await openSketch(page, inspectionId);

    await expect(page.getByTestId("sketch-dock-toolbar")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /^Photo$/ }).click();

    const layer = page.getByTestId("sketch-evidence-layer");
    await expect(layer).toBeVisible();

    const chooserPromise = page.waitForEvent("filechooser", { timeout: 8_000 });
    await layer.click({ position: { x: 200, y: 160 } });
    const chooser = await chooserPromise;
    expect(chooser.isMultiple()).toBe(false);
    await chooser.setFiles({
      name: "kitchen-leak.jpg",
      mimeType: "image/jpeg",
      buffer: TEST_HEADSHOT_JPEG,
    });
  });

  test("sketch PDF export does not return a blank document when no verified render exists", async ({
    request,
  }) => {
    const inspectionId = await createInspection(request);
    expect(inspectionId, "createInspection must return an inspection id").toBeTruthy();
    await saveMeasuredRoom(request, inspectionId);

    const res = await request.post(`/api/inspections/${inspectionId}/sketches/pdf`, {
      data: { floors: [] },
    });
    // Production path requires a receipt-eligible rendered PNG. A 200 with an
    // empty/cropped page would be the RA-120 regression this lane is hunting.
    const bodyText = await res.text();
    expect(res.status(), bodyText).toBe(409);
    expect(bodyText).toMatch(/verified floor-plan render/i);
  });
});
