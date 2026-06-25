/**
 * RA-6759 — unit tests for the Sketch tool-object factory. Fabric-free, so the
 * geometry/units/data contract is verified deterministically in jsdom.
 */
import { describe, expect, it } from "vitest";
import {
  describeToolObject,
  pxToMetres,
  metresToPx,
  formatMetres,
  distancePx,
  DEFAULT_PX_PER_METRE,
  WALL_THICKNESS_INTERNAL_M,
} from "../tool-objects";

describe("describeToolObject — data.type contract", () => {
  it("room → polygon with type=room, operator_measured provenance", () => {
    const d = describeToolObject({
      tool: "room",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    });
    expect(d?.kind).toBe("polygon");
    expect(d?.data.type).toBe("room");
    expect(d?.data.provenance).toBe("operator_measured");
  });

  it("line → wall element with measured provenance and lengthM", () => {
    const d = describeToolObject({
      tool: "line",
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
    });
    expect(d?.kind).toBe("line");
    expect(d?.data.type).toBe("wall");
    expect(d?.data.provenance).toBe("operator_measured");
    expect(d?.data.lengthM).toBe(3); // 300px / 100px-per-m
  });

  it("measure → annotation (not a canonical element) with metre label", () => {
    const d = describeToolObject({
      tool: "measure",
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 250 },
      ],
    });
    expect(d?.data.type).toBe("measure");
    expect(d?.data.lengthM).toBe(2.5);
    expect(d?.label?.text).toBe("2.50 m");
    expect(d?.label?.left).toBe(0);
    expect(d?.label?.top).toBe(125); // midpoint
  });

  it("measure honours a custom pxPerMetre scale", () => {
    const d = describeToolObject({
      tool: "measure",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      pxPerMetre: 50, // 50px = 1m → 100px = 2m
    });
    expect(d?.data.lengthM).toBe(2);
  });

  it("text → itext annotation with placeholder", () => {
    const d = describeToolObject({ tool: "text", points: [{ x: 10, y: 20 }] });
    expect(d?.kind).toBe("itext");
    expect(d?.data.type).toBe("text");
    expect(d?.props.text).toBe("Label");
  });

  it("arrow → arrow annotation with angle", () => {
    const d = describeToolObject({
      tool: "arrow",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    });
    expect(d?.data.type).toBe("arrow");
    expect(d?.data.angle).toBe(45);
  });

  it("photo → photo-marker annotation", () => {
    const d = describeToolObject({ tool: "photo", points: [{ x: 5, y: 5 }] });
    expect(d?.kind).toBe("photo-marker");
    expect(d?.data.type).toBe("photo");
  });
});

describe("describeToolObject — RA-6840 wall thickness (presentation only)", () => {
  const SQUARE = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it("room renders a mitred wall band at internal thickness", () => {
    const d = describeToolObject({ tool: "room", points: SQUARE });
    expect(d?.props.strokeWidth).toBe(
      metresToPx(WALL_THICKNESS_INTERNAL_M), // 0.11m × 100px = 11px
    );
    expect(d?.props.strokeLineJoin).toBe("miter");
  });

  it("room thickness scales with pxPerMetre, leaving centerline points intact", () => {
    const d = describeToolObject({
      tool: "room",
      points: SQUARE,
      pxPerMetre: 50, // 0.11m × 50px = 5.5px band
    });
    expect(d?.props.strokeWidth).toBe(5.5);
    // The measured centerline geometry is untouched — area calc is unaffected.
    expect(d?.props.points).toEqual(SQUARE);
  });

  it("wall tool renders with thickness, endpoints unchanged", () => {
    const d = describeToolObject({
      tool: "line",
      points: [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
    });
    expect(d?.props.strokeWidth).toBe(metresToPx(WALL_THICKNESS_INTERNAL_M));
    expect(d?.props.strokeLineCap).toBe("square");
    expect(d?.props.x1).toBe(0);
    expect(d?.props.x2).toBe(300);
    expect(d?.data.lengthM).toBe(3); // unchanged by presentation
  });
});

describe("describeToolObject — guards", () => {
  it("returns null for a room with < 3 vertices", () => {
    expect(
      describeToolObject({ tool: "room", points: [{ x: 0, y: 0 }] }),
    ).toBeNull();
  });

  it("returns null for line/measure/arrow with < 2 points", () => {
    for (const tool of ["line", "measure", "arrow"] as const) {
      expect(describeToolObject({ tool, points: [{ x: 0, y: 0 }] })).toBeNull();
    }
  });

  it("returns null for natively-handled tools (select/freehand/pan)", () => {
    for (const tool of ["select", "freehand", "pan"] as const) {
      expect(
        describeToolObject({
          tool,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        }),
      ).toBeNull();
    }
  });
});

describe("geometry helpers", () => {
  it("distancePx is euclidean", () => {
    expect(distancePx({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("pxToMetres uses the default scale and tolerates 0", () => {
    expect(pxToMetres(100)).toBe(1);
    expect(pxToMetres(100, 0)).toBe(100 / DEFAULT_PX_PER_METRE);
  });

  it("formatMetres prints two decimals", () => {
    expect(formatMetres(2.5)).toBe("2.50 m");
  });
});
