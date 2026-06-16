/**
 * RA-6761 — the provenance guard at the Fabric-blob boundary must keep
 * AI/underlay-imported geometry out of billed quantities. Proven both at the
 * pure-filter level and end-to-end through the estimate extractor.
 */
import { describe, expect, it } from "vitest";
import { measuredSketchData } from "../measured-sketch-data";
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor";

const rect = (w: number, h: number) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

describe("measuredSketchData", () => {
  it("drops underlay_reference objects, keeps operator_measured + untagged", () => {
    const blob = {
      objects: [
        {
          type: "polygon",
          data: { type: "room", provenance: "operator_measured" },
        },
        {
          type: "polygon",
          data: { type: "room", provenance: "underlay_reference" },
        },
        { type: "polygon", data: { type: "room" } }, // untagged → technician-drawn
      ],
    };
    const out = measuredSketchData(blob);
    expect(out.objects).toHaveLength(2);
    expect(
      out.objects.some((o) => o.data?.provenance === "underlay_reference"),
    ).toBe(false);
  });

  it("is null/shape safe", () => {
    expect(measuredSketchData(null)).toBeNull();
    expect(measuredSketchData(undefined)).toBeUndefined();
    expect(measuredSketchData({ scaleConfig: {} })).toEqual({
      scaleConfig: {},
    });
  });

  it("does not mutate the input", () => {
    const blob = {
      objects: [{ data: { provenance: "underlay_reference" } }],
    };
    measuredSketchData(blob);
    expect(blob.objects).toHaveLength(1); // original untouched
  });
});

describe("estimate extractor honours the provenance guard", () => {
  const floors = (sketchData: unknown) =>
    [
      {
        floorLabel: "Ground Floor",
        sketchData,
        equipmentPoints: null,
        moisturePoints: null,
      },
    ] as unknown as Parameters<typeof extractSketchEstimate>[0];

  const raw = {
    objects: [
      // technician-measured room: 300×400 px = 12 m² @ 100px/m
      {
        type: "polygon",
        points: rect(300, 400),
        data: { type: "room", label: "Living" },
      },
      // AI-imported room: 1000×1000 px = 100 m² — must NOT count
      {
        type: "polygon",
        points: rect(1000, 1000),
        data: {
          type: "room",
          label: "AI Room",
          provenance: "underlay_reference",
        },
      },
    ],
  };

  const areaItems = (e: ReturnType<typeof extractSketchEstimate>) =>
    e.lineItems.filter((li) => typeof li.areaM2 === "number");

  it("counts BOTH rooms without the guard (baseline)", () => {
    expect(areaItems(extractSketchEstimate(floors(raw)))).toHaveLength(2);
  });

  it("excludes the imported room once the guard is applied", () => {
    const guarded = areaItems(
      extractSketchEstimate(floors(measuredSketchData(raw))),
    );
    expect(guarded).toHaveLength(1);
    // only the 12 m² measured room survives — the 100 m² import is gone
    expect(guarded[0].areaM2).toBeCloseTo(12, 1);
  });
});
