import { describe, expect, it } from "vitest";
import { decomposeElements } from "../decompose-elements";
import {
  measuredElements,
  totalMeasuredFloorAreaM2,
} from "../measured-elements";

// 3m x 4m room as a polygon at 100px/m, plus a wall line and a non-canonical label.
const SKETCH_DATA = {
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
      data: { type: "room", material: "carpet" },
    },
    {
      type: "rect",
      left: 0,
      top: 0,
      width: 500,
      height: 20,
      data: { type: "wall", material: "fibro" },
    },
    { type: "i-text", text: "Living Room", data: {} }, // skipped (no canonical type)
  ],
};

describe("decomposeElements", () => {
  it("decomposes only canonical-typed objects into element inputs", () => {
    const els = decomposeElements(SKETCH_DATA);
    expect(els).toHaveLength(2);
    expect(els.map((e) => e.type).sort()).toEqual(["room", "wall"]);
  });

  it("converts polygon area to square metres via the sketch scale", () => {
    const room = decomposeElements(SKETCH_DATA).find((e) => e.type === "room")!;
    expect(room.dimensionsM?.areaM2).toBeCloseTo(12, 5);
    expect(room.materialSlug).toBe("carpet");
  });

  it("converts rect width/height to metres", () => {
    const wall = decomposeElements(SKETCH_DATA).find((e) => e.type === "wall")!;
    expect(wall.dimensionsM?.widthM).toBeCloseTo(5, 5);
    expect(wall.dimensionsM?.heightM).toBeCloseTo(0.2, 5);
  });

  it("tags Phase 1 elements operator_measured by default", () => {
    expect(
      decomposeElements(SKETCH_DATA).every(
        (e) => e.provenance === "operator_measured",
      ),
    ).toBe(true);
  });

  it("honours an explicit provenance (e.g. underlay import)", () => {
    const els = decomposeElements(SKETCH_DATA, {
      provenance: "underlay_reference",
    });
    expect(els.every((e) => e.provenance === "underlay_reference")).toBe(true);
  });

  it("falls back to a default scale when none is set, and an override wins", () => {
    const noScale = { objects: SKETCH_DATA.objects };
    const room = decomposeElements(noScale, { pxPerMetre: 200 }).find(
      (e) => e.type === "room",
    )!;
    // 300x400 px at 200px/m = 1.5m x 2m = 3 m²
    expect(room.dimensionsM?.areaM2).toBeCloseTo(3, 5);
  });

  it("returns [] for empty/missing sketch data", () => {
    expect(decomposeElements({})).toEqual([]);
    expect(decomposeElements({ objects: [] })).toEqual([]);
  });
});

describe("provenance guard (measured-elements)", () => {
  const mixed = [
    {
      provenance: "operator_measured",
      type: "room",
      dimensionsM: { areaM2: 12 },
    },
    {
      provenance: "underlay_reference",
      type: "room",
      dimensionsM: { areaM2: 99 },
    },
    {
      provenance: "operator_measured",
      type: "wall",
      dimensionsM: { areaM2: 0 },
    },
  ];

  it("excludes underlay_reference rows from compliance calcs", () => {
    const measured = measuredElements(mixed);
    expect(measured).toHaveLength(2);
    expect(measured.every((e) => e.provenance === "operator_measured")).toBe(
      true,
    );
  });

  it("sums floor area only from operator_measured rooms", () => {
    // underlay room (99) must be excluded; only the 12 m² measured room counts
    expect(totalMeasuredFloorAreaM2(mixed)).toBeCloseTo(12, 5);
  });
});

describe("RA-6760 — imported geometry provenance flows decompose → measured", () => {
  const sq = (n: number) => [
    { x: 0, y: 0 },
    { x: n, y: 0 },
    { x: n, y: n },
    { x: 0, y: n },
  ];

  it("preserves underlay_reference and excludes it from measured totals", () => {
    const data = {
      scaleConfig: { pxPerMetre: 100 },
      objects: [
        {
          type: "polygon",
          points: sq(300),
          data: { type: "room", provenance: "underlay_reference" as const },
        },
        {
          type: "polygon",
          points: sq(100),
          data: { type: "room", provenance: "operator_measured" as const },
        },
      ],
    };
    const decomposed = decomposeElements(data);
    expect(decomposed).toHaveLength(2); // both decompose (geometry persists)
    const measured = measuredElements(decomposed);
    expect(measured).toHaveLength(1); // only the operator-measured room counts
    expect(measured[0].provenance).toBe("operator_measured");
  });

  it("a confirmed (promoted) element becomes measured", () => {
    const data = {
      objects: [
        {
          type: "polygon",
          points: sq(300),
          // After "Confirm measurement" the object's provenance is measured.
          data: { type: "room", provenance: "operator_measured" as const },
        },
      ],
    };
    expect(measuredElements(decomposeElements(data))).toHaveLength(1);
  });
});
