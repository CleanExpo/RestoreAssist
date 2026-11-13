import { describe, expect, it } from "vitest";
import { NIR_QUICK_FILL_TEMPLATES } from "@/lib/nir-quick-fill-templates";
import { makeSafeCompliance } from "@/lib/compliance/make-safe-compliance";
import { MAKE_SAFE_ACTIONS } from "@/lib/compliance/make-safe-actions";

describe("NIR Quick Fill templates", () => {
  it("defines complete data for every template", () => {
    for (const template of Object.values(NIR_QUICK_FILL_TEMPLATES)) {
      expect(template.propertyAddress.trim()).not.toBe("");
      expect(template.propertyPostcode.trim()).not.toBe("");
      expect(template.technicianName.trim()).not.toBe("");
      expect(template.inspectionDate.trim()).not.toBe("");
      expect(template.damageDescription.trim()).not.toBe("");
      expect(template.moistureReadings.length).toBeGreaterThan(0);
      expect(template.affectedAreas.length).toBeGreaterThan(0);
      expect(template.selectedScopeItems.length).toBeGreaterThan(0);
      expect(template.equipmentSelection.length).toBeGreaterThan(0);
      expect(template.dryingDuration).toBeGreaterThan(0);
      expect(Object.keys(template.assessmentSeed).length).toBeGreaterThan(0);
      expect(Object.keys(template.complianceSeed).length).toBeGreaterThan(0);
      if (template.claimType === "WATER") {
        expect(template.category).toBeTruthy();
        expect(template.waterClass).toBeTruthy();
        expect(template.assessmentSeed.waterCategory).toMatch(/^CAT_/);
        expect(template.assessmentSeed.damageClass).toMatch(/^CLASS_/);
      }
      expect(
        makeSafeCompliance(
          MAKE_SAFE_ACTIONS.map((action) => template.makeSafeSeed[action]),
        ),
      ).toBe("PASS");
    }
  });
});
