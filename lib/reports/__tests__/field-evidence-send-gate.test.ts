import { describe, expect, it } from "vitest";
import {
  blocksReportSendForFieldEvidence,
  requiredFieldEvidenceGapCount,
} from "../field-evidence-send-gate";
import type { FieldEvidenceChecklist } from "@/lib/evidence/field-evidence-checklist";

const base = (required: FieldEvidenceChecklist["categories"]["required"]): FieldEvidenceChecklist => ({
  inspectionId: "insp-1",
  claimType: "WATER_DAMAGE",
  generatedAt: "2026-11-01T00:00:00.000Z",
  categories: { required, recommended: [] },
  gapsByEvidenceClass: {},
  gapsByAffectedArea: [],
  unlinkedEvidence: [],
});

describe("field-evidence-send-gate", () => {
  it("blocks when any required class is missing", () => {
    const checklist = base([
      {
        evidenceClass: "MOISTURE_READING",
        displayName: "Moisture",
        stepKey: "moisture",
        stepTitle: "Moisture",
        riskTier: 1,
        requiredCount: 1,
        capturedCount: 0,
        status: "missing",
        averageQaScore: null,
        s500Ref: null,
      },
    ]);
    expect(requiredFieldEvidenceGapCount(checklist)).toBe(1);
    expect(blocksReportSendForFieldEvidence(checklist)).toBe(true);
  });

  it("does not block on weak-only required rows", () => {
    const checklist = base([
      {
        evidenceClass: "PHOTO_EQUIPMENT",
        displayName: "Equipment",
        stepKey: "equip",
        stepTitle: "Equipment",
        riskTier: 1,
        requiredCount: 1,
        capturedCount: 1,
        status: "weak",
        averageQaScore: 50,
        s500Ref: null,
      },
    ]);
    expect(blocksReportSendForFieldEvidence(checklist)).toBe(false);
  });
});
