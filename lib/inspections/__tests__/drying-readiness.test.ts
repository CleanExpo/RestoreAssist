import { describe, it, expect } from "vitest";
import { assessDryingReadiness } from "../drying-readiness";

describe("assessDryingReadiness", () => {
  it("not ready when there are no readings", () => {
    const r = assessDryingReadiness([]);
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain("no moisture readings recorded");
  });

  it("not ready when readings exist but no baseline (drying can't be validated)", () => {
    const r = assessDryingReadiness([
      { surfaceType: "drywall", moistureLevel: 0.5 }, // dry, but no baseline
    ]);
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => b.includes("dry-standard reference"))).toBe(true);
  });

  it("not ready when a material is still above its dry standard", () => {
    const r = assessDryingReadiness([
      { surfaceType: "drywall", moistureLevel: 0.5, isBaseline: true },
      { surfaceType: "drywall", moistureLevel: 22, location: "Bathroom" },
    ]);
    expect(r.ready).toBe(false);
    expect(r.wetCount).toBe(1);
    expect(r.wet[0].location).toBe("Bathroom");
    expect(r.blockers.some((b) => b.includes("above the dry standard"))).toBe(true);
  });

  it("ready when a baseline exists and every assessable reading is dry", () => {
    const r = assessDryingReadiness([
      { surfaceType: "drywall", moistureLevel: 0.4, isBaseline: true },
      { surfaceType: "drywall", moistureLevel: 0.8, location: "Bathroom" },
      { surfaceType: "timber", moistureLevel: 14, location: "Subfloor" },
    ]);
    expect(r.ready).toBe(true);
    expect(r.wetCount).toBe(0);
    expect(r.hasBaseline).toBe(true);
    expect(r.totalAssessed).toBe(3);
  });

  it("ignores unknown-surface / non-MC readings in the assessable count but still needs a baseline", () => {
    const r = assessDryingReadiness([
      { surfaceType: "spaceship hull", moistureLevel: 99 }, // unknown → not counted
      { surfaceType: "drywall", moistureLevel: 60, unit: "RH" }, // RH → not counted
    ]);
    expect(r.totalAssessed).toBe(0);
    expect(r.wetCount).toBe(0);
    expect(r.ready).toBe(false); // no baseline
  });
});
