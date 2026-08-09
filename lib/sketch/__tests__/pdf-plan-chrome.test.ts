import { describe, expect, it } from "vitest";
import { northArrowGeometry, scaleBarLayout } from "../pdf-plan-chrome";

describe("northArrowGeometry", () => {
  it("points up from the origin with a labelled tip", () => {
    const g = northArrowGeometry({ x: 100, y: 50 }, 20);
    expect(g.tip.y).toBeGreaterThan(g.stemEnd.y);
    expect(g.tip.x).toBe(100);
    expect(g.label.text).toBe("N");
    expect(g.baseLeft.x).toBeLessThan(g.baseRight.x);
  });
});

describe("scaleBarLayout", () => {
  it("picks a clean metre length that fits the max width", () => {
    // 100 px/m, image 1000px drawn at 500pt → 50 pt/m → 2 m bar = 100 pt
    const bar = scaleBarLayout(100, 500, 1000, 120);
    expect(bar).not.toBeNull();
    expect(bar!.metres).toBe(2);
    expect(bar!.barLengthPt).toBeCloseTo(100);
    expect(bar!.label).toBe("2 m");
    expect(bar!.ticks).toEqual([0, 0.5, 1]);
  });

  it("returns null for degenerate inputs", () => {
    expect(scaleBarLayout(0, 500, 1000)).toBeNull();
    expect(scaleBarLayout(100, 0, 1000)).toBeNull();
  });

  it("honours a calibrated non-default scale", () => {
    // 50 px/m, image 500px at 250pt → 25 pt/m → 5 m = 125 > max 120 → 2 m = 50
    const bar = scaleBarLayout(50, 250, 500, 120);
    expect(bar!.metres).toBe(2);
    expect(bar!.barLengthPt).toBeCloseTo(50);
  });
});
