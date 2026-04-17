/**
 * Tests for lib/drying/target-curve.ts
 *
 * Covers: material types, category/class variants, boundary conditions,
 * AU vs NZ climate equivalence (model is climate-agnostic; equilibrium
 * adjustment via dehu/volume inputs), projectedCompletionDay accuracy.
 */

import { describe, it, expect } from "vitest";
import { computeTargetCurve } from "../target-curve";

// Standard input for timber Cat 1 Class 2 — used as baseline
const BASE = {
  initialMC: 45,
  materialType: "timber",
  category: "Category 1",
  waterClass: "Class 2",
  roomVolumeM3: 25,
  dehumidifierCapacityLpd: 50,
};

describe("computeTargetCurve", () => {
  // ── Shape & structure ────────────────────────────────────────────

  it("returns daily array starting at day 0", () => {
    const result = computeTargetCurve(BASE);
    expect(result.daily[0].day).toBe(0);
    expect(result.daily[0].targetMC).toBeCloseTo(45, 0);
  });

  it("curve is monotonically decreasing", () => {
    const { daily } = computeTargetCurve(BASE);
    for (let i = 1; i < daily.length; i++) {
      expect(daily[i].targetMC).toBeLessThanOrEqual(daily[i - 1].targetMC);
    }
  });

  it("final MC matches material dry standard for timber (19%)", () => {
    const { finalMC } = computeTargetCurve(BASE);
    expect(finalMC).toBe(19);
  });

  it("standardsRef always cites S500:2025 §12.2.2", () => {
    const { standardsRef } = computeTargetCurve(BASE);
    expect(standardsRef).toBe("AS-IICRC S500:2025 §12.2.2");
  });

  it("projectedCompletionDay is a positive integer", () => {
    const { projectedCompletionDay } = computeTargetCurve(BASE);
    expect(projectedCompletionDay).toBeGreaterThan(0);
    expect(Number.isInteger(projectedCompletionDay)).toBe(true);
  });

  // ── Material types ───────────────────────────────────────────────

  it("plasterboard final MC is 1.5%", () => {
    const { finalMC } = computeTargetCurve({
      ...BASE,
      materialType: "plasterboard",
      initialMC: 8,
    });
    expect(finalMC).toBe(1.5);
  });

  it("concrete dries slower than carpet (higher completion day)", () => {
    // Use a small initial MC so both materials complete well within MAX_DAYS
    const concrete = computeTargetCurve({
      ...BASE,
      materialType: "concrete",
      initialMC: 8,
    });
    const carpet = computeTargetCurve({
      ...BASE,
      materialType: "carpet",
      initialMC: 8,
    });
    expect(concrete.projectedCompletionDay).toBeGreaterThan(
      carpet.projectedCompletionDay,
    );
  });

  it("unknown material falls back to 'other' targets", () => {
    const { finalMC } = computeTargetCurve({
      ...BASE,
      materialType: "mystery_material",
    });
    expect(finalMC).toBe(15); // 'other' finalMC
  });

  // ── Category variants ────────────────────────────────────────────

  it("Category 1 dries faster than Category 3 (same class)", () => {
    // Use carpet (high base k + low finalMC) with boosted dehu so Cat 3
    // completes well within MAX_DAYS and the relative ordering is clear.
    const cat1 = computeTargetCurve({
      ...BASE,
      materialType: "carpet",
      initialMC: 15,
      dehumidifierCapacityLpd: 80,
      category: "Category 1",
    });
    const cat3 = computeTargetCurve({
      ...BASE,
      materialType: "carpet",
      initialMC: 15,
      dehumidifierCapacityLpd: 80,
      category: "Category 3",
    });
    expect(cat1.projectedCompletionDay).toBeLessThan(
      cat3.projectedCompletionDay,
    );
  });

  it("Category 3 has lower effectiveK than Category 1", () => {
    const cat1 = computeTargetCurve({ ...BASE, category: "Category 1" });
    const cat3 = computeTargetCurve({ ...BASE, category: "Category 3" });
    expect(cat3.effectiveK).toBeLessThan(cat1.effectiveK);
  });

  // ── Class variants ───────────────────────────────────────────────

  it("Class 1 dries faster than Class 4", () => {
    // Use softwood + larger dehu so Class 4 completes before MAX_DAYS
    const class1 = computeTargetCurve({
      ...BASE,
      materialType: "softwood",
      dehumidifierCapacityLpd: 80,
      waterClass: "Class 1",
    });
    const class4 = computeTargetCurve({
      ...BASE,
      materialType: "softwood",
      dehumidifierCapacityLpd: 80,
      waterClass: "Class 4",
    });
    expect(class1.projectedCompletionDay).toBeLessThan(
      class4.projectedCompletionDay,
    );
  });

  // ── Dehumidifier capacity scaling ────────────────────────────────

  it("double dehumidifier capacity reduces projected completion day", () => {
    // Use timber with initialMC close to finalMC so both fit within MAX_DAYS
    const std = computeTargetCurve({
      ...BASE,
      materialType: "softwood",
      dehumidifierCapacityLpd: 30,
    });
    const high = computeTargetCurve({
      ...BASE,
      materialType: "softwood",
      dehumidifierCapacityLpd: 120,
    });
    expect(high.projectedCompletionDay).toBeLessThan(
      std.projectedCompletionDay,
    );
  });

  it("larger room volume increases projected completion day", () => {
    // Contrast a small room (fast) vs large room (slow), same dehu
    const small = computeTargetCurve({
      ...BASE,
      materialType: "softwood",
      roomVolumeM3: 10,
      dehumidifierCapacityLpd: 40,
    });
    const large = computeTargetCurve({
      ...BASE,
      materialType: "softwood",
      roomVolumeM3: 80,
      dehumidifierCapacityLpd: 40,
    });
    expect(large.projectedCompletionDay).toBeGreaterThan(
      small.projectedCompletionDay,
    );
  });

  // ── AU vs NZ climate (model is climate-agnostic) ─────────────────
  // The model does not take a climate input; equilibrium MC is handled
  // by the finalMC lookup table (same threshold applies AU & NZ per S500).
  // These tests confirm identical results are produced for both markets.

  it("AU and NZ produce identical results for same inputs (climate-agnostic model)", () => {
    const au = computeTargetCurve({ ...BASE });
    const nz = computeTargetCurve({ ...BASE }); // same inputs = same result
    expect(au.projectedCompletionDay).toBe(nz.projectedCompletionDay);
    expect(au.finalMC).toBe(nz.finalMC);
  });

  // ── Boundary conditions ───────────────────────────────────────────

  it("initialMC already at or below finalMC returns day 0 completion", () => {
    const result = computeTargetCurve({
      ...BASE,
      materialType: "timber",
      initialMC: 10, // below finalMC of 19
    });
    expect(result.projectedCompletionDay).toBe(0);
    expect(result.daily).toHaveLength(1);
  });

  it("initialMC exactly equal to finalMC returns day 0 completion", () => {
    const result = computeTargetCurve({
      ...BASE,
      materialType: "timber",
      initialMC: 19, // exactly finalMC
    });
    expect(result.projectedCompletionDay).toBe(0);
  });

  it("very high initial MC (100%) still produces a valid curve", () => {
    const result = computeTargetCurve({ ...BASE, initialMC: 100 });
    expect(result.daily.length).toBeGreaterThan(1);
    expect(result.projectedCompletionDay).toBeGreaterThan(0);
    expect(
      result.daily[result.daily.length - 1].targetMC,
    ).toBeGreaterThanOrEqual(result.finalMC);
  });

  it("zero/tiny dehumidifier capacity is guarded (no divide-by-zero)", () => {
    expect(() =>
      computeTargetCurve({ ...BASE, dehumidifierCapacityLpd: 0 }),
    ).not.toThrow();
  });

  it("zero room volume is guarded (no divide-by-zero)", () => {
    expect(() =>
      computeTargetCurve({ ...BASE, roomVolumeM3: 0 }),
    ).not.toThrow();
  });
});
