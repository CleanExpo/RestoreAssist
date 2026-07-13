/**
 * RA-6764 — deterministic, API-level e2e for the Sketch money paths.
 *
 * Runs against a REAL app + DB (the sketch-e2e CI job, or locally via webServer),
 * but creates data through the API instead of the canvas UI — so it proves the
 * production flow (create → save sketch → estimate, provenance guard) without the
 * flakiness of pixel-level canvas interaction or stale UI selectors. The broader
 * UI-interaction suite (v2-sketch-workflow.spec.ts) is stabilised separately.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";

test.use({ storageState: AUTH_FILE });

async function createInspection(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/inspections", {
    headers: { "Idempotency-Key": `e2e-${Date.now()}-${Math.random()}` },
    data: {
      propertyAddress: "12 Test Street, Melbourne VIC 3000",
      propertyPostcode: "3000",
      claimType: "WATER",
    },
  });
  expect([200, 201]).toContain(res.status());
  const body = await res.json();
  // Response shape tolerance: { id } | { data: { id } } | { inspection: { id } }
  return body?.id ?? body?.data?.id ?? body?.inspection?.id ?? "";
}

function room(n: number, label: string, provenance = "operator_measured") {
  return {
    type: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: n, y: 0 },
      { x: n, y: n },
      { x: 0, y: n },
    ],
    data: { type: "room", label, provenance },
  };
}

async function saveFloor(
  request: APIRequestContext,
  id: string,
  objects: unknown[],
) {
  return request.post(`/api/inspections/${id}/sketches`, {
    headers: { "x-client-updated-at": String(Date.now()) },
    data: {
      floorNumber: 0,
      floorLabel: "Ground Floor",
      sketchType: "structural",
      sketchData: { scaleConfig: { pxPerMetre: 100 }, objects },
    },
  });
}

const areaItems = (estimate: { lineItems?: Array<{ areaM2?: number }> }) =>
  (estimate?.lineItems ?? []).filter((li) => typeof li.areaM2 === "number");

test.describe("Sketch API — save → persist → estimate (RA-6764)", () => {
  test("a saved measured room persists and feeds the estimate", async ({
    request,
  }) => {
    const id = await createInspection(request);
    expect(id, "inspection id from POST /api/inspections").toBeTruthy();

    const save = await saveFloor(request, id, [room(300, "Living")]); // 3m×4m → 12 m²
    expect([200, 201]).toContain(save.status());

    const est = await request.get(`/api/inspections/${id}/sketches/estimate`);
    expect(est.status()).toBe(200);
    const { estimate } = await est.json();
    expect(areaItems(estimate).length).toBeGreaterThanOrEqual(1);
  });

  test("imported (underlay_reference) geometry is excluded from billed area", async ({
    request,
  }) => {
    const id = await createInspection(request);
    expect(id).toBeTruthy();

    const save = await saveFloor(request, id, [
      room(1000, "AI Room", "underlay_reference"),
    ]);
    expect([200, 201]).toContain(save.status());

    const est = await request.get(`/api/inspections/${id}/sketches/estimate`);
    expect(est.status()).toBe(200);
    const { estimate } = await est.json();
    expect(areaItems(estimate).length).toBe(0); // provenance guard (RA-6761)
  });

  test("a confirmed measured room IS counted, proving the guard isn't blanket-excluding", async ({
    request,
  }) => {
    const id = await createInspection(request);
    expect(id).toBeTruthy();

    await saveFloor(request, id, [
      room(1000, "AI Room", "underlay_reference"), // excluded
      room(300, "Measured", "operator_measured"), // counted
    ]);
    const est = await request.get(`/api/inspections/${id}/sketches/estimate`);
    expect(est.status()).toBe(200);
    const { estimate } = await est.json();
    expect(areaItems(estimate).length).toBe(1);
  });
});
