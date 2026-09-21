/**
 * RA-7572 — a saved 3 m × 3 m sketch room must produce estimate area lines.
 *
 * Walkthrough T8: the room saved, but the estimate had 0 measured-area lines.
 * Root cause: the extractor only shoelaced Fabric `type === "polygon"` points
 * at a hardcoded 100 px/m and ignored the metre fields the room tool persists
 * (`data.areaM2`, `lengthM` × `widthM`) and the SketchRoom graph.
 *
 * This fixture is the shape a technician-drawn room actually lands in after
 * save — it fails on current main (0 area lines) and passes after the fix.
 */
import { describe, expect, it } from "vitest";
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor";
import { extractRooms } from "@/lib/sketch/extract-rooms";
import { extractRoomGraphNodes } from "@/lib/sketch/sync-room-graph";

const THREE_M = 3;
const FLOOR_M2 = THREE_M * THREE_M; // 9
const CEILING_M = 2.7;
const WALL_M2 = 2 * (THREE_M + THREE_M) * CEILING_M; // 32.4

/** How the room tool persists a typed 3×3 room — metres on `data`, not px. */
function savedThreeByThreeRoom() {
  return {
    // Fabric 7 class type; points omitted the way a dim-locked save can
    // land when the extractor used to require a polygon + {x,y} points.
    type: "Polygon",
    data: {
      type: "room",
      id: "room-t8-3x3",
      label: "Bedroom",
      provenance: "operator_measured",
      captureAdapter: "manual",
      areaM2: FLOOR_M2,
      lengthM: THREE_M,
      widthM: THREE_M,
      ceilingHeightM: CEILING_M,
    },
  };
}

function floors(objects: unknown[], extra?: { savedRooms?: unknown[] }) {
  return [
    {
      floorLabel: "Ground Floor",
      sketchData: {
        scaleConfig: { pxPerMetre: 100 },
        objects,
      },
      equipmentPoints: null,
      moisturePoints: null,
      savedRooms: extra?.savedRooms ?? null,
    },
  ];
}

const areaLines = (e: ReturnType<typeof extractSketchEstimate>) =>
  e.lineItems.filter((li) => typeof li.areaM2 === "number");

describe("RA-7572 — saved 3×3 room reaches the estimate", () => {
  it("saves a known 3×3 room and asserts ~9 m² floor plus walls", () => {
    const room = savedThreeByThreeRoom();
    const sketchData = {
      scaleConfig: { pxPerMetre: 100 },
      objects: [room],
    };

    // Save path: RoomGraph reads data.areaM2 in metres.
    const nodes = extractRoomGraphNodes(sketchData);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].areaM2).toBe(FLOOR_M2);

    const estimate = extractSketchEstimate(floors([room]));
    const lines = areaLines(estimate);
    const floor = lines.find((li) => li.notes === "Floor area");
    const walls = lines.find((li) => li.notes?.startsWith("Wall area"));

    expect(floor, "3×3 room must not yield 0 floor lines").toBeDefined();
    expect(floor!.areaM2).toBeCloseTo(FLOOR_M2, 5);
    expect(floor!.quantity).toBeCloseTo(FLOOR_M2, 5);
    expect(floor!.unit).toBe("m²");
    expect(floor!.description).toMatch(/Bedroom/);

    expect(walls, "walls in scope when ceiling height is saved").toBeDefined();
    expect(walls!.areaM2).toBeCloseTo(WALL_M2, 5);
  });

  it("metres-as-pixels points still bill 9 m² via data.areaM2 (not 0.0009)", () => {
    // If points were treated as px @ 100 px/m, 3×3 px = 0.0009 m² < 0.1 skip.
    const room = {
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: THREE_M, y: 0 },
        { x: THREE_M, y: THREE_M },
        { x: 0, y: THREE_M },
      ],
      data: {
        type: "room",
        label: "Bedroom",
        provenance: "operator_measured",
        areaM2: FLOOR_M2,
        lengthM: THREE_M,
        widthM: THREE_M,
      },
    };
    const lines = areaLines(extractSketchEstimate(floors([room])));
    expect(lines).toHaveLength(1);
    expect(lines[0].areaM2).toBeCloseTo(FLOOR_M2, 5);
  });

  it("array-form Fabric points + L×W still produce 9 m²", () => {
    const room = {
      type: "Polygon",
      points: [
        [0, 0],
        [300, 0],
        [300, 300],
        [0, 300],
      ],
      data: {
        type: "room",
        label: "Bedroom",
        provenance: "operator_measured",
        lengthM: THREE_M,
        widthM: THREE_M,
      },
    };
    const lines = areaLines(extractSketchEstimate(floors([room])));
    expect(lines[0].areaM2).toBeCloseTo(FLOOR_M2, 5);
  });

  it("honours a calibrated scale when only pixel points exist", () => {
    // 150 px × 150 px at 50 px/m = 3 m × 3 m = 9 m² (hardcoded 100 px/m → 2.25).
    const room = {
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 150, y: 0 },
        { x: 150, y: 150 },
        { x: 0, y: 150 },
      ],
      data: { type: "room", label: "Bedroom", provenance: "operator_measured" },
    };
    const estimate = extractSketchEstimate([
      {
        floorLabel: "Ground Floor",
        sketchData: { scaleConfig: { pxPerMetre: 50 }, objects: [room] },
      },
    ]);
    expect(areaLines(estimate)[0].areaM2).toBeCloseTo(FLOOR_M2, 5);
  });

  it("falls back to SketchRoom.areaM2 when the Fabric blob has no rooms", () => {
    const estimate = extractSketchEstimate(
      floors([], {
        savedRooms: [
          {
            name: "Bedroom",
            areaM2: FLOOR_M2,
            perimeterM: 12,
            heightM: CEILING_M,
            provenance: "operator_measured",
          },
        ],
      }),
    );
    const lines = areaLines(estimate);
    expect(lines.find((li) => li.notes === "Floor area")?.areaM2).toBeCloseTo(
      FLOOR_M2,
      5,
    );
    expect(
      lines.find((li) => li.notes?.startsWith("Wall area"))?.areaM2,
    ).toBeCloseTo(WALL_M2, 5);
  });

  it("does not bill underlay_reference rooms from either source", () => {
    const imported = {
      ...savedThreeByThreeRoom(),
      data: {
        ...savedThreeByThreeRoom().data,
        provenance: "underlay_reference",
      },
    };
    const fromFabric = extractSketchEstimate(floors([imported]));
    expect(areaLines(fromFabric)).toHaveLength(0);

    const fromGraph = extractSketchEstimate(
      floors([], {
        savedRooms: [
          {
            name: "AI Room",
            areaM2: 100,
            provenance: "underlay_reference",
          },
        ],
      }),
    );
    expect(areaLines(fromGraph)).toHaveLength(0);
  });

  it("extractRooms stays in lock-step with the estimate (9 m²)", () => {
    const rooms = extractRooms({
      scaleConfig: { pxPerMetre: 100 },
      objects: [savedThreeByThreeRoom()],
    });
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaM2).toBeCloseTo(FLOOR_M2, 5);
    expect(rooms[0].label).toBe("Bedroom");
  });
});
