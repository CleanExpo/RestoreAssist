import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetServerSession = vi.fn();
const mockFindFirst = vi.fn();
const mockEstimateCosts = vi.fn();
const mockTransaction = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: (...a: unknown[]) => mockGetServerSession(...a),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/nir-cost-estimation", () => ({
  estimateCosts: (...a: unknown[]) => mockEstimateCosts(...a),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
    costEstimate: {
      findMany: vi.fn(),
    },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));

import { POST } from "../route";

describe("cost-estimates POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
  });

  it("rejects when no selected scope items", async () => {
    mockFindFirst.mockResolvedValue({
      id: "i1",
      status: "SCOPED",
      propertyPostcode: "4000",
      scopeItems: [],
    });
    const req = new NextRequest(
      "http://localhost:3001/api/inspections/i1/cost-estimates",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replace: true }),
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: "i1" }) });
    expect(res.status).toBe(400);
  });

  it("creates estimates from selected scope", async () => {
    mockFindFirst.mockResolvedValue({
      id: "i1",
      status: "SCOPED",
      propertyPostcode: "4000",
      scopeItems: [
        {
          id: "s1",
          itemType: "install_air_movers",
          description: "Air movers",
          quantity: 2,
          unit: "day",
          specification: null,
          justification: null,
        },
      ],
    });
    mockEstimateCosts.mockResolvedValue({
      items: [
        {
          category: "Equipment",
          description: "Air movers",
          quantity: 2,
          unit: "day",
          rate: 40,
          subtotal: 80,
          costDatabaseId: null,
          isEstimated: true,
        },
      ],
      contingency: 8,
      subtotal: 80,
      total: 88,
      pricingSource: "nrpg-midpoint",
      nrpgCompliant: true,
    });
    const saved = [
      {
        id: "ce1",
        category: "Equipment",
        description: "Air movers",
        quantity: 2,
        unit: "day",
        rate: 40,
        subtotal: 80,
        total: 88,
      },
    ];
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        costEstimate: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
          findMany: vi.fn().mockResolvedValue(saved),
        },
        inspection: { update: vi.fn() },
        auditLog: { create: vi.fn() },
      };
      return fn(tx);
    });

    const req = new NextRequest(
      "http://localhost:3001/api/inspections/i1/cost-estimates",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replace: true }),
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: "i1" }) });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.costEstimates).toHaveLength(1);
    expect(json.summary.total).toBe(88);
  });
});
