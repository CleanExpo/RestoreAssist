import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_SIDE_M,
  flipRoomPoints,
  lRoomPoints,
  rotateRoomPoints90,
  tRoomPoints,
} from "../room-defaults";
import { centroid } from "../geometry-utils";

describe("lRoomPoints", () => {
  it("produces a 6-vertex L polygon with expected AABB", () => {
    const pts = lRoomPoints({ x: 300, y: 300 }, DEFAULT_ROOM_SIDE_M, DEFAULT_ROOM_SIDE_M);
    expect(pts).toHaveLength(6);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(DEFAULT_ROOM_SIDE_M * 100);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(DEFAULT_ROOM_SIDE_M * 100);
    // Centroid near tap (L is not AABB-centered perfectly; stay within half side)
    const c = centroid(pts);
    expect(Math.abs(c.x - 300)).toBeLessThan(DEFAULT_ROOM_SIDE_M * 50);
    expect(Math.abs(c.y - 300)).toBeLessThan(DEFAULT_ROOM_SIDE_M * 50);
  });
});

describe("tRoomPoints", () => {
  it("produces an 8-vertex T polygon", () => {
    const pts = tRoomPoints({ x: 400, y: 400 }, 4, 4);
    expect(pts).toHaveLength(8);
  });
});

describe("flipRoomPoints / rotateRoomPoints90", () => {
  it("flips horizontally around centroid", () => {
    const pts = lRoomPoints({ x: 200, y: 200 }, 4, 3);
    const flipped = flipRoomPoints(pts, "h");
    const c0 = centroid(pts);
    const c1 = centroid(flipped);
    expect(c1.x).toBeCloseTo(c0.x);
    expect(c1.y).toBeCloseTo(c0.y);
    // Leftmost becomes rightmost relative to centroid
    const left0 = Math.min(...pts.map((p) => p.x));
    const right1 = Math.max(...flipped.map((p) => p.x));
    expect(right1 - c1.x).toBeCloseTo(c0.x - left0);
  });

  it("rotates 90° around centroid preserving vertex count", () => {
    const pts = tRoomPoints({ x: 100, y: 100 }, 3, 3);
    const rotated = rotateRoomPoints90(pts, 1);
    expect(rotated).toHaveLength(pts.length);
    const c0 = centroid(pts);
    const c1 = centroid(rotated);
    expect(c1.x).toBeCloseTo(c0.x);
    expect(c1.y).toBeCloseTo(c0.y);
  });
});
