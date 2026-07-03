import { describe, it, expect } from "vitest";
import {
  watermarkTilePositions,
  WATERMARK_TILE_PX,
} from "../underlay-watermark";

// RA-6847 [C1]: only the pure tiling math is unit-tested — the canvas draw
// (drawImage/rotate/fillText) needs a real 2D context and is exercised on-device.
describe("watermarkTilePositions", () => {
  it("over-scans by one tile on every side so rotated text fills the corners", () => {
    const pts = watermarkTilePositions(260, 260, 260);
    // x and y each run -260, 0, 260, 520 → 4 × 4 = 16 stamps.
    expect(pts).toHaveLength(16);
    expect(pts[0]).toEqual({ x: -260, y: -260 });
    expect(pts.at(-1)).toEqual({ x: 520, y: 520 });
  });

  it("covers a wide image beyond its right edge", () => {
    const pts = watermarkTilePositions(1000, 200, 260);
    const maxX = Math.max(...pts.map((p) => p.x));
    const maxY = Math.max(...pts.map((p) => p.y));
    expect(maxX).toBeGreaterThanOrEqual(1000);
    expect(maxY).toBeGreaterThanOrEqual(200);
  });

  it("returns an empty grid for non-positive dimensions", () => {
    expect(watermarkTilePositions(0, 100)).toEqual([]);
    expect(watermarkTilePositions(100, 0)).toEqual([]);
    expect(watermarkTilePositions(-10, -10)).toEqual([]);
  });

  it("returns an empty grid for a non-positive tile size", () => {
    expect(watermarkTilePositions(100, 100, 0)).toEqual([]);
  });

  it("defaults to WATERMARK_TILE_PX spacing", () => {
    const a = watermarkTilePositions(500, 500);
    const b = watermarkTilePositions(500, 500, WATERMARK_TILE_PX);
    expect(a).toEqual(b);
  });
});
