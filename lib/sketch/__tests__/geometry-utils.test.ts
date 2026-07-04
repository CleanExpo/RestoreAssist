import { describe, expect, it } from "vitest";
import {
  centroid,
  distance,
  formatMetres,
  px2ToM2,
  shoelaceAreaPx2,
  snapAngleDeg,
  snapToGrid,
  snapPointToGrid,
  snapSegmentEnd,
  formatDimension,
  segmentLabelPosition,
  footprintDimensions,
  snapToNearbyEndpoint,
  alignmentGuidesFor,
} from "../geometry-utils";

describe("geometry-utils — distance", () => {
  it("returns 0 for the same point", () => {
    expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it("returns the correct length for a 3-4-5 triangle", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("is symmetric — distance(a, b) === distance(b, a)", () => {
    const a = { x: -2, y: 7.5 };
    const b = { x: 11, y: -3 };
    expect(distance(a, b)).toBeCloseTo(distance(b, a));
  });
});

describe("geometry-utils — formatMetres", () => {
  it("converts 100 px to '1.00 m' at the default scale", () => {
    expect(formatMetres(100)).toBe("1.00 m");
  });

  it("rounds to two decimals", () => {
    expect(formatMetres(123)).toBe("1.23 m");
    expect(formatMetres(125.49)).toBe("1.25 m");
    // Number.prototype.toFixed uses banker's-style rounding internally —
    // 1.255 → "1.25" not "1.26". Pin behaviour here so future scale changes
    // don't silently shift it.
    expect(formatMetres(125.5)).toBe("1.25 m");
  });

  it("respects a custom pxPerMetre scale", () => {
    expect(formatMetres(100, 50)).toBe("2.00 m");
    expect(formatMetres(100, 200)).toBe("0.50 m");
  });
});

describe("geometry-utils — shoelaceAreaPx2", () => {
  it("returns 0 for fewer than 3 points", () => {
    expect(shoelaceAreaPx2([])).toBe(0);
    expect(shoelaceAreaPx2([{ x: 0, y: 0 }])).toBe(0);
  });

  it("returns the correct area for a unit square", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(shoelaceAreaPx2(sq)).toBe(1);
  });

  it("returns the correct area for a right triangle", () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    ];
    expect(shoelaceAreaPx2(tri)).toBe(6);
  });

  it("ignores winding direction (always returns positive)", () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 0, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 0 },
    ];
    const ccw = [...cw].reverse();
    expect(shoelaceAreaPx2(cw)).toBe(shoelaceAreaPx2(ccw));
  });
});

describe("geometry-utils — px2ToM2", () => {
  it("converts pixel² to m² at default scale (100 px/m)", () => {
    expect(px2ToM2(10000)).toBe(1); // 100*100 px² = 1 m²
  });

  it("respects a custom pxPerMetre scale", () => {
    expect(px2ToM2(2500, 50)).toBe(1); // 50*50 px² = 1 m²
  });
});

describe("geometry-utils — centroid", () => {
  it("returns the average x/y of all points", () => {
    expect(
      centroid([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ]),
    ).toEqual({ x: 2, y: 2 });
  });
});

describe("geometry-utils — snapToGrid", () => {
  it("snaps to the nearest grid multiple", () => {
    expect(snapToGrid(11, 10)).toBe(10);
    expect(snapToGrid(15, 10)).toBe(20); // .5 rounds up
    expect(snapToGrid(-7, 10)).toBe(-10);
  });
});

describe("geometry-utils — snapAngleDeg", () => {
  it("snaps to 45° by default", () => {
    expect(snapAngleDeg(20)).toBe(0);
    expect(snapAngleDeg(40)).toBe(45);
    expect(snapAngleDeg(89)).toBe(90);
  });

  it("respects a custom snap interval", () => {
    expect(snapAngleDeg(40, 90)).toBe(0);
    expect(snapAngleDeg(50, 90)).toBe(90);
  });
});

// RA-6844 [A5]: grid + right-angle snap for the draw path.
describe("geometry-utils — snapPointToGrid", () => {
  it("snaps both axes to the nearest grid multiple", () => {
    expect(snapPointToGrid({ x: 23, y: 48 }, 25)).toEqual({ x: 25, y: 50 });
  });

  it("is a no-op when the grid is disabled (<= 0)", () => {
    const p = { x: 23, y: 48 };
    expect(snapPointToGrid(p, 0)).toBe(p);
    expect(snapPointToGrid(p, -10)).toBe(p);
  });
});

describe("geometry-utils — snapSegmentEnd", () => {
  const start = { x: 100, y: 100 };

  it("squares a near-horizontal drag onto the axis, preserving length", () => {
    // 300px right, 12px up → locks to a clean horizontal wall.
    const end = snapSegmentEnd(start, { x: 400, y: 88 }, 0, 45);
    expect(end.x).toBeCloseTo(400.24, 1); // 100 + hypot(300,12) ≈ 300.24 along 0°
    expect(end.y).toBeCloseTo(100, 5);
  });

  it("locks a near-45° drag onto the diagonal", () => {
    const end = snapSegmentEnd(start, { x: 200, y: 210 }, 0, 45);
    // equal dx/dy after the lock → a true 45° ray
    expect(end.x - start.x).toBeCloseTo(end.y - start.y, 5);
  });

  it("grid-snaps the endpoint after the angle lock", () => {
    const end = snapSegmentEnd(start, { x: 218, y: 103 }, 25, 45);
    expect(end.x % 25).toBe(0);
    expect(end.y % 25).toBe(0);
  });

  it("skips the angle lock when angleStep >= 360 (grid only)", () => {
    const end = snapSegmentEnd(start, { x: 218, y: 103 }, 25, 360);
    expect(end).toEqual({ x: 225, y: 100 });
  });
});

// RA-6842 [A3]: auto dimension strings — per-wall + overall footprint.
describe("geometry-utils — formatDimension", () => {
  it("formats px to metres at the default scale", () => {
    expect(formatDimension(100)).toBe("1.00 m");
    expect(formatDimension(470)).toBe("4.70 m");
  });

  it("respects a custom pxPerMetre scale", () => {
    expect(formatDimension(100, 50)).toBe("2.00 m");
    expect(formatDimension(100, 200)).toBe("0.50 m");
  });

  it("renders imperial feet-and-inches when useImperial=true", () => {
    // 100px / 100pxPerM = 1m = 3.28084ft → 3'-3"
    expect(formatDimension(100, 100, true)).toBe("3'-3\"");
    // 0px → 0'-0"
    expect(formatDimension(0, 100, true)).toBe("0'-0\"");
  });

  it("metric is the default (useImperial defaults to false)", () => {
    expect(formatDimension(300)).toBe("3.00 m");
  });
});

describe("geometry-utils — segmentLabelPosition", () => {
  it("places the midpoint halfway between the two endpoints", () => {
    const { mid } = segmentLabelPosition({ x: 0, y: 0 }, { x: 200, y: 0 });
    expect(mid).toEqual({ x: 100, y: 0 });
  });

  it("offsets perpendicular to a horizontal segment", () => {
    // Segment pointing right (dx=200, dy=0): perp CCW = (0, +1) → below (+y)
    const { labelPos } = segmentLabelPosition(
      { x: 0, y: 100 },
      { x: 200, y: 100 },
      20,
    );
    expect(labelPos.x).toBeCloseTo(100, 5);
    expect(labelPos.y).toBeCloseTo(120, 5); // 100 + 20
  });

  it("offsets perpendicular to a vertical segment", () => {
    // Segment pointing down (dx=0, dy=200): perp CCW = (-1, 0) → left (-x)
    const { labelPos } = segmentLabelPosition(
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      20,
    );
    expect(labelPos.x).toBeCloseTo(80, 5); // 100 - 20
    expect(labelPos.y).toBeCloseTo(100, 5);
  });

  it("is a no-op on a degenerate (zero-length) segment", () => {
    const p = { x: 50, y: 50 };
    const { mid, labelPos } = segmentLabelPosition(p, p, 20);
    expect(mid).toEqual(p);
    expect(labelPos).toEqual(p);
  });
});

describe("geometry-utils — footprintDimensions", () => {
  const SQUARE = [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 250 },
    { x: 100, y: 250 },
  ];

  it("computes the correct bounding box", () => {
    const r = footprintDimensions(SQUARE);
    expect(r.minX).toBe(100);
    expect(r.minY).toBe(100);
    expect(r.maxX).toBe(300);
    expect(r.maxY).toBe(250);
    expect(r.widthPx).toBe(200);
    expect(r.heightPx).toBe(150);
  });

  it("places the top dimension line above the plan by the margin", () => {
    const r = footprintDimensions(SQUARE, 30);
    // topTick y = minY - margin = 100 - 30 = 70
    expect(r.topTick[0].y).toBe(70);
    expect(r.topTick[1].y).toBe(70);
    // topTick x spans minX to maxX
    expect(r.topTick[0].x).toBe(100);
    expect(r.topTick[1].x).toBe(300);
  });

  it("places the left dimension line left of the plan by the margin", () => {
    const r = footprintDimensions(SQUARE, 30);
    // leftTick x = minX - margin = 100 - 30 = 70
    expect(r.leftTick[0].x).toBe(70);
    expect(r.leftTick[1].x).toBe(70);
    // leftTick y spans minY to maxY
    expect(r.leftTick[0].y).toBe(100);
    expect(r.leftTick[1].y).toBe(250);
  });

  it("centers the width label above the dimension line", () => {
    const r = footprintDimensions(SQUARE, 30);
    expect(r.widthLabelPos.x).toBe(200); // (100+300)/2
    expect(r.widthLabelPos.y).toBe(58);  // dimY(70) - 12
  });

  it("centers the height label left of the dimension line", () => {
    const r = footprintDimensions(SQUARE, 30);
    expect(r.heightLabelPos.x).toBe(58);  // dimX(70) - 12
    expect(r.heightLabelPos.y).toBe(175); // (100+250)/2
  });

  it("handles an empty points array gracefully", () => {
    const r = footprintDimensions([]);
    expect(r.widthPx).toBe(0);
    expect(r.heightPx).toBe(0);
  });
});

// ─── RA-6969 [A5b] — endpoint-proximity snap ───────────────────────────────

describe("geometry-utils — snapToNearbyEndpoint", () => {
  const endpoints = [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 250 },
  ];

  it("snaps exactly onto an endpoint within the threshold", () => {
    const r = snapToNearbyEndpoint({ x: 104, y: 97 }, endpoints, 12);
    expect(r.snapped).toBe(true);
    expect(r.point).toEqual({ x: 100, y: 100 });
  });

  it("returns the original point untouched when nothing is within threshold", () => {
    const p = { x: 200, y: 200 };
    const r = snapToNearbyEndpoint(p, endpoints, 12);
    expect(r.snapped).toBe(false);
    expect(r.point).toEqual(p);
  });

  it("picks the nearest endpoint when several are within threshold", () => {
    const near = [
      { x: 100, y: 100 },
      { x: 108, y: 100 },
    ];
    const r = snapToNearbyEndpoint({ x: 106, y: 100 }, near, 20);
    expect(r.point).toEqual({ x: 108, y: 100 });
  });

  it("is a no-op for a non-positive threshold or empty list", () => {
    const p = { x: 100, y: 100 };
    expect(snapToNearbyEndpoint(p, endpoints, 0).snapped).toBe(false);
    expect(snapToNearbyEndpoint(p, [], 12).snapped).toBe(false);
  });
});

describe("geometry-utils — alignmentGuidesFor", () => {
  const endpoints = [
    { x: 100, y: 100 },
    { x: 300, y: 250 },
  ];

  it("emits a vertical guide when x aligns with an existing endpoint", () => {
    const guides = alignmentGuidesFor({ x: 103, y: 400 }, endpoints, 8);
    expect(guides).toContainEqual({ type: "v", coord: 100 });
  });

  it("emits a horizontal guide when y aligns with an existing endpoint", () => {
    const guides = alignmentGuidesFor({ x: 500, y: 252 }, endpoints, 8);
    expect(guides).toContainEqual({ type: "h", coord: 250 });
  });

  it("emits both axes when the point aligns to a corner on both", () => {
    const guides = alignmentGuidesFor({ x: 102, y: 98 }, endpoints, 8);
    expect(guides).toContainEqual({ type: "v", coord: 100 });
    expect(guides).toContainEqual({ type: "h", coord: 100 });
  });

  it("emits nothing when no endpoint axis is within threshold", () => {
    expect(alignmentGuidesFor({ x: 500, y: 500 }, endpoints, 8)).toEqual([]);
  });

  it("is a no-op for a non-positive threshold", () => {
    expect(alignmentGuidesFor({ x: 100, y: 100 }, endpoints, 0)).toEqual([]);
  });
});
