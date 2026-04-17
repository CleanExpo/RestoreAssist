// RA-1136e: Unit tests for checkNzbsGate
// Verifies: AU no-op, NZ blocking (currently always no-op due to RA-1120)

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindUnique } = vi.hoisted(() => ({ mockFindUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: mockFindUnique,
    },
  },
}));

import { checkNzbsGate } from "../nzbs-compliance-gate";

describe("checkNzbsGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns canSubmit: true when inspection does not exist", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const result = await checkNzbsGate("insp-missing");

    expect(result.canSubmit).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.requiredClauses).toHaveLength(0);
  });

  it("returns canSubmit: true (no-op) when propertyCountry defaults to AU", async () => {
    // TODO RA-1120: propertyCountry not yet on schema — gate is a no-op for all AU inspections
    mockFindUnique.mockResolvedValueOnce({
      propertyYearBuilt: 1985,
      inspectionDate: new Date("2025-01-15"),
      affectedAreas: [
        { category: "3", waterSource: "roof ingress" },
        { category: "2", waterSource: "internal pipe burst" },
      ],
    });

    const result = await checkNzbsGate("insp-au-001");

    // AU inspections always pass (no-op until RA-1120 adds propertyCountry)
    expect(result.canSubmit).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });
});
