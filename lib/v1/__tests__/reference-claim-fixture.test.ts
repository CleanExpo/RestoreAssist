import { describe, it, expect } from "vitest";
import { evaluateWaterDamageCompleteness } from "../../completeness/water-damage-pack";
import { V1_REFERENCE_CAPABILITY_CHECKS } from "../reference-claim-fixture";

describe("V1 reference claim fixture contract", () => {
  it("documents capability rows for Phase 6 evidence", () => {
    expect(V1_REFERENCE_CAPABILITY_CHECKS.length).toBeGreaterThanOrEqual(8);
    expect(V1_REFERENCE_CAPABILITY_CHECKS).toContain("portal_consumer_updates");
  });

  it("full fixture facts yield no blocking completeness gaps", () => {
    const pack = evaluateWaterDamageCompleteness({
      hasClient: true,
      hasCategoryClass: true,
      hasIncidentDate: true,
      hasBaseline: true,
      hasMonitoringPoint: true,
      photoCount: 5,
    });
    expect(pack.blocking).toEqual([]);
    expect(pack.completionPercent).toBe(100);
  });
});
