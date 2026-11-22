/**
 * RA-8337 — each claim type is graded against the pack that applies to it.
 * A fire, mould, contents or biohazard job must not be blocked on water
 * category/class (s500) or a baseline moisture reading.
 */
import { describe, expect, it } from "vitest";
import { evaluateCompletenessForClaimType } from "../claim-type-pack";

/** Nothing captured yet: no client, no class, no date, no readings, no photos. */
const EMPTY = {
  hasClient: false,
  hasCategoryClass: false,
  hasIncidentDate: false,
  hasBaseline: false,
  hasMonitoringPoint: false,
  photoCount: 0,
};

describe("evaluateCompletenessForClaimType (RA-8337)", () => {
  it("a water job is blocked on the water items", () => {
    const pack = evaluateCompletenessForClaimType("WATER", EMPTY);
    expect(pack.packId).toBe("water");
    expect(pack.blocking).toEqual(["client", "s500", "loss_date", "baseline"]);
  });

  it("an unset claim type keeps the water pack (the job page treats it as WATER)", () => {
    expect(evaluateCompletenessForClaimType(null, EMPTY).packId).toBe("water");
  });

  it.each(["FIRE", "MOULD", "CONTENTS", "BIOHAZARD"])(
    "a %s job is blocked only on facts every claim needs",
    (claimType) => {
      const pack = evaluateCompletenessForClaimType(claimType, EMPTY);
      expect(pack.packId).toBe("baseline");
      expect(pack.blocking).toEqual(["client", "loss_date"]);
      expect(pack.blocking).not.toContain("s500");
      expect(pack.blocking).not.toContain("baseline");
      expect(pack.facts.map((f) => f.id)).not.toContain("monitoring");
    },
  );

  it("a fire job with client and date of loss has no blockers", () => {
    const pack = evaluateCompletenessForClaimType("FIRE", {
      ...EMPTY,
      hasClient: true,
      hasIncidentDate: true,
    });
    expect(pack.blocking).toEqual([]);
  });
});
