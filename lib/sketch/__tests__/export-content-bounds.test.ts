import { describe, it, expect } from "vitest";
import {
  computeExportContentBounds,
  fitSketchImageInBox,
  isExportCropObject,
  withExportCrop,
  EXPORT_REPORT_MULTIPLIER,
} from "../export-content-bounds";

describe("isExportCropObject", () => {
  it("excludes guides and opening handles", () => {
    expect(isExportCropObject({ data: { type: "guide" } })).toBe(false);
    expect(isExportCropObject({ data: { type: "opening-handle" } })).toBe(
      false,
    );
  });

  it("includes rooms, dims, damage, and walls", () => {
    expect(isExportCropObject({ data: { type: "room" } })).toBe(true);
    expect(isExportCropObject({ data: { type: "dim-label" } })).toBe(true);
    expect(isExportCropObject({ data: { type: "damage" } })).toBe(true);
    expect(isExportCropObject({ data: { type: "wall" } })).toBe(true);
  });

  it("excludes invisible objects", () => {
    expect(
      isExportCropObject({ data: { type: "room" }, visible: false }),
    ).toBe(false);
  });
});

describe("computeExportContentBounds", () => {
  it("returns null for an empty canvas", () => {
    expect(computeExportContentBounds([], 1200, 800)).toBeNull();
  });

  it("unions object AABBs with padding and clamps to canvas", () => {
    const bounds = computeExportContentBounds(
      [
        {
          data: { type: "room" },
          getBoundingRect: () => ({
            left: 100,
            top: 80,
            width: 200,
            height: 150,
          }),
        },
        {
          data: { type: "dim-label" },
          getBoundingRect: () => ({
            left: 90,
            top: 40,
            width: 40,
            height: 16,
          }),
        },
        {
          data: { type: "guide" },
          getBoundingRect: () => ({
            left: 0,
            top: 0,
            width: 1200,
            height: 800,
          }),
        },
      ],
      1200,
      800,
      20,
    );
    expect(bounds).toEqual({
      left: 70, // 90 - 20
      top: 20, // 40 - 20
      width: 250, // (100+200+20) - 70 = 250
      height: 230, // (80+150+20) - 20 = 230
    });
  });

  it("clamps padded bounds that would leave the canvas", () => {
    const bounds = computeExportContentBounds(
      [
        {
          data: { type: "room" },
          getBoundingRect: () => ({
            left: 2,
            top: 2,
            width: 10,
            height: 10,
          }),
        },
      ],
      100,
      100,
      48,
    );
    expect(bounds).toEqual({ left: 0, top: 0, width: 60, height: 60 });
  });
});

describe("withExportCrop", () => {
  it("defaults multiplier to report quality and merges crop rect", () => {
    expect(
      withExportCrop(undefined, {
        left: 10,
        top: 20,
        width: 300,
        height: 200,
      }),
    ).toEqual({
      format: "png",
      quality: undefined,
      multiplier: EXPORT_REPORT_MULTIPLIER,
      left: 10,
      top: 20,
      width: 300,
      height: 200,
    });
  });

  it("passes through without crop when bounds are null", () => {
    expect(withExportCrop({ multiplier: 2 }, null)).toEqual({
      format: "png",
      quality: undefined,
      multiplier: 2,
    });
  });
});

describe("fitSketchImageInBox", () => {
  it("preserves aspect ratio and may upscale to fill the box", () => {
    // Cropped 400×300 into 700×500 → scale by min(700/400, 500/300) = 1.666…
    const { drawW, drawH, scale } = fitSketchImageInBox(400, 300, 700, 500);
    expect(scale).toBeCloseTo(500 / 300);
    expect(drawW).toBeCloseTo(400 * (500 / 300));
    expect(drawH).toBeCloseTo(500);
  });

  it("downscales when the image is larger than the box", () => {
    const { drawW, drawH, scale } = fitSketchImageInBox(2000, 1000, 700, 400);
    expect(scale).toBeCloseTo(0.35);
    expect(drawW).toBeCloseTo(700);
    expect(drawH).toBeCloseTo(350);
  });

  it("returns zeros for invalid dimensions", () => {
    expect(fitSketchImageInBox(0, 100, 700, 400)).toEqual({
      drawW: 0,
      drawH: 0,
      scale: 0,
    });
  });
});
