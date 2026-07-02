import { describe, it, expect } from "vitest";
import { computeUnderlayTransform } from "../underlay-transform";

describe("computeUnderlayTransform", () => {
  const base = {
    imageWidth: 1000,
    imageHeight: 500,
    canvasWidth: 800,
    canvasHeight: 600,
  };

  it("fits the image to canvas width at scale 1 (aspect locked), no offset", () => {
    const t = computeUnderlayTransform(base);
    // baseScale = canvasWidth / imageWidth = 0.8
    expect(t.scaleX).toBeCloseTo(0.8);
    expect(t.scaleY).toBeCloseTo(0.8);
    expect(t.left).toBe(0);
    expect(t.top).toBe(0);
  });

  it("multiplies the fit scale by the user scale factor", () => {
    const t = computeUnderlayTransform({ ...base, scale: 1.5 });
    expect(t.scaleX).toBeCloseTo(1.2);
    expect(t.scaleY).toBeCloseTo(1.2);
  });

  it("applies x/y offsets to left/top", () => {
    const t = computeUnderlayTransform({ ...base, offsetX: 120, offsetY: -40 });
    expect(t.left).toBe(120);
    expect(t.top).toBe(-40);
  });

  it("stretches to fill both dimensions when aspect is unlocked", () => {
    const t = computeUnderlayTransform({ ...base, lockAspect: false });
    // scaleX = 800/1000 = 0.8 ; scaleY = 600/500 = 1.2
    expect(t.scaleX).toBeCloseTo(0.8);
    expect(t.scaleY).toBeCloseTo(1.2);
  });

  it("guards against a zero/degenerate image size (no NaN/Infinity)", () => {
    const t = computeUnderlayTransform({ ...base, imageWidth: 0, imageHeight: 0 });
    expect(Number.isFinite(t.scaleX)).toBe(true);
    expect(Number.isFinite(t.scaleY)).toBe(true);
    expect(t.scaleX).toBeGreaterThan(0);
  });
});
