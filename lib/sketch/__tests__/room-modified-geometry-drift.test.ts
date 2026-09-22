/**
 * Fabric's polygon transform drifts fractional scan points by about 1e-14.
 * A label, material or water-category edit must not record that drift as a
 * geometry correction, for a RoomPlan scan or an AI-suggested room.
 */
import { describe, expect, it } from "vitest";
import { Polygon } from "fabric/node";
import { polygonAbsolutePoints } from "../fabric-absolute";
import { shoelaceArea, PX_PER_METRE } from "../extract-rooms";
import { applyRoomModifiedGeometry } from "../room-modified-geometry";

/** Metres x 100, the way a RoomPlan scan lands on the canvas. */
const LIDAR_RECT = [
  { x: 102.345, y: 48.672 },
  { x: 487.891, y: 51.104 },
  { x: 485.226, y: 336.448 },
  { x: 99.814, y: 333.907 },
];

const LIDAR_L = [
  { x: 20.125, y: 15.5 },
  { x: 220.375, y: 18.25 },
  { x: 218.5, y: 140.875 },
  { x: 410.625, y: 143.125 },
  { x: 408.25, y: 310.5 },
  { x: 18.75, y: 307.875 },
];

const LIDAR_SKEW = [
  { x: 15.333, y: 22.667 },
  { x: 310.111, y: 40.222 },
  { x: 288.444, y: 275.888 },
  { x: 8.777, y: 250.555 },
];

function scannedPolygon(points: { x: number; y: number }[]) {
  return new Polygon(points.map((point) => ({ ...point })), {
    fill: "rgba(0,0,0,0.08)",
    stroke: "#334155",
    strokeWidth: 11,
    strokeLineJoin: "miter",
    strokeMiterLimit: 10,
    strokeUniform: true,
    objectCaching: false,
  });
}

/** Same point and area maths as SketchEditorV2 onModified. */
function onModifiedGeometry(poly: Polygon) {
  const points = polygonAbsolutePoints(poly);
  if (!points || points.length < 3) {
    throw new Error("polygon has no absolute points");
  }
  const pxPerM = PX_PER_METRE;
  const areaM2 =
    Math.round((shoelaceArea(points) / (pxPerM * pxPerM)) * 100) / 100;
  return { points, areaM2 };
}

function geometryEntries(data: Record<string, unknown> | null): number {
  const history = data?.correctionHistory as { field?: string }[] | undefined;
  return (history ?? []).filter((entry) => entry.field === "geometry").length;
}

function roomplanData(
  source: { x: number; y: number }[],
  areaM2: number,
): Record<string, unknown> {
  return {
    type: "room",
    id: "scan-room",
    captureAdapter: "roomplan",
    provenance: "underlay_reference",
    label: "Scanned room",
    areaM2,
    originalPoints: source.map((point) => ({ ...point })),
    originalAreaM2: areaM2,
    correctionHistory: [],
  };
}

function aiSuggestedData(
  source: { x: number; y: number }[],
  areaM2: number,
): Record<string, unknown> {
  return {
    type: "room",
    id: "vision-room",
    provenance: "ai_suggested",
    captureAdapter: "cloud_ai",
    label: "Suggested room",
    areaM2,
    lengthM: 4,
    widthM: 3,
    originalPoints: source.map((point) => ({ ...point })),
    originalAreaM2: areaM2,
    correctionHistory: [],
  };
}

describe("applyRoomModifiedGeometry fractional fabric drift", () => {
  it.each([
    ["roomplan", "lidar_rect", LIDAR_RECT],
    ["roomplan", "lidar_L", LIDAR_L],
    ["roomplan", "lidar_skew", LIDAR_SKEW],
    ["ai_suggested", "lidar_rect", LIDAR_RECT],
    ["ai_suggested", "lidar_L", LIDAR_L],
    ["ai_suggested", "lidar_skew", LIDAR_SKEW],
  ] as const)(
    "%s %s: no-change edits append nothing; moving the polygon appends one",
    (kind, _shape, source) => {
      const poly = scannedPolygon(source);
      const first = onModifiedGeometry(poly);
      let data =
        kind === "roomplan"
          ? roomplanData(source, first.areaM2)
          : aiSuggestedData(source, first.areaM2);

      data = applyRoomModifiedGeometry(data, first)!;
      expect(geometryEntries(data)).toBe(0);

      data = applyRoomModifiedGeometry(data, onModifiedGeometry(poly))!;
      expect(geometryEntries(data)).toBe(0);

      data = applyRoomModifiedGeometry(data, onModifiedGeometry(poly))!;
      expect(geometryEntries(data)).toBe(0);

      poly.set({ left: poly.left + 40 });
      poly.setCoords();
      data = applyRoomModifiedGeometry(data, onModifiedGeometry(poly))!;
      expect(geometryEntries(data)).toBe(1);

      data = applyRoomModifiedGeometry(data, onModifiedGeometry(poly))!;
      expect(geometryEntries(data)).toBe(1);
    },
  );
});
