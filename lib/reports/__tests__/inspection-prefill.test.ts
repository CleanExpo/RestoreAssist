import { describe, it, expect } from "vitest";
import {
  buildReportPrefill,
  DELIBERATELY_NOT_PREFILLED,
  type InspectionPrefillSource,
} from "../inspection-prefill";

/**
 * A fully-populated inspection. Individual tests strip one field to prove the
 * mapping omits it rather than padding it -- starting from an empty object and
 * asserting nothing appears would pass against a function that returns {}.
 */
function inspection(
  over: Partial<InspectionPrefillSource> = {},
): InspectionPrefillSource {
  return {
    inspectionNumber: "NIR-2026-09-0007",
    propertyAddress: "12 Wattle Street, Toowoomba QLD",
    propertyPostcode: "4350",
    inspectionDate: new Date("2026-09-01T23:15:00.000Z"),
    technicianName: "J. Nguyen",
    lossDescription: "Supply line to the dishwasher failed overnight.",
    claimType: "WATER",
    propertyYearBuilt: 1974,
    propertyWallConstruction: "Cavity",
    propertyWallMaterial: "Brick",
    waterDamageClassification: {
      waterCategory: "CAT_2",
      damageClass: "CLASS_3",
      lossSourceType: "APPLIANCE",
    },
    classifications: [],
    ...over,
  };
}

describe("buildReportPrefill", () => {
  it("copies what the inspection records", () => {
    const { fields } = buildReportPrefill(inspection());
    expect(fields).toEqual({
      jobNumber: "NIR-2026-09-0007",
      propertyAddress: "12 Wattle Street, Toowoomba QLD",
      propertyPostcode: "4350",
      technicianName: "J. Nguyen",
      technicianAttendanceDate: "2026-09-01",
      technicianFieldReport: "Supply line to the dishwasher failed overnight.",
      hazardType: "WATER_DAMAGE",
      buildingAge: 1974,
      structureType: "Cavity",
      waterCategory: "2",
      waterClass: "3",
      sourceOfWater: "an appliance failure",
    });
  });

  describe("an unrecorded field is absent, never empty", () => {
    // "" and 0 are values a technician could have entered deliberately. The whole
    // point of the prefill is that the form can tell "not recorded" from
    // "recorded as nothing", so each of these asserts on key ABSENCE.
    it.each([
      ["technicianName", "technicianName"],
      ["lossDescription", "technicianFieldReport"],
      ["propertyPostcode", "propertyPostcode"],
    ] as const)("%s missing leaves %s out", (column, field) => {
      const { fields, filled } = buildReportPrefill(
        inspection({ [column]: null }),
      );
      expect(field in fields).toBe(false);
      expect(filled).not.toContain(field);
    });

    it("treats whitespace as unrecorded rather than copying it", () => {
      const { fields } = buildReportPrefill(
        inspection({ technicianName: "   " }),
      );
      expect("technicianName" in fields).toBe(false);
    });
  });

  it("carries the year built across unchanged, not an age in years", () => {
    // Report.buildingAge is the YEAR (the pre-1990 asbestos/lead trigger). An
    // age would be ~52 here, which reads as a building built in year 52 and
    // moves a 1974 property out of the trigger entirely.
    const { fields } = buildReportPrefill(inspection({ propertyYearBuilt: 1974 }));
    expect(fields.buildingAge).toBe(1974);
  });

  describe("hazard type comes from the boundary normaliser, and never defaults", () => {
    it("maps FIRE to FIRE_SMOKE, the canonical JobType", () => {
      // Not "FIRE_DAMAGE" -- that string is the interviews page's own UI list.
      const { fields } = buildReportPrefill(inspection({ claimType: "FIRE" }));
      expect(fields.hazardType).toBe("FIRE_SMOKE");
    });

    it.each(["ASBESTOS", "BIOHAZARD", "CONTENTS", "ODOUR", "CARPET", "HVAC"])(
      "leaves hazardType absent for %s rather than defaulting to water",
      (claimType) => {
        // The guided-interview path in reports/new defaults hazardType to
        // "WATER_DAMAGE". On an asbestos job that is a false statement about the
        // hazard, printed into a client-facing report.
        const { fields } = buildReportPrefill(inspection({ claimType }));
        expect("hazardType" in fields).toBe(false);
      },
    );

    it("leaves hazardType absent when no claim type is stamped", () => {
      const { fields } = buildReportPrefill(inspection({ claimType: null }));
      expect("hazardType" in fields).toBe(false);
    });
  });

  describe("water classification", () => {
    it("reduces the enum forms to the bare digit the Report column holds", () => {
      const { fields } = buildReportPrefill(
        inspection({
          waterDamageClassification: {
            waterCategory: "CAT_3",
            damageClass: "CLASS_1",
            lossSourceType: null,
          },
        }),
      );
      expect(fields.waterCategory).toBe("3");
      expect(fields.waterClass).toBe("1");
    });

    it("falls back to a FINAL Classification row when the gated record is empty", () => {
      const { fields } = buildReportPrefill(
        inspection({
          waterDamageClassification: null,
          classifications: [{ category: "2", class: "4", isFinal: true }],
        }),
      );
      expect(fields.waterCategory).toBe("2");
      expect(fields.waterClass).toBe("4");
    });

    it("ignores a Classification row that is not final", () => {
      // A draft classifier run is a suggestion. Copying it into the report makes
      // it look like a determination that was signed off.
      const { fields } = buildReportPrefill(
        inspection({
          waterDamageClassification: null,
          classifications: [{ category: "3", class: "2", isFinal: false }],
        }),
      );
      expect("waterCategory" in fields).toBe(false);
      expect("waterClass" in fields).toBe(false);
    });

    it("prefers the gated record over a final Classification that disagrees", () => {
      const { fields } = buildReportPrefill(
        inspection({
          waterDamageClassification: {
            waterCategory: "CAT_1",
            damageClass: "CLASS_1",
            lossSourceType: null,
          },
          classifications: [{ category: "3", class: "4", isFinal: true }],
        }),
      );
      expect(fields.waterCategory).toBe("1");
      expect(fields.waterClass).toBe("1");
    });
  });

  describe("source of water reads as client-facing prose", () => {
    it.each([
      ["PLUMBING", "a plumbing failure"],
      ["ROOF", "the roof"],
      ["FLOOD", "flooding"],
      ["HVAC", "the HVAC system"],
    ] as const)("%s becomes %s", (enumValue, prose) => {
      // damage-report-view.tsx renders "Water entered the property from <this>."
      const { fields } = buildReportPrefill(
        inspection({
          waterDamageClassification: { lossSourceType: enumValue },
        }),
      );
      expect(fields.sourceOfWater).toBe(prose);
    });

    it("omits UNKNOWN — an unrecorded source is not a finding", () => {
      const { fields } = buildReportPrefill(
        inspection({ waterDamageClassification: { lossSourceType: "UNKNOWN" } }),
      );
      expect("sourceOfWater" in fields).toBe(false);
    });
  });

  it("falls back from wall construction to wall material", () => {
    const { fields } = buildReportPrefill(
      inspection({ propertyWallConstruction: null }),
    );
    expect(fields.structureType).toBe("Brick");
  });

  it("never emits a field on the do-not-prefill list", () => {
    // affectedArea in particular: Report.affectedArea's comment says square
    // footage, AffectedArea.affectedAreaSqm is square metres, and no consumer
    // settles it. A wrong unit here is a 10.76x error in a priced document.
    const { fields } = buildReportPrefill(inspection());
    for (const field of DELIBERATELY_NOT_PREFILLED) {
      expect(Object.keys(fields)).not.toContain(field);
    }
  });

  it("reports an empty inspection as nothing filled, not as an empty form", () => {
    const { fields, filled } = buildReportPrefill({});
    expect(fields).toEqual({});
    expect(filled).toEqual([]);
  });

  it("gives a plain calendar date, not an ISO timestamp", () => {
    const { fields } = buildReportPrefill(
      inspection({ inspectionDate: "2026-03-04T00:30:00.000Z" }),
    );
    expect(fields.technicianAttendanceDate).toBe("2026-03-04");
  });

  it("omits the attendance date rather than emitting Invalid Date", () => {
    const { fields } = buildReportPrefill(
      inspection({ inspectionDate: "not a date" }),
    );
    expect("technicianAttendanceDate" in fields).toBe(false);
  });
});
