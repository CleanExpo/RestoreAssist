import { describe, it, expect } from "vitest";
import { assessS500IntakeComplete } from "../s500-intake-gate";

describe("assessS500IntakeComplete", () => {
  it("flags missing classification and dates", async () => {
    const prisma = {
      waterDamageClassification: {
        findUnique: async () => null,
      },
      inspection: {
        findUnique: async () => ({ createdAt: new Date() }),
      },
      report: {
        findUnique: async () => ({ incidentDate: null, technicianAttendanceDate: null }),
      },
    };
    const result = await assessS500IntakeComplete(
      prisma as never,
      "insp_1",
      "rep_1",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.gaps).toContain("WATER_CATEGORY_CLASS");
      expect(result.gaps).toContain("INCIDENT_DATE");
    }
  });
});
