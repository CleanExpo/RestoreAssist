import { describe, it, expect } from "vitest";
import { evaluateWaterDamageCompleteness } from "../water-damage-pack";

describe("evaluateWaterDamageCompleteness", () => {
  it("blocks when core intake missing", () => {
    const pack = evaluateWaterDamageCompleteness({
      hasClient: false,
      hasCategoryClass: false,
      hasIncidentDate: false,
      hasBaseline: false,
      hasMonitoringPoint: false,
      photoCount: 0,
    });
    expect(pack.blocking).toContain("client");
    expect(pack.blocking).toContain("s500");
    expect(pack.completionPercent).toBeLessThan(50);
  });

  it("reports high completion when core facts satisfied", () => {
    const pack = evaluateWaterDamageCompleteness({
      hasClient: true,
      hasCategoryClass: true,
      hasIncidentDate: true,
      hasBaseline: true,
      hasMonitoringPoint: true,
      photoCount: 10,
    });
    expect(pack.blocking).toHaveLength(0);
    expect(pack.completionPercent).toBe(100);
  });
});
