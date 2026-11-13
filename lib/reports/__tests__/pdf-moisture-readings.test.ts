import { describe, it, expect } from "vitest";
import { relationalMoistureToPdfRows } from "../pdf-moisture-readings";

describe("relationalMoistureToPdfRows", () => {
  it("maps baseline and monitoring flags for PDF section 4", () => {
    const rows = relationalMoistureToPdfRows([
      {
        location: "Hall",
        surfaceType: "drywall",
        moistureLevel: 8,
        isBaseline: true,
        recordedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        location: "Bath",
        surfaceType: "drywall",
        moistureLevel: 14,
        isMonitoringPoint: true,
        recordedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
    expect(rows[0].role).toBe("Baseline");
    expect(rows[1].role).toBe("Monitoring");
  });
});
