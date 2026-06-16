/**
 * RA-6763 — moisture-pin coordinates must stay anchored under canvas resize/zoom.
 */
import { describe, expect, it } from "vitest";
import { toNormalized, pinPixelPosition } from "../pin-coords";

describe("toNormalized", () => {
  it("converts absolute pixels to 0..1 fractions", () => {
    expect(toNormalized(300, 200, 1200, 800)).toEqual({ nx: 0.25, ny: 0.25 });
  });

  it("clamps out-of-bounds and tolerates zero dimensions", () => {
    expect(toNormalized(2400, -10, 1200, 800)).toEqual({ nx: 1, ny: 0 });
    expect(toNormalized(50, 50, 0, 0)).toEqual({ nx: 1, ny: 1 }); // clamped, no NaN
  });
});

describe("pinPixelPosition", () => {
  it("renders from normalized coords (stable across canvas sizes)", () => {
    const pin = { x: 300, y: 200, nx: 0.25, ny: 0.25 };
    // same pin, two different rendered sizes → proportional positions
    expect(pinPixelPosition(pin, 1200, 800)).toEqual({ left: 300, top: 200 });
    expect(pinPixelPosition(pin, 600, 400)).toEqual({ left: 150, top: 100 });
  });

  it("falls back to legacy absolute coords when not normalized", () => {
    const legacy = { x: 300, y: 200 };
    // legacy pins ignore canvas size (the old drift behaviour, preserved as fallback)
    expect(pinPixelPosition(legacy, 600, 400)).toEqual({ left: 300, top: 200 });
  });

  it("round-trips: normalize then position reproduces the point at the same size", () => {
    const { nx, ny } = toNormalized(420, 360, 1200, 800);
    const pos = pinPixelPosition({ x: 0, y: 0, nx, ny }, 1200, 800);
    expect(pos.left).toBeCloseTo(420, 6);
    expect(pos.top).toBeCloseTo(360, 6);
  });
});
