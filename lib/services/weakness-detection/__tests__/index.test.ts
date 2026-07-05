import { describe, expect, it } from "vitest";
import { runDeterministicWeaknessChecks } from "../index";
import type { WeaknessDetectionInput } from "../types";

describe("runDeterministicWeaknessChecks", () => {
  it("aggregates findings from every deterministic check", () => {
    const input: WeaknessDetectionInput = {
      technicianNotes: "Property is guaranteed dry.",
      incident: { dateOfLoss: null, technicianAttendanceDate: null, waterCategory: "Category 3" },
      affectedAreas: [],
      classification: { category: "1", class: "1" },
      scopeItems: [{ description: "Remove wet carpet" }],
    };

    const result = runDeterministicWeaknessChecks(input);

    const classes = new Set(result.findings.map((f) => f.checkClass));
    expect(classes.has("redline_language")).toBe(true);
    expect(classes.has("missing_field")).toBe(true);
    expect(classes.has("category_separation")).toBe(true);
    expect(classes.has("scope_expansion")).toBe(true);

    for (const finding of result.findings) {
      const anchored =
        finding.evidenceAnchor === "unverified/missing" ||
        (typeof finding.evidenceAnchor === "object" &&
          typeof finding.evidenceAnchor.quotedText === "string" &&
          finding.evidenceAnchor.quotedText.length > 0);
      expect(anchored).toBe(true);
      expect(finding.detectionMethod).toBe("deterministic");
    }
  });

  it("flags narrative sections as pending LLM review when more than one is present", () => {
    const input: WeaknessDetectionInput = {
      technicianNotes: "Ceiling stain caused by a leak.",
      recommendations: ["Repaint ceiling."],
      photos: [{ url: "https://example.com/p1.jpg", category: "Ceiling" }],
    };

    const result = runDeterministicWeaknessChecks(input);

    const sections = result.pendingLlmReview.map((p) => p.reportSectionId);
    expect(sections).toContain("technicianNotes");
    expect(sections).toContain("recommendations");
    expect(sections).toContain("photos");
  });

  it("flags each unsupported_causation candidate as pending LLM review", () => {
    const input: WeaknessDetectionInput = {
      technicianNotes: "Damage was caused by a burst pipe.",
    };

    const result = runDeterministicWeaknessChecks(input);

    const causationFinding = result.findings.find((f) => f.checkClass === "unsupported_causation");
    expect(causationFinding).toBeDefined();
    expect(
      result.pendingLlmReview.some((p) => p.reason.includes("Causation candidate")),
    ).toBe(true);
  });

  it("does not flag pending LLM review for narrative contradiction when only one narrative section is present", () => {
    const input: WeaknessDetectionInput = {
      technicianNotes: "All good, no issues to report today for this bathroom leak inspection.",
    };

    const result = runDeterministicWeaknessChecks(input);

    const contradictionPending = result.pendingLlmReview.filter((p) =>
      p.reason.includes("Contradiction detection"),
    );
    expect(contradictionPending).toEqual([]);
  });

  it("returns no findings and no pending LLM review for a fully clean, complete report", () => {
    const input: WeaknessDetectionInput = {
      incident: {
        dateOfLoss: "2026-07-01",
        technicianAttendanceDate: "2026-07-02",
        waterCategory: "Category 2",
        waterClass: "Class 2",
        waterSource: "Burst supply line under kitchen sink",
      },
      affectedAreas: [
        {
          name: "Kitchen",
          moistureReadings: [{ location: "Kitchen floor", value: 18, unit: "%" }],
          photos: ["p1"],
          wetPercentage: 25,
        },
      ],
      classification: { category: "2", class: "2" },
      hazards: { biologicalMouldDetected: false },
      scopeItems: [{ description: "Extract water and install dehumidifier" }],
      authorisedScopeItems: [{ description: "Extract water and install dehumidifier" }],
      technicianNotes: "Water observed under kitchen sink cabinet, consistent with the supply-line leak.",
    };

    const result = runDeterministicWeaknessChecks(input);

    expect(result.findings).toEqual([]);
    expect(result.pendingLlmReview).toEqual([]);
  });
});
