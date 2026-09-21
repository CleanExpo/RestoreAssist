/**
 * RA-7613 — photo AI classifications must raise the existing WHS gate.
 *
 * Watched-red first: on main (401ebf74, after RA-7611) `evaluateWhsGate` is
 * imported only by SketchSelectionPanel, and nothing connects
 * `auto-classify-photo` labels (ASBESTOS_SUSPECT) to it. These tests import
 * the connector; they fail until that module exists and latches ACM.
 *
 * AI never blocks evidence submission (RA-7076). It only raises the strip-out
 * gate. AI can raise the latch and can never clear it — including a later
 * classification that finds no ACM. Only a human-recorded WHS pathway clears
 * the block.
 */
import { describe, expect, it } from "vitest";
import { evaluateWhsGate } from "../whs-gate";
import {
  applyAiAcmLatch,
  classificationHasSuspectedAcm,
  emptyAiAcmLatch,
  evaluateStripOutFromPhotoClassification,
} from "../photo-ai-whs";

const ACM_LABELS = {
  secondaryDamageIndicators: ["ASBESTOS_SUSPECT"],
  affectedMaterial: ["FIBRO"],
};

const NO_ACM_LABELS = {
  secondaryDamageIndicators: ["STAINING"],
  affectedMaterial: ["GYPROCK"],
};

describe("RA-7613 — photo classification ACM raises the WHS gate", () => {
  it("a photo classification marked suspected ACM blocks strip-out scope", () => {
    expect(classificationHasSuspectedAcm(ACM_LABELS)).toBe(true);

    const result = evaluateStripOutFromPhotoClassification({
      labels: ACM_LABELS,
      propertyYearBuilt: 1995,
    });

    expect(result.suspectedAcm).toBe(true);
    expect(result.blocked).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.requiresWhsPathway).toBe(true);
    expect(result.reason.toLowerCase()).toContain("asbestos");
  });

  it("does not block evidence-style (non-destructive) actions", () => {
    const result = evaluateStripOutFromPhotoClassification({
      labels: ACM_LABELS,
      propertyYearBuilt: 1995,
      action: "annotate",
    });
    expect(result.suspectedAcm).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.allowed).toBe(true);
  });
});

describe("RA-7613 — AI can raise the WHS latch and can never clear it", () => {
  it("a later no-ACM classification does not clear the gate; only a human WHS pathway does", () => {
    let latch = emptyAiAcmLatch();
    expect(latch.aiRaisedAcm).toBe(false);

    latch = applyAiAcmLatch(latch, ACM_LABELS);
    expect(latch.aiRaisedAcm).toBe(true);

    latch = applyAiAcmLatch(latch, NO_ACM_LABELS);
    expect(latch.aiRaisedAcm).toBe(true);

    const stillBlocked = evaluateStripOutFromPhotoClassification({
      labels: NO_ACM_LABELS,
      latch,
      propertyYearBuilt: 1995,
    });
    expect(stillBlocked.blocked).toBe(true);
    expect(stillBlocked.suspectedAcm).toBe(true);

    const clearedByHuman = evaluateStripOutFromPhotoClassification({
      labels: NO_ACM_LABELS,
      latch,
      propertyYearBuilt: 1995,
      whsPathwayNote: "Licensed non-friable removalist engaged (QLD)",
    });
    expect(clearedByHuman.blocked).toBe(false);
    expect(clearedByHuman.allowed).toBe(true);
    expect(clearedByHuman.suspectedAcm).toBe(true);
  });

  it("rejecting a later no-ACM result still cannot drop the latch", () => {
    const raised = applyAiAcmLatch(emptyAiAcmLatch(), ACM_LABELS);
    const afterReject = applyAiAcmLatch(raised, NO_ACM_LABELS);
    expect(afterReject.aiRaisedAcm).toBe(true);

    const viaGate = evaluateWhsGate({
      isPotentialAcm: afterReject.aiRaisedAcm,
      propertyYearBuilt: 1995,
      action: "strip_out",
    });
    expect(viaGate.blocked).toBe(true);
  });
});
