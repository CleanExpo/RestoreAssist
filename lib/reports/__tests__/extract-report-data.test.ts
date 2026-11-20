import { describe, it, expect } from "vitest";
import {
  hasValue,
  extractMaterialsFromReport,
  extractWaterCategory,
  extractAverageMoisture,
} from "../extract-report-data";

// RA-6687 (pt 2): DB-free unit tests for the report-gen data-shaping helpers
// in lib/reports/extract-report-data.ts. These are pure functions (no Prisma,
// no I/O, no AI) covering IICRC S500 water-category mapping, moisture-average
// numeric handling, material extraction/deduplication, and null/empty gating.

describe("hasValue", () => {
  it("returns false for null and undefined", () => {
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
  });

  it("returns false for empty or whitespace-only strings", () => {
    expect(hasValue("")).toBe(false);
    expect(hasValue("   ")).toBe(false);
    expect(hasValue("\t\n")).toBe(false);
  });

  it("returns false for empty arrays", () => {
    expect(hasValue([])).toBe(false);
  });

  it("returns true for non-empty strings, numbers (incl. 0), and objects", () => {
    expect(hasValue("text")).toBe(true);
    expect(hasValue(0)).toBe(true);
    expect(hasValue(42)).toBe(true);
    expect(hasValue(false)).toBe(true);
    expect(hasValue({})).toBe(true);
    expect(hasValue(["item"])).toBe(true);
  });
});

describe("extractMaterialsFromReport", () => {
  it("returns empty array when no sources present", () => {
    expect(extractMaterialsFromReport({})).toEqual([]);
  });

  it("extracts materials from tier1Responses JSON", () => {
    const result = extractMaterialsFromReport({
      tier1Responses: JSON.stringify({
        T1_Q6_materialsAffected: ["timber", "carpet"],
      }),
    });
    expect(result).toEqual(["timber", "carpet"]);
  });

  it("ignores malformed tier1Responses JSON without throwing", () => {
    expect(() =>
      extractMaterialsFromReport({ tier1Responses: "{ not json" }),
    ).not.toThrow();
    expect(extractMaterialsFromReport({ tier1Responses: "{ not json" })).toEqual(
      [],
    );
  });

  it("extracts materials from technicianReportAnalysis JSON", () => {
    const result = extractMaterialsFromReport({
      technicianReportAnalysis: JSON.stringify({
        materialsAffected: ["plasterboard"],
      }),
    });
    expect(result).toEqual(["plasterboard"]);
  });

  it("extracts known material keywords from free-text field report", () => {
    const result = extractMaterialsFromReport({
      technicianFieldReport:
        "Wet TIMBER subfloor and soaked Carpet near the gyprock wall.",
    });
    expect(result).toContain("timber");
    expect(result).toContain("carpet");
    expect(result).toContain("gyprock");
    expect(result).toContain("subfloor");
  });

  it("deduplicates materials across all three sources", () => {
    const result = extractMaterialsFromReport({
      tier1Responses: JSON.stringify({
        T1_Q6_materialsAffected: ["timber", "carpet"],
      }),
      technicianReportAnalysis: JSON.stringify({
        materialsAffected: ["timber", "concrete"],
      }),
      technicianFieldReport: "timber and carpet are both affected",
    });
    // Each material appears exactly once.
    expect(result.filter((m) => m === "timber")).toHaveLength(1);
    expect(result.filter((m) => m === "carpet")).toHaveLength(1);
    expect(result).toEqual([...new Set(result)]);
    expect(result).toContain("concrete");
  });
});

describe("extractWaterCategory (IICRC S500 mapping)", () => {
  it("returns 'Not specified' for empty source", () => {
    expect(extractWaterCategory("")).toBe("Not specified");
  });

  it("maps clean-water sources to Category 1", () => {
    expect(extractWaterCategory("Burst pipe in kitchen")).toBe("Category 1");
    expect(extractWaterCategory("Roof leak after storm")).toBe("Category 1");
    expect(extractWaterCategory("Hot water service failure")).toBe(
      "Category 1",
    );
    expect(extractWaterCategory("Washing machine hose")).toBe("Category 1");
  });

  it("maps dishwasher discharge to Category 2, as the docstring states", () => {
    expect(extractWaterCategory("Dishwasher")).toBe("Category 2");
  });

  // IICRC S500: water from a dishwasher's supply (inlet) line is clean,
  // potable water (Category 1); water discharged from the dishwasher (drain,
  // waste, overflow) is grey water (Category 2). An unspecified dishwasher
  // source is treated as discharge.
  it("maps a dishwasher supply line to Category 1", () => {
    expect(extractWaterCategory("Dishwasher supply line burst")).toBe(
      "Category 1",
    );
    expect(extractWaterCategory("Dishwasher supply line")).toBe("Category 1");
    expect(extractWaterCategory("Dishwasher inlet hose failed")).toBe(
      "Category 1",
    );
    expect(extractWaterCategory("dishwasher water supply leak")).toBe(
      "Category 1",
    );
  });

  it("keeps dishwasher discharge and unspecified dishwasher at Category 2", () => {
    expect(extractWaterCategory("Dishwasher discharge")).toBe("Category 2");
    expect(extractWaterCategory("Dishwasher drain hose split")).toBe(
      "Category 2",
    );
    expect(extractWaterCategory("dishwasher discharge onto floor")).toBe(
      "Category 2",
    );
    expect(extractWaterCategory("Dishwasher leak")).toBe("Category 2");
    // Supply and discharge both named: discharge is the worse source.
    expect(
      extractWaterCategory("Dishwasher supply hose and drain hose split"),
    ).toBe("Category 2");
  });

  it("still lets a worse source override a dishwasher supply line", () => {
    expect(
      extractWaterCategory("Dishwasher supply line then Sewage backup"),
    ).toBe("Category 3");
    expect(
      extractWaterCategory("Dishwasher supply line and Overflowing toilet"),
    ).toBe("Category 2");
  });

  it("keeps every Tier 1 water-source option at its labelled category", () => {
    const options: Record<string, string> = {
      "Burst pipe (clean water — Category 1)": "Category 1",
      "Overflowing toilet (Category 2 — grey water)": "Category 2",
      "Flood/stormwater (Category 3 — contaminated)": "Category 3",
      "Sewage backup (Category 3 — biohazard)": "Category 3",
      "Roof leak (Category 1 — clean)": "Category 1",
      "Hot water service failure (Category 1)": "Category 1",
      "Washing machine/dishwasher (Category 1)": "Category 1",
      "Unknown source": "Category 1",
      Other: "Category 1",
    };
    for (const [option, want] of Object.entries(options)) {
      expect(extractWaterCategory(option), option).toBe(want);
    }
  });

  it("lets the worst source named govern (IICRC S500)", () => {
    expect(extractWaterCategory("Roof leak Flood")).toBe("Category 3");
    expect(extractWaterCategory("Grey water Sewage backup")).toBe("Category 3");
    expect(extractWaterCategory("Burst pipe then Overflowing toilet")).toBe(
      "Category 2",
    );
  });

  it("maps grey-water sources to Category 2", () => {
    expect(extractWaterCategory("Overflowing toilet (urine only)")).toBe(
      "Category 2",
    );
    expect(extractWaterCategory("Grey water discharge")).toBe("Category 2");
  });

  it("maps black-water sources to Category 3", () => {
    expect(extractWaterCategory("Flood from river")).toBe("Category 3");
    expect(extractWaterCategory("Sewage backup")).toBe("Category 3");
    expect(extractWaterCategory("Biohazard spill")).toBe("Category 3");
    expect(extractWaterCategory("Contaminated standing water")).toBe(
      "Category 3",
    );
  });

  it("defaults to Category 1 for an unrecognised source", () => {
    expect(extractWaterCategory("Mystery dampness")).toBe("Category 1");
  });
});

// Free text must never be under-classified because of its capitalisation.
describe("extractWaterCategory ignores case", () => {
  it.each([
    ["flood from river", "Category 3"],
    ["FLOOD FROM RIVER", "Category 3"],
    ["sewage backup", "Category 3"],
    ["BIOHAZARD SPILL", "Category 3"],
    ["overflowing toilet", "Category 2"],
    ["GREY WATER", "Category 2"],
    ["dishwasher", "Category 2"],
    ["DISHWASHER", "Category 2"],
    ["dishwasher leak in kitchen", "Category 2"],
    ["washing machine/dishwasher", "Category 2"],
    ["DISHWASHER SUPPLY LINE BURST", "Category 1"],
    ["dishwasher supply line", "Category 1"],
    ["burst pipe", "Category 1"],
  ])("%s -> %s", (source, want) => {
    expect(extractWaterCategory(source)).toBe(want);
  });

  it("resolves an exact Tier 1 option from its table before any keyword rule", () => {
    // The option bundles washing machine and dishwasher under its Category 1
    // label; the keyword rules alone would make it Category 2.
    expect(
      extractWaterCategory("Washing machine/dishwasher (Category 1)"),
    ).toBe("Category 1");
    // Anything that is not the exact option string falls to the keyword rules.
    expect(
      extractWaterCategory("Washing machine/dishwasher (Category 1) drain"),
    ).toBe("Category 2");
  });
});

describe("extractAverageMoisture", () => {
  it("returns null for falsy input", () => {
    expect(extractAverageMoisture(null)).toBeNull();
    expect(extractAverageMoisture(undefined)).toBeNull();
    expect(extractAverageMoisture("")).toBeNull();
  });

  it("averages a plain array of {value} objects", () => {
    expect(
      extractAverageMoisture([{ value: 10 }, { value: 20 }, { value: 30 }]),
    ).toBe(20);
  });

  it("supports moisture / value / percentage keys", () => {
    expect(extractAverageMoisture([{ moisture: 40 }, { percentage: 60 }])).toBe(
      50,
    );
  });

  it("averages an array of raw numbers", () => {
    expect(extractAverageMoisture([15, 25])).toBe(20);
  });

  it("parses a JSON-stringified array of readings", () => {
    expect(
      extractAverageMoisture(JSON.stringify([{ value: 12 }, { value: 18 }])),
    ).toBe(15);
  });

  it("extracts X% tokens from a non-JSON string", () => {
    expect(extractAverageMoisture("Bedroom 20% and hallway 40%")).toBe(30);
    expect(extractAverageMoisture("single reading 12.5%")).toBe(12.5);
  });

  it("returns null when no numeric values are present", () => {
    expect(extractAverageMoisture("no readings recorded")).toBeNull();
    expect(extractAverageMoisture([{ note: "n/a" }])).toBeNull();
    expect(extractAverageMoisture([])).toBeNull();
  });

  it("ignores NaN entries when averaging mixed arrays", () => {
    expect(extractAverageMoisture([{ value: 30 }, { note: "x" }, 10])).toBe(20);
  });
});
