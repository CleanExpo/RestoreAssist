import { describe, expect, it } from "vitest";
import { standardCite } from "@/lib/nir-standards-mapping";
import { checkCategorySeparation } from "../category-separation";
import type { WeaknessDetectionInput } from "../types";

describe("checkCategorySeparation", () => {
  it("flags a water category mismatch between incident and classification as P1, citing S500", () => {
    const input: WeaknessDetectionInput = {
      incident: { waterCategory: "Category 3" },
      classification: { category: "1", class: "2" },
    };

    const findings = checkCategorySeparation(input);

    const categoryFinding = findings.find((f) => f.description.includes("Water category differs"));
    expect(categoryFinding).toMatchObject({
      checkClass: "category_separation",
      severity: "P1",
      detectionMethod: "deterministic",
      standardsCitation: standardCite("S500"),
    });
    expect(categoryFinding?.evidenceAnchor).toMatchObject({
      reportSectionId: "incident",
      field: "waterCategory",
    });
  });

  it("flags a water class mismatch between incident and classification as P1", () => {
    const input: WeaknessDetectionInput = {
      incident: { waterCategory: "Category 1", waterClass: "Class 4" },
      classification: { category: "1", class: "1" },
    };

    const findings = checkCategorySeparation(input);

    const classFinding = findings.find((f) => f.description.includes("Water class differs"));
    expect(classFinding).toMatchObject({ checkClass: "category_separation", severity: "P1" });
  });

  it("flags an asserted water category with no classification record as unverified/missing", () => {
    const input: WeaknessDetectionInput = {
      incident: { waterCategory: "Category 2" },
      classification: null,
    };

    const findings = checkCategorySeparation(input);

    const finding = findings.find((f) => f.description.includes("no supporting Classification record"));
    expect(finding).toMatchObject({ checkClass: "category_separation", severity: "P1" });
    expect(finding?.evidenceAnchor).toBe("unverified/missing");
  });

  it("flags detected mould with no separate mould category as unverified/missing, citing S520", () => {
    const input: WeaknessDetectionInput = {
      hazards: { biologicalMouldDetected: true, biologicalMouldCategory: null },
    };

    const findings = checkCategorySeparation(input);

    const finding = findings.find((f) => f.description.includes("Mould growth"));
    expect(finding).toMatchObject({
      checkClass: "category_separation",
      severity: "P1",
      standardsCitation: standardCite("S520"),
    });
    expect(finding?.evidenceAnchor).toBe("unverified/missing");
  });

  it("returns no findings when categories/classes agree and mould is fully categorised", () => {
    const input: WeaknessDetectionInput = {
      incident: { waterCategory: "Category 2", waterClass: "Class 3" },
      classification: { category: "2", class: "3" },
      hazards: { biologicalMouldDetected: true, biologicalMouldCategory: "CAT 2" },
    };

    const findings = checkCategorySeparation(input);

    expect(findings).toEqual([]);
  });
});
