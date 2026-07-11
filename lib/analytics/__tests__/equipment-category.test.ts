import { describe, it, expect } from "vitest";
import {
  classifyEquipmentCategory,
  analyzeCategoryLeakage,
  categoryBenchmarks,
  type LeakageLine,
} from "../equipment-category";

describe("classifyEquipmentCategory", () => {
  const cases: Array<[string, string]> = [
    ["Labour (Business Hours) @ $40/hr", "labour_tech"],
    ["CAT 3 Technician", "labour_tech"],
    ["Qualified Technician - Business Hours", "labour_tech"],
    ["Project Manager @ $110/hr", "labour_senior"],
    ["R12 Airmover - Tiered - daily rate", "airmover"],
    ["Air Mover/s", "airmover"],
    ["Dehumidifier/s @ $65ea/day", "dehumidifier"],
    ["Airscrubber/s", "afd"],
    ["Injectidry System $350ea/day", "afd"],
    ["Waste Disposal - Skip Bins", "passthrough"],
    ["3rd Party Trades (cost + 10%)", "passthrough"],
    ["Materials includes - PPE, gloves", "passthrough"],
    ["Something unrecognised", "other"],
  ];
  it.each(cases)("classifies %j as %s", (desc, expected) => {
    expect(classifyEquipmentCategory(desc)).toBe(expected);
  });

  it("treats null/empty as other", () => {
    expect(classifyEquipmentCategory(null)).toBe("other");
    expect(classifyEquipmentCategory("")).toBe("other");
  });

  it("puts project-manager BEFORE generic labour (order matters)", () => {
    expect(classifyEquipmentCategory("Project Manager labour @ $110/hr")).toBe("labour_senior");
  });
});

describe("categoryBenchmarks", () => {
  it("sources rates from the pricing SSOT (labour 85/110, airmover 45, dehu 120, afd 150)", () => {
    const b = categoryBenchmarks();
    expect(b.labour_tech).toBe(85);
    expect(b.labour_senior).toBe(110);
    expect(b.airmover).toBe(45);
    expect(b.dehumidifier).toBe(120);
    expect(b.afd).toBe(150);
    expect(b.passthrough).toBeNull();
    expect(b.other).toBeNull();
  });
});

describe("analyzeCategoryLeakage", () => {
  const lines: LeakageLine[] = [
    { description: "Labour @ $40/hr", quantity: 200, unitPriceExTax: 40, amountExTax: 8000 },
    { description: "CAT 3 Technician", quantity: 70, unitPriceExTax: 55, amountExTax: 3850 },
    { description: "Airscrubber", quantity: 70, unitPriceExTax: 60, amountExTax: 4200 },
    { description: "Air Mover", quantity: 56, unitPriceExTax: 68, amountExTax: 3808 },
    { description: "Skip Bins", quantity: 1, unitPriceExTax: 8943, amountExTax: 8943 },
  ];

  it("computes under-charge vs target only where charged < target", () => {
    const r = analyzeCategoryLeakage(lines);
    const byCat = Object.fromEntries(r.byCategory.map((c) => [c.category, c]));

    // labour_tech: (85-40)*200 + (85-55)*70 = 9000 + 2100 = 11100
    expect(byCat.labour_tech.underCharge).toBe(11100);
    // afd: (150-60)*70 = 6300
    expect(byCat.afd.underCharge).toBe(6300);
    // airmover charged 68 > target 45 → no leakage
    expect(byCat.airmover.underCharge).toBe(0);
    // passthrough never benchmarked
    expect(byCat.passthrough.underCharge).toBe(0);
    expect(byCat.passthrough.targetRate).toBeNull();
  });

  it("totals only benchmarked categories and excludes pass-through from the base", () => {
    const r = analyzeCategoryLeakage(lines);
    expect(r.totalUnderCharge).toBe(11100 + 6300);
    // benchmarkedCharged excludes the $8,943 skip-bin pass-through
    expect(r.benchmarkedCharged).toBe(8000 + 3850 + 4200 + 3808);
    expect(r.linesAnalyzed).toBe(5);
  });

  it("sorts categories by under-charge descending", () => {
    const r = analyzeCategoryLeakage(lines);
    expect(r.byCategory[0].category).toBe("labour_tech");
    expect(r.byCategory[1].category).toBe("afd");
  });

  it("falls back to unit×qty when amountExTax is missing, and qty 0/null → 1", () => {
    const r = analyzeCategoryLeakage([
      { description: "Dehumidifier", quantity: null, unitPriceExTax: 100, amountExTax: null },
    ]);
    const dehu = r.byCategory.find((c) => c.category === "dehumidifier")!;
    expect(dehu.chargedTotal).toBe(100); // 100 * 1
    expect(dehu.underCharge).toBe(20); // (120-100)*1
  });
});
