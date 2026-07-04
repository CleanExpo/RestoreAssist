/**
 * RA-6990 regression pin: footprint dimensions must use ABSOLUTE (transform-
 * corrected) geometry, not fabric's raw local x1..y2 / points fields.
 *
 * Uses real fabric v7 Polygon/Line objects (they construct headless in Node),
 * moves/scales them, and asserts the recovered scene coordinates. A revert to
 * raw field reads returns the stale creation coordinates and fails every
 * assertion in the "after move" blocks — that is the exact bug that shipped.
 */

import { describe, it, expect } from "vitest";
import { Polygon, Line } from "fabric";
import {
  wallAbsoluteSegment,
  polygonAbsolutePoints,
  footprintAbsolutePoints,
} from "@/lib/sketch/fabric-absolute";

const square = () =>
  new Polygon(
    [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 180 },
      { x: 100, y: 180 },
    ],
    { strokeWidth: 0 },
  );

const wall = () => new Line([300, 50, 400, 90], { strokeWidth: 0 });

const expectPointsClose = (
  actual: { x: number; y: number }[],
  expected: { x: number; y: number }[],
) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((p, i) => {
    expect(p.x).toBeCloseTo(expected[i].x, 6);
    expect(p.y).toBeCloseTo(expected[i].y, 6);
  });
};

describe("polygonAbsolutePoints", () => {
  it("returns creation coordinates for an untransformed polygon", () => {
    expectPointsClose(polygonAbsolutePoints(square())!, [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 180 },
      { x: 100, y: 180 },
    ]);
  });

  it("recovers scene coordinates after move + scale (raw points would be stale)", () => {
    const poly = square();
    poly.set({ left: 150, top: 130, scaleX: 2, scaleY: 3 });
    poly.setCoords();

    // fabric keeps the local frame untouched — the raw read IS the bug
    expect(poly.points[0]).toEqual({ x: 100, y: 100 });

    expectPointsClose(polygonAbsolutePoints(poly)!, [
      { x: 50, y: 10 },
      { x: 250, y: 10 },
      { x: 250, y: 250 },
      { x: 50, y: 250 },
    ]);
  });

  it("passes plain point bags through unchanged and returns null without points", () => {
    const pts = [{ x: 1, y: 2 }];
    expect(polygonAbsolutePoints({ points: pts })).toBe(pts);
    expect(polygonAbsolutePoints({})).toBeNull();
  });
});

describe("wallAbsoluteSegment", () => {
  it("returns creation endpoints for an untransformed line", () => {
    const seg = wallAbsoluteSegment(wall())!;
    expectPointsClose([seg.a, seg.b], [
      { x: 300, y: 50 },
      { x: 400, y: 90 },
    ]);
  });

  it("recovers scene endpoints after a move (raw x1..y2 would be stale)", () => {
    const line = wall();
    line.set({ left: 320, top: 60 }); // centre-origin: moves centre (350,70) → (320,60)
    line.setCoords();

    // fabric keeps the local frame untouched — the raw read IS the bug
    expect(line.x1).toBe(300);
    expect(line.y1).toBe(50);

    const seg = wallAbsoluteSegment(line)!;
    expectPointsClose([seg.a, seg.b], [
      { x: 270, y: 40 },
      { x: 370, y: 80 },
    ]);
  });

  it("passes plain x1..y2 bags through and returns null for non-lines", () => {
    expect(wallAbsoluteSegment({ x1: 5, y1: 6, x2: 7, y2: 8 })).toEqual({
      a: { x: 5, y: 6 },
      b: { x: 7, y: 8 },
    });
    expect(wallAbsoluteSegment({})).toBeNull();
  });
});

describe("footprintAbsolutePoints", () => {
  it("collects transform-corrected polygon vertices + BOTH line endpoints, skipping decorations", () => {
    const poly = square();
    poly.set({ left: 150, top: 130, scaleX: 2, scaleY: 3 });
    poly.setCoords();
    (poly as unknown as { data?: unknown }).data = { type: "room" };

    const line = wall();
    line.set({ left: 320, top: 60 });
    line.setCoords();
    (line as unknown as { data?: unknown }).data = { type: "wall" };

    const decoration = { data: { type: "dim-label" }, points: [{ x: 9999, y: 9999 }] };
    const untagged = { x1: 9999, y1: 9999, x2: 9999, y2: 9999 }; // no data → skipped

    const pts = footprintAbsolutePoints([decoration, poly, untagged, line]);

    expectPointsClose(pts, [
      // room vertices (absolute)
      { x: 50, y: 10 },
      { x: 250, y: 10 },
      { x: 250, y: 250 },
      { x: 50, y: 250 },
      // wall endpoints (absolute) — a then b, both present
      { x: 270, y: 40 },
      { x: 370, y: 80 },
    ]);
  });
});
