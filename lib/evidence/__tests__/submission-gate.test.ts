import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    evidenceItem: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { validateSubmission } from "../submission-gate";

const p = prisma as unknown as {
  evidenceItem: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  p.evidenceItem.findMany.mockResolvedValue([]);
});

describe("validateSubmission", () => {
  it("bounds the evidence query with take: 500 and newest-first orderBy", async () => {
    await validateSubmission("insp-1", "water_damage");

    expect(p.evidenceItem.findMany).toHaveBeenCalledTimes(1);
    const arg = p.evidenceItem.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ inspectionId: "insp-1" });
    expect(arg.take).toBe(500);
    expect(arg.orderBy).toEqual({ capturedAt: "desc" });
    expect(arg.select).toEqual({ evidenceClass: true, status: true });
  });

  it("returns a passing result with no requirements for an unknown claim type", async () => {
    const result = await validateSubmission("insp-1", "not-a-real-claim-type");

    expect(result.passed).toBe(true);
    expect(result.totalRequired).toBe(0);
    expect(result.completionPercentage).toBe(100);
  });
});
