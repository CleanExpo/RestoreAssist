import { describe, expect, it } from "vitest";
import { checkRedlineLanguage } from "../redline-language";
import type { WeaknessDetectionInput } from "../types";

describe("checkRedlineLanguage", () => {
  it("flags an absolute redline phrase in technician notes as a P0 hard stop", () => {
    const input: WeaknessDetectionInput = {
      technicianNotes: "Property is guaranteed dry after treatment.",
    };

    const findings = checkRedlineLanguage(input);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      checkClass: "redline_language",
      severity: "P0",
      detectionMethod: "deterministic",
    });
    expect(findings[0].evidenceAnchor).toMatchObject({
      reportSectionId: "technicianNotes",
      field: "technicianNotes",
      quotedText: "guaranteed dry",
    });
  });

  it("flags redline phrases case-insensitively across recommendations", () => {
    const input: WeaknessDetectionInput = {
      recommendations: ["Area is CERTIFIED MOULD-FREE and ready for handover."],
    };

    const findings = checkRedlineLanguage(input);

    expect(findings).toHaveLength(1);
    expect(findings[0].evidenceAnchor).toMatchObject({
      reportSectionId: "recommendations",
      field: "recommendations[0]",
      quotedText: "CERTIFIED MOULD-FREE",
    });
  });

  it("flags a causation phrase as an unsupported_causation P1 candidate when no water source is documented", () => {
    const input: WeaknessDetectionInput = {
      technicianNotes: "Staining on the ceiling was caused by a roof leak.",
      incident: { waterSource: null },
    };

    const findings = checkRedlineLanguage(input);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      checkClass: "unsupported_causation",
      severity: "P1",
      detectionMethod: "deterministic",
    });
    expect(findings[0].evidenceAnchor).toMatchObject({
      quotedText: "caused by",
    });
  });

  it("does not flag a causation phrase when the incident has a documented water source", () => {
    const input: WeaknessDetectionInput = {
      technicianNotes: "Staining on the ceiling was caused by a roof leak.",
      incident: { waterSource: "Roof leak during storm" },
    };

    const findings = checkRedlineLanguage(input);

    expect(findings).toHaveLength(0);
  });

  it("returns no findings and does not crash on empty/absent text fields (unverified/missing path is exercised via missing text, not a fabricated anchor)", () => {
    const input: WeaknessDetectionInput = {};

    const findings = checkRedlineLanguage(input);

    expect(findings).toEqual([]);
  });

  it("flags each of the remaining absolute-language phrases", () => {
    const phrases = ["no mould present", "no mold present", "100% safe", "completely restored"];

    for (const phrase of phrases) {
      const findings = checkRedlineLanguage({
        technicianNotes: `Assessment note: ${phrase}.`,
      });
      expect(findings.some((f) => f.checkClass === "redline_language")).toBe(true);
    }
  });
});
