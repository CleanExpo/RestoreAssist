import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    evidenceItem: { findMany: vi.fn() },
    moistureReading: { count: vi.fn() },
    psychrometricReading: { count: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { validateSubmission } from "../submission-gate";
import { countableEvidence } from "../countable-evidence";

const p = prisma as unknown as {
  evidenceItem: { findMany: ReturnType<typeof vi.fn> };
  moistureReading: { count: ReturnType<typeof vi.fn> };
  psychrometricReading: { count: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  p.evidenceItem.findMany.mockResolvedValue([]);
  p.moistureReading.count.mockResolvedValue(0);
  p.psychrometricReading.count.mockResolvedValue(0);
});

describe("validateSubmission", () => {
  it("bounds the evidence query with take: 500 and newest-first orderBy", async () => {
    await validateSubmission("insp-1", "water_damage");

    expect(p.evidenceItem.findMany).toHaveBeenCalledTimes(1);
    const arg = p.evidenceItem.findMany.mock.calls[0][0];
    // RA-8388: only evidence that counts (a retired reading's record does not).
    expect(arg.where).toEqual(countableEvidence({ inspectionId: "insp-1" }));
    expect(arg.take).toBe(500);
    expect(arg.orderBy).toEqual({ capturedAt: "desc" });
    expect(arg.select).toEqual({ evidenceClass: true, status: true });
  });

  it("counts moisture readings toward MOISTURE_READING requirements", async () => {
    p.moistureReading.count.mockResolvedValue(3);
    const result = await validateSubmission("insp-1", "WATER_DAMAGE");
    const moistureGap = result.gaps.find(
      (g) => g.evidenceClass === "MOISTURE_READING",
    );
    expect(moistureGap).toBeUndefined();
  });

  it("returns a passing result with no requirements for an unknown claim type", async () => {
    const result = await validateSubmission("insp-1", "not-a-real-claim-type");

    expect(result.passed).toBe(true);
    expect(result.totalRequired).toBe(0);
    expect(result.completionPercentage).toBe(100);
  });
});
