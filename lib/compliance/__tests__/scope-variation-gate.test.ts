/**
 * Tests for checkScopeVariationGate — RA-1136b
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkScopeVariationGate } from "../scope-variation-gate";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    scopeVariation: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const mockFindMany = vi.mocked(prisma.scopeVariation.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkScopeVariationGate", () => {
  it("returns canSubmit: true and empty blockers when no pending variations", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await checkScopeVariationGate("insp-001");

    expect(result.canSubmit).toBe(true);
    expect(result.pendingCount).toBe(0);
    expect(result.blockers).toEqual([]);
  });

  it("returns canSubmit: false with one blocker when 1 pending variation exists", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "var-1",
        reason: "Additional mould remediation",
        costDeltaCents: 45000,
      },
    ] as any);

    const result = await checkScopeVariationGate("insp-002");

    expect(result.canSubmit).toBe(false);
    expect(result.pendingCount).toBe(1);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toBe(
      "Variation pending approval: Additional mould remediation (delta: $450.00)",
    );
  });

  it("returns canSubmit: false with three blockers when 3 pending variations exist", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "var-1", reason: "Scope change A", costDeltaCents: 10000 },
      { id: "var-2", reason: "Scope change B", costDeltaCents: 20000 },
      { id: "var-3", reason: "Scope change C", costDeltaCents: 30000 },
    ] as any);

    const result = await checkScopeVariationGate("insp-003");

    expect(result.canSubmit).toBe(false);
    expect(result.pendingCount).toBe(3);
    expect(result.blockers).toHaveLength(3);
    expect(result.blockers[0]).toBe(
      "Variation pending approval: Scope change A (delta: $100.00)",
    );
    expect(result.blockers[1]).toBe(
      "Variation pending approval: Scope change B (delta: $200.00)",
    );
    expect(result.blockers[2]).toBe(
      "Variation pending approval: Scope change C (delta: $300.00)",
    );
  });

  it("returns canSubmit: true when all variations are APPROVED (pending query returns empty)", async () => {
    // The query already filters status: "PENDING" — approved rows never appear
    mockFindMany.mockResolvedValueOnce([]);

    const result = await checkScopeVariationGate("insp-004");

    expect(result.canSubmit).toBe(true);
    expect(result.pendingCount).toBe(0);
    expect(result.blockers).toEqual([]);

    // Confirm the query passed status: "PENDING" filter
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
      }),
    );
  });
});
