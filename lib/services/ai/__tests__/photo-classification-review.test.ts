/**
 * RA-7613 — accepted photo AI results enter as `ai_suggested` and produce
 * zero billable quantities until a person confirms them (RA-7611 allow-list).
 *
 * Watched-red first: on main the classifier writes InspectionPhoto.aiLabels
 * and has zero UI callers. Nothing stores accepted labels as `ai_suggested`
 * or keeps them out of billed quantities.
 */
import { describe, expect, it } from "vitest";
import { isOperatorMeasuredProvenance } from "@/lib/sketch/measured-provenance";
import {
  acceptPhotoClassification,
  billableQuantityForPhotoResult,
  confirmPhotoClassification,
  rejectPhotoClassification,
} from "../photo-classification-review";

const SAMPLE_LABELS = {
  damageCategory: "CAT_2",
  damageClass: "CLASS_2",
  roomType: "KITCHEN",
  moistureSource: "FLEXI_HOSE",
  affectedMaterial: ["CARPET", "GYPROCK"],
  surfaceOrientation: "FLOOR",
  damageExtentEstimate: "PARTIAL",
  secondaryDamageIndicators: ["STAINING"],
  photoStage: "PRE_WORK",
  captureAngle: "STRAIGHT_ON",
  suggestedAreaM2: 12.5,
};

describe("RA-7613 — accepted photo results are ai_suggested until confirmed", () => {
  it("stores accepted photo results as ai_suggested with zero billable quantity", () => {
    const accepted = acceptPhotoClassification(SAMPLE_LABELS);

    expect(accepted.status).toBe("accepted");
    expect(accepted.provenance).toBe("ai_suggested");
    expect(accepted.labelledBy).toBe("AI_ASSISTED");
    expect(accepted.fields.damageCategory).toBe("CAT_2");
    expect(accepted.fields.affectedMaterial).toEqual(["CARPET", "GYPROCK"]);
    expect(isOperatorMeasuredProvenance(accepted.provenance)).toBe(false);
    expect(billableQuantityForPhotoResult(accepted)).toBe(0);
    expect(accepted.suggestedAreaM2).toBe(12.5);
  });

  it("rejected results do not enter job fields and still bill nothing", () => {
    const rejected = rejectPhotoClassification(SAMPLE_LABELS);
    expect(rejected.status).toBe("rejected");
    expect(rejected.fields).toBeNull();
    expect(billableQuantityForPhotoResult(rejected)).toBe(0);
  });

  it("a person confirming the suggestion promotes provenance and may bill the quantity", () => {
    const accepted = acceptPhotoClassification(SAMPLE_LABELS);
    expect(billableQuantityForPhotoResult(accepted)).toBe(0);

    const confirmed = confirmPhotoClassification(accepted);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.provenance).toBe("operator_measured");
    expect(confirmed.labelledBy).toBe("HUMAN_TECH");
    expect(isOperatorMeasuredProvenance(confirmed.provenance)).toBe(true);
    expect(billableQuantityForPhotoResult(confirmed)).toBe(12.5);
  });

  it("accepted suspected-ACM results still bill nothing until confirmed", () => {
    const accepted = acceptPhotoClassification({
      ...SAMPLE_LABELS,
      secondaryDamageIndicators: ["ASBESTOS_SUSPECT"],
    });
    expect(accepted.suspectedAcm).toBe(true);
    expect(accepted.provenance).toBe("ai_suggested");
    expect(billableQuantityForPhotoResult(accepted)).toBe(0);
  });
});
