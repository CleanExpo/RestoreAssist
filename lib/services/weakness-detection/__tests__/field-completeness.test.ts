import { describe, expect, it } from "vitest";
import { checkFieldCompleteness } from "../field-completeness";
import type { WeaknessDetectionInput } from "../types";

describe("checkFieldCompleteness", () => {
  it("flags missing dateOfLoss and technicianAttendanceDate as P1 unverified/missing", () => {
    const input: WeaknessDetectionInput = {
      incident: { dateOfLoss: null, technicianAttendanceDate: null },
      affectedAreas: [
        { name: "Kitchen", moistureReadings: [{ location: "Kitchen", value: 20, unit: "%" }], photos: ["p1"], wetPercentage: 30 },
      ],
    };

    const findings = checkFieldCompleteness(input);

    const timestampFindings = findings.filter((f) =>
      f.description.includes("Date of loss") || f.description.includes("Technician attendance date"),
    );
    expect(timestampFindings).toHaveLength(2);
    for (const f of timestampFindings) {
      expect(f.checkClass).toBe("missing_field");
      expect(f.severity).toBe("P1");
      expect(f.evidenceAnchor).toBe("unverified/missing");
    }
  });

  it("flags zero affected areas as a P0 hard stop", () => {
    const input: WeaknessDetectionInput = {
      incident: { dateOfLoss: "2026-07-01", technicianAttendanceDate: "2026-07-02" },
      affectedAreas: [],
    };

    const findings = checkFieldCompleteness(input);

    const p0 = findings.find((f) => f.severity === "P0");
    expect(p0).toBeDefined();
    expect(p0?.checkClass).toBe("missing_field");
    expect(p0?.evidenceAnchor).toBe("unverified/missing");
    expect(p0?.description).toContain("No affected areas");
  });

  it("flags an affected area with no moisture readings and no photos as P1", () => {
    const input: WeaknessDetectionInput = {
      incident: { dateOfLoss: "2026-07-01", technicianAttendanceDate: "2026-07-02" },
      affectedAreas: [{ name: "Bathroom", moistureReadings: [], photos: [], wetPercentage: 10 }],
    };

    const findings = checkFieldCompleteness(input);

    const readingFinding = findings.find((f) => f.description.includes("no moisture readings"));
    const photoFinding = findings.find((f) => f.description.includes("no photos"));
    expect(readingFinding).toMatchObject({ checkClass: "missing_field", severity: "P1" });
    expect(photoFinding).toMatchObject({ checkClass: "missing_field", severity: "P1" });
    expect(readingFinding?.description).toContain("Bathroom");
  });

  it("flags a missing wet-percentage figure as P2", () => {
    const input: WeaknessDetectionInput = {
      incident: { dateOfLoss: "2026-07-01", technicianAttendanceDate: "2026-07-02" },
      affectedAreas: [
        { name: "Lounge", moistureReadings: [{ location: "Lounge", value: 15, unit: "%" }], photos: ["p1"] },
      ],
    };

    const findings = checkFieldCompleteness(input);

    const wetPctFinding = findings.find((f) => f.description.includes("wet-percentage"));
    expect(wetPctFinding).toMatchObject({ checkClass: "missing_field", severity: "P2" });
  });

  it("flags a photo with no category or location label as P2", () => {
    const input: WeaknessDetectionInput = {
      incident: { dateOfLoss: "2026-07-01", technicianAttendanceDate: "2026-07-02" },
      affectedAreas: [
        { name: "Lounge", moistureReadings: [{ location: "Lounge", value: 15, unit: "%" }], photos: ["p1"], wetPercentage: 12 },
      ],
      photos: [{ url: "https://example.com/photo1.jpg" }],
    };

    const findings = checkFieldCompleteness(input);

    const labelFinding = findings.find((f) => f.description.includes("no location or category label"));
    expect(labelFinding).toMatchObject({ checkClass: "missing_field", severity: "P2" });
  });

  it("returns no findings for a fully complete report", () => {
    const input: WeaknessDetectionInput = {
      incident: { dateOfLoss: "2026-07-01", technicianAttendanceDate: "2026-07-02" },
      affectedAreas: [
        {
          name: "Kitchen",
          moistureReadings: [{ location: "Kitchen", value: 20, unit: "%" }],
          photos: ["p1"],
          wetPercentage: 30,
        },
      ],
      photos: [{ url: "https://example.com/photo1.jpg", category: "Kitchen" }],
    };

    const findings = checkFieldCompleteness(input);

    expect(findings).toEqual([]);
  });
});
