/**
 * object:modified fires for every room-panel edit. A RoomPlan geometry
 * correction must be recorded only when the room's current geometry
 * actually changed. A label edit still records its own label correction.
 */
import { describe, expect, it } from "vitest";
import { applyRoomModifiedGeometry } from "../room-modified-geometry";
import {
  recordRoomPlanGeometryCorrection,
  recordRoomPlanLabelCorrection,
} from "../roomplan-correction";

const POINTS = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 400, y: 300 },
  { x: 0, y: 300 },
];

const MOVED = POINTS.map((p) => ({ x: p.x + 40, y: p.y }));

function fields(data: Record<string, unknown>): string[] {
  const history = data.correctionHistory as { field?: string }[] | undefined;
  return (history ?? []).map((entry) => entry.field ?? "");
}

function roomplanRoom() {
  return {
    type: "room",
    id: "room-1",
    captureAdapter: "roomplan",
    provenance: "underlay_reference",
    label: "Room",
    areaM2: 12,
    lengthM: 4,
    widthM: 3,
    originalPoints: POINTS.map((p) => ({ ...p })),
    originalLabel: "Room",
    originalAreaM2: 12,
    correctionHistory: [] as unknown[],
  };
}

describe("recordRoomPlanGeometryCorrection", () => {
  it("a no-change call appends nothing; a real change appends exactly one", () => {
    const data = roomplanRoom();

    const same = recordRoomPlanGeometryCorrection(data, {
      points: POINTS,
      areaM2: 12,
      lengthM: 4,
      widthM: 3,
    });
    expect(fields(same).filter((field) => field === "geometry")).toEqual([]);

    const moved = recordRoomPlanGeometryCorrection(data, {
      points: MOVED,
      areaM2: 12,
    });
    expect(fields(moved).filter((field) => field === "geometry")).toEqual([
      "geometry",
    ]);

    // Current geometry is the move, not originalPoints. Repeating it
    // must not append a second entry.
    const repeated = recordRoomPlanGeometryCorrection(moved, {
      points: MOVED,
      areaM2: 12,
    });
    expect(fields(repeated).filter((field) => field === "geometry")).toEqual([
      "geometry",
    ]);

    const lengthOnly = recordRoomPlanGeometryCorrection(data, {
      points: POINTS,
      areaM2: 12,
      lengthM: 5,
      widthM: 3,
    });
    expect(fields(lengthOnly).filter((field) => field === "geometry")).toEqual(
      ["geometry"],
    );
    expect(lengthOnly.lengthM).toBe(5);
  });
});

describe("applyRoomModifiedGeometry", () => {
  it("a label edit on a RoomPlan room records the label and no geometry correction", () => {
    const room = roomplanRoom();
    const labelled = recordRoomPlanLabelCorrection(room, "Voice test room", {
      at: "2026-09-22T03:00:00.000Z",
    });
    const afterLabel = applyRoomModifiedGeometry(labelled, {
      points: POINTS,
      areaM2: 12,
    });
    expect(afterLabel).not.toBeNull();
    expect(fields(afterLabel!)).toEqual(["label"]);

    const resized = recordRoomPlanGeometryCorrection(room, {
      points: MOVED,
      areaM2: 18,
    });
    const relabelled = recordRoomPlanLabelCorrection(resized, "Kitchen", {
      at: "2026-09-22T03:01:00.000Z",
    });
    const afterRelabel = applyRoomModifiedGeometry(relabelled, {
      points: MOVED,
      areaM2: 18,
    });
    expect(afterRelabel).not.toBeNull();
    expect(fields(afterRelabel!)).toEqual(["geometry", "label"]);
  });
});
