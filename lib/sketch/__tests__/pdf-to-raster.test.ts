import { describe, it, expect } from "vitest";
import {
  computeRasterScale,
  UNDERLAY_RASTER_TARGET_WIDTH,
} from "../pdf-to-raster";

// RA-6849 [C3]: only the pure scale math is unit-tested here — the actual
// pdfjs render path needs a DOM + worker and is exercised on-device / in CI.
describe("computeRasterScale", () => {
  it("scales a narrow page up toward the target width", () => {
    // 800px natural → target 1600 wants 2x, within the [0.5, 4] clamp.
    expect(computeRasterScale(800, 1600)).toBe(2);
  });

  it("scales a wide page down toward the target width", () => {
    // 3200px natural → target 1600 wants 0.5x (at the min-scale floor).
    expect(computeRasterScale(3200, 1600)).toBe(0.5);
  });

  it("clamps to MAX_SCALE for a tiny page", () => {
    // 100px natural → raw 16x, clamped to 4.
    expect(computeRasterScale(100, 1600)).toBe(4);
  });

  it("clamps to MIN_SCALE for a huge page", () => {
    // 10000px natural → raw 0.16x, clamped to 0.5.
    expect(computeRasterScale(10000, 1600)).toBe(0.5);
  });

  it("returns 1 for a non-positive page width", () => {
    expect(computeRasterScale(0)).toBe(1);
    expect(computeRasterScale(-100)).toBe(1);
    expect(computeRasterScale(Number.NaN)).toBe(1);
  });

  it("defaults to UNDERLAY_RASTER_TARGET_WIDTH", () => {
    // At exactly the default target width, scale is 1 (no resample needed).
    expect(computeRasterScale(UNDERLAY_RASTER_TARGET_WIDTH)).toBe(1);
  });
});
