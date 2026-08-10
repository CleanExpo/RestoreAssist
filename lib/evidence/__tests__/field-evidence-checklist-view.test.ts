import { describe, expect, it } from "vitest";
import type { FieldEvidenceChecklist } from "../field-evidence-checklist";
import {
  captureStepHref,
  dedupeAffectedAreaGaps,
  groupChecklistItemsByStep,
  summarizeChecklistProgress,
} from "../field-evidence-checklist-view";

const baseItem = {
  riskTier: 1 as const,
  requiredCount: 1,
  capturedCount: 0,
  averageQaScore: null,
  s500Ref: "S500 §12.1",
};

describe("dedupeAffectedAreaGaps", () => {
  it("collapses duplicate room labels case-insensitively", () => {
    expect(
      dedupeAffectedAreaGaps([
        { roomZoneId: "3rd Floor - Office Area", evidenceCount: 0 },
        { roomZoneId: "3rd Floor - Office Area", evidenceCount: 0 },
        { roomZoneId: " 3rd Floor - Office Area ", evidenceCount: 0 },
        { roomZoneId: "Kitchen", evidenceCount: 0 },
      ]),
    ).toEqual([
      { roomZoneId: "3rd Floor - Office Area", evidenceCount: 0 },
      { roomZoneId: "Kitchen", evidenceCount: 0 },
    ]);
  });
});

describe("groupChecklistItemsByStep", () => {
  it("groups items under their workflow step in first-seen order", () => {
    const groups = groupChecklistItemsByStep([
      {
        ...baseItem,
        evidenceClass: "PHOTO_DAMAGE",
        displayName: "Damage Photo",
        stepKey: "site-photos",
        stepTitle: "Site Photos",
        status: "missing",
      },
      {
        ...baseItem,
        evidenceClass: "AUTHORITY_FORM",
        displayName: "Authority Form",
        stepKey: "client-authority",
        stepTitle: "Client Authority",
        status: "missing",
      },
      {
        ...baseItem,
        evidenceClass: "PHOTO_PROGRESS",
        displayName: "Progress Photo",
        stepKey: "site-photos",
        stepTitle: "Site Photos",
        status: "missing",
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      stepKey: "site-photos",
      stepTitle: "Site Photos",
    });
    expect(groups[0].items.map((i) => i.evidenceClass)).toEqual([
      "PHOTO_DAMAGE",
      "PHOTO_PROGRESS",
    ]);
    expect(groups[1].stepKey).toBe("client-authority");
  });
});

describe("summarizeChecklistProgress", () => {
  it("counts present/missing/weak and dedupes area gaps", () => {
    const checklist: FieldEvidenceChecklist = {
      inspectionId: "insp-1",
      claimType: "WATER_DAMAGE",
      generatedAt: "2026-08-10T00:00:00.000Z",
      categories: {
        required: [
          {
            ...baseItem,
            evidenceClass: "PHOTO_DAMAGE",
            displayName: "Damage Photo",
            stepKey: "a",
            stepTitle: "A",
            status: "present",
            capturedCount: 1,
          },
          {
            ...baseItem,
            evidenceClass: "AUTHORITY_FORM",
            displayName: "Authority Form",
            stepKey: "b",
            stepTitle: "B",
            status: "missing",
          },
          {
            ...baseItem,
            evidenceClass: "PHOTO_EQUIPMENT",
            displayName: "Equipment Photo",
            stepKey: "c",
            stepTitle: "C",
            status: "weak",
            capturedCount: 1,
            averageQaScore: 40,
          },
        ],
        recommended: [
          {
            ...baseItem,
            evidenceClass: "AMBIENT_ENVIRONMENTAL",
            displayName: "Ambient Environmental",
            stepKey: "d",
            stepTitle: "D",
            status: "missing",
          },
        ],
      },
      gapsByEvidenceClass: {},
      gapsByAffectedArea: [
        { roomZoneId: "Office", evidenceCount: 0 },
        { roomZoneId: "Office", evidenceCount: 0 },
      ],
      unlinkedEvidence: ["Shed"],
    };

    const summary = summarizeChecklistProgress(checklist);
    expect(summary.requiredTotal).toBe(3);
    expect(summary.requiredPresent).toBe(1);
    expect(summary.requiredMissing).toBe(1);
    expect(summary.requiredWeak).toBe(1);
    expect(summary.recommendedMissing).toBe(1);
    expect(summary.uniqueAreaGaps).toHaveLength(1);
    expect(summary.unlinkedCount).toBe(1);
    expect(summary.isGuidanceComplete).toBe(false);
  });

  it("marks guidance complete when every category is clear", () => {
    const checklist: FieldEvidenceChecklist = {
      inspectionId: "insp-2",
      claimType: "WATER_DAMAGE",
      generatedAt: "2026-08-10T00:00:00.000Z",
      categories: {
        required: [
          {
            ...baseItem,
            evidenceClass: "PHOTO_DAMAGE",
            displayName: "Damage Photo",
            stepKey: "a",
            stepTitle: "A",
            status: "present",
            capturedCount: 1,
          },
        ],
        recommended: [],
      },
      gapsByEvidenceClass: {},
      gapsByAffectedArea: [],
      unlinkedEvidence: [],
    };

    expect(summarizeChecklistProgress(checklist).isGuidanceComplete).toBe(true);
  });
});

describe("captureStepHref", () => {
  it("builds a capture deep-link with the workflow step key", () => {
    expect(captureStepHref("insp-9", "moisture-survey")).toBe(
      "/dashboard/inspections/insp-9/capture?step=moisture-survey",
    );
  });
});
