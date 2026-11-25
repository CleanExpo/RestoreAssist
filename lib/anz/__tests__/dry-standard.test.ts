import { describe, expect, it } from "vitest";
import { evaluateDrying } from "../dry-standard";
import { getDryStandard } from "@/lib/iicrc-dry-standards";

// RA-8510: timber framing takes its value from the guide table's softwood row.
const TIMBER = getDryStandard("softwood").dryThreshold;

describe("S500 drying validation", () => {
  it("marks a reading at or below the material dry-standard as dry", () => {
    const r = evaluateDrying({ materialId: "timber-framing", currentMc: 14 });
    expect(r.dryStandardMet).toBe(true);
    expect(r.status).toBe("dry");
    expect(r.targetMc).toBe(TIMBER);
    expect(r.marginMc).toBe(14 - TIMBER); // negative => below standard
  });

  it("marks a reading above the dry-standard as not yet dry", () => {
    const r = evaluateDrying({ materialId: "timber-framing", currentMc: 22 });
    expect(r.dryStandardMet).toBe(false);
    expect(r.status).toBe("not_dry");
    expect(r.marginMc).toBe(22 - TIMBER);
  });

  it("treats the boundary value as dry (<= standard)", () => {
    const r = evaluateDrying({ materialId: "timber-framing", currentMc: TIMBER });
    expect(r.dryStandardMet).toBe(true);
  });

  it("an explicit targetMc overrides the material default", () => {
    const r = evaluateDrying({
      materialId: "timber-framing",
      currentMc: 14,
      targetMc: 12,
    });
    expect(r.targetMc).toBe(12);
    expect(r.dryStandardMet).toBe(false);
  });

  it("throws for a material with no guide value and no targetMc (RA-8510)", () => {
    expect(() => evaluateDrying({ materialId: "fibro", currentMc: 1 })).toThrow();
    expect(evaluateDrying({ materialId: "fibro", currentMc: 1, targetMc: 2 }).status).toBe("dry");
  });

  it("throws when neither materialId nor targetMc is provided", () => {
    expect(() => evaluateDrying({ currentMc: 10 })).toThrow();
  });
});
