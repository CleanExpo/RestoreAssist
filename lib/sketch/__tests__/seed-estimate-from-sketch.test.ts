/**
 * RA-7608 — estimate created through the floor-plan UI action must carry
 * the measured room m². Fails on current main (no seed path) and passes
 * once GET /sketches/estimate room lines are POSTed to /api/estimates.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor";
import { extractRooms } from "@/lib/sketch/extract-rooms";
import { buildScopeExport } from "@/lib/export/scope-contract";
import { describeToolObject } from "@/lib/sketch/tool-objects";
import {
  rectRoomPointsFromDiagonal,
  roomTemplatePoints,
} from "@/lib/sketch/room-defaults";
import {
  createEstimateFromSketch,
  seedEstimateLineItemsFromSketch,
} from "@/lib/sketch/seed-estimate-from-sketch";

const THREE_M = 3;
const FLOOR_M2 = THREE_M * THREE_M; // 9
const PX = 100;

function fabricFromDescriptor(
  points: { x: number; y: number }[],
  extraData?: Record<string, unknown>,
) {
  const d = describeToolObject({
    tool: "room",
    points,
    pxPerMetre: PX,
    text: "Bedroom",
  });
  if (!d) throw new Error("describeToolObject returned null");
  return {
    type: d.kind,
    ...d.props,
    data: { ...d.data, label: "Bedroom", ...extraData },
  };
}

function floors(objects: unknown[]) {
  return [
    {
      floorLabel: "Ground Floor",
      sketchData: {
        scaleConfig: { pxPerMetre: PX },
        objects,
      },
    },
  ];
}

function fabricJson(objects: unknown[]) {
  return { scaleConfig: { pxPerMetre: PX }, objects };
}

const floorLine = (items: { qty?: number; unit?: string; notes?: string }[]) =>
  items.find(
    (li) =>
      li.unit === "m²" &&
      (typeof li.qty === "number" ? li.qty : undefined) !== undefined,
  );

describe("RA-7608 — seed estimate from measured rooms", () => {
  it("a 3 m × 3 m room estimate created through the UI action contains a 9 m² room line", async () => {
    const room = fabricFromDescriptor(
      rectRoomPointsFromDiagonal({ x: 0, y: 0 }, { x: THREE_M * PX, y: THREE_M * PX }),
    );
    const sketch = extractSketchEstimate(floors([room]));
    const seeded = seedEstimateLineItemsFromSketch(sketch);

    // This is the line that fails on current main: nothing seeds POST /api/estimates.
    const nine = seeded.find((li) => li.qty === FLOOR_M2 && li.unit === "m²");
    expect(nine, "3×3 room must produce a 9 m² estimate line").toBeDefined();
    expect(nine!.qty).toBeCloseTo(FLOOR_M2, 5);
    expect(nine!.unit).toBe("m²");
    expect(nine!.description).toMatch(/Bedroom/);
  });

  it("createEstimateFromSketch POSTs the 9 m² room line", async () => {
    const room = fabricFromDescriptor(
      rectRoomPointsFromDiagonal({ x: 0, y: 0 }, { x: THREE_M * PX, y: THREE_M * PX }),
    );
    const sketch = extractSketchEstimate(floors([room]));

    const postBodies: Array<{ lineItems?: Array<{ qty?: number; unit?: string }> }> =
      [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/sketches/estimate")) {
          return {
            ok: true,
            json: async () => ({ estimate: sketch }),
          };
        }
        if (String(url).includes("/api/estimates") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          postBodies.push(body);
          return {
            ok: true,
            json: async () => ({ id: "est_1", lineItems: body.lineItems }),
          };
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const result = await createEstimateFromSketch({
      inspectionId: "insp_1",
      reportId: "rep_1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const posted = postBodies[0]?.lineItems ?? result.estimate.lineItems ?? [];
    const nine = posted.find((li) => li.qty === FLOOR_M2 && li.unit === "m²");
    expect(nine, "POST /api/estimates must be seeded with the 9 m² room line").toBeDefined();
  });

  it("a room whose provenance is not operator_measured produces no estimate line", () => {
    const measured = fabricFromDescriptor(
      rectRoomPointsFromDiagonal({ x: 0, y: 0 }, { x: THREE_M * PX, y: THREE_M * PX }),
    );
    for (const provenance of ["underlay_reference", "ai_suggested"] as const) {
      const imported = {
        ...measured,
        data: { ...measured.data, provenance },
      };
      const sketch = extractSketchEstimate(floors([imported]));
      const seeded = seedEstimateLineItemsFromSketch(sketch);
      expect(
        seeded,
        `${provenance} must not seed an estimate line`,
      ).toHaveLength(0);
    }
  });
});

describe("RA-7608 — same m² on scope-export, PDF rooms, and estimate", () => {
  const cases: Array<{ name: string; points: { x: number; y: number }[] }> = [
    {
      name: "drag-rectangle",
      points: rectRoomPointsFromDiagonal(
        { x: 0, y: 0 },
        { x: THREE_M * PX, y: THREE_M * PX },
      ),
    },
    {
      name: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: THREE_M * PX, y: 0 },
        { x: THREE_M * PX, y: THREE_M * PX },
        { x: 0, y: THREE_M * PX },
      ],
    },
    {
      name: "Rect template",
      points: roomTemplatePoints("rect", { x: 400, y: 400 }, THREE_M, THREE_M, PX),
    },
    {
      name: "L template",
      points: roomTemplatePoints("L", { x: 400, y: 400 }, THREE_M, THREE_M, PX),
    },
    {
      name: "T template",
      points: roomTemplatePoints("T", { x: 400, y: 400 }, THREE_M, THREE_M, PX),
    },
  ];

  it.each(cases)("$name: PDF, scope-export and estimate share one m²", ({ points }) => {
    const room = fabricFromDescriptor(points);
    const json = fabricJson([room]);

    const pdfRooms = extractRooms(json);
    const scope = buildScopeExport({
      floors: [{ label: "Ground Floor", fabricJson: json }],
      materials: [],
    });
    const sketch = extractSketchEstimate(floors([room]));
    const seeded = seedEstimateLineItemsFromSketch(sketch);
    const estimateFloor = floorLine(seeded);

    expect(pdfRooms).toHaveLength(1);
    expect(scope.floors[0].rooms).toHaveLength(1);
    expect(estimateFloor, "estimate must carry a room m² line").toBeDefined();

    const pdfM2 = pdfRooms[0].areaM2;
    const scopeM2 = scope.floors[0].rooms[0].areaM2;
    const estimateM2 = estimateFloor!.qty;

    expect(scopeM2).toBeCloseTo(pdfM2, 5);
    expect(estimateM2).toBeCloseTo(pdfM2, 5);
    expect(scope.totalFloorAreaM2).toBeCloseTo(pdfM2, 5);
  });
});

describe("createEstimateFromSketch fetch wiring", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not POST when GET returns only a non-measured room", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/sketches/estimate")) {
          return {
            ok: true,
            json: async () => ({
              estimate: {
                lineItems: [
                  {
                    id: "room-1",
                    category: "room",
                    description: "AI Room — Ground Floor",
                    quantity: 100,
                    unit: "m²",
                    areaM2: 100,
                    notes: "Floor area",
                    provenance: "ai_suggested",
                  },
                ],
                totalRoomAreaM2: 100,
                totalDamageAreaM2: 0,
                extractedAt: new Date().toISOString(),
              },
            }),
          };
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );

    const result = await createEstimateFromSketch({
      inspectionId: "insp_1",
      reportId: "rep_1",
    });
    expect(result.ok).toBe(false);
  });
});
