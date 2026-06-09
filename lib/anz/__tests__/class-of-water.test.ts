import { describe, expect, it } from "vitest";
import { classifyWater } from "../class-of-water";

describe("S500 class of water (evaporation load)", () => {
  it("Class 1 — minimal water, low evaporation load", () => {
    const r = classifyWater({ affectedAreaFraction: 0.1 });
    expect(r.waterClass).toBe(1);
    expect(r.label.length).toBeGreaterThan(0);
    expect(r.dryingImplication.length).toBeGreaterThan(0);
  });

  it("Class 2 — whole room affected, low wicking", () => {
    expect(classifyWater({ affectedAreaFraction: 0.6 }).waterClass).toBe(2);
    expect(classifyWater({ wickHeightMm: 300 }).waterClass).toBe(2);
  });

  it("Class 3 — water from overhead or high wicking", () => {
    expect(classifyWater({ waterFromOverhead: true }).waterClass).toBe(3);
    expect(classifyWater({ wickHeightMm: 900 }).waterClass).toBe(3);
  });

  it("Class 4 — specialty drying overrides everything", () => {
    expect(
      classifyWater({ lowPermeanceMaterialsSaturated: true }).waterClass,
    ).toBe(4);
    expect(
      classifyWater({
        waterFromOverhead: true,
        lowPermeanceMaterialsSaturated: true,
      }).waterClass,
    ).toBe(4);
  });

  it("empty assessment defaults to the lowest class", () => {
    expect(classifyWater({}).waterClass).toBe(1);
  });
});
