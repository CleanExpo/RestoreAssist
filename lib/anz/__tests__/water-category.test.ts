import { describe, expect, it } from "vitest";
import { categoryRequirements, WATER_CATEGORIES } from "../water-category";

describe("S500:2021 water categories", () => {
  it("defines the three categories clean/grey/black", () => {
    expect(WATER_CATEGORIES).toEqual(["cat1", "cat2", "cat3"]);
  });

  it("Category 1 (clean) needs no contaminated disposal or containment", () => {
    const r = categoryRequirements("cat1");
    expect(r.containmentRequired).toBe(false);
    expect(r.disposalAsContaminated).toBe(false);
    expect(r.porousMaterialsSalvageable).toBe(true);
  });

  it("Category 3 (black) requires containment, contaminated disposal, and respiratory PPE", () => {
    const r = categoryRequirements("cat3");
    expect(r.containmentRequired).toBe(true);
    expect(r.disposalAsContaminated).toBe(true);
    expect(r.porousMaterialsSalvageable).toBe(false);
    expect(r.ppe.join(" ").toLowerCase()).toContain("respirator");
  });

  it("escalates PPE stringency from cat1 to cat3", () => {
    const c1 = categoryRequirements("cat1").ppe.length;
    const c3 = categoryRequirements("cat3").ppe.length;
    expect(c3).toBeGreaterThan(c1);
  });

  it("every category carries a human-readable label and description", () => {
    for (const cat of WATER_CATEGORIES) {
      const r = categoryRequirements(cat);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
    }
  });
});
