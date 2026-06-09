import { describe, expect, it } from "vitest";
import { evaluateDrying } from "../dry-standard";

describe("S500 drying validation", () => {
  it("marks a reading at or below the material dry-standard as dry", () => {
    // timber-framing dry standard is 16% in the library
    const r = evaluateDrying({ materialId: "timber-framing", currentMc: 14 });
    expect(r.dryStandardMet).toBe(true);
    expect(r.status).toBe("dry");
    expect(r.targetMc).toBe(16);
    expect(r.marginMc).toBe(14 - 16); // negative => below standard
  });

  it("marks a reading above the dry-standard as not yet dry", () => {
    const r = evaluateDrying({ materialId: "timber-framing", currentMc: 22 });
    expect(r.dryStandardMet).toBe(false);
    expect(r.status).toBe("not_dry");
    expect(r.marginMc).toBe(22 - 16);
  });

  it("treats the boundary value as dry (<= standard)", () => {
    const r = evaluateDrying({ materialId: "timber-framing", currentMc: 16 });
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

  it("throws when neither materialId nor targetMc is provided", () => {
    expect(() => evaluateDrying({ currentMc: 10 })).toThrow();
  });
});
