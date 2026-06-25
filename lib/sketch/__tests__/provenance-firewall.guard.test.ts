/**
 * RA-6839 (A0) — end-to-end provenance firewall regression guard.
 *
 * underlay_reference geometry (AI/imported, reference-only) must never reach a
 * measured quantity or export. The fix (RA-6839) pushes the provenance filter
 * INTO the extractors (extractRooms / extractRoomsFromFabricJson), so leakage is
 * impossible regardless of whether a caller remembered to sanitise first.
 */
import { describe, expect, it } from "vitest";
import { decomposeElements } from "../decompose-elements";
import { measuredSketchData } from "../measured-sketch-data";
import { extractRooms } from "../extract-rooms";
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor";

const rect = (w: number, h: number) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

// One technician-measured 4m x 3m room + one AI-imported 4m x 3m room.
// At 100 px/m, each polygon is 400 x 300 px = 12 m².
const blob = {
  scaleConfig: { pxPerMetre: 100 },
  objects: [
    {
      type: "polygon",
      points: rect(400, 300),
      data: { type: "room", label: "Living Room", provenance: "operator_measured" },
    },
    {
      type: "polygon",
      points: rect(400, 300),
      data: { type: "room", label: "Imported", provenance: "underlay_reference" },
    },
  ],
};

describe("provenance firewall (A0)", () => {
  it("measuredSketchData strips underlay_reference at the boundary (defense in depth)", () => {
    const out = measuredSketchData(blob);
    expect(out.objects).toHaveLength(1);
    expect(
      out.objects.every((o) => o.data?.provenance !== "underlay_reference"),
    ).toBe(true);
  });

  it("extractRooms self-filters underlay_reference even from a RAW (unsanitised) blob", () => {
    // The whole point of the A0 fix: the filter lives INSIDE the extractor, so
    // even a caller that forgets to sanitise cannot leak imported geometry.
    const rooms = extractRooms(blob as never);
    const total = rooms.reduce((a, r) => a + r.areaM2, 0);
    expect(rooms).toHaveLength(1);
    expect(total).toBeCloseTo(12, 1); // one 4m x 3m measured room only
  });

  it("extractSketchEstimate counts measured rooms only (no underlay double-count)", () => {
    const estimate = extractSketchEstimate([
      { floorLabel: "Ground Floor", sketchData: blob },
    ]);
    expect(estimate.totalRoomAreaM2).toBeCloseTo(12, 1);
  });

  it("decomposeElements preserves the underlay tag so persisted consumers can drop it", () => {
    const els = decomposeElements(blob);
    expect(
      els.filter((e) => e.provenance === "operator_measured"),
    ).toHaveLength(1);
    expect(
      els.filter((e) => e.provenance === "underlay_reference"),
    ).toHaveLength(1);
  });
});
