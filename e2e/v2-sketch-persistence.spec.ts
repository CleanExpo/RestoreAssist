/**
 * V2 Sketch — Real Happy-Path Persistence Tests (RA-6764)
 *
 * These tests hit the actual API to prove that data written during a session
 * survives a reload — draw, autosave, GET, assert.  They do NOT rely on the
 * Fabric.js canvas UI; all draw state is injected via the REST API so the
 * tests stay deterministic regardless of canvas timing.
 *
 * Prerequisites:
 *   - ALLOW_TEST_HELPERS=true (sandbox/local — not prod)
 *   - Auth storage state at playwright/.auth/user.json (created by auth.setup.ts)
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { AUTH_FILE } from "./auth.setup";

test.use({ storageState: AUTH_FILE });

// ── Minimal 1×1 transparent PNG (valid data URL for PDF endpoint) ─────────
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ── 400×300 px Fabric.js polygon — 12 m² room (PX_PER_METRE = 100) ───────
// Shoelace area = 400 × 300 = 120 000 px² → 120 000 / 10 000 = 12 m²
const FABRIC_POLYGON_12M2 = {
  version: "5.3.0",
  objects: [
    {
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 300 },
        { x: 0, y: 300 },
      ],
      scaleX: 1,
      scaleY: 1,
      fill: "#e8e8e8",
      stroke: "#333",
      strokeWidth: 2,
      name: "Living Room",
    },
  ],
};

/** Create a real inspection owned by the current user via the inspections API. */
async function createTestInspection(
  request: APIRequestContext,
  label: string,
): Promise<string> {
  const key = `e2e-insp-${label}-${Date.now()}`;
  const res = await request.post("/api/inspections", {
    headers: { "Idempotency-Key": key },
    data: {
      propertyAddress: `12 ${label} Street, Melbourne VIC 3000`,
      propertyPostcode: "3000",
    },
  });
  // If helpers are not enabled the suite is running in prod — skip gracefully.
  if (res.status() === 401 || res.status() === 403) {
    throw new Error(`createTestInspection: not authenticated (${res.status()})`);
  }
  expect(res.status()).toBe(201);
  const body = await res.json();
  const id = body.inspection?.id ?? body.id;
  expect(typeof id).toBe("string");
  return id as string;
}

// ═══════════════════════════════════════════════════════════════
// 1. Sketch data persists after save + GET
// ═══════════════════════════════════════════════════════════════

test.describe("Sketch persistence", () => {
  test("sketch data survives save → GET round-trip", async ({ request }) => {
    const id = await createTestInspection(request, "SketchPersist");

    // Save a sketch with a polygon
    const save = await request.post(`/api/inspections/${id}/sketches`, {
      data: {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        sketchType: "structural",
        sketchData: FABRIC_POLYGON_12M2,
      },
    });
    expect(save.status()).toBe(201);

    // Retrieve all sketches for this inspection
    const get = await request.get(`/api/inspections/${id}/sketches`);
    expect(get.status()).toBe(200);
    const { sketches } = await get.json();

    expect(sketches).toHaveLength(1);
    const saved = sketches[0];
    expect(saved.floorLabel).toBe("Ground Floor");
    expect(saved.sketchType).toBe("structural");
    expect(saved.sketchData).toBeDefined();
    expect(saved.sketchData.objects).toHaveLength(1);
    expect(saved.sketchData.objects[0].type).toBe("polygon");
    expect(saved.sketchData.objects[0].points).toHaveLength(4);
  });

  test("updating a sketch floor upserts in-place (no duplicate floors)", async ({
    request,
  }) => {
    const id = await createTestInspection(request, "SketchUpsert");

    const basePayload = {
      floorNumber: 0,
      floorLabel: "Ground Floor",
      sketchType: "structural" as const,
    };

    // First save
    await request.post(`/api/inspections/${id}/sketches`, {
      data: { ...basePayload, sketchData: { version: "5.3.0", objects: [] } },
    });
    // Second save — same floor, updated objects
    await request.post(`/api/inspections/${id}/sketches`, {
      data: { ...basePayload, sketchData: FABRIC_POLYGON_12M2 },
    });

    const get = await request.get(`/api/inspections/${id}/sketches`);
    const { sketches } = await get.json();
    // Must be exactly 1 floor (upserted, not duplicated)
    expect(sketches.filter((s: any) => s.floorNumber === 0)).toHaveLength(1);
    // Should contain the second save's polygon
    expect(sketches[0].sketchData.objects).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Moisture reading persists with normalized pin coordinates
// ═══════════════════════════════════════════════════════════════

test.describe("Moisture persistence", () => {
  test("moisture reading persists after POST with mapX/mapY", async ({
    request,
  }) => {
    const id = await createTestInspection(request, "MoisturePersist");
    const ikey = `e2e-moisture-${id}-${Date.now()}`;

    const save = await request.post(`/api/inspections/${id}/moisture`, {
      headers: { "Idempotency-Key": ikey },
      data: {
        location: "Living Room — north wall base",
        surfaceType: "Plasterboard",
        moistureLevel: 42,
        mapX: 0.5,
        mapY: 0.3,
        source: "manual",
      },
    });
    expect(save.status()).toBe(201);
    const { moistureReading } = await save.json();
    expect(moistureReading.id).toBeTruthy();
    expect(moistureReading.moistureLevel).toBe(42);

    // Verify via GET inspection (moisture readings are included in detail response)
    const insp = await request.get(`/api/inspections/${id}`);
    expect(insp.status()).toBe(200);
    const body = await insp.json();
    const readings =
      body.inspection?.moistureReadings ?? body.moistureReadings ?? [];
    const found = readings.find((r: any) => r.id === moistureReading.id);

    expect(found).toBeDefined();
    expect(found.moistureLevel).toBe(42);
    // mapX and mapY are clamped to [0, 1]
    expect(found.mapX).toBeCloseTo(0.5, 2);
    expect(found.mapY).toBeCloseTo(0.3, 2);
    expect(found.source).toBe("manual");
  });

  test("idempotent moisture POST does not create duplicates", async ({
    request,
  }) => {
    const id = await createTestInspection(request, "MoistureIdempotent");
    const ikey = `e2e-moisture-idem-${id}`;

    const payload = {
      location: "Kitchen — under sink",
      surfaceType: "Timber",
      moistureLevel: 55,
      source: "manual",
    };

    // Post twice with same idempotency key
    const r1 = await request.post(`/api/inspections/${id}/moisture`, {
      headers: { "Idempotency-Key": ikey },
      data: payload,
    });
    const r2 = await request.post(`/api/inspections/${id}/moisture`, {
      headers: { "Idempotency-Key": ikey },
      data: payload,
    });

    expect(r1.status()).toBe(201);
    // Second call with same key returns the cached result (201) — not a new row
    expect(r2.status()).toBe(201);
    const id1 = (await r1.json()).moistureReading.id;
    const id2 = (await r2.json()).moistureReading.id;
    expect(id1).toBe(id2);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Estimate: polygon sketch produces non-zero area line items
// ═══════════════════════════════════════════════════════════════

test.describe("Sketch estimate", () => {
  test("estimate returns ~12 m² room from 400×300 px polygon", async ({
    request,
  }) => {
    const id = await createTestInspection(request, "EstimatePolygon");

    // Save a structural sketch with a 400×300 px polygon
    const save = await request.post(`/api/inspections/${id}/sketches`, {
      data: {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        sketchType: "structural",
        sketchData: FABRIC_POLYGON_12M2,
      },
    });
    expect(save.status()).toBe(201);

    // Request estimate
    const res = await request.get(
      `/api/inspections/${id}/sketches/estimate`,
    );
    expect(res.status()).toBe(200);
    const { estimate } = await res.json();

    expect(estimate).toBeDefined();
    expect(Array.isArray(estimate.lineItems)).toBe(true);
    expect(estimate.lineItems.length).toBeGreaterThan(0);

    // The first line item should be the room (shoelace area ≈ 12 m²)
    const roomItem = estimate.lineItems[0];
    expect(roomItem.areaM2).toBeGreaterThan(10);
    expect(roomItem.areaM2).toBeLessThan(14);
  });

  test("estimate returns empty lineItems for inspection with no sketches", async ({
    request,
  }) => {
    const id = await createTestInspection(request, "EstimateEmpty");

    const res = await request.get(
      `/api/inspections/${id}/sketches/estimate`,
    );
    expect(res.status()).toBe(200);
    const { estimate } = await res.json();
    expect(estimate).toBeDefined();
    // Empty sketch → no room line items
    const items = estimate.lineItems ?? [];
    const roomItems = items.filter((i: any) => i.type === "room");
    expect(roomItems).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. PDF export: owned inspection returns application/pdf
// ═══════════════════════════════════════════════════════════════

test.describe("Sketch PDF export", () => {
  test("PDF endpoint returns application/pdf for owned inspection", async ({
    request,
  }) => {
    const id = await createTestInspection(request, "PDFExport");

    const res = await request.post(
      `/api/inspections/${id}/sketches/pdf`,
      {
        data: {
          floors: [
            {
              label: "Ground Floor",
              pngDataUrl: TINY_PNG,
              fabricJson: { version: "5.3.0", objects: [] },
            },
          ],
          propertyAddress: "12 E2E Test Street, Melbourne VIC 3000",
          reportNumber: "E2E-001",
        },
        timeout: 30_000,
      },
    );

    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"];
    expect(contentType).toContain("application/pdf");
  });

  test("PDF endpoint returns 404 for non-owned inspection", async ({
    request,
  }) => {
    const res = await request.post(
      "/api/inspections/00000000-0000-0000-0000-000000000000/sketches/pdf",
      {
        data: {
          floors: [
            {
              label: "Ground Floor",
              pngDataUrl: TINY_PNG,
              fabricJson: { objects: [] },
            },
          ],
        },
      },
    );
    expect(res.status()).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Staleness guard: older queued payload returns 409
// ═══════════════════════════════════════════════════════════════

test.describe("Sketch staleness guard (RA-1762)", () => {
  test("POST with x-client-updated-at older than server returns 409 stale", async ({
    request,
  }) => {
    const id = await createTestInspection(request, "StaleGuard");

    // Capture a timestamp BEFORE the initial save
    const beforeSave = Date.now() - 60_000; // 1 minute ago

    // First save — no header (online-first, treated as fresh)
    const first = await request.post(`/api/inspections/${id}/sketches`, {
      data: {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        sketchType: "structural",
        sketchData: { version: "5.3.0", objects: [] },
      },
    });
    expect(first.status()).toBe(201);

    // Second POST with a client timestamp BEFORE the server's updatedAt
    const stale = await request.post(`/api/inspections/${id}/sketches`, {
      headers: { "x-client-updated-at": String(beforeSave) },
      data: {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        sketchType: "structural",
        sketchData: {
          version: "5.3.0",
          objects: [{ type: "stale-object" }],
        },
      },
    });

    expect(stale.status()).toBe(409);
    const body = await stale.json();
    expect(body.stale).toBe(true);
    expect(body.serverUpdatedAt).toBeDefined();

    // Verify the stale payload did NOT clobber the server state
    const get = await request.get(`/api/inspections/${id}/sketches`);
    const { sketches } = await get.json();
    const objects = sketches[0]?.sketchData?.objects ?? [];
    // The stale "stale-object" must not be present
    expect(objects.every((o: any) => o.type !== "stale-object")).toBe(true);
  });

  test("POST with x-client-updated-at newer than server is accepted", async ({
    request,
  }) => {
    const id = await createTestInspection(request, "FreshGuard");

    // First save
    const first = await request.post(`/api/inspections/${id}/sketches`, {
      data: {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        sketchType: "structural",
        sketchData: { version: "5.3.0", objects: [] },
      },
    });
    expect(first.status()).toBe(201);

    // Second POST with a timestamp AFTER the server save — should succeed
    const future = Date.now() + 10_000;
    const fresh = await request.post(`/api/inspections/${id}/sketches`, {
      headers: { "x-client-updated-at": String(future) },
      data: {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        sketchType: "structural",
        sketchData: FABRIC_POLYGON_12M2,
      },
    });

    // 201 = accepted (not 409)
    expect(fresh.status()).toBe(201);
  });
});
