import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectMoistureTrendAnomalies } from "../moisture-trend-anomaly";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    moistureReading: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const mockFindMany = vi.mocked(prisma.moistureReading.findMany);

/** Helper: build a mock reading row */
function reading(
  location: string,
  value: number,
  offsetHours: number,
  unit: string | null = "%",
) {
  const base = new Date("2025-01-01T00:00:00Z");
  return {
    location,
    moistureLevel: value,
    unit,
    recordedAt: new Date(base.getTime() + offsetHours * 3600 * 1000),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("detectMoistureTrendAnomalies", () => {
  it("test 1: fewer than 3 readings → no anomalies", async () => {
    mockFindMany.mockResolvedValue([
      reading("Living Room", 60, 0),
      reading("Living Room", 50, 24),
    ] as any);

    const result = await detectMoistureTrendAnomalies("insp-001");

    expect(result.hasAnomalies).toBe(false);
    expect(result.anomalies).toHaveLength(0);
  });

  it("test 2: clear declining trend (60 → 40 → 20) → no anomalies", async () => {
    mockFindMany.mockResolvedValue([
      reading("Bedroom", 60, 0),
      reading("Bedroom", 40, 24),
      reading("Bedroom", 20, 72),
    ] as any);

    const result = await detectMoistureTrendAnomalies("insp-002");

    expect(result.hasAnomalies).toBe(false);
    expect(result.anomalies).toHaveLength(0);
  });

  it("test 3: plateau at high level (50 → 48 → 49) → flags plateau", async () => {
    mockFindMany.mockResolvedValue([
      reading("Hallway", 50, 0),
      reading("Hallway", 48, 24),
      reading("Hallway", 49, 72),
    ] as any);

    const result = await detectMoistureTrendAnomalies("insp-003");

    expect(result.hasAnomalies).toBe(true);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].severity).toBe("plateau");
    expect(result.anomalies[0].location).toBe("Hallway");
    expect(result.anomalies[0].message).toContain("plateaued");
    expect(result.anomalies[0].recentReadings).toHaveLength(3);
  });

  it("test 4: rising trend (30 → 40 → 50) → flags rising", async () => {
    mockFindMany.mockResolvedValue([
      reading("Subfloor", 30, 0),
      reading("Subfloor", 40, 24),
      reading("Subfloor", 50, 72),
    ] as any);

    const result = await detectMoistureTrendAnomalies("insp-004");

    expect(result.hasAnomalies).toBe(true);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].severity).toBe("rising");
    expect(result.anomalies[0].location).toBe("Subfloor");
    expect(result.anomalies[0].message).toContain("rising");
  });

  it("test 5: stuck high (65 → 63 → 62 after 5 days) → flags stuck_high", async () => {
    mockFindMany.mockResolvedValue([
      reading("Wall Cavity", 65, 0),
      reading("Wall Cavity", 63, 60),
      reading("Wall Cavity", 62, 120), // 5 days
    ] as any);

    const result = await detectMoistureTrendAnomalies("insp-005");

    expect(result.hasAnomalies).toBe(true);
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].severity).toBe("stuck_high");
    expect(result.anomalies[0].location).toBe("Wall Cavity");
    expect(result.anomalies[0].message).toContain("critically high");
  });
});
