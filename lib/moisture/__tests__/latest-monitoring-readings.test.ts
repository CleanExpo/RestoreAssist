import { describe, it, expect } from "vitest";
import { latestMonitoringReadingsForDryingGoal } from "../latest-monitoring-readings";

describe("latestMonitoringReadingsForDryingGoal", () => {
  it("drops baseline rows and keeps only the latest per location+surface", () => {
    const result = latestMonitoringReadingsForDryingGoal([
      {
        id: "1",
        location: "Bathroom",
        surfaceType: "drywall",
        moistureLevel: 28,
        isBaseline: false,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "2",
        location: "Bathroom",
        surfaceType: "drywall",
        moistureLevel: 14,
        isBaseline: false,
        createdAt: "2026-01-03T00:00:00Z",
      },
      {
        id: "3",
        location: "Hall",
        surfaceType: "drywall",
        moistureLevel: 8,
        isBaseline: true,
        createdAt: "2026-01-04T00:00:00Z",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
    expect(result[0].moistureLevel).toBe(14);
  });

  it("excludes invalidated readings", () => {
    const result = latestMonitoringReadingsForDryingGoal([
      {
        id: "1",
        location: "Bathroom",
        surfaceType: "drywall",
        moistureLevel: 99,
        invalidatedAt: "2026-01-01T00:00:00Z",
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "2",
        location: "Bathroom",
        surfaceType: "drywall",
        moistureLevel: 12,
        createdAt: "2026-01-02T00:00:00Z",
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });
});
