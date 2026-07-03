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
